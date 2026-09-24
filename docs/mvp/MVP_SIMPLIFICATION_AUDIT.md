# MVP SIMPLIFICATION AUDIT (Step 01, Phase A)

> **Status:** DRAFT, awaiting Owner approval.
> **Snapshot:** branch `claude/mvp-step-01-audit`, based on `main` at `74bb273` (Step 00), 2026-09-24.
> **Method:** read-only inspection of the real code. Every claim below cites a file, and a grep or script produced the counts. No application code changed.
> **Legend** (same as `REUSE_MAP.md`): ◆ canonical · ★ dual-write bridged · ○ legacy `DbManager`/localStorage · □ UI-only / mock state.

---

## 1. Executive summary (for the Owner)

1. The app is large (194 screens, ~62 build phases) and looks finished, but **almost none of it is shared between people yet.** 142 screens save to the browser they run in (localStorage). If the Admin records a payment, the technician and the customer never see it.
2. **Only two things really live in the shared database today:** leads (the `leads` collection) and user profiles (`users`). Everything else that is shared is a partial "shadow copy" that the old pack made as a side effect.
3. A good **shared backbone already exists and is tested**: order (Project), quote, payment, PO, delivery, installation, QC, snag, handover and warranty records, plus audit, idempotency and permission checks. The MVP should be built on it.
4. **Recommendation:** keep that backbone, add Task and Blocker, and put **~35 thin or re-wired screens** on top of it. Hide ~150 screens with `MVP_MODE` and delete only one proven-dead file.
5. **Real people cannot use it yet.** New staff pick their own role, and that choice is silently lost. The Admin cannot see other people's sign-ups. Customers have no access to their own order in the database rules.
6. **Nothing takes real money.** The "online payment" screen is a simulation with a random 90% success rate. The MVP should record payments manually (D-14).
7. **Photos cannot be uploaded.** Firebase Storage is not wired up anywhere. Evidence upload has to be built (small).
8. **"Try as Role" demo buttons are on the live login screen in every build.** Demo mode can't touch real data, but the live Vercel build probably also ships the demo passwords. That has to be fixed before real use.
9. Taxes are hard-coded (GST 18%) in 26 screens ⚖ VERIFY. All of them are either hidden or rewired in the plan.
10. **Your answers to §8 (logins, pilot deployment, Firebase access, survey fee, emergency number, licence)** decide the next step.

---

## 2. Current architecture

```
                         ┌──────────────────────── Browser (PWA, React 19 + Vite 6) ────────────────────────┐
  Google sign-in ──────► │ src/App.tsx (2,556 lines): login, onboarding gates, getTabsByRole (140 tab ids)   │
  "Try as Role" (demo)   │   └─ routers/{Admin,Surveyor,Technician,Customer,Supplier}Router + SharedRoutes  │
  fake OTP / password    │        └─ 194 screens in src/components                                          │
                         │                                                                                  │
                         │  (A) 142 screens ──► DbManager (src/lib/db.ts, 11.7k lines) ──► localStorage     │
                         │                        ├─ leads ─► Firestore `leads` (real sessions only)        │
                         │                        └─ users ─► Firestore `users` (real sessions only)        │
                         │  (B) 16 ★ screens ──► legacyCommercialBridge ──┐   (shadow write, soft-fail)     │
                         │  (C) 2 ◆ screens (ProjectOperatingView, WorkQueueScreen)                          │
                         │        │                                       ▼                                  │
                         │        └──► services/* ──► repository/* ──► Firestore (real)  |  in-memory (demo) │
                         │             (commercialWorkflow, operationsWorkflow, projectOperatingView,        │
                         │              workQueue, controlTower, events/bus, lib/audit, lib/idempotency)     │
                         └──────────────────────────────────────────────────────────────────────────────────┘
                                         │ /api/*  (no auth on any route)
                         ┌───────────────▼──────────────────────────┐
                         │ Express src/serverApp.ts (646 lines)      │  Vercel: api/index.ts  (LIVE, verified project
                         │  /api/gemini/* (Gemini, if key set)       │          `v3-200-ai-studio` exists)
                         │  /api/maps/*, /api/config/maps-key        │  AI Studio/Cloud Run: server.ts :3000
                         │  /api/db/* → Drizzle/Postgres (unused)    │          (metadata.json)
                         └───────────────────────────────────────────┘
       Firebase project `dogwood-torus-v71nt`, named Firestore DB `ai-studio-buildit-…`. No Storage use. No staging project.
```

- **Frontend.** There is no URL router. `App.tsx` holds `activeTab` state. `getTabsByRole()` (App.tsx:804) lists 140 tab ids, and the routers render screens with `activeTab === 'X'` (314 distinct ids, many reached only by in-screen links). `OperatingSurfacesHome` groups tabs into 5 surfaces with a regex (`navigation/surfaces.ts`).
- **Server.** One Express app with two entry points: `server.ts` (listens on 3000, AI Studio/Cloud Run) and `api/index.ts` (Vercel). **No route verifies the caller**: no `firebase-admin`, no session middleware. The MVP doesn't need any server route.
- **Live deployment.** Vercel project `v3-200-ai-studio` exists on the Owner's Vercel account (checked read-only with the Vercel connector on 2026-09-24). Its deployments and env vars returned **403** (the token is not scoped to `prashantashwable-5664s-projects`). The earlier pack's Phase 41 doc (`docs/production/LIVE-DEPLOYMENT-AUDIT.md`) says it serves `https://v3-200-ai-studio.vercel.app` from `main`, with **no env vars set**, so `VITE_APP_ENV=production` was probably **not** set at build time.
- **Drizzle/Postgres (`src/db/*`).** Used only by `/api/db/status`, `/api/db/contracts` and `/api/db/sops`. No screen calls them (grep: zero references in `src/components`, `App.tsx`, `routers`), and they only do anything if `SQL_HOST` is set. They are **dead at runtime** and are also an unauthenticated IDOR (`?userId=`).

---

## 3. The data-layer truth

