# MVP REFACTOR PLAN (Step 02, Phase B)

> **Status:** APPROVED under the Owner's standing instruction (2026-09-24: "Do autonomously"), using the audit's recommended defaults. Once approved this plan is **binding** (CLAUDE.md). Changes go through `U4_CHANGE_REQUEST`.
> **Inputs:** `MVP_SIMPLIFICATION_AUDIT.md` (approved), `DECISIONS.md`, `ACCEPTANCE_SCENARIOS.md`, `MVP_SPEC.md` §41–§43.

---

## 1. Target architecture

```
App.tsx ── login (Google only in MVP_MODE; demo tab only in non-production builds)
   │
   ├─ MVP_MODE on  ──► src/mvp/screens/MvpRouter.tsx   (one router, allow-listed tabs per role)
   │                      │
   │                      ├─ screens (thin, ≤250 lines each; reuse components/Common, CameraCapture)
   │                      └─ ProjectOperatingView.tsx (extended = Universal Order View, role-filtered)
   │                                │
   │                      src/mvp/services/*  ── the ONLY place stage/status/tasks change
   │                         orderService · quoteService · paymentService · supplyService
   │                         installationService · qcHandoverService · emergencyService
   │                         evidenceService · leadService · notify · readModels
   │                                │  uses pure modules
   │                      src/mvp/{config,stage,progress,health,rules,gates,mvpMode}.ts
   │                                │
   │                      src/repository/* (+ transactions.ts)  ──► Firestore (real) | in-memory (demo)
   │                      src/lib/audit.ts · src/lib/idempotency.ts · src/lib/authz.ts
   │
   └─ MVP_MODE off ──► legacy routers exactly as today (Admin/Surveyor/Technician/Customer/Supplier + SharedRoutes)
```

**MVP screens (22, by role).**
| # | Screen | Roles | Backed by |
|---|---|---|---|
| 1 | Admin Dashboard (TODAY / NEEDS ATTENTION / PIPELINE) | admin, owner (read-only) | `readModels.buildDashboard` over projects, tasks, blockers, milestones, leads |
| 2 | Order View (extended `ProjectOperatingView`) | all, filtered by role | `readModels.buildOrderView` |
| 3 | Orders list | admin, owner, sales | projects query |
| 4 | New Lead | sales, admin | `leadService` → `leads` |
| 5 | My Leads / Follow-ups / Won / Lost (one screen, 4 tabs) | sales, admin | `leads` query |
| 6 | Lead detail + Qualify | sales, admin | `leadService`, `orderService.qualifyLead` |
| 7 | Assign surveyor (Order View action) | admin | `orderService` |
| 8 | My Surveys + Survey form | surveyor | `surveys`, `evidenceService` |
| 9 | Quote builder (internal panel) | admin | `quoteService` |
| 10 | Quote view + decision | customer (admin preview) | `quoteService` (no cost) |
| 11 | Payment milestones panel (Order View) | admin, customer | `paymentService` |
| 12 | Site readiness checklist | customer | `supplyService` |
| 13 | Suppliers & POs | admin | `supplyService` |
| 14 | Technician TODAY | technician | tasks query |
| 15 | Task runner (START / CHECK IN / checklist / COMPLETE / BLOCKED) | technician | `installationService` |
| 16 | QC inspection | qc | `qcHandoverService` |
| 17 | Handover (admin capture + customer confirm) | admin, customer | `qcHandoverService` |
| 18 | AMC list + on-call setting | admin | `amcs`, `mvp_settings` |
| 19 | Emergency button / case | customer, technician, admin | `emergencyService` |
| 20 | Documents & Compliance (Order View section) | admin (customer read) | `compliance_items`, `documents` |
| 21 | Owner view + 4 reports | owner, admin | `readModels.buildReports` |
| 22 | Users & invites + notification bell | admin / all | `invites`, `users`, `notifications` |

**New modules.** `src/mvp/config.ts`, `stage.ts`, `progress.ts`, `health.ts`, `rules.ts`, `gates.ts`, `mvpMode.ts`, `format.ts` (₹ en-IN, Asia/Kolkata), `services/*`, `screens/*`, `src/repository/transactions.ts`.

**Where `MVP_MODE` applies.** `App.tsx` chooses `MvpRouter` instead of the legacy routers, filters `getTabsByRole`, filters the command palette's tab list, hides the phone/password login tabs, and replaces the self-role-selection wizard with a "waiting for invite" screen. `serverApp.ts` returns 404 for `/api/gemini/*` and `/api/db/*` when `MVP_MODE` is on.

---

## 2. Data changes (all additive)

Old documents without a new field get the default shown. No field is removed or renamed.

