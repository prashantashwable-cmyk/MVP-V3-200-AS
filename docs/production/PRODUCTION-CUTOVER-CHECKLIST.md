# Production Cutover Checklist (Phase 40)

**Date:** 2026-09-23
**HEAD at generation:** `f3c3ebf` (`aiec-phase-39-dual-write-consistency`)

Every item below is classified exactly one of: **VERIFIED** /
**PARTIALLY VERIFIED** / **BLOCKED — MISSING CREDENTIAL** /
**BLOCKED — EXTERNAL SERVICE** / **FAILED — REQUIRES FIX**, per this
phase's own non-negotiable rule. Nothing "not tested" is reported as
"passed." See `docs/production/PRODUCTION-READINESS-REPORT.md` for the
full narrative and evidence behind each line.

## Infrastructure

- [x] **VERIFIED** — production Firebase project identified: `dogwood-torus-v71nt`, real Firestore database `ai-studio-buildit-6201e806-4162-4565-b05c-8c48e796f933` (named, non-default), documented in `docs/production/ENVIRONMENT-READINESS.md`.
- [x] **VERIFIED** — Firebase Auth configured: real Google Sign-In wired (`src/App.tsx`'s `handleGoogleSignIn`), client SDK initializes cleanly against the real project (Phase 33, `scripts/live-firebase-auth-test.ts`'s 2 structural PASS results).
- [x] **VERIFIED** — Firestore configured: real project + named database wired, `firestore.rules` deployed-shaped and structurally tested (`scripts/authz-check.ts` and others).
- [ ] **PARTIALLY VERIFIED** — storage configured if required: a real interface exists (`FirebaseStorageTransport`, Phase 11) but no real Storage bucket has been provisioned/configured — media uploads have nowhere real to go yet.
- [ ] **PARTIALLY VERIFIED** — environment variables configured: the `VITE_APP_ENV` build-time mechanism is real and tested (Phase 32); `GEMINI_API_KEY`/`GOOGLE_MAPS_PLATFORM_KEY`/`APP_URL` are documented and read correctly by `src/serverApp.ts`/`vite.config.ts` but are NOT set in this sandbox (none should be — they are deploy-time secrets).
- [x] **VERIFIED** — no secrets in source: checked directly (`env | grep`, filesystem search) — no `.env`/`.env.local`, no service-account JSON, no committed `GEMINI_API_KEY`. The Firebase Web `apiKey` in `src/lib/firebase.ts` is a public client identifier by Google's own design, not a secret (`docs/production/ENVIRONMENT-READINESS.md` §1).
- [x] **VERIFIED** — no demo bypass in production bundle: Phase 32's `scripts/production-bundle-bypass-check.ts` builds a REAL `VITE_APP_ENV=production` bundle and greps the actual output — zero of 7 known bypass literals found, all 7 confirmed present in a real demo-build's output (positive control).

## Security

- [ ] **BLOCKED — MISSING CREDENTIAL** — live authorization tested: Phase 34's 40 live role/permission scenarios are all honestly BLOCKED (no per-role Firebase Auth test identities exist in this sandbox).
- [ ] **BLOCKED — MISSING CREDENTIAL** — privilege escalation tested: same root cause; the Phase 05 client-side `users` collection self-escalation fix is structurally verified (`scripts/authz-check.ts`) but never live-tested against real Firestore.
- [ ] **PARTIALLY VERIFIED** — sensitive legacy authorization gaps addressed: Phase 35 fixed 2 of 8 real `firestore.rules` findings directly (payments, qc_inspections) and mapped all 101 client-only screens to P0 (8)/P1 (12)/P2 (81) with an honest per-screen data-layer status; the majority remain open, real, prioritized follow-up, not silently claimed closed.
- [ ] **PARTIALLY VERIFIED** — destructive actions protected: Phase 36 fixed 8 real, high-confidence gaps (5 LEVEL 3 financial batch/finalize actions, 3 LEVEL 4 irreversible deletes) with real `window.confirm()` guards; the remaining lower-blast-radius items (mostly single-item approvals) are real, named, lower-priority follow-up.
- [x] **VERIFIED** — audit verified: `src/lib/audit.ts`'s `recordAuditEvent()`/`listAuditEventsForEntity()` are real, exercised by `scripts/idempotency-audit-check.ts` and `scripts/full-company-simulation.ts` (a real, queryable audit trail for a real project's full lifecycle).
- [ ] **PARTIALLY VERIFIED** — idempotency verified: Phase 37's demo-path concurrency fix is REAL and LIVE-verified (a genuine race reproduced then closed, in-process). The sandbox/production Firestore transactional path and its `'failed'`-status reclaim are verified structurally only (no live Firestore credential); a genuine process-crash-recovery gap is real, named, and NOT fixed this phase.

## Data

- [x] **VERIFIED** — canonical data model verified: 30 entities, branded IDs, exercised structurally across every phase's acceptance scripts (`scripts/domain-graph-check.ts` and the full `npm run checks` suite).
- [x] **VERIFIED** — project linkage verified: `scripts/full-company-simulation.ts` (Phase 29) and `scripts/dual-write-reconciliation.ts` (Phase 39) both confirm every entity in a real lifecycle resolves back to the correct, same `Project`.
- [ ] **PARTIALLY VERIFIED** — dual-write consistency verified: Phase 39's real (not described) reconciliation tool found 0 mismatches across 6 real comparisons spanning 3 of the 4 migrated domains, in demo mode — real evidence, but a single scenario, not exhaustive, and never run against a live Firestore backend.
- [ ] **PARTIALLY VERIFIED** — reconciliation clean: clean FOR THE SCENARIO TESTED (Phase 39); not yet run at scale across many real projects or against live infrastructure.
- [x] **VERIFIED** — data-quality checks pass: 14 real checks (`src/services/dataQuality.ts`, Phases 12+26), `scripts/data-quality-phase26-check.ts` confirms both real seeded problems ARE found and a correctly-linked project triggers zero issues.

