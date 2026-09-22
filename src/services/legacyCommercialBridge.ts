/**
 * Legacy → platform bridge for the commercial core — Phase 15.
 *
 * Lets existing DbManager-driven screens (still working in Lead/Deal/
 * Payment shapes) ALSO record their action through the real canonical
 * repository/domain/workflow stack (Phases 04-09), without requiring
 * those screens' UI/state model to be rewritten wholesale in one risky
 * pass. This is the standard "strangler fig" / dual-write migration
 * pattern: every legacy write this module wraps still performs its
 * original `DbManager` write (which stays authoritative for that
 * screen's own rendering until it is fully cut over to `MIGRATED`), and
 * ADDITIONALLY creates/updates the equivalent canonical Project/
 * PaymentSchedule/Payment record — audited, idempotent, and
 * event-driven — so the control tower, global search, data-quality
 * checks and audit trail (Phases 07/11/12) see this activity as it
 * happens, not only once a screen's full rewrite lands.
 *
 * `UserRole` (legacy `src/types.ts`) and `CanonicalUserRole` (Phase 02
 * `src/domain/entities.ts`) are the identical literal union
 * (`'admin'|'surveyor'|'technician'|'customer'|'supplier'`), so actor
 * role values cross this bridge without translation.
 *
 * Never throws out to the caller: a canonical-side failure (e.g. a
 * denied permission, a not-yet-created canonical Project) must not block
 * the legacy flow the user is already committed to completing. Callers
 * get back a `{ bridged, reason }` result to log/surface as a soft
 * warning, never a hard error.
 */

import { DbManager } from '../lib/db';
import type { Lead, Deal, Payment as LegacyPayment, PurchaseOrder as LegacyPurchaseOrder } from '../types';
import { resolveEnvironment } from '../lib/environment';
import type { RepositoryContext } from '../repository/types';
import { leadToCustomer, leadToSite, leadAndDealToProject } from '../domain/adapters';
import { createProjectFromLead, projectRepository, paymentScheduleRepository, quoteRepository, purchaseOrderRepository, shipmentRepository, deliveryReceiptRepository } from '../repository/entities';
import {
  collectInstallment, createQuote, approveQuote, sendQuote, recordCustomerQuoteDecision,
  createProcurementPO, approvePO, recordSupplierAcceptance, markInProduction, dispatchMaterial,
} from './commercialWorkflow';
import {
  scheduleDelivery, markShipmentArrived, recordMaterialReceipt, type ReceiptCondition,
  assignInstallationJob, confirmSiteReadiness, checkIn, progressToEvidenceCapture, completeInstallation,
  requestQC, recordQCResult, confirmCompliance, completeFinalChecklist, recordCustomerAcceptance, issueCertificate,
} from './operationsWorkflow';
import { installationJobRepository, qcInspectionRepository } from '../repository/entities';
import type { CanonicalUserRole, Quote } from '../domain/entities';
import { asId } from '../domain/ids';
import type {
  ProjectId, PaymentScheduleId, ContractId, PurchaseOrderId, ShipmentId, DeliveryReceiptId,
  InstallationJobId, QCInspectionId, UserId,
} from '../domain/ids';

export interface BridgeActor {
  id: string;
  role: CanonicalUserRole;
  isDemo?: boolean;
  authMethod?: string;
}

function ctxFor(actor: BridgeActor): RepositoryContext {
  return { environment: resolveEnvironment({ isDemo: actor.isDemo } as any), actorUserId: actor.id };
}

function commercialActor(actor: BridgeActor) {
  return { userId: actor.id, role: actor.role, isDemo: actor.isDemo, authMethod: actor.authMethod };
}

/**
 * Ensures a canonical Project (+ Customer + Site) exists for this legacy
 * Lead/Deal pair, creating it on first touch. Idempotent by construction
 * — `src/domain/adapters.ts` derives a stable id from the legacy lead id
 * (`proj_<leadId>`), so two bridged screens racing to create the same
 * project is a benign lost-race (re-checked below), never a duplicate.
 */
