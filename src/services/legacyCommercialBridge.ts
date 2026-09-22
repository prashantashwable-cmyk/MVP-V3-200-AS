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
import { createProjectFromLead, projectRepository, paymentScheduleRepository, quoteRepository, purchaseOrderRepository } from '../repository/entities';
import {
  collectInstallment, createQuote, approveQuote, sendQuote, recordCustomerQuoteDecision,
  createProcurementPO, approvePO, recordSupplierAcceptance, markInProduction, dispatchMaterial,
} from './commercialWorkflow';
import type { CanonicalUserRole, Quote } from '../domain/entities';
import { asId } from '../domain/ids';
import type { ProjectId, PaymentScheduleId, ContractId, PurchaseOrderId, UserId } from '../domain/ids';

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
