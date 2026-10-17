/**
 * Order service core: the shared machinery every MVP command uses.
 * authz → load → rules (D-08) → canonical writes → AuditEvent (I-3) →
 * in-app notifications. No other code changes an order's stage, status
 * or tasks.
 */
import { recordAuditEvent, newCorrelationId } from '../../lib/audit';
import { evaluatePermission } from '../../lib/authz';
import type { Permission } from '../../domain/permissions';
import type { RepositoryContext } from '../../repository/types';
import { MVP_CONFIG } from '../config';
import { isOpenTask } from '../health';
import { mvpRepos, newId, type MvpRepos, type Order } from '../repo';
import { planTaskCreation, rulesFor, TASK_TITLES, type MvpEvent, type TaskSpec } from '../rules';
import { fromMvpStage, isForwardMove, toMvpStage } from '../stage';
import type { MvpActor, MvpRole, MvpSettings, MvpStage, MvpTask, OrderStatus } from '../types';

export interface ServiceCtx {
  repo: RepositoryContext;
  actor: MvpActor;
  /** Injectable clock, so the checks can move time (ACCEPTANCE S2, S5, S9). */
  now?: () => Date;
}

export class MvpError extends Error {
  constructor(public code: 'forbidden' | 'gate' | 'invalid' | 'not_found' | 'conflict', message: string) {
    super(message);
  }
}

export const nowOf = (ctx: ServiceCtx) => (ctx.now ? ctx.now() : new Date());
export const repos = (ctx: ServiceCtx): MvpRepos => mvpRepos(ctx.repo);
export const ADMIN_POOL = 'role:admin';
export const customerPool = (customerId: string) => `customer:${customerId}`;

export function requirePermission(ctx: ServiceCtx, permission: Permission): void {
  const r = evaluatePermission(
    { role: ctx.actor.role as any, isDemo: ctx.actor.isDemo, authMethod: ctx.actor.authMethod as any },
    permission,
  );
  if (!r.allowed) throw new MvpError('forbidden', r.reason);
}

export function requireRole(ctx: ServiceCtx, roles: MvpRole[], what: string): void {
  if (!roles.includes(ctx.actor.role)) {
    throw new MvpError('forbidden', `Only ${roles.join(' or ')} can ${what}.`);
  }
}

export const isAdmin = (ctx: ServiceCtx) => ctx.actor.role === 'admin';

/** True when the actor is the task's assignee, in its pool, or the order's customer for a customer task. */
export function actorOwnsTask(ctx: ServiceCtx, task: MvpTask): boolean {
  const a = ctx.actor;
  if (a.role === 'admin') return true;
  if (task.assigneeId === a.id) return true;
  if (task.assigneeId === `role:${a.role}`) return true;
  if (a.role === 'customer' && a.customerId && task.assigneeId === customerPool(a.customerId)) return true;
  return false;
}

export function requireTaskOwner(ctx: ServiceCtx, task: MvpTask): void {
  if (!actorOwnsTask(ctx, task)) throw new MvpError('forbidden', 'This task is assigned to someone else.');
}

export async function audit(
  ctx: ServiceCtx,
  action: string,
  entityType: string,
  entityId: string,
  orderId: string | undefined,
  before: unknown,
  after: unknown,
  reason?: string,
): Promise<void> {
  await recordAuditEvent(ctx.repo, {
    actorId: ctx.actor.id,
    actorRole: ctx.actor.role as any,
    action,
    entityType,
    entityId,
    projectId: orderId || undefined,
    before,
    after,
    reason,
    source: 'ui',
    correlationId: newCorrelationId(),
  });
}

/**
 * Read a record that may not exist yet. Firestore rules deny a non-admin's
 * read of a missing order-scoped record (there is no `resource` to check),
 * so a permission error here means "not there for you" and returns null.
 */
export async function tryGet<T>(p: Promise<T | null>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    if (String((err as any)?.code ?? err).includes('permission-denied')) return null;
    throw err;
  }
}

export async function loadOrder(ctx: ServiceCtx, orderId: string): Promise<Order> {
  const order = await repos(ctx).orders.get(orderId);
  if (!order) throw new MvpError('not_found', `Order ${orderId} not found.`);
  return order;
}

export async function loadTask(ctx: ServiceCtx, taskId: string): Promise<MvpTask> {
  const t = await repos(ctx).tasks.get(taskId);
  if (!t) throw new MvpError('not_found', `Task ${taskId} not found.`);
  return t;
}

export async function orderTasks(ctx: ServiceCtx, orderId: string): Promise<MvpTask[]> {
  return repos(ctx).tasks.query({ orderId } as Partial<MvpTask>);
}

export async function loadSettings(ctx: ServiceCtx): Promise<MvpSettings> {
  return (await repos(ctx).settings.get('global')) ?? { id: 'global' };
}

