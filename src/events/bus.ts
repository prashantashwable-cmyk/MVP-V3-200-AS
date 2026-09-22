/**
 * Event bus / workflow execution engine — Phase 07.
 *
 * Real execution model, not a UI simulation: publishing an event runs
 * every registered handler for that event type through the SAME
 * idempotency primitive Phase 06 built for payments/POs
 * (`runIdempotent`), persists one `WorkflowInstance` per event
 * occurrence and one `WorkflowExecution` per handler attempt (both
 * canonical types from Phase 02) through the Phase 04 repository layer,
 * retries a failing handler a bounded number of times, and moves it to
 * a `dead_letter` state on exhaustion rather than losing the failure
 * silently or retrying forever.
 *
 * What this engine deliberately does NOT claim to be: a distributed,
 * durable, cross-process queue (e.g. Cloud Tasks/Pub-Sub). It runs
 * in-process, synchronously, within the caller's request — appropriate
 * for this phase (proving the execution MODEL is real: idempotent,
 * retried, audited, dead-letterable) without inventing an external
 * message-queue integration this sandbox has no credentials for (same
 * category of gap documented in Phase 04 §6 / Phase 05 §6). A
 * production deployment with real traffic volume should move this onto
 * a durable queue; the handler/registration API here would not need to
 * change, only `publish()`'s internals.
 */

import { getRepository } from '../repository';
import type { RepositoryContext } from '../repository/types';
import { runIdempotent } from '../lib/idempotency';
import { recordAuditEvent } from '../lib/audit';
import type { DomainEvent, CanonicalEventType } from './types';
import type { WorkflowInstance, WorkflowExecution } from '../domain/entities';

export type EventHandler<TPayload = Record<string, unknown>> = (
  ctx: RepositoryContext,
  event: DomainEvent<TPayload>,
) => Promise<unknown>;

interface RegisteredHandler {
  name: string;
  fn: EventHandler<any>;
}

const handlerRegistry = new Map<CanonicalEventType, RegisteredHandler[]>();

/** Register a handler for a canonical event type. Called once at module
 * load by src/events/handlers/*.ts (imported for side effects by
 * src/events/index.ts) — this is how "existing automation screens
 * should be wired to the real engine" happens: a handler here IS the
 * real automation; a screen that used to just flip a `DbManager` flag
 * calls `publishEvent()` instead. */
export function registerHandler<TPayload = Record<string, unknown>>(
  type: CanonicalEventType,
  name: string,
  fn: EventHandler<TPayload>,
): void {
  const list = handlerRegistry.get(type) ?? [];
  list.push({ name, fn: fn as EventHandler<any> });
  handlerRegistry.set(type, list);
}

export function handlersFor(type: CanonicalEventType): string[] {
  return (handlerRegistry.get(type) ?? []).map(h => h.name);
}

const MAX_ATTEMPTS = 3;

export interface HandlerOutcome {
  handlerName: string;
  status: WorkflowExecution['status'];
  attempts: number;
  error?: string;
  executionId: string;
  wasDuplicateEvent: boolean;
}

export interface PublishResult {
  event: DomainEvent<any>;
  workflowInstanceId: string;
  outcomes: HandlerOutcome[];
}

async function runHandlerWithRetry(
  ctx: RepositoryContext,
  event: DomainEvent<any>,
  handler: RegisteredHandler,
  workflowInstanceId: string,
): Promise<HandlerOutcome> {
  const execRepo = getRepository<WorkflowExecution>('workflow_executions', ctx);
  const idempotencyKey = `${event.type}:${event.id}:${handler.name}`;

  let attempt = 0;
  let lastError: string | undefined;

  const { result, wasDuplicate } = await runIdempotent(ctx, 'event.handler', idempotencyKey, async () => {
    while (attempt < MAX_ATTEMPTS) {
      attempt++;
      try {
        await handler.fn(ctx, event);
        const executionId = `exec_${idempotencyKey}_${attempt}`;
        await execRepo.create({
          id: executionId as WorkflowExecution['id'],
          workflowInstanceId: workflowInstanceId as WorkflowExecution['workflowInstanceId'],
          stepKey: handler.name,
          status: 'succeeded',
          attempt,
          idempotencyKey,
          executedAt: new Date().toISOString(),
        });
        return { status: 'succeeded' as const, attempts: attempt, executionId };
      } catch (e: any) {
        lastError = e?.message ?? String(e);
        // fall through to retry, unless attempts exhausted
      }
    }
    // Retries exhausted — dead-letter, audited, available for manual retry.
    const executionId = `exec_${idempotencyKey}_deadletter`;
    await execRepo.create({
      id: executionId as WorkflowExecution['id'],
      workflowInstanceId: workflowInstanceId as WorkflowExecution['workflowInstanceId'],
      stepKey: handler.name,
      status: 'dead_letter',
      attempt,
      error: lastError,
      idempotencyKey,
      executedAt: new Date().toISOString(),
    });
    await recordAuditEvent(ctx, {
      actorId: 'system',
      actorRole: 'system',
      action: 'WORKFLOW_HANDLER_DEAD_LETTERED',
      entityType: 'WorkflowExecution',
      entityId: executionId,
      projectId: event.projectId,
      after: { handler: handler.name, event: event.type, error: lastError, attempts: attempt },
      reason: 'Handler failed after max retry attempts — requires human escalation / manual retry.',
      source: 'automation',
      correlationId: event.correlationId,
    });
    return { status: 'dead_letter' as const, attempts: attempt, executionId, error: lastError };
  });

  return { handlerName: handler.name, wasDuplicateEvent: wasDuplicate, ...result };
}

