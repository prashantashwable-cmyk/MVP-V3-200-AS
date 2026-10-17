# MVP REFACTOR PLAN (Step 02, Phase B)

> **Status:** written 2026-10-17. The Owner said "Don't stop until the build is finished", so this plan is treated as approved and is binding for Steps 03–13. Any change goes in PROGRESS → Decision changes.
> **Inputs:** the approved `MVP_SIMPLIFICATION_AUDIT.md`, `DECISIONS.md`, `ACCEPTANCE_SCENARIOS.md`, and MVP_SPEC §41–§43.

## 1. Target architecture
```
 App.tsx (unchanged shell + login)
   └─ MVP_MODE on (default) → getTabsByRole() returns only the MVP tabs for the role (src/mvp/navigation.ts)
        ├─ MvpDashboard        admin, owner           TODAY / NEEDS ATTENTION / PIPELINE        (new, thin)
        ├─ MvpOrders           all roles              order list → Order View (ProjectOperatingView, extended)
        │     └─ Order View    header (spec §8) · stage rail · current task + ACTION PANEL · tasks
        │                      · blockers · payments · evidence · documents · audit (admin/owner)
        ├─ MvpLeads            sales, admin           new lead form · my leads · follow-ups · won/lost
        ├─ MvpMyWork           surveyor, technician, qc, customer, sales   TODAY's tasks → Order View
        ├─ MvpReports          admin, owner           sales / operations / money / quality tables
        └─ MvpSettings         admin                  invites (roles), on-call technician, default assignees, suppliers
 src/mvp/  (all new; pure logic + one service layer)
   config.ts    due-date defaults, MIN_MARKUP_PCT, GST_RATE_PCT (unset ⚖), warranty, AMC, emergency, MVP_MODE
   types.ts     MVP entity types (Task, Blocker, Lead, Survey, Quote, QuoteCost, Milestone, Checklist, QC, Handover, AMC,
                ComplianceDoc, ServiceCase, Settings, Invite, Evidence)
   stage.ts     10 MVP stages, toMvpStage(), fromMvpStage(), forward-only check
   progress.ts  D-10      health.ts  D-11      money.ts  milestone maths, ₹ en-IN formatting
   rules.ts     D-08: event → task specs (pure, idempotent against the open tasks it's given)
   repo.ts      typed repositories for the MVP collections (built on src/repository, demo + Firestore)
   orderService.ts   the ONLY place stage/status/tasks change: every command = authz → rules → writes → audit
   views.ts     read models: order summary (spec §8), dashboard buckets, reports
   evidence.ts  photo/file upload (Firebase Storage in sandbox/production; data URL in demo)
   navigation.ts  MVP_MODE allow-list per role
 src/components/mvp/  thin screens + one action panel per task type
```
- **Why one task-driven Order View, not rewiring the legacy screens:** every step of the MVP is "complete the current task". A small action panel per task type, about 40–120 lines each, replaces 16 ★ screens (311–1,211 lines) and about 20 ○ screens (406–1,653 lines). Those screens read legacy IDs and shapes, so rewiring them costs more than these panels. Their shared UI pieces are reused (`Common.tsx` Card and Button, `CameraCapture`, Tailwind tokens). Lines not rewritten: roughly 15,000. This deviation from REUSE_MAP's "switch reads" rows is recorded in §10.
- **Who uses the canonical services:**
  - `projectOperatingView.ts` keeps its fields and gains `mvp` (summary, tasks, blockers, payments).
  - `workQueue.ts` and `controlTower.ts` stay for the legacy navigation.
  - The MVP dashboard uses `src/mvp/views.ts`.

## 2. Data changes (all additive)
Every order-scoped MVP document carries `orderId`, `customerId` and `participantIds: string[]` (the uids allowed to read it), plus `createdAt`, `updatedAt` and `version`. A missing field means the default shown.

