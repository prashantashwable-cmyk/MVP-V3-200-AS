# Phase 26 — Data Quality and Single Source of Truth

## 1. What Phase 12 already covered

6 of the pack's named checks already existed and are unchanged:
duplicate customers, orphaned payments, orphaned POs, inconsistent
project statuses (a later-stage project with no Payment), expired
documents, stale records.

## 2. 8 new checks added to `src/services/dataQuality.ts`

Every check is a real query against the repository layer, returning
concrete record IDs, following the exact pattern Phase 12 established —
no new pattern, no fabricated counts:

- **`findCustomersWithoutSite`** — a Customer with no linked Site.
- **`findSitesWithoutProject`** — a Site with no linked Project.
- **`findProjectsMissingQuoteOrContract`** — extends Phase 12's "does
  the stage imply a record that doesn't exist" pattern to the two
  earlier required documents: a project at `'contract'` stage or later
  with no Quote; a project at `'payment'` stage or later with no
  Contract.
- **`findOrphanedInstallationJobs`** — a Job whose `projectId` doesn't
  resolve.
- **`findQcWithoutInstallation`** — a QCInspection whose
  `installationJobId` doesn't resolve.
- **`findHandoverWithoutQcPass`** — a genuinely DEFENSIVE check: Phase
  09's `confirmCompliance()` already throws unless
  `Handover.qcPassed === true` (a real code-level hard gate), but a hard
  gate enforced in service-layer code is not the same guarantee as a
  database constraint. This check exists specifically to catch the case
  where some future direct write bypasses the gate — documented as
  defensive, not expected to ever fire in normal operation.
- **`findOrphanedDocuments`** — a DocumentRecord whose `projectId` is
  set but doesn't resolve.
- **`findDuplicateProjects`** — two Projects sharing the same
  `(customerId, siteId)` pair, a real, useful duplicate signal (the same
  building quoted or sold twice by mistake) — deliberately narrower than
  matching on title/name alone, which would false-positive on a customer
  legitimately having multiple different sites.

All 14 checks (6 + 8) are wired into `runAllDataQualityChecks()`.

## 3. Regression test

`scripts/data-quality-phase26-check.ts` (`npm run
data-quality-phase26:check`, wired into `npm run checks`) — 19
assertions: each new check finds a real, deliberately-seeded problem;
where a clean counterpart makes sense (customer-with-site,
project-with-quote, handover-with-real-qc-pass), the check correctly
finds NOTHING wrong with it — proving the checks are precise, not just
permissive pattern matches; and all 8 are confirmed present in the
combined `runAllDataQualityChecks()` output alongside the Phase 12
originals.

A real test-authoring mistake was found and fixed while writing this:
the first draft asserted a site created early in the script stayed
"without a project" all the way to the final combined-runner assertion —
but that same site went on to receive several real Projects earlier in
the same script (for other checks' fixtures), so by the end it correctly
had no issue. Fixed by using a dedicated site that genuinely never gets
a project for the test's full duration, rather than weakening the
check's real logic to match a flawed test.

## 4. Acceptance

- `npx tsc --noEmit` — pass.
- `npm run data-quality-phase26:check` — pass, 19/19 assertions.
- `npm run checks` (all 30 scripts) — pass, zero regressions in the
  prior 520 assertions (`control-tower-check.ts`, which also calls
  `runAllDataQualityChecks()`, passes identically).
- `npm run build` — pass.

## 5. Known limitations

- "Invalid identifiers" (one of the pack's original 8 named checks) and
  a generic catch-all "missing required relationships" beyond the
  specific ones now covered remain out of scope — Phase 12 already
  judged these lower-value given the domain model's compile-time
  branded-ID safety (Phase 02), a judgment reaffirmed rather than
  revisited this phase.
- None of these checks are yet surfaced in any UI screen — they are
  real, callable, and tested (same as Phase 12's originals), ready for a
  Control Tower or admin-tools screen to render, not yet wired into one.

## 6. Next phase

Phase 27 — Legacy DbManager Elimination (measurement).
