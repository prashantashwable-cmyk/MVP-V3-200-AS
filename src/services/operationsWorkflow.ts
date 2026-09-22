/**
 * Operations workflow service — Phase 09 (Delivery, Installation, QC,
 * Handover). Same architecture as Phase 08's commercialWorkflow.ts:
 * permission-checked (Phase 05), persisted via the repository layer
 * (Phase 04), audited (Phase 06), event-driven via the Phase 07 bus
 * where a real handler exists. Screen rewiring deferred to Phase 10 —
 * see docs/architecture/09-operations-workflows.md for why, same
 * reasoning as Phase 08.
 *
 * Two hard gates this phase enforces IN CODE, not just by convention,
 * per Phase 09's explicit acceptance criteria:
 *
 *   1. "A technician cannot bypass required job-entry controls" —
 *      `checkIn()` throws unless `siteReadinessConfirmed === true`;
 *      `completeInstallation()` throws unless the job actually has a
 *      `checkedInAt` AND has reached the evidence-captured status.
 *   2. "A failed QC cannot accidentally reach handover" /
 *      "customer acceptance is recorded before final handover
 *      completion" — `confirmCompliance()` throws unless
 *      `Handover.qcPassed === true` (itself settable only by the
 *      QC_PASSED event handler, Phase 07 — see that file's comment);
 *      `issueCertificate()` throws unless `Handover.customerAcceptedAt`
 *      is actually set.
 */

import { assertPermission } from '../lib/authz';
import { publishEvent, makeEvent } from '../events';
import { recordAuditEvent, newCorrelationId } from '../lib/audit';
import type { RepositoryContext } from '../repository/types';
import {
  shipmentRepository, deliveryReceiptRepository, installationJobRepository,
  qcInspectionRepository, snagRepository, handoverRepository, projectRepository,
} from '../repository/entities';
import { asId } from '../domain/ids';
import type {
  ShipmentId, DeliveryReceiptId, InstallationJobId, QCInspectionId, SnagId,
  ProjectId, PurchaseOrderId, UserId,
} from '../domain/ids';
import type { Shipment, DeliveryReceipt, InstallationJob, QCInspection, Handover, CanonicalUserRole } from '../domain/entities';

type Actor = { userId: string; role: CanonicalUserRole; isDemo?: boolean; authMethod?: string };
const asUser = (a: Actor) => ({ role: a.role, isDemo: a.isDemo, authMethod: a.authMethod as any });

// ---------------------------------------------------------------------------
// Delivery: Schedule -> Dispatch -> Arrived -> Receipt (+ incident path)
// ---------------------------------------------------------------------------

export async function scheduleDelivery(ctx: RepositoryContext, poId: string, projectId: string): Promise<Shipment> {
  const shipment: Shipment = {
    id: asId<ShipmentId>(`ship_${poId}`),
    projectId: projectId as ProjectId,
    purchaseOrderId: poId as PurchaseOrderId,
    status: 'scheduled',
  };
  await shipmentRepository(ctx).create(shipment);
  return shipment;
}

export async function markShipmentArrived(ctx: RepositoryContext, shipmentId: string): Promise<Shipment> {
  return (await shipmentRepository(ctx).update(shipmentId, { status: 'arrived', arrivedAt: new Date().toISOString() } as any)) as Shipment;
}

export type ReceiptCondition = 'ok' | 'damaged' | 'missing_items';

/** "If damaged/missing: Receipt -> Incident -> Supplier Resolution" —
 * the incident path is recorded as an audited exception on the
 * DeliveryReceipt itself (`status !== 'ok'`) rather than inventing a
 * separate Incident entity the domain model (Phase 02) does not define;
 * `DeliveryReceipt.incidentId` is populated so a future supplier-
 * resolution workflow has a stable anchor to attach to. */
