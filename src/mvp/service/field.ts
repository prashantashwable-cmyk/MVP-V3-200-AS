/**
 * Order service: installation, blockers, QC and rework, compliance,
 * handover, AMC and emergency (spec §18–§21, D-07, D-14 gates, D-26–D-29).
 */
import { MVP_CONFIG } from '../config';
import { isOpenTask } from '../health';
import { addDays, addMonths } from '../money';
import { newId, type Order } from '../repo';
import type {
  BlockerReason, ChecklistKey, ComplianceStatus, ComplianceType, Evidence, MvpAmcStatus, MvpBlocker, MvpServiceCase, QcDecision,
} from '../types';
import {
  ADMIN_POOL, applyEvent, audit, customerPool, isAdmin, loadOrder, loadSettings, loadTask, MvpError, mvpStageOf, notify, nowOf,
  orderTasks, repos, requirePermission, requireRole, requireTaskOwner, setTaskStatus, tryGet, type ServiceCtx,
} from './core';

// ---------------------------------------------------------------- Installation (spec §18, §22)

export const GATE_DELIVERY_PAYMENT = 'DELIVERY_PAYMENT';

/** START on the installation task needs the delivery payment PAID, unless the Admin overrode the gate (D-14). */
export async function startTask(ctx: ServiceCtx, taskId: string): Promise<void> {
  const task = await loadTask(ctx, taskId);
  requireTaskOwner(ctx, task);
  if (task.status !== 'TODO') throw new MvpError('invalid', 'This task has already started.');
  if (task.type === 'INSTALLATION' && !task.gateOverrides?.[GATE_DELIVERY_PAYMENT]) {
    const m = await tryGet(repos(ctx).milestones.get(`ms_${task.orderId}_DELIVERY`));
    if (!m || m.status !== 'PAID') throw new MvpError('gate', 'Waiting for delivery payment');
  }
  await setTaskStatus(ctx, task, 'IN_PROGRESS', { startedAt: nowOf(ctx).toISOString() });
}

export async function checkIn(ctx: ServiceCtx, taskId: string): Promise<void> {
  const task = await loadTask(ctx, taskId);
  requireTaskOwner(ctx, task);
  if (task.status !== 'IN_PROGRESS') throw new MvpError('invalid', 'Press START first.');
  await repos(ctx).tasks.update(task.id, { checkedInAt: nowOf(ctx).toISOString(), updatedAt: nowOf(ctx).toISOString() }, task.version ?? 0);
  await audit(ctx, 'TASK_CHECKED_IN', 'Task', task.id, task.orderId, undefined, { at: nowOf(ctx).toISOString() });
}

/** Admin override of a soft gate, with a reason (D-14). Audited. */
export async function overrideGate(ctx: ServiceCtx, taskId: string, gate: string, reason: string): Promise<void> {
  requireRole(ctx, ['admin'], 'override a gate');
  if (!reason.trim()) throw new MvpError('invalid', 'A reason is required to override a gate.');
  const task = await loadTask(ctx, taskId);
  const at = nowOf(ctx).toISOString();
  await repos(ctx).tasks.update(task.id, { gateOverrides: { ...(task.gateOverrides ?? {}), [gate]: { by: ctx.actor.id, reason, at } }, updatedAt: at }, task.version ?? 0);
  await audit(ctx, 'GATE_OVERRIDE', 'Task', task.id, task.orderId, { gate, overridden: false }, { gate, overridden: true }, reason);
}

export async function updateChecklistItem(ctx: ServiceCtx, orderId: string, key: ChecklistKey, done: boolean, photo?: Evidence, note?: string): Promise<number> {
  const task = (await orderTasks(ctx, orderId)).find(t => t.type === 'INSTALLATION' && isOpenTask(t));
  if (!task) throw new MvpError('invalid', 'There is no open installation task.');
  requireTaskOwner(ctx, task);
  if (task.status === 'TODO') throw new MvpError('invalid', 'Press START first.');
  if (task.status === 'BLOCKED') throw new MvpError('invalid', 'This task is blocked. Resolve the blocker first.');
  const r = repos(ctx);
  const cl = await r.checklists.get(orderId);
  if (!cl) throw new MvpError('not_found', 'Checklist not found.');
  const at = nowOf(ctx).toISOString();
  const items = cl.items.map(i => i.key !== key ? i : {
    ...i, done, photo: photo ?? i.photo, note: note ?? i.note,
    completedBy: done ? ctx.actor.id : undefined, completedAt: done ? at : undefined,
  });
  await r.checklists.update(orderId, { items, updatedAt: at }, cl.version ?? 0);
  await audit(ctx, 'CHECKLIST_ITEM_UPDATED', 'Checklist', orderId, orderId, { key, done: cl.items.find(i => i.key === key)?.done }, { key, done });
  return items.filter(i => i.done).length;
}

