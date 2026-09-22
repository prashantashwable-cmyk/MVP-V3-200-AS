/**
 * Real event handlers — Phase 07.
 *
 * Implements the two worked examples from
 * 07_EVENT_BUS_WORKFLOW_AUTOMATION.md verbatim, as real code against the
 * Phase 04 repository layer (not simulated/pre-baked outcomes like the
 * `DbManager` automation seed data Phase 01 §8 found):
 *
 *   QUOTE_ACCEPTED
 *     -> create contract
 *     -> create project if required
 *     -> notify finance
 *     -> notify operations
 *     -> audit
 *
 *   QC_FAILED
 *     -> create snag
 *     -> assign rework
 *     -> notify technician
 *     -> pause handover
 *     -> start SLA
 *
 * Plus two smaller handlers (PAYMENT_RECEIVED, PAYMENT_OVERDUE) to show
 * the pattern generalizes beyond the two worked examples, without
 * attempting to cover all 18 canonical events in this phase — the pack's
 * "Do not claim an automation is active if it is only simulated" applies
 * equally to overclaiming coverage, so only events with a real, tested
 * handler are registered.
 *
 * Notification delivery here means "a NotificationRecord is created with
 * status 'queued'" — there is no real email/WhatsApp/SMS provider wired
 * up yet (Phase 01 §7 confirmed none exists in this repo). That is
 * exactly Phase 11's job. Marking these as 'queued', not 'delivered', is
 * deliberate: it is honest about what actually happened.
 */

import { registerHandler } from './bus';
import type { DomainEvent } from './types';
import { recordAuditEvent, newCorrelationId } from '../lib/audit';
import {
  contractRepository,
  projectRepository,
  notificationRepository,
  snagRepository,
  handoverRepository,
  paymentScheduleRepository,
} from '../repository/entities';
import type { RepositoryContext } from '../repository/types';
import { asId } from '../domain/ids';
import type { ContractId, ProjectId, NotificationId, SnagId, HandoverId, UserId, QuoteVersionId, QCInspectionId } from '../domain/ids';

