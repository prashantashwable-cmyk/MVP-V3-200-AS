/**
 * Phase 15 acceptance check: proves `src/services/legacyCommercialBridge.ts`
 * — the dual-write bridge now wired into `LeadKanban`, `LeadDetail`,
 * `PaymentCollectionDashboard`, and `OnlinePaymentCheckout` — really
 * drives the canonical Quote/Contract/Payment lifecycle from real legacy
 * Lead/Deal/Payment shapes, not just from hand-built canonical fixtures
 * (as scripts/commercial-workflow-check.ts's Phase 08 check does).
 *
 * Run with: npx tsx scripts/commercial-core-bridge-check.ts
 */
import './polyfillBrowserGlobals';
import { DbManager } from '../src/lib/db';
import type { Lead, Deal, Payment as LegacyPayment } from '../src/types';
import { bridgeLeadStageTransition, bridgeLegacyPaymentConfirmed, ensureCanonicalProject } from '../src/services/legacyCommercialBridge';
import { quoteRepository, contractRepository, paymentRepository } from '../src/repository/entities';
import type { RepositoryContext } from '../src/repository/types';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`OK: ${msg}`);
}

// isDemo: true routes RepositoryContext.environment to 'demo' (the
// isolated in-memory repository — see src/lib/environment.ts), the same
// way every other acceptance script in this suite runs without live
// Firestore credentials (see Phase 04's documented credential gap).
const actorAdmin = { id: 'user-admin-1', role: 'admin' as const, authMethod: 'firebase_auth', isDemo: true };
const actorTechnician = { id: 'user-tech-1', role: 'technician' as const, authMethod: 'firebase_auth', isDemo: true };
const actorSupplier = { id: 'user-supplier-1', role: 'supplier' as const, authMethod: 'firebase_auth', isDemo: true };

const lead: Lead = {
  id: 'lead-bridge-1',
  stage: 'contacted',
  surveyorId: 'user-surveyor-1',
  contactInfo: { name: 'Bridge Test Customer', phone: '9990001111', email: 'bridge@example.com' },
  buildingInfo: { address: '77 Bridge Lane, Pune', floors: 6, type: 'residential' },
  createdAt: '2026-02-01T09:00:00Z',
  updatedAt: '2026-02-01T09:00:00Z',
};

