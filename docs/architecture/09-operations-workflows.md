# AIEC — Operations Through Handover (Phase 09)

Implements: `src/services/operationsWorkflow.ts`, plus two new real
Phase 07 event handlers (`QC_PASSED`, `HANDOVER_COMPLETED`) and 4 new
repository accessors. Acceptance check:
`scripts/operations-workflow-check.ts` (`npm run operations:check`).

Same architecture and same scope statement as Phase 08
(`08-commercial-workflows.md` §1): this is the real, tested
orchestration/business-logic layer; wiring the 189 existing screens to
call it is Phase 10's job, per `RUN_ALL.md`'s explicit instruction not to
do UX work before phases 02-09 establish the model.

## 1. The two hard gates, enforced in code

Phase 09's acceptance criteria are unusually specific about things that
must be IMPOSSIBLE, not just discouraged:

> "A failed QC cannot accidentally reach handover. A technician cannot
> bypass required job-entry controls. A customer acceptance is recorded
> before final handover completion."

This phase implements both as functions that **throw**, not as UI
validation that could be worked around by calling a different code path:

1. **Job-entry controls**: `checkIn()` throws unless
   `InstallationJob.siteReadinessConfirmed === true`.
   `completeInstallation()` throws unless the job has both a real
   `checkedInAt` timestamp AND has passed through the
   `evidence_pending` status (`progressToEvidenceCapture()`, which
   itself requires `evidenceCount >= 1`).
2. **QC-before-handover**: `confirmCompliance()` throws unless
   `Handover.qcPassed === true` — and `qcPassed` is settable by exactly
   one code path in the entire system: the `QC_PASSED` event handler
   (new in this phase, `src/events/handlers.ts`), symmetric to the
   existing `QC_FAILED` handler that forces it `false`. Neither
   `operationsWorkflow.ts`'s QC functions nor any service function sets
   `qcPassed` directly — they only ever publish `QC_PASSED`/`QC_FAILED`
   and let those two handlers be the single source of truth for the
   gate, so there is no second code path that could accidentally set it
   incorrectly. `issueCertificate()` similarly throws unless
   `Handover.customerAcceptedAt` is actually set by
   `recordCustomerAcceptance()` (restricted to the `customer` role, or
   `admin` recording on their behalf).

The acceptance script proves both gates by deliberately trying to bypass
them and asserting the specific error is thrown.

## 2. Delivery → Installation → QC → Handover, implemented

| Stage | Functions | Real effect |
|---|---|---|
| Delivery | `scheduleDelivery`, `markShipmentArrived`, `recordMaterialReceipt` | Creates real `Shipment`/`DeliveryReceipt` records; a damaged/missing receipt is recorded with `status !== 'ok'` and an `incidentId` anchor (Phase 09's "Receipt → Incident → Supplier Resolution" path) rather than silently succeeding |
| Installation | `assignInstallationJob` → `confirmSiteReadiness` → `checkIn` → `progressToEvidenceCapture` → `completeInstallation` → `requestQC` | Sequential `InstallationJob.status` transitions with the two entry-control hard gates above; `checkIn` publishes `INSTALLATION_STARTED`, `completeInstallation` publishes `INSTALLATION_COMPLETED` |
| QC | `recordQCResult` (pass/fail), `completeRework` | Fail publishes `QC_FAILED` (Phase 07's real handler: creates a `Snag` assigned to the technician, blocks handover); pass publishes `QC_PASSED` (this phase's new handler: unblocks handover); `completeRework` resets the linked inspection to `pending` and returns it for re-inspection — an explicitly open-ended loop, not a fixed retry count |
| Handover | `confirmCompliance` → `completeFinalChecklist` → `recordCustomerAcceptance` → `issueCertificate` | Gated as in §1; `issueCertificate` publishes `HANDOVER_COMPLETED` (this phase's new handler creates a real `Warranty` record) and advances `Project.stage` to `warranty_amc` |

## 3. Two new real Phase 07 event handlers

- **`QC_PASSED` → `unblockHandoverOnQcPass`**: the pass-path counterpart
  to the existing `QC_FAILED` handler. Sets `Handover.qcPassed = true`,
  `status: 'compliance_pending'`.
- **`HANDOVER_COMPLETED` → `startWarrantyOnHandoverCompletion`**: "Warranty/
  AMC are post-handover lifecycle stages" — starting the Warranty clock
  is the one automatic downstream effect of a completed handover this
  phase implements. AMC booking is deliberately NOT auto-created here —
  it is a customer/sales-initiated action in the real business, not an
  automatic consequence of handover, so auto-creating it would misrepresent
  the business process.

## 4. Acceptance

`scripts/operations-workflow-check.ts` — 17 assertions running
(approximately) Scenarios C, D, E from `13_FINAL_END_TO_END_ACCEPTANCE.md`:

- Delivery: shipment scheduled → arrived → material received OK.
- Installation: job assigned → **check-in blocked without site
  readiness confirmed** (hard gate) → confirmed → check-in succeeds →
  **completion blocked without evidence** (hard gate) → evidence
  captured → completion succeeds → QC requested.
- QC: inspection fails → Handover is explicitly `blocked_qc_not_passed`
  → **compliance confirmation blocked** (hard gate, cannot accidentally
  reach handover) → snag reworked → re-inspection passes → Handover
  unblocked (`qcPassed: true`) only now.
- Handover: compliance confirmed → checklist completed → **certificate
  issuance blocked without recorded customer acceptance** (hard gate) →
  acceptance recorded → certificate issued → **Warranty automatically
  created via the event bus** → Project reaches its final
  `warranty_amc` lifecycle stage.

All 17/17 pass. Full `npm run checks` (all 9 phases' acceptance scripts,
107 assertions total) passes with zero regressions.

## 5. What this phase deliberately did not do

- Did not rewire any existing screen — see the top-of-file scope
  statement, same reasoning as Phase 08.
- Did not implement a distinct Incident entity for damaged/missing
  deliveries (the domain model, Phase 02, does not define one) — used
  `DeliveryReceipt.incidentId` as the anchor instead, documented in the
  function's own comment rather than silently inventing a new entity
  type mid-phase.
- Did not auto-create an AMC record on handover completion — see §3.
- QC discipline (`mechanical`/`electrical`/`safety`/`general`) is
  accepted as a parameter but not enforced against any per-technician
  skill/certification check — "do not hard-wire every defect to one QC
  discipline" is satisfied by not hard-wiring it, but a real
  skill-matching assignment rule is future scope.

## 6. Build/typecheck

`npx tsc --noEmit` passes. `npm run checks` (all 9 acceptance scripts)
passes in full — 17/17 new assertions, zero regressions in the prior
90+. `npx vite build` passes.
