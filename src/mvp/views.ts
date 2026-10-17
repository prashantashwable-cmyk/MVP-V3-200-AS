/**
 * Read models for the MVP screens: the spec §8 order summary, role-scoped
 * order lists, the Admin dashboard (spec §9) and reports (spec §28).
 * Every list is a query the Firestore rules can prove (plan §3), so a
 * non-admin never asks for records they may not read.
 */
import type { RepositoryContext } from '../repository/types';
import { computeHealth, isMilestoneOverdue, isOpenTask, pickCurrentTask } from './health';
import { computeProgress } from './progress';
import { mvpRepos, type Order } from './repo';
import { mvpStageOf, orderStatusOf } from './service/core';
import { effectiveAmcStatus } from './service/field';
import { STAGE_LABELS } from './stage';
import type {
  Health, MvpActor, MvpAmc, MvpBlocker, MvpChecklist, MvpComplianceDoc, MvpHandover, MvpLead, MvpMilestone, MvpPurchaseOrder,
  MvpQcRecord, MvpQuote, MvpQuoteCost, MvpServiceCase, MvpStage, MvpSurvey, MvpTask, OrderStatus,
} from './types';
import { MVP_STAGES } from './types';

export interface OrderBundle {
  order: Order;
  customer: { id: string; name: string; phone: string } | null;
  site: { address: string } | null;
  tasks: MvpTask[];
  blockers: MvpBlocker[];
  milestones: MvpMilestone[];
  quotes: MvpQuote[];
  quoteCosts: MvpQuoteCost[];
  surveys: MvpSurvey[];
  checklist: MvpChecklist | null;
  qcRecords: MvpQcRecord[];
  handover: MvpHandover | null;
  amc: MvpAmc | null;
  compliance: MvpComplianceDoc[];
  serviceCases: MvpServiceCase[];
  purchaseOrders: MvpPurchaseOrder[];
}

export interface OrderSummary {
  id: string;
  displayCode: string;
  customerName: string;
  siteAddress: string;
  lift: string;
  stage: MvpStage;
  stageLabel: string;
  status: OrderStatus;
  progress: number;
  currentTask: MvpTask | null;
  nextAction: string;
  ownerId: string | null;
  dueDate: string | null;
  openBlocker: MvpBlocker | null;
  paid: number;
  total: number;
  health: Health;
  noNextAction: boolean;
  licencePending: boolean;
  openEmergency: MvpServiceCase | null;
}

const isStaffReader = (a: MvpActor) => a.role === 'admin' || a.role === 'owner';
const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

export async function loadOrderBundle(ctx: RepositoryContext, actor: MvpActor, orderId: string): Promise<OrderBundle | null> {
  const r = mvpRepos(ctx);
  const order = await r.orders.get(orderId);
  if (!order) return null;
  const by = { orderId } as any;
  const [customer, site, tasks, blockers, milestones, quotes, surveys, checklist, qcRecords, handover, amc, compliance, serviceCases] = await Promise.all([
    safe(r.customers.get(order.customerId), null),
    safe(r.sites.get(order.siteId), null),
    safe(r.tasks.query(by), []),
    safe(r.blockers.query(by), []),
    safe(r.milestones.query(by), []),
    safe(r.quotes.query(by), []),
    safe(r.surveys.query(by), []),
    safe(r.checklists.get(orderId), null),
    safe(r.qcRecords.query(by), []),
    safe(r.handovers.get(orderId), null),
    safe(r.amcs.get(orderId), null),
    safe(r.compliance.query(by), []),
    safe(r.serviceCases.query(by), []),
  ]);
  // Cost and POs are Admin/Owner-only (I-5); never even requested for other roles.
  const quoteCosts = isStaffReader(actor) ? await safe(r.quoteCosts.query(by), []) : [];
  const purchaseOrders = actor.role === 'admin' ? await safe(r.purchaseOrders.query(by), []) : [];
  return {
    order,
    customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone } : null,
    site: site ? { address: site.address } : null,
    tasks, blockers, milestones, quotes, quoteCosts, surveys, checklist, qcRecords, handover, amc, compliance, serviceCases,
    purchaseOrders: purchaseOrders as MvpPurchaseOrder[],
  };
}

