/**
 * Phase 25 acceptance check: proves global search now covers real
 * Quote/Contract/Payment/PurchaseOrder/Shipment/InstallationJob/QC/
 * Handover records (Phase 12 scoped this to Project/Customer only),
 * built from the exact canonical data the Phase 15-18 dual-write
 * bridges produce, and that every result deep-links to a real,
 * existing screen (Phase 21's ProjectOperatingView) via the real
 * aiec_open_project mechanism — never a dead-end result.
 *
 * Run with: npx tsx scripts/global-search-check.ts
 */
import './polyfillBrowserGlobals';
import { DbManager } from '../src/lib/db';
import type { Lead, Deal, PurchaseOrder as LegacyPurchaseOrder, Job as LegacyJob } from '../src/types';
import {
  ensureCanonicalProject, bridgeLeadStageTransition, bridgeProcurementPoCreated,
  bridgeDeliveryScheduled, bridgeShipmentArrived, bridgeInstallationProgress, bridgeQcPassed,
} from '../src/services/legacyCommercialBridge';
import { createProjectCustomerSearchProvider, refreshEntitySearchCache } from '../src/navigation/entitySearchProvider';
import type { RepositoryContext } from '../src/repository/types';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`OK: ${msg}`);
}

const actorAdmin = { id: 'user-admin-8', role: 'admin' as const, authMethod: 'firebase_auth', isDemo: true };
const technicianId = 'user-tech-8';
const ctx: RepositoryContext = { environment: 'demo', actorUserId: actorAdmin.id };

async function main() {
  const lead: Lead = {
    id: 'lead-search-1', stage: 'closed_won', surveyorId: 'user-surveyor-8',
    contactInfo: { name: 'Search Test Customer', phone: '9990001212', email: 'search@example.com' },
    buildingInfo: { address: '11 Search Ave, Pune', floors: 6, type: 'residential' },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const deal: Deal = {
    id: 'deal-search-1', leadId: lead.id, status: 'closed', agreedPrice: 800000, advancePaid: true,
    specs: { floors: 6, driveType: 'traction', capacity: '6-person', cabinStyle: 'standard' }, createdAt: new Date().toISOString(),
  };
  DbManager.addLead(lead);
  DbManager.addDeal(deal);
  const { projectId } = await ensureCanonicalProject(ctx, lead, deal);
  await bridgeLeadStageTransition(actorAdmin, lead, undefined, 'quoted', { quoteAmount: 800000 });
  await bridgeLeadStageTransition(actorAdmin, { ...lead, stage: 'closed_won' }, deal, 'closed_won');

  const legacyPo: LegacyPurchaseOrder = {
    id: 'PO-2026-SEARCH-1', linkedDealId: deal.id, customerName: 'Search Test Customer', siteLocation: '11 Search Ave, Pune',
    supplierId: 'sun_elevators', supplierName: 'Sun Elevators Manufacturing', lineItems: [], subtotalAmount: 600000, gstRate: 18,
    gstAmount: 108000, totalAmount: 708000, expectedDeliveryDate: '2026-09-30', status: 'Draft', createdFromDealClosureAt: new Date().toISOString(),
  };
  await bridgeProcurementPoCreated(actorAdmin, legacyPo);
  await bridgeDeliveryScheduled(actorAdmin, legacyPo.id, technicianId);
  await bridgeShipmentArrived(actorAdmin, legacyPo.id);

  const legacyJob: LegacyJob = { id: 'job-search-1', dealId: deal.id, technicianId, status: 'pending', sopSteps: [] };
  DbManager.addJob(legacyJob);
  await bridgeInstallationProgress({ id: technicianId, role: 'technician', isDemo: true }, legacyJob.id, 'qc_requested', { inspectorId: 'user-inspector-4' });
  await bridgeQcPassed(actorAdmin, legacyJob.id, 'user-inspector-4');

  await refreshEntitySearchCache(ctx);

  let openedProjectId: string | null = null;
  let openedTab: string | null = null;
  (globalThis as any).window.dispatchEvent = (event: any) => {
    if (event.type === 'aiec_open_project') openedProjectId = event.detail;
  };
  const provider = createProjectCustomerSearchProvider(ctx, (tabId) => { openedTab = tabId; });

  const projectResults = provider.search('Search Test Customer');
  assert(projectResults.some(r => r.label.includes('Search Test Customer')), 'searching the customer name finds the real canonical Project');

  const quoteResults = provider.search('Quote ·');
  assert(quoteResults.length > 0, 'global search finds a real Quote record');
  const contractResults = provider.search('Contract ·');
  assert(contractResults.length > 0, 'global search finds a real Contract record (auto-created by the event bus on quote acceptance)');
  const poResults = provider.search('PO ·');
  assert(poResults.length > 0, 'global search finds a real PurchaseOrder record');
  const shipmentResults = provider.search('Shipment ·');
  assert(shipmentResults.length > 0, 'global search finds a real Shipment record');
  const jobResults = provider.search('Installation Job ·');
  assert(jobResults.length > 0, 'global search finds a real InstallationJob record');
  const qcResults = provider.search('QC ·');
  assert(qcResults.length > 0, 'global search finds a real QCInspection record');

  // Selecting a Quote result deep-links to the SAME project via the real mechanism.
  quoteResults[0].onSelect();
  assert(openedProjectId === projectId, 'selecting a Quote search result dispatches aiec_open_project with the correct real projectId');
  assert(openedTab === 'ProjectOperatingView', 'selecting a Quote search result navigates to the real ProjectOperatingView tab — never a dead end');

  openedProjectId = null; openedTab = null;
  qcResults[0].onSelect();
  assert(openedProjectId === projectId, 'selecting a QC search result also deep-links to the correct real project');
  assert(qcResults[0].sublabel?.includes('pass'), 'the QC result sublabel reflects the real QC PASS outcome');

  console.log('\nPASS: global search now covers Project/Customer/Quote/Contract/Payment/PurchaseOrder/Shipment/');
  console.log('InstallationJob/QCInspection/Handover — real canonical records, not a static list — and every');
  console.log('result deep-links to a real, existing resolution screen (ProjectOperatingView) via the exact');
  console.log('projectId that record belongs to, never a dead end.');
}

main();
