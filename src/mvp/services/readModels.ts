/**
 * MVP read models (Step 04): the Universal Order View (spec §8) and the Admin dashboard
 * (spec §9), computed from canonical records with the pure progress/health functions.
 * Role-filtered: money for admin/owner/customer only, audit for admin/owner only, and
 * cost never (it is not loaded here at all — I-5).
 */

import type {
  AuditEvent, Blocker, DocumentRecord, MvpStage, OrderStatus, PaymentMilestone, Project, PurchaseOrder, Task,
} from '../../domain/entities';
import { getRepository } from '../../repository';
import {
  blockerRepository, documentRepository, paymentMilestoneRepository, projectRepository, purchaseOrderRepository, taskRepository,
} from '../../repository/entities';
import { computeHealth, currentTask, hasOverdueMilestone, isOpenTask, type Health } from '../health';
import { computeProgress } from '../progress';
import { MVP_STAGES, toMvpStage, MVP_STAGE_LABELS } from '../stage';
import { leadStatus, type MvpLead } from '../leadModel';
import { leadRepository, listOrderTasks, listOpenBlockers, type MvpActor, type MvpCtx, nowOf, actorTokens } from './orderService';

export type OrderRecord = Project & { version?: number };

export function canSeeMoney(role: string): boolean {
  return role === 'admin' || role === 'owner' || role === 'customer';
}

export function canSeeAudit(role: string): boolean {
  return role === 'admin' || role === 'owner';
}

export function assigneeLabel(assigneeId: string, viewer: MvpActor, names: Record<string, string> = {}): string {
  if (actorTokens(viewer).includes(assigneeId) && !assigneeId.startsWith('role:')) return 'You';
  if (assigneeId === 'role:admin') return 'Admin';
  if (assigneeId.startsWith('role:')) return assigneeId.slice(5);
  if (assigneeId.startsWith('customer:')) return 'Customer';
  return names[assigneeId] ?? 'Assigned staff';
}

export interface PaymentSummary {
  paid: number;
  total: number;
  milestones: PaymentMilestone[];
}

export function summarizePayments(order: Pick<Project, 'sellingPrice'>, milestones: PaymentMilestone[]): PaymentSummary {
  const paid = milestones.reduce((s, m) => s + (m.status === 'PAID' ? m.amount : m.status === 'PARTIAL' ? m.amountReceived : 0), 0);
  const total = order.sellingPrice ?? milestones.filter(m => m.kind !== 'SURVEY_FEE').reduce((s, m) => s + m.amount, 0);
  return { paid, total, milestones: [...milestones].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) };
}

export interface OrderViewModel {
  order: OrderRecord;
  code: string;
  customerName: string;
  siteAddress: string;
  lift: string;
  stage: MvpStage;
  stageLabel: string;
  status: OrderStatus;
  progress: number;
  health: Health;
  currentTask?: Task;
  currentOwner: string;
  noNextAction: boolean;
  openTasks: Task[];
  closedTasks: Task[];
  blockers: Blocker[];
  payments?: PaymentSummary;
  timeline: { stage: MvpStage; label: string; state: 'done' | 'current' | 'pending' }[];
  evidence: DocumentRecord[];
  audit?: AuditEvent[];
  licencePending: boolean;
}

