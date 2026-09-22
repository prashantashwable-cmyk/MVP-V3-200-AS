# Phase 18 — Migrate Installation + QC + Handover

Same dual-write pattern as Phases 15-17, applied to the deepest,
gate-heaviest part of the operations lifecycle: `Assigned → Site
Readiness → Check-in → Evidence → Completion → QC Request → Inspection →
PASS/Snag → Compliance → Final Checklist → Walkthrough → Customer
Acceptance → Handover Certificate`, including BOTH of Phase 09's hard
gates enforced as code that throws.

## 1. Two legacy "Job" shapes, one resolver

Installation/QC/handover screens key off two different legacy types that
both happen to carry a `dealId` — `Job` (`src/types.ts`, used by
`CustomerHandoverWalkthroughScreen`) and `TechnicianJob` (used by the
other six screens). `resolveProjectForLegacyJob()` in
`legacyCommercialBridge.ts` tries `DbManager.getTechnicianJobById()`
first, falls back to `DbManager.getJobById()`, and resolves the
canonical Project from whichever one is found — every bridge function in
this phase takes just a `legacyJobId: string`, matching what each real
screen already has as a prop.

## 2. The "ensure-forward" installation bridge

`bridgeInstallationProgress(actor, legacyJobId, target, opts)` is the
core addition: it walks the canonical `InstallationJob` from wherever it
currently is up to (at least) `target` (`'checked_in'` /
`'evidence_captured'` / `'completed'` / `'qc_requested'`), tolerant of
already being further along. This matters because three independent real
screens (check-in, evidence capture, QC assignment) each call it, in
whatever order a real technician actually uses them — the bridge does
not assume a fixed call sequence.

**Hard gate #1 stays real**: site readiness is confirmed automatically
inside this bridge (the technician's physical check-in via the real
screen IS treated as the real-world readiness signal) — but the actual
gate code, `checkIn()` throwing when `siteReadinessConfirmed` is false,
is untouched. A genuine finding while wiring this: a technician calling
`bridgeInstallationProgress` for a job that was never assigned to them
correctly FAILS (caught by the acceptance script, see §4) — `assignInstallationJob`
requires `project.update`, which technicians do not have. This is
correct real-world behavior, not a bug, and led to extending Phase 17's
`bridgeDeliveryScheduled` (the real "technician assigned" moment) to
also create the canonical `InstallationJob`, so it genuinely exists by
the time a real technician's check-in bridge runs.

## 3. QC PASS bridged; QC FAIL deliberately not, this phase

`bridgeQcPassed(actor, legacyJobId, inspectorId)`, wired from
`ComplianceCertificationScreen.handleIssueOrUpdateCert`, is the one
real-world action that unambiguously means "QC passed": issuing the
compliance certificate. It calls `recordQCResult(..., 'pass', ...)` —
which, via the REAL Phase 07 `QC_PASSED` handler, is the only code path
anywhere allowed to set `Handover.qcPassed = true` — then immediately
`confirmCompliance()`, since issuing the certificate IS the real-world
"handover compliance confirmed" moment.

The QC FAIL path was investigated and deliberately NOT bridged this
phase: `QualityChecklistMechanicalScreen`/`QualityChecklistElectricalScreen`
recompute `overallStatus` on EVERY individual item toggle (pending →
passed → failed → passed…), with no discrete "submit" action. Bridging
every toggle to `recordQCResult('fail')` would fire the real `QC_FAILED`
event — which creates a brand-new canonical `Snag` record — on every
single click, producing duplicate Snags for one real inspection cycle.
`DefectSnagListScreen.handleCreateSnag` was considered as the fail
trigger instead, but one job can legitimately have multiple independent
snags logged over time, not a clean 1:1 mapping to "this QC inspection
failed." Rather than ship an approximate mapping that would misfire, this
is reported as an honest, documented gap — the QC FAIL → Snag → Rework →
Re-inspection loop remains DbManager-only, ready for a follow-up phase
once these two checklist screens have a real discrete submit action to
bridge from.