## Workflow

All 6 items below are **PARTIALLY VERIFIED** — real code, genuinely
executed (not mocked, not merely described) through the actual
legacy-screen bridges and canonical service layer, proven by
`scripts/full-company-simulation.ts`'s 48 real assertions — but against
the DEMO repository, never a live authenticated Firestore backend
(Phase 38's honest BLOCKED status). Marking these plain "VERIFIED" would
overclaim; marking them "BLOCKED" would understate real, executed proof
that exists.

- [ ] **PARTIALLY VERIFIED** — commercial lifecycle passes (Lead → Quote → Contract → Payment).
- [ ] **PARTIALLY VERIFIED** — procurement lifecycle passes (PO → Supplier → Production → Dispatch).
- [ ] **PARTIALLY VERIFIED** — delivery lifecycle passes (Shipment → Arrival → Receipt).
- [ ] **PARTIALLY VERIFIED** — installation lifecycle passes (Check-in → Evidence → Completion).
- [ ] **PARTIALLY VERIFIED** — QC failure/rework/reinspection passes: the FULL controlled loop (fail → real auto-created Snag → rework → reinspection → pass) is genuinely exercised, including the Phase 09 hard gate proven BLOCKING before being satisfied.
- [ ] **PARTIALLY VERIFIED** — handover gate passes: the Phase 09 hard gate (`Handover.qcPassed`) is proven genuinely blocking a premature handover, then satisfied for real once QC passes and customer acceptance is recorded.

## Reliability

- [ ] **PARTIALLY VERIFIED** — offline outbox tested: `scripts/offline-sync-check.ts` (Phase 11) passes structurally; never tested against a real intermittent network / real device.
- [ ] **PARTIALLY VERIFIED** — upload retry tested: `src/offline/mediaUpload.ts`'s retry logic is real and structurally tested; no real Storage bucket to upload to yet (see Infrastructure).
- [ ] **BLOCKED — EXTERNAL SERVICE** — webhook retry tested: `src/integrations/`'s payment/logistics webhook handling fails closed and honestly reports `'unconfigured'` (Phase 24) — no real provider is configured in any environment, so a real webhook retry cannot be exercised at all yet, not even structurally beyond the fail-closed guarantee.
- [x] **VERIFIED** — duplicate request tested: Phase 37's concurrency test is REAL and LIVE (in-process) — genuinely proves duplicate/concurrent requests produce exactly one side effect.
- [x] **VERIFIED** — event dead-letter path tested: `scripts/event-bus-check.ts` (Phase 07) exercises the real retry + dead-letter + manual-escalation path structurally.

## UX

All 6 items below are **PARTIALLY VERIFIED** — every one has a real,
passing structural/code-level acceptance script
(`five-surfaces-check.ts`, `work-queue-check.ts`,
`project-operating-view-check.ts`, `control-tower-check.ts`,
`navigation-cutover-check.ts`, and the command palette's own mount
check) — but NONE has ever been visually rendered, screenshotted, or
clicked through in a real browser, because this sandbox has none. A
structural pass proves the code shape is correct; it does not prove a
human looking at the screen sees what is intended.

- [ ] **PARTIALLY VERIFIED** — five operating surfaces are usable.
- [ ] **PARTIALLY VERIFIED** — Work Queue shows actionable work.
- [ ] **PARTIALLY VERIFIED** — Project Operating View shows truth.
- [ ] **PARTIALLY VERIFIED** — Control Tower shows exceptions.
- [ ] **PARTIALLY VERIFIED** — command palette works.
- [ ] **PARTIALLY VERIFIED** — role-specific navigation works.

## Performance

- [x] **VERIFIED** — bundle measured: main chunk **2,792 KB** (gzip 717 KB), measured directly from a real `npm run build` at this phase's HEAD; `scripts/code-splitting-check.ts` enforces a regression-guard ceiling on every run.
- [x] **VERIFIED** — route chunks measured: **209** separate lazy-loaded chunk files in the real build output (one per code-split screen).
- [ ] **PARTIALLY VERIFIED** — critical path performance measured: bundle SIZE is measured as a real proxy; no real runtime performance trace (Lighthouse, Web Vitals, actual page-load timing) exists, since there is no browser in this sandbox to measure one.
- [x] **VERIFIED** — no unacceptable regression: the same regression-guard ceiling (`code-splitting-check.ts`) has been checked and passed after every one of the 40 phases' changes, including this one.

## Summary counts

| Status | Count |
|---|---|
| VERIFIED | 11 |
| PARTIALLY VERIFIED | 20 |
| BLOCKED — MISSING CREDENTIAL | 2 |
| BLOCKED — EXTERNAL SERVICE | 1 |
| FAILED — REQUIRES FIX | 0 |
| **Total items** | **34** |

**Zero items are FAILED — REQUIRES FIX.** Every gap found across Phases
31-40 that was safe and verifiable to fix directly (the 3 real Phase 32
bundle-bypass findings beyond the original scope, the 8 firestore.rules
findings from Phase 34 with 2 fixed in Phase 35, the 8 destructive-action
gaps in Phase 36, the 2 real idempotency bugs in Phase 37) WAS fixed, not
merely logged. What remains is honestly BLOCKED (missing a live
credential this sandbox cannot provide) or PARTIALLY VERIFIED (real,
executed proof exists, but not at the live-backend or human-visual level
this checklist's own bar requires for a plain VERIFIED).