### 2.1 New collections
| Collection | Entity (in `domain/entities.ts`) | Key fields | Written by | Rule (summary) |
|---|---|---|---|---|
| `tasks` | `Task` | `id, orderId, type, title, stage, assigneeId, assigneeRole, status, dueDate, completedAt?, notes?, evidenceIds[], previousStatus?, createdBy, createdAt, updatedAt, version` | orderService | read: admin/owner, assignee, order participant · create/update: admin, or order participant (staff), or customer on own-order tasks assigned to their customer token (limited keys) |
| `blockers` | `Blocker` | D-07 fields + `version` | orderService | read: admin/owner, participants · create: participants · update: admin or blocker owner |
| `payment_milestones` | `PaymentMilestone` | `orderId, kind (SURVEY_FEE/BOOKING_TOKEN/DELIVERY/FINAL), amount, dueDate?, status (PENDING/PARTIAL/PAID/FAILED/REFUNDED), amountReceived, method?, reference?, notes?, proof?{reference, evidenceId?, submittedAt, submittedBy}, verifiedBy?, verifiedAt?, rejectedReason?` | paymentService | read: admin/owner, participants · create/update: admin · customer may update only `proof`, `updatedAt`, `version` |
| `surveys` | `SiteSurvey` | spec §15 fields (mm numbers), `result`, `photoIds[]`, `surveyorId`, `submittedAt` | orderService | read: admin/owner, participants · create: assigned surveyor · update: admin |
| `quote_costs` | `QuoteCost` (id = quoteVersionId) | `estimatedCost, markupPct, grossMarginPct, belowMinimum, approvalRequestId?` | quoteService | **admin/owner only** (I-5) |
| `approval_requests` | existing `ApprovalRequest` (first repository) | as defined | quoteService | admin/owner only |
| `suppliers` | existing `Supplier` + `contactName?, phone?` | | supplyService | admin/owner only |
| `amcs` | existing `AMC` + `mvpAmcStatus, warrantyEnd, reminderDate, lastServiceDate?, nextServiceDate?` | | qcHandoverService | read: admin/owner, participants · write: admin |
| `service_cases` | existing `ServiceCase` + `kind (EMERGENCY/COMPLAINT), priority (P0/P1/P2), description, acknowledgedAt?, resolvedAt?, resolutionNote?, evidenceIds[]` | | emergencyService | read: admin/owner, participants · create: participants · update: admin or assignee |
| `compliance_items` | `ComplianceItem` (id = `${orderId}_${type}`) | `type` (8 D-27 types), `status (NOT_STARTED/IN_PROGRESS/DONE/NOT_APPLICABLE)`, `documentId?`, `note?` | orderService | read: admin/owner, participants · write: admin |
| `invites` | `Invite` (id = lower-case email) | `email, role, name, customerId?, createdBy, createdAt` | Users screen | admin write; read by admin or the signed-in user whose token email equals the id |
| `counters` | `{ id, value }` | `orders` counter for `AE-####` | transactions.ts | read/write: admin, sales (qualify) — update only +1 |
| `mvp_settings` | `{ id:'oncall', date, technicianId }` | | Admin | read: any signed-in · write: admin |

### 2.2 New fields on existing entities
| Entity / collection | Field | Type | Default for old docs | Writer |
|---|---|---|---|---|
| Project `projects` | `displayCode` | `'AE-####'` | missing → backfill (dry-run) or shown as "—" | qualifyLead (counter, transaction), set once |
| | `status` | `ACTIVE/ON_HOLD/CANCELLED/COMPLETED` | missing = ACTIVE | orderService |
| | `statusReason?`, `holdReviewDate?` | string | — | orderService |
| | `participantIds` | `string[]` of uids + `customer:<customerId>` | missing = [ownerUserId] | orderService (recomputed on every task change: open-task assignees + customer token + sales owner) |
| | `checklistDone` | number 0–11 | 0 | installationService |
| | `qcPassedAt?`, `liftSummary?`, `sellingPrice?`, `completedAt?` | | — | services |
| | `version` | number | 0 | all updates |
| `ProjectStage` | + `survey`, `site_ready` | union | existing values stay valid | — |
| `CanonicalUserRole` / legacy `UserRole` | + `owner`, `sales`, `qc` | union | — | invites |
| `users` | `customerId?` | string | — | invite on first sign-in |
| Lead `leads` (legacy shape kept, R-1) | `ownerUserId, source, liftRequirement, notes, nextFollowUp, mvpStatus (NEW/CONTACTED/QUALIFIED/SURVEY/QUOTE/WON/LOST), projectId, consentAt, lostReasonText` | | missing `mvpStatus` → derived from legacy `stage` (D-04 mapping) | leadService/orderService |
| QuoteVersion `quote_versions` | `lines{base,installation,freight,other}, subtotalExclTax, taxRatePct, taxRateConfirmed, taxAmount, sellingPrice` | | — | quoteService (existing `lineItems/totalAmount` also filled) |
| Quote `quotes` | `decisionNote?, decidedAt?` | | — | customer decision |
| PurchaseOrder | `items?, expectedDeliveryDate?, materialStatus (ORDERED/DISPATCHED/DELIVERED/DELAYED), delayReason?` | | — | supplyService |
| DeliveryReceipt | `shipmentId` becomes optional; + `note?, evidenceIds[]` | | — | supplyService |
| InstallationJob | `checklist{key → {done, by, at, note, documentId}}, startedAt?, startOverride?` | | — | installationService |
| QCInspection | `decision (PASS/REWORK/FAIL), tests{...}, remarks, documentIds[]` | | — | qcHandoverService |
| Handover | `customerConfirmedAt/By/Name/Device, completedAt, completedBy, overrides[]` | | — | qcHandoverService |
| DocumentRecord `documents` | `dataUrl, caption?, taskId?, kind` (evidence bytes, see D-16 change) | | — | evidenceService |
| NotificationRecord | `title, body, readAt?, orderId?` (`audienceUserId` may be `role:<role>`) | | — | notify |

