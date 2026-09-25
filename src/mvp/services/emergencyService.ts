/**
 * Emergency / breakdown (spec, D-28, life safety). One EMERGENCY button on an installed
 * lift's order, straight to today's on-call technician (or the Admin if none is set),
 * with an in-app alert to the Admin, the Owner and the technician (D-17: in-app only).
 * Timing and the top-of-Needs-Attention placement are the existing D-08/D-11 machinery
 * (EMERGENCY_RESPONSE task + the `emergency` bucket, src/mvp/services/readModels.ts) —
 * nothing new is needed there. Why not reuse EmergencyEscalationAlert (1,135 lines, ○):
 * it is a legacy DbManager screen; only its UI parts (the button, the "call 112" line)
 * are worth carrying over, per REUSE_MAP.
 */

import type { ServiceCase } from '../../domain/entities';
import { mvpSettingsRepository, serviceCaseRepository } from '../../repository/entities';
import { createIfAbsent } from '../../repository/transactions';
import { recordAuditEvent, newCorrelationId } from '../../lib/audit';
import { TIME_ZONE } from '../config';
import { isOpenTask } from '../health';
import { notify } from './notify';
import {
  applyEvent, completeTask, listOrderTasks, MvpError, nowOf, setTaskInProgress, type MvpActor, type MvpCtx,
} from './orderService';
import { requireText } from '../validate';

async function audit(ctx: MvpCtx, actor: MvpActor, action: string, entityType: string, entityId: string, orderId: string | undefined, before: unknown, after: unknown, reason?: string) {
  await recordAuditEvent(ctx, {
    actorId: actor.userId, actorRole: actor.role, action, entityType, entityId, projectId: orderId,
    before, after, reason, source: 'ui', correlationId: newCorrelationId(),
  });
}

/** 'YYYY-MM-DD' in Asia/Kolkata — the on-call setting's document id. */
export function dateKey(now: Date): string {
  return now.toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
}

// ---------------------------------------------------------------------------
// On-call technician (D-28: "a simple setting", Admin only)
// ---------------------------------------------------------------------------

export async function getOnCallTechnician(ctx: MvpCtx, date: string): Promise<string | undefined> {
  return (await mvpSettingsRepository(ctx).get(`oncall_${date}`))?.technicianId;
}

export async function setOnCallTechnician(ctx: MvpCtx, actor: MvpActor, date: string, technicianId: string): Promise<void> {
  if (actor.role !== 'admin') throw new MvpError('forbidden', 'Only the Admin sets the on-call technician.');
  requireText(date, 'Date');
  requireText(technicianId, 'Technician');
  const id = `oncall_${date}`;
  const repo = mvpSettingsRepository(ctx);
  const existing = await repo.get(id);
  if (existing) await repo.update(id, { technicianId, date }, existing.version ?? 0);
  else await createIfAbsent(ctx, 'mvp_settings', { id, date, technicianId, version: 0 });
  await audit(ctx, actor, 'ON_CALL_SET', 'MvpSettings', id, undefined, { technicianId: existing?.technicianId ?? null }, { technicianId }, `On-call for ${date}`);
}

// ---------------------------------------------------------------------------
// Raise / acknowledge / resolve (spec, D-28)
// ---------------------------------------------------------------------------

/** Any signed-in participant of the order may press it (spec: "the customer, and a resident if
 * the plan adds that access"); today only the customer role reaches this screen (D-12). */