| Collection | Fields | Default for old docs | Written by | Rule (read / write) |
|---|---|---|---|---|
| `projects` (Order) | **+** `displayCode` `AE-####`, `status` ACTIVE\|ON_HOLD\|CANCELLED\|COMPLETED, `holdReason`, `holdReviewDate`, `cancelReason`, `completedAt`, `participantIds`, `customerUserId`, `salesUserId`, `lift` {floors, stops, capacity, type}, `sourceLeadId` (exists) | `status` missing = ACTIVE; no code until backfill | orderService | read: admin, owner, participant, its customer · update: admin any field; participants only `stage`, `status` (not CANCELLED/COMPLETED), `participantIds`, `holdReason`, `holdReviewDate`, `updatedAt`, `updatedBy`, `version` |
| `ProjectStage` | **+** `survey`, `site_ready` | old values stay valid | — | — |
| `tasks` (new) | D-06 fields + `title`, `stage`, `assigneeId`, `assigneeRole`, `previousStatus`, `evidence[]`, `participantIds` | — | orderService | read: admin, owner, participant, its customer · create: admin or a participant of the order · update: admin; assignee or customer limited to status, notes, evidence and timestamps |
| `blockers` (new) | D-07 fields + `participantIds` | — | orderService | same as tasks |
| `canonical_leads` (new) | `CanonicalLead` + spec §13 fields, `mvpStatus` NEW…LOST, `nextFollowup`, `consent`, `sitePhotos[]`, `salesOwnerId`, `orderId` | — | sales, admin | read: admin, owner, own sales · write: admin, sales (own) |
| `surveys` (new) | spec §15 fields, `result`, `photos[]`, `surveyorId` | — | surveyor | order-scoped |
| `order_quotes` (new) | lines (base, installation, freight, other), `taxRatePct`, `taxAmount`, `totalExclTax`, `sellingPrice`, `status`, `approval`, `decision` | — | admin; customer sets `decision` | order-scoped; customer may update only `decision` fields |
| `quote_costs` (new) | `quoteId`, `estimatedCost`, `markupPct`, `grossMarginPct` | — | admin | **admin, owner only** (I-5) |
| `payment_milestones` (new) | kind SURVEY_FEE\|BOOKING_TOKEN\|DELIVERY\|FINAL, `amount`, `amountPaid`, `dueDate`, `status` PENDING\|PARTIAL\|PAID\|FAILED\|REFUNDED\|WAIVED, `method`, `reference`, `proofNote`, `submittedAt`, `verifiedBy` | — | admin; customer submits proof | order-scoped; non-admin only `reference`, `proofNote`, `method`, `submittedAt`, `submittedBy` |
| `purchase_orders` (exists) | **+** `orderId`, `supplierName`, `expectedDeliveryDate`, `materialStatus`, `delayNote` | — | admin | unchanged (admin) |
| `suppliers` (new) | `Supplier` + `contact`, `phone` | — | admin | admin, owner |
| `install_checklists` (new) | 11 items (spec §18), each with `done`, `photo`, `note`, `completedBy`, `completedAt` | — | technician | order-scoped |
| `qc_records` (new) | `decision` PASS\|REWORK\|FAIL, `testResults`, `remarks`, `inspectorId` | — | qc | order-scoped |
| `snags` (exists) | reused for REWORK (+ `orderId`) | — | qc | existing rule |
| `order_handovers` (new) | `customerApprovedAt/By`, `completedAt/By`, `finalTest`, `photos[]`, `overrides[]` | — | customer, admin | order-scoped |
| `warranties` (exists) | reused: created at handover (D-26) | — | admin | existing rule |
| `amcs` (new) | `warrantyStart`, `warrantyEnd`, `mvpAmcStatus`, `amcReminderDate`, `lastService`, `nextService`, `complaints[]` | — | admin | order-scoped |
| `compliance_docs` (new) | D-27: type, status, `file`, `note` | — | admin | order-scoped (customer may read) |
| `service_cases` (new) | `priority` P0, `kind` EMERGENCY, `description`, `status`, `assigneeId`, `acknowledgedAt`, `resolvedAt`, `resolutionNote`, `photo` | — | customer creates; technician, admin update | order-scoped |
| `approval_requests` (new) | `ApprovalRequest` (min-margin) | — | admin | admin, owner |
| `mvp_settings/global` (new) | `onCall` {date, technicianId}, `defaultAssignees`, `emergencyPhone` | — | admin | read: signed in · write: admin |
| `counters/orders` (new) | `next` | — | orderService (transaction) | read/write signed in; may only increment |
| `user_invites/{email}` (new) | `role`, `name`, `customerId?` | — | admin | read: admin or that email · write: admin |
| `users` (exists) | **+** roles `owner`, `sales`, `qc`; **+** `customerId` | — | invite flow | **narrowed:** self-create only as `pending_selection` or as the invited role |
| `notifications` (exists) | **+** `title`, `body`, `audienceCustomerId`, `read` | — | orderService | **+** owner read; customer reads its own `audienceCustomerId` |
| `audit_logs` (exists) | unchanged shape; MVP actions use `entityType` Order/Task/… | — | orderService | **+** owner read |

