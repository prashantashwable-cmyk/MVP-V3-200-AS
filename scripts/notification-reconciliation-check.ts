/**
 * Phase 11 acceptance check — centralized notifications (honest channel
 * status, idempotent delivery) and the reusable reconciliation model.
 *
 * Run with: npx tsx scripts/notification-reconciliation-check.ts
 */
import { sendNotification } from '../src/services/notificationService';
import { reconcile, reconcilePayments, type ExternalRecord } from '../src/services/reconciliationService';
import { paymentRepository } from '../src/repository/entities';
import { getRepository } from '../src/repository';
import type { RepositoryContext } from '../src/repository/types';
import type { NotificationRecord, ReconciliationRecord, Payment } from '../src/domain/entities';
import { asId } from '../src/domain/ids';
import type { PaymentId, ProjectId, PaymentScheduleId, UserId } from '../src/domain/ids';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`OK: ${msg}`);
}

const ctx: RepositoryContext = { environment: 'demo', actorUserId: 'user-admin-1' };

async function notificationScenario() {
  const { results, wasDuplicate } = await sendNotification(ctx, {
    audienceUserId: 'user-finance-1', templateId: 'quote_accepted_finance', priority: 'normal',
    projectId: 'proj_notif_1', dedupeKey: 'proj_notif_1',
  });
  assert(!wasDuplicate, 'first send is not a duplicate');
  assert(results.length === 2, '"normal" priority fans out to exactly its 2 policy channels (in_app, email)');

  const inAppResult = results.find(r => r.channel === 'in_app')!;
  const emailResult = results.find(r => r.channel === 'email')!;
  assert(inAppResult.status === 'delivered', 'in_app channel is honestly reported as delivered (it is its own database record)');
  assert(emailResult.status === 'queued', 'email channel is honestly reported as QUEUED, not falsely "delivered" — no real provider is configured');
  assert(!!emailResult.reason, 'the queued status carries a real reason (no simulated external delivery success)');

  const notifRepo = getRepository<NotificationRecord>('notifications', ctx);
  const inAppRecord = await notifRepo.get('notif_quote_accepted_finance_proj_notif_1_in_app');
  assert(inAppRecord?.status === 'delivered', 'the persisted NotificationRecord for in_app matches the honest delivered status');
  const emailRecord = await notifRepo.get('notif_quote_accepted_finance_proj_notif_1_email');
  assert(emailRecord?.status === 'queued', 'the persisted NotificationRecord for email matches the honest queued status');

  // Repeated trigger for the same logical reminder (e.g. event bus redelivery) — one logical send.
  const second = await sendNotification(ctx, {
    audienceUserId: 'user-finance-1', templateId: 'quote_accepted_finance', priority: 'normal',
    projectId: 'proj_notif_1', dedupeKey: 'proj_notif_1',
  });
  assert(second.wasDuplicate, 'a repeated trigger for the same (template, dedupeKey) is recognized as a duplicate — one logical notification');

  // Urgent priority fans out to all 4 channels.
  const urgent = await sendNotification(ctx, {
    audienceUserId: 'user-tech-1', templateId: 'qc_failed_rework_assigned', priority: 'urgent', dedupeKey: 'qc_urgent_1',
  });
  assert(urgent.results.length === 4, '"urgent" priority fans out to all 4 policy channels (in_app, email, whatsapp, sms)');
}