export async function completeInstallation(ctx: ServiceCtx, orderId: string): Promise<Order> {
  const task = (await orderTasks(ctx, orderId)).find(t => t.type === 'INSTALLATION' && isOpenTask(t));
  if (!task) throw new MvpError('invalid', 'There is no open installation task.');
  requireTaskOwner(ctx, task);
  const cl = await repos(ctx).checklists.get(orderId);
  const missing = cl?.items.filter(i => !i.done).map(i => i.label) ?? ['checklist'];
  if (missing.length) throw new MvpError('gate', `Finish the checklist first: ${missing.join(', ')}.`);
  return (await applyEvent(ctx, await loadOrder(ctx, orderId), { type: 'INSTALLATION_COMPLETED' })).order;
}

// ---------------------------------------------------------------- Blockers (spec §12, D-07)

const CUSTOMER_REASONS: BlockerReason[] = ['CUSTOMER_NOT_READY', 'POWER_UNAVAILABLE', 'PAYMENT_PENDING'];

export async function raiseBlocker(
  ctx: ServiceCtx, orderId: string, input: { taskId?: string; reason: BlockerReason; description: string; evidence: Evidence[] },
): Promise<MvpBlocker> {
  requirePermission(ctx, 'blocker.raise');
  const order = await loadOrder(ctx, orderId);
  if (ctx.actor.role === 'customer' && ctx.actor.customerId !== order.customerId) throw new MvpError('forbidden', 'This is not your order.');
  if (!input.description.trim()) throw new MvpError('invalid', 'Describe the problem.');
  const now = nowOf(ctx);
  const blocker: MvpBlocker = {
    id: newId('blk'), orderId, customerId: order.customerId, taskId: input.taskId, reason: input.reason,
    description: input.description, evidence: input.evidence,
    ownerUserId: CUSTOMER_REASONS.includes(input.reason) ? customerPool(order.customerId) : ADMIN_POOL,
    status: 'OPEN', createdBy: ctx.actor.id, createdByRole: ctx.actor.role,
    dueDate: addDays(now, MVP_CONFIG.BLOCKER_DUE_DAYS), createdAt: now.toISOString(), updatedAt: now.toISOString(), version: 0,
  };
  await repos(ctx).blockers.create(blocker);
  await audit(ctx, 'BLOCKER_RAISED', 'Blocker', blocker.id, orderId, undefined, { reason: blocker.reason, taskId: blocker.taskId, owner: blocker.ownerUserId });
  if (input.taskId) {
    const task = await loadTask(ctx, input.taskId);
    if (isOpenTask(task) && task.status !== 'BLOCKED') await setTaskStatus(ctx, task, 'BLOCKED', { previousStatus: task.status });
  }
  await notify(ctx, ADMIN_POOL, 'blocker_raised', 'Blocker raised', `${order.displayCode}: ${input.reason} — ${input.description}`, orderId, blocker.id);
  return blocker;
}