async function main() {
  // Seed the lead into the real (localStorage-polyfilled) DbManager, the
  // same way LeadKanban/LeadDetail would already have it from real data.
  DbManager.addLead(lead);

  // --- 1. 'quoted' bridges to a real canonical Quote (create+approve+send)
  const r1 = await bridgeLeadStageTransition(actorAdmin, lead, undefined, 'quoted', { quoteAmount: 950000 });
  assert(r1.bridged, 'lead moved to "quoted" bridges to a real canonical Quote');

  const ctx: RepositoryContext = { environment: 'demo', actorUserId: actorAdmin.id };
  const { projectId } = await ensureCanonicalProject(ctx, lead, undefined);
  let quotes = await quoteRepository(ctx).query({ projectId });
  assert(quotes.length === 1, 'exactly one canonical Quote exists for this project after the "quoted" bridge');
  assert(quotes[0].status === 'sent', 'the bridged quote is in "sent" status, ready for a customer decision');

  // Idempotency: re-entering 'quoted' (e.g. a user dragging the card
  // twice) must not create a second Quote.
  await bridgeLeadStageTransition(actorAdmin, lead, undefined, 'quoted', { quoteAmount: 950000 });
  quotes = await quoteRepository(ctx).query({ projectId });
  assert(quotes.length === 1, 'repeating the "quoted" bridge does not create a duplicate Quote');

  // --- 2. 'closed_won' bridges to customer acceptance + auto-drafted Contract
  const deal: Deal = {
    id: 'deal-bridge-1',
    leadId: lead.id,
    status: 'closed',
    agreedPrice: 950000,
    advancePaid: true,
    specs: { floors: 6, driveType: 'traction', capacity: '6-person', cabinStyle: 'standard' },
    createdAt: '2026-02-05T09:00:00Z',
  };
  DbManager.addDeal(deal);
  const leadClosedWon: Lead = { ...lead, stage: 'closed_won' };
  const r2 = await bridgeLeadStageTransition(actorAdmin, leadClosedWon, deal, 'closed_won');
  assert(r2.bridged, 'lead moved to "closed_won" bridges to a real customer-accepted Quote');

  const quoteAfterAccept = (await quoteRepository(ctx).query({ projectId }))[0];
  assert(quoteAfterAccept.status === 'accepted', 'the bridged quote is now "accepted"');

  const contracts = await contractRepository(ctx).list();
  const contract = contracts.find(c => c.projectId === projectId);
  assert(!!contract, 'accepting the bridged quote auto-created a real canonical Contract via the Phase 07 event bus — no direct call between the bridge and contract creation');
  assert(contract!.status === 'draft', 'the auto-created contract is "draft" — the bridge stops there and does not fabricate a customer signature');

  // --- 3. unauthorized role cannot bridge a quote creation
  const lead2: Lead = { ...lead, id: 'lead-bridge-2' };
  const r3 = await bridgeLeadStageTransition(actorTechnician, lead2, undefined, 'quoted', { quoteAmount: 500000 });
  assert(!r3.bridged, 'a technician (no quote.create permission) cannot bridge a lead to "quoted" — denied, not silently allowed');

  // --- 4. payment bridge: real, idempotent canonical Payment
  const legacyPayment: LegacyPayment = {
    id: 'pay-bridge-1', dealId: deal.id, stage: 'Advance (30%)', amount: 285000, paidAmount: 285000,
    status: 'paid', dueDate: '2026-02-10', paidAt: '2026-02-10T10:00:00Z', paymentMethod: 'UPI', referenceNo: 'TXN-BRIDGE-1',
  };
  const p1 = await bridgeLegacyPaymentConfirmed(actorAdmin, legacyPayment);
  assert(p1.bridged, 'a confirmed legacy payment bridges to a real canonical Payment');

  const p2 = await bridgeLegacyPaymentConfirmed(actorAdmin, legacyPayment); // simulated retry, same payment id
  assert(p2.bridged, 'retrying the same legacy payment bridge does not fail');

  const projectPayments = (await paymentRepository(ctx).list()).filter(p => p.projectId === projectId);
  assert(projectPayments.length === 1, 'retrying the payment bridge is idempotent — exactly one canonical Payment record, not two');

  // --- 5. unauthorized payment bridge
  const legacyPayment2: LegacyPayment = { ...legacyPayment, id: 'pay-bridge-2' };
  const r5 = await bridgeLegacyPaymentConfirmed(actorSupplier, legacyPayment2);
  assert(!r5.bridged, 'a supplier cannot bridge a customer payment confirmation — denied, not silently allowed');

  // --- 6. a payment referencing an unknown deal fails soft, not hard
  const orphanPayment: LegacyPayment = { ...legacyPayment, id: 'pay-bridge-orphan', dealId: 'deal-does-not-exist' };
  const r6 = await bridgeLegacyPaymentConfirmed(actorAdmin, orphanPayment);
  assert(!r6.bridged && !!r6.reason, 'a payment referencing an unknown deal reports a reason instead of throwing');

  console.log('\nPASS: legacyCommercialBridge.ts drives a real project from a legacy Lead card move through a canonical');
  console.log('Quote, an auto-drafted Contract, and an idempotent canonical Payment — authorization-checked, and never');
  console.log('throwing out to the legacy screen that called it — using the exact functions now wired into LeadKanban,');
  console.log('LeadDetail, PaymentCollectionDashboard, and OnlinePaymentCheckout.');
}

main();
