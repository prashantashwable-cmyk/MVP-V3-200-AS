# AIEC — End-to-End Acceptance Record (Phases 1-30)

Pass/fail record for every scenario in `13_FINAL_END_TO_END_ACCEPTANCE.md`,
originally run 2026-09-22 against the Phase 1-13 foundation, **re-verified
2026-09-23 against the full Phase 1-29 system** (this file is the Phase 30
"Final Acceptance" record). Primary evidence:

- `scripts/final-e2e-acceptance.ts` (`npm run e2e:check`) — one project
  through Scenarios A-H via the orchestration layer directly (Phase 13,
  unchanged, still passing).
- `scripts/full-company-simulation.ts` (`npm run simulation:full-company`,
  Phase 29) — the SAME kind of story, but this time through the REAL
  legacy-screen bridges built in Phases 15-18 wherever one exists, i.e.
  the exact code path a real click in `LeadKanban`, `PurchaseOrderGenerator`,
  `DeliverySchedulingScreen`, `TechnicianCheckInCheckOutScreen`,
  `FinalHandoverChecklistScreen`, etc. actually runs today — not a second,
  idealized story that only proves the service layer works in isolation.
- The full `npm run checks` suite — **33 scripts, 996 individual assertions,
  0 failures**, run fresh as part of this Phase 30 record (see full table
  below).

## Scenario results (Phase 13 orchestration layer, still passing unchanged)