## 4. Screens wired

| Screen | Business action bridged |
|---|---|
| `TechnicianCheckInCheckOutScreen.tsx` | Check-in (`handlePerformCheckIn`) |
| `PhotoVideoEvidenceCaptureScreen.tsx` | Evidence saved (`handleSaveEvidence`) |
| `QcInspectorAssignmentScreen.tsx` | Inspector assignment confirmed (`handleConfirmAssignment`) — completes installation + requests QC |
| `ComplianceCertificationScreen.tsx` | Certificate issued/reissued (`handleIssueOrUpdateCert`) — real QC PASS + compliance confirmed |
| `FinalHandoverChecklistScreen.tsx` | Handover readiness confirmed (`handleConfirmReadyForHandover`) |
| `CustomerHandoverWalkthroughScreen.tsx` | Customer sign-off (`handleFinalSubmit`) — real customer acceptance |
| `HandoverCompletionCertificateScreen.tsx` | Final payouts triggered (`handleTriggerFinalPayouts`, this screen's concluding action) — real certificate issuance |
| `DeliverySchedulingScreen.tsx` (extended) | Now also assigns the canonical InstallationJob when locking a schedule (Phase 17 screen, Phase 18 addition) |

## 5. Regression test

`scripts/installation-qc-handover-bridge-check.ts` (`npm run
installation-qc-handover-bridge:check`, wired into `npm run checks`) —
23 assertions running the ENTIRE chain on one real project: an
unresolvable job id reports a reason; realistic sequencing (PO → delivery
scheduling assigns the InstallationJob) before check-in is even
attempted; check-in with the site-readiness gate genuinely satisfied;
idempotent re-entry; evidence capture; QC assignment completing
installation and requesting QC; a real QC PASS setting
`Handover.qcPassed = true` (proven, not assumed); an idempotent
re-issued certificate; **the handover certificate genuinely BLOCKED**
before customer acceptance is recorded (Phase 09's hard gate #2, proven
by attempting it and asserting the denial, not just asserting the happy
path); then final checklist → walkthrough → acceptance → certificate all
succeeding once the gate is satisfied.

## 6. Acceptance

- `npx tsc --noEmit` — pass.
- `npm run installation-qc-handover-bridge:check` — pass, 23/23
  assertions.
- `npm run checks` (all 20 scripts) — pass, zero regressions in the prior
  385 assertions (including `delivery-bridge:check`, re-verified against
  `bridgeDeliveryScheduled`'s new optional `technicianId` parameter,
  backward compatible).
- `npm run build` — pass.
- Matrix regenerated: 17 `PARTIALLY_MIGRATED` (up from 10), 139 `LEGACY`
  (down from 146), zero registry drift.

## 7. Known limitations

- Same dual-write caveat as Phases 15-17.
- QC FAIL / Snag / Rework / Re-inspection loop remains entirely
  DbManager-only, honestly documented as deferred (§3), not silently
  dropped — this is the largest single remaining gap in the
  operations-side migration.
- `bridgeInstallationProgress`'s "ensure-forward" design means a caller
  requesting `target: 'qc_requested'` implicitly also drives check-in and
  evidence capture if they have not happened yet — correct for the real
  screens wired this phase (which always call it in the right order for
  their own step), but a caller requesting a later target out of order
  with insufficient permission for an earlier implicit step will fail at
  that step, not at the one it asked for; the returned `reason` still
  names the real failure.
- `HandoverCompletionCertificateScreen`'s bridge point (final payouts) is
  a reasonable but imperfect proxy for "certificate issuance" — the
  screen's own certificate data appears to be generated/loaded before
  this action, not created by it.

## 8. Next phase

Phase 19 — Migrate Customer, Supplier, Technician Portals (role-oriented
work instead of module-oriented navigation).
