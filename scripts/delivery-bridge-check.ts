/**
 * Phase 17 acceptance check: proves the delivery additions to
 * `src/services/legacyCommercialBridge.ts` — now wired into
 * `DeliverySchedulingScreen`, `LiveShipmentTrackingScreen`, and
 * `SiteDeliveryChecklistScreen` — drive a real canonical Shipment/
 * DeliveryReceipt from a real legacy PO fixture through
 * Schedule -> Arrived -> Receipt, including the damaged/missing
 * exception path, never throwing back to the legacy screen that called
 * it.
 *
 * Run with: npx tsx scripts/delivery-bridge-check.ts
 */
import './polyfillBrowserGlobals';
import { DbManager } from '../src/lib/db';
import type { Lead, Deal, PurchaseOrder as LegacyPurchaseOrder, Payment as LegacyPayment } from '../src/types';
import {
  ensureCanonicalProject, bridgeProcurementPoCreated,
  bridgeDeliveryScheduled, bridgeShipmentArrived, bridgeMaterialReceiptRecorded,
  bridgeLegacyPaymentConfirmed,
} from '../src/services/legacyCommercialBridge';
import { shipmentRepository, deliveryReceiptRepository, purchaseOrderRepository } from '../src/repository/entities';
import type { RepositoryContext } from '../src/repository/types';
import { asId } from '../src/domain/ids';
import type { PurchaseOrderId } from '../src/domain/ids';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`OK: ${msg}`);
}

const actorAdmin = { id: 'user-admin-3', role: 'admin' as const, authMethod: 'firebase_auth', isDemo: true };

const lead: Lead = {
  id: 'lead-delivery-bridge-1', stage: 'closed_won', surveyorId: 'user-surveyor-3',
  contactInfo: { name: 'Delivery Bridge Customer', phone: '9990003333', email: 'delbridge@example.com' },
  buildingInfo: { address: '5 Delivery Court, Pune', floors: 4, type: 'residential' },
  createdAt: '2026-04-01T09:00:00Z', updatedAt: '2026-04-01T09:00:00Z',
};
const deal: Deal = {
  id: 'deal-delivery-bridge-1', leadId: lead.id, status: 'closed', agreedPrice: 650000, advancePaid: true,
  specs: { floors: 4, driveType: 'traction', capacity: '4-person', cabinStyle: 'standard' }, createdAt: '2026-04-02T09:00:00Z',
};
const legacyPoOk: LegacyPurchaseOrder = {
  id: 'PO-2026-DELIVERY-OK', linkedDealId: deal.id, customerName: 'Delivery Bridge Customer',
  siteLocation: '5 Delivery Court, Pune', supplierId: 'sun_elevators', supplierName: 'Sun Elevators Manufacturing',
  lineItems: [], subtotalAmount: 500000, gstRate: 18, gstAmount: 90000, totalAmount: 590000,
  expectedDeliveryDate: '2026-04-20', status: 'Draft', createdFromDealClosureAt: '2026-04-03T09:00:00Z',
};
const legacyPoDamaged: LegacyPurchaseOrder = { ...legacyPoOk, id: 'PO-2026-DELIVERY-DAMAGED' };