export async function resolveBlocker(ctx: ServiceCtx, blockerId: string, resolutionNote: string): Promise<void> {
  const r = repos(ctx);
  const b = await r.blockers.get(blockerId);
  if (!b) throw new MvpError('not_found', 'Blocker not found.');
  const isOwner = b.ownerUserId === ctx.actor.id || (ctx.actor.role === 'customer' && b.ownerUserId === customerPool(ctx.actor.customerId ?? ''));
  if (!isAdmin(ctx) && !isOwner) throw new MvpError('forbidden', 'Only the Admin or the blocker\'s owner can resolve it.');
  if (b.status !== 'OPEN') throw new MvpError('invalid', 'This blocker is already resolved.');
  if (!resolutionNote.trim()) throw new MvpError('invalid', 'Add a resolution note.');
  const at = nowOf(ctx).toISOString();
  await r.blockers.update(b.id, { status: 'RESOLVED', resolutionNote, resolvedAt: at, updatedAt: at }, b.version ?? 0);
  await audit(ctx, 'BLOCKER_RESOLVED', 'Blocker', b.id, b.orderId, { status: 'OPEN' }, { status: 'RESOLVED' }, resolutionNote);
  if (b.taskId) {
    const others = (await r.blockers.query({ taskId: b.taskId } as any)).filter(x => x.id !== b.id && x.status === 'OPEN');
    const task = await loadTask(ctx, b.taskId);
    if (task.status === 'BLOCKED' && others.length === 0) await setTaskStatus(ctx, task, task.previousStatus ?? 'TODO');
  }
}

export async function reassignBlocker(ctx: ServiceCtx, blockerId: string, ownerUserId: string): Promise<void> {
  requireRole(ctx, ['admin'], 'reassign a blocker');
  const b = await repos(ctx).blockers.get(blockerId);
  if (!b) throw new MvpError('not_found', 'Blocker not found.');
  await repos(ctx).blockers.update(b.id, { ownerUserId, updatedAt: nowOf(ctx).toISOString() }, b.version ?? 0);
  await audit(ctx, 'BLOCKER_REASSIGNED', 'Blocker', b.id, b.orderId, { owner: b.ownerUserId }, { owner: ownerUserId });
}

// ---------------------------------------------------------------- QC and rework (spec §19)

export async function recordQcDecision(
  ctx: ServiceCtx, orderId: string, input: { decision: QcDecision; testResults: string; remarks: string; evidence: Evidence[] },
): Promise<Order> {
  requirePermission(ctx, 'qc.approve');
  const tasks = await orderTasks(ctx, orderId);
  const task = tasks.find(t => t.type === 'QC_INSPECTION' && isOpenTask(t));
  if (!task) throw new MvpError('invalid', 'There is no open QC task.');
  requireTaskOwner(ctx, task);
  if (input.decision !== 'PASS' && !input.remarks.trim()) throw new MvpError('invalid', 'Explain what needs fixing.');
  const order = await loadOrder(ctx, orderId);
  const r = repos(ctx);
  const at = nowOf(ctx).toISOString();
  const rec = { id: newId('qc'), orderId, customerId: order.customerId, ...input, inspectorId: ctx.actor.id, createdAt: at, updatedAt: at, version: 0 };
  await r.qcRecords.create(rec);
  await audit(ctx, 'QC_DECISION', 'QCRecord', rec.id, orderId, undefined, { decision: input.decision, remarks: input.remarks });
  const installer = tasks.filter(t => t.type === 'INSTALLATION').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  const technicianId = installer?.assigneeId ?? 'role:technician';
  if (input.decision === 'REWORK') {
    const prior = (await r.snags.query({ orderId } as any)).length;
    await r.snags.create({
      id: newId('snag') as any, projectId: orderId as any, orderId, qcInspectionId: rec.id as any, status: 'assigned',
      description: input.remarks, assignedTo: technicianId as any, reworkCount: prior + 1,
    });
  }
  const patch: Partial<Order> = input.decision === 'FAIL' ? { holdReason: `QC FAIL: ${input.remarks}` } : {};
  const res = await applyEvent(ctx, order, { type: 'QC_DECIDED', decision: input.decision, technicianId }, patch);
  if (input.decision === 'PASS') {
    const fin = await tryGet(r.milestones.get(`ms_${orderId}_FINAL`));
    const payTask = res.created.find(t => t.type === 'COLLECT_FINAL_PAYMENT');
    if (fin && payTask) await r.milestones.update(fin.id, { dueDate: payTask.dueDate, updatedAt: at }, fin.version ?? 0);
  }
  return res.order;
}