export async function recordMaterialReceipt(
  ctx: RepositoryContext,
  actor: Actor,
  shipmentId: string,
  projectId: string,
  condition: ReceiptCondition,
): Promise<DeliveryReceipt> {
  assertPermission(asUser(actor), 'job.execute');
  const status: DeliveryReceipt['status'] = condition === 'ok' ? 'ok' : condition;
  const receiptId = asId<DeliveryReceiptId>(`receipt_${shipmentId}`);
  const receipt: DeliveryReceipt = {
    id: receiptId,
    projectId: projectId as ProjectId,
    shipmentId: shipmentId as ShipmentId,
    status,
    receivedBy: actor.userId as UserId,
    receivedAt: new Date().toISOString(),
    incidentId: status !== 'ok' ? `incident_${receiptId}` : undefined,
  };
  await deliveryReceiptRepository(ctx).create(receipt);

  if (status === 'ok') {
    await publishEvent(ctx, makeEvent({
      id: `material_received_${shipmentId}`, type: 'MATERIAL_RECEIVED', entityType: 'DeliveryReceipt', entityId: receiptId,
      projectId, payload: {},
    }));
  } else {
    await recordAuditEvent(ctx, {
      actorId: actor.userId, actorRole: actor.role, action: 'DELIVERY_INCIDENT_REPORTED',
      entityType: 'DeliveryReceipt', entityId: receiptId, projectId,
      reason: `Material received in "${condition}" condition — requires supplier resolution before proceeding.`,
      source: 'ui', correlationId: newCorrelationId(),
    });
  }
  return receipt;
}

// ---------------------------------------------------------------------------
// Installation: Assigned -> Site Readiness -> Check-in -> ... -> Completion
// -> QC Request
// ---------------------------------------------------------------------------

export async function assignInstallationJob(ctx: RepositoryContext, actor: Actor, projectId: string, technicianId: string): Promise<InstallationJob> {
  assertPermission(asUser(actor), 'project.update');
  const job: InstallationJob = {
    id: asId<InstallationJobId>(`job_${projectId}`),
    projectId: projectId as ProjectId,
    technicianId: technicianId as UserId,
    status: 'assigned',
  };
  await installationJobRepository(ctx).create(job);
  return job;
}

export async function confirmSiteReadiness(ctx: RepositoryContext, actor: Actor, jobId: string, confirmed: boolean): Promise<InstallationJob> {
  assertPermission(asUser(actor), 'job.execute');
  return (await installationJobRepository(ctx).update(jobId, {
    siteReadinessConfirmed: confirmed,
    status: confirmed ? 'site_readiness_pending' : 'site_readiness_pending',
  } as any)) as InstallationJob;
}

/** Hard gate #1: cannot check in without confirmed site readiness. */
export async function checkIn(ctx: RepositoryContext, actor: Actor, jobId: string): Promise<InstallationJob> {
  assertPermission(asUser(actor), 'job.execute');
  const job = await installationJobRepository(ctx).get(jobId);
  if (!job) throw new Error(`InstallationJob ${jobId} not found`);
  if (!job.siteReadinessConfirmed) {
    throw new Error('Cannot check in: site readiness has not been confirmed. This is a hard gate (Phase 09) — not bypassable from this function.');
  }
  const updated = await installationJobRepository(ctx).update(jobId, {
    status: 'checked_in', checkedInAt: new Date().toISOString(),
  } as any) as InstallationJob;
  await publishEvent(ctx, makeEvent({
    id: `installation_started_${jobId}`, type: 'INSTALLATION_STARTED', entityType: 'InstallationJob', entityId: jobId,
    projectId: job.projectId, payload: {},
  }));
  return updated;
}

export async function progressToEvidenceCapture(ctx: RepositoryContext, actor: Actor, jobId: string, evidenceCount: number): Promise<InstallationJob> {
  assertPermission(asUser(actor), 'job.execute');
  const job = await installationJobRepository(ctx).get(jobId);
  if (!job) throw new Error(`InstallationJob ${jobId} not found`);
  if (job.status !== 'checked_in' && job.status !== 'in_progress') {
    throw new Error(`Cannot capture evidence from status "${job.status}" — must be checked in first.`);
  }
  if (evidenceCount < 1) {
    throw new Error('At least one piece of evidence (photo/video) is required.');
  }
  return (await installationJobRepository(ctx).update(jobId, { status: 'evidence_pending' } as any)) as InstallationJob;
}