export function summarize(b: OrderBundle, now: Date): OrderSummary {
  const stage = mvpStageOf(b.order);
  const status = orderStatusOf(b.order);
  const currentTask = status === 'CANCELLED' ? null : pickCurrentTask(b.tasks, stage);
  const openBlocker = b.blockers.find(x => x.status === 'OPEN') ?? null;
  const qcPassed = b.qcRecords.some(q => q.decision === 'PASS');
  const done = b.checklist?.items.filter(i => i.done).length ?? 0;
  const lift = b.order.lift;
  const relevant = b.milestones.filter(m => m.kind !== 'SURVEY_FEE' && m.status !== 'REFUNDED');
  const total = relevant.reduce((s, m) => s + m.amount, 0);
  const paid = relevant.reduce((s, m) => s + m.amountPaid, 0);
  const noNextAction = status === 'ACTIVE' && !currentTask;
  return {
    id: b.order.id,
    displayCode: b.order.displayCode ?? b.order.id,
    customerName: b.customer?.name ?? b.order.displaySummary?.customerName ?? '—',
    siteAddress: b.site?.address ?? b.order.displaySummary?.siteAddress ?? '—',
    lift: [lift?.floors ? `G+${Math.max(0, (lift.floors ?? 1) - 1)}` : '', lift?.type ?? '', lift?.stops ? `${lift.stops} stops` : '', lift?.capacity ?? '']
      .filter(Boolean).join(' · ') || '—',
    stage,
    stageLabel: STAGE_LABELS[stage],
    status,
    progress: computeProgress({ stage, checklistDone: done, qcPassed }),
    currentTask,
    nextAction: currentTask?.title ?? (status === 'ACTIVE' ? 'NO NEXT ACTION' : status === 'COMPLETED' ? 'Completed' : status),
    ownerId: currentTask?.assigneeId ?? null,
    dueDate: currentTask?.dueDate ?? null,
    openBlocker,
    paid,
    total,
    health: computeHealth({ status, hasOpenBlocker: !!openBlocker, currentTask, milestones: b.milestones, now }),
    noNextAction,
    licencePending: status === 'COMPLETED' && b.tasks.some(t => t.type === 'STATUTORY_LICENCE' && isOpenTask(t)),
    openEmergency: b.serviceCases.find(s => s.kind === 'EMERGENCY' && s.status !== 'RESOLVED') ?? null,
  };
}

/** Orders this actor may read, as rule-provable queries. */
export async function listOrdersFor(ctx: RepositoryContext, actor: MvpActor): Promise<Order[]> {
  const r = mvpRepos(ctx);
  if (isStaffReader(actor)) return r.orders.list();
  if (actor.role === 'customer') {
    return actor.customerId ? r.orders.queryWhere([['customerId', '==', actor.customerId]]) : [];
  }
  const [mine, pool] = await Promise.all([
    r.orders.queryWhere([['participantIds', 'array-contains', actor.id]]),
    r.orders.queryWhere([['participantIds', 'array-contains', `role:${actor.role}`]]).catch(() => []),
  ]);
  const byId = new Map<string, Order>();
  for (const o of [...mine, ...pool]) byId.set(o.id, o);
  return Array.from(byId.values());
}

export async function loadSummaries(ctx: RepositoryContext, actor: MvpActor, now: Date): Promise<{ summary: OrderSummary; bundle: OrderBundle }[]> {
  const orders = (await listOrdersFor(ctx, actor)).filter(o => !!o.displayCode);
  const bundles = await Promise.all(orders.map(o => loadOrderBundle(ctx, actor, o.id)));
  return bundles.filter((b): b is OrderBundle => !!b).map(bundle => ({ bundle, summary: summarize(bundle, now) }));
}

/** Tasks assigned to this actor (or their pool, or their customer record). */
export async function myTasks(ctx: RepositoryContext, actor: MvpActor): Promise<MvpTask[]> {
  const r = mvpRepos(ctx);
  const ids = actor.role === 'customer' ? (actor.customerId ? [`customer:${actor.customerId}`] : []) : [actor.id, `role:${actor.role}`];
  const lists = await Promise.all(ids.map(id => r.tasks.queryWhere([['assigneeId', '==', id]]).catch(() => [])));
  return lists.flat().filter(isOpenTask).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
}

