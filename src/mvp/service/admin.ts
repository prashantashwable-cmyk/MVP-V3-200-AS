/**
 * Admin-only commands on the Order View (Step 04 list, D-24, D-25, D-03
 * override) plus Settings: invites (D-13), on-call (D-28), suppliers.
 * Every change is audited with before/after values (I-3).
 */
import { isOpenTask } from '../health';
import { newId, type Order } from '../repo';
import { TASK_TITLES } from '../rules';
import { fromMvpStage } from '../stage';
import type { MvpRole, MvpSettings, MvpStage, MvpSupplier, MvpTask, TaskType } from '../types';
import {
  applyEvent, audit, createTaskFromSpec, loadOrder, loadTask, mvpStageOf, MvpError, notify, nowOf, orderTasks,
  refreshParticipants, repos, requireRole, setTaskStatus, type ServiceCtx,
} from './core';

const admin = (ctx: ServiceCtx, what: string) => requireRole(ctx, ['admin'], what);

export async function putOnHold(ctx: ServiceCtx, orderId: string, reason: string, reviewDate: string): Promise<Order> {
  admin(ctx, 'put an order on hold');
  if (!reason.trim() || !reviewDate) throw new MvpError('invalid', 'A reason and a review date are required (D-24).');
  const order = await loadOrder(ctx, orderId);
  if ((order.status ?? 'ACTIVE') !== 'ACTIVE') throw new MvpError('invalid', 'Only an active order can be put on hold.');
  return (await applyEvent(ctx, order, { type: 'ORDER_HELD', reviewDate }, { holdReason: reason, holdReviewDate: reviewDate }, reason)).order;
}

export async function resumeOrder(ctx: ServiceCtx, orderId: string, note = ''): Promise<Order> {
  admin(ctx, 'resume an order');
  const order = await loadOrder(ctx, orderId);
  if (order.status !== 'ON_HOLD') throw new MvpError('invalid', 'This order is not on hold.');
  return (await applyEvent(ctx, order, { type: 'ORDER_RESUMED' }, { holdReason: '', holdReviewDate: '' }, note || 'Resumed')).order;
}

export async function cancelOrder(ctx: ServiceCtx, orderId: string, reason: string): Promise<Order> {
  admin(ctx, 'cancel an order');
  if (!reason.trim()) throw new MvpError('invalid', 'A reason is required to cancel (D-25).');
  const order = await loadOrder(ctx, orderId);
  if (order.status === 'CANCELLED' || order.status === 'COMPLETED') throw new MvpError('invalid', `This order is already ${order.status}.`);
  const res = await applyEvent(ctx, order, { type: 'ORDER_CANCELLED' }, { cancelReason: reason }, reason);
  if (order.sourceLeadId) {
    const lead = await repos(ctx).leads.get(order.sourceLeadId);
    if (lead && lead.mvpStatus !== 'LOST') {
      await repos(ctx).leads.update(lead.id, { mvpStatus: 'LOST', stage: 'closed_lost', lostReason: reason, updatedAt: nowOf(ctx).toISOString() }, lead.version ?? 0);
      await audit(ctx, 'LEAD_STATUS_CHANGED', 'Lead', lead.id, orderId, { status: lead.mvpStatus }, { status: 'LOST' }, reason);
    }
  }
  return res.order;
}

/** Admin stage override, including backwards (I-4 exception). Audited with a reason. */
export async function overrideStage(ctx: ServiceCtx, orderId: string, stage: MvpStage, reason: string): Promise<Order> {
  admin(ctx, 'override the stage');
  if (!reason.trim()) throw new MvpError('invalid', 'A reason is required.');
  const order = await loadOrder(ctx, orderId);
  const before = mvpStageOf(order);
  const updated = await repos(ctx).orders.update(orderId, { stage: fromMvpStage(stage), updatedAt: nowOf(ctx).toISOString(), updatedBy: ctx.actor.id }, order.version ?? 0);
  await audit(ctx, 'ORDER_STAGE_OVERRIDE', 'Project', orderId, orderId, { stage: before }, { stage }, reason);
  return updated;
}

export async function reassignTask(ctx: ServiceCtx, taskId: string, assigneeId: string, assigneeRole: MvpRole): Promise<void> {
  admin(ctx, 'reassign a task');
  const task = await loadTask(ctx, taskId);
  if (!isOpenTask(task)) throw new MvpError('invalid', 'Only an open task can be reassigned.');
  await repos(ctx).tasks.update(task.id, { assigneeId, assigneeRole, updatedAt: nowOf(ctx).toISOString() }, task.version ?? 0);
  await audit(ctx, 'TASK_REASSIGNED', 'Task', task.id, task.orderId, { assigneeId: task.assigneeId }, { assigneeId });
  await notify(ctx, assigneeId, 'task_assigned', 'Task assigned to you', task.title, task.orderId, `${task.id}_${assigneeId}`);
  if (task.orderId) await refreshParticipants(ctx, task.orderId);
}

export async function changeDueDate(ctx: ServiceCtx, taskId: string, dueDate: string, reason = ''): Promise<void> {
  admin(ctx, 'change a due date');
  const task = await loadTask(ctx, taskId);
  if (!isOpenTask(task)) throw new MvpError('invalid', 'Only an open task can be rescheduled.');
  await repos(ctx).tasks.update(task.id, { dueDate, updatedAt: nowOf(ctx).toISOString() }, task.version ?? 0);
  await audit(ctx, 'TASK_DUE_DATE_CHANGED', 'Task', task.id, task.orderId, { dueDate: task.dueDate }, { dueDate }, reason);
}

