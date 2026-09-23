# Legacy Database Elimination Plan (Phase 56)

**Date:** 2026-09-23
**HEAD at generation:** `d443210` (Phase 55)

Full data lives in the generated
`docs/architecture/LEGACY-DATABASE-ELIMINATION-STATUS.md` (new script:
`scripts/legacy-database-elimination-status.ts`, wired into `npm run
checks`). This is the narrative companion — method, one real bug caught
and fixed before trusting the output, and the summary.

## Method

Extends Phase 27's existing, real, regenerable inventory
(`docs/migration/LEGACY_DBMANAGER_REMAINING.md`) with the specific
classification categories this phase's brief names — applied per CALL
SITE (not per file, a finer grain than Phase 27 used), plus a
business-criticality-ordered removal plan.

## Real bug found and fixed before trusting the output

The first draft's business-critical-write detector matched a bare `'po'`
substring fragment (intended to catch `purchaseOrder`-related methods)
against the full lowercased method name. This silently matched inside
**unrelated words** — `saveCustomerSupportChatThread` contains "su**po**rt",
`addDamagedPartsReport` contains "re**po**rt" — inflating the
business-critical count from a correct 58 to a wrong 73, with 15 false
positives (Support/Report-related screens with no actual financial or
procurement significance). Caught by manually scanning the first run's
output before publishing it, not caught automatically — a reminder that
even a "safe," read-only analysis script needs its own output checked,
not just its exit code. Fixed by removing the bare `'po'` fragment and
relying on the already-present, more specific `'purchaseorder'` fragment
instead. Re-run confirmed: 58 real business-critical write call sites,
zero Support/Report false positives remaining.

## Headline results (live scan, this session)

| Metric | Count |
|---|---|
| Total files with DbManager usage | 150 |
| READ call sites | 369 |
| WRITE call sites | 283 |
| Authentication call sites | 14 |
| Configuration call sites | 2 |
| Reporting call sites | 14 |
| Temporary-demo call sites | 3 |
| Obsolete/unclassified-shape call sites | 13 |
| **Business-critical WRITE call sites** | **58** |
| Files: migrated (real dual-write bridge) | 16 |
| Files: justified exception | 5 |
| Files: remaining | 128 |
| Files: blocked | 0 |

**Zero files are "blocked"** — every remaining item is real, buildable
engineering work this sandbox could in principle do; none is stuck on a
missing credential or external dependency. That is a meaningfully
different (and more honest) claim than "in progress" — it says the
remaining 128 files are a real backlog, not a wall.

## Removal plan summary (full detail in the generated report)

1. No blind global rewrite — re-affirmed, per this pack's own explicit
   rule.
2. Phase order already proven safe by this pack's own experience: build
   a bridge if none exists → migrate reads screen-by-screen (Phase 54's
   method) → fix bridge-failure visibility (Phase 55's named gap) → only
   then remove the legacy write for that domain.
3. Priority order: the 58 business-critical write call sites, highest
   blast-radius first (payments/payouts/refunds → contracts/PO/discounts
   → credentials/permissions/roles), matching Phase 35's already-
   established P0 ordering.
4. The 5 justified exceptions (session bootstrap, language/theme prefs,
   one dev-only reset utility) stay — reasoned, not debt.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run build` — clean.
- `npm run checks` (46 scripts) — pass, 0 regressions.
- No production code changed this phase (classification/planning only,
  per this phase's own explicit "do not perform a blind global
  rewrite" instruction).
