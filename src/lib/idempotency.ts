/**
 * Idempotency — Phase 06, transactional claim upgraded in Phase 23,
 * concurrency + failure-handling hardened for real in Phase 37.
 *
 * "All side-effecting operations must accept/store an idempotency key...
 * Repeated identical requests must return the existing result instead of
 * performing the side effect twice." At minimum: payment, refund,
 * payout, invoice creation, PO creation, external message send, webhook
 * processing, automation actions.
 *
 * Mechanism: an `IdempotencyRecord` keyed by a caller-supplied
 * `(opType, idempotencyKey)` pair, in a three-state `pending` ->
 * `completed`/`failed` lifecycle:
 *
 *   1. CLAIM — atomically check-and-write a `pending` record. In
 *      sandbox/production this uses a real Firestore `runTransaction`
 *      (see `claimFirestoreSlot` below): Firestore transactions
 *      guarantee the read-then-write is atomic against concurrent
 *      transactions on the SAME document, so two truly simultaneous
 *      callers (a double-tapped "Pay Now" button, a webhook redelivered
 *      while the first delivery is still in flight) can no longer BOTH
 *      observe "no existing record" and both proceed. In demo mode
 *      there is no Firestore to transact against; Phase 06/23 used a
 *      plain get-then-create sequence there, claiming "JS's
 *      single-threaded execution model makes this adequate." Phase 37
 *      actually TESTED that claim with a real concurrency test
 *      (`scripts/transactional-idempotency-concurrency-test.ts`) and
 *      found it WRONG — `await` yields the event loop even in a
 *      single-threaded runtime, and two concurrent callers really did
 *      both run the guarded side effect. Fixed with an in-process
 *      single-flight map (`runIdempotentDemo` below) — see its own
 *      comment for the mechanism.
 *   2. RUN — call the caller's `fn()` exactly once, only if this call
 *      won the claim.
 *   3. COMPLETE or FAIL — write the real result over the `pending`
 *      record (`completed`), or, if `fn()` throws, transition it to
 *      `failed` instead (Phase 37 — see below; Phase 23 left this
 *      orphaned as a stuck `pending` record a retry could not
 *      distinguish from "genuinely still in flight").
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
 * guarantee. A caller that CRASHES (not a normal `fn()` throw — an
 * actual process death between CLAIM and COMPLETE/FAIL) still leaves an
 * orphaned `pending` record no retry can currently reclaim — a real,
 * named, deliberately NOT-fixed-this-phase gap (see `isReclaimable()`'s
 * own comment for exactly why: reclaiming that safely from a client
 * write needs either a server-side scheduled cleanup or a rules change
 * this sandbox has no live emulator to verify is correct).
 */

import { runTransaction, doc } from 'firebase/firestore';
import { db } from './firebase';
import { getRepository } from '../repository';
import type { RepositoryContext } from '../repository/types';

export interface IdempotencyRecord<TResult = unknown> {
  id: string; // deterministic: `${opType}:${idempotencyKey}`
  opType: string;
  idempotencyKey: string;
  /** 'failed' added in Phase 37: a genuine fn() error now transitions
   * the record here (never deleted — firestore.rules keeps it immutable
   * otherwise) so a retry with the same key can be told apart from a
   * real completed duplicate and safely re-attempted. */
  status: 'pending' | 'completed' | 'failed';
  result?: TResult;
  createdAt: string;
  completedAt?: string;
  /** MVP Step 03: the uid that claimed this record, so firestore.rules can let a
   * non-admin read back their own claim (needed by the transactional claim below). */
  ownerUid?: string;
}

/**
 * Phase 37 — "retry after timeout" (this phase's brief names it
 * explicitly), scoped honestly: a genuinely crashed caller (process died
 * between CLAIM and COMPLETE, never reaching the `catch` block below that
 * marks the record 'failed') leaves an orphaned 'pending' record with no
 * TypeScript code left running to ever transition it. Reclaiming that
 * from a CLIENT write is a real, live-Firestore-rules design question
 * (distinguishing "stale, safe to reclaim" from "another tab's request
 * genuinely still in flight" from the CLIENT side, securely, needs
 * either a server-side scheduled cleanup — a Cloud Function, unreachable
 * from client security rules — or a rules change this sandbox has no
 * live emulator to verify is actually correct and not a NEW race).
 * NOT implemented this phase for that reason — named here as real,
 * scoped, honest follow-up rather than guessed at blind. What IS fixed
 * this phase: a genuine `fn()` failure (the code's own catch block below,
 * not a crash) now reliably marks the record 'failed', which the claim
 * logic explicitly treats as immediately reclaimable — closing the
 * concrete "retry after [ordinary] failure" scenario for real.
 */
function isReclaimable(existing: IdempotencyRecord): boolean {
  return existing.status === 'failed';
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
async function claimFirestoreSlot(id: string, opType: string, idempotencyKey: string, ownerUid?: string): Promise<{ claimed: boolean; existing?: IdempotencyRecord }> {
  if (!db) {
    throw new Error('Firestore is not initialized — cannot take a transactional idempotency claim outside demo mode.');
  }
  const ref = doc(db, 'idempotency_keys', id);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) {
      const existing = snap.data() as IdempotencyRecord;
      if (!isReclaimable(existing)) {
        return { claimed: false, existing };
      }
      // Reclaim a 'failed' record — a fresh attempt, matching the
      // firestore.rules failed->pending transition this phase added.
    }
    const record: IdempotencyRecord = { id, opType, idempotencyKey, status: 'pending', createdAt: new Date().toISOString(), ...(ownerUid ? { ownerUid } : {}) };
    tx.set(ref, record);
    return { claimed: true };
  });
}

