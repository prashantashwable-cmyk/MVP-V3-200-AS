# AIEC Implementation Log

Tracks execution of the AIEC Claude Code Sequential Improvement Pack, one
entry per phase. Newest entry at the bottom.

---

## Phase 01 — Discover and Baseline

**Date:** 2026-09-22
**Status:** Complete

### What changed

- Ran `npm install` (checked-out `node_modules` was incomplete/stale — 1
  entry only — and had to be installed before anything else could run).
- Verified baseline: `npx tsc --noEmit` passes with 0 errors; `npx vite
  build` succeeds (single ~6.5MB JS chunk, PWA precache generated). No
  automated test suite exists in the repo (no `*.test.*`/`*.spec.*`
  files, no test runner configured).
- Added `docs/architecture/01-current-state.md`: architecture diagram,
  route/screen inventory summary, entity inventory, current data
  sources, current auth model, workflow representation, integration
  inventory, simulated/demo behavior, duplicated concepts, high-risk
  technical debt, recommended migration order, baseline verification.
- Added `docs/architecture/screen-inventory.csv`: machine-generated
  inventory of all 189 `src/components/*.tsx` files, cross-referenced
  against the 6 router files for role/route usage, grepped for
  `DbManager`/`firestore`/`localStorage` data-source hints, and
  keyword-classified into a five-surface hypothesis (WORK / CUSTOMERS /
  OPERATIONS / FINANCE / CONTROL / UNCLASSIFIED) for Phase 10 to confirm
  or correct.

### Files/subsystems touched

- `docs/architecture/01-current-state.md` (new)
- `docs/architecture/screen-inventory.csv` (new)
- `docs/aiec-implementation-log.md` (new, this file)
- No application source code was changed.

### Tests run

- `npx tsc --noEmit` — pass
- `npx vite build` — pass

### Known limitations

- The screen-inventory classification (surface/data-source) is
  heuristic (filename + grep based), not a hand-verified read of all 189
  files — necessary at this scale; Phase 10 must confirm before treating
  `surface_candidate` as final.
- 5 components (`CameraCapture`, `CustomReportBuilder`, `GeminiTools`,
  `LeadDetail`, `MapFiltersLayersControlPanel`) are not referenced by
  name in any router or `App.tsx` — likely reached as modals/subviews
  from inside other screens, but not confirmed; not deleted, flagged for
  follow-up.
- `pg`/`postgres`/`drizzle-orm`/`drizzle-kit` are present in
  `package.json` but no schema or usage was found — documented as
  unused scaffolding, not treated as a live integration.

### Next phase

Phase 02 — Canonical Domain Model and Project Spine.

---

## Phase 02 — Canonical Domain Model and Project Spine

**Date:** 2026-09-22
**Status:** Complete

### What changed

- Added `src/domain/ids.ts`: branded ID types for every canonical entity
  (`UserId`, `CustomerId`, `SiteId`, `ProjectId`, `QuoteId`,
  `QuoteVersionId`, `ContractId`, `PaymentScheduleId`, `PaymentId`,
  `InvoiceId`, `SupplierId`, `PurchaseOrderId`, `ProductionOrderId`,
  `ShipmentId`, `DeliveryReceiptId`, `InstallationJobId`,
  `QCInspectionId`, `SnagId`, `HandoverId`, `WarrantyId`, `AMCId`,
  `ServiceCaseId`, `DocumentId`, `NotificationId`,
  `ApprovalRequestId`, `AuditEventId`, `WorkflowInstanceId`,
  `WorkflowExecutionId`), plus `ProjectScoped`/`Versioned` shared shapes.
- Added `src/domain/entities.ts`: canonical interfaces for all 29 entities
  named in `RUN_ALL.md`/Phase 02, including the single `ProjectStage`
  lifecycle enum that every project-scoped record can be read against.
- Added `src/domain/adapters.ts`: pure conversion functions
  (`leadToCustomer`, `leadToSite`, `leadAndDealToProject`,
  `legacyPaymentToCanonical`, `projectToDefaultPaymentSchedule`) that
  derive the canonical graph from the existing `Lead`/`Deal`/`Payment`
  shapes in `src/types.ts`, using deterministic derived IDs
  (`proj_<leadId>` etc.) so repeated adaptation of the same legacy record
  is idempotent and stable.
- Added `scripts/domain-graph-check.ts`: standalone acceptance check
  (no test framework exists — see Phase 01) that builds a full
  Customer → Site → Project → Quote → Contract → Payment graph from a
  realistic legacy fixture and asserts every ID reference resolves
  correctly (16 assertions, all passing). Wired as `npm run domain:check`
  (and `npm run checks` = lint + domain:check).
- Added `docs/architecture/02-domain-model.md`: full entity reference
  table (ID / owner / source of truth / relationships / lifecycle field /
  who may mutate / immutable fields / audit requirement) for all 29
  entities, plus the rationale for adapters-over-rewrite and the
  acceptance demonstration writeup.

### Files/subsystems touched

- `src/domain/ids.ts` (new)
- `src/domain/entities.ts` (new)
- `src/domain/adapters.ts` (new)
- `scripts/domain-graph-check.ts` (new)
- `docs/architecture/02-domain-model.md` (new)
- `package.json` (added `domain:check` and `checks` scripts only)
- No existing component, router, or `DbManager` code was modified —
  this phase is purely additive per the pack's "adapters, not mass
  rewrite" instruction.

### Tests run

- `npx tsc --noEmit` — pass (0 errors, new `src/domain/` module included)
- `npm run domain:check` — pass, all 16 ID-graph assertions succeed
- `npx vite build` — pass (unchanged bundle size, app code untouched)

### Known limitations

- Canonical entities are defined but **not yet the persistence target**
  for any screen — that is Phase 04's job. As of this phase, `DbManager`
  and the two existing Firestore modules (`firestoreUsers.ts`,
  `firestoreLeads.ts`) remain the only things screens actually read/write.
- `Quote`/`QuoteVersion`/`Contract` have no legacy equivalent to adapt
  from (the current app represents quoting/negotiation as scattered
  screen-local state — see Phase 01 §9), so the acceptance script
  constructs them directly from canonical types rather than via an
  adapter. Phase 08 will need to decide where real Quote/Contract records
  get created from in the actual UI flow.
- Derived IDs (`deriveId('proj', lead.id)`) are a read-time adaptation
  convenience, not a migration strategy — Phase 04 must decide whether
  real Firestore documents mint fresh IDs or keep this derivation scheme
  when backfilling.

### Next phase

Phase 03 — Workflow State Machine and Screen Registry.

---
