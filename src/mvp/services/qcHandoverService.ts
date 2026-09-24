/**
 * QC, handover, compliance and AMC (spec §19–21, D-08, D-26, D-27, D-29). QC records one
 * decision (PASS/REWORK/FAIL) on the canonical QCInspection; REWORK also opens a Snag.
 * Handover is Admin-only and hard-gated by the final payment and the statutory licence
 * (soft gates, overridable — src/mvp/gates.ts). AMC status is a small Admin-set state machine
 * on the canonical AMC record; AMC_DUE is computed, never stored (D-26).
 * Why not reuse QcInspectorAssignmentScreen/QualityChecklistMechanicalScreen(+Electrical)/
 * FinalHandoverChecklistScreen/HandoverCompletionCertificateScreen/CustomerHandoverWalkthroughScreen/
 * WarrantyAmcRegistrationScreen: each reads/writes through DbManager and the mechanical/
 * electrical checklists are two separate 600-line screens; this reuses installationService's
 * job lookup, gates.ts and paymentService's existing milestone UI instead.
 */

import type { AMC, AMCStatus, ComplianceItem, ComplianceType, Task } from '../../domain/entities';

/** The `mvpAmcStatus` union (D-26); not separately exported by entities.ts. */
export type MvpAmcStatus = NonNullable<AMC['mvpAmcStatus']>;
import {
  amcRepository, complianceItemRepository, handoverRepository, projectRepository, qcInspectionRepository,
  snagRepository, warrantyRepository,
} from '../../repository/entities';
import { createIfAbsent } from '../../repository/transactions';
import { recordAuditEvent, newCorrelationId } from '../../lib/audit';
import { assertGate, type GateKind } from '../gates';
import { checkGate } from '../gates';
import { addDays, addMonths } from '../format';
import { AMC_REMINDER_DAYS, WARRANTY_MONTHS } from '../config';
import { isOpenTask } from '../health';
import { getJob } from './installationService';
import { notify } from './notify';
import {
  applyEvent, customerToken, isAssignee, listOrderTasks, MvpError, nowOf, type MvpActor, type MvpCtx,
} from './orderService';
import { requireText } from '../validate';

async function audit(ctx: MvpCtx, actor: MvpActor, action: string, entityType: string, entityId: string, orderId: string | undefined, before: unknown, after: unknown, reason?: string) {
  await recordAuditEvent(ctx, {
    actorId: actor.userId, actorRole: actor.role, action, entityType, entityId, projectId: orderId,
    before, after, reason, source: 'ui', correlationId: newCorrelationId(),
  });
}

function requireAdmin(actor: MvpActor, what: string) {
  if (actor.role !== 'admin') throw new MvpError('forbidden', `Only the Admin can ${what}.`);
}

async function openTaskOf(ctx: MvpCtx, orderId: string, type: Task['type']): Promise<Task | undefined> {
  return (await listOrderTasks(ctx, orderId)).find(t => t.type === type && isOpenTask(t));
}

// ---------------------------------------------------------------------------
// QC decision (spec §19, D-08)
// ---------------------------------------------------------------------------

/** A short, fixed checklist (no large catalog, D-27/D-08 spirit). Mechanical + electrical + a test run. */
export const QC_TEST_ITEMS = [
  { key: 'mechanical', label: 'Mechanical systems OK' },
  { key: 'electrical', label: 'Electrical systems OK' },
  { key: 'safety', label: 'Safety systems OK' },
  { key: 'testRun', label: 'Test run OK' },
] as const;

export type QcTestKey = typeof QC_TEST_ITEMS[number]['key'];

export async function getQcInspection(ctx: MvpCtx, orderId: string, taskId: string) {
  return qcInspectionRepository(ctx).get(`qci_${taskId}`);
}

/**
 * PASS → HANDOVER + COLLECT_FINAL_PAYMENT + STATUTORY_LICENCE (project.qcPassedAt set → 95%).
 * REWORK → a Snag + REWORK task for the technician, with the remarks carried onto its notes.
 * FAIL → the order goes ON_HOLD with a REVIEW_HOLD task (D-08).
 */