async function reconciliationScenario() {
  // Pure matcher: matched, mismatch, missing both directions, duplicate.
  const internal = [
    { id: 'pay_1', key: 'REF-001', amount: 1000 },
    { id: 'pay_2', key: 'REF-002', amount: 2000 }, // will mismatch
    { id: 'pay_3', key: 'REF-003', amount: 3000 }, // missing_external
    { id: 'pay_4', key: 'REF-004', amount: 4000 }, // duplicate key
    { id: 'pay_5', key: 'REF-004', amount: 4000 }, // duplicate key
  ];
  const external: ExternalRecord[] = [
    { id: 'ext_1', key: 'REF-001', amount: 1000 },
    { id: 'ext_2', key: 'REF-002', amount: 2500 }, // amount differs -> mismatch
    { id: 'ext_3', key: 'REF-999', amount: 500 }, // missing_internal
  ];
  const results = reconcile(internal, external);
  const byStatus = (s: string) => results.filter(r => r.status === s);
  assert(byStatus('matched').length === 1, 'exactly one matched record (REF-001)');
  assert(byStatus('mismatch').length === 1, 'exactly one mismatch record (REF-002, amount differs)');
  assert(byStatus('missing_external').length === 1, 'exactly one missing_external record (REF-003, no external counterpart)');
  assert(byStatus('missing_internal').length === 1, 'exactly one missing_internal record (REF-999, no internal counterpart)');
  assert(byStatus('duplicate').length === 2, 'both REF-004 internal records flagged as duplicate (same key appears twice internally)');

  // Wired to the repository layer for the payments domain.
  const projectId = 'proj_recon_1';
  await paymentRepository(ctx).create({
    id: asId<PaymentId>('pay_recon_1'), projectId: projectId as ProjectId, paymentScheduleId: asId<PaymentScheduleId>('sched_recon_1'),
    installmentLabel: 'Advance', amount: 100000, path: 'direct', status: 'confirmed', idempotencyKey: 'idem-recon-1',
    referenceNo: 'GATEWAY-REF-1', createdAt: new Date().toISOString(), createdBy: asId<UserId>('user-finance-1'),
  } as Payment);
  await paymentRepository(ctx).create({
    id: asId<PaymentId>('pay_recon_2'), projectId: projectId as ProjectId, paymentScheduleId: asId<PaymentScheduleId>('sched_recon_1'),
    installmentLabel: 'Material', amount: 200000, path: 'direct', status: 'initiated' /* not confirmed — excluded */, idempotencyKey: 'idem-recon-2',
    createdAt: new Date().toISOString(), createdBy: asId<UserId>('user-finance-1'),
  } as Payment);

  const externalBankRecords: ExternalRecord[] = [{ id: 'bank_1', key: 'GATEWAY-REF-1', amount: 100000 }];
  const records = await reconcilePayments(ctx, projectId, externalBankRecords);
  assert(records.length === 1, 'only CONFIRMED payments are included in reconciliation — the still-initiated payment is correctly excluded');
  assert(records[0].status === 'matched', 'the confirmed payment matches its bank record');

  const persisted = await getRepository<ReconciliationRecord>('reconciliation_records', ctx).get(records[0].id);
  assert(!!persisted && persisted!.status === 'matched', 'the reconciliation result is persisted through the repository layer, queryable later');

  // A mismatch/missing scenario flags for manual resolution.
  const projectId2 = 'proj_recon_2';
  await paymentRepository(ctx).create({
    id: asId<PaymentId>('pay_recon_3'), projectId: projectId2 as ProjectId, paymentScheduleId: asId<PaymentScheduleId>('sched_recon_2'),
    installmentLabel: 'Advance', amount: 50000, path: 'direct', status: 'confirmed', idempotencyKey: 'idem-recon-3',
    referenceNo: 'GATEWAY-REF-3', createdAt: new Date().toISOString(), createdBy: asId<UserId>('user-finance-1'),
  } as Payment);
  const records2 = await reconcilePayments(ctx, projectId2, [] /* no matching external record at all */);
  assert(records2[0].status === 'pending', 'an unmatched payment (no external counterpart yet) is flagged pending for triage, not silently marked matched');
}

async function main() {
  await notificationScenario();
  await reconciliationScenario();
  console.log('\nPASS: notifications report honest per-channel delivery status (in_app real, external channels correctly queued-not-delivered),');
  console.log('duplicate triggers produce one logical send, and the reconciliation model correctly classifies matched/mismatch/missing-both-directions/duplicate.');
}

main();