export async function listLeadsFor(ctx: RepositoryContext, actor: MvpActor): Promise<MvpLead[]> {
  const r = mvpRepos(ctx);
  const leads = isStaffReader(actor) ? await r.leads.list() : await r.leads.queryWhere([['salesOwnerId', '==', actor.id]]);
  return leads.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// ---------------------------------------------------------------- Dashboard (spec §9)

export type AttentionBucket =
  | 'EMERGENCY' | 'OVERDUE' | 'BLOCKED' | 'PAYMENT_PENDING' | 'CUSTOMER_WAITING' | 'TECHNICIAN_WAITING'
  | 'SUPPLIER_DELAY' | 'QC_FAILURE' | 'NO_NEXT_ACTION' | 'LICENCE_PENDING' | 'ON_HOLD';

export const BUCKET_LABELS: Record<AttentionBucket, string> = {
  EMERGENCY: 'Emergency', OVERDUE: 'Overdue', BLOCKED: 'Blocked', PAYMENT_PENDING: 'Payment pending',
  CUSTOMER_WAITING: 'Customer waiting', TECHNICIAN_WAITING: 'Technician waiting', SUPPLIER_DELAY: 'Supplier delay',
  QC_FAILURE: 'QC failure', NO_NEXT_ACTION: 'No next action', LICENCE_PENDING: 'Licence pending', ON_HOLD: 'On hold',
};

export function attentionBuckets(s: OrderSummary, b: OrderBundle, now: Date): AttentionBucket[] {
  const out: AttentionBucket[] = [];
  if (s.openEmergency) out.push('EMERGENCY');
  if (s.status === 'ON_HOLD') out.push('ON_HOLD');
  if (s.health === 'OVERDUE' && !s.noNextAction) out.push('OVERDUE');
  if (s.noNextAction) out.push('NO_NEXT_ACTION');
  if (s.openBlocker) out.push('BLOCKED');
  if (b.milestones.some(m => isMilestoneOverdue(m, now))) out.push('PAYMENT_PENDING');
  const ct = s.currentTask;
  if (ct && ct.assigneeRole === 'customer' && new Date(ct.dueDate).getTime() < now.getTime()) out.push('CUSTOMER_WAITING');
  if (b.blockers.some(x => x.status === 'OPEN' && x.ownerUserId.startsWith('customer:'))) out.push('CUSTOMER_WAITING');
  if (b.blockers.some(x => x.status === 'OPEN' && x.createdByRole === 'technician')) out.push('TECHNICIAN_WAITING');
  if (b.blockers.some(x => x.status === 'OPEN' && x.reason === 'SUPPLIER_DELAY')
    || b.purchaseOrders.some(p => p.materialStatus !== 'RECEIVED' && (p.materialStatus === 'DELAYED' || new Date(p.expectedDeliveryDate).getTime() < now.getTime()))) {
    out.push('SUPPLIER_DELAY');
  }
  const lastQc = [...b.qcRecords].sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))[0];
  if (lastQc && lastQc.decision !== 'PASS' && (s.status === 'ON_HOLD' || b.tasks.some(t => t.type === 'REWORK' && isOpenTask(t)))) out.push('QC_FAILURE');
  if (s.licencePending) out.push('LICENCE_PENDING');
  return Array.from(new Set(out));
}

export interface Dashboard {
  today: Record<string, number>;
  attention: { bucket: AttentionBucket; orders: OrderSummary[] }[];
  pipeline: { column: string; count: number }[];
  rows: OrderSummary[];
}

const isToday = (iso: string | undefined, now: Date) => !!iso && new Date(iso).toDateString() === now.toDateString();

export async function buildDashboard(ctx: RepositoryContext, actor: MvpActor, now: Date): Promise<Dashboard> {
  const [items, leads] = await Promise.all([loadSummaries(ctx, actor, now), listLeadsFor(ctx, actor)]);
  const openTasks = items.flatMap(i => i.bundle.tasks.filter(isOpenTask));
  const dueToday = (types: MvpTask['type'][]) => openTasks.filter(t => types.includes(t.type) && new Date(t.dueDate).getTime() <= now.getTime() + 24 * 3600e3).length;
  const today = {
    'New leads': leads.filter(l => isToday(l.createdAt, now)).length,
    Surveys: dueToday(['SURVEY']),
    Quotes: dueToday(['PREPARE_QUOTE', 'APPROVE_MARGIN', 'QUOTE_DECISION']),
    Bookings: dueToday(['COLLECT_BOOKING_TOKEN']),
    Deliveries: dueToday(['TRACK_DELIVERY']),
    Installations: dueToday(['INSTALLATION', 'REWORK']),
    QC: dueToday(['QC_INSPECTION']),
    'Payments due': items.flatMap(i => i.bundle.milestones).filter(m => m.dueDate && m.status !== 'PAID' && m.status !== 'WAIVED' && new Date(m.dueDate).getTime() <= now.getTime() + 24 * 3600e3).length,
    'AMC due': items.filter(i => i.bundle.amc && effectiveAmcStatus(i.bundle.amc, now) === 'AMC_DUE').length,
  };
  const order: AttentionBucket[] = ['EMERGENCY', 'OVERDUE', 'BLOCKED', 'PAYMENT_PENDING', 'CUSTOMER_WAITING', 'TECHNICIAN_WAITING', 'SUPPLIER_DELAY', 'QC_FAILURE', 'NO_NEXT_ACTION', 'LICENCE_PENDING', 'ON_HOLD'];
  const attention = order.map(bucket => ({
    bucket,
    orders: items.filter(i => i.summary.status !== 'CANCELLED' && attentionBuckets(i.summary, i.bundle, now).includes(bucket)).map(i => i.summary),
  })).filter(a => a.orders.length > 0);
  const active = items.filter(i => i.summary.status === 'ACTIVE' || i.summary.status === 'ON_HOLD');
  const count = (stage: MvpStage) => active.filter(i => i.summary.stage === stage).length;
  const qcActive = active.filter(i => i.summary.stage === 'QC_HANDOVER');
  const pipeline = [
    { column: 'Lead', count: leads.filter(l => !l.orderId && l.mvpStatus !== 'LOST').length },
    ...MVP_STAGES.filter(s => s !== 'LEAD' && s !== 'QC_HANDOVER' && s !== 'AMC').map(s => ({ column: STAGE_LABELS[s], count: count(s) })),
    { column: 'QC', count: qcActive.filter(i => !i.bundle.qcRecords.some(q => q.decision === 'PASS')).length },
    { column: 'Handover', count: qcActive.filter(i => i.bundle.qcRecords.some(q => q.decision === 'PASS')).length },
    { column: 'AMC', count: items.filter(i => i.summary.stage === 'AMC').length },
  ];
  return { today, attention, pipeline, rows: items.map(i => i.summary) };
}