export const orderStatusOf = (o: Order): OrderStatus => (o.status ?? 'ACTIVE');
export const mvpStageOf = (o: Order): MvpStage => toMvpStage(o.stage);

export function istDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: MVP_CONFIG.TIME_ZONE });
}

/** Turns a rule's assignee kind into a concrete assignee id and role. */
export function resolveAssignee(
  kind: TaskSpec['assignee'],
  order: Pick<Order, 'customerId' | 'salesUserId'> | null,
  settings: MvpSettings,
  now: Date,
  lead?: { salesOwnerId: string; customerId?: string },
): { assigneeId: string; assigneeRole: MvpRole } {
  if (typeof kind === 'object') return { assigneeId: kind.userId, assigneeRole: kind.role };
  switch (kind) {
    case 'admin': return { assigneeId: ADMIN_POOL, assigneeRole: 'admin' };
    case 'customer': return { assigneeId: customerPool(order?.customerId ?? lead?.customerId ?? 'unknown'), assigneeRole: 'customer' };
    case 'sales': return { assigneeId: order?.salesUserId ?? lead?.salesOwnerId ?? ADMIN_POOL, assigneeRole: 'sales' };
    case 'qc':
    case 'surveyor':
    case 'technician': {
      const def = settings.defaultAssignees?.[kind];
      return { assigneeId: def ?? `role:${kind}`, assigneeRole: kind };
    }
    case 'oncall': {
      const oc = settings.onCall;
      if (oc && oc.technicianId && oc.date === istDate(now)) return { assigneeId: oc.technicianId, assigneeRole: 'technician' };
      return { assigneeId: ADMIN_POOL, assigneeRole: 'admin' };
    }
  }
}

/** Readers of an order besides admin/owner and its own customer (rules use this list). */
export function computeParticipants(order: Order, tasks: MvpTask[]): string[] {
  const ids = new Set<string>();
  if (order.salesUserId) ids.add(order.salesUserId);
  for (const t of tasks) {
    if (!isOpenTask(t)) continue;
    if (t.assigneeId === ADMIN_POOL || t.assigneeId.startsWith('customer:')) continue;
    ids.add(t.assigneeId);
  }
  return Array.from(ids).sort();
}

export async function notify(
  ctx: ServiceCtx,
  audienceUserId: string,
  templateId: string,
  title: string,
  body: string,
  orderId: string | undefined,
  dedupeKey: string,
): Promise<void> {
  const r = repos(ctx).notifications;
  const id = `ntf_${templateId}_${dedupeKey}_${audienceUserId}`.replace(/[^A-Za-z0-9_:-]/g, '_');
  // Best effort: a notification must never fail the business action it reports.
  try {
    if (await r.get(id).catch(() => null)) return;
    await r.create({
      id, projectId: orderId, audienceUserId, channel: 'in_app', templateId, status: 'delivered',
      idempotencyKey: id, title, body, read: false, createdAt: nowOf(ctx).toISOString(),
    });
  } catch (err) {
    console.warn('MVP notification not stored:', err);
  }
}

const TEMPLATE_FOR_TASK: Partial<Record<MvpTask['type'], [string, string]>> = {
  SURVEY: ['survey_scheduled', 'Survey scheduled'],
  QUOTE_DECISION: ['quote_ready', 'Your quote is ready'],
  COLLECT_BOOKING_TOKEN: ['payment_due', 'Booking token due'],
  COLLECT_DELIVERY_PAYMENT: ['payment_due', 'Delivery payment due'],
  COLLECT_FINAL_PAYMENT: ['payment_due', 'Final payment due'],
  INSTALLATION: ['installation_scheduled', 'Installation scheduled'],
  QC_INSPECTION: ['qc_required', 'QC required'],
  HANDOVER: ['handover_ready', 'Handover ready'],
  AMC_FOLLOW_UP: ['amc_reminder', 'AMC reminder'],
};

async function notifyTaskCreated(ctx: ServiceCtx, task: MvpTask, label: string): Promise<void> {
  const [template, title] = TEMPLATE_FOR_TASK[task.type] ?? ['task_assigned', 'New task assigned'];
  await notify(ctx, task.assigneeId, template, title, `${label}: ${task.title}`, task.orderId || undefined, task.id);
  // Customers also hear about the milestones that matter to them.
  if (template === 'handover_ready' || template === 'installation_scheduled' || template === 'survey_scheduled') {
    if (task.customerId) await notify(ctx, customerPool(task.customerId), template, title, `${label}: ${task.title}`, task.orderId, task.id);
  }
}

