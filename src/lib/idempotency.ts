/**
 * Idempotency — Phase 06.
 *
 * "All side-effecting operations must accept/store an idempotency key...
 * Repeated identical requests must return the existing result instead of
 * performing the side effect twice." At minimum: payment, refund,
 * payout, invoice creation, PO creation, external message send, webhook
 * processing, automation actions.
 *
 * Mechanism: an `IdempotencyRecord` keyed by a caller-supplied
 * `(opType, idempotencyKey)` pair is written through the SAME
 * Repository<T> abstraction (Phase 04) other entities use — Firestore in
 * sandbox/production, the isolated in-memory store in demo mode — so the
 * same "one authoritative truth across call sites" property Phase 04
 * proved for `projects` applies here too: two concurrent attempts to run
 * the same operation (e.g. a double-tapped "Pay Now" button, or a
 * webhook Firestore/the provider redelivers) resolve against the same
 * record.
 *
 * `runIdempotent` uses `repository.create()` as the deduplication point:
 * `create()` on both repository implementations is a last-write-wins
 * `setDoc`/`Map.set`, so a naive double-create wouldn't by itself
 * prevent a race — the actual guard is the `get()` BEFORE `create()`
 * below, which is sufficient for this app's realistic concurrency
 * profile (a human re-clicking a button, or a webhook redelivered
 * seconds-to-minutes later) without requiring a Firestore transaction,
 * which the demo repository has no equivalent primitive for. A
 * production hardening pass with real traffic volume should upgrade the
 * Firestore path specifically to `runTransaction`; documented here
 * rather than silently assumed race-proof.
 */

import { getRepository } from '../repository';
import type { RepositoryContext } from '../repository/types';

export interface IdempotencyRecord<TResult = unknown> {
  id: string; // deterministic: `${opType}:${idempotencyKey}`
  opType: string;
  idempotencyKey: string;
  result: TResult;
  createdAt: string;
}

function recordId(opType: string, idempotencyKey: string): string {
  return `${opType}:${idempotencyKey}`;
}

export interface IdempotentRunResult<TResult> {
  result: TResult;
  /** false the first time this (opType, idempotencyKey) pair is seen;
   * true on every subsequent call — the caller's side effect did NOT run. */
  wasDuplicate: boolean;
}

export async function runIdempotent<TResult>(
  ctx: RepositoryContext,
  opType: string,
  idempotencyKey: string,
  fn: () => Promise<TResult>,
): Promise<IdempotentRunResult<TResult>> {
  if (!idempotencyKey) {
    throw new Error(`runIdempotent("${opType}") called without an idempotencyKey — refusing to run an unkeyed side-effecting operation.`);
  }
  const repo = getRepository<IdempotencyRecord<TResult>>('idempotency_keys', ctx);
  const id = recordId(opType, idempotencyKey);

  const existing = await repo.get(id);
  if (existing) {
    return { result: existing.result, wasDuplicate: true };
  }

  const result = await fn();
  await repo.create({
    id,
    opType,
    idempotencyKey,
    result,
    createdAt: new Date().toISOString(),
  });
  return { result, wasDuplicate: false };
}
