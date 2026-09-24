/**
 * Technician flow (spec §18, §22; D-14 START gate): START → CHECK IN → 11-item checklist
 * with photos → COMPLETE, plus REWORK tasks with the same flow. Reuses the canonical
 * InstallationJob; the checklist count is mirrored onto the order for progress (D-10).
 * No gamification; earnings are shown only if a real partner rate exists (none today).
 */

import type { InstallationJob, Snag, Task } from '../../domain/entities';
import { installationJobRepository, projectRepository, snagRepository, taskRepository } from '../../repository/entities';
import { recordAuditEvent, newCorrelationId } from '../../lib/audit';
import { CHECKLIST_ITEM_COUNT } from '../config';
import { checkGate } from '../gates';
import { isOpenTask } from '../health';
import { notify } from './notify';
import {
  applyEvent, customerToken, isAssignee, listOrderTasks, MvpError, nowOf, reassignTask, syncInstallationJob, type MvpActor, type MvpCtx,
} from './orderService';

/** Spec §18, in order. A photo is required for every item except "Site cleaned". */
export const CHECKLIST_ITEMS = [
  { key: 'materialReceived', label: 'Material received' },
  { key: 'siteChecked', label: 'Site checked' },
  { key: 'railsInstalled', label: 'Rails installed' },
  { key: 'bracketsInstalled', label: 'Brackets installed' },
  { key: 'machineInstalled', label: 'Machine installed' },
  { key: 'controllerInstalled', label: 'Controller installed' },
  { key: 'doorsInstalled', label: 'Doors installed' },
  { key: 'wiringCompleted', label: 'Wiring completed' },
  { key: 'safetyComponents', label: 'Safety components installed' },
  { key: 'testingCompleted', label: 'Testing completed' },
  { key: 'siteCleaned', label: 'Site cleaned', photoOptional: true },
] as const;

export type ChecklistKey = typeof CHECKLIST_ITEMS[number]['key'];

if (CHECKLIST_ITEMS.length !== CHECKLIST_ITEM_COUNT) throw new Error('Checklist size must match CHECKLIST_ITEM_COUNT (D-10).');

async function audit(ctx: MvpCtx, actor: MvpActor, action: string, entityType: string, entityId: string, orderId: string | undefined, before: unknown, after: unknown, reason?: string) {
  await recordAuditEvent(ctx, {
    actorId: actor.userId, actorRole: actor.role, action, entityType, entityId, projectId: orderId,
    before, after, reason, source: 'ui', correlationId: newCorrelationId(),
  });
}

async function loadWorkTask(ctx: MvpCtx, actor: MvpActor, taskId: string): Promise<Task> {
  const task = await taskRepository(ctx).get(taskId);
  if (!task || !task.orderId) throw new MvpError('not_found', 'Task not found.');
  if (task.type !== 'INSTALLATION' && task.type !== 'REWORK') throw new MvpError('invalid', 'This is not an installation or rework task.');
  if (actor.role !== 'admin' && !isAssignee(task, actor)) throw new MvpError('forbidden', 'This job is assigned to someone else.');
  if (!isOpenTask(task)) throw new MvpError('invalid', 'This job is already closed.');
  return task;
}

export async function getJob(ctx: MvpCtx, orderId: string): Promise<InstallationJob | null> {
  return installationJobRepository(ctx).get(`job_${orderId}`);
}

export function checklistDoneCount(job: Pick<InstallationJob, 'checklist'> | null): number {
  return CHECKLIST_ITEMS.filter(i => job?.checklist?.[i.key]?.done).length;
}

/** START. INSTALLATION is gated on the delivery payment (D-14 soft gate; Admin can override). */
export async function startWork(ctx: MvpCtx, actor: MvpActor, taskId: string): Promise<Task> {
  const task = await loadWorkTask(ctx, actor, taskId);
  if (task.status === 'BLOCKED') throw new MvpError('gate', 'This job is blocked. Resolve the blocker first.');
  if (task.type === 'INSTALLATION') {
    const gate = await checkGate(ctx, task.orderId!, 'INSTALLATION_START');
    if (!gate.allowed) throw new MvpError('gate', gate.reason);
  }
  if (task.status === 'IN_PROGRESS') return task;
  const now = nowOf(ctx).toISOString();
  const updated = await taskRepository(ctx).update(task.id, { status: 'IN_PROGRESS', updatedAt: now }, task.version ?? 0);
  if (task.type === 'INSTALLATION') {
    const job = await getJob(ctx, task.orderId!);
    if (job && !job.startedAt) await installationJobRepository(ctx).update(job.id, { startedAt: now, status: 'in_progress' } as any, job.version ?? 0);
  }
  await audit(ctx, actor, 'TASK_STARTED', 'Task', task.id, task.orderId, { status: task.status }, { status: 'IN_PROGRESS' });
  return updated;
}