/** "Create next task" for NO NEXT ACTION (D-06), or any extra task the Admin needs. */
export async function createManualTask(
  ctx: ServiceCtx, orderId: string, input: { type?: TaskType; title?: string; assigneeId: string; assigneeRole: MvpRole; dueDate: string },
): Promise<MvpTask> {
  admin(ctx, 'create a task');
  const order = await loadOrder(ctx, orderId);
  const type = input.type ?? 'SET_NEXT_TASK';
  if ((await orderTasks(ctx, orderId)).some(t => t.type === type && isOpenTask(t))) {
    throw new MvpError('conflict', 'An open task of this type already exists (I-2).');
  }
  const t = await createTaskFromSpec(
    ctx, { orderId, customerId: order.customerId, label: order.displayCode ?? order.title },
    { type, assignee: 'admin', dueDate: input.dueDate, priority: 0 }, mvpStageOf(order),
    { assigneeId: input.assigneeId, assigneeRole: input.assigneeRole }, input.title || TASK_TITLES[type],
  );
  await refreshParticipants(ctx, orderId);
  return t;
}

/** The Admin completes a task directly, e.g. on behalf of a customer without a login. */
export async function completeTaskManually(ctx: ServiceCtx, taskId: string, note: string): Promise<void> {
  admin(ctx, 'complete a task directly');
  const task = await loadTask(ctx, taskId);
  if (!isOpenTask(task)) throw new MvpError('invalid', 'This task is not open.');
  if (!['SET_NEXT_TASK', 'REVIEW_NOT_FEASIBLE', 'AMC_FOLLOW_UP'].includes(task.type)) {
    throw new MvpError('invalid', 'Use the task\'s own action so the next step is created.');
  }
  await setTaskStatus(ctx, task, 'COMPLETED', { notes: note });
  if (task.orderId) await refreshParticipants(ctx, task.orderId);
}

// ---------------------------------------------------------------- Settings

export async function saveSettings(ctx: ServiceCtx, patch: Partial<MvpSettings>): Promise<MvpSettings> {
  admin(ctx, 'change settings');
  const r = repos(ctx).settings;
  const existing = await r.get('global');
  const at = nowOf(ctx).toISOString();
  const next = { ...(existing ?? { id: 'global' as const }), ...patch, id: 'global' as const, updatedAt: at };
  if (existing) await r.update('global', next, existing.version ?? 0);
  else await r.create({ ...next, version: 0 });
  await audit(ctx, 'SETTINGS_CHANGED', 'Settings', 'global', undefined, existing ?? {}, patch);
  return next as MvpSettings;
}

export async function setOnCall(ctx: ServiceCtx, technicianId: string, date: string): Promise<void> {
  await saveSettings(ctx, { onCall: { technicianId, date } });
}

/** D-13: the Admin links an email to a role (and a customer record) before the person signs in. */
export async function inviteUser(ctx: ServiceCtx, email: string, role: MvpRole, name: string, customerId?: string): Promise<void> {
  admin(ctx, 'invite users');
  const id = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(id)) throw new MvpError('invalid', 'Enter a valid email.');
  if (role === 'customer' && !customerId) throw new MvpError('invalid', 'Choose the customer this login belongs to.');
  const r = repos(ctx).invites;
  const existing = await r.get(id);
  const rec = { id, email: id, role, name, customerId, createdBy: ctx.actor.id, createdAt: nowOf(ctx).toISOString() };
  if (existing) await r.update(id, rec, existing.version ?? 0);
  else await r.create({ ...rec, version: 0 });
  await audit(ctx, 'USER_INVITED', 'Invite', id, undefined, existing ? { role: existing.role } : undefined, { role, customerId });
}

export async function upsertSupplier(ctx: ServiceCtx, input: Omit<MvpSupplier, 'id' | 'createdAt' | 'updatedAt' | 'version'> & { id?: string }): Promise<MvpSupplier> {
  admin(ctx, 'manage suppliers');
  if (!input.name.trim()) throw new MvpError('invalid', 'Supplier name is required.');
  const r = repos(ctx).suppliers;
  const at = nowOf(ctx).toISOString();
  if (input.id) {
    const ex = await r.get(input.id);
    if (!ex) throw new MvpError('not_found', 'Supplier not found.');
    const updated = await r.update(input.id, { ...input, updatedAt: at }, ex.version ?? 0);
    await audit(ctx, 'SUPPLIER_UPDATED', 'Supplier', input.id, undefined, ex, input);
    return updated;
  }
  const s: MvpSupplier = { ...input, id: newId('sup'), createdAt: at, updatedAt: at, version: 0 };
  await r.create(s);
  await audit(ctx, 'SUPPLIER_CREATED', 'Supplier', s.id, undefined, undefined, { name: s.name });
  return s;
}

export async function markNotificationRead(ctx: ServiceCtx, id: string): Promise<void> {
  const r = repos(ctx).notifications;
  const n = await r.get(id);
  if (n && !n.read) await r.update(id, { read: true });
}