export async function submitQcDecision(
  ctx: MvpCtx, actor: MvpActor, orderId: string,
  input: { decision: 'PASS' | 'REWORK' | 'FAIL'; tests?: Partial<Record<QcTestKey, boolean>>; remarks: string; technicianId?: string; documentIds?: string[] },
): Promise<void> {
  const task = await openTaskOf(ctx, orderId, 'QC_INSPECTION');
  if (!task) throw new MvpError('invalid', 'There is no open QC inspection for this order.');
  if (actor.role !== 'admin' && !isAssignee(task, actor)) throw new MvpError('forbidden', 'This inspection is assigned to someone else.');
  const remarks = requireText(input.remarks, 'Remarks');
  const now = nowOf(ctx);
  const job = await getJob(ctx, orderId);
  const reworkTechId = input.decision === 'REWORK' ? (input.technicianId || job?.technicianId) : undefined;

  const inspection = {
    id: `qci_${task.id}`,
    projectId: orderId,
    installationJobId: job?.id ?? `job_${orderId}`,
    inspectorId: actor.userId,
    result: input.decision === 'PASS' ? 'pass' : 'fail',
    discipline: 'general',
    inspectedAt: now.toISOString(),
    decision: input.decision,
    tests: input.tests ?? {},
    remarks,
    documentIds: input.documentIds ?? [],
  } as const;
  await qcInspectionRepository(ctx).create(JSON.parse(JSON.stringify(inspection)) as any);
  await audit(ctx, actor, 'QC_DECISION_RECORDED', 'QCInspection', inspection.id, orderId, undefined, { decision: input.decision, remarks });

  await applyEvent(
    ctx, actor, orderId, { type: 'QC_DECISION', decision: input.decision, technicianId: reworkTechId, remarks },
    { reason: remarks, orderPatch: input.decision === 'PASS' ? { qcPassedAt: now.toISOString() } : {} },
  );

  if (input.decision === 'REWORK') {
    const snag = {
      id: `snag_${inspection.id}`, projectId: orderId, qcInspectionId: inspection.id, status: reworkTechId ? 'assigned' : 'open',
      description: remarks, assignedTo: reworkTechId, reworkCount: 1,
    };
    await snagRepository(ctx).create(JSON.parse(JSON.stringify(snag)) as any);
    await audit(ctx, actor, 'SNAG_CREATED', 'Snag', snag.id, orderId, undefined, { qcInspectionId: inspection.id, assignedTo: reworkTechId ?? null });
  }
  if (input.decision === 'PASS') {
    const order = await projectRepository(ctx).get(orderId);
    if (order) await notify(ctx, customerToken(order.customerId), 'mvp_handover_ready', orderId, `handover:${orderId}`);
  }
}

// ---------------------------------------------------------------------------
// Handover (spec §20, D-26, D-29)
// ---------------------------------------------------------------------------

const HANDOVER_GATES: GateKind[] = ['HANDOVER_FINAL_PAYMENT', 'HANDOVER_LICENCE'];

export async function getHandover(ctx: MvpCtx, orderId: string) {
  return handoverRepository(ctx).get(`handover_${orderId}`);
}
export async function getWarranty(ctx: MvpCtx, orderId: string) {
  return warrantyRepository(ctx).get(`warranty_${orderId}`);
}
export async function getAmc(ctx: MvpCtx, orderId: string) {
  return amcRepository(ctx).get(`amc_${orderId}`);
}

/** Which handover gates are still closed, with their D-08 messages (for the UI's override prompt). */
export async function checkHandoverGates(ctx: MvpCtx, orderId: string) {
  return Promise.all(HANDOVER_GATES.map(gate => checkGate(ctx, orderId, gate).then(r => ({ gate, ...r }))));
}

/**
 * Admin-only. Refused (D-29) until the final payment is in and the lift licence is DONE,
 * unless the Admin has overridden either gate (audited, src/mvp/gates.ts). Creates the
 * Warranty and the AMC record (status WARRANTY) and the AMC_FOLLOW_UP task (D-08).
 */
