# Phase 37 — Transactional Idempotency

## 1. A real bug found: the demo path was never actually single-flight-safe

Phase 06/23's own comments claimed the demo path's plain get-then-create
idempotency check was safe because "JS's single-threaded execution model
makes this adequate for a local, single-process demo store." This phase
actually TESTED that claim with a real concurrency probe (two truly
concurrent `runIdempotent()` calls for the same key, `Promise.all`, a
guarded function with a real `await` inside it) and found it **wrong**:
`await` yields the event loop even in a single-threaded runtime, and two
concurrent callers really did both run the guarded side effect —
empirically reproduced before any fix (`sideEffectCount: 2`), and
verified closed after (`sideEffectCount: 1`).

**Fix**: `src/lib/idempotency.ts`'s `runIdempotentDemo()` now uses an
in-process "single-flight" map (`demoInFlight: Map<string, Promise<...>>`).
The first caller for a given `(opType, idempotencyKey)` id synchronously
registers its own in-flight Promise before any `await` runs; every
concurrent caller for the same id awaits that SAME Promise instead of
independently racing through get/create. This needs no Firestore
transaction — a plain in-memory mutex is correct for exactly the
single-process scope the demo store already promises (never shared
across sessions/tabs/devices).

## 2. A second, more fundamental real bug found: `firestore.rules` blocked the sandbox/production COMPLETE step entirely

`firestore.rules`' `idempotency_keys` collection previously had `allow
update, delete: if false` — meaning the documented CLAIM -> COMPLETE
lifecycle's own completion write (`repo.update(id, {status: 'completed',
...})`) would have been **denied by the real deployed rules** every
single time, in any real production run. This was found by reading the
actual rules file while building this phase's tests, not assumed.

**Fix**: `firestore.rules` now allows exactly two narrow transitions on
an `idempotency_keys` document — `pending -> completed`/`failed`, and
`failed -> pending` (a reclaim) — with the identity fields
(`idempotencyKey`/`opType`) locked so a document can never be rewritten
to claim a different operation/key. The collection stays immutable in
every other respect (a completed record can never be reopened; nothing
can ever be deleted).

## 3. `'failed'` status: retry after partial failure

`IdempotencyRecord.status` gained a third value, `'failed'`. When the
guarded `fn()` throws a genuine error (not a crash — the code's own
`catch` block runs), the record now transitions to `'failed'` instead of
being silently deleted (impossible under the new rules anyway) or left
as an unreclaimable `'pending'` forever (the prior, real, previously
undocumented bug — a retry after a genuine failure would have found the
stuck `'pending'` record and returned `{ result: undefined, wasDuplicate:
true }`, silently reporting a FAILED operation as an already-successful
duplicate with no result). `isReclaimable()` treats `'failed'` as
immediately safe to reclaim, so a retry with the same key correctly
re-attempts the operation.

## 4. What is honestly NOT fixed this phase: retry after a real crash / timeout

A caller that genuinely **crashes** (not a caught `fn()` failure — an
actual process death between CLAIM and COMPLETE/FAIL, or a killed tab, a
lost network mid-request) leaves an orphaned `'pending'` record with no
code left running to ever transition it. Reclaiming that safely from a
CLIENT write is a real security-design question: distinguishing "stale,
safe to reclaim" from "another tab's request genuinely still in flight"
purely from the client side needs either a server-side scheduled cleanup
(a Cloud Function — unreachable from client security rules) or a
wall-clock-staleness rules check this sandbox has no live Firestore
emulator to verify is actually correct and not a NEW race. **Not
implemented this phase** — named here as real, scoped, honest follow-up,
not guessed at blind. `scripts/transactional-idempotency-concurrency-test.ts`
verifies this gap is real and documented (asserts `isReclaimable()`
reclaims only `'failed'`, not stale `'pending'`), not silently papered
over.

## 5. Datastore transaction semantics (this phase's own explicit ask)

- **Sandbox/production**: a real Firestore `runTransaction` wraps the
  CLAIM step's read-then-write against the SAME `idempotency_keys/{id}`
  document. Firestore transactions guarantee this read-then-write is
  atomic against concurrent transactions on that same document — two
  truly simultaneous callers cannot both observe "claimable" and both
  proceed. `fn()`'s own writes are explicitly NOT part of that same
  transaction (see the module's own long-standing honest limit,
  unchanged this phase) — only the CLAIM is atomic, not a full
  multi-document ACID guarantee spanning the guarded operation.
- **Demo**: no Firestore transaction exists; a real in-process
  JavaScript `Map`-based single-flight lock provides the equivalent
  guarantee for the single-process scope the demo store already
  promises. This is NOT a substitute for a real transaction if the demo
  store were ever pointed at a real multi-process backend — it is
  scoped, deliberately, to exactly the guarantee the demo environment
  already makes elsewhere.

## 6. Real, live (in-process) test coverage

`scripts/transactional-idempotency-concurrency-test.ts` — all 5 named
scenarios:

1. **Request A** — real, genuinely executed.
2. **Request A duplicate** (sequential) — real, genuinely executed.
3. **Request A concurrent duplicate** (`Promise.all`) — real, genuinely
   executed; this is the exact scenario that exposed the Section 1 bug.
4. **Retry after timeout** — verified STRUCTURALLY (the real source and
   rules text), honestly labeled as not live-executable without a
   Firestore emulator, and honestly documented as NOT fixed (Section 4).
5. **Retry after partial failure** — real, genuinely executed (a `fn()`
   that fails once then succeeds; verifies the retry actually re-runs
   the operation, not silently treated as a duplicate).

Existing `scripts/idempotency-audit-check.ts` (Phase 06/23, sequential
duplicate-request scenarios) re-run clean — zero regressions from this
phase's changes.
