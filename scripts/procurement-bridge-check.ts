/**
 * Phase 16 acceptance check: proves the procurement additions to
 * `src/services/legacyCommercialBridge.ts` — now wired into
 * `PurchaseOrderGenerator` and `SupplierOrderStatusTracking` — drive a
 * real canonical PurchaseOrder from a real legacy PO/Deal/Lead fixture
 * through PO_drafted -> approval/sent -> supplier acceptance ->
 * production -> dispatch (advancing the canonical Project to the
 * delivery stage), authorization-checked and never throwing back to the
 * legacy screen that called it.
 *
 * Run with: npx tsx scripts/procurement-bridge-check.ts
 */
import './polyfillBrowserGlobals';
import { DbManager } from '../src/lib/db';
import type { Lead, Deal, PurchaseOrder as LegacyPurchaseOrder, Payment as LegacyPayment } from '../src/types';
import {
  ensureCanonicalProject, bridgeProcurementPoCreated, bridgeProcurementPoStatusChanged,
  bridgeLegacyPaymentConfirmed,
} from '../src/services/legacyCommercialBridge';
import { purchaseOrderRepository, projectRepository } from '../src/repository/entities';
import type { RepositoryContext } from '../src/repository/types';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`OK: ${msg}`);
}

const actorAdmin = { id: 'user-admin-2', role: 'admin' as const, authMethod: 'firebase_auth', isDemo: true };
const actorSupplier = { id: 'user-supplier-2', role: 'supplier' as const, authMethod: 'firebase_auth', isDemo: true };

const lead: Lead = {
  id: 'lead-po-bridge-1',
  stage: 'closed_won',
  surveyorId: 'user-surveyor-2',
  contactInfo: { name: 'PO Bridge Customer', phone: '9990002222', email: 'pobridge@example.com' },
  buildingInfo: { address: '9 Procurement Ave, Pune', floors: 10, type: 'commercial' },
  createdAt: '2026-03-01T09:00:00Z',
  updatedAt: '2026-03-01T09:00:00Z',
};

const deal: Deal = {
  id: 'deal-po-bridge-1',
  leadId: lead.id,
  status: 'closed',
  agreedPrice: 1800000,
  advancePaid: true,
  specs: { floors: 10, driveType: 'traction', capacity: '10-person', cabinStyle: 'premium' },
  createdAt: '2026-03-02T09:00:00Z',
};

const legacyPo: LegacyPurchaseOrder = {
  id: 'PO-2026-BRIDGE-101',
  linkedDealId: deal.id,
  customerName: 'PO Bridge Customer',
  siteLocation: '9 Procurement Ave, Pune',
  supplierId: 'sun_elevators',
  supplierName: 'Sun Elevators Manufacturing',
  lineItems: [],
  subtotalAmount: 700000,
  gstRate: 18,
  gstAmount: 126000,
  totalAmount: 826000,
  expectedDeliveryDate: '2026-03-20',
  status: 'Draft',
  createdFromDealClosureAt: '2026-03-03T09:00:00Z',
};

