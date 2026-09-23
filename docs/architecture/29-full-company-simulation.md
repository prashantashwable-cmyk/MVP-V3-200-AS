# Phase 29 — Full Company Simulation

## 1. What's different from Phase 13's end-to-end acceptance

Phase 13's `scripts/final-e2e-acceptance.ts` ran one project through
Scenarios A-H by calling `commercialWorkflow.ts`/`operationsWorkflow.ts`
directly — proving the orchestration layer itself is correct. Phase 29's
`scripts/full-company-simulation.ts` runs the same kind of story through
the REAL legacy-screen bridges built in Phases 15-18 wherever one
exists — `bridgeLeadStageTransition`, `bridgeLegacyPaymentConfirmed`,
`bridgeProcurementPoCreated`/`bridgeProcurementPoStatusChanged`,
`bridgeDeliveryScheduled`/`bridgeShipmentArrived`/
`bridgeMaterialReceiptRecorded`, `bridgeInstallationProgress`,
`bridgeFinalChecklistCompleted`/`bridgeCustomerAcceptanceRecorded`/
`bridgeHandoverCertificateIssued` — i.e. the exact code path a real
click in `LeadKanban`, `PurchaseOrderGenerator`, `DeliverySchedulingScreen`,
`TechnicianCheckInCheckOutScreen`, `FinalHandoverChecklistScreen`, etc.
actually runs today, not a second, idealized story that only proves the
service layer works in isolation.

## 2. New ground covered

- **The QC failure → snag → rework → reinspection → pass loop**, in
  full, for the first time in this pack's acceptance suite (Phase 18's
  own installation/QC/handover check only exercised the clean pass
  path, by design — see that phase's §3). Exercised via
  `operationsWorkflow.recordQCResult`/`completeRework` directly, since
  Phase 18 found no safe single bridge point for QC FAIL exists yet
  (documented there, restated here, not silently worked around).
- **Two real unauthorized-role denials**, proven by attempting the
  action and asserting the denial, not just asserting the happy path: a
  technician cannot record a customer payment; a customer cannot issue
  their own handover certificate.
- **Both Phase 09 hard gates proven BLOCKING before being satisfied**,
  not just proven working once satisfied: the handover certificate is
  attempted (and correctly denied) BEFORE customer acceptance is
  recorded, then attempted again (and succeeds) after.
- **Every Phase 19/21/22/26 surface checked against the SAME real
  project's final state**: the customer portal summary shows the real
  completed handover and active warranty; the technician portal summary
  shows the real assigned-job count; the project operating view shows
  zero blockers and real audit history; the work queue correctly shows
  no critical item for this now-resolved project; the data-quality
  checks find zero issues on this project's complete, correctly-linked
  graph.

## 3. Two honestly-documented, not silently skipped, gaps

- **STEP 7 (negotiation)**: `Quote.status` supports `'negotiating'`
  (Phase 02's domain model), but no legacy screen has a bridge to it yet
  (`LiveNegotiationThread.tsx` remains `DbManager`-only) — the simulation
  proceeds straight to acceptance, matching what the real bridged
  screens can actually do today, and says so in its own console output.
- **STEP 28 (service issue)**: no canonical `ServiceCase` entity or
  repository was ever built (Phase 02 defined the id type only;
  `CustomerSupportTicketScreen.tsx` remains `DbManager`-only) — not
  exercised, stated plainly rather than faked.

## 4. Acceptance

- `npx tsc --noEmit` — pass.
- `npm run simulation:full-company` — pass, 48/48 assertions on the
  first successful run after fixing one real bug found while writing it
  (an assertion incorrectly expected the canonical Project's owner to be
  the admin actor rather than the lead's real surveyor — the underlying
  `ensureCanonicalProject` behavior was correct; the test assertion was
  wrong and was fixed, not the code).
- `npm run checks` (all 33 scripts) — pass, zero regressions in the
  prior 569 assertions.
- `npm run build` — pass.

## 5. Next phase

Phase 30 — Final Acceptance.
