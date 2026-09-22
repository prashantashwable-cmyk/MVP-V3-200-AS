/**
 * Phase 06 acceptance check. Simulates exactly the 5 scenarios named in
 * 06_AUDIT_VERSIONING_IDEMPOTENCY.md:
 *   1. duplicate payment request
 *   2. duplicate webhook
 *   3. stale quote update
 *   4. repeated automation trigger
 *   5. repeated message send
 * Each must produce one logical effect. Also verifies an AuditEvent is
 * actually written for a governed mutation (`advanceProjectStage`).
 *
 * Run with: npx tsx scripts/idempotency-audit-check.ts
 */
import { runIdempotent } from '../src/lib/idempotency';
import { recordAuditEvent, listAuditEventsForEntity } from '../src/lib/audit';
import { isStaleWriteError } from '../src/repository/types';
import type { RepositoryContext } from '../src/repository/types';
import {
  createPaymentIdempotent,
  createPurchaseOrderIdempotent,
  quoteRepository,
  projectRepository,
  advanceProjectStage,
} from '../src/repository/entities';
import { asId } from '../src/domain/ids';
import type { PaymentId, ProjectId, QuoteId, PurchaseOrderId, CustomerId, SiteId, UserId, SupplierId, PaymentScheduleId } from '../src/domain/ids';
import type { Payment, PurchaseOrder, Quote, Project } from '../src/domain/entities';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`OK: ${msg}`);
}

const ctx: RepositoryContext = { environment: 'demo', actorUserId: 'user-finance-1' };

async function main() {
  // --- 1. Duplicate payment request --------------------------------------
  const payment: Payment = {
    id: asId<PaymentId>('pay_idem_1'),
    projectId: asId<ProjectId>('proj_idem_1'),
    paymentScheduleId: asId<PaymentScheduleId>('sched_idem_1'),
    installmentLabel: 'Advance (30%)',
    amount: 100000,
    path: 'direct',
    status: 'confirmed',
    idempotencyKey: 'idem-key-payment-abc',
    createdAt: new Date().toISOString(),
    createdBy: asId<UserId>('user-finance-1'),
  };
  const first = await createPaymentIdempotent(ctx, payment);
  const second = await createPaymentIdempotent(ctx, { ...payment, amount: 999999 /* attacker/bug tries to change amount on retry */ });
  assert(!first.wasDuplicate, 'first payment request executes the side effect');
  assert(second.wasDuplicate, 'second payment request with the same idempotencyKey is recognized as a duplicate');
  assert(second.payment.amount === 100000, 'duplicate payment request returns the ORIGINAL result, not a re-run with different data — one logical effect');

  // --- 2. Duplicate webhook -------------------------------------------------
  let webhookSideEffectCount = 0;
  const processWebhook = () => runIdempotent(ctx, 'webhook.process', 'stripe-evt-12345', async () => {
    webhookSideEffectCount++;
    return { processed: true, at: new Date().toISOString() };
  });
  await processWebhook();
  await processWebhook();
  await processWebhook();
  assert(webhookSideEffectCount === 1, 'a webhook delivered 3 times (provider retry) triggers its side effect exactly once');

  // --- 3. Stale quote update --------------------------------------------
  const quote: Quote = {
    id: asId<QuoteId>('quote_idem_1'),
    projectId: asId<ProjectId>('proj_idem_1'),
    status: 'draft',
    createdBy: asId<UserId>('user-sales-1'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await quoteRepository(ctx).create({ ...quote, version: 0 } as any);
  await quoteRepository(ctx).update(quote.id, { status: 'sent', version: 1 } as any, 0); // simulate a concurrent editor
  let staleQuoteRejected = false;
  try {
    await quoteRepository(ctx).update(quote.id, { status: 'negotiating', version: 1 } as any, 0 /* stale */);
  } catch (e) {
    staleQuoteRejected = isStaleWriteError(e);
  }
  assert(staleQuoteRejected, 'a stale quote update (based on an outdated version) is rejected, not silently applied over a concurrent change');

  // --- 4. Repeated automation trigger --------------------------------------
  let automationRunCount = 0;
  const triggerAutomation = () => runIdempotent(ctx, 'automation.trigger', 'QUOTE_ACCEPTED:proj_idem_1', async () => {
    automationRunCount++;
    return { contractCreated: true };
  });
  await triggerAutomation();
  await triggerAutomation(); // e.g. the same event re-delivered by the event bus after a retry
  assert(automationRunCount === 1, 'the same automation trigger (event + entity) firing twice runs its action exactly once');

  // --- 5. Repeated message send --------------------------------------------
  let messagesActuallySent = 0;
  const sendReminder = () => runIdempotent(ctx, 'notification.send', 'payment-reminder:pay_idem_1:day-3', async () => {
    messagesActuallySent++;
    return { channel: 'whatsapp', queued: true };
  });
  await sendReminder();
  await sendReminder();
  assert(messagesActuallySent === 1, 'a reminder notification scheduled/retried twice for the same (template, entity, day) is only actually sent once');

  // --- Duplicate PO creation (bonus, same mechanism) -----------------------
  const po: PurchaseOrder = {
    id: asId<PurchaseOrderId>('po_idem_1'),
    projectId: asId<ProjectId>('proj_idem_1'),
    supplierId: asId<SupplierId>('sup_1'),
    status: 'draft',
    amount: 50000,
    createdAt: new Date().toISOString(),
    createdBy: asId<UserId>('user-procurement-1'),
    idempotencyKey: 'idem-key-po-xyz',
  };
  const poFirst = await createPurchaseOrderIdempotent(ctx, po);
  const poSecond = await createPurchaseOrderIdempotent(ctx, po);
  assert(!poFirst.wasDuplicate && poSecond.wasDuplicate, 'duplicate PO creation request produces exactly one PO');

  // --- Audit trail: advanceProjectStage actually writes an AuditEvent -----
  const project: Project = {
    id: asId<ProjectId>('proj_idem_1'),
    customerId: asId<CustomerId>('cust_1'),
    siteId: asId<SiteId>('site_1'),
    stage: 'quoting',
    ownerUserId: asId<UserId>('user-sales-1'),
    title: 'Idempotency check project',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await projectRepository(ctx).create({ ...project, version: 0 } as any);
  await advanceProjectStage(ctx, project.id, 'negotiation', 0, 'admin');
  const auditTrail = await listAuditEventsForEntity(ctx, 'Project', project.id);
  assert(auditTrail.length === 1, 'advancing a project stage writes exactly one AuditEvent');
  assert(auditTrail[0].action === 'PROJECT_STAGE_ADVANCED', 'the AuditEvent records the correct action');
  assert((auditTrail[0].after as any).stage === 'negotiation', 'the AuditEvent after-state matches the new stage');
  assert(!!auditTrail[0].correlationId, 'the AuditEvent carries a correlationId for cross-service tracing');

  // Manual recordAuditEvent smoke test too (direct call path).
  await recordAuditEvent(ctx, {
    actorId: 'user-finance-1',
    actorRole: 'admin',
    action: 'MANUAL_TEST_EVENT',
    entityType: 'Payment',
    entityId: payment.id,
    source: 'api',
    correlationId: 'corr_manual_test',
  });
  const paymentAudit = await listAuditEventsForEntity(ctx, 'Payment', payment.id);
  assert(paymentAudit.some(e => e.action === 'MANUAL_TEST_EVENT'), 'recordAuditEvent writes a retrievable event for an arbitrary entity type');

  console.log('\nPASS: all 5 pack-specified duplicate/retry scenarios produce exactly one logical effect; audit trail is real and queryable.');
}

main();