/** Hard gate #2: cannot complete without a real check-in timestamp AND
 * having passed through evidence capture. */
export async function completeInstallation(ctx: RepositoryContext, actor: Actor, jobId: string): Promise<InstallationJob> {
  assertPermission(asUser(actor), 'job.execute');
  const job = await installationJobRepository(ctx).get(jobId);
  if (!job) throw new Error(`InstallationJob ${jobId} not found`);
  if (!job.checkedInAt) {
    throw new Error('Cannot complete installation: no check-in was ever recorded. This is a hard gate (Phase 09).');
  }
  if (job.status !== 'evidence_pending') {
    throw new Error(`Cannot complete installation from status "${job.status}" — evidence must be captured first.`);
  }
  const updated = await installationJobRepository(ctx).update(jobId, {
    status: 'completed', completedAt: new Date().toISOString(),
  } as any) as InstallationJob;
  await publishEvent(ctx, makeEvent({
    id: `installation_completed_${jobId}`, type: 'INSTALLATION_COMPLETED', entityType: 'InstallationJob', entityId: jobId,
    projectId: job.projectId, payload: {},
  }));
  return updated;
}

export async function requestQC(ctx: RepositoryContext, actor: Actor, jobId: string, inspectorId: string): Promise<QCInspection> {
  const job = await installationJobRepository(ctx).get(jobId);
  if (!job) throw new Error(`InstallationJob ${jobId} not found`);
  if (job.status !== 'completed') {
    throw new Error(`Cannot request QC: installation is not yet completed (status "${job.status}").`);
  }
  await installationJobRepository(ctx).update(jobId, { status: 'qc_requested' } as any);
  const inspection: QCInspection = {
    id: asId<QCInspectionId>(`qc_${jobId}`),
    projectId: job.projectId,
    installationJobId: job.id,
    inspectorId: inspectorId as UserId,
    result: 'pending',
  };
  await qcInspectionRepository(ctx).create(inspection);
  return inspection;
}

// ---------------------------------------------------------------------------
// QC: Inspection -> Pass OR Snag -> Rework -> Re-inspection (open loop)
// ---------------------------------------------------------------------------

export async function recordQCResult(
  ctx: RepositoryContext,
  actor: Actor,
  qcInspectionId: string,
  result: 'pass' | 'fail',
  opts: { discipline?: QCInspection['discipline']; defectDescription?: string; technicianId?: string },
): Promise<QCInspection> {
  assertPermission(asUser(actor), 'qc.approve');
  const inspection = await qcInspectionRepository(ctx).get(qcInspectionId);
  if (!inspection) throw new Error(`QCInspection ${qcInspectionId} not found`);

  const updated = await qcInspectionRepository(ctx).update(qcInspectionId, {
    result, discipline: opts.discipline ?? 'general', inspectedAt: new Date().toISOString(),
  } as any) as QCInspection;

  if (result === 'fail') {
    await publishEvent(ctx, makeEvent({
      id: `qc_failed_${qcInspectionId}_${Date.now()}`,
      type: 'QC_FAILED', entityType: 'QCInspection', entityId: qcInspectionId, projectId: inspection.projectId,
      payload: { qcInspectionId, technicianId: opts.technicianId ?? 'unknown', defectDescription: opts.defectDescription ?? 'Unspecified defect' },
    }));
  } else {
    await publishEvent(ctx, makeEvent({
      id: `qc_passed_${qcInspectionId}_${Date.now()}`,
      type: 'QC_PASSED', entityType: 'QCInspection', entityId: qcInspectionId, projectId: inspection.projectId,
      payload: { qcInspectionId },
    }));
  }
  return updated;
}