**Quote cost hiding (I-5).** Cost lives only in `quote_costs`, readable by admin/owner. `QuoteVersion` holds customer-visible prices only. PO amounts stay in `purchase_orders` (admin-only). The Order View never loads either collection for other roles.

### 2.3 Backfill (Step 03)
`scripts/mvp-backfill-projects.ts`: for each project without `status` → `ACTIVE`; without `displayCode` → next `AE-####`; without `participantIds` → `[ownerUserId]`; without an open task → one `REVIEW_ORDER` task for the Admin (NO NEXT ACTION fix). **Dry-run by default**, prints a plan; `--apply` writes. It refuses to run unless the target is the demo repository or the emulator (`FIRESTORE_EMULATOR_HOST` set). Idempotent: re-running is a no-op. Running it on real data is an Owner go-live action.

### 2.4 Deprecated (kept, not deleted)
`CanonicalLead` (superseded by the `leads` shape, R-1) · `NEXT_ACTION_BY_STAGE` (fallback only) · `PaymentSchedule.installments` for MVP orders (milestones replace them) · `qc_inspector` role tag (alias of `qc`) · `site_photos[].dataUrl` inside lead docs for new MVP leads (new photos go to `documents`).

---

## 3. Roles and permissions

### 3.1 Matrix (✔ = allowed; "own" = participant of the order)
| Action | admin | owner | sales | surveyor | technician | qc | customer | supplier |
|---|---|---|---|---|---|---|---|---|
| Read all orders, dashboard, reports | ✔ | ✔ (read-only) | — | — | — | — | — | — |
| Read an order | ✔ | ✔ | own leads' orders | own (assigned) | own (open task) | own (open task) | own | — |
| Create / edit lead | ✔ | — | ✔ own | — | — | — | — | — |
| Qualify lead → order | ✔ | — | ✔ own | — | — | — | — | — |
| Assign people, reassign tasks, change due dates | ✔ | — | — | — | — | — | — | — |
| Hold / resume / cancel / override a gate | ✔ | — | — | — | — | — | — | — |
| Submit survey | ✔ | — | — | ✔ assigned | — | — | — | — |
| Build quote, see cost/margin, approve margin | ✔ | read | — | — | — | — | — | — |
| Accept / request changes on quote | ✔ (on behalf) | — | — | — | — | — | ✔ own | — |
| Submit payment proof | ✔ | — | — | — | — | — | ✔ own | — |
| Verify / edit payments | ✔ | — | — | — | — | — | — | — |
| Site readiness submit | ✔ | — | — | — | — | — | ✔ own | — |
| Suppliers, POs, material received | ✔ | read | — | — | — | — | — | — (D-12 default: no login) |
| Start / check-in / checklist / complete installation or rework | ✔ | — | — | — | ✔ assigned | — | — | — |
| Raise blocker | ✔ | — | — | ✔ own | ✔ own | ✔ own | ✔ own | — |
| Resolve blocker | ✔ | — | — | — | blocker owner | blocker owner | blocker owner | — |
| QC decision | ✔ | — | — | — | — | ✔ assigned | — | — |
| Confirm handover | ✔ (on behalf) | — | — | — | — | — | ✔ own | — |
| Complete handover, AMC status, compliance | ✔ | — | — | — | — | — | — | — |
| Emergency button | ✔ | — | — | — | — | — | ✔ own (installed lift) | — |
| Invite users / assign roles | ✔ | — | — | — | — | — | — | — |

`permissions.ts` gains `owner` (read-only set: `project.read`, `payment.read`, new `report.read`), `sales` (`project.read`, new `lead.manage`), `qc` (`project.read`, `qc.approve`), and new permissions `lead.manage`, `order.manage`, `report.read`. Existing roles keep their permissions.

### 3.2 `firestore.rules` changes
- **Tighten (Step 03):** `users` create allowed only as `role:'pending_selection', status:'pending'`, or with exactly the role in `invites/{token.email}` and `status:'active'`, or admin for the owner email (fixes F-1). `getUserRole()` default for a missing user doc becomes `'none'` instead of `'customer'`.
- **Add (Step 03):** helper functions `role()`, `isOwnerRole()`, `isStaff()`, `userCustomerToken()`, `isParticipant(orderId)` (uid or customer token in `projects/{orderId}.participantIds`). Rules for every new collection in §2.1.
- **Change (Step 03), needed by the approved design:** `projects`, `quotes`, `quote_versions`, `documents`, `notifications`, `delivery_receipts`, `installation_jobs`, `qc_inspections`, `snags`, `handovers`, `warranties` become readable by order participants and the owner role (today admin/creator only). This **widens** read access to the people on that order, which the approved audit requires (customers must see their own order; D-12). Every widening is limited to participants and is covered by an S8 emulator test.
- **Writes by non-admins** are limited with `affectedKeys().hasOnly([...])` and allowed stage transitions (a rules-side map of the forward stages each role may set).
- **Storage rules:** not used (D-16 change). `emulator/storage.rules` stays a placeholder.