export async function createTaskFromSpec(
  ctx: ServiceCtx,
  base: { orderId: string; customerId: string; leadId?: string; label: string },
  spec: TaskSpec,
  stage: MvpStage,
  assignee: { assigneeId: string; assigneeRole: MvpRole },
  titleOverride?: string,
): Promise<MvpTask> {
  const now = nowOf(ctx).toISOString();
  const task: MvpTask = {
    id: newId('task'),
    orderId: base.orderId,
    customerId: base.customerId,
    leadId: base.leadId,
    type: spec.type,
    title: titleOverride ?? TASK_TITLES[spec.type],
    stage: spec.stage ?? stage,
    assigneeId: assignee.assigneeId,
    assigneeRole: assignee.assigneeRole,
    status: 'TODO',
    priority: spec.priority,
    dueDate: spec.dueDate,
    evidence: [],
    createdBy: ctx.actor.id,
    createdAt: now,
    updatedAt: now,
    version: 0,
  };
  await repos(ctx).tasks.create(task);
  await audit(ctx, 'TASK_CREATED', 'Task', task.id, base.orderId, undefined, {
    type: task.type, assigneeId: task.assigneeId, dueDate: task.dueDate, stage: task.stage,
  });
  await notifyTaskCreated(ctx, task, base.label);
  return task;
}

export async function setTaskStatus(ctx: ServiceCtx, task: MvpTask, status: MvpTask['status'], extra: Partial<MvpTask> = {}): Promise<MvpTask> {
  const now = nowOf(ctx).toISOString();
  const patch: Partial<MvpTask> = {
    status,
    updatedAt: now,
    ...(status === 'COMPLETED' ? { completedAt: now } : {}),
    ...extra,
  };
  const updated = await repos(ctx).tasks.update(task.id, patch, task.version ?? 0);
  await audit(ctx, 'TASK_STATUS_CHANGED', 'Task', task.id, task.orderId, { status: task.status }, { status }, extra.notes);
  return updated;
}

export interface ApplyResult {
  order: Order;
  created: MvpTask[];
}

/**
 * Apply one D-08 event to an order: complete/cancel open tasks, create the
 * next tasks (skipping any open duplicate, I-2), move stage forward only
 * (I-4) and status, refresh participants, and audit every change.
 */
export async function applyEvent(
  ctx: ServiceCtx,
  order: Order,
  event: MvpEvent,
  orderPatch: Partial<Order> = {},
  reason?: string,
): Promise<ApplyResult> {
  const now = nowOf(ctx);
  const rr = rulesFor(event, now);
  const all = await orderTasks(ctx, order.id);
  let open = all.filter(isOpenTask);

  for (const t of open) {
    if (rr.cancelAllOpen || rr.completes.includes(t.type)) {
      const nt = await setTaskStatus(ctx, t, rr.cancelAllOpen ? 'CANCELLED' : 'COMPLETED');
      all.splice(all.findIndex(x => x.id === t.id), 1, nt);
    }
  }
  open = all.filter(isOpenTask);

  const currentStage = mvpStageOf(order);
  const stageAfter = rr.stageAfter && isForwardMove(currentStage, rr.stageAfter) ? rr.stageAfter : currentStage;
  const settings = await loadSettings(ctx);
  const specs = planTaskCreation(rr.creates, open, rr.completes);
  const created: MvpTask[] = [];
  for (const spec of specs) {
    const assignee = resolveAssignee(spec.assignee, order, settings, now);
    const t = await createTaskFromSpec(ctx, { orderId: order.id, customerId: order.customerId, label: order.displayCode ?? order.title }, spec, stageAfter, assignee);
    created.push(t);
    all.push(t);
  }

  const statusBefore = orderStatusOf(order);
  const statusAfter = rr.statusAfter ?? statusBefore;
  const patch: Partial<Order> = {
    ...orderPatch,
    stage: stageAfter === currentStage ? order.stage : fromMvpStage(stageAfter),
    status: statusAfter,
    participantIds: computeParticipants({ ...order, ...orderPatch } as Order, all),
    updatedAt: now.toISOString(),
    updatedBy: ctx.actor.id,
  };
  const updated = await repos(ctx).orders.update(order.id, patch, order.version ?? 0);

  if (stageAfter !== currentStage) {
    await audit(ctx, 'ORDER_STAGE_CHANGED', 'Project', order.id, order.id, { stage: currentStage }, { stage: stageAfter }, reason ?? event.type);
  }
  if (statusAfter !== statusBefore) {
    await audit(ctx, 'ORDER_STATUS_CHANGED', 'Project', order.id, order.id, { status: statusBefore }, { status: statusAfter }, reason ?? event.type);
  }
  return { order: updated, created };
}

/** Recompute who may read the order after a reassignment or a direct task change. */
export async function refreshParticipants(ctx: ServiceCtx, orderId: string): Promise<Order> {
  const order = await loadOrder(ctx, orderId);
  const tasks = await orderTasks(ctx, orderId);
  const participantIds = computeParticipants(order, tasks);
  if (JSON.stringify(participantIds) === JSON.stringify(order.participantIds ?? [])) return order;
  return repos(ctx).orders.update(orderId, { participantIds, updatedAt: nowOf(ctx).toISOString() }, order.version ?? 0);
}
