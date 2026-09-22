/**
 * Phase 21 acceptance check: proves `getProjectOperatingView()` reports
 * a real, correct, comprehensive project view — timeline, next action,
 * owner, financial state, blockers, and audit history — derived entirely
 * from canonical records the Phase 15-18 dual-write bridges produce.
 *
 * Run with: npx tsx scripts/project-operating-view-check.ts
 */
import './polyfillBrowserGlobals';
import { DbManager } from '../src/lib/db';
import type { Lead, Deal, PurchaseOrder as LegacyPurchaseOrder, Job as LegacyJob, Payment as LegacyPayment } from '../src/types';
import {
  ensureCanonicalProject, bridgeLeadStageTransition, bridgeLegacyPaymentConfirmed,
  bridgeProcurementPoCreated, bridgeProcurementPoStatusChanged, bridgeDeliveryScheduled,
  bridgeShipmentArrived, bridgeMaterialReceiptRecorded, bridgeInstallationProgress,
  bridgeQcPassed, bridgeFinalChecklistCompleted, bridgeCustomerAcceptanceRecorded, bridgeHandoverCertificateIssued,
} from '../src/services/legacyCommercialBridge';
import { getProjectOperatingView, PROJECT_STAGE_ORDER } from '../src/services/projectOperatingView';
import type { RepositoryContext } from '../src/repository/types';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`OK: ${msg}`);
}

const actorAdmin = { id: 'user-admin-6', role: 'admin' as const, authMethod: 'firebase_auth', isDemo: true };
const technicianId = 'user-tech-6';
const ctx: RepositoryContext = { environment: 'demo', actorUserId: actorAdmin.id };

async function fullyProgressedProjectScenario() {
  const lead: Lead = {
    id: 'lead-pov-1', stage: 'closed_won', surveyorId: 'user-surveyor-6',
    contactInfo: { name: 'Project View Customer', phone: '9990006666', email: 'pov@example.com' },
    buildingInfo: { address: '2 Operating View Road, Pune', floors: 7, type: 'residential' },
    createdAt: '2026-07-01T09:00:00Z', updatedAt: '2026-07-01T09:00:00Z',
  };
  const deal: Deal = {
    id: 'deal-pov-1', leadId: lead.id, status: 'closed', agreedPrice: 950000, advancePaid: true,
    specs: { floors: 7, driveType: 'traction', capacity: '7-person', cabinStyle: 'standard' }, createdAt: '2026-07-02T09:00:00Z',
  };
  const legacyPo: LegacyPurchaseOrder = {
    id: 'PO-2026-POV-1', linkedDealId: deal.id, customerName: 'Project View Customer', siteLocation: '2 Operating View Road, Pune',
    supplierId: 'sun_elevators', supplierName: 'Sun Elevators Manufacturing', lineItems: [], subtotalAmount: 700000, gstRate: 18,
    gstAmount: 126000, totalAmount: 826000, expectedDeliveryDate: '2026-07-20', status: 'Draft', createdFromDealClosureAt: '2026-07-03T09:00:00Z',
  };
  const legacyJob: LegacyJob = { id: 'job-pov-1', dealId: deal.id, technicianId, status: 'pending', sopSteps: [] };
  const legacyPayment: LegacyPayment = {
    id: 'pay-pov-1', dealId: deal.id, stage: 'Advance (30%)', amount: 285000, paidAmount: 285000,
    status: 'paid', dueDate: '2026-07-05', paidAt: '2026-07-05T10:00:00Z', paymentMethod: 'UPI', referenceNo: 'TXN-POV-1',
  };

  DbManager.addLead(lead);
  DbManager.addDeal(deal);
  DbManager.addJob(legacyJob);

  const { projectId } = await ensureCanonicalProject(ctx, lead, deal);

  await bridgeLeadStageTransition(actorAdmin, lead, undefined, 'quoted', { quoteAmount: 950000 });
  await bridgeLeadStageTransition(actorAdmin, { ...lead, stage: 'closed_won' }, deal, 'closed_won');
  await bridgeLegacyPaymentConfirmed(actorAdmin, legacyPayment);
  await bridgeProcurementPoCreated(actorAdmin, legacyPo);
  await bridgeProcurementPoStatusChanged(actorAdmin, { ...legacyPo, status: 'Sent' }, 'Sent');
  await bridgeProcurementPoStatusChanged(actorAdmin, { ...legacyPo, status: 'Acknowledged' }, 'Acknowledged');
  await bridgeDeliveryScheduled(actorAdmin, legacyPo.id, technicianId);
  await bridgeShipmentArrived(actorAdmin, legacyPo.id);
  await bridgeMaterialReceiptRecorded(actorAdmin, legacyPo.id, 'ok');
  await bridgeInstallationProgress({ id: technicianId, role: 'technician', isDemo: true }, legacyJob.id, 'checked_in');
  await bridgeInstallationProgress({ id: technicianId, role: 'technician', isDemo: true }, legacyJob.id, 'evidence_captured', { evidenceCount: 1 });
  await bridgeInstallationProgress({ id: technicianId, role: 'technician', isDemo: true }, legacyJob.id, 'qc_requested', { inspectorId: 'user-inspector-3' });
  await bridgeQcPassed(actorAdmin, legacyJob.id, 'user-inspector-3');
  await bridgeFinalChecklistCompleted(actorAdmin, legacyJob.id);
  await bridgeCustomerAcceptanceRecorded(actorAdmin, legacyJob.id);
  await bridgeHandoverCertificateIssued(actorAdmin, legacyJob.id);

  const view = await getProjectOperatingView(ctx, projectId);

  assert(view.project?.stage === 'warranty_amc', 'project reaches "warranty_amc" after the full real bridge chain');
  assert(view.customer?.name === 'Project View Customer', 'customer name is resolved from the real canonical Customer record');
  assert(view.site?.address === '2 Operating View Road, Pune', 'site address is resolved from the real canonical Site record');
  assert(!!view.owner?.userId, 'owner is populated from the real Project.ownerUserId');
  assert(view.nextAction.toLowerCase().includes('warranty'), `next action reflects the current stage (got: "${view.nextAction}")`);

  const stageIndex = PROJECT_STAGE_ORDER.indexOf('warranty_amc');
  assert(view.timeline[stageIndex].status === 'current', 'the timeline marks "warranty_amc" as the current step');
  assert(view.timeline.slice(0, stageIndex).every(s => s.status === 'done'), 'every earlier timeline step is marked "done"');
  assert(view.timeline.slice(stageIndex + 1).every(s => s.status === 'pending'), 'every later timeline step is marked "pending"');

  assert(view.financial.totalPaid === 285000, 'financial.totalPaid matches the real confirmed payment amount');
  assert(view.financial.poValue === legacyPo.totalAmount, 'financial.poValue matches the real bridged PO total');
  assert(view.blockers.length === 0, `a fully, cleanly progressed project has zero blockers (got: ${JSON.stringify(view.blockers)})`);
  assert(view.auditHistory.length > 0, 'audit history contains real recorded events for this project');
  assert(view.auditHistory.some(e => e.action === 'QUOTE_ACCEPTED_CONTRACT_CREATED'), 'audit history includes the real, automatically-recorded QUOTE_ACCEPTED_CONTRACT_CREATED event from the Phase 07 event bus');

  return projectId;
}