### 3.3 Emulator tests (`scripts/mvp-rules-emulator-check.ts`, Step 03, extended in 06/08/09/11)
Uses the existing `firebase` client SDK against the emulator (no new dependency): seeds with the emulator's owner bypass, signs in fixture users via the Auth emulator, and asserts the S8 table plus: self role-claim denied, invite-matched role allowed, customer reads own order only, tech2 denied without a task, tech1 denied after reassignment, customer denied on `quote_costs` and `purchase_orders`, signed-out denied. Run with `npm run mvp:rules` (wraps `emulators:exec`, project `demo-aie-mvp`).

---

## 4. Rules automation (`src/mvp/rules.ts`)

Pure. No I/O. `now` is injected.

```ts
type MvpEvent =
  | { type:'LEAD_CREATED'; salesUserId }                 | { type:'LEAD_QUALIFIED'; surveyFeeInr }
  | { type:'SURVEYOR_ASSIGNED'; surveyorId; date }        | { type:'SURVEY_RESULT'; result }
  | { type:'QUOTE_PREPARED'; belowMinimum }                | { type:'QUOTE_SENT' } | { type:'QUOTE_ACCEPTED' }
  | { type:'TOKEN_PAID' } | { type:'READINESS_SUBMITTED' } | { type:'SITE_READY_CONFIRMED'; poExpectedDate; deliveryDate }
  | { type:'MATERIAL_RECEIVED'; technicianId? }            | { type:'INSTALLATION_COMPLETED'; qcUserId? }
  | { type:'QC_DECISION'; decision; technicianId; qcUserId? }| { type:'REWORK_COMPLETED'; qcUserId? }
  | { type:'HANDOVER_COMPLETED'; warrantyEnd }             | { type:'ORDER_ON_HOLD'; reviewDate }
  | { type:'ORDER_CANCELLED' }                             | { type:'EMERGENCY_RAISED'; onCallTechId? }
  | { type:'CORRECTION_COMPLETED'; surveyorId? };

interface TaskSpec { type: TaskType; title; assignee: {userId?:string; role:MvpRole}; dueDate: string; stage: MvpStage }
interface RuleOutcome { nextStage?: MvpStage; nextStatus?: OrderStatus; create: TaskSpec[]; cancelOpenTasks?: boolean; completeTypes?: TaskType[] }

export function outcomeFor(event: MvpEvent, order: OrderSnapshot, now: Date): RuleOutcome;
export function dedupe(create: TaskSpec[], openTasks: {type}[]): TaskSpec[]; // I-2
```
**Idempotency.** (1) `dedupe` drops any spec whose type already has an open task. (2) Task ids are deterministic: `${orderId}__${type}__${n}` where `n` = 1 + number of earlier tasks of that type; `transactions.createIfAbsent` makes two concurrent creators converge on one document. (3) Each service call takes an idempotency key (`runIdempotent`) for money-affecting actions (payment verify, quote accept).

**Where each event is emitted** (always from a service function; screens never emit events):
| Event | Service function | UI action |
|---|---|---|
| LEAD_CREATED | `leadService.createLead` | New Lead → Save |
| LEAD_QUALIFIED | `orderService.qualifyLead` | Lead detail → Qualify |
| SURVEYOR_ASSIGNED | `orderService.assignSurveyor` | Order View → Assign surveyor |
| SURVEY_RESULT | `orderService.submitSurvey` | Survey form → Submit |
| CORRECTION_COMPLETED | `orderService.completeTask` (SITE_CORRECTION) | Customer → Done |
| QUOTE_PREPARED / QUOTE_SENT | `quoteService.saveQuote` / `sendQuote` | Quote builder |
| QUOTE_ACCEPTED | `quoteService.decide` | Customer quote → Accept |
| TOKEN_PAID | `paymentService.verify` (BOOKING_TOKEN → PAID) | Milestones → Verify |
| READINESS_SUBMITTED | `supplyService.submitReadiness` | Customer readiness → Submit |
| SITE_READY_CONFIRMED | `supplyService.confirmSiteReady` | Order View → Confirm site ready |
| MATERIAL_RECEIVED | `supplyService.markReceived` | PO → Material received |
| INSTALLATION_COMPLETED | `installationService.complete` | Task runner → COMPLETE |
| QC_DECISION | `qcHandoverService.decide` | QC → PASS/REWORK/FAIL |
| REWORK_COMPLETED | `installationService.complete` (REWORK) | Task runner → COMPLETE |
| HANDOVER_COMPLETED | `qcHandoverService.completeHandover` | Handover → Complete |
| ORDER_ON_HOLD / ORDER_CANCELLED | `orderService.putOnHold` / `cancel` | Order View admin actions |
| EMERGENCY_RAISED | `emergencyService.raise` | EMERGENCY button |

Due-date defaults live in `config.ts` (D-09). Progress (D-10) and health (D-11) are pure functions over an `OrderSnapshot` + open tasks + open blockers + milestones.

---

## 5. Screen plan (D-31: why not reuse)

The ★ screens were checked against this rule. Each is bound to a legacy record shape (`TechnicianJob`, `FinalHandoverChecklistRecord`, …) read through `DbManager`, and its canonical write is a soft-fail bridge call. "Switch reads" would mean rewriting nearly all of their state logic. So for every screen below the choice is **thin new screen reusing the component kit** (`Common.tsx` Card/Button/Badge/IconTile, `CameraCapture`, lucide icons, the existing Tailwind tokens), except the Order View and the work queue, which are extended in place.