/** Rework -> Re-inspection: an explicitly open-ended loop (Phase 03/09 —
 * "controlled loops," not a fixed retry count). Completing rework simply
 * flips the Snag back to `reinspection_pending` and returns its
 * `qcInspectionId` so the caller re-runs `recordQCResult` — which may
 * fail again, looping indefinitely, exactly as designed. */
export async function completeRework(ctx: RepositoryContext, actor: Actor, snagId: string): Promise<{ snagId: string; qcInspectionId: string }> {
  assertPermission(asUser(actor), 'job.execute');
  const snag = await snagRepository(ctx).get(snagId);
  if (!snag) throw new Error(`Snag ${snagId} not found`);
  await snagRepository(ctx).update(snagId, {
    status: 'reinspection_pending', reworkCount: (snag.reworkCount ?? 0) + 1,
  } as any);
  // Reset the linked inspection back to pending for re-inspection.
  await qcInspectionRepository(ctx).update(snag.qcInspectionId, { result: 'pending' } as any);
  return { snagId, qcInspectionId: snag.qcInspectionId };
}

// ---------------------------------------------------------------------------
// Handover: Compliance -> Final Checklist -> Walkthrough -> Acceptance ->
// Certificate -> Warranty/AMC
// ---------------------------------------------------------------------------

export async function confirmCompliance(ctx: RepositoryContext, actor: Actor, projectId: string): Promise<Handover> {
  assertPermission(asUser(actor), 'handover.approve');
  const handoverId = `handover_${projectId}`;
  const handover = await handoverRepository(ctx).get(handoverId as any);
  if (!handover || !handover.qcPassed) {
    throw new Error('Cannot confirm compliance: QC has not passed for this project. This is a hard gate (Phase 09) — handover cannot proceed without a real QC pass.');
  }
  return (await handoverRepository(ctx).update(handoverId, { status: 'checklist_pending' } as any)) as Handover;
}

export async function completeFinalChecklist(ctx: RepositoryContext, actor: Actor, projectId: string): Promise<Handover> {
  assertPermission(asUser(actor), 'handover.approve');
  const handoverId = `handover_${projectId}`;
  return (await handoverRepository(ctx).update(handoverId, { status: 'walkthrough_pending' } as any)) as Handover;
}

export async function recordCustomerAcceptance(ctx: RepositoryContext, actor: Actor, projectId: string): Promise<Handover> {
  if (actor.role !== 'customer' && actor.role !== 'admin') {
    throw new Error(`Role "${actor.role}" cannot record customer acceptance — only the customer (or an admin recording it on their behalf) may.`);
  }
  const handoverId = `handover_${projectId}`;
  return (await handoverRepository(ctx).update(handoverId, {
    status: 'customer_accepted', customerAcceptedAt: new Date().toISOString(),
  } as any)) as Handover;
}

/** Hard gate: customer acceptance must be recorded before the certificate
 * can be issued. */
export async function issueCertificate(ctx: RepositoryContext, actor: Actor, projectId: string, warrantyMonths = 12): Promise<Handover> {
  assertPermission(asUser(actor), 'handover.approve');
  const handoverId = `handover_${projectId}`;
  const handover = await handoverRepository(ctx).get(handoverId as any);
  if (!handover || !handover.customerAcceptedAt) {
    throw new Error('Cannot issue handover certificate: customer acceptance has not been recorded. This is a hard gate (Phase 09).');
  }
  const updated = await handoverRepository(ctx).update(handoverId, { status: 'certificate_issued' } as any) as Handover;

  await publishEvent(ctx, makeEvent({
    id: `handover_completed_${projectId}`, type: 'HANDOVER_COMPLETED', entityType: 'Handover', entityId: handoverId,
    projectId, payload: { handoverId, warrantyMonths },
  }));

  await projectRepository(ctx).update(projectId, { stage: 'warranty_amc' } as any);
  return updated;
}