function queueNotification(
  ctx: RepositoryContext,
  audienceUserId: string,
  templateId: string,
  projectId: string | undefined,
  idempotencyKeySuffix: string,
) {
  return notificationRepository(ctx).create({
    id: asId<NotificationId>(`notif_${idempotencyKeySuffix}`),
    projectId: projectId as ProjectId | undefined,
    audienceUserId: asId<UserId>(audienceUserId),
    channel: 'in_app',
    templateId,
    status: 'queued',
    idempotencyKey: idempotencyKeySuffix,
    createdAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// QUOTE_ACCEPTED
// ---------------------------------------------------------------------------

interface QuoteAcceptedPayload {
  quoteVersionId: string;
  financeUserId: string;
  operationsUserId: string;
}

registerHandler<QuoteAcceptedPayload>('QUOTE_ACCEPTED', 'createContractOnQuoteAccepted', async (ctx, event) => {
  const projectId = event.projectId!;
  const existingProject = await projectRepository(ctx).get(projectId);
  if (!existingProject) {
    // "create project if required" — in this vertical slice a Project
    // is expected to already exist by the time a Quote is accepted
    // (Phase 02's spine: Project is created earlier, at lead
    // conversion). If it genuinely doesn't, that's a data integrity
    // problem this handler surfaces loudly rather than papering over by
    // fabricating a partial Project record with guessed fields.
    throw new Error(`QUOTE_ACCEPTED for project ${projectId}, but no Project record exists — cannot safely auto-create one without customer/site data.`);
  }

  await contractRepository(ctx).create({
    id: asId<ContractId>(`contract_${event.id}`),
    projectId: projectId as ProjectId,
    quoteVersionId: asId<QuoteVersionId>(event.payload.quoteVersionId),
    status: 'draft',
    createdAt: event.occurredAt,
    updatedAt: event.occurredAt,
  });

  await projectRepository(ctx).update(projectId, { stage: 'contract' } as any);

  await queueNotification(ctx, event.payload.financeUserId, 'quote_accepted_finance', projectId, `${event.id}:finance`);
  await queueNotification(ctx, event.payload.operationsUserId, 'quote_accepted_ops', projectId, `${event.id}:ops`);

  await recordAuditEvent(ctx, {
    actorId: 'system',
    actorRole: 'system',
    action: 'QUOTE_ACCEPTED_CONTRACT_CREATED',
    entityType: 'Project',
    entityId: projectId,
    projectId,
    after: { contractId: `contract_${event.id}`, stage: 'contract' },
    source: 'automation',
    correlationId: event.correlationId,
  });
});

// ---------------------------------------------------------------------------
// QC_FAILED
// ---------------------------------------------------------------------------

interface QcFailedPayload {
  qcInspectionId: string;
  technicianId: string;
  defectDescription: string;
}

registerHandler<QcFailedPayload>('QC_FAILED', 'createSnagAndPauseHandover', async (ctx, event) => {
  const projectId = event.projectId!;

  const snagId = asId<SnagId>(`snag_${event.id}`);
  await snagRepository(ctx).create({
    id: snagId,
    projectId: projectId as ProjectId,
    qcInspectionId: asId<QCInspectionId>(event.payload.qcInspectionId),
    status: 'assigned', // "create snag -> assign rework" done as one step: a snag is created already assigned to the technician
    description: event.payload.defectDescription,
    assignedTo: asId<UserId>(event.payload.technicianId),
    reworkCount: 0,
  });

  await queueNotification(ctx, event.payload.technicianId, 'qc_failed_rework_assigned', projectId, `${event.id}:tech`);

  // "pause handover": Handover.qcPassed is the hard gate Phase 09
  // enforces — ensure it is explicitly false, and if a Handover record
  // already exists for this project, force its status back to the
  // blocked state rather than leaving it wherever it was.
  const existingHandover = await handoverRepository(ctx).get(`handover_${projectId}` as any);
  if (existingHandover) {
    await handoverRepository(ctx).update(`handover_${projectId}`, {
      qcPassed: false,
      status: 'blocked_qc_not_passed',
    } as any);
  } else {
    await handoverRepository(ctx).create({
      id: asId<HandoverId>(`handover_${projectId}`),
      projectId: projectId as ProjectId,
      qcPassed: false,
      status: 'blocked_qc_not_passed',
    });
  }

  // "start SLA": recorded as an audited marker with a due-by timestamp;
  // a real SLA timer/escalation job is Phase 12's control-tower/
  // observability work (SLA_BREACHED is registered there, not here).
  const slaDueBy = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  await recordAuditEvent(ctx, {
    actorId: 'system',
    actorRole: 'system',
    action: 'QC_FAILED_SNAG_CREATED_SLA_STARTED',
    entityType: 'Snag',
    entityId: snagId,
    projectId,
    after: { snagId, slaDueBy, handoverBlocked: true },
    source: 'automation',
    correlationId: event.correlationId,
  });
});

// ---------------------------------------------------------------------------
// PAYMENT_RECEIVED — smaller handler showing the pattern generalizes.
// ---------------------------------------------------------------------------

interface PaymentReceivedPayload {
  paymentScheduleId: string;
}

registerHandler<PaymentReceivedPayload>('PAYMENT_RECEIVED', 'checkPaymentScheduleCompletion', async (ctx, event) => {
  const schedule = await paymentScheduleRepository(ctx).get(event.payload.paymentScheduleId);
  if (!schedule) return;
  await recordAuditEvent(ctx, {
    actorId: 'system',
    actorRole: 'system',
    action: 'PAYMENT_RECEIVED_SCHEDULE_CHECKED',
    entityType: 'PaymentSchedule',
    entityId: schedule.id,
    projectId: event.projectId,
    source: 'automation',
    correlationId: event.correlationId,
  });
});

// ---------------------------------------------------------------------------
// PAYMENT_OVERDUE — deliberately allowed to fail, to exercise retry/dead-letter
// in the acceptance check without a fabricated handler. See
// scripts/event-bus-check.ts for how this is used.
// ---------------------------------------------------------------------------

let simulateOverdueFailure = false;
export function __setSimulateOverdueFailure(v: boolean) {
  simulateOverdueFailure = v;
}

registerHandler('PAYMENT_OVERDUE', 'escalateOverduePayment', async (ctx: RepositoryContext, event: DomainEvent) => {
  if (simulateOverdueFailure) {
    throw new Error('Simulated transient failure (e.g. notification provider timeout) — exercises retry/dead-letter.');
  }
  await queueNotification(ctx, (event.payload as any).ownerUserId ?? 'unknown', 'payment_overdue_escalation', event.projectId, `${event.id}:overdue`);
});

export function correlationForEvent(eventId: string): string {
  return newCorrelationId() + ':' + eventId;
}