/**
 * Publishes a domain event and runs every registered handler for its
 * type. Persists a `WorkflowInstance` for the occurrence and one
 * `WorkflowExecution` per handler attempt/outcome; every dead-letter is
 * separately audited. Safe to call twice with the same `event.id` — the
 * per-handler idempotency key ensures each handler's side effect runs at
 * most once regardless of how many times `publish` is called for that
 * event id (see scripts/event-bus-check.ts).
 */
export async function publishEvent<TPayload>(
  ctx: RepositoryContext,
  event: DomainEvent<TPayload>,
): Promise<PublishResult> {
  const instanceRepo = getRepository<WorkflowInstance>('workflow_instances', ctx);
  const workflowInstanceId = `wfi_${event.id}`;
  const existingInstance = await instanceRepo.get(workflowInstanceId);
  if (!existingInstance) {
    await instanceRepo.create({
      id: workflowInstanceId as WorkflowInstance['id'],
      workflowKey: event.type,
      projectId: event.projectId as WorkflowInstance['projectId'],
      status: 'running',
      startedAt: event.occurredAt,
    });
  }

  const handlers = handlerRegistry.get(event.type) ?? [];
  const outcomes: HandlerOutcome[] = [];
  for (const handler of handlers) {
    outcomes.push(await runHandlerWithRetry(ctx, event, handler, workflowInstanceId));
  }

  const anyDeadLetter = outcomes.some(o => o.status === 'dead_letter');
  await instanceRepo.update(workflowInstanceId, {
    status: anyDeadLetter ? 'failed' : 'completed',
    completedAt: new Date().toISOString(),
  } as Partial<WorkflowInstance>);

  return { event, workflowInstanceId, outcomes };
}

/**
 * Manual retry for a dead-lettered handler — "human escalation" acting
 * on a dead-letter record. Re-runs the SAME handler for the SAME event
 * occurrence; if it now succeeds, a new `succeeded` WorkflowExecution is
 * recorded (the prior `dead_letter` record is left in place as history,
 * per the audit-trail immutability principle — nothing here deletes it).
 */
export async function retryDeadLetter(
  ctx: RepositoryContext,
  event: DomainEvent,
  handlerName: string,
): Promise<HandlerOutcome> {
  const handler = (handlerRegistry.get(event.type) ?? []).find(h => h.name === handlerName);
  if (!handler) {
    throw new Error(`No handler named "${handlerName}" registered for event type "${event.type}".`);
  }
  const workflowInstanceId = `wfi_${event.id}`;
  const execRepo = getRepository<WorkflowExecution>('workflow_executions', ctx);
  const executionId = `exec_${event.type}:${event.id}:${handlerName}_retry_${Date.now()}`;
  try {
    await handler.fn(ctx, event);
    await execRepo.create({
      id: executionId as WorkflowExecution['id'],
      workflowInstanceId: workflowInstanceId as WorkflowExecution['workflowInstanceId'],
      stepKey: handlerName,
      status: 'succeeded',
      attempt: MAX_ATTEMPTS + 1,
      idempotencyKey: `${event.type}:${event.id}:${handlerName}:manual_retry`,
      executedAt: new Date().toISOString(),
    });
    await recordAuditEvent(ctx, {
      actorId: ctx.actorUserId,
      actorRole: 'admin',
      action: 'WORKFLOW_HANDLER_MANUALLY_RETRIED_SUCCEEDED',
      entityType: 'WorkflowExecution',
      entityId: executionId,
      projectId: event.projectId,
      source: 'ui',
      correlationId: event.correlationId,
    });
    return { handlerName, status: 'succeeded', attempts: MAX_ATTEMPTS + 1, executionId, wasDuplicateEvent: false };
  } catch (e: any) {
    await recordAuditEvent(ctx, {
      actorId: ctx.actorUserId,
      actorRole: 'admin',
      action: 'WORKFLOW_HANDLER_MANUALLY_RETRIED_FAILED',
      entityType: 'WorkflowExecution',
      entityId: executionId,
      projectId: event.projectId,
      reason: e?.message,
      source: 'ui',
      correlationId: event.correlationId,
    });
    return { handlerName, status: 'dead_letter', attempts: MAX_ATTEMPTS + 1, executionId, error: e?.message, wasDuplicateEvent: false };
  }
}