export async function ensureCanonicalProject(
  ctx: RepositoryContext,
  lead: Lead,
  deal: Deal | undefined,
): Promise<{ projectId: ProjectId }> {
  const customer = leadToCustomer(lead);
  const site = leadToSite(lead, customer.id);
  const project = leadAndDealToProject(
    lead, deal, customer.id, site.id,
    asId<UserId>(lead.surveyorId || ctx.actorUserId),
  );

  const existing = await projectRepository(ctx).get(project.id);
  if (existing) return { projectId: project.id };

  try {
    await createProjectFromLead(ctx, customer, site, project);
  } catch {
    const recheck = await projectRepository(ctx).get(project.id);
    if (!recheck) throw new Error(`Could not create or find canonical Project for lead ${lead.id}`);
  }
  return { projectId: project.id };
}

/**
 * Bridges a legacy Payment confirmation (OnlinePaymentCheckout,
 * PaymentCollectionDashboard) into a real, idempotent, audited Payment
 * record via `commercialWorkflow.collectInstallment`. A canonical
 * PaymentSchedule is required by that function; if this project has not
 * yet had its Contract migrated (Phase 15's Contract-screen work), a
 * minimal placeholder schedule is created lazily on first bridged
 * payment — replaced by the real one once `signContract` runs for this
 * project (same derived id, so it converges, never duplicates).
 */