- **Deprecated (kept, not deleted):** the MVP path no longer drives `Project.stage` values `customer_site_confirmed` … `service`; they stay valid for old data and map through `toMvpStage`. `CanonicalLead`'s old 8-value `stage` is still written, kept in step with `mvpStatus` (D-04 mapping). The legacy `leads` collection stays for the hidden screens.
- **Backfill** (`scripts/mvp-backfill.ts`): for every project missing `status`/`displayCode`, set ACTIVE and assign a code from the counter. It creates a REVIEW task "Set next task" (admin) where no open task exists. Dry-run by default, idempotent, `--apply` required, and it refuses to run unless the environment is demo or emulator (D-19).
- **Leads collection change from the audit:** a new `canonical_leads` collection, not the legacy `leads` collection. Mixing two shapes in one collection is a data-integrity risk, the same reasoning the old pack used for `contracts_v2`. Recorded in §10.

## 3. Roles and permissions
The service checks a permission with `assertPermission` before every command. Firestore and Storage rules enforce the same rows.

| Action | admin | owner | sales | surveyor | technician | qc | customer | supplier |
|---|---|---|---|---|---|---|---|---|
| Read any order | ✓ | ✓ | own leads' orders | assigned | assigned | assigned | own | — (no login, D-12) |
| Create / qualify lead | ✓ | — | ✓ (own) | — | — | — | — | — |
| Assign tasks, change due date, hold, resume, cancel, override | ✓ | — | — | — | — | — | — | — |
| Complete own task | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Raise blocker | ✓ | — | — | — | ✓ | — | ✓ | — |
| Quote create, approve, send; see cost | ✓ | read | — | — | — | — | price only | — |
| Accept / reject quote | ✓ (on behalf) | — | — | — | — | — | ✓ | — |
| Verify payment PAID | ✓ | — | — | — | — | — | submit proof | — |
| QC decision | ✓ | — | — | — | — | ✓ | — | — |
| Approve handover | ✓ (on behalf) | — | — | — | — | — | ✓ | — |
| Complete handover | ✓ | — | — | — | — | — | — | — |
| Raise EMERGENCY | ✓ | — | — | — | — | — | ✓ | — |
| Invite users, set roles | ✓ | — | — | — | — | — | — | — |
| Reports | ✓ | ✓ | — | — | — | — | — | — |

