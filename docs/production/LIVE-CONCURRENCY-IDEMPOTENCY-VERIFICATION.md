# Live Concurrency + Idempotency Verification (Phase 45)

**Date:** 2026-09-23
**HEAD at generation:** `2f89fdc` (Phase 44)

## What Phase 37 already proved, and the real, specific gap this phase closes

Phase 37 (`scripts/transactional-idempotency-concurrency-test.ts`) really
did prove the `runIdempotent()` primitive is safe under genuine
`Promise.all` concurrent duplicate calls — but only against SYNTHETIC
`test.scenario*` operations with fake in-memory side-effect counters, not
against this app's actual financial business functions. Phase 06's
acceptance check (`scripts/idempotency-audit-check.ts`) exercises the
real `createPaymentIdempotent`/`createPurchaseOrderIdempotent` functions,
but only with SEQUENTIAL duplicate calls (`await first(); await
second();`), never genuine concurrent submission.

**This is a real, previously-undocumented gap**: sequential duplicate
calls and genuinely concurrent duplicate calls are NOT the same test —
a sequential retry always sees a fully-completed prior claim record, while
a concurrent duplicate can race against a claim still `pending`, which is
exactly the scenario the Phase 37 race (found and fixed) originally
affected. Nothing prior to this phase tested the REAL business functions
under REAL concurrency.

## New script: `scripts/live-concurrency-idempotency-verification.ts`

Runs against the demo repository (real, live, in-process — no live
Firestore needed, same honest scope as Phase 37):

### Scenario 1 — 3 genuinely concurrent `createPaymentIdempotent` calls, same idempotency key, different (tampered) amounts

```
OK: exactly 2 of 3 genuinely concurrent createPaymentIdempotent calls are recognized as duplicates (1 real execution, 2 duplicates)
OK: all 3 concurrent callers observe the SAME payment amount — no caller sees a different, racily-written value
OK: the amount every caller observes is the FIRST real attempt's amount, not a later racing attempt's tampered value
OK: exactly ONE Payment record actually exists in the repository after 3 genuinely concurrent duplicate createPaymentIdempotent calls — the real, observable side effect, not just the guard's self-report
OK: the ONE persisted Payment record holds the first real attempt's amount, confirming no racing writer overwrote it
```

### Scenario 2 — 4 genuinely concurrent `createPurchaseOrderIdempotent` calls, same idempotency key, different (tampered) amounts/supplier

```
OK: exactly 3 of 4 genuinely concurrent createPurchaseOrderIdempotent calls are recognized as duplicates (1 real execution, 3 duplicates)
OK: exactly ONE PurchaseOrder record actually exists in the repository after 4 genuinely concurrent duplicate createPurchaseOrderIdempotent calls
OK: the ONE persisted PurchaseOrder holds the first real attempt's data, unaltered by racing attempts
```

### Scenario 3 — negative control: 2 genuinely concurrent calls with DIFFERENT idempotency keys must NOT collide

```
OK: two genuinely concurrent calls with DIFFERENT idempotency keys are BOTH treated as real, distinct executions — not collapsed into one
OK: both distinct payments are actually persisted, independently — the idempotency guard correctly scopes by key, not by opType alone
```

**10/10 real assertions PASS.** Every assertion checks BOTH the guard's
own `wasDuplicate` self-report AND the actual persisted repository state
(`.list()` after the fact) — the stronger, more honest verification this
pack's rule #1 requires, not merely trusting the guard's opinion about
itself.

## What remains BLOCKED — MISSING CREDENTIAL

The identical 3 scenarios run against the REAL `dogwood-torus-v71nt`
Firestore project, under real network latency and real Firestore
transaction/contention semantics, cannot be executed in this sandbox — no
Firebase Auth session or service-account credential exists here
(`docs/production/ENVIRONMENT-READINESS.md`). This demo-path result
proves the APPLICATION-LEVEL guard logic is genuinely safe under
concurrency; it does NOT prove Firestore's own transaction retry behavior
under real network-interleaved concurrent writes. The structural analysis
of `firestore.rules`' `idempotency_keys` transition-lock (re-verified
directly again in Phase 44 §3c) is the closest evidence this sandbox can
produce for that live gap.

## Regression coverage

Wired into `npm run checks` as `live-concurrency-idempotency:check`
(runs on every `npm run checks` invocation from this phase forward, same
as every other acceptance script in this pack).

## Classification

| Test | Classification |
|---|---|
| Demo-path concurrent `createPaymentIdempotent` (real functions, real concurrency, real persisted-state check) | **VERIFIED** (in-process, not live Firestore) |
| Demo-path concurrent `createPurchaseOrderIdempotent` (same) | **VERIFIED** (in-process) |
| Demo-path distinct-key negative control | **VERIFIED** (in-process) |
| Live Firestore concurrent-write transaction semantics | **BLOCKED — MISSING CREDENTIAL** |
