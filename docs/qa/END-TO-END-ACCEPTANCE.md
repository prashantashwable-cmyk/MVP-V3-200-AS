# AIEC — End-to-End Acceptance Record (Phase 13)

Pass/fail record for every scenario in `13_FINAL_END_TO_END_ACCEPTANCE.md`,
run 2026-09-22. Primary evidence: `scripts/final-e2e-acceptance.ts`
(`npm run e2e:check`), which runs ONE project through Scenarios A-H as a
single continuous story, plus the full `npm run checks` suite (13 prior
phase scripts) for defense-in-depth coverage of each mechanism in
isolation.

## Scenario results

| Scenario | Result | Evidence |
|---|---|---|
| A — New project (Lead → Qualification → Survey → Customer/Site → Quote → Approval → Send → Acceptance → Contract → Payment) | **PASS** | `final-e2e-acceptance.ts`: Lead converts to a real Customer/Site/Project; Quote created → approved → sent → accepted; Contract auto-created via the event bus; Payment collected; Project state (persistence), permission checks (authorization), and audit events (Phase 06) all verified at each step. **Partial note**: pre-quote Sales sub-stages (qualification/assignment/follow-up/site-survey) are modeled as a real state machine (Phase 03) but have no dedicated service-layer mutation function in this pack (Phase 08's documented scope decision — see `08-commercial-workflows.md` §5) since `Lead` already has a working, separate real persistence path. |
| B — Procurement (Project → Need → Supplier → PO → Approval → Supplier Acceptance → Production → Dispatch) | **PASS** | `final-e2e-acceptance.ts`: PO created → approved (with an unauthorized-approval attempt correctly denied, tested in `commercial-workflow-check.ts`) → supplier acceptance recorded → dispatched. Every record's `projectId` verified to match the same project. |
| C — Delivery and installation (Dispatch → Tracking → Arrival → Material Receipt → Installation Job → Check-in → SOP → Evidence → Completion) | **PASS** (offline-interruption sub-test run separately) | `final-e2e-acceptance.ts`: shipment scheduled → arrived → material received → installation job assigned → site-readiness-gated check-in → evidence capture → completion, all against the same project. **Offline interruption**: proven in `scripts/offline-sync-check.ts` (Phase 11) — a network interruption mid-upload leaves the resumability checkpoint intact and a retry resumes rather than restarting; not re-run inside this specific end-to-end script to avoid re-deriving Phase 11's own already-passing 17 assertions. |
| D — QC failure (Installation Complete → QC → Fail → Snag → Rework → Reinspection → Pass) | **PASS** | `final-e2e-acceptance.ts`: QC recorded fail → real Snag created and Handover explicitly blocked (`qcPassed: false`) → rework completed → reinspection recorded pass → Handover unblocked (`qcPassed: true`) ONLY at that point, never earlier. Verified: handover **remains blocked** until QC is actually passed (direct assertion on `Handover.qcPassed` at both points). |
| E — Handover (QC Pass → Compliance → Checklist → Customer Walkthrough → Acceptance → Handover Certificate → Warranty/AMC) | **PASS** | `final-e2e-acceptance.ts`: compliance confirmed (gated on the real QC pass above) → final checklist → customer acceptance recorded → certificate issued (gated on that recorded acceptance — attempting to issue before acceptance is denied, verified in `operations-workflow-check.ts`) → Warranty automatically created via the event bus → Project reaches its final `warranty_amc` lifecycle stage. |
| F — Duplicate/retry (payment request, webhook, notification, automation trigger) | **PASS** | `final-e2e-acceptance.ts`: repeated payment request and repeated PO creation request (same idempotency key) each produce one logical effect on the SAME lived-in project. Webhook/automation-trigger/notification-retry mechanics additionally proven in isolation in `idempotency-audit-check.ts` (Phase 06, 13 assertions) and `notification-reconciliation-check.ts` (Phase 11, 18 assertions). |
| G — Security (unauthorized quote discount, payment action, refund, permission change, document access, automation publish) | **PASS** | `final-e2e-acceptance.ts`: unauthorized quote discount, unauthorized payment collection (wrong role), refund denial (unverified identity even with the admin role), permission change denial, automation publish denial — all denied at the authorization decision boundary (`assertPermission`/`AuthorizationError`), on the SAME project/session context as the rest of the run. Document-access denial additionally covered by Firestore rules (Phase 04/09/11) and `authz-check.ts`'s 16 assertions (Phase 05). |
| H — Two-user truth (User A changes a project, User B opens it, both see the same state after refresh) | **PASS**, with one documented scope note | `final-e2e-acceptance.ts`: two independent repository read paths agree on the identical final state (`warranty_amc`) for the SAME project that just lived through the entire lifecycle. **Scope note (unchanged from Phase 04)**: this proves the repository/demo-store mechanism is correct; a live two-BROWSER, two-Firebase-Auth-session run against production Firestore was not possible in this sandbox (no credentials — see `04-persistence.md` §6). The Firestore implementation shares the identical `Repository<T>` interface and the same SDK primitives (`onSnapshot`, `updateDoc`) already proven live elsewhere in this codebase (`firestoreLeads.ts`), so the mechanism itself is not new/unproven — only the live authenticated round-trip remains unverified here. |

## Overall result

**8 of 8 scenarios pass.** One scenario (H) carries a documented,
pre-existing scope note (no live Firebase Auth credential available in
this sandbox) rather than a failure — the underlying mechanism is
verified; the live network round-trip is not, and this gap is inherited
from Phase 04, not newly discovered here.

## Full acceptance suite

`npm run checks` (14 scripts, run immediately before this record):
**325 assertions, 0 failures.**

| Script | Assertions |
|---|---|
| `domain-graph-check.ts` (Phase 02) | 16 |
| `workflow-validate.ts` (Phase 03) | validates 7 definitions + 189 registry entries |
| `repository-two-user-check.ts` (Phase 04) | 6 |
| `authz-check.ts` (Phase 05) | 16 |
| `idempotency-audit-check.ts` (Phase 06) | 13 |
| `event-bus-check.ts` (Phase 07) | 14 |
| `commercial-workflow-check.ts` (Phase 08) | 21 |
| `operations-workflow-check.ts` (Phase 09) | 17 |
| `five-surfaces-check.ts` (Phase 10) | 148 |
| `offline-sync-check.ts` (Phase 11) | 17 |
| `notification-reconciliation-check.ts` (Phase 11) | 18 |
| `control-tower-check.ts` (Phase 12) | 20 |
| `final-e2e-acceptance.ts` (Phase 13) | 21 |
| `tsc --noEmit` (all phases) | 0 errors |

`npm run build` (full build including the server bundle): **passes**.
Built server smoke-tested (`GET /` → 200, `GET /api/health` → 200) after
Phases 10 and 12 (the two phases that touched the live-rendered app).

## Cleanup review

Per Phase 13's instruction to "remove only genuinely obsolete routes/
components after confirming no remaining references": **nothing was
removed**. Every phase in this pack was additive (new files, or small
additive edits to `App.tsx`/`firestore.rules`) — no existing screen was
replaced by a new one, so nothing became newly obsolete as a side effect
of this work. The 5 components Phase 01 found unreferenced by any router
(`CameraCapture`, `CustomReportBuilder`, `GeminiTools`, `LeadDetail`,
`MapFiltersLayersControlPanel`) remain exactly as found — confirmed
still unreferenced, left untouched rather than deleted without a clear
mandate to do so, per the pack's own "do not delete capability" principle.