/**
 * Phase 37 fix: a REAL, empirically-reproduced race in the demo path.
 *
 * The module header previously claimed "JS's single-threaded execution
 * model makes [the plain get-then-create sequence] adequate for a local,
 * single-process demo store." That claim was checked, this phase, with an
 * actual concurrency test (`scripts/transactional-idempotency-concurrency-test.ts`)
 * — and found WRONG: `await repo.get(id)` and `await repo.create(...)`
 * each yield the event loop, and two truly concurrent callers for the
 * SAME `(opType, idempotencyKey)` can both observe "no existing record"
 * in the gap between those awaits, both then run `fn()` — a real,
 * reproducible double-execution, not a single-threaded-JS false alarm.
 * Corrected here (this comment) rather than left inaccurate, matching
 * this pack's own precedent (Phase 23 caught and fixed a similar
 * inaccurate comment about the production bundle minifier).
 *
 * Fix: an in-process "single-flight" map. The FIRST caller for a given
 * `id` synchronously (before any `await`) registers its own in-flight
 * Promise; every concurrent caller for the same `id` awaits that SAME
 * Promise instead of independently racing through get/create. This needs
 * no Firestore transaction — it is a plain in-memory mutex, correct for
 * exactly the single-process scope the demo store already promises (never
 * shared across sessions/tabs/devices, per `src/repository/demoRepository.ts`).
 */
const demoInFlight = new Map<string, Promise<IdempotentRunResult<any>>>();

async function runIdempotentDemo<TResult>(
  ctx: RepositoryContext,
  opType: string,
  idempotencyKey: string,
  id: string,
  fn: () => Promise<TResult>,
): Promise<IdempotentRunResult<TResult>> {
  const existingInFlight = demoInFlight.get(id);
  if (existingInFlight) {
    // A concurrent call for the SAME key is already running — await its
    // result rather than racing through get/create ourselves.
    const r = await existingInFlight;
    return { result: r.result as TResult, wasDuplicate: true };
  }

  const repo = getRepository<IdempotencyRecord<TResult>>('idempotency_keys', ctx);
  const runPromise = (async (): Promise<IdempotentRunResult<TResult>> => {
    const existing = await repo.get(id);
    if (existing) {
      return { result: existing.result as TResult, wasDuplicate: true };
    }
    const result = await fn();
    await repo.create({ id, opType, idempotencyKey, status: 'completed', result, createdAt: new Date().toISOString(), completedAt: new Date().toISOString() });
    return { result, wasDuplicate: false };
  })();

  // Registered SYNCHRONOUSLY (before this function's first real await
  // above executes any microtask handoff) so a concurrent call arriving
  // before this one resolves always finds it.
  demoInFlight.set(id, runPromise);
  try {
    return await runPromise;
  } finally {
    demoInFlight.delete(id);
  }
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
    return runIdempotentDemo(ctx, opType, idempotencyKey, id, fn);
  }

  // Sandbox/production: real transactional claim, then run, then complete.
  // Phase 37 fix: fn() is now wrapped so a genuine failure (fn() throws)
  // transitions the record to 'failed' (never deleted — firestore.rules
  // keeps the collection immutable otherwise; see that file's own Phase
  // 37 comment) instead of leaving an orphaned 'pending' record that a
  // later retry would silently treat as an already-completed duplicate
  // with an undefined result (a real, previously-undocumented bug:
  // `claim.existing!.result` would have been `undefined` for a record
  // that never reached 'completed'). A 'failed' record is immediately
  // reclaimable (`isReclaimable()`), so a retry after a genuine failure
  // correctly re-attempts the operation, not silently "succeeds" with no
  // result.
  const claim = await claimFirestoreSlot(id, opType, idempotencyKey, ctx.actorUserId);
  if (!claim.claimed) {
    if (claim.existing!.status === 'pending') {
      // A claim exists but never completed — genuinely still in flight
      // (another concurrent caller). Reported as a duplicate WITHOUT a
      // usable result, honestly (not fabricated) — a caller that needs
      // the real value must retry after the in-flight attempt resolves.
      // A caller that CRASHED (never reaching either the completed or
      // failed transition) leaves this orphaned — a real, named,
      // NOT-fixed-this-phase gap (see isReclaimable()'s own comment).
      return { result: undefined as TResult, wasDuplicate: true };
    }
    return { result: claim.existing!.result as TResult, wasDuplicate: true };
  }

  try {
    const result = await fn();
    await repo.update(id, { status: 'completed', result, completedAt: new Date().toISOString() } as any);
    return { result, wasDuplicate: false };
  } catch (err) {
    // Genuine failure: mark the claim 'failed' (never delete — the
    // collection is immutable except for this exact transition) so a
    // retry with the same key correctly re-attempts the operation
    // instead of being silently treated as an already-completed
    // duplicate forever.
    await repo.update(id, { status: 'failed', completedAt: new Date().toISOString() } as any).catch(() => { /* best-effort; a stuck 'pending' record is the documented, named fallback, not silently hidden */ });
    throw err;
  }
}
