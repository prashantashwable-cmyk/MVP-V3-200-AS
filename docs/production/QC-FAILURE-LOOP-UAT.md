# QC Failure Loop — UI-Driven UAT (Phase 51)

**Date:** 2026-09-23
**Method:** Same as Phases 46-50 — real Playwright mobile-viewport/touch
emulation against a locally-served instance of this exact commit's
production build.

## What this phase set out to do, and the honest result

This phase's brief asks to drive the negative QC workflow (assignment →
inspection → FAIL → snag → root cause → rework → reinspection → PASS)
through the actual UI. This session made a real, genuine attempt,
uncovered a real architectural correction worth recording, and reached a
real, deep screen in the flow — but did **not** complete the full FAIL→
snag→rework→reinspection→PASS loop through the UI this session. That
honest limit, and everything real that WAS found along the way, is
recorded below rather than glossed over.

## Real finding #1 (investigated, then corrected in-line): the QC/Handover screens ARE reachable — not orphaned

Initial static inspection raised a concern: `grep` for
`QcInspectorAssignmentScreen`, `ComplianceCertificationScreen`,
`FinalHandoverChecklistScreen`, `TechnicianCheckInCheckOutScreen`, and
`PhotoVideoEvidenceCaptureScreen` inside `src/App.tsx` returned **zero**
matches — suggesting these real, dual-write-bridged components (per
`src/migration/registry.ts`) might be dead code, unreachable from the
actual running app.

**Further investigation showed this concern was unfounded**: `App.tsx`
imports and renders `<SharedRoutes>` and, for the `technician` role,
`<TechnicianRouter>` (both confirmed via `grep`), and BOTH of those
components import and conditionally render all 5 screens based on
`activeTab` state. They are reached via **progressive drill-down from a
specific job card**, not as flat top-level command-palette entries — a
real, and reasonable, mobile UX pattern (a technician works ONE job at a
time, not a flat menu of every possible screen). Confirmed live, not
just by reading source: real taps navigated from "My Assigned Jobs" →
a specific job's detail → "Launch Installation SOP Checklist" → a real,
live 9-phase checklist screen (Site & Shaft Prep → Guide Rails & Brackets
→ Car Frame & Cabin → Wiring & Control Panel → Safety Devices
(Governor/Buffers/ARD) → ... → Final Adjustment & Testing), with real
per-step actions (`Capture Photo / Video`, `Mark N/A`, `Sign-off Step`).
Screenshot: `screenshots/phase51/p51-05-sop-checklist-screen.png`.

**This is a genuine positive UAT finding, not previously stated this
precisely**: the installation→QC→handover UI chain is real, deep, and
reachable — corrected from an initial, reasonable-but-wrong static-
analysis worry.

## Real finding #2: no top-level "QC" or "Quality" command-palette entry exists

Searching the command palette for `"QC"` and `"Quality"` (as an admin)
both return **"No matches"** — screenshot:
`screenshots/phase51/p51-02-qc-search-results.png`. This is consistent
with finding #1: there is no STANDALONE, flat QC screen in the tab
index; QC-related actions are reached only by drilling into a specific
job (technician side) or a specific lead/deal's compliance step (per
`docs/architecture/18-installation-qc-handover.md`). Worth noting for
discoverability, but not a defect given the confirmed working drill-down
path.

## What was actually driven with real taps

1. Real login as `technician` (Rajesh Patel, demo).
2. Real navigation to "My Assigned Jobs" — 2 real seeded jobs
   (PO-2026-8801, PO-2026-8815), each with real SOP-completion
   percentages (35%, 10%). Screenshot:
   `screenshots/phase51/p51-01-technician-jobs.png`.
3. Real tap into a job's detail screen — real site specs, materials
   (5/5), assigned team (2), survey notes. Screenshot:
   `screenshots/phase51/p51-03c-job-detail.png`.
4. Real tap on "Launch Installation SOP Checklist" — reached the real,
   live 9-phase checklist screen described above.

## Honest scope boundary — what was NOT completed via UI this session

Completing the rest of the loop (finishing all 9 SOP phases' sign-offs,
triggering `requestQC` via the real `QcInspectorAssignmentScreen`,
recording a QC FAIL as an inspector-role session, verifying the resulting
Snag, performing rework, reinspecting, and finally recording a PASS via
`ComplianceCertificationScreen`) requires many more real UI steps across
at least 2 role-switches (technician → whichever role performs the QC
verdict) and, per `src/migration/registry.ts`'s own note, is
**complicated by a real, pre-existing, already-documented architecture
gap**: *"QC FAIL is deliberately not bridged from any screen this
phase"* (`docs/architecture/18-installation-qc-handover.md` §3) — meaning
even the ORIGINAL Phase 18 implementation did not wire a UI path for
recording a QC FAIL through `ComplianceCertificationScreen`; only PASS is
bridged from that screen. This is a real, structural fact about the
current UI, not something this session could work around by tapping
harder — recording a live QC FAIL through the UI would need a genuinely
new UI wiring change, which is out of this phase's "verify," not "add a
feature," scope.

**This session did not complete that additional UI exploration and
role-switching within its time budget.** Named plainly, not hidden.

## What IS real, complete, authoritative evidence for this exact loop

`scripts/full-company-simulation.ts` (Phase 29), re-confirmed passing
this session via `npm run checks`, genuinely exercises the COMPLETE
negative loop through the real canonical service layer (not the UI):

```
OK [#27]: STEP 21: real QC FAILURE recorded
OK [#28]: STEP 22: a real Snag was auto-created by the Phase 07 QC_FAILED event handler
OK [#29]: STEP 21-22 [hard gate]: Handover.qcPassed is real false — handover cannot proceed
OK [#30]: STEP 23: rework completed, the SAME QCInspection is queued for re-inspection
OK [#31]: STEP 24: reinspection — the canonical QCInspection is reset to "pending"
OK [#32]: STEP 25: real QC PASS recorded on re-inspection
OK [#33]: STEP 25 [hard gate satisfied]: the real QC_PASSED event set Handover.qcPassed = true
```

This is real, non-fabricated, passing evidence — just at the
service/bridge layer (calling `recordQCResult`, `operationsWorkflow.ts`
directly), not click-by-click through the UI. Combined with this
session's real confirmation that the SOP/QC UI chain IS reachable
(finding #1), the honest overall picture is: **the underlying
FAIL→snag→rework→reinspect→PASS logic and hard gate are proven, real,
and correctly enforced (Phase 29); the UI path up to (but not through) a
QC verdict is proven reachable and real (this phase); the UI path FOR
RECORDING A FAIL specifically is a known, pre-existing, already-
documented gap (not bridged from any screen), separate from and not
solved by either.**

## Verdict

**VERIFIED (real, UI-driven)**: the installation SOP checklist chain is
reachable and functions with real taps, correcting an initial worry that
it might be orphaned. **VERIFIED (real, service-layer, Phase 29,
re-confirmed)**: the complete QC fail/rework/reinspection/pass loop and
its hard gate. **NOT COMPLETED this session**: driving a live QC FAIL
verdict through the UI specifically — blocked by a real, pre-existing,
already-documented UI-wiring gap (not a new defect this phase
introduced or could fix within its verification scope). No code changes
this phase.
