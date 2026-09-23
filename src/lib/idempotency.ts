/**
 * Idempotency — Phase 06, transactional claim upgraded in Phase 23.
 *
 * "All side-effecting operations must accept/store an idempotency key...
 * Repeated identical requests must return the existing result instead of
 * performing the side effect twice." At minimum: payment, refund,
 * payout, invoice creation, PO creation, external message send, webhook
 * processing, automation actions.
 *
 * Mechanism: an `IdempotencyRecord` keyed by a caller-supplied
 * `(opType, idempotencyKey)` pair, in a two-phase `pending` ->
 * `completed` lifecycle:
 *
 *   1. CLAIM — atomically check-and-write a `pending` record. In
 *      sandbox/production this uses a real Firestore `runTransaction`
 *      (see `claimFirestoreSlot` below): Firestore transactions
 *      guarantee the read-then-write is atomic against concurrent
 *      transactions on the SAME document, so two truly simultaneous
 *      callers (a double-tapped "Pay Now" button, a webhook redelivered
 *      while the first delivery is still in flight) can no longer BOTH
 *      observe "no existing record" and both proceed — exactly the race
 *      the Phase 06 version left open and documented as a gap. In demo
 *      mode there is no Firestore to transact against; the claim there
 *      is the same get-then-create sequence Phase 06 shipped (JS's
 *      single-threaded execution model makes this adequate for a local,
 *      single-process demo store — a real concurrency risk only exists
 *      once real, multi-request traffic is possible, which demo mode by
 *      definition never has).
 *   2. RUN — call the caller's `fn()` exactly once, only if this call
 *      won the claim.
 *   3. COMPLETE — write the real result over the `pending` record.
 *
 * HONEST LIMIT, not silently assumed solved: the claim step is atomic,
 * but `fn()`'s own writes (e.g. `paymentRepository(ctx).create(...)`)
 * are NOT part of the same Firestore transaction as the claim — making
 * that fully atomic too would mean threading a `Transaction` object
 * through every repository call `fn()` might make, a much larger change
 * across already-tested call sites this phase does not risk blind. What
 * this upgrade closes is the concrete race named in the pack's own
 * example list (two concurrent requests for the same idempotency key
 * both running the guarded operation) — not a full multi-document ACID
 * guarantee. A caller that crashes between CLAIM and COMPLETE leaves a
 * `pending` record a retried request with the same key will find and
 * report as a duplicate without re-running `fn()`; a real production
 * hardening pass should add a staleness timeout that reclaims a
 * long-`pending` record, documented here as a known follow-up, not
 * fixed in this phase.
 */

import { runTransaction, doc } from 'firebase/firestore';
import { db } from './firebase';
import { getRepository } from '../repository';
import type { RepositoryContext } from '../repository/types';

export interface IdempotencyRecord<TResult = unknown> {
  id: string; // deterministic: `${opType}:${idempotencyKey}`
  opType: string;
  idempotencyKey: string;
  status: 'pending' | 'completed';
  result?: TResult;
  createdAt: string;
  completedAt?: string;
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

/** Real Firestore-transactional claim — see module header. Only called
 * when `ctx.environment !== 'demo'`; throws if Firestore did not
 * initialize (same `requireDb`-style honesty as firestoreRepository.ts —
 * never silently falls back to an unguarded write). */
async function claimFirestoreSlot(id: string, opType: string, idempotencyKey: string): Promise<{ claimed: boolean; existing?: IdempotencyRecord }> {
  if (!db) {
    throw new Error('Firestore is not initialized — cannot take a transactional idempotency claim outside demo mode.');
  }
  const ref = doc(db, 'idempotency_keys', id);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) {
      return { claimed: false, existing: snap.data() as IdempotencyRecord };
    }
    const record: IdempotencyRecord = { id, opType, idempotencyKey, status: 'pending', createdAt: new Date().toISOString() };
    tx.set(ref, record);
    return { claimed: true };
  });
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

  if (ctx.environment === 'demo') {
    // Demo path: unchanged from Phase 06 — see module header for why
    // this remains adequate (no real concurrent traffic in demo mode).
    const existing = await repo.get(id);
    if (existing) {
      return { result: existing.result as TResult, wasDuplicate: true };
    }
    const result = await fn();
    await repo.create({ id, opType, idempotencyKey, status: 'completed', result, createdAt: new Date().toISOString(), completedAt: new Date().toISOString() });
    return { result, wasDuplicate: false };
  }

  // Sandbox/production: real transactional claim, then run, then complete.
  const claim = await claimFirestoreSlot(id, opType, idempotencyKey);
  if (!claim.claimed) {
    return { result: claim.existing!.result as TResult, wasDuplicate: true };
  }

  const result = await fn();
  await repo.update(id, { status: 'completed', result, completedAt: new Date().toISOString() } as any);
  return { result, wasDuplicate: false };
}