export async function completeHandover(
  ctx: MvpCtx, actor: MvpActor, orderId: string,
  input: { customerConfirmedName: string; finalTestConfirmed: boolean; documentIds?: string[] },
): Promise<void> {
  requireAdmin(actor, 'complete the handover');
  const task = await openTaskOf(ctx, orderId, 'HANDOVER');
  if (!task) throw new MvpError('invalid', 'There is no open handover for this order.');
  const customerConfirmedName = requireText(input.customerConfirmedName, "The customer's name");
  if (!input.finalTestConfirmed) throw new MvpError('invalid', 'Confirm the final test run with the customer first.');
  for (const gate of HANDOVER_GATES) await assertGate(ctx, orderId, gate);

  const now = nowOf(ctx);
  const warrantyEnd = addMonths(now, WARRANTY_MONTHS).toISOString();
  const handoverId = `handover_${orderId}`;
  const handover = {
    id: handoverId, projectId: orderId, qcPassed: true, status: 'certificate_issued' as const,
    customerAcceptedAt: now.toISOString(), customerConfirmedBy: actor.userId, customerConfirmedName,
    customerConfirmedDevice: 'admin', completedAt: now.toISOString(), completedBy: actor.userId,
    finalTestConfirmed: true, documentIds: input.documentIds ?? [], version: 0,
  };
  await createIfAbsent(ctx, 'handovers', handover as any);
  await audit(ctx, actor, 'HANDOVER_RECORDED', 'Handover', handoverId, orderId, undefined, { customerConfirmedName });

  await applyEvent(ctx, actor, orderId, { type: 'HANDOVER_COMPLETED', warrantyEnd }, { reason: 'Handover completed with the customer' });

  const warrantyId = `warranty_${orderId}`;
  await createIfAbsent(ctx, 'warranties', { id: warrantyId, projectId: orderId, handoverId, startDate: now.toISOString(), endDate: warrantyEnd } as any);
  await audit(ctx, actor, 'WARRANTY_CREATED', 'Warranty', warrantyId, orderId, undefined, { startDate: now.toISOString(), endDate: warrantyEnd });

  const amcId = `amc_${orderId}`;
  const reminderDate = addDays(new Date(warrantyEnd), -AMC_REMINDER_DAYS).toISOString();
  await createIfAbsent(ctx, 'amcs', {
    id: amcId, projectId: orderId, status: 'active' as AMCStatus, startDate: now.toISOString(), endDate: warrantyEnd,
    mvpAmcStatus: 'WARRANTY' as MvpAmcStatus, warrantyEnd, reminderDate, version: 0,
  } as any);
  await audit(ctx, actor, 'AMC_CREATED', 'AMC', amcId, orderId, undefined, { mvpAmcStatus: 'WARRANTY', warrantyEnd });
}

// ---------------------------------------------------------------------------
// Compliance records (spec, D-27 ⚖ VERIFY — the software records, it does not guarantee)
// ---------------------------------------------------------------------------

export const COMPLIANCE_TYPES: { key: ComplianceType; label: string }[] = [
  { key: 'LIFT_LICENSE', label: 'Lift licence' },
  { key: 'STATUTORY_INSPECTION', label: 'Statutory inspection' },
  { key: 'CONTRACTOR_RESPONSIBILITY', label: 'Contractor responsibility' },
  { key: 'INSURANCE', label: 'Insurance' },
  { key: 'GST_INVOICE', label: 'GST invoice' },
  { key: 'TDS', label: 'TDS' },
  { key: 'CUSTOMER_AGREEMENT', label: 'Customer agreement' },
  { key: 'PARTNER_AGREEMENT', label: 'Partner agreement' },
];

export async function listComplianceItems(ctx: MvpCtx, orderId: string): Promise<ComplianceItem[]> {
  return complianceItemRepository(ctx).query({ orderId } as Partial<ComplianceItem>);
}

