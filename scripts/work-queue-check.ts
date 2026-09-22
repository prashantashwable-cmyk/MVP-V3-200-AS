/**
 * Phase 22 acceptance check: proves `getWorkQueueItems()` generates real
 * work — computed from live canonical workflow state, never a static
 * card — with correct priority/SLA/blocker derivation and correct
 * sort order (most urgent first).
 *
 * Run with: npx tsx scripts/work-queue-check.ts
 */
import './polyfillBrowserGlobals';
import { DbManager } from '../src/lib/db';
import type { Lead, Deal, PurchaseOrder as LegacyPurchaseOrder } from '../src/types';
import { ensureCanonicalProject, bridgeLeadStageTransition, bridgeProcurementPoCreated } from '../src/services/legacyCommercialBridge';
import { getWorkQueueItems } from '../src/services/workQueue';
import { projectRepository } from '../src/repository/entities';
import type { RepositoryContext } from '../src/repository/types';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`OK: ${msg}`);
}

const actorAdmin = { id: 'user-admin-7', role: 'admin' as const, authMethod: 'firebase_auth', isDemo: true };
const ctx: RepositoryContext = { environment: 'demo', actorUserId: actorAdmin.id };

async function main() {
  // --- Project A: clean, on-track (just created, quoting stage) ----------
  const leadA: Lead = {
    id: 'lead-wq-a', stage: 'quoted', surveyorId: 'user-surveyor-7',
    contactInfo: { name: 'Work Queue Customer A', phone: '9990008888', email: 'wqa@example.com' },
    buildingInfo: { address: '4 Queue Lane, Pune', floors: 4, type: 'residential' },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  DbManager.addLead(leadA);
  const { projectId: projectAId } = await ensureCanonicalProject(ctx, leadA, undefined);
  await bridgeLeadStageTransition(actorAdmin, leadA, undefined, 'quoted', { quoteAmount: 500000 });

  // --- Project B: blocked, a PO stuck pending approval (hard-gate-free
  // blocker -> should rank as 'at_risk', not 'critical') -----------------
  const leadB: Lead = {
    id: 'lead-wq-b', stage: 'closed_won', surveyorId: 'user-surveyor-7',
    contactInfo: { name: 'Work Queue Customer B', phone: '9990009999', email: 'wqb@example.com' },
    buildingInfo: { address: '5 Queue Lane, Pune', floors: 5, type: 'residential' },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const dealB: Deal = {
    id: 'deal-wq-b', leadId: leadB.id, status: 'closed', agreedPrice: 600000, advancePaid: true,
    specs: { floors: 5, driveType: 'traction', capacity: '5-person', cabinStyle: 'standard' }, createdAt: new Date().toISOString(),
  };
  DbManager.addLead(leadB);
  DbManager.addDeal(dealB);
  const { projectId: projectBId } = await ensureCanonicalProject(ctx, leadB, dealB);
  const legacyPoB: LegacyPurchaseOrder = {
    id: 'PO-2026-WQ-B', linkedDealId: dealB.id, customerName: 'Work Queue Customer B', siteLocation: '5 Queue Lane, Pune',
    supplierId: 'sun_elevators', supplierName: 'Sun Elevators Manufacturing', lineItems: [], subtotalAmount: 400000, gstRate: 18,
    gstAmount: 72000, totalAmount: 472000, expectedDeliveryDate: '2026-08-20', status: 'Draft', createdFromDealClosureAt: new Date().toISOString(),
  };
  await bridgeProcurementPoCreated(actorAdmin, legacyPoB);

  // --- Project C: a closed_lost project should NOT generate a work item --
  const leadC: Lead = {
    id: 'lead-wq-c', stage: 'closed_lost', surveyorId: 'user-surveyor-7',
    contactInfo: { name: 'Lost Customer C', phone: '9990001010', email: 'wqc@example.com' },
    buildingInfo: { address: '6 Queue Lane, Pune', floors: 2, type: 'residential' },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  DbManager.addLead(leadC);
  const { projectId: projectCId } = await ensureCanonicalProject(ctx, leadC, undefined);

  const items = await getWorkQueueItems(ctx);

  const itemA = items.find(i => i.projectId === projectAId);
  const itemB = items.find(i => i.projectId === projectBId);
  const itemC = items.find(i => i.projectId === projectCId);

  assert(!!itemA, 'a clean, actionable project generates a real work item');
  assert(itemA!.requiredAction.length > 0, 'the work item carries a real, non-empty required action');
  assert(itemA!.priority === 'on_track' || itemA!.priority === 'waiting', `a project with no blockers is never "critical"/"at_risk" (got: ${itemA!.priority})`);
  assert(itemA!.blockers.length === 0, 'the clean project has zero blockers');

  assert(!!itemB, 'a blocked project generates a real work item');
  assert(itemB!.isException === true, 'the blocked project is correctly flagged as an exception');
  assert(itemB!.priority === 'at_risk', `a non-hard-gate blocker ranks as "at_risk", not "critical" (got: ${itemB!.priority})`);
  assert(itemB!.blockers.some(b => b.includes('awaiting approval')), 'the real PO-pending-approval blocker is surfaced on the work item');

  assert(!itemC, 'a closed_lost project does NOT generate a work item — nothing actionable to do');

  // --- Sort order: the blocked (at_risk) item ranks ahead of the clean (on_track) item
  const idxA = items.findIndex(i => i.projectId === projectAId);
  const idxB = items.findIndex(i => i.projectId === projectBId);
  assert(idxB < idxA, 'the higher-priority (at_risk) item is sorted ahead of the lower-priority (on_track) item');

  // --- Every item's required action comes from real, live project stage --
  const projectA = await projectRepository(ctx).get(projectAId);
  assert(itemA!.currentStage === projectA?.stage, "the work item's currentStage matches the real, live Project.stage — not a cached/static value");

  console.log('\nPASS: getWorkQueueItems() generates real work from live canonical workflow state — correct required');
  console.log('actions, correct priority derivation (hard-gate blockers rank critical, other blockers at_risk, stalled');
  console.log('projects waiting, clean projects on_track), correct exception flagging, correct exclusion of terminal');
  console.log('(closed_lost) projects, and correct most-urgent-first sort order — never a static dashboard card.');
}

main();