| # | MVP screen | Mode | Files | Reads / writes | Why not reuse the legacy screen |
|---|---|---|---|---|---|
| 1 | Admin dashboard | new (thin) + reuse `WorkQueueScreen` item styles | `src/mvp/screens/AdminDashboard.tsx` | reads projects, tasks, blockers, milestones, leads | legacy `AdminDashboard` is 1,250 lines of local seed data |
| 2 | Order View | **extend** | `components/ProjectOperatingView.tsx`, `services/projectOperatingView.ts` (adds MVP model) | reads order + children; writes via services | ◆ canonical already |
| 3 | Orders list | new | `src/mvp/screens/OrdersList.tsx` | projects | — |
| 4–6 | Leads | new thin, reuses LeadInbox field set | `src/mvp/screens/Leads*.tsx` | `leads` | LeadInbox 1,646 / LeadFollowUpScheduler 1,653 lines, scoring/AI mixed in |
| 8 | Survey | new thin | `src/mvp/screens/Survey*.tsx` | `surveys`, `documents` | SiteVisitVerification (790) is local and has different fields |
| 9–10 | Quote | new thin, reuses QuotePricing layout | `src/mvp/screens/Quote*.tsx` | `quotes`, `quote_versions`, `quote_costs` | QuotePricing hard-codes GST; mock arrays |
| 11 | Milestones | new panel in Order View | `src/mvp/screens/PaymentsPanel.tsx` | `payment_milestones` | PaymentStageScheduleSetup is 1,303 lines |
| 12–13 | Readiness, suppliers, POs | new thin | `src/mvp/screens/SiteReadiness.tsx`, `SupplyScreen.tsx` | `tasks`, `documents`, `suppliers`, `purchase_orders`, `delivery_receipts` | 6 legacy screens, 4,200 lines, legacy shapes |
| 14–15 | Technician | new thin | `src/mvp/screens/TechToday.tsx`, `TaskRunner.tsx` | `tasks`, `installation_jobs`, `documents`, `blockers` | legacy home reads seed jobs |
| 16–17 | QC, handover | new thin | `src/mvp/screens/QcScreen.tsx`, `HandoverScreen.tsx` | `qc_inspections`, `snags`, `handovers`, `warranties`, `amcs` | 4 legacy screens (2,400 lines) |
| 18 | AMC + on-call | new thin | `src/mvp/screens/AmcScreen.tsx` | `amcs`, `service_cases`, `mvp_settings` | WarrantyAmcRegistration 676, local |
| 19 | Emergency | new thin, reuses `EmergencyEscalationAlert` colours/icons | `src/mvp/screens/EmergencyButton.tsx` | `service_cases`, `tasks` | legacy 1,135 lines (D-28 says thin) |
| 20 | Compliance | new panel | `src/mvp/screens/CompliancePanel.tsx` | `compliance_items`, `documents` | legacy is local |
| 21 | Owner view, reports | new thin; Recharts already a dependency | `src/mvp/screens/OwnerView.tsx`, `Reports.tsx` | read models | legacy analytics are local |
| 22 | Users & invites, bell, customer home | new thin | `src/mvp/screens/UsersScreen.tsx`, `Bell.tsx`, `CustomerHome.tsx` | `invites`, `users`, `notifications` | AdminRoleManagement reads localStorage users |

**Lines saved by reuse.** The MVP reuses ~2,300 lines of canonical services, repositories, audit and idempotency, plus ~300 lines of Order View and work queue, instead of rewiring ~14,000 lines of legacy screens. The ~22 thin screens are estimated at ~4,500 lines in total.

**D-28 (emergency)** is Step 09 (`emergencyService` + button + on-call). **D-29 (licence)** is Step 09 (STATUTORY_LICENCE task, handover gate, "Licence pending" bucket). **D-30 (survey fee)** is Step 05 (config `SURVEY_FEE_INR = 0` default; COLLECT_SURVEY_FEE task + SURVEY_FEE milestone + waive action appear only when > 0).

---