async function blockedProjectScenario() {
  const lead: Lead = {
    id: 'lead-pov-2', stage: 'closed_won', surveyorId: 'user-surveyor-6',
    contactInfo: { name: 'Blocked Project Customer', phone: '9990007777', email: 'blocked@example.com' },
    buildingInfo: { address: '9 Stuck Street, Pune', floors: 3, type: 'residential' },
    createdAt: '2026-07-10T09:00:00Z', updatedAt: '2026-07-10T09:00:00Z',
  };
  const deal: Deal = {
    id: 'deal-pov-2', leadId: lead.id, status: 'closed', agreedPrice: 400000, advancePaid: false,
    specs: { floors: 3, driveType: 'traction', capacity: '4-person', cabinStyle: 'standard' }, createdAt: '2026-07-11T09:00:00Z',
  };
  const legacyPo: LegacyPurchaseOrder = {
    id: 'PO-2026-POV-2', linkedDealId: deal.id, customerName: 'Blocked Project Customer', siteLocation: '9 Stuck Street, Pune',
    supplierId: 'sun_elevators', supplierName: 'Sun Elevators Manufacturing', lineItems: [], subtotalAmount: 300000, gstRate: 18,
    gstAmount: 54000, totalAmount: 354000, expectedDeliveryDate: '2026-07-25', status: 'Draft', createdFromDealClosureAt: '2026-07-12T09:00:00Z',
  };

  DbManager.addLead(lead);
  DbManager.addDeal(deal);

  const { projectId } = await ensureCanonicalProject(ctx, lead, deal);
  await bridgeProcurementPoCreated(actorAdmin, legacyPo); // left in "pending_approval" — never sent/approved

  const view = await getProjectOperatingView(ctx, projectId);
  assert(view.blockers.some(b => b.includes('awaiting approval')), 'a PO stuck in "pending_approval" is surfaced as a real blocker');
}

async function main() {
  await fullyProgressedProjectScenario();
  await blockedProjectScenario();

  console.log('\nPASS: the project operating view reports a real, correct, comprehensive picture of a project — timeline,');
  console.log('next action, owner, financial state, and audit history all derived from real canonical records — and');
  console.log('correctly surfaces genuine blockers (a PO stuck pending approval) while reporting zero blockers for a');
  console.log('cleanly, fully progressed project instead of a hard-coded or simulated list.');
}

main();