/**
 * Admin-only. Marking LIFT_LICENSE DONE with a document completes the STATUTORY_LICENCE
 * task if one is still open (D-29) — otherwise this is just a record, with no side effect.
 */
export async function setComplianceItem(
  ctx: MvpCtx, actor: MvpActor, orderId: string, type: ComplianceType,
  input: { status: ComplianceItem['status']; documentId?: string; note?: string },
): Promise<void> {
  requireAdmin(actor, 'manage compliance records');
  const id = `${orderId}_${type}`;
  const repo = complianceItemRepository(ctx);
  const existing = await repo.get(id);
  const now = nowOf(ctx).toISOString();
  const before = existing ? { status: existing.status, documentId: existing.documentId ?? null } : null;
  const patch = { orderId, type, status: input.status, documentId: input.documentId, note: input.note, updatedBy: actor.userId, updatedAt: now };
  if (existing) await repo.update(id, patch as any, existing.version ?? 0);
  else await createIfAbsent(ctx, 'compliance_items', { id, ...patch, version: 0 } as any);
  await audit(ctx, actor, 'COMPLIANCE_ITEM_UPDATED', 'ComplianceItem', id, orderId, before, { status: input.status, documentId: input.documentId ?? null }, input.note);

  if (type === 'LIFT_LICENSE' && input.status === 'DONE' && input.documentId) {
    const openLicence = await openTaskOf(ctx, orderId, 'STATUTORY_LICENCE');
    if (openLicence) await applyEvent(ctx, actor, orderId, { type: 'LICENCE_DONE' }, { reason: 'Lift licence document attached' });
  }
}

// ---------------------------------------------------------------------------
// AMC (D-26). AMC_DUE is computed, never stored.
// ---------------------------------------------------------------------------

export type AmcDisplayStatus = 'NONE' | MvpAmcStatus | 'AMC_DUE';

/** Pure: the label the UI shows, derived from the stored status and the warranty end date. */
export function amcDisplayStatus(amc: Pick<AMC, 'mvpAmcStatus' | 'warrantyEnd'> | null | undefined, now: Date): AmcDisplayStatus {
  if (!amc) return 'NONE';
  const stored = amc.mvpAmcStatus ?? 'WARRANTY';
  if (stored === 'WARRANTY' && amc.warrantyEnd && now.getTime() >= new Date(amc.warrantyEnd).getTime() - AMC_REMINDER_DAYS * 86_400_000) {
    return 'AMC_DUE';
  }
  return stored;
}

export async function setAmcStatus(ctx: MvpCtx, actor: MvpActor, orderId: string, status: Exclude<MvpAmcStatus, 'WARRANTY'>, note?: string): Promise<void> {
  requireAdmin(actor, 'manage the AMC');
  const id = `amc_${orderId}`;
  const amc = await amcRepository(ctx).get(id);
  if (!amc) throw new MvpError('not_found', 'There is no AMC record yet — complete the handover first.');
  await amcRepository(ctx).update(id, { mvpAmcStatus: status } as any, amc.version ?? 0);
  await audit(ctx, actor, 'AMC_STATUS_CHANGED', 'AMC', id, orderId, { status: amc.mvpAmcStatus ?? 'WARRANTY' }, { status }, note);
}

export async function recordAmcService(ctx: MvpCtx, actor: MvpActor, orderId: string, input: { lastServiceDate?: string; nextServiceDate?: string }): Promise<void> {
  requireAdmin(actor, 'record AMC service visits');
  const id = `amc_${orderId}`;
  const amc = await amcRepository(ctx).get(id);
  if (!amc) throw new MvpError('not_found', 'There is no AMC record yet — complete the handover first.');
  await amcRepository(ctx).update(id, { ...input } as any, amc.version ?? 0);
  await audit(ctx, actor, 'AMC_SERVICE_RECORDED', 'AMC', id, orderId, { lastServiceDate: amc.lastServiceDate ?? null, nextServiceDate: amc.nextServiceDate ?? null }, input);
}