### 3.1 What is really shared between users today (real Google sign-in)
| MVP function | Store today | Shared? | Evidence |
|---|---|---|---|
| Sign-in, user profile, role | Firestore `users/{uid}` (legacy `User` shape) | **Yes**, per user. The Admin **cannot list** other users: `DbManager.getUsers()` is localStorage, and no code queries `users` as a collection | `lib/firestoreUsers.ts`, `db.ts:1286` |
| Lead capture / edit | Firestore `leads/{id}` (legacy `Lead` shape) via `DbManager.addLead/updateLead` | **Yes**. The Admin sees all leads; others see leads where `surveyorId == uid` | `db.ts:1263-1340`, `lib/firestoreLeads.ts` |
| Deal (agreed price, specs) | localStorage `aiec_deals` | **No** | `db.ts:1344` |
| Canonical Project/Customer/Site | Firestore, **only** as a side effect of a ★ bridge call, and only if the legacy Lead **and Deal** exist in the same browser | Partly; usually **fails** for real users because deals are local | `legacyCommercialBridge.ts:75-160` |
| Quote | Canonical only when a Kanban card moves to `quoted`/`closed_won` (auto-approved, 1 line item). Quote screens are UI mock | Partly | `bridgeLeadStageTransition` |
| Contract | `contracts_v2` draft via event bus. `signContract()` is **never called from the UI** | No real signing | grep `signContract` |
| Payment milestones, payments | Legacy local. Bridge creates an **empty placeholder** schedule | Partly (shadow) | `bridgeLegacyPaymentConfirmed` |
| PO, shipment, receipt, installation job, QC, handover, warranty | Legacy local plus ★ shadow writes | Partly (shadow) | 16 ★ screens |
| Technician jobs, checklists, blockers, rework, AMC, support, notifications, reports | localStorage **seeded with fake records**. A real user sees fake seed data | **No** | `db.ts:2165` `getTechnicianJobs()` returns `initialTechnicianJobs` |
| Photos / evidence | Legacy: base64 data-URLs inside records (leads' `site_photos`). Canonical: `mediaUpload.ts` **has no storage transport**, so it throws | **No** (and there is a 1 MB Firestore document-limit risk) | `offline/mediaUpload.ts` header |
| Audit log | Firestore `audit_logs` (canonical services only) | Yes | `lib/audit.ts` |

**Bottom line:** of the 11 acceptance steps (spec §38), only step 1 (lead) and part of step 2 (qualify) are shared today.

### 3.2 Canonical entities (30 types in `src/domain/entities.ts`)
| Entity | Collection | Written by | Read by | MVP use |
|---|---|---|---|---|
| CanonicalUser / role | (`users` holds the legacy `User` shape) | firestoreUsers | authz | Extend the role list (D-12) |
| Customer, Site | `customers`, `sites` | `createProjectFromLead` (bridge) | POV, dataQuality, search | **Keep**, create at qualification |
| CanonicalLead | **no repository** (only `id/stage/surveyorId/projectId`) | — | — | **Gap**: see D-04 change R-1 |
| Project | `projects` | bridge, commercial/operations workflows | POV, workQueue, portal summary | **Keep** = Order; add `displayCode`, `status`, stages |
| Quote, QuoteVersion | `quotes`, `quote_versions` | commercialWorkflow | POV, portal | **Keep**; add cost/tax fields to QuoteVersion |
| Contract | `contracts_v2` | event bus (draft) | POV | Keep minimal (agreement = compliance doc) |
| PaymentSchedule, Payment | `payment_schedules`, `payments` | commercialWorkflow/bridge | POV, controlTower | **Keep**; map to D-14 milestones |
| Invoice, ProductionOrder, ServiceCase, AMC, Supplier, ApprovalRequest | **no repository, never written** | — | — | ServiceCase (D-28), AMC (D-26), ApprovalRequest (D-15), Supplier: add repositories; Invoice/ProductionOrder: not needed |
| PurchaseOrder | `purchase_orders` | commercialWorkflow (payment hard gate) | POV, controlTower | **Keep**; add `expectedDeliveryDate`, delay |
| Shipment, DeliveryReceipt | `shipments`, `delivery_receipts` | operationsWorkflow | POV | Keep (receipt = "material received") |
| InstallationJob | `installation_jobs` | operationsWorkflow | POV | **Keep**; add the 11-item checklist |
| QCInspection, Snag | `qc_inspections`, `snags` | operationsWorkflow, event bus (QC_FAILED) | POV, controlTower | **Keep**; add PASS/REWORK/FAIL |
| Handover, Warranty | `handovers`, `warranties` | operationsWorkflow, event bus | POV | **Keep** |
| DocumentRecord | `documents` | mediaUpload (no transport) | dataQuality | **Keep**; basis for D-16/D-27 |
| NotificationRecord | `notifications` | event handlers, notificationService | none in the UI | **Keep**; build a small bell/list |
| AuditEvent | `audit_logs` | lib/audit | POV history | **Keep** |
| WorkflowInstance/Execution, ReconciliationRecord | `workflow_*`, `reconciliation_records` | event bus, reconciliationService | controlTower | Keep code, **don't surface** in the MVP |

### 3.3 Other technical facts that matter for the plan
- The **repository has no transaction or batch API.** `createProjectFromLead` uses `Promise.all` of 3 separate writes, which is not atomic. D-02 (counter doc) and D-04 (one transaction) need a small `runTransaction` addition. `lib/idempotency.ts` already uses `runTransaction`, so the pattern exists.
- `repo.list()` and `subscribe()` read **whole collections**. Firestore rules are not filters, so for any non-admin a whole-collection query on `projects` is **denied**. `workQueue`, `controlTower` and the portal summary therefore work only for the Admin (or in demo). MVP queries must filter by the same field the rule checks (e.g. `where('assigneeId','==',uid)`).
- `firestore.rules` gives the **customer and supplier no access** to any canonical collection (its own comment admits this), and there is **no `sales`, `qc` or `owner` role**.

---

## 4. Sections A–F

> Screen-by-screen classification of all 194 is in **§4.7**. The tables below are by feature.

### A. KEEP
| Feature | Current State | MVP Decision | Reason | Risk | Files |
|---|---|---|---|---|---|
| Canonical domain model | ◆ 30 entities, branded ids, adapters | KEEP; extend additively (Task, Blocker, stages, roles, fields) | It already fits "Order, Task, Evidence, Payment, Partner, Installation, QC, AMC" (§34) | Low | `src/domain/*` |
| Repository layer (Firestore + demo) | ◆ optimistic `version`, demo isolation | KEEP; add `tasks`, `blockers`, `counters`, and a small transaction helper | Tested by `repository:check` | Low | `src/repository/*` |
| Audit + idempotency | ◆ `audit_logs`, `idempotency_keys` (transactional) | KEEP as-is | Needed for overrides and payments | Low | `lib/audit.ts`, `lib/idempotency.ts` |
| authz + permissions | ◆ 19 permissions, high-risk gate needs `firebase_auth` | KEEP; add owner/sales/qc | One decision point | Low | `lib/authz.ts`, `domain/permissions.ts` |
| Commercial + operations services | ◆ quote → payment → PO (payment hard gate) → delivery → install → QC → handover, with hard gates | KEEP; add MVP rules on top | ~650 lines of tested logic (`commercial`, `operations`, `hard-gate-attack`, `e2e` checks) | Medium: states are more granular than the MVP | `services/commercialWorkflow.ts`, `operationsWorkflow.ts` |
| Order View | ◆ `getProjectOperatingView` + 195-line screen | KEEP and extend (display code, progress, health, current task, payments) | Closest thing to spec §8 | Low | `services/projectOperatingView.ts`, `components/ProjectOperatingView.tsx` |
| Work queue / Needs Attention | ◆ `workQueue.ts`, `controlTower.ts` | KEEP; re-point to persisted tasks and D-11 health | D-06 already says so | Low | `services/workQueue.ts`, `controlTower.ts`, `WorkQueueScreen.tsx` |
| Firestore lead store | Real, shared, legacy shape | KEEP as the lead store (R-1) | The only working shared lead path | Low | `lib/firestoreLeads.ts` |
| Google sign-in + `users/{uid}` | Real | KEEP as the login (D-13 default) | Real, verified `firebase_auth` identity | Low | `App.tsx:617`, `lib/firestoreUsers.ts` |
| Demo repository + environment badge | ◆ | KEEP for training/tests (D-20) | Can't reach Firestore | Low | `repository/demoRepository.ts`, `lib/environment.ts`, `EnvironmentBadge.tsx` |
| Languages en/mr/hi | `lib/language.ts` + 68 `appTranslations` uses in App | KEEP; decouple the one `DbManager.updateUser` call (language preference) | D-18 | Low | `lib/language.ts:260` |
| UI kit | `Common.tsx` (Card, Button, Badge, IconTile), `CameraCapture.tsx` | KEEP | Consistent look | Low | `components/Common.tsx`, `CameraCapture.tsx` |
| Production demo guards | `production-demo-gate`, `production-bundle-bypass` checks pass | KEEP; extend to the "Try as Role" buttons (F-3) | D-20 | Low | `lib/demoCredentials.ts`, `scripts/production-*` |
| Offline outbox | ◆ IndexedDB queue + retry | KEEP for evidence uploads | Field sites have poor signal | Low | `offline/outbox.ts` |

### B. SIMPLIFY
| Feature | Current State | MVP Decision | Reason | Risk | Files |
|---|---|---|---|---|---|
| Stage model | 15 `ProjectStage` values; Order View shows a 14-step timeline | Add `survey`, `site_ready`; add `toMvpStage()`; show 10 stages | D-03 | Low (additive) | `domain/entities.ts`, `projectOperatingView.ts` |
| Workflow state machines | 7 granular definitions (installation alone has 11 states) | Keep as internal guards; **the MVP driver is `src/mvp/rules.ts`** (D-08); no new definitions | Fewer states for users | Low | `workflows/definitions/*` |
| Next action text | `NEXT_ACTION_BY_STAGE` constant | Replace with the current task's title; keep the constant as fallback | D-06 | Low | `projectOperatingView.ts` |
| Health/priority | 4 control-tower categories from computed blockers | D-11 health (5 values) from tasks, blockers and payments | Deterministic | Low | `workQueue.ts`, `controlTower.ts` |
| Leads | 12 lead screens (~13k lines), scoring, merge, heatmap | Thin New Lead / My Leads / Follow-ups / Won / Lost, using `leads` + LeadDetail/LeadKanban parts | Spec §13/§23 | Medium (LeadDetail is 1,211 lines) | `LeadInbox`, `LeadDetail`, `LeadKanban`, `LeadFollowUpScheduler` |
| Survey | Inside `SurveyorDashboard` (≈6,500 lines of `Dashboards.tsx`) + `SiteVisitVerification` (○, 790 lines) | Thin survey form (§15 fields + photos + result) | Current survey data is local only | Medium | `Dashboards.tsx:1703-8266`, `SiteVisitVerification.tsx` |
| Quote | `QuotePricing` (□/○: localStorage spec, **GST 18% hard-coded**, 18% margin floor), `QuotationPreview` and `DiscountApprovalWorkflow` (mock arrays) | Wire to `Quote/QuoteVersion`; tax from config ⚖; margin rule D-15 with `ApprovalRequest` | Spec §16 | Medium | those 3 files |
| Payments | `PaymentCollectionDashboard` ★ (1,103 lines, reads legacy; canonical read is telemetry only), `CustomerPaymentInstallmentsScreen` ○ | Thin milestone panel on the Order View; customer submits proof; Admin verifies | D-14 | Medium | those files + `commercialWorkflow.collectInstallment` |
| Supply/delivery | PO ★, status ★, delivery checklist ★, scheduling ★, directory ○, material received ○ | Keep PO + status + received; fold scheduling into the PO expected date | Spec §24 | Medium | 6 files |
| Technician | Home ○ (seed jobs), check-in ★, evidence ★, SOP checklist ○, blocker ○, job detail ○ | TODAY list from tasks; START/BLOCKED/COMPLETE; 11-item checklist; 8-reason blocker | Spec §18/§22, D-07 | Medium | 6 files |
| QC / rework | Assignment ★; mechanical + electrical checklists ○; rework ○ | One QC form with PASS/REWORK/FAIL; REWORK task + Snag | Spec §19 | Low | 3–4 files |
| Handover / AMC / compliance | 3 ★ handover screens, warranty ○, compliance ★ | Switch reads; handover gates D-14/D-29; `mvpAmcStatus` | Spec §20–21, §32 | Medium | 5 files |
| Customer portal | Home ○, documents ○, support ○, notifications ○ (all local seed) | Rewire to the Order View, documents, `ServiceCase`, `NotificationRecord` | Spec §14 | Medium | 4 files |
| Role admin | `AdminRoleManagement` (in `RoleSelectionWizard.tsx`) reads **localStorage users**; role audit in localStorage | Thin "Users & roles" list over Firestore `users` + invite list | D-12/D-13 | Medium (rules change) | `RoleSelectionWizard.tsx` |
| Navigation | 140 tabs for the Admin, 5 regex surfaces | `MVP_MODE` filter to about 15 MVP tabs per role | D-22 | Low | `App.tsx:804`, `navigation/surfaces.ts` |

### C. DISABLE (hide behind `MVP_MODE`, keep the code)
| Feature (family) | Current State | MVP Decision | Reason | Risk | Files |
|---|---|---|---|---|---|
| AI / Gemini / bots / auto-negotiation (8 screens) + `/api/gemini/*` | ○/□; Gemini server routes **unauthenticated** (anyone can spend the quota) | DISABLE screens; return 404 on `/api/gemini/*` unless `MVP_MODE` is off | §10/§33 | Low | `ConversationAIBotConfig`, `AutoNegotiationBotConfig`, `GeminiTools`, … `serverApp.ts:69-580` |
| Communication suite (9) | □/○ mock | DISABLE | §25: in-app only | Low | `Comm*`, `WhatsAppBusinessChatConsole`, … |
| Automation / SLA / escalation builders (17) | ○ | DISABLE | No workflow engine (§33) | Low | `WorkflowTriggerBuilderScreen`, … |
| Maps / live tracking / routes / territories (6) | ○ / Leaflet | DISABLE | Not in spec | Low | `LiveMapDashboard`, … |
| Partner recruitment / training / certification (23) | ○ | DISABLE | Admin onboards people manually | Low | `Recruitment*`, `Training*`, … |
| Gamification / commissions / payouts (9) | ○ | DISABLE | §22/§33 | Low | `WorkerPerformanceLeaderboard`, … |
| Advanced finance: loans/NBFC, refunds, reconciliation, invoices, tax, cash flow (12) | ○; GST hard-coded ⚖ | DISABLE | §17: milestones only | Low | `LoanEmiApplication`, `TaxGstComplianceScreen`, … |
| Supplier portal and supplier finance (13) | ○ | DISABLE; the Admin manages suppliers | §24, D-12 | Low | `Supplier*` |
| Advanced quoting / deal closing / e-signature (11) | □ mock | DISABLE | §16 simple quote | Low | `Quotation*`, `Deal*`, `ESignatureCapture` |
| Lead extras (7) | ○ | DISABLE | No scoring (§13) | Low | `LeadScoring`, `LeadMergeResolution`, … |
| Online payment checkout | ★ **simulated gateway** (`setTimeout`, 90% random success) | DISABLE | No real gateway (`integrations/paymentGateway.ts` is `unconfigured`) | Low | `OnlinePaymentCheckout.tsx:197` |
| Self-signup / onboarding / password reset (5) | ○; password and OTP are **client-side fakes** | DISABLE; invited Google sign-in | D-13 | Medium (App.tsx gating) | `*Onboarding`, `CustomerQuickSignup`, `ForgotPasswordReset` |
| Legacy dashboards (`Dashboards.tsx`: Admin, Surveyor, Supplier) | ○ 8,635 lines | DISABLE; replaced by the thin MVP dashboard and home screens | D-06/§9 | Medium: surveyor lead capture lives here until the thin form exists | `Dashboards.tsx` |
| Drizzle/Postgres `/api/db/*` | Unused, unauthenticated | DISABLE the routes (keep the dependencies until Step 11) | Dead and risky | Low | `serverApp.ts:584-646`, `src/db/*` |
| Integrations (payment, ERP, logistics) | `unconfigured` stubs, honest | Keep code; nothing surfaces in the MVP | — | None | `src/integrations/*` |

### D. DELETE (only proven dead)
| Feature | Current State | MVP Decision | Reason | Risk | Files |
|---|---|---|---|---|---|
| Custom Report Builder | 1,008 lines; **no import, no route**; its tab `CustomReport` renders a blank page | DELETE the file; remove the orphan tab id | Proven dead (grep: only `screenRegistry.ts` and the tab list mention it) | None | `components/CustomReportBuilder.tsx`, `App.tsx:879,1068`, `workflows/screenRegistry.ts:343` |
| `TechnicianDashboard`, `CustomerDashboard` exports | Exported from `Dashboards.tsx`, never imported | Step 02 decides: delete the two functions (~300 lines) or leave them hidden | Dead exports inside a live file | Low | `Dashboards.tsx:8267-8564` |
| `bun.lock` | Stale (last touched in phase 17); npm is the chosen manager | DELETE in Step 03 | One lockfile only | None | `bun.lock` |

Nothing else qualifies as proven dead. Every other screen has a route.

### E. BUILD (small, missing)
| Feature | Current State | MVP Decision | Reason | Risk | Files (proposed) |
|---|---|---|---|---|---|
| Task entity + repository | Missing (work items are computed) | BUILD (D-06) | §11 | Low | `domain/entities.ts`, `repository/entities.ts` |
| Blocker entity (8 reasons) | Missing; legacy `TechnicianIssueReport` is local | BUILD (D-07) | §12 | Low | same |
| Rules module | Missing | BUILD `src/mvp/rules.ts`, `config.ts`, `progress.ts`, `health.ts` (pure, with checks) | D-08–D-11 | Low | `src/mvp/*` |
| `AE-####` display code + order status | Missing | BUILD with a transactional counter | D-02/D-05 | Low | repository transaction helper |
| Lead qualification transaction | `createProjectFromLead` is not atomic | BUILD `qualifyLead()` (lead → customer + site + project + first task) | D-04 | Medium | `src/mvp/services/*` |
| Evidence upload | **No Firebase Storage anywhere**; no `storage.rules` | BUILD a Storage transport for `mediaUpload.ts`, plus `storage.rules` | D-16 | Medium: needs the Storage bucket enabled (Owner) | `offline/mediaUpload.ts`, `storage.rules` |
| MVP Admin dashboard | Legacy dashboard is local | BUILD a thin TODAY / NEEDS ATTENTION / PIPELINE view on tasks, projects and leads | §9 | Low | new screen reusing `WorkQueueScreen` parts |
| Owner view + 4 reports | Legacy analytics are local | BUILD thin tables (Recharts is already a dependency) | §27–28 | Low | new |
| Users & roles admin + invites | Admin can't list real users | BUILD a thin list over `users` plus an `invites` doc (email → role, customerId) | D-12/D-13 | Medium (rules) | new |
| Emergency button (D-28) | Legacy local screen | BUILD a thin flow → `ServiceCase` P0 + EMERGENCY_RESPONSE task | D-28 | Low | new |
| Compliance list (D-27) | Legacy local | BUILD on `DocumentRecord` with types and statuses | §32 | Low | reuse `ComplianceCertificationScreen` UI |
| In-app notification list | `NotificationRecord`s written, **no screen reads them** | BUILD a bell/list | §25 | Low | reuse `CustomerNotificationCenterScreen` UI |
| Firestore rules for the MVP | No customer/sales/qc/owner access; self role-claim hole (F-1) | BUILD rules for the new roles, tasks, blockers and invites, plus emulator tests | D-12/D-19 | **High**: needs Owner approval if it widens access | `firestore.rules` |
| `mvp:checks` + emulator rules tests | Missing | BUILD (Step 03) | D-23 | Low | `scripts/mvp-*.ts` |

### F. BROKEN (incomplete or unreliable today)
| # | Feature | Current State | MVP Decision | Reason | Risk | Files |
|---|---|---|---|---|---|---|
| F-1 | **Self-assigned roles** | `users` create rule allows any role except `admin`, with any `status`. A signed-in user can write `role:'surveyor', status:'active'` directly and read **all customers and sites** (`isSurveyor()`) | FIX in Step 03/11: create allowed only as `pending_selection`/`pending`; roles come from Admin or invite | Privilege escalation | **High** | `firestore.rules:47-55` |
| F-2 | Role selection wizard | Writes the chosen role through `updateFirestoreUser`; the rule forbids a self role change, so it **fails silently** (console only). The UI shows the new role until refresh | Replace with Admin assignment or invite (D-13) | People get stuck | High | `RoleSelectionWizard.tsx:219`, `db.ts:1297` |
| F-3 | "Try as Role" on the live login | The demo tab is the **default** auth tab, and its 5 buttons are **not** behind `__DEMO_AUTH_ENABLED__` (only the OTP/password literals are). Demo data stays in memory, but real users see and can pick a fake admin | Hide the demo tab when `isProductionDeploy()`; add to `production-demo-gate:check` | Confusion; exposes all screens | Medium | `App.tsx:134, 1459-1600` |
| F-4 | Live build flag | Live Vercel build likely lacks `VITE_APP_ENV=production` → demo passwords/OTP bypass codes ship, and the environment reads "sandbox" | Owner sets the env var; Step 11 verifies | Fake-login literals in the bundle | High | `vite.config.ts:17`, Vercel settings |
| F-5 | Session restore | `aiec_session_token = session_<id>` in localStorage restores **any** user from the local list with no Firebase check (demo seed admin included) as a non-demo user. Firestore still denies (no `request.auth`), but the UI runs as admin on local seed data | Restore only from `onAuthStateChanged` for real users | Confusing; unverified identity | Medium | `App.tsx:345-374` |
| F-6 | Real users see fake seed data | `DbManager.get*()` returns seeded fake jobs, payments and suppliers to real sessions (only leads are filtered) | Solved by moving MVP screens to canonical and hiding the rest | Wrong decisions on fake data | High | `db.ts` (`getStore(..., initial*)`) |
| F-7 | ★ bridge writes | Soft-fail, need the legacy Deal in the same browser; placeholder payment schedule; quote auto-approved and sent in one step | Don't build MVP flows on the bridges; call the services directly | Silent data gaps | Medium | `legacyCommercialBridge.ts` |
| F-8 | Non-admin queries | `list()`/`subscribe()` on whole collections are denied for non-admins by rules | MVP queries filter by assignee or participant fields | Screens empty for field staff | High | `repository/firestoreRepository.ts`, `workQueue.ts` |
| F-9 | Evidence upload | `FirebaseStorageTransport` throws; lead photos stored as base64 inside the Firestore doc (1 MB limit) | Build Storage (E) | Lost photos, write failures | High | `offline/mediaUpload.ts`, `types.ts:Lead.site_photos` |
| F-10 | Online payment | Simulated with random success | Hide (C); manual recording | Fake "paid" | High if left visible | `OnlinePaymentCheckout.tsx:197` |
| F-11 | Hard-coded tax ⚖ | GST 18% literal in 26 components (e.g. `QuotePricing.tsx:196` `* 0.18`) | Config value + "tax rate not confirmed" warning (D-15) | Wrong invoices | Medium | 26 files (all hidden or rewired) |
| F-12 | Unauthenticated server routes | `/api/gemini/*` (quota spend), `/api/db/*` (IDOR by `userId`) | Disable in `MVP_MODE` (C) | Cost / data exposure if SQL configured | Medium | `serverApp.ts` |
| F-13 | Orphan tab | `CustomReport` tab renders nothing | Remove (D) | Cosmetic | Low | `App.tsx:879` |
| F-14 | Non-atomic conversion | Customer, site and project are written separately | Transaction (E) | Half-created orders | Medium | `repository/entities.ts:64` |
| F-15 | Contract signing | `signContract()` exists but no UI calls it | The MVP treats the agreement as a D-27 document; no e-sign | — | Low | `commercialWorkflow.ts:164` |

### 4.7 All 194 screens
Counts (my own grep, see Appendix A): **◆ 2 · ★ 16 · ○ 137 (126 call `DbManager.` directly + 11 use localStorage only) · □ 39**. In total 142 screens call `DbManager.` (126 ○ + the 16 ★, which still read legacy).
Decision totals: **KEEP 8 · SIMPLIFY 35 · DISABLE 150 · DELETE 1 · BUILD ~10 new thin screens · BROKEN: see F-1–F-15** (broken items are also classified under one of the other decisions).

| Decision | # | Screens (mark, lines) |
|---|---|---|
| **KEEP** | 8 | ProjectOperatingView ◆195 · WorkQueueScreen ◆102 · OperatingSurfacesHome □97 · CommandPalette □232 · EnvironmentBadge □35 · Common □248 · CameraCapture □322 · PermissionsPrimer ○653 (keep; drop its `DbManager.updateUser` flag write) |
| **SIMPLIFY: leads/survey** | 5 | LeadDetail ★1211 · LeadKanban ★1113 · LeadInbox ○1646 (reuse inputs only) · LeadFollowUpScheduler ○1653 (thin list) · SiteVisitVerification ○790 (thin survey form) |
| **SIMPLIFY: quote/payment** | 5 | QuotePricing ○549 · QuotationPreview □622 · DiscountApprovalWorkflow □761 · PaymentCollectionDashboard ★1103 · CustomerPaymentInstallmentsScreen ○353 |
| **SIMPLIFY: supply/delivery** | 6 | PurchaseOrderGenerator ★734 · SupplierOrderStatusTracking ★524 · SiteDeliveryChecklistScreen ★623 · DeliverySchedulingScreen ★934 · SupplierDirectory ○774 · MaterialReceivedConfirmationScreen ○613 |
| **SIMPLIFY: technician** | 6 | TechnicianHomeMyJobsScreen ○408 · TechnicianCheckInCheckOutScreen ★311 · PhotoVideoEvidenceCaptureScreen ★391 · InstallationSopChecklistScreen ○406 · IssueBlockerReportingScreen ○441 · JobDetailSiteInfoScreen ○426 |
| **SIMPLIFY: QC/handover/AMC/compliance** | 8 | QcInspectorAssignmentScreen ★610 · QualityChecklistMechanicalScreen ○609 · ReworkAssignmentScreen ○646 · FinalHandoverChecklistScreen ★578 · HandoverCompletionCertificateScreen ★542 · CustomerHandoverWalkthroughScreen ★666 · WarrantyAmcRegistrationScreen ○676 · ComplianceCertificationScreen ★515 |
| **SIMPLIFY: customer/admin** | 5 | CustomerHomeDashboardScreen ○375 · CustomerDocumentVaultScreen ○268 · CustomerSupportTicketScreen ○495 · CustomerNotificationCenterScreen ○389 · RoleSelectionWizard ○1536 (keep `AdminRoleManagement` UI; replace self-selection) |
| **DISABLE: replaced by thin MVP screens** | 13 | Dashboards ○8635 · PricingRulesMarginConfig □534 · PaymentStageScheduleSetup ○1303 · OnlinePaymentCheckout ★662 · LiveShipmentTrackingScreen ★430 · QualityChecklistElectricalScreen ○692 · DefectSnagListScreen ○518 · EmergencyEscalationAlert ○1135 (reuse its UI parts) · ProjectStatusTrackerScreen ○351 · InstallationProgressTimelineScreen ○260 · RevenueProfitAnalytics ○1398 · SalesFunnelAnalytics ○1031 (reuse chart parts) · UserRolePermissionManagementScreen ○591 |
| **DISABLE: self-signup / fake password** | 5 | SurveyorOnboarding · TechnicianOnboarding · SupplierOnboarding · CustomerQuickSignup · ForgotPasswordReset |
| **DISABLE: AI / bots / negotiation** | 8 | AutoNegotiationBotConfig · ConversationAIBotConfig · GeminiTools · LiveNegotiationThread · CounterOfferApproval · CustomerObjectionHandling · CompetitorBattlecard · SystemHealthBotMonitoringScreen |
| **DISABLE: advanced quoting / deal / e-sign** | 11 | QuotationInputSpecs · QuotationSendEDelivery · QuotationTemplateBranding · QuotationVersionHistory · QuotationAnalyticsWinLoss · MultiOptionComparison · DealClosureConfirmation · DealTermsFinalization · DealWonCelebration · DigitalContractGenerator · ESignatureCapture |
| **DISABLE: lead extras** | 7 | LeadAssignment · LeadScoring · LeadMergeResolution · LeadSourceAttribution · LeadDensityHeatmap · LostLeadDisqualification · BulkLeadImportExport |
| **DISABLE: communication suite** | 9 | AutomatedSequenceBuilder · CallLogAutoDialer · CommAnalytics · CommComplianceManager · CommunicationTemplatesLibrary · CustomerReplyInbox · FollowUpStageRules · SMSBroadcastDeliveryReport · WhatsAppBusinessChatConsole |
| **DISABLE: automation / SLA / escalation / monitoring** | 17 | AlertsExceptionsDashboard · AuditLogAutomatedActionsScreen · AutoPoTriggerRules · AutomatedPayoutDisbursementScreen · AutomationHealthMonitor · AutomationTestingSandboxScreen · DeliveryDelayAlertEscalationScreen · EscalationMatrixConfigScreen · LiveActivityFeed · ManualOverrideConsoleScreen · MasterAutomationRulesDashboardScreen · NotificationTemplatesChannelsScreen · OverduePaymentEscalation · SinglePersonMonitorControlPanelScreen · SlaTimerBreachAlertScreen · SupplierContractSla · WorkflowTriggerBuilderScreen |
| **DISABLE: maps / tracking** | 6 | LiveMapDashboard · MapFiltersLayersControlPanel · GeofenceTerritoryManagement · RouteOptimizationSuggestion · SurveyorLiveTrackingDetailView · TechnicianLiveTrackingDetailView |
| **DISABLE: partner lifecycle / training** | 23 | RecruitmentLandingScreen · ApplicantDataCollectionScreen · ApplicantScreeningScreen · InterviewSchedulingScreen · BackgroundVerificationScreen · OfferOnboardingAgreementScreen · PartnerDirectoryScreen · PartnerTierCategoryAssignmentScreen · PartnerDeactivationExitScreen · NewPartnerAggregationDashboardScreen · DeliveryPartnerManagementScreen · LoanPartnerIntegration · TrainingModuleLibraryScreen · VideoInteractiveLessonPlayerScreen · QuizCertificationTestScreen · CertificationBadgeProgressScreen · TrainingFeedbackScreen · TrainingComplianceTrackerScreen · SkillMatrixGapAnalysisScreen · SopDocumentRepositoryScreen · NewSopRolloutNotificationScreen · DeliverySopConfigScreen · TechnicianTeamCoordinationScreen |
| **DISABLE: gamification / commission / payout** | 9 | BadgesMilestonesScreen · RewardsLeaderboardScreen · WorkerPerformanceLeaderboard · ContestConfigurationScreen · CommissionRulesEngineScreen · PayoutApprovalQueueScreen · PayoutDisputeQueryScreen · PayoutHistoryStatementsScreen · StageWisePayoutTrackerScreen |
| **DISABLE: advanced finance / tax** | 12 | AdvancePaymentRetentionScreen · AutoReconciliationScreen · ConversionRateAnalytics · FinancialCashFlowReceivables · InvoiceGenerator · LoanEmiApplication · MilestonePaymentReleaseScreen · PaymentReceiptHistory · PaymentReminderConfig · RefundDisputeManagement · TaxDeductionStatementScreen · TaxGstComplianceScreen |
| **DISABLE: supplier portal / supplier finance** | 13 | ManufacturerProductionStatus · StockInTransitScreen · SupplierCatalogPricing · SupplierCommunicationThreads · SupplierDisputeResolutionScreen · SupplierInvoiceMatchingScreen · SupplierPaymentAnalyticsScreen · SupplierPaymentApprovalScreen · SupplierPaymentHistoryScreen · SupplierPaymentScheduleScreen · SupplierPaymentTermsConfigScreen · SupplierPerformanceScorecard · SupplierRatingScorecard |
| **DISABLE: delivery extras** | 2 | DamagedMissingPartsReportScreen · DeliveryAnalyticsScreen |
| **DISABLE: customer extras** | 4 | CustomerAmcBookingScreen · CustomerFeedbackRatingScreen · CustomerLiveSupportChatScreen · CustomerReferralProgramScreen |
| **DISABLE: platform admin** | 11 | ApiIntegrationManagementScreen · AppVersionChangelogFeedbackScreen · BackupDataExportScreen · CompanyProfileBrandingSettingsScreen · DataPrivacyConsentManagementScreen · HelpFaqSupportScreen · LegalContractTemplatesRepositoryScreen · MaterialUsageLoggingScreen · SaaSOpsSubscriptionBillingScreen · SafetyComplianceChecklistScreen · SecuritySessionManagementScreen |
| **DELETE** | 1 | CustomReportBuilder □1008 (dead) |
| **Total** | **194** | 8 + 35 + 150 + 1 |

---

## 5. Mapping to the MVP spec (§7–§32)

| Spec § | What exists | What gets reused | Gap |
|---|---|---|---|
| §7 Ten stages | 15 `ProjectStage` values | Stage field, `advanceProjectStage` (audited) | Add `survey`, `site_ready`; `toMvpStage()` (D-03) |
| §8 Order view | ◆ Order View service and screen | All of it | Display code, progress, health, current task/owner/due, payments ₹ x / y |
| §9 Admin dashboard | Legacy local dashboard; ◆ control tower/work queue | controlTower categories, WorkQueue UI | Thin TODAY / NEEDS ATTENTION / PIPELINE on tasks |
| §10 Rule automation | Event bus with 2 handlers (QUOTE_ACCEPTED → contract, QC_FAILED → snag) | Snag handler, audit | `src/mvp/rules.ts` (D-08) |
| §11 Task | None persisted | `WorkQueueItem` shape | Task entity, repository, rules |
| §12 Blockers | Computed strings; legacy `TechnicianIssueReport` local | IssueBlockerReporting UI | Blocker entity, 8 reasons |
| §13 Leads | Firestore `leads` (legacy shape), 12 screens | Lead store, LeadDetail/Kanban parts | Spec fields (`site_type`, `construction_stage`, `next_followup`, consent), `sales` role, qualification |
| §14 Customer | Local-seed portal screens; `portalWorkSummary` ◆ unused | portalWorkSummary, customer UI | Customer↔uid link, rules, rewire |
| §15 Survey | Inside SurveyorDashboard (local); `SiteVisitVerification` local | CameraCapture, inputs | Thin form; result FEASIBLE / REQUIRES_CORRECTION / NOT_FEASIBLE |
| §16 Quote | ◆ Quote/QuoteVersion + approve/send/decision; □ pricing UI (GST hard-coded) | Services, pricing UI | Cost, tax and margin fields; config; ApprovalRequest repository |
| §17 Payments | ◆ PaymentSchedule/Payment (idempotent); gateway simulated | `collectInstallment`, idempotency | D-14 milestones and statuses; proof → verify |
| §18 Installation | ◆ InstallationJob with hard gates; SOP checklist local | Job and gates | 11-item checklist with photo, note, by, time |
| §19 QC | ◆ QCInspection pass/fail + Snag + rework loop (tested) | All | REWORK vs FAIL split; REWORK task |
| §20 Handover | ◆ Handover gates + certificate + warranty | All | Final-payment and licence gates (D-14/D-29); set COMPLETED |
| §21 AMC | Warranty ◆; AMC entity with no repository; legacy local screens | Warranty | AMC repository, `mvpAmcStatus`, AMC_FOLLOW_UP |
| §22 Technician app | Local seed jobs | Check-in/evidence UI | TODAY from tasks; START/BLOCKED/COMPLETE |
| §23 Sales/rider | Surveyor capture (Firestore leads) | Lead store and UI | `sales` role and rules |
| §24 Supplier | ◆ PurchaseOrder + payment gate; local supplier list | PO services | Supplier repository, expected date, delay |
| §25 Notifications | ◆ `notificationService` (in-app real; email/WA/SMS `queued`, not sent); no UI reads | Service and records | Hook to rules; a list/bell |
| §26 Roles | 5 roles; `qc_inspector` only in rules | authz/permissions | owner, sales, qc (D-12); admin assignment |
| §27 Owner view | Local analytics | Recharts | Thin read-only view |
| §28 Reporting | Local analytics | Chart parts | 4 thin tables |
| §29 Mobile-first | Responsive PWA, bottom nav | Layout | Keep field screens short |
| §30 Languages | en/mr/hi exist | `language.ts`, `appTranslations` | Field-screen keys; decouple DbManager |
| §31 Security | Google auth, rules, audit, idempotency | All | F-1, F-3, F-4, F-5, F-8, F-12; Storage rules; backups (Owner) |
| §32 Compliance ⚖ | Legacy local compliance screens; `DocumentRecord` ◆ | DocumentRecord, compliance UI | D-27 list |

---

## 6. Recommended changes to DECISIONS.md
(Proposals only. Nothing is changed until the Owner approves.)

| # | Decision | Proposed change | Reason |
|---|---|---|---|
| R-1 | D-04 Lead | The MVP lead store is the **existing Firestore `leads` collection**, with the legacy `Lead` shape extended additively (spec §13 fields plus `projectId`, `ownerUserId`). Don't create a separate `CanonicalLead` collection; align `CanonicalLead` to it with an adapter | `leads` is the only shared data that real users have already created. A second lead store would split it |
| R-2 | D-12 Roles | The rules currently use `qc_inspector` as a technician alias. Map it to the new `qc` role and keep `qc_inspector` valid (additive) | Keeps any existing user docs valid |
| R-3 | D-13 Logins | Google sign-in only for the pilot. **Remove email/password and phone OTP from the MVP login**: they are client-side fakes today (`authMethod: 'password_unverified' / 'otp_unverified'`), and there is no working fallback. Access is by an **Admin invite list** (email → role, plus customerId) | "Email/password if it already works": it doesn't |
| R-4 | D-14 Payments | Confirmed: hide the gateway. `paymentGateway.ts` is `unconfigured` and checkout is simulated | Code evidence |
| R-5 | D-20 Demo | Hide the "Try as Role" tab in any `VITE_APP_ENV=production` build, and assert that in `production-demo-gate:check` | The buttons are not build-gated today (F-3) |
| R-6 | D-06/D-11 queries | Add: "MVP reads filter by the field the rule checks (assignee/participant); never whole-collection lists for non-admins" | Rules are not filters (F-8) |
| R-7 | D-02 | The repository gets a minimal `runTransaction` helper (Firestore + demo). It's needed for the counter and the D-04 conversion | Not there today |
| R-8 | D-22 | `MVP_MODE` also switches off `/api/gemini/*` and `/api/db/*` on the server | Unauthenticated routes (F-12) |

---

## 7. Risks (ranked)

| # | Risk | Likelihood / Impact | Mitigation |
|---|---|---|---|
| 1 | Firestore rules changes (new roles, customer access, tasks) open data too widely or lock people out | High / High | Emulator rules tests for every role before merge (D-19); the Owner approves any widening; F-1 is fixed first |
| 2 | Pilot staff use legacy screens and data stays in one browser | High / High | `MVP_MODE` on by default; hide every ○ screen; an environment badge on every screen |
| 3 | Live build ships demo bypasses / fake admin (F-3, F-4) | Medium / High | Owner sets `VITE_APP_ENV=production` in Vercel; Step 11 verifies with `production-bundle-bypass:check` and a live bundle grep (human-run) |
| 4 | Only one Firebase project, so a mistake writes real data | Medium / High | Automated checks run only against the emulator or demo; `live-*` stays human-run; recommend a second project for staging (Owner decision) |
| 5 | Evidence upload needs Firebase Storage, which may not be enabled or billed | Medium / Medium | Owner confirms the bucket in §8; images ≤10 MB, compressed; outbox retry |
| 6 | Scope creep from reusing 1,000+ line legacy screens | Medium / Medium | Size rule: a thin screen of ≤250 lines when the legacy screen is >600 lines; the 25-file cap per step |
| 7 | Existing real data in `leads`/`users` has a shape the MVP doesn't expect | Medium / Medium | Additive fields, adapters with defaults, dry-run backfill scripts (Step 03) |
| 8 | Hard-coded tax or legal wording reaches customers | Medium / Medium | Config plus "tax rate not confirmed" banner; ⚖ markers; legacy tax screens hidden |
| 9 | Non-atomic writes leave half-created orders | Low / Medium | Transaction helper (R-7) |
| 10 | Bundle size (large-bundle warning today) slows phones | Medium / Low | Keep hidden screens lazy (`code-splitting:check`) |

---

## 8. Questions for the Owner (my recommended default in **bold**)

1. **Logins (D-13).** How will staff and customers log in? **Google sign-in only; the Admin pre-registers each person's email and role (invite list). No self-signup, no password/OTP for the pilot.**
2. **Pilot deployment (D-21).** Vercel (`v3-200-ai-studio.vercel.app`, live) or AI Studio/Cloud Run? **Vercel**, with `VITE_APP_ENV=production` set in the Vercel project settings.
3. **Firebase access.** Do you have full admin access to `dogwood-torus-v71nt` (console, billing, backups, rules deploy, Storage)? If not, who does? **Default: assume you do; you'll enable Storage and daily Firestore backups (PITR/export) before the first real lift.**
4. **Existing real data.** Is any real customer data already in Firestore (`leads`, `users`) or in browsers? **Assume Firestore `leads`/`users` may hold real records and treat them as production (no deletes, additive changes only). Assume browser (localStorage) data is test data and won't be migrated.**
5. **Payment gateway.** Confirmed from the code: the gateway is **not real** (simulated). **Record payments manually (UPI/NEFT reference + screenshot, Admin verifies).** Okay?
6. **Survey fee (D-30).** Amount, or 0 for off? **0 (off).**
7. **Emergency (D-28).** The emergency phone number, and who is on call for the first lifts? **Default: your mobile number as the emergency number and yourself as the Admin fallback until a technician is named. Please give the number.**
8. **Statutory licence (D-29).** Who handles the lift licence and inspection, and how long does it usually take? **Default: the Admin handles it with a 30-day task ⚖ VERIFY with your lift inspector or consultant.**
9. **GST rate ⚖.** Who confirms the tax rate for your quotes (your CA)? **Until confirmed, quotes show "tax rate not confirmed".**
10. **Staging project.** Can we create a second Firebase project for staging? **Recommended, but not blocking: without it, pilot testing is done only in the emulator and demo mode.**

---

## 9. Proposed MVP end-to-end workflow (for the Plan)

| Stage | Screen | Role | Store |
|---|---|---|---|
| LEAD | New Lead (thin; reuses LeadInbox inputs), My Leads | sales / admin | Firestore `leads` (R-1) + `tasks` |
| QUALIFIED | Lead detail → Qualify (one transaction) | sales / admin | `customers`, `sites`, `projects` (AE-####), `tasks` |
| SURVEY | Assign surveyor (Admin) → Survey form (thin) | admin → surveyor | `projects`, `tasks`, `documents` (photos) |
| QUOTE | Quote builder (QuotePricing, rewired) → margin approval → customer quote view | admin → customer | `quotes`, `quote_versions`, approval request (new repository) |
| BOOKED | Customer accepts → token milestone panel | customer → admin | `quotes`, `payment_schedules`, `payments` |
| SITE_READY | Readiness checklist + photos (SiteDeliveryChecklist UI) → Admin verifies; PO raised | customer → admin | `tasks`, `documents`, `purchase_orders` |
| DELIVERY | PO status / expected date / delay (SupplierOrderStatusTracking) → material received | admin | `purchase_orders`, `shipments`, `delivery_receipts` |
| INSTALLATION | Technician TODAY → START (gate) → 11-item checklist + photos → blocker | technician | `installation_jobs`, `tasks`, `blockers`, `documents` |
| QC_HANDOVER | QC form PASS/REWORK/FAIL → rework → handover checklist + customer approval + licence | qc → technician → customer/admin | `qc_inspections`, `snags`, `handovers`, `documents` |
| AMC | Warranty + AMC status + emergency button | admin / customer | `warranties`, AMC repository, service cases |
| (all) | Order View, Admin dashboard, Owner view | admin / owner | read models over the above |

---

## 10. Corrections to REPO_FACTS.md and REUSE_MAP.md

**REPO_FACTS.md (recorded here; the file is left as the pre-inspection snapshot):**
- §1 Drizzle/Postgres: **not used at runtime by any screen.** It's only 3 unauthenticated `/api/db/*` routes that need `SQL_HOST`.
- §1 Gemini: used only by 3 hidden-to-be screens (GeminiTools, ConversationAIBotConfig, Dashboards OCR/geocode) through unauthenticated server routes.
- §1 Auth: also client-only "password" and "OTP" logins (fake), and a localStorage session token that restores any local user (F-5). "Try as Role" is **not** build-gated; only the bypass literals are.
- §2: **142** screens call `DbManager.` directly (126 legacy-only ○ + the 16 ★ bridged ones); another 11 use localStorage without DbManager, so 137 are ○. REPO_FACTS' "~128" is close to the 126 legacy-only figure. **Leads and users are Firestore-backed for real sessions**, so lead screens are shared for leads (not for deals).
- §2: "Dual-write bridges exist for 16 files" is correct (16 screens import `legacyCommercialBridge`), but the writes are **soft-fail shadows** that need the legacy Deal in the same browser.
- §3: `ApprovalRequest`, `Invoice`, `Supplier`, `ProductionOrder`, `AMC`, `ServiceCase` and `CanonicalLead` have **no repository and are never written**.
- §4: `portalWorkSummary` is canonical but **no screen uses it**. `notificationService.sendNotification` is **not called by any screen**.
- §5: The live Vercel project `v3-200-ai-studio` exists (verified); its env vars can't be read with the current connector (403).
- Also: Firebase Storage is **not used anywhere**; there is no `storage.rules`.

**REUSE_MAP.md:** corrected in place (see the "Step 01 verification" notes in that file). Summary:
- Legend: ★ writes are best-effort shadow writes. The effort is "switch reads **and** replace the bridge call with a direct service call", not "very cheap".
- Added mark ◐ = legacy API but Firestore-backed (leads/users).
- `LeadInbox` and `LeadFollowUpScheduler` ○ → ◐. `firestoreLeads.ts` ? → ◐ (real, shared, legacy shape; reuse as the lead store).
- `QuotePricing` □ → ○ (localStorage spec; hard-coded GST ⚖). `QuotationPreview`, `DiscountApprovalWorkflow` and `PricingRulesMarginConfig` are □ with hard-coded mock arrays.
- `CustomerHomeDashboardScreen` and `CustomerDocumentVaultScreen` ◆/○ mixed → ○ (neither imports a canonical service).
- `OnlinePaymentCheckout`: gateway simulated → hide.
- `offline/mediaUpload.ts`: ◆ queue, but **no storage transport**.
- `lib/language.ts`: its only DbManager use is saving the language preference.
- Step 12: `full-company-simulation` drives the **bridge service functions**, not the screens.

---

## Appendix A: how the counts were produced
- Screen metrics: for each `src/components/*.tsx`, count `DbManager\.`, `legacyCommercialBridge`, canonical `repository/`/`services/` imports, `localStorage`, and importers. Mark: ◆ if canonical import and no DbManager; ★ if bridge import; ○ if DbManager or localStorage; □ otherwise.
- Tabs vs routes: `getTabsByRole` ids (140) vs `activeTab === '…'` ids in `App.tsx`/`routers`/`components` (314). Only `CustomReport` has no route.
- Check coverage: see §11.

## 11. Tests: which checks cover kept code
| Check | Covers | MVP keeps it? |
|---|---|---|
| domain, repository, authz, audit, transactional-idempotency, security-hardening | backbone | **mvp-relevant, keep in `checks`** |
| commercial, operations, e2e, hard-gate-attack | canonical services | **keep** |
| project-operating-view, work-queue, controltower, reliability (notifications), offline, data-quality-phase26 | Order View, queue, notifications, outbox | **keep; extend** |
| production-demo-gate, production-bundle-bypass, code-splitting, destructive-action-safety | build safety | **keep** |
| workflow:validate, eventbus | definitions + bus (used by the services) | keep |
| surfaces, operating-surfaces-home, navigation-cutover, global-search | navigation | keep (update for `MVP_MODE`) |
| bridge, procurement-bridge, delivery-bridge, installation-qc-handover-bridge, portal-summary, dual-write-*, legacy-read-migration, legacy-write-reduction, legacy-database-elimination, dbmanager-remaining, legacy-authz-remediation, migration, final-company-simulation-multi, simulation:full-company | legacy bridges / migration telemetry | → `checks:legacy` (D-23). `simulation:full-company` is adapted in Step 12 for S1/S4 |
| integration-boundaries | stub providers | keep (cheap) |
| live-* (4) | real project | human-only (D-19) |
