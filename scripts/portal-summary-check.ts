/**
 * Phase 19 acceptance check: proves `src/services/portalWorkSummary.ts`
 * reports real, correct role-oriented summaries — built entirely from
 * canonical records the Phase 15-18 dual-write bridges produce, not
 * mocked or hand-seeded directly — for all three portals (Customer/
 * Supplier/Technician).
 *
 * Run with: npx tsx scripts/portal-summary-check.ts
 */
import './polyfillBrowserGlobals';
import { DbManager } from '../src/lib/db';
import type { Lead, Deal, PurchaseOrder as LegacyPurchaseOrder, Job as LegacyJob, Payment as LegacyPayment } from '../src/types';
import {
  ensureCanonicalProject, bridgeLeadStageTransition, bridgeProcurementPoCreated, bridgeProcurementPoStatusChanged,
  bridgeDeliveryScheduled, bridgeShipmentArrived, bridgeMaterialReceiptRecorded,
  bridgeInstallationProgress, bridgeQcPassed, bridgeFinalChecklistCompleted,
  bridgeCustomerAcceptanceRecorded, bridgeHandoverCertificateIssued, bridgeLegacyPaymentConfirmed,
} from '../src/services/legacyCommercialBridge';
import { getCustomerPortalSummary, getSupplierPortalSummary, getTechnicianPortalSummary } from '../src/services/portalWorkSummary';
import type { RepositoryContext } from '../src/repository/types';
import { asId } from '../src/domain/ids';
import type { SupplierId, UserId } from '../src/domain/ids';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`OK: ${msg}`);
}

const actorAdmin = { id: 'user-admin-5', role: 'admin' as const, authMethod: 'firebase_auth', isDemo: true };
const technicianId = 'user-tech-5';
const supplierId = 'sun_elevators';

const lead: Lead = {
  id: 'lead-portal-1', stage: 'closed_won', surveyorId: 'user-surveyor-5',
  contactInfo: { name: 'Portal Summary Customer', phone: '9990005555', email: 'portal@example.com' },
  buildingInfo: { address: '1 Portal Plaza, Pune', floors: 6, type: 'residential' },
  createdAt: '2026-06-01T09:00:00Z', updatedAt: '2026-06-01T09:00:00Z',
};
const deal: Deal = {
  id: 'deal-portal-1', leadId: lead.id, status: 'closed', agreedPrice: 900000, advancePaid: true,
  specs: { floors: 6, driveType: 'traction', capacity: '6-person', cabinStyle: 'standard' }, createdAt: '2026-06-02T09:00:00Z',
};
const legacyPo: LegacyPurchaseOrder = {
  id: 'PO-2026-PORTAL-1', linkedDealId: deal.id, customerName: 'Portal Summary Customer', siteLocation: '1 Portal Plaza, Pune',
  supplierId, supplierName: 'Sun Elevators Manufacturing', lineItems: [], subtotalAmount: 700000, gstRate: 18,
  gstAmount: 126000, totalAmount: 826000, expectedDeliveryDate: '2026-06-20', status: 'Draft', createdFromDealClosureAt: '2026-06-03T09:00:00Z',
};
const legacyJob: LegacyJob = { id: 'job-portal-1', dealId: deal.id, technicianId, status: 'pending', sopSteps: [] };
const legacyPayment: LegacyPayment = {
  id: 'pay-portal-1', dealId: deal.id, stage: 'Advance (30%)', amount: 270000, paidAmount: 270000,
  status: 'paid', dueDate: '2026-06-05', paidAt: '2026-06-05T10:00:00Z', paymentMethod: 'UPI', referenceNo: 'TXN-PORTAL-1',
};