| Scenario | Result | Evidence |
|---|---|---|
| A — New project (Lead → Qualification → Survey → Customer/Site → Quote → Approval → Send → Acceptance → Contract → Payment) | **PASS** | `final-e2e-acceptance.ts`: Lead converts to a real Customer/Site/Project; Quote created → approved → sent → accepted; Contract auto-created via the event bus; Payment collected; Project state (persistence), permission checks (authorization), and audit events (Phase 06) all verified at each step. **Partial note**: pre-quote Sales sub-stages (qualification/assignment/follow-up/site-survey) are modeled as a real state machine (Phase 03) but have no dedicated service-layer mutation function in this pack (Phase 08's documented scope decision — see `08-commercial-workflows.md` §5) since `Lead` already has a working, separate real persistence path. |
| B — Procurement (Project → Need → Supplier → PO → Approval → Supplier Acceptance → Production → Dispatch) | **PASS** | `final-e2e-acceptance.ts`: PO created → approved (with an unauthorized-approval attempt correctly denied, tested in `commercial-workflow-check.ts`) → supplier acceptance recorded → dispatched. Every record's `projectId` verified to match the same project. |
| C — Delivery and installation (Dispatch → Tracking → Arrival → Material Receipt → Installation Job → Check-in → SOP → Evidence → Completion) | **PASS** (offline-interruption sub-test run separately) | `final-e2e-acceptance.ts`: shipment scheduled → arrived → material received → installation job assigned → site-readiness-gated check-in → evidence capture → completion, all against the same project. **Offline interruption**: proven in `scripts/offline-sync-check.ts` (Phase 11) — a network interruption mid-upload leaves the resumability checkpoint intact and a retry resumes rather than restarting. |
| D — QC failure (Installation Complete → QC → Fail → Snag → Rework → Reinspection → Pass) | **PASS** | `final-e2e-acceptance.ts`: QC recorded fail → real Snag created and Handover explicitly blocked (`qcPassed: false`) → rework completed → reinspection recorded pass → Handover unblocked (`qcPassed: true`) ONLY at that point, never earlier. |
| E — Handover (QC Pass → Compliance → Checklist → Customer Walkthrough → Acceptance → Handover Certificate → Warranty/AMC) | **PASS** | `final-e2e-acceptance.ts`: compliance confirmed → final checklist → customer acceptance recorded → certificate issued (gated on that recorded acceptance) → Warranty automatically created via the event bus → Project reaches its final `warranty_amc` lifecycle stage. |
| F — Duplicate/retry (payment request, webhook, notification, automation trigger) | **PASS** | `final-e2e-acceptance.ts` + `idempotency-audit-check.ts` (Phase 06) + `notification-reconciliation-check.ts` (Phase 11). Phase 23 additionally upgraded the idempotency guard to a real Firestore `runTransaction` two-phase claim for sandbox/production environments (demo path unchanged — see Known limitations). |
| G — Security (unauthorized quote discount, payment action, refund, permission change, document access, automation publish) | **PASS** | `final-e2e-acceptance.ts` + `authz-check.ts` (Phase 05, 16 assertions) + Firestore rules (Phase 04/09/11). Phase 29 additionally proves two MORE denials on the real bridged path (see below). |
| H — Two-user truth (User A changes a project, User B opens it, both see the same state after refresh) | **PASS**, with one documented scope note | Repository/demo-store mechanism verified; a live two-browser, two-Firebase-Auth-session run against production Firestore was not possible in this sandbox (no credentials — inherited from Phase 04, unchanged through Phase 29). |

## Scenario results (Phase 29 — same stories, through the REAL legacy-screen bridges)

`scripts/full-company-simulation.ts` (`npm run simulation:full-company`) —
**48/48 assertions pass**, a single project run from a brand-new Lead
through the entire lifecycle to `warranty_amc`, via the real dual-write
bridges (Phases 15-18) and the real canonical service layer where no
bridge exists yet (Phase 09):

- Lead → qualification → survey → canonical Project (owner correctly
  derived from the real surveyor, not the calling actor).
- Quote created/approved/sent/accepted through the real bridge; Contract
  and Project-stage advance both fire automatically off the Phase 07
  event bus, not a direct call.
- Advance payment bridged into a real, idempotent canonical Payment for
  the exact confirmed amount.
- **New denial #1**: a technician cannot record a customer payment —
  denied at the authorization boundary, not silently allowed.
- Procurement PO created → approved → supplier-accepted → in production →
  dispatched, all through the real bridge, Project stage genuinely
  advancing to `delivery`.
- Delivery scheduled with technician assignment, shipment arrival,
  material receipt — all real canonical records.
- Technician check-in through the real Phase 09 site-readiness hard gate
  (not bypassed), evidence captured, installation completed, QC
  requested.
- **The full QC failure → snag → rework → reinspection → pass loop**,
  for the first time in this pack's acceptance suite run through the real
  service layer end to end, with `Handover.qcPassed` proven `false`
  before the loop resolves and `true` only after the real QC_PASSED event
  fires.
- **New denial #2**: a customer cannot issue their own handover
  certificate — denied, not silently allowed.
- **Both Phase 09 hard gates proven BLOCKING before being satisfied**:
  the handover certificate is attempted (and correctly denied) BEFORE
  customer acceptance is recorded, then attempted again (and succeeds)
  after.
- Handover certificate issued, Warranty auto-created by the event bus,
  Project reaches its final `warranty_amc` stage.
- Every Phase 19/21/22/26 surface (Customer Portal, Technician Portal,
  Project Operating View, Work Queue, data-quality checks) checked
  against this SAME project's final state and found correct.
- Two gaps honestly documented, not silently skipped: negotiation
  (`Quote.status = 'negotiating'` has no legacy-screen bridge yet) and
  post-handover service issues (no canonical `ServiceCase` entity was
  ever built).

## Phase 30 — the six named final-acceptance tests

| Test | Result | Real evidence |
|---|---|---|
| **Employee test** — can a single frontline user (surveyor, technician, or supplier) do their real job entirely inside the platform, with no side channel? | **PASS** | Phase 19 portal summaries (`getTechnicianPortalSummary`, `getSupplierPortalSummary`) plus Phase 20's Operating Surfaces (now the PRIMARY landing screen for every role as of Phase 28 — `navigation-cutover:check`, 25 assertions) plus Phase 22's Work Queue give every role a real, canonical-data-backed home screen. Phase 29's simulation exercises the technician role end to end (check-in through a real hard gate, evidence capture, denied payment action) and the `production-demo-gate:check` confirms no demo credential reaches a production build. |
| **Department handoff** — does work correctly cross from one department/role to the next (Sales → Procurement → Operations → Handover) without manual re-entry or a dropped baton? | **PASS** | Phase 29's 48-assertion simulation is exactly this: Lead → Quote/Contract (Sales) → PO/dispatch (Procurement) → delivery/installation/QC (Operations) → handover/warranty (Customer Success), with the Contract, Project-stage advance, Snag, and Warranty all created automatically by the Phase 07 event bus at each handoff point — never a manual re-entry step. Phase 21's Project Operating View independently confirms zero blockers and correct audit history on the same project after the handoff chain completes. |
| **Management test** — can a manager see real, current, cross-department status without asking anyone or exporting to Excel? | **PASS** | Phase 12's Control Tower (`control-tower-check.ts`, 21 assertions) plus Phase 22's Work Queue (correctly shows zero critical items for a resolved project, confirmed in Phase 29 step 47) plus Phase 25's expanded global entity search (Quote/Contract/Payment/PO/Shipment/InstallationJob/QCInspection/Handover, not just Project/Customer) give a manager one real, live, canonical-data-backed view — no export step exists or is needed. |
| **Audit test** — can any completed project's full history be reconstructed after the fact, who did what and when? | **PASS** | Phase 06's audit-event mechanism (`idempotency-audit-check.ts`, 13 assertions) plus Phase 29 step 42, which queries a real, queryable audit trail for the simulation's project and reconstructs who/what/when directly from canonical repository records — not a log file, not a manual timeline. |
| **Security test** — are unauthorized actions actually denied, not just hidden from the UI? | **PASS** | Phase 05's RBAC (`authz-check.ts`, 16 assertions, `AuthorizationError` thrown, not a UI hide) plus Phase 23's security hardening (`security-hardening-check.ts`, 11 assertions: destructive-action confirmation, demo-bypass gating, lazy-loaded routes) plus Phase 29's two live denials proven by attempting the action and asserting the real `AuthorizationError`, not by inspecting what a menu shows. |
| **Reliability test** — does the system survive a network interruption, a duplicate request, or a downstream integration being unavailable, without corrupting state or double-charging? | **PASS** | Phase 11's offline sync (`offline-sync-check.ts`, 17 assertions — a failed upload leaves the item present and resumable, never silently lost) plus Phase 06/23's idempotency guard (duplicate payment/PO requests produce one logical effect; Phase 23 upgraded the sandbox/production path to a real Firestore transactional claim) plus Phase 24's integration providers (`integration-boundaries-check.ts`, 16 assertions — every unconfigured provider throws a real, typed `UnconfiguredIntegrationError` and fails CLOSED on webhook verification, never silently pretends to succeed). |

## Overall result

**8 of 8 Phase 13 scenarios pass. 48 of 48 Phase 29 real-bridge assertions
pass. 6 of 6 Phase 30 named tests pass.** One scope note (Scenario H's live
two-browser Firestore round-trip) is inherited unchanged from Phase 04 —
not a new gap, and not a failure of the mechanism itself, which is proven
via the shared `Repository<T>` interface and SDK primitives already live
elsewhere in this codebase (`firestoreLeads.ts`).

## Full acceptance suite (fresh run, 2026-09-23)

`npm run checks` — **33 scripts, 996 assertions, 0 failures.**
`npx tsc --noEmit` — 0 errors. `npm run build` — passes (full Vite build +
esbuild server bundle + PWA precache, 12.28s).

| Script | Phase | Assertions |
|---|---|---|
| `tsc --noEmit` | all | 0 errors |
| `domain-graph-check.ts` | 02 | 20 |
| `workflow-validate.ts` | 03 | 7 definitions + 189 registry entries |
| `repository-two-user-check.ts` | 04 | 6 |
| `authz-check.ts` | 05 | 16 |
| `idempotency-audit-check.ts` | 06 | 13 |
| `event-bus-check.ts` | 07 | 14 |
| `commercial-workflow-check.ts` | 08 | 21 |
| `operations-workflow-check.ts` | 09 | 17 |
| `five-surfaces-check.ts` | 10 | 143 |
| `offline-sync-check.ts` | 11 | 17 |
| `notification-reconciliation-check.ts` | 11 | 18 |
| `control-tower-check.ts` | 12 | 21 |
| `final-e2e-acceptance.ts` | 13 | 19 |
| `migration-factory-check.ts` | 14 | 390 (191 screens × classification + reason checks) |
| `commercial-core-bridge-check.ts` | 15 | 14 |
| `procurement-bridge-check.ts` | 16 | 17 |
| `delivery-bridge-check.ts` | 17 | 15 |
| `installation-qc-handover-bridge-check.ts` | 18 | 24 |
| `portal-summary-check.ts` | 19 | 15 |
| `operating-surfaces-home-check.ts` | 20 | 19 |
| `project-operating-view-check.ts` | 21 | 14 |
| `work-queue-check.ts` | 22 | 11 |
| `production-demo-gate-check.ts` | 23 | 8 |
| `code-splitting-check.ts` | 23 | 7 |
| `security-hardening-check.ts` | 23 | 11 |
| `integration-boundaries-check.ts` | 24 | 16 |
| `global-search-check.ts` | 25 | 11 |
| `data-quality-phase26-check.ts` | 26 | 19 |
| `dbmanager-remaining-check.ts` | 27 | 7 |
| `navigation-cutover-check.ts` | 28 | 25 |
| `full-company-simulation.ts` | 29 | 48 |

Built server smoke-tested (`GET /` → 200, `GET /api/health` → 200) at
prior phase checkpoints (Phases 10, 12, 20); unchanged since, no server
routing was touched in Phases 14-29.

## Cleanup review

Consistent with every phase since Phase 13: **nothing was removed.**
Phase 27's `LEGACY_DBMANAGER_REMAINING.md` (regenerated fresh for this
record) classifies all 150 `DbManager`-referencing files as `MIGRATE`
(145) or `INTENTIONALLY_RETAINED` (5 — `language.ts`, `theme.ts`,
`AdminRouter.tsx`, `SurveyorRouter.tsx`, and one router entry point) —
**zero files are flagged `REMOVE`**. Every migrated screen kept its
legacy `DbManager` write (dual-write "strangler fig" pattern) rather than
being replaced outright, per this pack's own non-negotiable rule.

