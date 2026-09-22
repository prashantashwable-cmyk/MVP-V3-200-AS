/**
 * Phase 07 acceptance check: the event bus runs the two worked examples
 * from 07_EVENT_BUS_WORKFLOW_AUTOMATION.md for real, retries and
 * dead-letters a genuinely failing handler, supports manual retry after
 * the underlying condition is fixed, and is idempotent under redelivery.
 *
 * Run with: npx tsx scripts/event-bus-check.ts
 */
import { publishEvent, retryDeadLetter, makeEvent } from '../src/events';
import { __setSimulateOverdueFailure } from '../src/events/handlers';
import { getRepository } from '../src/repository';
import type { RepositoryContext } from '../src/repository/types';
import {
  projectRepository, contractRepository, notificationRepository,
  snagRepository, handoverRepository,
} from '../src/repository/entities';
import { asId } from '../src/domain/ids';
import type { ProjectId, CustomerId, SiteId, UserId } from '../src/domain/ids';
import type { Project, WorkflowExecution } from '../src/domain/entities';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`OK: ${msg}`);
}

const ctx: RepositoryContext = { environment: 'demo', actorUserId: 'user-admin-1' };

async function main() {
  // --- Setup: a project that a quote can be accepted against -------------
  const projectId = 'proj_eventbus_1';
  const project: Project = {
    id: asId<ProjectId>(projectId),
    customerId: asId<CustomerId>('cust_1'),
    siteId: asId<SiteId>('site_1'),
    stage: 'quoting',
    ownerUserId: asId<UserId>('user-sales-1'),
    title: 'Event bus check project',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await projectRepository(ctx).create({ ...project, version: 0 } as any);

  // --- QUOTE_ACCEPTED: real, worked example -------------------------------
  const quoteAcceptedEvent = makeEvent({
    id: 'evt_quote_accepted_1',
    type: 'QUOTE_ACCEPTED',
    entityType: 'Quote',
    entityId: 'quote_1',
    projectId,
    payload: { quoteVersionId: 'qv_1', financeUserId: 'user-finance-1', operationsUserId: 'user-ops-1' },
  });
  const result1 = await publishEvent(ctx, quoteAcceptedEvent);
  assert(result1.outcomes.every(o => o.status === 'succeeded'), 'QUOTE_ACCEPTED handler(s) succeed');

  const contract = await contractRepository(ctx).get(`contract_${quoteAcceptedEvent.id}`);
  assert(contract !== null, 'QUOTE_ACCEPTED created a real Contract record');
  const projectAfterQuote = await projectRepository(ctx).get(projectId);
  assert(projectAfterQuote?.stage === 'contract', 'QUOTE_ACCEPTED advanced the Project to the contract stage');
  const financeNotif = await notificationRepository(ctx).get(`notif_${quoteAcceptedEvent.id}:finance`);
  const opsNotif = await notificationRepository(ctx).get(`notif_${quoteAcceptedEvent.id}:ops`);
  assert(financeNotif !== null && opsNotif !== null, 'QUOTE_ACCEPTED queued both a finance and an operations notification');

  // Redelivery: publishing the SAME event id again must not create a second contract/notification.
  const result1Again = await publishEvent(ctx, quoteAcceptedEvent);
  assert(result1Again.outcomes[0].wasDuplicateEvent, 'redelivering the same QUOTE_ACCEPTED event id is recognized as a duplicate');
  const allNotifs = await notificationRepository(ctx).list();
  const financeNotifCount = allNotifs.filter(n => n.id === `notif_${quoteAcceptedEvent.id}:finance`).length;
  assert(financeNotifCount === 1, 'redelivered QUOTE_ACCEPTED does not double-queue the finance notification');

  // --- QC_FAILED: real, worked example ------------------------------------
  const qcFailedEvent = makeEvent({
    id: 'evt_qc_failed_1',
    type: 'QC_FAILED',
    entityType: 'QCInspection',
    entityId: 'qc_1',
    projectId,
    payload: { qcInspectionId: 'qc_1', technicianId: 'user-tech-1', defectDescription: 'Door sensor misaligned' },
  });
  const result2 = await publishEvent(ctx, qcFailedEvent);
  assert(result2.outcomes.every(o => o.status === 'succeeded'), 'QC_FAILED handler(s) succeed');

  const snag = await snagRepository(ctx).get(`snag_${qcFailedEvent.id}`);
  assert(snag !== null && snag!.status === 'assigned' && snag!.assignedTo === 'user-tech-1', 'QC_FAILED created a Snag assigned to the technician');
  const handover = await handoverRepository(ctx).get(`handover_${projectId}` as any);
  assert(handover !== null && handover!.qcPassed === false && handover!.status === 'blocked_qc_not_passed', 'QC_FAILED left Handover explicitly blocked (qcPassed=false) — cannot accidentally reach handover');

  // --- Retry / dead-letter --------------------------------------------------
  __setSimulateOverdueFailure(true);
  const overdueEvent = makeEvent({
    id: 'evt_payment_overdue_1',
    type: 'PAYMENT_OVERDUE',
    entityType: 'Payment',
    entityId: 'pay_1',
    projectId,
    payload: { ownerUserId: 'user-finance-1' },
  });
  const result3 = await publishEvent(ctx, overdueEvent);
  assert(result3.outcomes[0].status === 'dead_letter', 'a handler that keeps failing is dead-lettered after exhausting retries');
  assert(result3.outcomes[0].attempts === 3, 'a dead-lettered handler was actually retried up to the max attempt count (3), not given up on immediately');

  const execRepo = getRepository<WorkflowExecution>('workflow_executions', ctx);
  const executions = await execRepo.list();
  const deadLetterExec = executions.find(e => e.status === 'dead_letter' && e.stepKey === 'escalateOverduePayment');
  assert(!!deadLetterExec, 'the dead-letter is persisted as a real WorkflowExecution record, not just an in-memory result');
  assert(!!deadLetterExec!.error, 'the persisted dead-letter record carries the actual error message');

  // Human escalation: fix the underlying condition, then manually retry.
  __setSimulateOverdueFailure(false);
  const retryResult = await retryDeadLetter(ctx, overdueEvent, 'escalateOverduePayment');
  assert(retryResult.status === 'succeeded', 'manual retry after fixing the underlying condition succeeds');

  console.log('\nPASS: event bus runs both worked examples for real, is idempotent under redelivery, retries a failing handler, dead-letters it with a real persisted record, and supports manual retry.');
}

main();