export async function completeRework(ctx: ServiceCtx, taskId: string, evidence: Evidence[], note: string): Promise<Order> {
  const task = await loadTask(ctx, taskId);
  if (task.type !== 'REWORK') throw new MvpError('invalid', 'Not a rework task.');
  requireTaskOwner(ctx, task);
  if (!evidence.length) throw new MvpError('invalid', 'Add a photo of the fix.');
  const r = repos(ctx);
  await r.tasks.update(task.id, { evidence: [...task.evidence, ...evidence], notes: note, updatedAt: nowOf(ctx).toISOString() }, task.version ?? 0);
  for (const s of await r.snags.query({ orderId: task.orderId } as any)) {
    if (s.status !== 'closed' && s.status !== 'reinspection_pending') await r.snags.update(s.id, { status: 'reinspection_pending' } as any);
  }
  return (await applyEvent(ctx, await loadOrder(ctx, task.orderId), { type: 'REWORK_DONE' })).order;
}

// ---------------------------------------------------------------- Compliance (D-27, D-29)

export async function setComplianceDoc(
  ctx: ServiceCtx, orderId: string, type: ComplianceType, status: ComplianceStatus, file?: Evidence, note?: string,
): Promise<void> {
  requireRole(ctx, ['admin'], 'update compliance documents');
  const order = await loadOrder(ctx, orderId);
  const r = repos(ctx);
  const id = `${orderId}_${type}`;
  const existing = await r.compliance.get(id);
  const fileRef = file ?? existing?.file;
  if (type === 'LIFT_LICENCE' && status === 'DONE' && !fileRef) throw new MvpError('invalid', 'Attach the licence file before marking it DONE.');
  const at = nowOf(ctx).toISOString();
  if (existing) {
    await r.compliance.update(id, { status, file: fileRef, note: note ?? existing.note, updatedAt: at }, existing.version ?? 0);
  } else {
    await r.compliance.create({ id, orderId, customerId: order.customerId, type, status, file: fileRef, note, createdAt: at, updatedAt: at, version: 0 });
  }
  await audit(ctx, 'COMPLIANCE_UPDATED', 'ComplianceDoc', id, orderId, { status: existing?.status }, { status, file: !!fileRef }, note);
  if (type === 'LIFT_LICENCE' && status === 'DONE') {
    await applyEvent(ctx, await loadOrder(ctx, orderId), { type: 'LICENCE_DONE' });
  }
}

// ---------------------------------------------------------------- Handover (spec §20, D-26, D-29)

export async function approveHandoverAsCustomer(ctx: ServiceCtx, orderId: string): Promise<void> {
  requirePermission(ctx, 'handover.customer_approve');
  const order = await loadOrder(ctx, orderId);
  if (ctx.actor.role === 'customer' && ctx.actor.customerId !== order.customerId) throw new MvpError('forbidden', 'This is not your order.');
  if (!(await orderTasks(ctx, orderId)).some(t => t.type === 'HANDOVER' && isOpenTask(t))) throw new MvpError('invalid', 'The order is not ready for handover yet.');
  const r = repos(ctx);
  const at = nowOf(ctx).toISOString();
  const h = await tryGet(r.handovers.get(orderId));
  if (h) await r.handovers.update(orderId, { customerApprovedAt: at, customerApprovedBy: ctx.actor.id, updatedAt: at }, h.version ?? 0);
  else await r.handovers.create({ id: orderId, orderId, customerId: order.customerId, customerApprovedAt: at, customerApprovedBy: ctx.actor.id, photos: [], overrides: [], createdAt: at, updatedAt: at, version: 0 });
  await audit(ctx, 'HANDOVER_CUSTOMER_APPROVED', 'Handover', orderId, orderId, undefined, { by: ctx.actor.id, onBehalf: ctx.actor.role !== 'customer' });
}

export type HandoverGate = 'FINAL_PAYMENT' | 'LICENCE' | 'CUSTOMER_APPROVAL';