- **New permissions:** `order.manage`, `task.complete`, `blocker.raise`, `lead.create`, `quote.decide`, `handover.approve`, `emergency.raise`, `report.read`.
- **Role changes:**
  - `qc.approve` moves from `technician` to `qc` (audit §6 #5). It is **kept on technician as well** until the `qc` role is in use, so no current permission is removed.
  - `owner` gets read-only permissions.
- **Rules tests:** the S8 checks plus the new collections run against the emulator in `scripts/mvp-rules-emulator-check.ts`, using only the existing `firebase` package.

## 4. Rules automation (D-08)
`rules.ts` exports `nextTasks(event, ctx): TaskSpec[]` and `applyEvent(...)`. There is one function per event, all pure:
- **Events:** `LEAD_CREATED`, `LEAD_QUALIFIED`, `SURVEYOR_ASSIGNED`, `SURVEY_SUBMITTED{result}`, `SITE_CORRECTION_DONE`, `QUOTE_PREPARED{belowMin}`, `MARGIN_APPROVED`, `QUOTE_SENT`, `QUOTE_ACCEPTED`, `QUOTE_REJECTED`, `PAYMENT_PAID{kind}`, `PO_RAISED`, `READINESS_SUBMITTED`, `SITE_CONFIRMED`, `MATERIAL_RECEIVED`, `INSTALLATION_COMPLETED`, `QC_DECIDED{PASS|REWORK|FAIL}`, `REWORK_DONE`, `LICENCE_DONE`, `HANDOVER_COMPLETED`, `ORDER_HELD`, `ORDER_CANCELLED`, `EMERGENCY_RAISED`.
- **Each `TaskSpec`** has `{type, assignee: 'admin'|'customer'|'sales'|'surveyor'|'technician'|'qc'|uid, dueInDays|dueAt, stageAfter?}`.
- **Idempotency:** before creating a task, the service skips any spec whose `type` already has an open task on the order (I-2). Each command also runs inside `runIdempotent` with key `${orderId}:${event}:${clientKey}`, so a double tap does nothing.
- **Where each event comes from:** every event comes from one `orderService` command, which is called by one action panel (§5). No event bus is used.

## 5. Screen plan
Every MVP screen reads and writes canonical Firestore through `orderService`/`views`, or the in-memory repository in demo mode.

| Screen / panel | Role | Mode | Files | Reuses |
|---|---|---|---|---|
| MvpDashboard | admin, owner | new | `components/mvp/MvpDashboard.tsx` | `Card`, health colours |
| Order list + Order View | all | **extend** `ProjectOperatingView` | `ProjectOperatingView.tsx`, `services/projectOperatingView.ts`, `components/mvp/OrderPanels.tsx` | existing view and service |
| Lead form / list / follow-ups / won-lost | sales, admin | new (thin) | `components/mvp/MvpLeads.tsx` | `CameraCapture` UI pattern, `LeadInbox` field styles |
| My work (TODAY) | field roles, customer | new | `components/mvp/MvpMyWork.tsx` | `TechnicianHomeMyJobsScreen` layout |
| Task panels | per task type | new | `components/mvp/panels/*.tsx` | `Common.tsx` |
| Survey (§15) | surveyor | panel | `panels/SurveyPanel.tsx` | `SiteVisitVerification` fields |
| Quote (§16) + approve + customer decision | admin, customer | panel | `panels/QuotePanel.tsx` | `QuotePricing` line layout |
| Payments (D-14) | admin, customer | panel | `panels/PaymentPanel.tsx` | — |
| Site readiness, PO, delivery | customer, admin | panel | `panels/SitePanel.tsx` | `SiteDeliveryChecklistScreen` copy |
| Installation (§18) START/BLOCKED/COMPLETE | technician | panel | `panels/InstallPanel.tsx` | `InstallationSopChecklistScreen` copy |
| Blocker (8 reasons) | technician, customer, admin | panel | `panels/BlockerPanel.tsx` | `IssueBlockerReportingScreen` copy |
| QC (§19) | qc | panel | `panels/QcPanel.tsx` | `QualityChecklist*` copy |
| Handover (§20, D-29) | customer, admin | panel | `panels/HandoverPanel.tsx` | `FinalHandoverChecklistScreen` copy |
| Compliance docs (D-27) | admin | panel | `panels/CompliancePanel.tsx` | — |
| AMC (§21, D-26) | admin | panel | `panels/AmcPanel.tsx` | — |
| Emergency (D-28) | customer, technician, admin | panel | `panels/EmergencyPanel.tsx` | `EmergencyEscalationAlert` red style |
| Survey fee (D-30) | admin | rules + payment panel | — | — |
| Reports | admin, owner | new | `components/mvp/MvpReports.tsx` | — |
| Settings (invites, on-call, suppliers) | admin | new | `components/mvp/MvpSettings.tsx` | — |

## 6. Hide plan (`MVP_MODE`, D-22)
- `MVP_MODE` defaults to `true` (`src/mvp/config.ts`). It can be overridden at build time with `VITE_MVP_MODE=false`, or per browser with `localStorage.aiec_mvp_mode = 'off'` for admins.
- `getTabsByRole()` in `App.tsx` wraps the existing lists: when the mode is on, it returns `mvpTabsForRole(role)`. When it is off, it returns the **unchanged** legacy list.
- The command palette is filtered by the same allow-list. `renderTabContent` keeps every legacy route mounted, so with the mode off nothing changes. No screen is deleted (`CustomReportBuilder` stays until Step 13 confirms it is dead).
- New roles (owner, sales, qc) on legacy navigation fall back to `OperatingSurfaces`.

## 7. Check plan (D-23)
- **`npm run mvp:checks`** runs, in order:
  - `mvp-pure-check.ts`: stage, progress, health, money; every D-10/D-11 case including 71%
  - `mvp-rules-check.ts`: every D-08 row, plus double-event idempotency
  - `mvp-scenarios-check.ts`: S1–S7, S9, S10 against the demo repository, asserting invariants I-1 to I-6 after every step
  - `mvp-navigation-check.ts`: allow-list per role; mode off equals the baseline
- **`npm run mvp:rules`** runs `mvp-rules-emulator-check.ts` (S8 + new collections + storage) inside `emulators:exec`.
- **`npm run checks:legacy`** gets the scripts listed in audit §10. `npm run checks` keeps the rest. `live-*` scripts stay out of both.
- **Playwright:** not added as a dependency. Step 12 uses the preinstalled Chromium through a small script that imports the already-installed `playwright-core` if one is present; otherwise screenshots are described manually.

## 8. Step breakdown
| Step | Files (est.) | Lines (est.) | Depends | Acceptance | Rollback |
|---|---|---|---|---|---|
| 03 Data foundation | `src/mvp/{config,types,stage,progress,health,money,rules,repo,orderService,views,evidence}.ts`, `domain/entities.ts`, `domain/permissions.ts`, `domain/adapters.ts`, `types.ts` (roles), `repository/*` (array-contains query, transactional update, counter), `firestore.rules`, 3 check scripts, `package.json` | ~1,500 | 02 | pure + rules checks; S1 steps 1–4 with I-1..I-4 | revert commits; collections are new, nothing to migrate |
| 04 Order View, dashboard, MVP_MODE | `ProjectOperatingView.tsx`, `projectOperatingView.ts`, `mvp/navigation.ts`, `App.tsx`, `components/mvp/{MvpDashboard,OrderPanels}.tsx`, nav check | ~900 | 03 | S1 view at 13a shows 71%; S2/S3/S5 buckets; NO NEXT ACTION; nav check | set `MVP_MODE` off |
| 05 Leads, sales, survey | `MvpLeads.tsx`, `SurveyPanel.tsx`, `MvpMyWork.tsx` | ~600 | 04 | S1 1–4 through the UI service calls | mode off |
| 06 Quote, booking, payments | `QuotePanel.tsx`, `PaymentPanel.tsx` | ~500 | 05 | S1 5–7, low-margin approval, I-5 | mode off |
| 07 Site-ready, supplier, delivery | `SitePanel.tsx`, `MvpSettings.tsx` (suppliers) | ~450 | 06 | S1 8–12 | mode off |
| 08 Technician, installation, blockers | `InstallPanel.tsx`, `BlockerPanel.tsx`, `evidence.ts`, `storage.rules` | ~600 | 07 | S1 13a/13b, S3, S5 START gate | mode off |
| 09 QC, handover, AMC, emergency | `QcPanel.tsx`, `HandoverPanel.tsx`, `CompliancePanel.tsx`, `AmcPanel.tsx`, `EmergencyPanel.tsx` | ~800 | 08 | S1 14–16, S4, S9, S10 | mode off |
| 10 Customer, owner, notifications, reports, languages | `MvpReports.tsx`, `language.ts` (+MVP keys), notification wiring | ~500 | 09 | customer sees I-5; reports | mode off |
| 11 Security and compliance | `firestore.rules`, `storage.rules`, `firestoreUsers.ts` (invites), `App.tsx` (hide OTP/password/demo in production), `serverApp.ts` (Gemini off switch) | ~400 | 03–10 | S8 on the emulator; bundle-bypass check | revert rules commit |
| 12 Test and verify | scenario and emulator scripts, `checks:legacy` split | ~400 | all | all scenarios | — |
| 13 Report | `MVP_IMPLEMENTATION_REPORT.md` | docs | 12 | §39 items | — |

Every step stays under about 25 files and about 1,500 lines. Step 03 is the largest; if it goes over, the rules and emulator part moves to Step 11.

## 9. Stays manual in Phase 1
- **Payment verification:** the customer submits a UTR; the Admin marks the milestone PAID. No gateway.
- **Supplier updates:** the Admin records the PO, expected date and delay. Suppliers have no login.
- **Messaging:** WhatsApp, SMS and email are not sent; notifications are in-app only.
- **Statutory licence:** the Admin uploads the file and marks it done.
- **On-call technician:** the Admin sets it per day.
- **Tax rate:** the Admin sets it in config only after a CA confirms it ⚖ VERIFY.
- **Overdue detection:** runs when the dashboard loads (no scheduler).
- **Roles:** the Admin invites people by email.

## 10. Frozen decisions
D-01 to D-31 are **FROZEN**, with these changes. Each is logged in PROGRESS → Decision changes.

| Decision | Change | Reason |
|---|---|---|
| D-04 | Leads live in the new `canonical_leads` collection (not the legacy `leads` collection, and not a `CanonicalLead` repository over `leads`) | Avoids two shapes in one collection; the legacy screens stay untouched |
| D-13 | Google sign-in only in production; roles by Admin invite (`user_invites`); OTP, password and Try-as-Role are hidden in production builds | Audit F-1, F-2, F-3 |
| D-12 | `qc.approve` is added to `qc`; it stays on `technician` for now (no permission removed) | Additive-only rule |
| D-14 | Milestones live in a new `payment_milestones` collection instead of `PaymentSchedule` installments | Per-milestone status, proof and verification need their own record |
| D-16 | Storage is built (`firebase/storage`, part of the existing `firebase` package); it is not reused | Audit F-6 |
| D-31 | Task panels inside the Order View replace "switch reads" on the ★ screens | §1 cost reasoning |

## 11. Risks and rollback
- **Switching off:** set `VITE_MVP_MODE=false` and rebuild, or the per-browser admin toggle. The legacy navigation then returns exactly as it was.
- **Reverting a step:** each step is one `mvp(step-NN)` commit series. `git revert` the series. New collections are only added to; nothing is migrated destructively.
- **Rules:**
  - Changes to existing collections either narrow access (users) or add new read paths for new roles (owner) or for the order's own customer (F-5). All are tested on the emulator before Step 11 closes.
  - The rules can't make the client fully trustworthy, because there is no server. A participant can still write fields allowed for their role. Accepted for 10–20 orders and documented. Phase 2: move `orderService` behind Cloud Functions.
- **One Firebase project:** no automated test touches it (D-19).
