# MVP SIMPLIFICATION AUDIT (Step 01, Phase A)

> **Status:** awaiting Owner approval.
> **Taken on:** 2026-10-16, at `main` `c34e8d0`. Read-only on application code.
> **Method:** every claim below comes from reading the code or running a scan. Numbers marked *(scan)* come from a script that checked each of the 194 files in `src/components/` for:
> - `DbManager.` calls
> - canonical repository and service imports
> - `legacyCommercialBridge` imports
> - whether a router mounts the screen

---

## 1. Executive summary (for the Owner)
1. **The app looks finished, but most of it can't run a real order yet.** 142 of its 194 screens keep their data only in the browser they run in. When the Admin types something, the technician and the customer never see it.
2. **A solid shared core already exists.** It has:
   - the order (called "Project" in code), customer, site, quote, payment, purchase order, delivery, installation, QC and handover records
   - an audit log
   - protection against double-clicks (idempotency)
   - role permissions

   Only 3 screens read from it today. **The MVP is mostly rewiring, not rebuilding.**
3. **16 screens are halfway there.** They already save to the shared store but still read from the browser. They are cheap to finish.
4. **Three things that real use needs are broken or missing:**
   - **Roles for new staff are saved only on their own phone.** A new user who picks a role during sign-up keeps it only in that browser, so the shared database never learns it.
   - **There is no shared photo storage.** Evidence photos have nowhere shared to live, because Firebase Storage is not wired anywhere.
   - **Phone OTP login is simulated.** In a production build it can never succeed. Google sign-in is the only login that really works.
5. **Payment gateway, logistics, accounting, WhatsApp and SMS are not connected.** They are empty stubs or click-to-chat links, so payments will be recorded by hand, which matches D-14.
6. **AI parts (Gemini) work only if an API key is set.** They are all on the Phase 1 "do not build" list and will be hidden.
7. **Recommendation:**
   - keep 8 screens
   - simplify 46
   - hide 139 behind `MVP_MODE`
   - delete only 1 (proven unused)
   - build the missing tasks, blockers, MVP stages, photo storage, the role invite flow and the rules
8. **The biggest risk is data safety.** There is one Firebase project for both testing and real use, and the security rules have two gaps (§7). Both must be fixed before a real customer is invited.

## 2. Current architecture
```
 Browser (React 19 + Vite PWA, src/App.tsx 2,556 lines, 6 role routers, 194 screens)
   │
   ├── Login: Google popup (real) ─┐   OTP / email-password (simulated, demo builds only)
   │                               │   "Try as Role" (demo, in-memory)
   │                               ▼
   │   ┌──────────── RepositoryContext {environment: demo | sandbox | production}
   │   │
   │   ├── LEGACY  DbManager (src/lib/db.ts, 11,703 lines)
   │   │      └─ browser localStorage "aiec_*"   ← 142 screens read/write here (scan)
   │   │      └─ exception: `leads` sync to Firestore for real sessions (firestoreLeads.ts)
   │   │
   │   ├── BRIDGE  services/legacyCommercialBridge.ts (13 bridge functions)
   │   │      └─ 16 screens write legacy AND canonical
   │   │
   │   └── CANONICAL  services/* → repository/* → Firestore named DB
   │          (demo env → in-memory Map instead)
   │          used by ProjectOperatingView, WorkQueueScreen, PaymentCollectionDashboard
   │
   └── fetch('/api/…') ──► Express app (src/serverApp.ts)
                              ├─ /api/gemini/* (4 routes, Gemini if GEMINI_API_KEY, else demo text)
                              ├─ /api/maps/*, /api/config/maps-key
                              └─ /api/db/* (Drizzle → Cloud SQL Postgres; not called by any screen)
 Deploy: vercel.json (api/index.ts serverless) OR server.ts on port 3000 (AI Studio / Cloud Run)
 Firebase project: dogwood-torus-v71nt (one project for sandbox AND production)
```
- **Client shell:** `App.tsx` holds login, the splash screen and onboarding wizards, and keeps a hand-written tab list per role (`getTabsByRole`). Each role router lazy-loads its screens. Navigation is grouped into five "surfaces" (`navigation/surfaces.ts`).
- **Server:** one Express app runs both on Vercel and on `server.ts`. **No route verifies who is calling** (there is no `firebase-admin`), so the server must never hold business data for the MVP.

## 3. The data-layer truth
| Store | Shared between users? | Who uses it today |
|---|---|---|
| Canonical Firestore collections (`projects`, `customers`, `sites`, `quotes`, `quote_versions`, `contracts_v2`, `payment_schedules`, `payments`, `purchase_orders`, `shipments`, `delivery_receipts`, `installation_jobs`, `qc_inspections`, `snags`, `handovers`, `warranties`, `documents`, `notifications`, `audit_logs`, `idempotency_keys`, `workflow_*`, `reconciliation_records`, `observability_events`) | **Yes** (real sign-ins) | 10 services, 3 screens, 16 bridged screens (write only) |
| Firestore `leads` (legacy `Lead` shape) | **Yes** (real sign-ins) | `DbManager` lead APIs, through `firestoreLeads.ts` |
| Firestore `users` | **Yes** | Login (`firestoreUsers.ts`) |
| `DbManager` / localStorage | **No, this browser only** | 142 screens: jobs, checklists, QC forms, payments schedule, suppliers, customer portal, reports, settings… |
| In-memory demo repository | No, this tab only | "Try as Role" sessions |
| Cloud SQL Postgres (Drizzle) | Would be | **Nothing in the UI.** Only `/api/db/*`, which no screen calls |
| Firebase Storage | — | **Not wired at all.** `mediaUpload.ts` has a transport that throws "not configured" |