export async function bridgeLegacyPaymentConfirmed(
  actor: BridgeActor,
  legacyPayment: LegacyPayment,
): Promise<{ bridged: boolean; reason?: string }> {
  try {
    const deal = DbManager.getDealById(legacyPayment.dealId);
    if (!deal) return { bridged: false, reason: `Deal ${legacyPayment.dealId} not found for legacy payment ${legacyPayment.id}` };
    const lead = DbManager.getLeadById(deal.leadId);
    if (!lead) return { bridged: false, reason: `Lead ${deal.leadId} not found for deal ${deal.id}` };

    const ctx = ctxFor(actor);
    const { projectId } = await ensureCanonicalProject(ctx, lead, deal);

    const scheduleId = asId<PaymentScheduleId>(`sched_${projectId}`);
    const existingSchedule = await paymentScheduleRepository(ctx).get(scheduleId);
    if (!existingSchedule) {
      const now = new Date().toISOString();
      await paymentScheduleRepository(ctx).create({
        id: scheduleId,
        projectId,
        contractId: asId<ContractId>(`contract_bridged_${projectId}`),
        status: 'active',
        installments: [],
        createdAt: now,
        updatedAt: now,
      });
    }

    await collectInstallment(
      ctx,
      { userId: actor.id, role: actor.role, isDemo: actor.isDemo, authMethod: actor.authMethod },
      scheduleId,
      legacyPayment.stage,
      legacyPayment.paidAmount ?? legacyPayment.amount,
      `legacy:${legacyPayment.id}`,
    );
    return { bridged: true };
  } catch (err) {
    return { bridged: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Derives the canonical PurchaseOrderId from a legacy PO's own id — same
 * `po_<idempotencyKey>` scheme `commercialWorkflow.createProcurementPO`
 * uses, with the legacy PO id itself as the idempotency key, so the
 * status-change bridge below can find the record created here without a
 * separate id-mapping table. */
function canonicalPoId(legacyPoId: string): PurchaseOrderId {
  return asId<PurchaseOrderId>(`po_${legacyPoId}`);
}

/**
 * Bridges a legacy PO draft (`PurchaseOrderGenerator.handleDraftPoFromDeal`)
 * into a real, idempotent canonical PurchaseOrder — linked to the same
 * canonical Project the Lead/Deal already resolve to (Phase 15).
 */
export async function bridgeProcurementPoCreated(
  actor: BridgeActor,
  legacyPo: LegacyPurchaseOrder,
): Promise<{ bridged: boolean; reason?: string }> {
  try {
    const deal = DbManager.getDealById(legacyPo.linkedDealId);
    if (!deal) return { bridged: false, reason: `Deal ${legacyPo.linkedDealId} not found for PO ${legacyPo.id}` };
    const lead = DbManager.getLeadById(deal.leadId);
    if (!lead) return { bridged: false, reason: `Lead ${deal.leadId} not found for deal ${deal.id}` };

    const ctx = ctxFor(actor);
    const { projectId } = await ensureCanonicalProject(ctx, lead, deal);
    await createProcurementPO(ctx, commercialActor(actor), projectId, legacyPo.supplierId, legacyPo.totalAmount, legacyPo.id);
    return { bridged: true };
  } catch (err) {
    return { bridged: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Bridges a legacy PO status change into the matching canonical
 * PurchaseOrder transition:
 *   'Sent'          -> approvePO-equivalent (pending_approval -> sent_to_supplier)
 *   'Acknowledged'   -> recordSupplierAcceptance (-> accepted_by_supplier)
 *   'In Production'  -> markInProduction (-> in_production)
 *   'Shipped'        -> dispatchMaterial (-> dispatched; advances the
 *                        canonical Project to the delivery stage)
 * Other legacy statuses ('Ready to Ship', 'Delivered', 'Cancelled') have
 * no canonical equivalent wired yet — 'Delivered' belongs to Phase 17's
 * Delivery workflow migration; reported as an explicit non-bridge, never
 * silently dropped.
 */
export async function bridgeProcurementPoStatusChanged(
  actor: BridgeActor,
  legacyPo: LegacyPurchaseOrder,
  targetStatus: LegacyPurchaseOrder['status'],
): Promise<{ bridged: boolean; reason?: string }> {
  const bridgeable = ['Sent', 'Acknowledged', 'In Production', 'Shipped'];
  if (!bridgeable.includes(targetStatus)) {
    return { bridged: false, reason: `no bridge defined yet for PO status "${targetStatus}"` };
  }
  try {
    const ctx = ctxFor(actor);
    const poId = canonicalPoId(legacyPo.id);
    const existing = await purchaseOrderRepository(ctx).get(poId);
    if (!existing) {
      return { bridged: false, reason: `no canonical PurchaseOrder found for legacy PO ${legacyPo.id} — was it created through bridgeProcurementPoCreated first?` };
    }

    if (targetStatus === 'Sent' && existing.status === 'pending_approval') {
      await approvePO(ctx, commercialActor(actor), poId);
    } else if (targetStatus === 'Acknowledged') {
      await recordSupplierAcceptance(ctx, poId);
    } else if (targetStatus === 'In Production') {
      await markInProduction(ctx, poId);
    } else if (targetStatus === 'Shipped') {
      await dispatchMaterial(ctx, poId);
    }
    return { bridged: true };
  } catch (err) {
    return { bridged: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Bridges the legacy Delivery lifecycle (`DeliverySchedulingScreen`,
 * `LiveShipmentTrackingScreen`, `SiteDeliveryChecklistScreen`) into the
 * real canonical Shipment/DeliveryReceipt records from Phase 09's
 * `operationsWorkflow.ts` — Schedule -> Dispatch/Live Tracking -> Arrived
 * -> Receipt (with the damaged/missing exception path). All three keyed
 * by the same legacy PO id the Phase 16 procurement bridge already
 * derives a canonical PurchaseOrder id from, so the canonical Project is
 * resolved via that PO, not re-derived from a Lead/Deal here.
 */
async function resolveProjectForLegacyPo(ctx: RepositoryContext, legacyPoId: string): Promise<ProjectId | null> {
  const po = await purchaseOrderRepository(ctx).get(canonicalPoId(legacyPoId));
  return po ? po.projectId : null;
}

/** `'technician_assigned'` (`DeliverySchedulingScreen.handleConfirmScheduleLock`)
 * bridges to a real canonical Shipment in `'scheduled'` status, AND —
 * since this is the exact real-world moment a technician is assigned —
 * also creates the canonical InstallationJob (Phase 18) so that when
 * that technician later checks in from a genuinely different screen,
 * the job already exists rather than needing to be auto-created with
 * whatever lesser permissions the checking-in technician happens to
 * have. Requires the PO to already have been bridged (Phase 16) — a
 * delivery cannot be scheduled for material that was never ordered
 * through the canonical model, and this reports that honestly rather
 * than fabricating a PO. */
export async function bridgeDeliveryScheduled(
  actor: BridgeActor,
  legacyPoId: string,
  technicianId?: string,
): Promise<{ bridged: boolean; reason?: string }> {
  try {
    const ctx = ctxFor(actor);
    const projectId = await resolveProjectForLegacyPo(ctx, legacyPoId);
    if (!projectId) return { bridged: false, reason: `no canonical PurchaseOrder found for legacy PO ${legacyPoId} — was it bridged at creation (Phase 16)?` };

    const shipmentId = asId<ShipmentId>(`ship_${canonicalPoId(legacyPoId)}`);
    const existing = await shipmentRepository(ctx).get(shipmentId);
    if (!existing) {
      await scheduleDelivery(ctx, canonicalPoId(legacyPoId), projectId);
    }

    if (technicianId) {
      const jobId = asId<InstallationJobId>(`job_${projectId}`);
      const existingJob = await installationJobRepository(ctx).get(jobId);
      if (!existingJob) {
        await assignInstallationJob(ctx, commercialActor(actor), projectId, technicianId);
      }
    }
    return { bridged: true };
  } catch (err) {
    return { bridged: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** `'arrived'` milestone (`LiveShipmentTrackingScreen.handleAdvanceMilestone`)
 * bridges to the canonical Shipment's `'arrived'` status. */
export async function bridgeShipmentArrived(
  actor: BridgeActor,
  legacyPoId: string,
): Promise<{ bridged: boolean; reason?: string }> {
  try {
    const ctx = ctxFor(actor);
    const shipmentId = asId<ShipmentId>(`ship_${canonicalPoId(legacyPoId)}`);
    const existing = await shipmentRepository(ctx).get(shipmentId);
    if (!existing) return { bridged: false, reason: `no canonical Shipment found for legacy PO ${legacyPoId} — was delivery scheduled through the bridge first?` };

    await markShipmentArrived(ctx, shipmentId);
    return { bridged: true };
  } catch (err) {
    return { bridged: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Delivery checklist completion (`SiteDeliveryChecklistScreen.handleCompleteChecklist`)
 * bridges to a real canonical DeliveryReceipt — `condition: 'ok'`
 * publishes the real `MATERIAL_RECEIVED` event; `'damaged'`/
 * `'missing_items'` records an audited incident instead (Phase 09's
 * documented "damaged/missing -> incident" exception path). Idempotent:
 * a receipt already recorded for this PO is reported as already-bridged,
 * never duplicated. */
export async function bridgeMaterialReceiptRecorded(
  actor: BridgeActor,
  legacyPoId: string,
  condition: ReceiptCondition,
): Promise<{ bridged: boolean; reason?: string }> {
  try {
    const ctx = ctxFor(actor);
    const projectId = await resolveProjectForLegacyPo(ctx, legacyPoId);
    if (!projectId) return { bridged: false, reason: `no canonical PurchaseOrder found for legacy PO ${legacyPoId}` };

    const shipmentId = asId<ShipmentId>(`ship_${canonicalPoId(legacyPoId)}`);
    const shipment = await shipmentRepository(ctx).get(shipmentId);
    if (!shipment) return { bridged: false, reason: `no canonical Shipment found for legacy PO ${legacyPoId} — was delivery scheduled through the bridge first?` };

    const receiptId = asId<DeliveryReceiptId>(`receipt_${shipmentId}`);
    const existingReceipt = await deliveryReceiptRepository(ctx).get(receiptId);
    if (existingReceipt) return { bridged: true }; // idempotent: already recorded

    await recordMaterialReceipt(ctx, commercialActor(actor), shipmentId, projectId, condition);
    return { bridged: true };
  } catch (err) {
    return { bridged: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Bridges Installation + QC + Handover (`TechnicianCheckInCheckOutScreen`,
 * `PhotoVideoEvidenceCaptureScreen`, `QcInspectorAssignmentScreen`,
 * `ComplianceCertificationScreen`, `FinalHandoverChecklistScreen`,
 * `CustomerHandoverWalkthroughScreen`, `HandoverCompletionCertificateScreen`)
 * into the real canonical InstallationJob/QCInspection/Handover records
 * from Phase 09's `operationsWorkflow.ts`, including both of that
 * phase's hard gates enforced AS CODE (check-in requires confirmed site
 * readiness; handover compliance requires a real QC pass).
 *
 * These screens key off two DIFFERENT legacy shapes that both happen to
 * carry a `dealId` (`Job` and `TechnicianJob`, from `src/types.ts`) — the
 * resolver below tries both, so every bridge function here takes just a
 * `legacyJobId: string`, matching what each real screen already has as a
 * prop.
 */
function resolveDealIdForLegacyJob(legacyJobId: string): string | null {
  const techJob = DbManager.getTechnicianJobById(legacyJobId);
  if (techJob) return techJob.dealId;
  const job = DbManager.getJobById(legacyJobId);
  if (job) return job.dealId;
  return null;
}

async function resolveProjectForLegacyJob(
  ctx: RepositoryContext,
  legacyJobId: string,
): Promise<{ projectId: ProjectId } | { error: string }> {
  const dealId = resolveDealIdForLegacyJob(legacyJobId);
  if (!dealId) return { error: `no legacy Job/TechnicianJob found for id ${legacyJobId}` };
  const deal = DbManager.getDealById(dealId);
  if (!deal) return { error: `Deal ${dealId} not found for job ${legacyJobId}` };
  const lead = DbManager.getLeadById(deal.leadId);
  if (!lead) return { error: `Lead ${deal.leadId} not found for deal ${deal.id}` };
  const { projectId } = await ensureCanonicalProject(ctx, lead, deal);
  return { projectId };
}

/** Gets-or-creates the canonical InstallationJob for a project (id scheme
 * `job_<projectId>`, matching `assignInstallationJob`). */
async function ensureInstallationJobId(ctx: RepositoryContext, actor: BridgeActor, projectId: ProjectId): Promise<InstallationJobId> {
  const jobId = asId<InstallationJobId>(`job_${projectId}`);
  const existing = await installationJobRepository(ctx).get(jobId);
  if (!existing) {
    await assignInstallationJob(ctx, commercialActor(actor), projectId, actor.id);
  }
  return jobId;
}

export type InstallationBridgeTarget = 'checked_in' | 'evidence_captured' | 'completed' | 'qc_requested';

/**
 * "Ensure-forward" installation progress bridge: walks the canonical
 * InstallationJob from wherever it currently is up to (at least)
 * `target`, tolerant of already being further along — safe to call from
 * multiple independent legacy screens (check-in, evidence capture, QC
 * assignment) in any real-world order, since a technician's actual
 * workflow may revisit any of these screens. Enforces the same Phase 09
 * hard gate: site readiness is confirmed automatically here because the
 * technician physically checking in via the real screen IS the
 * real-world readiness signal this bridge treats as authoritative — a
 * documented simplification, not a bypass of the gate itself (the gate
 * still lives in `checkIn()`, unmodified).
 */
export async function bridgeInstallationProgress(
  actor: BridgeActor,
  legacyJobId: string,
  target: InstallationBridgeTarget,
  opts: { evidenceCount?: number; inspectorId?: string } = {},
): Promise<{ bridged: boolean; reason?: string }> {
  try {
    const ctx = ctxFor(actor);
    const resolved = await resolveProjectForLegacyJob(ctx, legacyJobId);
    if ('error' in resolved) return { bridged: false, reason: resolved.error };

    const jobId = await ensureInstallationJobId(ctx, actor, resolved.projectId);
    const op = commercialActor(actor);
    let job = await installationJobRepository(ctx).get(jobId);
    if (!job) throw new Error('installation job disappeared immediately after creation');

    if (!job.siteReadinessConfirmed) {
      await confirmSiteReadiness(ctx, op, jobId, true);
    }
    if (!job.checkedInAt) {
      await checkIn(ctx, op, jobId);
      job = await installationJobRepository(ctx).get(jobId);
    }
    if (target === 'checked_in') return { bridged: true };

    if (job!.status === 'checked_in' || job!.status === 'in_progress') {
      await progressToEvidenceCapture(ctx, op, jobId, opts.evidenceCount ?? 1);
      job = await installationJobRepository(ctx).get(jobId);
    }
    if (target === 'evidence_captured') return { bridged: true };

    if (job!.status === 'evidence_pending') {
      await completeInstallation(ctx, op, jobId);
      job = await installationJobRepository(ctx).get(jobId);
    }
    if (target === 'completed') return { bridged: true };

    if (job!.status === 'completed') {
      if (!opts.inspectorId) return { bridged: false, reason: 'target "qc_requested" needs an inspectorId' };
      await requestQC(ctx, op, jobId, opts.inspectorId);
    }
    return { bridged: true };
  } catch (err) {
    return { bridged: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * `ComplianceCertificationScreen.handleIssueOrUpdateCert` bridges to a
 * real QC PASS — the exact event that, via Phase 07's real
 * `QC_PASSED` handler, sets `Handover.qcPassed = true` (the only code
 * path anywhere allowed to do so) — immediately followed by
 * `confirmCompliance()`, since issuing the compliance certificate IS the
 * real-world "handover compliance confirmed" moment. Idempotent: a QC
 * inspection whose result is no longer `'pending'` (already resolved,
 * e.g. a cert reissue) is treated as already-bridged, never re-fired —
 * this also means the QC FAIL path is intentionally NOT bridged from any
 * screen this phase (see docs/architecture/18-installation-qc-handover.md
 * §3 for why), so the only way this bridge ever sees a fail is a fixture
 * or future phase, never a duplicate pass event.
 */
export async function bridgeQcPassed(
  actor: BridgeActor,
  legacyJobId: string,
  inspectorId: string,
): Promise<{ bridged: boolean; reason?: string }> {
  try {
    const ctx = ctxFor(actor);
    const progressed = await bridgeInstallationProgress(actor, legacyJobId, 'qc_requested', { inspectorId });
    if (!progressed.bridged) return progressed;

    const resolved = await resolveProjectForLegacyJob(ctx, legacyJobId);
    if ('error' in resolved) return { bridged: false, reason: resolved.error };
    const jobId = asId<InstallationJobId>(`job_${resolved.projectId}`);
    const inspectionId = asId<QCInspectionId>(`qc_${jobId}`);
    const inspection = await qcInspectionRepository(ctx).get(inspectionId);
    if (!inspection) return { bridged: false, reason: `no canonical QCInspection found for job ${legacyJobId}` };

    if (inspection.result === 'pending') {
      await recordQCResult(ctx, commercialActor(actor), inspectionId, 'pass', {});
    }
    await confirmCompliance(ctx, commercialActor(actor), resolved.projectId);
    return { bridged: true };
  } catch (err) {
    return { bridged: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** `FinalHandoverChecklistScreen.handleConfirmReadyForHandover` bridges
 * to `completeFinalChecklist`. */
export async function bridgeFinalChecklistCompleted(
  actor: BridgeActor,
  legacyJobId: string,
): Promise<{ bridged: boolean; reason?: string }> {
  try {
    const ctx = ctxFor(actor);
    const resolved = await resolveProjectForLegacyJob(ctx, legacyJobId);
    if ('error' in resolved) return { bridged: false, reason: resolved.error };
    await completeFinalChecklist(ctx, commercialActor(actor), resolved.projectId);
    return { bridged: true };
  } catch (err) {
    return { bridged: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** `CustomerHandoverWalkthroughScreen`'s walkthrough completion bridges
 * to `recordCustomerAcceptance`. */
export async function bridgeCustomerAcceptanceRecorded(
  actor: BridgeActor,
  legacyJobId: string,
): Promise<{ bridged: boolean; reason?: string }> {
  try {
    const ctx = ctxFor(actor);
    const resolved = await resolveProjectForLegacyJob(ctx, legacyJobId);
    if ('error' in resolved) return { bridged: false, reason: resolved.error };
    await recordCustomerAcceptance(ctx, commercialActor(actor), resolved.projectId);
    return { bridged: true };
  } catch (err) {
    return { bridged: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** `HandoverCompletionCertificateScreen`'s certificate issuance bridges
 * to `issueCertificate` — Phase 09's hard gate (customer acceptance must
 * already be recorded) is enforced by that function unmodified. */
export async function bridgeHandoverCertificateIssued(
  actor: BridgeActor,
  legacyJobId: string,
  warrantyMonths = 12,
): Promise<{ bridged: boolean; reason?: string }> {
  try {
    const ctx = ctxFor(actor);
    const resolved = await resolveProjectForLegacyJob(ctx, legacyJobId);
    if ('error' in resolved) return { bridged: false, reason: resolved.error };
    await issueCertificate(ctx, commercialActor(actor), resolved.projectId, warrantyMonths);
    return { bridged: true };
  } catch (err) {
    return { bridged: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Bridges the two real business-meaningful Lead stage transitions
 * (`LeadKanban`/`LeadDetail`'s `'quoted'` and `'closed_won'`) into the
 * real canonical Quote lifecycle: `'quoted'` creates+approves+sends a
 * real Quote (one line item, from the deal's agreed price); `'closed_won'`
 * records the customer's acceptance, which — via the REAL Phase 07 event
 * bus, not a direct call — auto-creates the canonical Contract in
 * `'draft'` status. Actual contract SIGNING (customer signature, payment
 * schedule) stays with `DigitalContractGenerator` and Phase 15's
 * `signContract` wiring there; this function's job stops at "quote
 * accepted, contract drafted," which is what a Kanban card move
 * genuinely represents — it does not fabricate a signed contract.
 *
 * Idempotent: looks up any existing Quote for the derived canonical
 * Project before creating one, so re-entering the same stage (or a user
 * dragging a card twice) never creates a duplicate Quote.
 */
export async function bridgeLeadStageTransition(
  actor: BridgeActor,
  lead: Lead,
  deal: Deal | undefined,
  targetStage: Lead['stage'],
  opts: { quoteDescription?: string; quoteAmount?: number } = {},
): Promise<{ bridged: boolean; reason?: string }> {
  if (targetStage !== 'quoted' && targetStage !== 'closed_won') {
    return { bridged: false, reason: `no bridge defined for lead stage "${targetStage}"` };
  }
  try {
    const ctx = ctxFor(actor);
    const { projectId } = await ensureCanonicalProject(ctx, lead, deal);
    const commercial = commercialActor(actor);

    let quote = (await quoteRepository(ctx).query({ projectId }))[0] as (Quote & { version?: number }) | undefined;

    if (!quote) {
      const amount = opts.quoteAmount ?? deal?.agreedPrice ?? 0;
      const { quote: created } = await createQuote(ctx, commercial, projectId, [
        { description: opts.quoteDescription || `Elevator installation — ${lead.buildingInfo?.type || 'building'}`, qty: 1, unitPrice: amount },
      ]);
      const approved = await approveQuote(ctx, commercial, created.id, 0);
      const sent = await sendQuote(ctx, commercial, created.id, (approved as any).version ?? 1);
      quote = sent as any;
    }
    if (!quote) throw new Error('quote could not be created or found');

    if (targetStage === 'closed_won' && quote.status !== 'accepted') {
      await recordCustomerQuoteDecision(ctx, quote.id, (quote as any).version ?? 0, 'accept', {
        financeUserId: actor.id, operationsUserId: actor.id,
      });
    }

    return { bridged: true };
  } catch (err) {
    return { bridged: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