export async function completeHandover(
  ctx: ServiceCtx, orderId: string, input: { finalTest: string; photos: Evidence[]; overrides?: Partial<Record<HandoverGate, string>> },
): Promise<Order> {
  requireRole(ctx, ['admin'], 'complete a handover');
  const order = await loadOrder(ctx, orderId);
  const r = repos(ctx);
  const tasks = await orderTasks(ctx, orderId);
  if (!tasks.some(t => t.type === 'HANDOVER' && isOpenTask(t))) throw new MvpError('invalid', 'There is no open handover task.');
  const overrides = input.overrides ?? {};
  const fin = await r.milestones.get(`ms_${orderId}_FINAL`);
  const licence = await r.compliance.get(`${orderId}_LIFT_LICENCE`);
  const handover = await r.handovers.get(orderId);
  const failed: [HandoverGate, string][] = [];
  if (fin?.status !== 'PAID') failed.push(['FINAL_PAYMENT', 'Final payment not paid']);
  if (licence?.status !== 'DONE') failed.push(['LICENCE', 'Statutory licence not done']);
  if (!handover?.customerApprovedAt) failed.push(['CUSTOMER_APPROVAL', 'Customer has not approved the handover']);
  const blocking = failed.filter(([g]) => !overrides[g]?.trim());
  if (blocking.length) throw new MvpError('gate', blocking.map(([, m]) => m).join('; '));
  const at = nowOf(ctx).toISOString();
  const usedOverrides = failed.map(([gate]) => ({ gate, reason: overrides[gate]!, by: ctx.actor.id, at }));
  for (const o of usedOverrides) {
    await audit(ctx, 'GATE_OVERRIDE', 'Handover', orderId, orderId, { gate: o.gate, overridden: false }, { gate: o.gate, overridden: true }, o.reason);
  }
  const base = { finalTest: input.finalTest, photos: input.photos, completedAt: at, completedBy: ctx.actor.id, updatedAt: at };
  if (handover) await r.handovers.update(orderId, { ...base, overrides: [...handover.overrides, ...usedOverrides] }, handover.version ?? 0);
  else await r.handovers.create({ id: orderId, orderId, customerId: order.customerId, ...base, overrides: usedOverrides, createdAt: at, version: 0 });
  const warrantyEnd = addMonths(at, MVP_CONFIG.WARRANTY_MONTHS);
  await r.warranties.create({ id: `war_${orderId}` as any, projectId: orderId as any, handoverId: orderId as any, startDate: at, endDate: warrantyEnd });
  await r.amcs.create({
    id: orderId, orderId, customerId: order.customerId, warrantyStart: at, warrantyEnd, mvpAmcStatus: 'WARRANTY',
    amcReminderDate: addDays(warrantyEnd, -MVP_CONFIG.AMC_DUE_DAYS_BEFORE_WARRANTY_END), complaints: [],
    createdAt: at, updatedAt: at, version: 0,
  });
  await audit(ctx, 'HANDOVER_COMPLETED', 'Handover', orderId, orderId, undefined, { warrantyEnd, overrides: usedOverrides.map(o => o.gate) });
  return (await applyEvent(ctx, order, { type: 'HANDOVER_COMPLETED', warrantyEnd }, { completedAt: at })).order;
}

// ---------------------------------------------------------------- AMC (spec §21, D-26)

export async function updateAmc(ctx: ServiceCtx, orderId: string, patch: { mvpAmcStatus?: MvpAmcStatus; lastService?: string; nextService?: string; complaint?: string }): Promise<void> {
  requireRole(ctx, ['admin'], 'update the AMC');
  const r = repos(ctx);
  const amc = await r.amcs.get(orderId);
  if (!amc) throw new MvpError('not_found', 'This order has no AMC record yet (handover not completed).');
  const at = nowOf(ctx).toISOString();
  const { complaint, ...rest } = patch;
  await r.amcs.update(orderId, { ...rest, complaints: complaint ? [...amc.complaints, { at, text: complaint }] : amc.complaints, updatedAt: at }, amc.version ?? 0);
  await audit(ctx, 'AMC_UPDATED', 'AMC', orderId, orderId, { mvpAmcStatus: amc.mvpAmcStatus }, rest, complaint);
  if (patch.mvpAmcStatus === 'AMC_ACTIVE' || patch.mvpAmcStatus === 'AMC_LOST') {
    const t = (await orderTasks(ctx, orderId)).find(x => x.type === 'AMC_FOLLOW_UP' && isOpenTask(x));
    if (t) await setTaskStatus(ctx, t, 'COMPLETED', { notes: patch.mvpAmcStatus });
  }
}

/** AMC_DUE is computed: from 90 days before the warranty ends (D-26). */
export function effectiveAmcStatus(amc: { mvpAmcStatus: MvpAmcStatus; amcReminderDate: string }, now: Date): MvpAmcStatus {
  if (amc.mvpAmcStatus === 'WARRANTY' && new Date(amc.amcReminderDate).getTime() <= now.getTime()) return 'AMC_DUE';
  return amc.mvpAmcStatus;
}