export async function raiseEmergency(ctx: MvpCtx, actor: MvpActor, orderId: string, input: { description: string; evidenceIds?: string[] }): Promise<ServiceCase> {
  const description = requireText(input.description, 'A short description');
  const now = nowOf(ctx);
  const onCallTechId = await getOnCallTechnician(ctx, dateKey(now));

  const applied = await applyEvent(ctx, actor, orderId, { type: 'EMERGENCY_RAISED', onCallTechId }, { reason: description });
  const task = applied.created.find(t => t.type === 'EMERGENCY_RESPONSE');

  const kase: ServiceCase = {
    id: `case_${orderId}_${now.getTime().toString(36)}` as ServiceCase['id'],
    projectId: orderId as ServiceCase['projectId'],
    status: 'open',
    reportedBy: actor.userId as ServiceCase['reportedBy'],
    assignedTo: onCallTechId as ServiceCase['assignedTo'],
    createdAt: now.toISOString(),
    kind: 'EMERGENCY',
    priority: 'P0',
    description,
    documentIds: input.evidenceIds ?? [],
    version: 0,
  };
  await serviceCaseRepository(ctx).create(JSON.parse(JSON.stringify(kase)));
  await audit(ctx, actor, 'EMERGENCY_RAISED', 'ServiceCase', kase.id, orderId, undefined, { onCallTechId: onCallTechId ?? null, taskId: task?.id }, description);

  // Straight away, in-app (D-17 FROZEN: in-app only — no WhatsApp/SMS gateway exists yet).
  await notify(ctx, 'role:admin', 'mvp_emergency', orderId, kase.id);
  await notify(ctx, 'role:owner', 'mvp_emergency', orderId, kase.id);
  if (onCallTechId) await notify(ctx, onCallTechId, 'mvp_emergency', orderId, kase.id);
  return kase;
}

async function loadCase(ctx: MvpCtx, actor: MvpActor, caseId: string): Promise<ServiceCase> {
  const kase = await serviceCaseRepository(ctx).get(caseId);
  if (!kase) throw new MvpError('not_found', `Service case ${caseId} not found.`);
  if (actor.role !== 'admin' && kase.assignedTo !== actor.userId) throw new MvpError('forbidden', 'This case is assigned to someone else.');
  return kase;
}

/** The on-call technician (or the Admin) acknowledges: the response task moves to IN_PROGRESS. */
export async function acknowledgeEmergency(ctx: MvpCtx, actor: MvpActor, caseId: string): Promise<void> {
  const kase = await loadCase(ctx, actor, caseId);
  if (kase.acknowledgedAt) return;
  const task = (await listOrderTasks(ctx, kase.projectId)).find(t => t.type === 'EMERGENCY_RESPONSE' && isOpenTask(t));
  if (task) await setTaskInProgress(ctx, actor, task.id);
  const now = nowOf(ctx).toISOString();
  await serviceCaseRepository(ctx).update(caseId, { acknowledgedAt: now, status: 'assigned' }, kase.version ?? 0);
  await audit(ctx, actor, 'EMERGENCY_ACKNOWLEDGED', 'ServiceCase', caseId, kase.projectId, undefined, { acknowledgedAt: now });
}

export async function resolveEmergency(ctx: MvpCtx, actor: MvpActor, caseId: string, input: { note: string; documentId?: string }): Promise<void> {
  const kase = await loadCase(ctx, actor, caseId);
  const note = requireText(input.note, 'A resolution note');
  const task = (await listOrderTasks(ctx, kase.projectId)).find(t => t.type === 'EMERGENCY_RESPONSE' && isOpenTask(t));
  if (task) await completeTask(ctx, actor, task.id, note, input.documentId ? [input.documentId] : []);
  const now = nowOf(ctx).toISOString();
  await serviceCaseRepository(ctx).update(caseId, {
    status: 'resolved', resolvedAt: now, resolutionNote: note,
    documentIds: [...(kase.documentIds ?? []), ...(input.documentId ? [input.documentId] : [])],
  }, kase.version ?? 0);
  await audit(ctx, actor, 'EMERGENCY_RESOLVED', 'ServiceCase', caseId, kase.projectId, undefined, { resolvedAt: now }, note);
}

export async function listOpenEmergencies(ctx: MvpCtx, orderId: string): Promise<ServiceCase[]> {
  return (await serviceCaseRepository(ctx).query({ projectId: orderId } as Partial<ServiceCase>))
    .filter(c => c.kind === 'EMERGENCY' && c.status !== 'resolved' && c.status !== 'closed');
}
