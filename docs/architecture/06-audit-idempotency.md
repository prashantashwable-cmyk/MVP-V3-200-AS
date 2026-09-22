# AIEC — Audit, Versioning, Concurrency, and Idempotency (Phase 06)

Implements: `src/lib/audit.ts`, `src/lib/idempotency.ts`, extended
`src/repository/entities.ts` (`advanceProjectStage` now audited,
`createPaymentIdempotent`, `createPurchaseOrderIdempotent`), extended
`firestore.rules`. Acceptance check:
`scripts/idempotency-audit-check.ts` (`npm run audit:check`).

## 1. AuditEvent — from type to working code

`AuditEvent` was defined as a type in Phase 02 and `audit_logs` already
had a correctly-shaped (immutable, admin-read) Firestore rule from before
this pack (Phase 01 §5) — but Phase 01 also confirmed **nothing in the
codebase actually wrote to it**. `src/lib/audit.ts`'s `recordAuditEvent()`
is the first real writer: it builds the canonical shape (`eventId`
generated, `actorId`, `actorRole`, `action`, `entityType`, `entityId`,
`projectId`, `before`/`after`, `timestamp`, `reason`, `source`,
`correlationId`) and persists it through the same `Repository<T>`
abstraction (Phase 04) every other entity uses — so it gets the demo/
sandbox/production isolation for free.

Wired into `advanceProjectStage()` (`src/repository/entities.ts`) as the
first concrete call site: every project stage transition now writes an
AuditEvent with the before/after stage and a `correlationId`. This is
deliberately the one call site touched in this phase, not all 189
screens — per the pack's phase ordering, broader wiring happens as
Phases 07-09 build the real workflow engine and commercial/operational
flows on top of this. `listAuditEventsForEntity()` lets any future screen
(Phase 12's control tower, or a project's "History" tab) query the trail
for a given entity without knowing the storage details.

## 2. Versioning / concurrency — already built in Phase 04, now proven on a second entity

Phase 04's `Repository.update(id, patch, expectedVersion)` already
rejects a stale write with a typed `StaleWriteError` instead of silently
overwriting a concurrent change. This phase's acceptance check exercises
it again specifically on `Quote` (not just `Project`, which Phase 04's
own check used) to confirm the mechanism generalizes: two "editors" open
the same quote, one saves, the other's stale save is rejected rather than
clobbering the first save.

## 3. Idempotency

`src/lib/idempotency.ts`'s `runIdempotent(ctx, opType, idempotencyKey, fn)`
is the single reusable primitive for "all side-effecting operations must
accept/store an idempotency key... repeated identical requests must
return the existing result instead of performing the side effect twice":

1. Looks up an `IdempotencyRecord` at the deterministic id
   `${opType}:${idempotencyKey}` through the repository layer.
2. If found: returns the ORIGINAL result. `fn` (the actual side effect)
   is never called again — proven in the acceptance check by passing a
   *different* payment amount on the "retry" and confirming the
   original amount is what comes back, not the retry's.
3. If not found: runs `fn`, stores its result, returns it.

Documented limitation (in the module's own header, not hidden): the
guard is a `get()`-before-`create()` check, not a Firestore transaction —
sufficient for this app's realistic concurrency profile (human
re-clicks, webhook redelivery on a retry schedule) but not provably
race-free under true simultaneous requests. A production-hardening pass
with real traffic should upgrade the Firestore path to
`runTransaction()`; flagged rather than silently assumed solved.

Wired into two concrete, real call sites (matching the pack's own
"at minimum: payment... PO creation" list):

- `createPaymentIdempotent()` — wraps `paymentRepository.create()`.
- `createPurchaseOrderIdempotent()` — wraps `purchaseOrderRepository.create()`.

Both also call `recordAuditEvent()` inside the idempotency-guarded
closure, so the audit event itself is only written once too (not once
per retry) — auditing and idempotency compose correctly rather than
fighting each other.

## 4. Acceptance: all 5 pack-specified scenarios

`scripts/idempotency-audit-check.ts` (`npm run audit:check`), 13
assertions:

| Pack scenario | How it's tested | Result |
|---|---|---|
| duplicate payment request | `createPaymentIdempotent()` called twice, same key, different amount on retry | one payment created; retry returns the ORIGINAL amount |
| duplicate webhook | `runIdempotent('webhook.process', ...)` invoked 3× (simulating provider redelivery) | side effect counter = 1 |
| stale quote update | `quoteRepository.update()` with an outdated `expectedVersion` after a concurrent edit | rejected with `StaleWriteError` |
| repeated automation trigger | `runIdempotent('automation.trigger', 'QUOTE_ACCEPTED:<projectId>', ...)` invoked twice | action runs exactly once |
| repeated message send | `runIdempotent('notification.send', 'payment-reminder:<id>:day-3', ...)` invoked twice | send count = 1 |
| (bonus) duplicate PO creation | `createPurchaseOrderIdempotent()` called twice | exactly one PO |
| audit trail is real | `advanceProjectStage()` then `listAuditEventsForEntity()` | 1 event, correct action/after-state/correlationId |

All 13/13 pass.

## 5. Firestore rules extended

Added `purchase_orders` (mirrors the `payments` pattern: admin-created,
owner-readable, immutable-by-delete) and `idempotency_keys` (admin-read,
any-authenticated-create, **update/delete both `false`** — an
idempotency record that could be edited or deleted would defeat its own
purpose). All prior rules from Phases 01/04/05 are untouched.

## 6. What this phase deliberately did not do

- Did not retrofit idempotency onto the 124+ `DbManager`-backed screens'
  existing mutations — `runIdempotent`/`recordAuditEvent` are ready for
  Phases 08/09 to call as each workflow is wired onto the real
  repository layer, matching the pack's own incremental-migration
  principle.
- Did not build the real event bus / automation engine (`automation.trigger`
  above is a placeholder opType exercised only by the acceptance script,
  not a running system) — that is Phase 07's explicit job, immediately
  next.
- Did not upgrade the idempotency guard to a Firestore transaction — see
  §3's documented limitation.

## 7. Build/typecheck

`npx tsc --noEmit` passes. `npm run checks` (lint + domain + workflow +
repository + authz + audit) passes in full — 13/13 new assertions.
`npx vite build` passes.
