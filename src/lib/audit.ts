/**
 * Unified audit logging — Phase 06.
 *
 * Writes the canonical `AuditEvent` shape (src/domain/entities.ts,
 * defined in Phase 02) through the Phase 04 repository layer into the
 * `audit_logs` collection. That collection's Firestore rule already
 * existed before this pack (Phase 01 §5): admin-read-only,
 * any-authenticated-create, update/delete both `false` — i.e. it was
 * already modeled as an immutable audit trail; this phase is the first
 * code that actually writes the canonical `AuditEvent` shape into it
 * (Phase 01 confirmed no code was doing so previously).
 *
 * Every repository-layer mutation added or touched from this phase
 * onward should call `recordAuditEvent()` — see
 * src/repository/entities.ts's `advanceProjectStage` for the pattern.
 */

import { getRepository } from '../repository';
import type { RepositoryContext } from '../repository/types';
import type { AuditEvent } from '../domain/entities';

function generateId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function newCorrelationId(): string {
  return generateId('corr');
}

export interface RecordAuditEventInput {
  actorId: string;
  actorRole: AuditEvent['actorRole'];
  action: string;
  entityType: string;
  entityId: string;
  projectId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  source: AuditEvent['source'];
  correlationId: string;
}

/**
 * Never storing secrets/credentials in `before`/`after` is the caller's
 * responsibility (per Phase 06's "avoid storing secrets or sensitive
 * credentials in audit payloads") — this function does not attempt to
 * redact, since it cannot know which fields are sensitive for an
 * arbitrary entity; callers pass already-safe snapshots.
 */
export async function recordAuditEvent(
  ctx: RepositoryContext,
  input: RecordAuditEventInput,
): Promise<AuditEvent> {
  const event: AuditEvent = {
    id: generateId('audit') as AuditEvent['id'],
    actorId: input.actorId as AuditEvent['actorId'],
    actorRole: input.actorRole,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    projectId: input.projectId as AuditEvent['projectId'],
    before: input.before,
    after: input.after,
    timestamp: new Date().toISOString(),
    reason: input.reason,
    source: input.source,
    correlationId: input.correlationId,
  };
  const repo = getRepository<AuditEvent>('audit_logs', ctx);
  await repo.create(event);
  return event;
}

export async function listAuditEventsForEntity(
  ctx: RepositoryContext,
  entityType: string,
  entityId: string,
): Promise<AuditEvent[]> {
  const repo = getRepository<AuditEvent>('audit_logs', ctx);
  return repo.query({ entityType, entityId } as Partial<AuditEvent>);
}
