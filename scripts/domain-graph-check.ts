/**
 * Phase 02 acceptance check: prove that
 *   Customer → Site → Project → Quote → Contract → Payment
 * can be represented through one coherent ID graph, built from realistic
 * legacy-shaped data (Lead/Deal/Payment as they exist in src/types.ts
 * today) via src/domain/adapters.ts, plus canonical Quote/Contract
 * records (which have no legacy equivalent to adapt from).
 *
 * Run with: npx tsx scripts/domain-graph-check.ts
 * No test framework exists in this repo (see Phase 01 baseline); this is
 * a standalone, dependency-free smoke check that exits non-zero on any
 * broken link, so it is CI-runnable as-is.
 */

import type { Lead, Deal, Payment as LegacyPayment } from '../src/types';
import {
  leadToCustomer,
  leadToSite,
  leadAndDealToProject,
  legacyPaymentToCanonical,
  projectToDefaultPaymentSchedule,
} from '../src/domain/adapters';
import { asId, type ContractId, type QuoteId, type QuoteVersionId, type UserId } from '../src/domain/ids';
import type { Quote, QuoteVersion, Contract } from '../src/domain/entities';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`OK: ${msg}`);
}

// --- realistic legacy fixtures --------------------------------------------

const lead: Lead = {
  id: 'lead-9001',
  stage: 'closed_won',
  surveyorId: 'user-surveyor-1',
  contactInfo: { name: 'Rina Mehta', phone: '9876500000', email: 'rina@example.com' },
  buildingInfo: { address: '12 MG Road, Pune', floors: 8, type: 'residential' },
  createdAt: '2026-01-05T09:00:00Z',
  updatedAt: '2026-01-20T09:00:00Z',
};

const deal: Deal = {
  id: 'deal-4001',
  leadId: lead.id,
  status: 'closed',
  agreedPrice: 1200000,
  advancePaid: true,
  specs: { floors: 8, driveType: 'traction', capacity: '8-person', cabinStyle: 'standard' },
  createdAt: '2026-01-21T09:00:00Z',
};

const legacyPayments: LegacyPayment[] = [
  { id: 'pay-1', dealId: deal.id, stage: 'Advance (30%)', amount: 360000, status: 'paid', dueDate: '2026-01-21', paidAt: '2026-01-21' },
  { id: 'pay-2', dealId: deal.id, stage: 'Material Delivery (40%)', amount: 480000, status: 'pending', dueDate: '2026-03-01' },
];

const ownerUserId = asId<UserId>('user-sales-1');

// --- build the canonical graph ---------------------------------------------

const customer = leadToCustomer(lead);
const site = leadToSite(lead, customer.id);
const project = leadAndDealToProject(lead, deal, customer.id, site.id, ownerUserId);

const quoteVersion: QuoteVersion = {
  id: asId<QuoteVersionId>('qv-1'),
  quoteId: asId<QuoteId>('quote-1'),
  projectId: project.id,
  versionNumber: 1,
  lineItems: [{ description: '8-person traction elevator', qty: 1, unitPrice: deal.agreedPrice }],
  totalAmount: deal.agreedPrice,
  createdAt: '2026-01-15T09:00:00Z',
  createdBy: ownerUserId,
};

const quote: Quote = {
  id: quoteVersion.quoteId,
  projectId: project.id,
  status: 'accepted',
  currentVersionId: quoteVersion.id,
  createdBy: ownerUserId,
  createdAt: '2026-01-10T09:00:00Z',
  updatedAt: '2026-01-20T09:00:00Z',
};

const contract: Contract = {
  id: asId<ContractId>('contract-1'),
  projectId: project.id,
  quoteVersionId: quoteVersion.id,
  status: 'signed',
  signedAt: '2026-01-21T08:00:00Z',
  signedByCustomer: true,
  createdAt: '2026-01-20T09:00:00Z',
  updatedAt: '2026-01-21T08:00:00Z',
};

const schedule = projectToDefaultPaymentSchedule(project, contract.id, legacyPayments);
const payments = legacyPayments.map(p => legacyPaymentToCanonical(p, project.id, schedule.id, ownerUserId));

// --- assertions: every link in the chain resolves by ID --------------------

assert(site.customerId === customer.id, 'Site.customerId points at Customer.id');
assert(project.customerId === customer.id, 'Project.customerId points at Customer.id');
assert(project.siteId === site.id, 'Project.siteId points at Site.id');
assert(project.sourceLeadId === (lead.id as any), 'Project.sourceLeadId points at the originating Lead.id');
assert(quote.projectId === project.id, 'Quote.projectId points at Project.id');
assert(quoteVersion.quoteId === quote.id, 'QuoteVersion.quoteId points at Quote.id');
assert(quote.currentVersionId === quoteVersion.id, 'Quote.currentVersionId points at QuoteVersion.id');
assert(contract.projectId === project.id, 'Contract.projectId points at Project.id');
assert(contract.quoteVersionId === quoteVersion.id, 'Contract.quoteVersionId points at the accepted QuoteVersion.id');
assert(schedule.projectId === project.id, 'PaymentSchedule.projectId points at Project.id');
assert(schedule.contractId === contract.id, 'PaymentSchedule.contractId points at Contract.id');
assert(payments.length === 2, 'Both legacy payments converted');
for (const p of payments) {
  assert(p.projectId === project.id, `Payment ${p.id}.projectId points at Project.id`);
  assert(p.paymentScheduleId === schedule.id, `Payment ${p.id}.paymentScheduleId points at PaymentSchedule.id`);
  assert(p.idempotencyKey.length > 0, `Payment ${p.id} carries an idempotency key`);
}
assert(payments[0].status === 'confirmed', 'Paid legacy payment maps to confirmed status');
assert(payments[1].status === 'initiated', 'Pending legacy payment maps to initiated status');

console.log('\nPASS: Customer -> Site -> Project -> Quote -> Contract -> Payment graph is coherent via stable IDs.');
console.log(JSON.stringify({ customer, site, project, quote, quoteVersion, contract, schedule, payments }, null, 2));