// ---------------------------------------------------------------- Reports (spec §28) and Owner view (spec §27)

export async function buildReports(ctx: RepositoryContext, actor: MvpActor, now: Date) {
  const [items, leads] = await Promise.all([loadSummaries(ctx, actor, now), listLeadsFor(ctx, actor)]);
  const bundles = items.map(i => i.bundle);
  const sumBy = (f: (m: MvpMilestone) => number) => bundles.flatMap(b => b.milestones).filter(m => m.kind !== 'SURVEY_FEE').reduce((s, m) => s + f(m), 0);
  const accepted = bundles.map(b => b.quotes.find(q => q.status === 'ACCEPTED')).filter(Boolean) as MvpQuote[];
  const booked = accepted.reduce((s, q) => s + q.sellingPrice, 0);
  const costs = bundles.flatMap(b => b.quoteCosts);
  const marginInr = accepted.reduce((s, q) => {
    const c = costs.find(x => x.quoteId === q.id);
    return s + (c ? q.totalExclTax - c.estimatedCost : 0);
  }, 0);
  const installDurations = bundles.map(b => {
    const t = b.tasks.find(x => x.type === 'INSTALLATION' && x.status === 'COMPLETED' && x.startedAt && x.completedAt);
    return t ? (new Date(t.completedAt!).getTime() - new Date(t.startedAt!).getTime()) / 86400e3 : null;
  }).filter((d): d is number => d !== null);
  const qc = bundles.flatMap(b => b.qcRecords);
  const openTasks = bundles.flatMap(b => b.tasks.filter(isOpenTask));
  return {
    sales: {
      leads: leads.length,
      qualified: leads.filter(l => !!l.orderId).length,
      quotes: bundles.filter(b => b.quotes.some(q => q.status !== 'DRAFT')).length,
      orders: accepted.length,
      conversionPct: leads.length ? Math.round((accepted.length / leads.length) * 100) : 0,
    },
    operations: {
      activeOrders: items.filter(i => i.summary.status === 'ACTIVE').length,
      overdueTasks: openTasks.filter(t => new Date(t.dueDate).getTime() < now.getTime()).length,
      blockedTasks: openTasks.filter(t => t.status === 'BLOCKED').length,
      avgInstallDays: installDurations.length ? Math.round((installDurations.reduce((a, b) => a + b, 0) / installDurations.length) * 10) / 10 : null,
      activeInstallations: items.filter(i => i.summary.stage === 'INSTALLATION' && i.summary.status === 'ACTIVE').length,
      completedLifts: items.filter(i => i.summary.status === 'COMPLETED').length,
    },
    money: {
      booked,
      collected: sumBy(m => m.amountPaid),
      outstanding: sumBy(m => (m.status === 'PAID' || m.status === 'WAIVED' || m.status === 'REFUNDED' ? 0 : m.amount - m.amountPaid)),
      estimatedMarginInr: isStaffReader(actor) ? marginInr : null,
    },
    quality: {
      qcPass: qc.filter(q => q.decision === 'PASS').length,
      rework: qc.filter(q => q.decision === 'REWORK').length,
      fail: qc.filter(q => q.decision === 'FAIL').length,
      complaints: bundles.reduce((s, b) => s + (b.amc?.complaints.length ?? 0) + b.serviceCases.length, 0),
    },
    amc: bundles.filter(b => b.amc).map(b => ({ code: b.order.displayCode, status: effectiveAmcStatus(b.amc!, now) })),
  };
}
