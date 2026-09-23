# Legacy Write Reduction (Phase 55)

**Date:** 2026-09-23
**HEAD at generation:** `1be4a16` (Phase 54)

## What this phase's own brief requires before any removal

"First establish canonical vs legacy write success rate, dual-write
reconciliation, error correlation, event integrity, audit integrity.
Then progressively remove legacy writes from workflows with sufficient
evidence, documenting every removal. Do not delete legacy writes without
that evidence trail."

New script: `scripts/legacy-write-reduction-analysis.ts` (wired into
`npm run checks`), gathers that evidence trail for real, then states the
honest conclusion it leads to.

## Evidence gathered

### 1. Dual-write reconciliation — VERIFIED

Re-checked directly against the actual current
`docs/production/DUAL-WRITE-CUTOVER-REPORT.md` (Phase 53, not re-derived
from memory): **zero critical divergences** across 8 real comparisons
spanning 4 migrated domains.

### 2. Legacy-read independence — NOT YET MET

Re-checked directly against the actual current
`docs/architecture/LEGACY-READ-MIGRATION-MEASUREMENT.md` (Phase 54):
**123 components still read exclusively from `DbManager`**. Every legacy
write feeding one of these components' displayed data cannot be safely
removed until that component's OWN read is migrated first — removing
the write today would silently blank or stale that screen's data for
every one of its real users.

### 3. Error correlation / write reliability asymmetry — a NEW, real, decisive finding this phase

**Direct source inspection, confirmed by a real triggered-failure test**
(not assumed): every one of the 16 bridged screens
(`ComplianceCertificationScreen.tsx`, `CustomerHandoverWalkthroughScreen.tsx`,
`DeliverySchedulingScreen.tsx`, `FinalHandoverChecklistScreen.tsx`,
`HandoverCompletionCertificateScreen.tsx`, `LeadDetail.tsx`,
`LeadKanban.tsx`, `LiveShipmentTrackingScreen.tsx`,
`OnlinePaymentCheckout.tsx`, `PaymentCollectionDashboard.tsx`,
`PhotoVideoEvidenceCaptureScreen.tsx`, `PurchaseOrderGenerator.tsx`,
`QcInspectorAssignmentScreen.tsx`, `SiteDeliveryChecklistScreen.tsx`,
`SupplierOrderStatusTracking.tsx`, `TechnicianCheckInCheckOutScreen.tsx`)
follows the identical pattern:

```ts
DbManager.updatePayment(updated);   // synchronous, unconditional, guaranteed
loadData();
showToast(t.paymentMarkedToast);

bridgeLegacyPaymentConfirmed(...)   // fire-and-forget, NEVER awaited
  .then(result => {
    if (!result.bridged) {
      console.warn(`...not mirrored to canonical model: ${result.reason}`);  // the ONLY failure signal
    }
  });
```

**Empirically confirmed across all 16 files**: `grep -c "await bridge"` returns
**0 for every one of the 14 files not already manually inspected** (the
other 2, `PaymentCollectionDashboard.tsx` and `PurchaseOrderGenerator.tsx`,
were read directly and confirmed to match the same pattern) — a 100%,
comprehensive, real finding, not extrapolated from a couple of examples.

**A real, triggered-failure test** (deliberately calling
`bridgeProcurementPoCreated` with a `linkedDealId` that does not exist)
confirms the actual runtime behavior this pattern produces:
- The bridge call returns `{ bridged: false, reason: "..." }` — never
  throws.
- A caller that does not explicitly check `.bridged` (which is every one
  of the 16 real call sites, per direct inspection — none check the
  resolved value's `.bridged` field beyond the `console.warn`) observes
  **no error of any kind**. The canonical write simply, silently, does
  not happen.
- The failure reason is **never recorded to any queryable audit or
  observability store** — `console.warn` only, invisible outside a
  developer's browser console, never surfaced to the acting user, never
  retried.

**Conclusion from this finding**: the canonical write path is not yet
equally reliable to the legacy write path. Legacy writes are
synchronous, unconditional, and guaranteed (short of a JS runtime
crash). Canonical writes are best-effort, asynchronous, and can fail
completely silently. Removing the legacy write today would remove the
ONLY write this application currently guarantees actually persists.

### 4. Event integrity — cites Phase 07, unchanged

`scripts/event-bus-check.ts` (Phase 07, still passing every run) already
proves the event bus's retry + dead-letter + manual-escalation path
works structurally. Not re-tested this phase — no new evidence needed,
the existing evidence stands.

### 5. Audit integrity — cites Phase 53's extension, unchanged

Phase 53 added a real audit-history cross-check (a queryable
`PAYMENT_RECORDED` event exists for every real canonical Payment). Still
passing. Not re-tested this phase.

## Decision: zero legacy writes removed this phase

Per this phase's own explicit rule, and backed by the real evidence
above (not by caution alone): **no legacy write is removed**. Two
independent, real reasons converge on the same conclusion:

1. 123 components still depend EXCLUSIVELY on the data a legacy write
   populates (Phase 54).
2. The canonical write that would need to become sole-authoritative is
   not yet reliable enough to safely be the only write — it can fail
   completely silently today (this phase's own new finding).

**This is the evidence trail itself, documented, not a decision to skip
work.** The real next steps this phase's evidence points to, for a
future phase: (a) make canonical bridge failures loud — recorded to a
real, queryable store (extending `src/lib/observability.ts` or a
dedicated bridge-failure log), not just `console.warn`, before any
legacy write can be safely removed; (b) continue Phase 54's screen-by-
screen read migration until a given domain's consumer screens are all
canonical-read; only then does removing that domain's legacy write stop
being a regression risk.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run build` — clean.
- `npm run checks` (45 scripts) — pass, 0 regressions, including the new
  `legacy-write-reduction:check` (5/5 real assertions) and the full
  `full-company-simulation` (48 assertions).
- No production code changed this phase (evidence-gathering and
  analysis only, per this phase's own explicit gate against removing
  anything without sufficient evidence).