**For each MVP function, is it shared today?**

| MVP function | Shared today? |
|---|---|
| Leads | **Yes** (legacy shape) |
| Order, customer, site | **Yes**, but only created through bridges |
| Quote, payment, PO, delivery, installation, QC, handover records | **Write yes, read no** (bridged screens read localStorage) |
| Tasks, blockers, surveys, installation checklist items, QC checklist, AMC, customer portal, supplier list, reports | **No** |
| Photos and evidence | **No** (no storage) |

**Canonical entities defined but never stored:** `CanonicalLead`, `CanonicalUser`, `Invoice`, `Supplier`, `ProductionOrder`, `AMC`, `ServiceCase`, `ApprovalRequest`. Most have no repository and no Firestore rule.

## 4. Findings by decision
Columns: `Feature | Current State | MVP Decision | Reason | Risk | Files`.

### A. KEEP
| Feature | Current State | MVP Decision | Reason | Risk | Files |
|---|---|---|---|---|---|
| Canonical entities and branded IDs | 30 entities, used by services | Keep; extend additively (Task, Blocker, stages, roles, fields) | Already the right model (spec §34) | Low | `src/domain/entities.ts`, `ids.ts` |
| Repository layer with demo/Firestore switch | Works; demo is in-memory, sandbox/production use Firestore | Keep; harden (see F-4) | D-01 store of record | Medium (F-4) | `src/repository/*` |
| Audit log | `recordAuditEvent` → `audit_logs`, immutable by rules | Keep as-is | Spec §31 | Low | `src/lib/audit.ts` |
| Idempotency | Real Firestore `runTransaction` claim/complete | Keep as-is | Duplicate-task and double-payment safety | Low | `src/lib/idempotency.ts` |
| Permissions and `assertPermission` | 19 permissions, 5 roles, high-risk gate needs Google identity | Keep; add owner, sales, qc | D-12 | Low | `src/domain/permissions.ts`, `src/lib/authz.ts` |
| Commercial workflow | create/approve/send quote, sign contract, installments, PO with a payment-first **hard gate** | Keep; reuse functions in the D-08 rules | 70% of spec §16–17 | Low | `src/services/commercialWorkflow.ts` |
| Operations workflow | delivery, receipt, install, check-in, evidence count, QC pass/fail, snag rework, handover, certificate, warranty | Keep; reuse | 70% of spec §18–20 | Low | `src/services/operationsWorkflow.ts` |
| Order View + Work Queue | Canonical; stage timeline, next action, blockers, money, audit | Keep and extend (Step 04) | REUSE_MAP ◆ | Low | `ProjectOperatingView.tsx`, `projectOperatingView.ts`, `WorkQueueScreen.tsx`, `workQueue.ts`, `controlTower.ts` |
| Workflow state machines | 7 definitions + validator | Keep as reference; don't add an engine | D-08 says no engine | Low | `src/workflows/definitions/*` |
| Demo-credential build guard | Bypass literals stripped from production bundles; checked by a build-and-grep script | Keep | D-20 | Low | `src/lib/demoCredentials.ts`, `scripts/production-bundle-bypass-check.ts` |
| Offline outbox | Queue/retry logic works with injected transports | Keep; give it a real Storage transport | D-16 | Medium | `src/offline/*` |
| Notification service | In-app delivered; other channels report "unconfigured" | Keep in-app only | D-17 | Low | `src/services/notificationService.ts` |
| Languages en/mr/hi | `translations` object + `useLanguage` | Keep; decouple from `DbManager.updateUser` | D-18 | Low | `src/lib/language.ts` |
| Shared UI (Card, Button, palette, env badge, camera) | Used everywhere | Keep | — | Low | `Common.tsx`, `CommandPalette.tsx`, `EnvironmentBadge.tsx`, `CameraCapture.tsx` |
| Google sign-in + `users/{uid}` profile | Real; owner email gets admin | Keep as the only real login (D-13) | Only verified identity in the app | Medium (F-1, §7) | `src/App.tsx` (`handleGoogleSignIn`), `src/lib/firestoreUsers.ts` |