/** CHECK IN: timestamp, and GPS only if the phone allows it (never required). */
export async function checkInAtSite(ctx: MvpCtx, actor: MvpActor, taskId: string, location?: { lat: number; lng: number; accuracyM?: number }): Promise<void> {
  const task = await loadWorkTask(ctx, actor, taskId);
  if (task.status !== 'IN_PROGRESS') throw new MvpError('invalid', 'Press START first.');
  const job = await getJob(ctx, task.orderId!);
  if (!job) throw new MvpError('invalid', 'This order has no installation job yet. Ask the Admin to assign the technician.');
  const now = nowOf(ctx).toISOString();
  await installationJobRepository(ctx).update(job.id, { checkedInAt: now, status: 'checked_in', ...(location ? { checkInLocation: location } : {}) } as any, job.version ?? 0);
  await audit(ctx, actor, 'CHECKED_IN', 'InstallationJob', job.id, task.orderId, undefined, { at: now, gps: !!location });
}

/** Tick one checklist item. The photo must already be stored (evidence id) unless optional. */
export async function setChecklistItem(
  ctx: MvpCtx, actor: MvpActor, taskId: string, key: ChecklistKey, input: { done: boolean; note?: string; documentId?: string },
): Promise<number> {
  const task = await loadWorkTask(ctx, actor, taskId);
  if (task.type !== 'INSTALLATION') throw new MvpError('invalid', 'The checklist belongs to the installation job.');
  if (task.status === 'BLOCKED') throw new MvpError('invalid', 'This job is blocked. Resolve the blocker first.');
  if (task.status !== 'IN_PROGRESS') throw new MvpError('invalid', 'Press START first.');
  const item = CHECKLIST_ITEMS.find(i => i.key === key);
  if (!item) throw new MvpError('invalid', 'Unknown checklist item.');
  if (input.done && !input.documentId && !('photoOptional' in item)) throw new MvpError('invalid', `Add a photo for "${item.label}" first.`);
  const job = await getJob(ctx, task.orderId!);
  if (!job) throw new MvpError('invalid', 'This order has no installation job yet.');
  if (!job.checkedInAt) throw new MvpError('invalid', 'CHECK IN at the site first.');
  const checklist = { ...(job.checklist ?? {}) };
  checklist[key] = input.done
    ? { done: true, by: actor.userId, at: nowOf(ctx).toISOString(), note: input.note ?? '', ...(input.documentId ? { documentId: input.documentId } : {}) }
    : { done: false };
  await installationJobRepository(ctx).update(job.id, { checklist } as any, job.version ?? 0);
  const count = checklistDoneCount({ checklist });
  const order = await projectRepository(ctx).get(task.orderId!);
  if (order && order.checklistDone !== count) {
    await projectRepository(ctx).update(order.id, { checklistDone: count, updatedAt: nowOf(ctx).toISOString(), updatedBy: actor.userId } as any, (order as any).version ?? 0);
  }
  await audit(ctx, actor, input.done ? 'CHECKLIST_ITEM_DONE' : 'CHECKLIST_ITEM_UNDONE', 'InstallationJob', job.id, task.orderId, undefined, { item: key, documentId: input.documentId ?? null });
  return count;
}

/**
 * COMPLETE. INSTALLATION needs all 11 items → QC_HANDOVER + QC_INSPECTION + "QC required".
 * REWORK needs a completion photo → a new QC_INSPECTION (the snag goes to re-inspection).
 */