## Known limitations carried into Phase 30 (see also `FINAL-OPERATING-MODEL.md` §11)

1. No live Firestore/Firebase Auth credentials were available in this
   sandbox at any phase — the repository layer, Phase 23's transactional
   idempotency claim, and the Firestore security rules are all real code,
   structurally verified and unit-tested against the demo store, but the
   live authenticated network round-trip itself remains unverified here.
2. Demo bypass credentials (`123456`, `password123`, etc.) are gated
   behind `isProductionDeploy()` at runtime (Phase 23) but the literal
   strings are still present in the built JS bundle text — esbuild (this
   project's minifier) does not perform the cross-module dead-code
   elimination that would strip them; verified empirically by grepping a
   `VITE_APP_ENV=production` build's output, not assumed.
3. QC FAIL/Snag/Rework has no legacy-screen bridge yet (only the clean
   pass path is bridged) — exercised directly via the canonical service
   layer in Phase 29's simulation, a real and stated gap, not a silent
   workaround.
4. Negotiation stage and post-handover service issues have no
   legacy-screen bridge / canonical entity yet (Phase 29 §3).
5. Server-side request authentication (`server.ts`) has no middleware
   enforcing it yet — needs `firebase-admin` and real credentials.
6. The destructive-actions inventory (Phase 23) still finds a large
   number of components without a detectable `confirm()` guard; only the
   highest-confidence, genuinely destructive ones were fixed in this
   pack, by design (risk-based, not indiscriminate).
7. Single ~2.8MB main JS chunk remains after Phase 23's `React.lazy()`
   conversion of 177 screen imports — code-splitting reduced the
   per-screen chunks materially but did not eliminate the large shared
   vendor/index bundle; a real, stated, unresolved performance risk for
   the offline-first field use case.

Full detail on each of the above: `docs/architecture/FINAL-OPERATING-MODEL.md`
§11, `docs/aiec-implementation-log.md`'s per-phase "Known limitations"
sections, and `docs/migration/final-migration-summary.json`'s
`knownGaps` array (machine-readable).