### B. SIMPLIFY
| Feature | Current State | MVP Decision | Reason | Risk | Files |
|---|---|---|---|---|---|
| 16 bridged screens (★) | Write canonical through bridges; read localStorage | Switch reads to canonical, trim to spec fields; drop the bridge once reads are canonical | Cheapest path to shared data | Medium: legacy IDs vs canonical IDs (`ensureCanonicalProject`) | see §9 table, `src/services/legacyCommercialBridge.ts` |
| Lead capture, follow-ups | `LeadInbox` 1,646 lines, `LeadFollowUpScheduler` 1,653 lines, both legacy | Thin new form and list (≤250 lines each) on the shared `leads` collection | Size rule | Low | `LeadInbox.tsx`, `LeadFollowUpScheduler.tsx`, `src/lib/firestoreLeads.ts` |
| Survey form | `SiteVisitVerification` (790 lines, 11 `DbManager` calls) | Thin form with the §15 fields, writing canonical | Spec §15 | Low | `SiteVisitVerification.tsx` |
| Quote builder + preview | UI only; `QuotePricing` keeps state in localStorage key `aiec_active_quote_spec` | Wire to `commercialWorkflow.createQuote`, add cost/markup (D-15), strip cost from the customer view | Spec §16 | Medium: tax rate ⚖ VERIFY | `QuotePricing.tsx`, `QuotationPreview.tsx`, `DiscountApprovalWorkflow.tsx` |
| Payment milestones | `PaymentStageScheduleSetup` 1,303 lines, legacy | Thin milestone panel on the Order View using `PaymentSchedule`/`Payment` | D-14 | Low | `PaymentStageScheduleSetup.tsx`, `PaymentCollectionDashboard.tsx` |
| Technician app | Home/jobs, checklist, blocker screens are legacy; check-in/evidence bridged | Rewire to Task + checklist + Blocker; START/BLOCKED/COMPLETE only | Spec §22 | Medium: offline use on site | `TechnicianHomeMyJobsScreen.tsx`, `InstallationSopChecklistScreen.tsx`, `IssueBlockerReportingScreen.tsx`, `JobDetailSiteInfoScreen.tsx` |
| QC | Two legacy checklists (mechanical, electrical) + bridged assignment | One QC form with PASS/REWORK/FAIL, using `recordQCResult` + `Snag` | Spec §19 | Low | `QualityChecklist*Screen.tsx`, `ReworkAssignmentScreen.tsx`, `DefectSnagListScreen.tsx`, `QcInspectorAssignmentScreen.tsx` |
| Customer portal | All legacy, e.g. `CustomerHomeDashboardScreen` calls `DbManager.getCustomerProjects` | Reuse the role-filtered Order View (Step 04) + `portalWorkSummary.ts` | Spec §14 | **High: rules don't let customers read their own order (§7)** | `Customer*Screen.tsx`, `src/services/portalWorkSummary.ts` |
| Admin landing | `Dashboards.tsx` (8,635 lines, legacy) + "Operating Surfaces" home | New single Admin dashboard (spec §9); keep `Dashboards.tsx` hidden | Spec §9 | Low | `Dashboards.tsx`, `OperatingSurfacesHome.tsx`, `controlTower.ts` |
| Navigation | ~100+ admin tabs hard-coded in `getTabsByRole`; 5 surfaces | Add the `MVP_MODE` allow-list filter (D-22) | Hide, don't delete | Low | `src/App.tsx` (`getTabsByRole`), `src/navigation/surfaces.ts`, `src/routers/*` |
| Role assignment | Wizard lets a user pick their own role (incl. surveyor/technician/supplier) and saves only to localStorage | Admin invites by email and sets the role in Firestore `users`; no self-pick for internal roles (D-13) | See F-1 | High | `RoleSelectionWizard.tsx`, `UserRolePermissionManagementScreen.tsx`, `src/lib/firestoreUsers.ts` |
| Reports | `RevenueProfitAnalytics` (1,398 lines), `SalesFunnelAnalytics` (1,031 lines), legacy | Thin report tables (spec §28) | Size rule | Low | both files |
| "Try as Role" | Visible in **every** build; the default login tab is "demo" | Keep for training; hide in production builds and stop defaulting to it | D-20; confuses real users | Low | `src/App.tsx` (`activeAuthTab`) |
| Live shipment tracking | Bridged; GPS/map UI | Status + expected date only | D-28 says no GPS | Low | `LiveShipmentTrackingScreen.tsx` |

### C. DISABLE (hide behind `MVP_MODE`, keep the code)
139 screens in 13 families: AI/bots, automation builders, lead intelligence, maps/tracking, messaging consoles, quote extras, advanced finance, supplier-portal extras, delivery extras, recruitment/training, gamification and misc settings. The full list is in §9.

| Feature | Current State | MVP Decision | Reason | Risk | Files |
|---|---|---|---|---|---|
| Gemini AI endpoints + bot screens | Real only with `GEMINI_API_KEY`; `/api/gemini/*` has **no auth** | Hide screens; add a server-side off switch (Step 11) | ❌ AI negotiation/manager; unauthenticated calls cost money | Medium | `src/serverApp.ts`, `AutoNegotiationBotConfig.tsx`, `ConversationAIBotConfig.tsx`, `GeminiTools.tsx`, `LiveNegotiationThread.tsx` |
| Online payment checkout | Gateway adapter is `unconfiguredPaymentGateway` (throws) | Hide (D-14) | No real gateway | Low | `OnlinePaymentCheckout.tsx`, `src/integrations/paymentGateway.ts` |
| Cloud SQL / Drizzle | `/api/db/*` only; no screen calls it | Leave dormant; don't build on it | D-01 Firestore only | Low: endpoints are reachable without auth (they return nothing without SQL env vars) | `src/db/*`, `src/serverApp.ts` |
| Event bus + handlers | In-process event bus with handlers that write notifications/warranties | Don't extend; D-08 rules module replaces it for MVP flows | ❌ event catalog | Low | `src/events/*` |
| Maps / geofence / live tracking | Leaflet maps, `wa.me` links, GPS views | Hide | Not in spec | Low | see §9 |
| Gamification | Badges, contests, leaderboards | Hide | ❌ Phase 1 | Low | see §9 |