export async function completeWork(ctx: MvpCtx, actor: MvpActor, taskId: string, input: { note?: string; documentId?: string } = {}): Promise<void> {
  const task = await loadWorkTask(ctx, actor, taskId);
  if (task.status === 'BLOCKED') throw new MvpError('gate', 'This job is blocked. Resolve the blocker first.');
  if (task.status !== 'IN_PROGRESS') throw new MvpError('invalid', 'Press START first.');
  const orderId = task.orderId!;
  const order = await projectRepository(ctx).get(orderId);
  if (!order) throw new MvpError('not_found', 'Order not found.');
  if (task.type === 'INSTALLATION') {
    const job = await getJob(ctx, orderId);
    const done = checklistDoneCount(job);
    if (done < CHECKLIST_ITEM_COUNT) throw new MvpError('invalid', `Complete all ${CHECKLIST_ITEM_COUNT} checklist items first (${done} done).`);
    if (job) await installationJobRepository(ctx).update(job.id, { completedAt: nowOf(ctx).toISOString(), status: 'completed' } as any, job.version ?? 0);
    await applyEvent(ctx, actor, orderId, { type: 'INSTALLATION_COMPLETED', qcUserId: order.qcUserId }, { reason: input.note });
  } else {
    if (!input.documentId) throw new MvpError('invalid', 'Add a photo of the fixed work before completing the rework.');
    await taskRepository(ctx).update(task.id, { evidenceIds: [...(task.evidenceIds ?? []), input.documentId], notes: input.note ?? task.notes, updatedAt: nowOf(ctx).toISOString() }, task.version ?? 0);
    // Rules: only the Admin or the snag's assignee may update a snag.
    const snags = (await snagRepository(ctx).query({ projectId: orderId } as Partial<Snag>))
      .filter(s => (s.status === 'open' || s.status === 'assigned') && (actor.role === 'admin' || s.assignedTo === actor.userId));
    for (const s of snags) await snagRepository(ctx).update(s.id, { status: 'reinspection_pending' });
    await applyEvent(ctx, actor, orderId, { type: 'REWORK_COMPLETED', qcUserId: order.qcUserId }, { reason: input.note });
  }
  if (order.qcUserId) await notify(ctx, order.qcUserId, 'mvp_qc_required', orderId, `${task.id}:qc`);
  else await notify(ctx, 'role:admin', 'mvp_qc_required', orderId, `${task.id}:qc`);
  await notify(ctx, customerToken(order.customerId), 'mvp_qc_required', orderId, `${task.id}:qc:customer`);
}

/** Admin picks the QC inspector; an open QC task waiting on the Admin moves to them. */
export async function assignQcInspector(ctx: MvpCtx, actor: MvpActor, orderId: string, qcUserId: string): Promise<void> {
  if (actor.role !== 'admin') throw new MvpError('forbidden', 'Only the Admin assigns the QC inspector.');
  if (!qcUserId) throw new MvpError('invalid', 'Choose a QC inspector.');
  const order = await projectRepository(ctx).get(orderId);
  if (!order) throw new MvpError('not_found', 'Order not found.');
  await projectRepository(ctx).update(orderId, { qcUserId, updatedAt: nowOf(ctx).toISOString(), updatedBy: actor.userId } as any, (order as any).version ?? 0);
  await audit(ctx, actor, 'QC_INSPECTOR_ASSIGNED', 'Project', orderId, orderId, { qcUserId: order.qcUserId ?? null }, { qcUserId });
  const waiting = (await listOrderTasks(ctx, orderId)).find(t => t.type === 'QC_INSPECTION' && isOpenTask(t) && t.assigneeId === 'role:admin');
  if (waiting) await reassignTask(ctx, actor, waiting.id, { id: qcUserId, role: 'qc' }, 'QC inspector assigned');
}

/** Admin picks the technician when material was received without one. */
export async function assignTechnician(ctx: MvpCtx, actor: MvpActor, orderId: string, technicianId: string): Promise<void> {
  if (actor.role !== 'admin') throw new MvpError('forbidden', 'Only the Admin assigns technicians.');
  const task = (await listOrderTasks(ctx, orderId)).find(t => t.type === 'INSTALLATION' && isOpenTask(t));
  if (!task) throw new MvpError('invalid', 'There is no open installation task.');
  await reassignTask(ctx, actor, task.id, { id: technicianId, role: 'technician' }, 'Technician assigned');
  await syncInstallationJob(ctx, orderId, technicianId);
}