export async function buildOrderView(ctx: MvpCtx, viewer: MvpActor, orderId: string, names: Record<string, string> = {}): Promise<OrderViewModel | null> {
  const order = (await projectRepository(ctx).get(orderId)) as OrderRecord | null;
  if (!order) return null;
  const now = nowOf(ctx);
  const [tasks, blockers, milestones, evidence] = await Promise.all([
    listOrderTasks(ctx, orderId),
    listOpenBlockers(ctx, orderId),
    canSeeMoney(viewer.role) ? paymentMilestoneRepository(ctx).query({ orderId } as Partial<PaymentMilestone>) : Promise.resolve([]),
    documentRepository(ctx).query({ projectId: orderId } as Partial<DocumentRecord>),
  ]);
  const stage = toMvpStage(order.stage);
  const status = order.status ?? 'ACTIVE';
  const cur = currentTask(tasks, stage);
  const idx = MVP_STAGES.indexOf(stage);
  const audit = canSeeAudit(viewer.role)
    ? (await getRepository<AuditEvent>('audit_logs', ctx).query({ projectId: orderId } as Partial<AuditEvent>))
        .filter(e => e.action !== 'NOTIFICATION_SENT')
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    : undefined;
  return {
    order,
    code: order.displayCode ?? '—',
    customerName: order.displaySummary?.customerName ?? order.title,
    siteAddress: order.displaySummary?.siteAddress ?? '',
    lift: order.liftSummary ?? '',
    stage,
    stageLabel: MVP_STAGE_LABELS[stage],
    status,
    progress: computeProgress({ stage, checklistDone: order.checklistDone, qcPassed: !!order.qcPassedAt }),
    health: computeHealth({ status, stage, tasks, openBlockerCount: blockers.length, milestones, now }),
    currentTask: cur,
    currentOwner: cur ? assigneeLabel(cur.assigneeId, viewer, names) : '—',
    noNextAction: status === 'ACTIVE' && !cur,
    openTasks: tasks.filter(isOpenTask).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    closedTasks: tasks.filter(t => !isOpenTask(t)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    blockers,
    payments: canSeeMoney(viewer.role) ? summarizePayments(order, milestones) : undefined,
    timeline: MVP_STAGES.map((s, i) => ({
      stage: s, label: MVP_STAGE_LABELS[s],
      state: status === 'COMPLETED' && i <= idx ? 'done' : i < idx ? 'done' : i === idx ? 'current' : 'pending',
    })),
    evidence: evidence.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
    audit,
    licencePending: tasks.some(t => t.type === 'STATUTORY_LICENCE' && isOpenTask(t)) && status === 'COMPLETED',
  };
}

// ---------------------------------------------------------------------------
// Admin dashboard (spec §9)
// ---------------------------------------------------------------------------

export type AttentionBucket =
  | 'emergency' | 'overdue' | 'blocked' | 'payment_pending' | 'customer_waiting' | 'technician_waiting'
  | 'supplier_delay' | 'qc_failure' | 'no_next_action' | 'on_hold' | 'licence_pending';

export const ATTENTION_LABELS: Record<AttentionBucket, string> = {
  emergency: 'Emergency',
  overdue: 'Overdue',
  blocked: 'Blocked',
  payment_pending: 'Payment pending',
  customer_waiting: 'Waiting on customer',
  technician_waiting: 'Technician waiting',
  supplier_delay: 'Supplier delay',
  qc_failure: 'QC failure / rework',
  no_next_action: 'NO NEXT ACTION',
  on_hold: 'On hold',
  licence_pending: 'Licence pending',
};

export interface DashboardOrder {
  id: string;
  code: string;
  customerName: string;
  stage: MvpStage;
  status: OrderStatus;
  health: Health;
  progress: number;
  currentTask?: Task;
  buckets: AttentionBucket[];
}

export type PipelineColumn = 'LEAD' | 'QUALIFIED' | 'SURVEY' | 'QUOTE' | 'BOOKED' | 'SITE_READY' | 'DELIVERY' | 'INSTALLATION' | 'QC' | 'HANDOVER' | 'AMC';
export const PIPELINE_COLUMNS: PipelineColumn[] = ['LEAD', 'QUALIFIED', 'SURVEY', 'QUOTE', 'BOOKED', 'SITE_READY', 'DELIVERY', 'INSTALLATION', 'QC', 'HANDOVER', 'AMC'];

export interface Dashboard {
  today: { key: string; label: string; count: number; orderIds: string[] }[];
  attention: { bucket: AttentionBucket; label: string; orders: DashboardOrder[] }[];
  pipeline: Record<PipelineColumn, number>;
  orders: DashboardOrder[];
}

function sameDay(iso: string | undefined, now: Date): boolean {
  if (!iso) return false;
  const fmt = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  return fmt(new Date(iso)) === fmt(now);
}

function endOfToday(now: Date): number {
  return now.getTime() + 24 * 60 * 60 * 1000;
}

export function bucketsFor(
  order: OrderRecord, tasks: Task[], blockers: Blocker[], milestones: PaymentMilestone[], pos: PurchaseOrder[], now: Date,
): { health: Health; buckets: AttentionBucket[]; current?: Task } {
  const stage = toMvpStage(order.stage);
  const status = order.status ?? 'ACTIVE';
  const open = tasks.filter(isOpenTask);
  const cur = currentTask(tasks, stage);
  const health = computeHealth({ status, stage, tasks, openBlockerCount: blockers.length, milestones, now });
  const b: AttentionBucket[] = [];
  const past = (iso: string) => new Date(iso).getTime() < now.getTime();
  if (open.some(t => t.type === 'EMERGENCY_RESPONSE')) b.push('emergency');
  if (status === 'ACTIVE' && !cur) b.push('no_next_action');
  if (health === 'OVERDUE' && cur) b.push('overdue');
  if (blockers.length) b.push('blocked');
  if (blockers.some(x => open.some(t => t.id === x.taskId && t.assigneeRole === 'technician')) || open.some(t => t.status === 'BLOCKED' && t.assigneeRole === 'technician')) b.push('technician_waiting');
  if (hasOverdueMilestone(milestones, now)) b.push('payment_pending');
  if (status === 'ACTIVE' && cur && cur.assigneeId.startsWith('customer:') && past(cur.dueDate)) b.push('customer_waiting');
  if (pos.some(p => p.materialStatus === 'DELAYED') || open.some(t => t.type === 'TRACK_DELIVERY' && past(t.dueDate))) b.push('supplier_delay');
  if (open.some(t => t.type === 'REWORK') || (status === 'ON_HOLD' && stage === 'QC_HANDOVER')) b.push('qc_failure');
  if (status === 'ON_HOLD') b.push('on_hold');
  if (status === 'COMPLETED' && open.some(t => t.type === 'STATUTORY_LICENCE')) b.push('licence_pending');
  return { health, buckets: b, current: cur };
}

export async function buildDashboard(ctx: MvpCtx): Promise<Dashboard> {
  const now = nowOf(ctx);
  const [projects, tasks, blockers, milestones, pos, leads] = await Promise.all([
    projectRepository(ctx).list() as Promise<OrderRecord[]>,
    taskRepository(ctx).list(),
    blockerRepository(ctx).query({ status: 'OPEN' } as Partial<Blocker>),
    paymentMilestoneRepository(ctx).list(),
    purchaseOrderRepository(ctx).list(),
    leadRepository(ctx).list() as Promise<MvpLead[]>,
  ]);
  const by = <T extends { [k: string]: any }>(list: T[], key: string) => {
    const m: Record<string, T[]> = {};
    for (const x of list) if (x[key]) (m[x[key]] ??= []).push(x);
    return m;
  };
  const tasksBy = by(tasks, 'orderId');
  const blockersBy = by(blockers, 'orderId');
  const msBy = by(milestones, 'orderId');
  const posBy = by(pos, 'projectId');

  const mvpOrders = projects.filter(p => !!p.displayCode || !!p.status);
  const orders: DashboardOrder[] = mvpOrders.map(p => {
    const { health, buckets, current } = bucketsFor(p, tasksBy[p.id] ?? [], blockersBy[p.id] ?? [], msBy[p.id] ?? [], posBy[p.id] ?? [], now);
    return {
      id: p.id, code: p.displayCode ?? '—', customerName: p.displaySummary?.customerName ?? p.title,
      stage: toMvpStage(p.stage), status: p.status ?? 'ACTIVE', health,
      progress: computeProgress({ stage: toMvpStage(p.stage), checklistDone: p.checklistDone, qcPassed: !!p.qcPassedAt }),
      currentTask: current, buckets,
    };
  });

  const attentionOrder: AttentionBucket[] = ['emergency', 'no_next_action', 'overdue', 'blocked', 'technician_waiting', 'payment_pending', 'customer_waiting', 'supplier_delay', 'qc_failure', 'on_hold', 'licence_pending'];
  const attention = attentionOrder
    .map(bucket => ({ bucket, label: ATTENTION_LABELS[bucket], orders: orders.filter(o => o.buckets.includes(bucket)) }))
    .filter(g => g.orders.length > 0);

  const openTasks = tasks.filter(isOpenTask);
  const dueToday = (types: string[]) => openTasks.filter(t => types.includes(t.type) && new Date(t.dueDate).getTime() <= endOfToday(now));
  const ids = (list: Task[]) => [...new Set(list.map(t => t.orderId).filter(Boolean) as string[])];
  const newLeads = leads.filter(l => sameDay(l.createdAt, now));
  const dueMilestones = milestones.filter(m => m.dueDate && !m.waived && m.status !== 'PAID' && m.status !== 'REFUNDED' && new Date(m.dueDate).getTime() <= endOfToday(now));
  const today = [
    { key: 'leads', label: 'New leads', count: newLeads.length, orderIds: [] },
    { key: 'surveys', label: 'Surveys', list: dueToday(['SURVEY', 'ASSIGN_SURVEYOR']) },
    { key: 'quotes', label: 'Quotes', list: dueToday(['PREPARE_QUOTE', 'APPROVE_MARGIN', 'QUOTE_DECISION']) },
    { key: 'bookings', label: 'Bookings', list: dueToday(['COLLECT_BOOKING_TOKEN']) },
    { key: 'deliveries', label: 'Deliveries', list: dueToday(['TRACK_DELIVERY', 'RAISE_PO', 'VERIFY_SITE_READY']) },
    { key: 'installations', label: 'Installations', list: openTasks.filter(t => t.type === 'INSTALLATION' || t.type === 'REWORK') },
    { key: 'qc', label: 'QC', list: dueToday(['QC_INSPECTION']) },
    { key: 'payments', label: 'Payments due', count: dueMilestones.length, orderIds: [...new Set(dueMilestones.map(m => m.orderId))] },
    { key: 'amc', label: 'AMC due', list: dueToday(['AMC_FOLLOW_UP']) },
  ].map(x => ('list' in x && x.list) ? { key: x.key, label: x.label, count: ids(x.list).length, orderIds: ids(x.list) } : x as any);

  const pipeline = Object.fromEntries(PIPELINE_COLUMNS.map(c => [c, 0])) as Record<PipelineColumn, number>;
  pipeline.LEAD = leads.filter(l => !l.projectId && !['LOST', 'WON'].includes(leadStatus(l))).length;
  for (const o of orders) {
    if (o.status === 'CANCELLED') continue;
    const s = o.stage;
    if (s === 'QC_HANDOVER') pipeline[mvpOrders.find(p => p.id === o.id)?.qcPassedAt ? 'HANDOVER' : 'QC']++;
    else if (s !== 'LEAD') pipeline[s as PipelineColumn]++;
  }
  return { today, attention, pipeline, orders };
}

/** Orders this viewer may see, using only queries firestore.rules can prove (R-6). */
export async function listOrdersFor(ctx: MvpCtx, viewer: MvpActor): Promise<OrderRecord[]> {
  const repo = projectRepository(ctx);
  let list: OrderRecord[];
  if (viewer.role === 'admin' || viewer.role === 'owner') {
    list = (await repo.list()) as OrderRecord[];
  } else if (viewer.role === 'customer') {
    list = viewer.customerId ? ((await repo.queryContains('participantIds', `customer:${viewer.customerId}`)) as OrderRecord[]) : [];
  } else {
    const [owned, part] = await Promise.all([
      viewer.role === 'sales' ? repo.query({ ownerUserId: viewer.userId } as Partial<OrderRecord>) : Promise.resolve([]),
      repo.queryContains('participantIds', viewer.userId),
    ]);
    const m = new Map<string, OrderRecord>();
    for (const o of [...owned, ...part] as OrderRecord[]) m.set(o.id, o);
    list = [...m.values()];
  }
  return list.filter(p => !!p.displayCode || !!p.status).sort((a, b) => (b.displayCode ?? '').localeCompare(a.displayCode ?? ''));
}