// ---------------------------------------------------------------- Emergency (D-28)

export async function raiseEmergency(ctx: ServiceCtx, orderId: string, description: string): Promise<MvpServiceCase> {
  requirePermission(ctx, 'emergency.raise');
  const order = await loadOrder(ctx, orderId);
  if (ctx.actor.role === 'customer' && ctx.actor.customerId !== order.customerId) throw new MvpError('forbidden', 'This is not your lift.');
  if (mvpStageOf(order) !== 'AMC') throw new MvpError('invalid', 'The emergency button is for installed lifts.');
  const res = await applyEvent(ctx, order, { type: 'EMERGENCY_RAISED' });
  const task = res.created.find(t => t.type === 'EMERGENCY_RESPONSE')
    ?? (await orderTasks(ctx, orderId)).find(t => t.type === 'EMERGENCY_RESPONSE' && isOpenTask(t))!;
  const at = nowOf(ctx).toISOString();
  const sc: MvpServiceCase = {
    id: newId('sc'), orderId, customerId: order.customerId, priority: 'P0', kind: 'EMERGENCY', description, status: 'OPEN',
    assigneeId: task.assigneeId, taskId: task.id, raisedBy: ctx.actor.id, createdAt: at, updatedAt: at, version: 0,
  };
  await repos(ctx).serviceCases.create(sc);
  await audit(ctx, 'EMERGENCY_RAISED', 'ServiceCase', sc.id, orderId, undefined, { description, assigneeId: sc.assigneeId });
  const body = `${order.displayCode}: ${description}`;
  for (const who of new Set([ADMIN_POOL, 'role:owner', task.assigneeId])) {
    await notify(ctx, who, 'emergency', 'EMERGENCY', body, orderId, sc.id);
  }
  return sc;
}

export async function acknowledgeEmergency(ctx: ServiceCtx, caseId: string): Promise<void> {
  const r = repos(ctx);
  const sc = await r.serviceCases.get(caseId);
  if (!sc) throw new MvpError('not_found', 'Case not found.');
  const task = await loadTask(ctx, sc.taskId);
  requireTaskOwner(ctx, task);
  if (sc.status !== 'OPEN') throw new MvpError('invalid', 'Already acknowledged.');
  const at = nowOf(ctx).toISOString();
  await r.serviceCases.update(caseId, { status: 'ACKNOWLEDGED', acknowledgedAt: at, updatedAt: at }, sc.version ?? 0);
  if (task.status === 'TODO') await setTaskStatus(ctx, task, 'IN_PROGRESS', { startedAt: at });
  await audit(ctx, 'EMERGENCY_ACKNOWLEDGED', 'ServiceCase', caseId, sc.orderId, { status: 'OPEN' }, { status: 'ACKNOWLEDGED', minutesToAck: minutesBetween(sc.createdAt, at) });
}

export async function resolveEmergency(ctx: ServiceCtx, caseId: string, note: string, photo?: Evidence): Promise<void> {
  const r = repos(ctx);
  const sc = await r.serviceCases.get(caseId);
  if (!sc) throw new MvpError('not_found', 'Case not found.');
  const task = await loadTask(ctx, sc.taskId);
  requireTaskOwner(ctx, task);
  if (sc.status === 'RESOLVED') throw new MvpError('invalid', 'Already resolved.');
  if (!note.trim()) throw new MvpError('invalid', 'Add a resolution note.');
  const at = nowOf(ctx).toISOString();
  await r.serviceCases.update(caseId, { status: 'RESOLVED', resolvedAt: at, resolutionNote: note, photo, acknowledgedAt: sc.acknowledgedAt ?? at, updatedAt: at }, sc.version ?? 0);
  await setTaskStatus(ctx, await loadTask(ctx, sc.taskId), 'COMPLETED', { notes: note, evidence: photo ? [photo] : [] });
  await audit(ctx, 'EMERGENCY_RESOLVED', 'ServiceCase', caseId, sc.orderId, { status: sc.status }, { status: 'RESOLVED', minutesToResolve: minutesBetween(sc.createdAt, at) }, note);
}

export function minutesBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

export { loadSettings };