async function main() {
  DbManager.addLead(lead);
  DbManager.addDeal(deal);
  DbManager.addJob(legacyJob);

  const ctx: RepositoryContext = { environment: 'demo', actorUserId: actorAdmin.id };
  const { projectId } = await ensureCanonicalProject(ctx, lead, deal);

  // Live a realistic slice of the whole story through the real bridges
  // (Phases 15-18), so the portal summaries below read genuinely
  // populated canonical data, not a synthetic fixture built to match.
  await bridgeLeadStageTransition(actorAdmin, lead, undefined, 'quoted', { quoteAmount: 900000 });
  await bridgeLeadStageTransition(actorAdmin, { ...lead, stage: 'closed_won' }, deal, 'closed_won');
  await bridgeLegacyPaymentConfirmed(actorAdmin, legacyPayment);
  await bridgeProcurementPoCreated(actorAdmin, legacyPo);
  await bridgeProcurementPoStatusChanged(actorAdmin, { ...legacyPo, status: 'Sent' }, 'Sent');
  await bridgeDeliveryScheduled(actorAdmin, legacyPo.id, technicianId);
  await bridgeShipmentArrived(actorAdmin, legacyPo.id);
  await bridgeMaterialReceiptRecorded(actorAdmin, legacyPo.id, 'ok');
  await bridgeInstallationProgress({ id: technicianId, role: 'technician', isDemo: true }, legacyJob.id, 'checked_in');
  await bridgeInstallationProgress({ id: technicianId, role: 'technician', isDemo: true }, legacyJob.id, 'evidence_captured', { evidenceCount: 1 });
  await bridgeInstallationProgress({ id: technicianId, role: 'technician', isDemo: true }, legacyJob.id, 'qc_requested', { inspectorId: 'user-inspector-2' });
  await bridgeQcPassed(actorAdmin, legacyJob.id, 'user-inspector-2');
  await bridgeFinalChecklistCompleted(actorAdmin, legacyJob.id);
  await bridgeCustomerAcceptanceRecorded(actorAdmin, legacyJob.id);
  await bridgeHandoverCertificateIssued(actorAdmin, legacyJob.id);

  // --- CUSTOMER portal summary ------------------------------------------
  const customerSummary = await getCustomerPortalSummary(ctx, projectId);
  assert(customerSummary.project?.stage === 'warranty_amc', 'customer summary: project stage reflects the real, fully-progressed canonical Project');
  assert(customerSummary.quote?.status === 'accepted', 'customer summary: quote status is "accepted"');
  assert(customerSummary.payments.paidCount === 1, 'customer summary: exactly one confirmed payment counted');
  assert(customerSummary.payments.totalPaid === 270000, 'customer summary: total paid amount matches the real bridged payment');
  assert(customerSummary.procurement.poCount === 1, 'customer summary: one purchase order counted');
  assert(customerSummary.delivery.shipmentStatus === 'arrived', 'customer summary: shipment status is "arrived"');
  assert(customerSummary.delivery.receiptStatus === 'ok', 'customer summary: delivery receipt status is "ok"');
  assert(customerSummary.installation.status === 'qc_requested', 'customer summary: installation status is "qc_requested"');
  assert(customerSummary.qc.result === 'pass', 'customer summary: QC result is "pass"');
  assert(customerSummary.handover.certificateIssued === true, 'customer summary: handover certificate is issued');
  assert(customerSummary.warranty.active === true, 'customer summary: warranty is active (real Warranty record created by the HANDOVER_COMPLETED event handler)');

  // --- SUPPLIER portal summary -------------------------------------------
  const supplierSummary = await getSupplierPortalSummary(ctx, asId<SupplierId>(supplierId));
  assert(supplierSummary.openOrders >= 1, 'supplier summary: at least one open order counted (this PO is still "sent_to_supplier")');
  assert(supplierSummary.totalOrderValue >= legacyPo.totalAmount, 'supplier summary: total order value includes this PO\'s real amount');

  // --- TECHNICIAN portal summary ------------------------------------------
  const technicianSummary = await getTechnicianPortalSummary(ctx, asId<UserId>(technicianId));
  assert(technicianSummary.assignedJobs === 1, 'technician summary: exactly one assigned job counted');
  assert(technicianSummary.awaitingQc === 1, 'technician summary: the job is correctly bucketed as awaiting/at QC (status "qc_requested")');

  console.log('\nPASS: all three portal work summaries (Customer/Supplier/Technician) report real, correct data');
  console.log('derived entirely from canonical Project/Quote/Payment/PurchaseOrder/Shipment/DeliveryReceipt/');
  console.log('InstallationJob/QCInspection/Handover/Warranty records — the exact records the Phase 15-18 dual-write');
  console.log('bridges produce from real legacy screen actions, proving the portals now have real canonical data to');
  console.log('read from, per this phase\'s "all portals must use the canonical project/work-item data" requirement.');
}

main();