## 6. Hide plan (`MVP_MODE`)
- `src/mvp/mvpMode.ts`: `isMvpMode()` returns `false` only when the build sets `VITE_MVP_MODE=off`, or an Admin has set the local toggle `aiec_mvp_mode=off` in their browser (per-viewer convenience; it hides nothing from the rules).
- `App.tsx`: when on, render `<MvpRouter>` **instead of** the legacy routers (so hidden screens are never mounted, their lazy chunks never load and their tab ids can't be reached directly); `getTabsByRole` returns the MVP allow-list for the role; the command palette receives the same filtered list; the landing tab is the role's MVP home; the login shows Google only (plus the demo tab in non-production builds); a signed-in user without an invite sees "Ask the Admin to invite you" instead of `RoleSelectionWizard`.
- When off: every legacy router, tab and gate behaves exactly as at baseline (checked by `surfaces:check`, `navigation-cutover:check`, `operating-surfaces-home:check` and a new `mvp-mode:check` that snapshots the legacy tab list).
- `serverApp.ts`: `/api/gemini/*`, `/api/maps/*` and `/api/db/*` answer 404 when `MVP_MODE` is on (server reads `MVP_MODE` env, default on).

---

## 7. Check plan
**New `npm run mvp:checks`** (tsx scripts, demo repository, injectable clock):
| Script | Proves | Step |
|---|---|---|
| `mvp-pure-check.ts` | stage mapping, progress (incl. 71%), health (all 5 rules), config sanity | 03 |
| `mvp-rules-check.ts` | every D-08 row: tasks, owners, due dates; duplicate event → no duplicate task | 03 |
| `mvp-order-service-check.ts` | S1 steps 1–4 + I-1..I-4 after each step; hold/resume/cancel/override | 03 (grows) |
| `mvp-mode-check.ts` | allow-list per role; legacy tab list unchanged when off | 04 |
| `mvp-scenarios-check.ts` | S1 full, S2–S7, S9, S10 via services, invariants after every step | 04→09 |
| `mvp-readmodels-check.ts` | Order View model, dashboard buckets, owner totals, reports | 04, 10 |
| `mvp-i18n-check.ts` | every MVP string key exists in en; mr/hi fall back | 10 |
| `mvp-audit-coverage-check.ts` | every I-3 action writes an AuditEvent | 11 |
**Emulator:** `npm run mvp:rules` → `mvp-rules-emulator-check.ts` (S8 and more). Not part of `mvp:checks`, because it needs Java and the emulator download; it runs in every step that touches rules.

**`checks:legacy`** (kept, D-23): bridge, procurement-bridge, delivery-bridge, installation-qc-handover-bridge, portal-summary, dual-write-reconciliation, dual-write-cutover, legacy-read-migration, legacy-write-reduction, legacy-database-elimination, dbmanager-remaining, legacy-authz-remediation, migration, final-company-simulation-multi, simulation:full-company. Why: they measure the legacy bridge migration, which the MVP no longer continues (D-01). They stay runnable. `npm run checks` keeps its current definition (still never run whole).

**Stays in the per-step verify list:** lint, build, domain, workflow:validate, repository, authz, audit, eventbus, commercial, operations, offline, reliability, controltower, e2e, project-operating-view, work-queue, production-demo-gate, production-bundle-bypass, transactional-idempotency, hard-gate-attack, code-splitting, security-hardening, integration-boundaries, global-search, data-quality-phase26, surfaces, operating-surfaces-home, navigation-cutover.

**Playwright:** not justified as a dependency (D-23). Chromium is preinstalled. For UI evidence, Step 04 onward takes screenshots with headless Chromium's `--screenshot` flag against the dev server, entering through a demo role via `?demoRole=<role>`, which is honoured **only** when `isDemoAuthBuild()` is true.

---

## 8. Step breakdown (03–11)

Every step: branch → commits `mvp(step-NN): …` → lint, build, `mvp:checks`, the verify list above → scope guard → PROGRESS → draft PR. **Rollback:** each step is one PR; revert the merge commit. Data changes are additive and old code ignores the new fields, so a revert needs no data migration.

### Step 03: Data foundation (≈18 files, ≈1,450 lines)
- **Create:** `src/mvp/config.ts`, `stage.ts`, `progress.ts`, `health.ts`, `rules.ts`, `format.ts`; `src/mvp/services/orderService.ts`, `notify.ts`; `src/repository/transactions.ts`; `scripts/mvp-pure-check.ts`, `mvp-rules-check.ts`, `mvp-order-service-check.ts`, `mvp-rules-emulator-check.ts`, `mvp-backfill-projects.ts`, `scripts/mvp/fixtures.ts`.
- **Modify:** `src/domain/entities.ts` (Task, Blocker, PaymentMilestone, SiteSurvey, QuoteCost, ComplianceItem, Invite; new fields and stages; roles), `src/domain/ids.ts`, `src/domain/permissions.ts`, `src/repository/entities.ts` (new repositories), `src/types.ts` (UserRole + owner/sales/qc, additive), `firestore.rules`, `package.json` (`mvp:checks`, `mvp:rules`, `checks:legacy`), delete `bun.lock`.
- **Depends on:** Step 02.
- **Acceptance:** S1 steps 1–4 with I-1..I-4 (service level); D-10 71% example; every D-08 row; duplicate events create nothing; S8 rows for `tasks`/`projects`/`quote_costs` on the emulator; F-1 closed.

### Step 04: Order View, Admin dashboard, MVP_MODE (≈14 files, ≈1,300 lines)
- **Create:** `src/mvp/mvpMode.ts`, `src/mvp/services/readModels.ts`, `src/mvp/screens/MvpRouter.tsx`, `AdminDashboard.tsx`, `OrdersList.tsx`, `AdminActions.tsx`, `scripts/mvp-mode-check.ts`, `mvp-readmodels-check.ts`.
- **Modify:** `components/ProjectOperatingView.tsx`, `services/projectOperatingView.ts`, `App.tsx` (router switch, tab filter, login tabs, invite gate, demoRole param), `components/CommandPalette.tsx` (receives filtered tabs; no logic change if already prop-driven), `src/serverApp.ts` (404 hidden APIs), `lib/firestoreUsers.ts` (invite on first sign-in).
- **Depends on:** 03.
- **Acceptance:** Order View model for S1 1–13a shows 71% at 13a (service level); S2/S3/S5 buckets; NO NEXT ACTION detected; allow-list on, legacy unchanged off; demo tab hidden in production build (`production-demo-gate:check` extended).

### Step 05: Leads, sales and survey (≈12 files, ≈1,200 lines)
- **Create:** `src/mvp/services/leadService.ts`, `evidenceService.ts` (image compress → `documents`), `src/mvp/screens/LeadForm.tsx`, `LeadsList.tsx`, `LeadDetail.tsx`, `SurveyList.tsx`, `SurveyForm.tsx`, `PhotoInput.tsx` (wraps `CameraCapture`/file input).
- **Modify:** `orderService.ts` (assignSurveyor, submitSurvey, survey-fee waive), `MvpRouter.tsx`, `firestore.rules` (`leads` for sales/owner, `surveys`, `documents`), scenario checks.
- **Depends on:** 04.
- **Acceptance:** S1 1–4; validation (bad phone, no consent, < 2 photos, non-numeric mm); NOT_FEASIBLE and REQUIRES_CORRECTION tasks; surveyor denied on another survey (emulator).

### Step 06: Quote, booking, payments (≈11 files, ≈1,300 lines)
- **Create:** `src/mvp/gates.ts`, `services/quoteService.ts`, `paymentService.ts`, `screens/QuoteBuilder.tsx`, `QuoteView.tsx`, `PaymentsPanel.tsx`.
- **Modify:** `orderService.ts`, `MvpRouter.tsx`, Order View, `firestore.rules` (`quotes`, `quote_versions`, `quote_costs`, `approval_requests`, `payment_milestones`), checks.
- **Depends on:** 05.
- **Acceptance:** fixture ₹11,80,000 and markup 25%; low-margin variant blocked until approval; milestones 10,000 / 10,52,000 / 1,18,000 and sum rule; S1 5–7; S6; S5 setup AT_RISK; I-5 on emulator; audit on every payment change.

### Step 07: Site readiness, supplier, delivery (≈9 files, ≈900 lines)
- **Create:** `services/supplyService.ts`, `screens/SiteReadiness.tsx`, `SupplyScreen.tsx`.
- **Modify:** Order View actions, `MvpRouter.tsx`, `firestore.rules` (`suppliers`, `purchase_orders`, `delivery_receipts`), checks.
- **Depends on:** 06.
- **Acceptance:** S1 8–12; S2 (overdue → hold → resume, audited); S5 to material received; delayed PO → supplier-delay bucket; customer denied PO amounts.

### Step 08: Technician, installation, blockers (≈9 files, ≈1,100 lines)
- **Create:** `services/installationService.ts`, `screens/TechToday.tsx`, `TaskRunner.tsx`, `BlockerDialog.tsx`.
- **Modify:** `orderService.ts` (blockers, reassign), Order View, `MvpRouter.tsx`, `firestore.rules` (`installation_jobs`, `blockers`), checks.
- **Depends on:** 07.
- **Acceptance:** S1 13a = 71, 13b → QC task; S3; S5 START refused → override → allowed; S7 (2 audit events, tech1 loses access on the emulator); earnings "—" unless a rate exists.

### Step 09: QC, handover, AMC, emergency (≈12 files, ≈1,400 lines)
- **Create:** `services/qcHandoverService.ts`, `emergencyService.ts`, `screens/QcScreen.tsx`, `HandoverScreen.tsx`, `AmcScreen.tsx`, `EmergencyButton.tsx`, `CompliancePanel.tsx`.
- **Modify:** `orderService.ts`, `MvpRouter.tsx`, Order View, `firestore.rules` (`qc_inspections`, `snags`, `handovers`, `warranties`, `amcs`, `service_cases`, `compliance_items`, `mvp_settings`), checks.
- **Depends on:** 08.
- **Acceptance:** S1 14–16; S4 + FAIL variant; handover refused without final payment unless overridden; S9 + no-on-call variant; S10; completed order leaves Active lists.

### Step 10: Customer, owner, notifications, reports, languages (≈12 files, ≈1,300 lines)
- **Create:** `screens/CustomerHome.tsx`, `OwnerView.tsx`, `Reports.tsx`, `Bell.tsx`, `UsersScreen.tsx`, `src/mvp/i18n.ts` (MVP keys en/mr/hi, fallback to en), `scripts/mvp-i18n-check.ts`.
- **Modify:** `lib/language.ts` (decouple from DbManager), `notify.ts` (10 notifications, overdue scan on dashboard load, daily digest on the Admin's first login of the day), `readModels.ts`, `MvpRouter.tsx`, `firestore.rules` (`notifications` readAt by audience, `invites`).
- **Depends on:** 09.
- **Acceptance:** customer sees only own order, no cost; owner totals after S1 = collected ₹11,80,000, completed 1; 10 notifications once each; language switch without missing keys.

### Step 11: Security, compliance, hardening (≈10 files, ≈800 lines)
- **Create:** `scripts/mvp-audit-coverage-check.ts`, `docs/mvp/BACKUP_AND_RESTORE.md`, validation helpers `src/mvp/validate.ts`.
- **Modify:** services (server-side style validation), `firestore.rules` (final S8 suite, tighten anything left), `App.tsx` (session restore only from Firebase auth for real users, F-5), `production-demo-gate-check.ts`, PROGRESS (production build command, env var list).
- **Depends on:** 10.
- **Acceptance:** S8 full on the emulator; audit coverage; `production-bundle-bypass:check`; hidden routes unreachable in MVP_MODE; `code-splitting:check`.

---

## 9. What stays manual in Phase 1
- Payment verification (the Admin checks the UTR/screenshot against the bank; no gateway).
- Supplier updates (the Admin types PO status, dispatch and delays; no supplier login).
- Choosing the surveyor, technician and QC person for each order.
- Statutory licence, inspection, insurance and GST paperwork (recorded only ⚖).
- The daily on-call technician setting.
- Backups (Owner runs or schedules the Firestore export; Step 11 documents it).
- Refunds (recorded as REFUNDED with a reference; money moves outside the app ⚖).
- External messages (WhatsApp/SMS/email are not wired; in-app only).
- Inviting each staff member and customer by email.

---

## 10. Frozen decisions
| Decision | State |
|---|---|
| D-01 One shared source of truth | FROZEN |
| D-02 Order = Project, `AE-####` | FROZEN (counter doc in a transaction, R-7) |
| D-03 Ten stages | FROZEN |
| D-04 Lead vs Order | **CHANGED (R-1):** the MVP lead store is the existing Firestore `leads` collection with its legacy shape extended additively; `CanonicalLead` is deprecated. Mapping to lead statuses is stored as `mvpStatus`. Reason: `leads` is the only data real users have already shared |
| D-05 Status separate from stage | FROZEN |
| D-06 Task | FROZEN, plus R-6: non-admin reads filter by `assigneeId` or `participantIds` |
| D-07 Blocker | FROZEN |
| D-08 Rules automation | FROZEN |
| D-09 Due-date defaults in one config | FROZEN |
| D-10 Progress | FROZEN |
| D-11 Health | FROZEN |
| D-12 Roles | FROZEN, plus R-2 (`qc_inspector` = `qc`) and the participant model: order access comes from `participantIds` (uids + `customer:<customerId>`) |
| D-13 Logins | **CHANGED (R-3):** Google sign-in only, access by Admin invite list; the client-side phone OTP and password logins are hidden in MVP_MODE. Reason: they are client-side fakes today |
| D-14 Payment milestones | FROZEN; gateway hidden (R-4) |
| D-15 Quote & margin | FROZEN; cost in `quote_costs` |
| D-16 Evidence | **CHANGED:** evidence images (compressed on device to ≤ 900 KB, images only; PDFs ≤ 900 KB for compliance files) are stored as `DocumentRecord`s in Firestore `documents` with the image data inline, guarded by the same participant rules. Reason: Storage rules can't check order participation here. The project has no `(default)` Firestore database for cross-service rules to read (`src/lib/firebase.ts`), and there is no server SDK for custom claims. Firestore rules give the same participant guarantee and are testable in the emulator. Cost at 10–20 lifts is negligible. Revisit in Phase 2 |
| D-17 Notifications | FROZEN (in-app only; `role:<role>` audience for role-wide alerts) |
| D-18 Languages | FROZEN |
| D-19 Never test against real data | FROZEN |
| D-20 Demo mode | FROZEN, plus R-5 (demo tab hidden in production builds) |
| D-21 Pilot deployment | FROZEN: **Vercel** (`v3-200-ai-studio`), with `VITE_APP_ENV=production` set by the Owner |
| D-22 Hide, don't delete | FROZEN, plus R-8 (hidden server routes return 404) |
| D-23 Old check suite | FROZEN (lists in §7) |
| D-24 Hold | FROZEN |
| D-25 Cancel | FROZEN |
| D-26 Handover & AMC | FROZEN |
| D-27 Compliance | FROZEN (items in `compliance_items`, files as `DocumentRecord`s) |
| D-28 Emergency | FROZEN (emergency number: config, still to be given by the Owner) |
| D-29 Licence | FROZEN |
| D-30 Survey fee | FROZEN (`SURVEY_FEE_INR = 0`) |
| D-31 Reuse first | FROZEN (§5 gives the per-screen reason) |

---

## 11. Risks and rollback
| Risk | Mitigation / rollback |
|---|---|
| Rules changes lock out or over-expose users | S8 emulator suite in every rules step; widening limited to participants; rollback = revert the step PR and redeploy the previous `firestore.rules` (rules deploy is an Owner action) |
| Client-side services: a signed-in participant could write inconsistent fields | Rules restrict keys and stage transitions per role; invited users only; every action audited; Phase 2 option: move writes behind a verified server API |
| MVP screens misbehave in the pilot | Switch `MVP_MODE` off (build `VITE_MVP_MODE=off`, or the Admin's local toggle) → legacy UI returns unchanged; MVP data stays in its own collections |
| Firestore document size (inline images) | Compress to ≤ 900 KB before write; refuse larger files with a clear message |
| Bundle growth | MVP screens are lazy-loaded; `code-splitting:check` |
| A step's PR must be reverted | Every step is one PR with additive data; revert its merge commit. No migration runs automatically; the backfill is dry-run by default and emulator/demo-only in these sessions |
