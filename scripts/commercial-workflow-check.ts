/**
 * Phase 08 acceptance check: a project travels from accepted quote
 * through contract, payment, and procurement (through dispatch) purely
 * by calling src/services/commercialWorkflow.ts functions — the
 * equivalent of Scenario A + B from
 * 13_FINAL_END_TO_END_ACCEPTANCE.md, run early against the
 * orchestration layer directly (Phase 13 re-runs the full scenario set
 * once the remaining phases are in place).
 *
 * Run with: npx tsx scripts/commercial-workflow-check.ts
 */
import {
  createQuote, approveQuote, sendQuote, recordCustomerQuoteDecision,
  signContract, collectInstallment, createProcurementPO, approvePO,
  recordSupplierAcceptance, dispatchMaterial,
} from '../src/services/commercialWorkflow';
import { assertPermission, AuthorizationError } from '../src/lib/authz';
import { projectRepository, contractRepository, purchaseOrderRepository } from '../src/repository/entities';
import type { RepositoryContext } from '../src/repository/types';
import { asId } from '../src/domain/ids';
import type { ProjectId, CustomerId, SiteId, UserId } from '../src/domain/ids';
import type { Project } from '../src/domain/entities';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`OK: ${msg}`);
}

const ctx: RepositoryContext = { environment: 'demo', actorUserId: 'user-sales-1' };
const salesActor = { userId: 'user-sales-1', role: 'surveyor' as const, authMethod: 'firebase_auth' };
const adminActor = { userId: 'user-admin-1', role: 'admin' as const, authMethod: 'firebase_auth' };
const customerActor = { userId: 'user-customer-1', role: 'customer' as const, authMethod: 'firebase_auth' };

async function main() {
  const projectId = 'proj_commercial_check';
  const project: Project = {
    id: asId<ProjectId>(projectId),
    customerId: asId<CustomerId>('cust_commercial'),
    siteId: asId<SiteId>('site_commercial'),
    stage: 'quoting',
    ownerUserId: asId<UserId>('user-sales-1'),
    title: 'Commercial workflow check project',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await projectRepository(ctx).create({ ...project, version: 0 } as any);

  // --- Quote: create -> approve -> send -> customer accepts ---------------
  const { quote } = await createQuote(ctx, salesActor, projectId, [
    { description: '8-person traction elevator', qty: 1, unitPrice: 1200000 },
  ]);
  assert(quote.status === 'draft', 'quote created in draft status');

  let unauthorizedApproveDenied = false;
  try {
    await approveQuote(ctx, salesActor, quote.id, 0); // surveyor cannot approve
  } catch (e) {
    unauthorizedApproveDenied = e instanceof AuthorizationError;
  }
  assert(unauthorizedApproveDenied, 'a surveyor cannot approve their own quote (unauthorized quote approval denied)');

  const approved = await approveQuote(ctx, adminActor, quote.id, 0);
  assert(approved.status === 'approved', 'admin approves the quote');

  const sent = await sendQuote(ctx, salesActor, quote.id, 1);
  assert(sent.status === 'sent', 'quote sent to customer');

  const { quote: accepted, contractCreated } = await recordCustomerQuoteDecision(
    ctx, quote.id, 2, 'accept', { financeUserId: 'user-finance-1', operationsUserId: 'user-ops-1' },
  );
  assert(accepted.status === 'accepted', 'customer acceptance recorded on the quote');
  assert(contractCreated, 'accepting the quote automatically created a Contract via the event bus — no manual screen-stitching');

  const contract = (await contractRepository(ctx).list()).find(c => c.projectId === projectId);
  assert(!!contract, 'a real Contract record now exists for this project');
  const projectAfterAccept = await projectRepository(ctx).get(projectId);
  assert(projectAfterAccept?.stage === 'contract', 'Project automatically advanced to the contract stage');

  // --- Contract signature -> payment schedule ------------------------------
  const { schedule } = await signContract(ctx, adminActor, contract!.id, [
    { label: 'Advance (30%)', percentOfTotal: 30 },
    { label: 'Material Delivery (40%)', percentOfTotal: 40 },
    { label: 'Installation Start (20%)', percentOfTotal: 20 },
    { label: 'Handover & QC (10%)', percentOfTotal: 10 },
  ]);
  assert(schedule.installments.length === 4, 'payment schedule created with all 4 installments');
  assert(schedule.installments[0].amount === 360000, 'advance installment amount correctly computed from the accepted quote total');
  const projectAfterSign = await projectRepository(ctx).get(projectId);
  assert(projectAfterSign?.stage === 'payment', 'Project advanced to the payment stage on contract signature');

  // --- Payment collection ---------------------------------------------------
  const { payment, wasDuplicate: paymentDup1 } = await collectInstallment(ctx, adminActor, schedule.id, 'Advance (30%)', 360000, 'idem-advance-1');
  assert(!paymentDup1, 'advance payment collected');
  const { wasDuplicate: paymentDup2 } = await collectInstallment(ctx, adminActor, schedule.id, 'Advance (30%)', 360000, 'idem-advance-1');
  assert(paymentDup2, 'a retried advance-payment request (same idempotency key) does not double-charge');

  let unauthorizedPaymentDenied = false;
  try {
    await collectInstallment(ctx, { userId: 'x', role: 'supplier', authMethod: 'firebase_auth' }, schedule.id, 'x', 1, 'idem-x');
  } catch (e) {
    unauthorizedPaymentDenied = e instanceof AuthorizationError;
  }
  assert(unauthorizedPaymentDenied, 'a supplier cannot record a customer payment (unauthorized payment.create denied)');

  const projectAfterPayment = await projectRepository(ctx).get(projectId);
  assert(projectAfterPayment?.stage === 'procurement', 'Project advanced to the procurement stage once the advance payment landed');

  // --- Procurement: PO -> approval -> supplier acceptance -> dispatch -----
  const { po } = await createProcurementPO(ctx, adminActor, projectId, 'supplier_1', 500000, 'idem-po-1');
  assert(po.status === 'pending_approval', 'PO created pending approval');

  let unauthorizedPoApproveDenied = false;
  try {
    await approvePO(ctx, salesActor, po.id); // surveyor role has no po.approve permission
  } catch (e) {
    unauthorizedPoApproveDenied = e instanceof AuthorizationError;
  }
  assert(unauthorizedPoApproveDenied, 'a surveyor cannot approve a purchase order (unauthorized po.approve denied)');

  const approvedPO = await approvePO(ctx, adminActor, po.id);
  assert(approvedPO.status === 'sent_to_supplier', 'admin approves the PO, sent to supplier');

  await recordSupplierAcceptance(ctx, po.id);
  const dispatched = await dispatchMaterial(ctx, po.id);
  assert(dispatched.status === 'dispatched', 'material dispatched');

  const projectAfterDispatch = await projectRepository(ctx).get(projectId);
  assert(projectAfterDispatch?.stage === 'delivery', 'Project advanced to the delivery stage on dispatch — end of Phase 08 scope, Phase 09 continues from here');

  // --- Every record traces back to the same project (Phase 13 Scenario B) -
  const allPOs = await purchaseOrderRepository(ctx).list();
  assert(allPOs.every(p => p.projectId !== projectId || p.id === po.id), 'no stray PO records for this project');
  console.log('\nPASS: a project travels end-to-end from accepted quote through contract, payment, and procurement dispatch,');
  console.log('purely via commercialWorkflow.ts service calls — permission-checked, audited, idempotent, and');
  console.log('event-driven where a real handler exists — with zero manual screen-stitching by the caller.');
}

main();