### D. DELETE (only what's proven dead)
| Feature | Current State | MVP Decision | Reason | Risk | Files |
|---|---|---|---|---|---|
| Custom report builder | No router or importer mounts it; only a string in `screenRegistry.ts` | Delete in Step 04 **if** Step 02 confirms (remove the registry row too) | Proven unreachable | Low | `src/components/CustomReportBuilder.tsx` |
| `bun.lock` | npm chosen in Step 00; last touched in phase 17 | Delete (Owner Q in PROGRESS #4) | One package manager | Low | `bun.lock` |

Nothing else is deleted. The 4 other unrouted screens (`CameraCapture`, `GeminiTools`, `LeadDetail`, `MapFiltersLayersControlPanel`) are imported by other screens.

### E. BUILD (small, missing)
| Feature | Current State | MVP Decision | Reason | Risk | Files (planned) |
|---|---|---|---|---|---|
| Task entity + repository + rules | Missing ("work items" computed on the fly) | Build (D-06) | Spec §11 | Medium | `src/domain/entities.ts`, `src/repository/entities.ts`, `firestore.rules` |
| Blocker entity (8 reasons) | Missing (blockers computed) | Build (D-07) | Spec §12 | Low | same |
| MVP stage map, progress, health | Missing | Pure functions + checks (D-03, D-10, D-11) | Spec §7–8 | Low | `src/mvp/*` |
| One rules module | Missing | Build (D-08), reusing the workflow service functions | Spec §10 | Medium | `src/mvp/rules.ts` |
| Order `displayCode` AE-#### + `status` | Missing | Additive fields, counter in a transaction (D-02, D-05) | Spec §8 | Low | `entities.ts`, repository |
| Photo/evidence storage | **Not wired** (REPO_FACTS was wrong) | Firebase Storage upload transport (`firebase/storage`, already in the `firebase` package, no new dependency) + real `storage.rules` | D-16, spec §31 | **High** | `src/offline/mediaUpload.ts`, new `storage.rules` |
| Invite-based role assignment | Missing (F-1) | Admin sets email → role; first Google sign-in links it | D-13 | High | `src/lib/firestoreUsers.ts`, `firestore.rules` |
| Firestore rules for MVP roles | No customer/sales/qc/owner scoping; no rules for tasks/blockers/approvals/AMC/service cases | Narrow and add rules + emulator tests | D-12 | High | `firestore.rules` |
| Repository hardening | `update` is read-then-write (not a transaction); `create` overwrites | Transactional update + create-if-absent | D-06 concurrency | Medium | `src/repository/firestoreRepository.ts` |
| Admin dashboard, `MVP_MODE` | Missing | Build (Step 04) | Spec §9, D-22 | Low | new thin screen |
| Compliance list, emergency button, survey fee, AMC status | Missing | Build thin (D-26 to D-30) | Spec §21, §32 | Low | Steps 09–11 |
| `mvp:checks` + `checks:legacy` | Missing | Build (D-23) | — | Low | `package.json`, `scripts/mvp-*` |

### F. BROKEN
| Feature | Current State | MVP Decision | Reason | Risk | Files |
|---|---|---|---|---|---|
| **F-1 Role for new real users** | A new Google user gets `pending_selection` in Firestore. The wizard saves the chosen role only to localStorage (`DbManager.updateUser`), and the rules forbid self-changing a role anyway. Result: the role works only in that one browser, and Firestore rules still treat the user as unprivileged | Replace with Admin-set roles (E) | Blocks every non-owner real user | **High** | `RoleSelectionWizard.tsx:256`, `firestoreUsers.ts`, `firestore.rules:51-64` |
| **F-2 Self-claimed internal role** | Rules let a user **create** their own `users` doc with any role except `admin`, e.g. `surveyor`, which can read every customer and site and create projects | Narrow: self-create only as `pending_selection` (or the invited role) | Privilege escalation | **High** | `firestore.rules:54-55` |
| **F-3 Phone OTP + email/password** | OTP has no SMS provider; succeeds only with demo bypass codes. Email/password checks a hard-coded demo map. In production both can never succeed | Hide in production builds; Google only (D-13) | No fake auth in production | Medium | `src/App.tsx:495-612` |
| **F-4 Concurrency on Firestore** | `update` checks `version` with a read, then writes: two users can still overwrite each other. `createProjectFromLead` uses `Promise.all`, not a transaction (D-04 needs one) | Fix in Step 03 | Data integrity | Medium | `src/repository/firestoreRepository.ts:82-104`, `src/repository/entities.ts` |
| **F-5 Customer can't see their order** | `projects` read = admin or `ownerUserId` (the sales owner). Customers, technicians, QC and suppliers can't read canonical orders at all | Add per-role read rules (Step 03/11) | Spec §14 | High | `firestore.rules:172-177` |
| **F-6 Evidence photos** | Screens capture photos into localStorage/base64; no shared storage | Build (E) | Spec §18–20 | High | `PhotoVideoEvidenceCaptureScreen.tsx`, `src/offline/mediaUpload.ts` |
| **F-7 Unauthenticated server routes** | `/api/gemini/*` spend the Gemini key for anyone; `/api/config/maps-key` hands out the Maps key | Off switch / restrict keys (Step 11) | Cost, abuse | Medium | `src/serverApp.ts` |

## 5. Mapping to the MVP spec (§7–§32)
| Spec | Exists | Reuse | Gap |
|---|---|---|---|
| §7 10 stages | 14-value `ProjectStage` | Map with `toMvpStage` (D-03) | Add `survey`, `site_ready` |
| §8 Order View | `ProjectOperatingView` (stage, next action, owner, blockers, money, audit) | Extend | Code, lift, progress %, due, health, tasks, evidence, milestones; design input in `docs/mvp/design/order-view-conversation/` |
| §9 Admin dashboard | `controlTower.ts`, `workQueue.ts`, legacy `Dashboards.tsx` | Categories and queries | New single page; TODAY / NEEDS ATTENTION / PIPELINE |
| §10 Rule automation | Workflow services + event handlers | Service functions | `src/mvp/rules.ts` (D-08) |
| §11 Task | None persisted | — | Entity, repo, rules |
| §12 Blocker | Computed strings only | `computeBlockers` as a seed | Entity with 8 reasons |
| §13 Lead | Firestore `leads` (legacy shape, shared); `CanonicalLead` unused | `firestoreLeads.ts`, `LeadDetail`, `LeadKanban` | Spec fields, sales owner, statuses mapping (D-04) |
| §14 Customer | Legacy portal screens; `portalWorkSummary.ts` canonical but unwired | Order View filtered by role | Rules (F-5), approve quote, confirm readiness, approve handover |
| §15 Survey | `SiteVisitVerification` legacy | Inputs, camera | Canonical survey record + result |
| §16 Quote | `commercialWorkflow` quote/version; UI-only builder | Both | Cost, markup, min-margin approval, `GST_RATE_PCT` config ⚖ VERIFY |
| §17 Payment | `PaymentSchedule`, `Payment` (`initiated/confirmed/failed/refunded`), idempotent create | Yes | Milestone statuses map to PENDING/PARTIAL/PAID…; manual verify flow; no gateway |
| §18 Installation | `InstallationJob` + check-in/evidence; legacy 11-ish-item checklist | Services | Spec's 11 items stored per order, with photo/note/by/time |
| §19 QC | `QCInspection` pass/fail + `Snag` rework loop | Yes | REWORK as a decision (today: fail + snags), one form |
| §20 Handover | `Handover` with QC-pass and acceptance **hard gates**, certificate, warranty | Yes | D-29 licence gate, final payment gate, `status = COMPLETED` |
| §21 AMC | `Warranty`; `AMC` entity unused | `Warranty` | `mvpAmcStatus`, reminders |
| §22 Technician app | Legacy home/jobs; bridged check-in | Screens' UI | TODAY list from tasks |
| §23 Sales | Lead screens; no `sales` role | Lead screens | Role, own-leads scoping |
| §24 Supplier | Legacy directory; canonical PO | PO services | Supplier record (entity exists, no repo); no supplier login (D-12) |
| §25 Notifications | In-app `NotificationRecord`; external channels unconfigured | In-app | Task assigned/due/overdue triggers |
| §26 Roles | 5 roles in types + rules | Permission map | owner, sales, qc (D-12) |
| §27 Owner view | Legacy analytics | — | Thin read-only page |
| §28 Reporting | Legacy analytics (localStorage) | Chart components | Thin canonical tables |
| §29 Mobile-first | PWA, responsive Tailwind | Yes | Verify MVP screens at phone width |
| §30 Languages | en/mr/hi exist | `language.ts` | Decouple from `DbManager`; MVP keys |
| §31 Security | Rules (398 lines), audit, idempotency, high-risk gate | Yes | F-1, F-2, F-5, Storage rules, server routes, backups |
| §32 Compliance ⚖ | `ComplianceCertificationScreen` (bridged), `DocumentRecord` | Yes | D-27 list per order |

## 6. Recommended changes to DECISIONS.md
| # | Decision | Change | Why |
|---|---|---|---|
| 1 | D-13 | **Google sign-in only** for Phase 1. Hide OTP and email/password in production builds. Roles come from an Admin invite stored in Firestore `users`; the self-pick wizard is used only for `customer` | OTP and password are simulated (F-3); self-pick is broken and unsafe (F-1, F-2) |
| 2 | D-04 | Keep leads in the **existing shared Firestore `leads` collection**, extending the legacy `Lead` shape additively (sales owner, spec §13 fields), instead of starting a new `CanonicalLead` repository | It is already shared and has rules; `CanonicalLead` has no repository or rule. Step 02 confirms |
| 3 | D-16 | Note that **Firebase Storage must be built** (not reused). Use `firebase/storage` from the existing `firebase` package, so no new dependency | REPO_FACTS said Storage existed; it isn't wired |
| 4 | D-06 / D-02 | Step 03 first makes the Firestore repository's `update` transactional and `create` create-only, then builds tasks on it | F-4: optimistic concurrency isn't real today |
| 5 | D-12 | Move `qc.approve` and `handover.approve` from `technician` to the new `qc`/`admin` roles | Separation of duties once the `qc` role exists |
| 6 | D-20 | Hide the "Try as Role" tab in production builds and make "phone/Google" the default login tab | It's visible and the default in every build today |
| 7 | D-21 | No Vercel project is linked to this repo. Default: the Owner names the live URL; until then, plan for Vercel (`vercel.json` + `api/index.ts` are maintained) | See Q2 |

## 7. Risks (ranked)
| # | Risk | Mitigation |
|---|---|---|
| 1 | **One Firebase project for testing and real use.** A mistaken test write lands in real data | D-19: emulator/demo only; never run `live-*`; Owner considers a second project before go-live |
| 2 | **Rules gaps (F-2, F-5) and no server auth.** A user can self-claim `surveyor`; customers can't see their own order | Step 03/11: narrow `users` create, add per-role reads; emulator rules tests; no business logic on the server |
| 3 | **Evidence has nowhere to live (F-6)** | Step 08 builds the Storage transport + rules before the technician flow ships |
| 4 | **Legacy/canonical ID mismatch when switching bridged screens' reads.** Bridges map legacy deals/jobs to projects through `ensureCanonicalProject` | Switch one screen at a time, reuse bridge checks, keep bridges until reads are canonical |
| 5 | **Scope pressure from 194 screens and the Owner's reference design** (bot, GPS, chat) | `MVP_MODE` allow-list; the keep/adapt/drop filter in `docs/mvp/design/`; mvp-scope-guard on every PR |
| 6 | **Live build may ship demo login (`VITE_APP_ENV` unset)** | Step 11: set `VITE_APP_ENV=production` in the live build; `production-bundle-bypass:check` must pass |
| 7 | **Tax/legal assumptions** (GST, licence, refunds) | `⚖ VERIFY` config values, no hard-coded rates |

## 8. Questions for the Owner (with my defaults)
1. **Logins (D-13):** Google sign-in only for staff and customers? *Default: yes. Phone OTP stays hidden until a real SMS provider is chosen.*
2. **Pilot deployment (D-21):** which URL is live today? Vercel lists 9 projects in your team (e.g. `v3-200-ai-studio`), but none is Git-linked to this repo. *Default: Vercel, project `v3-200-ai-studio`, after you confirm.*
3. **Firebase access:** do you have full admin on project `dogwood-torus-v71nt` (console, billing, backups, rules deploy)? If not, who does? *Default: you; needed by Step 11.*
4. **Real data:** is any real customer data already in Firestore or in staff browsers? *Default: assume yes for Firestore `leads`/`users`; nothing is deleted or migrated without your OK.*
5. **Payment gateway:** does anything take real money today? *Finding: no gateway is configured. Default: manual recording (D-14).*
6. **Survey fee (D-30):** amount, or 0 = off? *Default: 0.*
7. **Emergency (D-28):** the emergency phone number, and who is on call for the first lifts? *Default: your number, Admin on call.*
8. **Statutory licence (D-29):** who handles it, and how long does it usually take? *Default: Admin, 30 days ⚖ VERIFY.*
9. **"Try as Role":** keep it for staff training on the live site? *Default: hide it in the production build and keep it in a separate demo build.*
10. **`bun.lock`:** OK to delete it (npm is used)? *Default: yes, in Step 03.*

---

## 9. Screen classification (all 194)
Store mark from the scan:
- ◆ canonical
- ★ bridged
- ○ `DbManager`
- □ no store found, or raw localStorage (only `QuotePricing`)

The number after the mark is the file's line count.

| Decision | Family | Screens (store mark, lines) | Reason |
|---|---|---|---|
| **KEEP** | Canonical core (8) | `ProjectOperatingView` ◆195, `WorkQueueScreen` ◆102, `OperatingSurfacesHome` □97, `CommandPalette` □232, `EnvironmentBadge` □35, `Common` □248, `CameraCapture` □322, `PermissionsPrimer` ○653 | Already canonical (◆) or shared UI; extend in Step 04 |
| **SIMPLIFY** | ★ Bridged MVP screens (15) | `LeadDetail` ★1211, `LeadKanban` ★1113, `PaymentCollectionDashboard` ◆1103, `PurchaseOrderGenerator` ★734, `SupplierOrderStatusTracking` ★524, `SiteDeliveryChecklistScreen` ★623, `DeliverySchedulingScreen` ★934, `LiveShipmentTrackingScreen` ★430, `TechnicianCheckInCheckOutScreen` ★311, `PhotoVideoEvidenceCaptureScreen` ★391, `QcInspectorAssignmentScreen` ★610, `FinalHandoverChecklistScreen` ★578, `HandoverCompletionCertificateScreen` ★542, `CustomerHandoverWalkthroughScreen` ★666, `ComplianceCertificationScreen` ★515 | Writes already reach canonical; switch reads, trim to spec |
| **SIMPLIFY** | ○/□ MVP screens → thin canonical screen or rewire (28) | `LeadInbox` ○1646, `LeadFollowUpScheduler` ○1653, `SiteVisitVerification` ○790, `QuotePricing` □549, `QuotationPreview` □622, `DiscountApprovalWorkflow` □761, `PaymentStageScheduleSetup` ○1303, `PaymentReceiptHistory` ○404, `CustomerPaymentInstallmentsScreen` ○353, `SupplierDirectory` ○774, `MaterialReceivedConfirmationScreen` ○613, `TechnicianHomeMyJobsScreen` ○408, `JobDetailSiteInfoScreen` ○426, `InstallationSopChecklistScreen` ○406, `IssueBlockerReportingScreen` ○441, `QualityChecklistMechanicalScreen` ○609, `QualityChecklistElectricalScreen` ○692, `ReworkAssignmentScreen` ○646, `DefectSnagListScreen` ○518, `WarrantyAmcRegistrationScreen` ○676, `CustomerAmcBookingScreen` ○369, `EmergencyEscalationAlert` ○1135, `CustomerHomeDashboardScreen` ○375, `CustomerDocumentVaultScreen` ○268, `CustomerSupportTicketScreen` ○495, `CustomerNotificationCenterScreen` ○389, `RevenueProfitAnalytics` ○1398, `SalesFunnelAnalytics` ○1031 | Needed for an MVP step but browser-only today; reuse parts, write canonical |
| **SIMPLIFY** | Shell / identity (3) | `Dashboards` ○8635, `RoleSelectionWizard` ○1536, `UserRolePermissionManagementScreen` ○591 | Fix so real users get roles from the shared store; replace the legacy admin landing |
| **DISABLE** | AI, bots and negotiation (8) | `AutoNegotiationBotConfig` □700, `ConversationAIBotConfig` □730, `GeminiTools` □405, `LiveNegotiationThread` □1026, `CustomerObjectionHandling` □532, `CompetitorBattlecard` □600, `CounterOfferApproval` □694, `MultiOptionComparison` □802 | ❌ Phase 1 (AI negotiation / AI manager) |
| **DISABLE** | Automation and rule builders (14) | `AutomatedSequenceBuilder` □1146, `AutomationHealthMonitor` □905, `AutomationTestingSandboxScreen` ○447, `MasterAutomationRulesDashboardScreen` ○448, `WorkflowTriggerBuilderScreen` ○511, `AutoPoTriggerRules` ○609, `AutoReconciliationScreen` ○500, `FollowUpStageRules` □730, `EscalationMatrixConfigScreen` ○361, `SlaTimerBreachAlertScreen` ○287, `ManualOverrideConsoleScreen` ○364, `SystemHealthBotMonitoringScreen` ○345, `AlertsExceptionsDashboard` □983, `AuditLogAutomatedActionsScreen` ○269 | ❌ workflow engine / rule learning; D-08 replaces with one rules module |
| **DISABLE** | Lead intelligence and bulk tools (9) | `LeadScoring` ○1090, `LeadDensityHeatmap` ○1065, `LeadSourceAttribution` ○1067, `LeadMergeResolution` ○1326, `LeadAssignment` ○1058, `BulkLeadImportExport` ○1463, `LostLeadDisqualification` ○996, `ConversionRateAnalytics` ○1185, `QuotationAnalyticsWinLoss` □659 | Spec §13: no lead scoring; bulk tools not needed for 10–20 orders |
| **DISABLE** | Maps, live tracking and GPS (7) | `LiveMapDashboard` ○1618, `MapFiltersLayersControlPanel` □967, `GeofenceTerritoryManagement` ○1430, `RouteOptimizationSuggestion` ○1112, `SurveyorLiveTrackingDetailView` □933, `TechnicianLiveTrackingDetailView` □1020, `LiveActivityFeed` ○1053 | Not in spec; D-28 says no GPS dispatch |
| **DISABLE** | Messaging consoles and dialers (9) | `CallLogAutoDialer` □890, `CommAnalytics` □564, `CommComplianceManager` □611, `CommunicationTemplatesLibrary` □1155, `CustomerReplyInbox` □816, `SMSBroadcastDeliveryReport` □1007, `WhatsAppBusinessChatConsole` □912, `NotificationTemplatesChannelsScreen` ○440, `CustomerLiveSupportChatScreen` ○345 | No working WhatsApp/SMS/voice transport (D-17) |
| **DISABLE** | Quote and deal extras (11) | `QuotationInputSpecs` □1035, `QuotationSendEDelivery` □687, `QuotationTemplateBranding` □550, `QuotationVersionHistory` □837, `DealClosureConfirmation` □498, `DealTermsFinalization` □557, `DealWonCelebration` □443, `LegalContractTemplatesRepositoryScreen` □610, `DigitalContractGenerator` □690, `ESignatureCapture` □805, `PricingRulesMarginConfig` □534 | Spec §16 keeps one quote builder; agreement recorded as a document (D-27) |
| **DISABLE** | Advanced finance, payouts, loans, tax (19) | `AdvancePaymentRetentionScreen` ○507, `AutomatedPayoutDisbursementScreen` ○557, `CommissionRulesEngineScreen` ○647, `FinancialCashFlowReceivables` □979, `LoanEmiApplication` ○668, `LoanPartnerIntegration` ○626, `MilestonePaymentReleaseScreen` ○466, `OverduePaymentEscalation` ○487, `PaymentReminderConfig` ○587, `PayoutApprovalQueueScreen` ○560, `PayoutDisputeQueryScreen` ○581, `PayoutHistoryStatementsScreen` ○381, `RefundDisputeManagement` ○388, `StageWisePayoutTrackerScreen` ○449, `TaxDeductionStatementScreen` ○359, `TaxGstComplianceScreen` ○463, `InvoiceGenerator` ○775, `SaaSOpsSubscriptionBillingScreen` □430, `OnlinePaymentCheckout` ★662 | Spec §17: milestones only; no wallet/NBFC; tax ⚖ VERIFY |
| **DISABLE** | Supplier portal extras (15) | `SupplierCatalogPricing` ○930, `SupplierCommunicationThreads` ○779, `SupplierContractSla` ○656, `SupplierDisputeResolutionScreen` ○534, `SupplierInvoiceMatchingScreen` ○738, `SupplierOnboarding` ○982, `SupplierPaymentAnalyticsScreen` ○437, `SupplierPaymentApprovalScreen` ○671, `SupplierPaymentHistoryScreen` ○360, `SupplierPaymentScheduleScreen` ○396, `SupplierPaymentTermsConfigScreen` ○554, `SupplierPerformanceScorecard` □1238, `SupplierRatingScorecard` ○658, `ManufacturerProductionStatus` ○618, `StockInTransitScreen` ○421 | Spec §24: Admin manages suppliers; no marketplace |
| **DISABLE** | Delivery extras (5) | `DeliveryAnalyticsScreen` ○460, `DeliveryDelayAlertEscalationScreen` ○617, `DeliveryPartnerManagementScreen` ○575, `DeliverySopConfigScreen` ○466, `DamagedMissingPartsReportScreen` ○492 | MVP tracks status + expected date only |
| **DISABLE** | Partner recruitment, training, field extras (27) | `ApplicantDataCollectionScreen` ○787, `ApplicantScreeningScreen` ○651, `BackgroundVerificationScreen` ○508, `InterviewSchedulingScreen` ○487, `OfferOnboardingAgreementScreen` ○603, `RecruitmentLandingScreen` ○681, `PartnerDeactivationExitScreen` ○688, `PartnerDirectoryScreen` ○654, `PartnerTierCategoryAssignmentScreen` ○509, `NewPartnerAggregationDashboardScreen` ○407, `SkillMatrixGapAnalysisScreen` ○496, `CertificationBadgeProgressScreen` ○398, `QuizCertificationTestScreen` ○543, `TrainingComplianceTrackerScreen` ○422, `TrainingFeedbackScreen` ○745, `TrainingModuleLibraryScreen` ○611, `VideoInteractiveLessonPlayerScreen` ○588, `NewSopRolloutNotificationScreen` ○484, `SopDocumentRepositoryScreen` ○536, `TechnicianTeamCoordinationScreen` ○294, `SinglePersonMonitorControlPanelScreen` ○440, `MaterialUsageLoggingScreen` ○419, `SafetyComplianceChecklistScreen` ○543, `SurveyorOnboarding` ○893, `TechnicianOnboarding` ○919, `CustomerQuickSignup` ○585, `ForgotPasswordReset` ○880 | Not needed to run 10–20 orders with known staff |
| **DISABLE** | Gamification (5) | `BadgesMilestonesScreen` ○469, `ContestConfigurationScreen` ○599, `RewardsLeaderboardScreen` ○345, `WorkerPerformanceLeaderboard` □1273, `CustomerReferralProgramScreen` ○392 | ❌ Phase 1 |
| **DISABLE** | Settings and misc admin (10) | `ApiIntegrationManagementScreen` ○353, `AppVersionChangelogFeedbackScreen` □615, `BackupDataExportScreen` □754, `CompanyProfileBrandingSettingsScreen` ○375, `DataPrivacyConsentManagementScreen` ○542, `SecuritySessionManagementScreen` ○461, `HelpFaqSupportScreen` □895, `CustomerFeedbackRatingScreen` ○329, `InstallationProgressTimelineScreen` ○260, `ProjectStatusTrackerScreen` ○351 | Not on the MVP path; backups/consent handled in Step 11 |
| **DELETE** | Proven dead (candidate) (1) | `CustomReportBuilder` □1008 | No route and no importer; only a string entry in screenRegistry.ts. Confirm in Step 02 |

Totals: KEEP 8, SIMPLIFY 46, DISABLE 139, DELETE 1, all 194 of 194.

BROKEN items are features, not whole screens. See §4-F.

## 10. Tests: which checks cover what (D-23)
| Keep in `npm run checks` (covers MVP code) | Move to `npm run checks:legacy` (hidden subsystems only) |
|---|---|
| domain, workflow:validate, repository, authz, audit (idempotency), commercial, operations, offline, reliability (notifications), controltower, e2e, bridge, procurement-bridge, delivery-bridge, installation-qc-handover-bridge, portal-summary, operating-surfaces-home, project-operating-view, work-queue, production-demo-gate, production-bundle-bypass, transactional-idempotency, hard-gate-attack, destructive-action-safety, security-hardening, integration-boundaries, code-splitting, global-search, simulation:full-company, final-company-simulation-multi, navigation-cutover (update for `MVP_MODE`), surfaces | migration (scan/matrix/check), dual-write-reconciliation, dual-write-cutover, legacy-read-migration, legacy-write-reduction, legacy-database-elimination, dbmanager-remaining, legacy-authz-remediation, data-quality-phase26, eventbus |

`live-*` scripts stay human-only (D-19).

## 11. REPO_FACTS corrections
| REPO_FACTS says | Code says |
|---|---|
| "Firebase Firestore … plus Firebase Storage" | **No Storage integration.** `firebase/storage` is never imported |
| Auth: Google popup + Try as Role | Also a phone-OTP and an email/password path. Both are simulated: they succeed only with demo literals, which production builds strip |
| "About 128 of the 194 screens" use `DbManager` | **142** call `DbManager.` *(scan)*; 50 have no store; 3 are canonical ◆ (`ProjectOperatingView`, `WorkQueueScreen`, and `PaymentCollectionDashboard`, which also reads `DbManager`) |
| "Only about 2 of 194 screens read canonically" | 3 (above) |
| Drizzle/Postgres "usage unknown" | Used only by `/api/db/*` server routes, which no screen calls |
| Lead store helper "verify" | `firestoreLeads.ts` = Firestore `leads`, **legacy `Lead` shape**, shared for real sessions; not `CanonicalLead` |
| Roles | Also `pending_selection` (new users); rules treat `qc_inspector` as technician |
| Stack, server, `firestore.rules` ~398 lines, two deploy paths, two lockfiles, `tsx` check convention | Confirmed |