async function main() {
  DbManager.addLead(lead);
  DbManager.addDeal(deal);

  const ctx: RepositoryContext = { environment: 'demo', actorUserId: actorAdmin.id };
  const { projectId } = await ensureCanonicalProject(ctx, lead, deal);

  // Phase 52 hard gate: procurement cannot begin before a real payment
  // has been recorded for the project (src/services/commercialWorkflow.ts's
  // createProcurementPO). This fixture's deal already flags
  // `advancePaid: true` — bridging that as a real canonical Payment
  // first (rather than weakening the new gate) is the correct, realistic
  // setup, matching the actual intended lifecycle order this pack's own
  // full-company-simulation already proves (payment precedes PO).
  const legacyPayment: LegacyPayment = {
    id: 'pay-po-bridge-1', dealId: deal.id, stage: 'Advance (30%)', amount: 540000, paidAmount: 540000,
    status: 'paid', dueDate: '2026-03-02T09:00:00Z', paidAt: '2026-03-02T09:00:00Z', paymentMethod: 'UPI', referenceNo: 'TXN-PO-BRIDGE-1',
  };
  const rPay = await bridgeLegacyPaymentConfirmed(actorAdmin, legacyPayment);
  assert(rPay.bridged, 'a real advance payment is bridged first, satisfying the Phase 52 payment-before-procurement hard gate');

  // --- 1. PO draft bridges to a real, idempotent canonical PurchaseOrder
  const r1 = await bridgeProcurementPoCreated(actorAdmin, legacyPo);
  assert(r1.bridged, 'a drafted legacy PO bridges to a real canonical PurchaseOrder');

  const pos = await purchaseOrderRepository(ctx).list();
  const po = pos.find(p => p.projectId === projectId);
  assert(!!po, 'the canonical PurchaseOrder is linked to the same canonical Project as the lead/deal');
  assert(po!.status === 'pending_approval', 'the canonical PO starts in "pending_approval"');
  assert(po!.amount === legacyPo.totalAmount, 'the canonical PO amount matches the legacy PO total');

  // Idempotency: re-drafting the same legacy PO id does not duplicate.
  await bridgeProcurementPoCreated(actorAdmin, legacyPo);
  const posAfterRepeat = (await purchaseOrderRepository(ctx).list()).filter(p => p.projectId === projectId);
  assert(posAfterRepeat.length === 1, 'redrafting the same legacy PO id does not create a duplicate canonical PurchaseOrder');

  // --- 2. Send -> Acknowledge -> In Production -> Shipped, each a real transition
  const sentPo: LegacyPurchaseOrder = { ...legacyPo, status: 'Sent' };
  const r2 = await bridgeProcurementPoStatusChanged(actorAdmin, sentPo, 'Sent');
  assert(r2.bridged, '"Sent" bridges to the canonical PO leaving pending_approval');
  let current = await purchaseOrderRepository(ctx).get(po!.id);
  assert(current?.status === 'sent_to_supplier', 'canonical PO is now "sent_to_supplier"');

  const ackPo: LegacyPurchaseOrder = { ...legacyPo, status: 'Acknowledged' };
  const r3 = await bridgeProcurementPoStatusChanged(actorAdmin, ackPo, 'Acknowledged');
  assert(r3.bridged, '"Acknowledged" bridges to the canonical PO');
  current = await purchaseOrderRepository(ctx).get(po!.id);
  assert(current?.status === 'accepted_by_supplier', 'canonical PO is now "accepted_by_supplier"');

  const prodPo: LegacyPurchaseOrder = { ...legacyPo, status: 'In Production' };
  const r4 = await bridgeProcurementPoStatusChanged(actorAdmin, prodPo, 'In Production');
  assert(r4.bridged, '"In Production" bridges to the canonical PO');
  current = await purchaseOrderRepository(ctx).get(po!.id);
  assert(current?.status === 'in_production', 'canonical PO is now "in_production"');

  const shippedPo: LegacyPurchaseOrder = { ...legacyPo, status: 'Shipped' };
  const r5 = await bridgeProcurementPoStatusChanged(actorAdmin, shippedPo, 'Shipped');
  assert(r5.bridged, '"Shipped" bridges to the canonical PO');
  current = await purchaseOrderRepository(ctx).get(po!.id);
  assert(current?.status === 'dispatched', 'canonical PO is now "dispatched"');

  const project = await projectRepository(ctx).get(projectId);
  assert(project?.stage === 'delivery', 'dispatching the canonical PO advanced the canonical Project to the delivery stage');

  // --- 3. A status with no bridge yet reports that honestly.
  const deliveredPo: LegacyPurchaseOrder = { ...legacyPo, status: 'Delivered' };
  const r6 = await bridgeProcurementPoStatusChanged(actorAdmin, deliveredPo, 'Delivered');
  assert(!r6.bridged && !!r6.reason, '"Delivered" (Phase 17 scope) reports "no bridge defined" rather than silently doing nothing unexplained');

  // --- 4. A status change for a PO never bridged at creation fails soft.
  const orphanPo: LegacyPurchaseOrder = { ...legacyPo, id: 'PO-NEVER-BRIDGED', status: 'Sent' };
  const r7 = await bridgeProcurementPoStatusChanged(actorAdmin, orphanPo, 'Sent');
  assert(!r7.bridged && !!r7.reason, 'a status change for a PO that was never bridged at creation reports a reason instead of throwing');

  // --- 5. Unauthorized PO drafting is denied, not silently allowed
  const unauthorizedLead: Lead = { ...lead, id: 'lead-po-bridge-2' };
  const unauthorizedDeal: Deal = { ...deal, id: 'deal-po-bridge-2', leadId: unauthorizedLead.id };
  DbManager.addLead(unauthorizedLead);
  DbManager.addDeal(unauthorizedDeal);
  // Record a real payment for this second project too, so the denial
  // below is isolated to the AUTHORIZATION check (the actual thing this
  // assertion tests), not conflated with the separate Phase 52 payment
  // hard gate.
  const unauthorizedLegacyPayment: LegacyPayment = { ...legacyPayment, id: 'pay-po-bridge-2', dealId: unauthorizedDeal.id };
  const rPay2 = await bridgeLegacyPaymentConfirmed(actorAdmin, unauthorizedLegacyPayment);
  assert(rPay2.bridged, 'setup: a real advance payment is bridged for the second (unauthorized-attempt) project too, isolating the authorization check below');
  const unauthorizedPo: LegacyPurchaseOrder = { ...legacyPo, id: 'PO-2026-BRIDGE-UNAUTH', linkedDealId: unauthorizedDeal.id };
  const r8 = await bridgeProcurementPoCreated(actorSupplier, unauthorizedPo);
  assert(!r8.bridged, 'a supplier (no supplier.manage permission) cannot bridge a PO draft — denied, not silently allowed');

  console.log('\nPASS: the procurement bridge drives a real project from a legacy PO draft through approval,');
  console.log('supplier acceptance, production, and dispatch — each a real, authorization-checked canonical');
  console.log('PurchaseOrder transition, idempotent on redraft, and honest about the one legacy status ("Delivered")');
  console.log('it does not yet bridge, using the exact functions now wired into PurchaseOrderGenerator and');
  console.log('SupplierOrderStatusTracking.');
}

main();