async function main() {
  DbManager.addLead(lead);
  DbManager.addDeal(deal);
  const ctx: RepositoryContext = { environment: 'demo', actorUserId: actorAdmin.id };
  const { projectId } = await ensureCanonicalProject(ctx, lead, deal);

  // --- 0. A delivery cannot be bridged for a PO that was never bridged at creation
  const r0 = await bridgeDeliveryScheduled(actorAdmin, 'PO-NEVER-CREATED');
  assert(!r0.bridged && !!r0.reason, 'scheduling a delivery for an unbridged PO reports a reason instead of throwing');

  // Phase 52 hard gate: procurement (PO creation) requires a real
  // payment to already exist for the project — bridge one first, the
  // correct/realistic fix, matching this pack's actual intended
  // lifecycle order (payment precedes PO), rather than weakening the gate.
  const legacyPayment: LegacyPayment = {
    id: 'pay-delivery-bridge-1', dealId: deal.id, stage: 'Advance (30%)', amount: 195000, paidAmount: 195000,
    status: 'paid', dueDate: '2026-04-02T09:00:00Z', paidAt: '2026-04-02T09:00:00Z', paymentMethod: 'UPI', referenceNo: 'TXN-DEL-BRIDGE-1',
  };
  const rPay = await bridgeLegacyPaymentConfirmed(actorAdmin, legacyPayment);
  assert(rPay.bridged, 'a real advance payment is bridged first, satisfying the Phase 52 payment-before-procurement hard gate');

  // --- 1. PO must exist in the canonical model first (Phase 16)
  await bridgeProcurementPoCreated(actorAdmin, legacyPoOk);
  await bridgeProcurementPoCreated(actorAdmin, legacyPoDamaged);

  // --- 2. Delivery scheduled -> real canonical Shipment
  const r1 = await bridgeDeliveryScheduled(actorAdmin, legacyPoOk.id);
  assert(r1.bridged, 'a locked delivery schedule bridges to a real canonical Shipment');

  const poId = asId<PurchaseOrderId>(`po_${legacyPoOk.id}`);
  const shipmentId = `ship_${poId}` as any;
  const shipment = await shipmentRepository(ctx).get(shipmentId);
  assert(!!shipment, 'the canonical Shipment exists');
  assert(shipment!.status === 'scheduled', 'the canonical Shipment starts "scheduled"');
  assert(shipment!.projectId === projectId, 'the canonical Shipment is linked to the same canonical Project as the PO');

  // Idempotency: re-scheduling the same PO does not create a duplicate.
  await bridgeDeliveryScheduled(actorAdmin, legacyPoOk.id);
  const allShipments = (await shipmentRepository(ctx).list()).filter(s => s.projectId === projectId);
  assert(allShipments.length === 1, 're-scheduling the same PO does not create a duplicate canonical Shipment');

  // --- 3. Shipment arrived
  const r2 = await bridgeShipmentArrived(actorAdmin, legacyPoOk.id);
  assert(r2.bridged, 'the "arrived" milestone bridges to the canonical Shipment');
  const arrivedShipment = await shipmentRepository(ctx).get(shipmentId);
  assert(arrivedShipment?.status === 'arrived', 'the canonical Shipment is now "arrived"');

  // --- 4. Clean receipt -> "ok" DeliveryReceipt
  const r3 = await bridgeMaterialReceiptRecorded(actorAdmin, legacyPoOk.id, 'ok');
  assert(r3.bridged, 'a clean checklist completion bridges to a real canonical DeliveryReceipt');
  const receipts = (await deliveryReceiptRepository(ctx).list()).filter(r => r.projectId === projectId);
  assert(receipts.length === 1 && receipts[0].status === 'ok', 'the canonical DeliveryReceipt is recorded "ok"');
  assert(!receipts[0].incidentId, 'a clean receipt has no incident id');

  // Idempotency: completing the checklist twice does not double-record.
  await bridgeMaterialReceiptRecorded(actorAdmin, legacyPoOk.id, 'ok');
  const receiptsAfterRepeat = (await deliveryReceiptRepository(ctx).list()).filter(r => r.projectId === projectId);
  assert(receiptsAfterRepeat.length === 1, 're-completing the checklist does not create a duplicate canonical DeliveryReceipt');

  // --- 5. Damaged/missing exception path (separate PO/project)
  await bridgeDeliveryScheduled(actorAdmin, legacyPoDamaged.id);
  await bridgeShipmentArrived(actorAdmin, legacyPoDamaged.id);
  const r4 = await bridgeMaterialReceiptRecorded(actorAdmin, legacyPoDamaged.id, 'damaged');
  assert(r4.bridged, 'a discrepant checklist completion bridges to a real canonical DeliveryReceipt (damaged)');
  const damagedShipmentId = `ship_po_${legacyPoDamaged.id}` as any;
  const damagedReceipts = await deliveryReceiptRepository(ctx).query({ shipmentId: damagedShipmentId });
  assert(damagedReceipts.length === 1 && damagedReceipts[0].status === 'damaged', 'the damaged receipt is recorded with status "damaged"');
  assert(!!damagedReceipts[0].incidentId, 'a damaged receipt carries an incident id — the Phase 09 damaged/missing exception anchor');

  console.log('\nPASS: the delivery bridge drives a real project from a bridged PO through a scheduled, arrived, and');
  console.log('received canonical Shipment/DeliveryReceipt — idempotent on re-entry, honest about an unbridged PO, and');
  console.log('correctly routes a discrepant receipt into the real damaged/missing exception path instead of a');
  console.log('fabricated success — using the exact functions now wired into DeliverySchedulingScreen,');
  console.log('LiveShipmentTrackingScreen, and SiteDeliveryChecklistScreen.');
}

main();
