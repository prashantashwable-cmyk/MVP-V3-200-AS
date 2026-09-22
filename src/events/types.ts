/**
 * Canonical event vocabulary — Phase 07.
 *
 * Exactly the events named in 07_EVENT_BUS_WORKFLOW_AUTOMATION.md. Note
 * that several already appear as `event` values on transitions in
 * src/workflows/definitions/*.ts (Phase 03) — that was deliberate there
 * (Phase 03's doc comment says so explicitly), so the state machines and
 * this event bus already speak the same vocabulary rather than needing a
 * translation layer between them.
 */
export type CanonicalEventType =
  | 'LEAD_CREATED'
  | 'SITE_SURVEY_COMPLETED'
  | 'QUOTE_CREATED'
  | 'QUOTE_SENT'
  | 'QUOTE_ACCEPTED'
  | 'CONTRACT_SIGNED'
  | 'PAYMENT_RECEIVED'
  | 'PO_CREATED'
  | 'PO_APPROVED'
  | 'MATERIAL_DISPATCHED'
  | 'MATERIAL_RECEIVED'
  | 'INSTALLATION_STARTED'
  | 'INSTALLATION_COMPLETED'
  | 'QC_FAILED'
  | 'QC_PASSED'
  | 'HANDOVER_COMPLETED'
  | 'PAYMENT_OVERDUE'
  | 'SLA_BREACHED';

export interface DomainEvent<TPayload = Record<string, unknown>> {
  /** Stable, caller-assigned id for THIS occurrence — used as the
   * idempotency anchor, so redelivering the same event (e.g. a UI
   * double-submit, or a future real webhook redelivering) reruns
   * nothing. Callers should derive it from the triggering record, e.g.
   * `quote:${quoteId}:accepted`, not `crypto.randomUUID()` (which would
   * defeat idempotency by construction). */
  id: string;
  type: CanonicalEventType;
  entityType: string;
  entityId: string;
  projectId?: string;
  payload: TPayload;
  occurredAt: string;
  correlationId: string;
}

export function makeEvent<TPayload>(
  input: Omit<DomainEvent<TPayload>, 'occurredAt' | 'correlationId'> & { correlationId?: string },
): DomainEvent<TPayload> {
  return {
    ...input,
    occurredAt: new Date().toISOString(),
    correlationId: input.correlationId ?? `corr_${input.id}`,
  };
}
