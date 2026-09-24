# REPO FACTS — what a read-only pre-inspection found

> **Snapshot:** `main` at commit `fc505b8`, taken on 2026-09-24, before the kit was written.
> **These are leads, not truth.** Step 01 must confirm or correct every line against the real code, and record any difference in the audit.

## 1. Stack
- **Frontend:** React 19, Vite 6, Tailwind 4 and TypeScript, as a PWA (`vite-plugin-pwa`). Maps use Leaflet. The main shell is `src/App.tsx` (about 2,556 lines).
- **Server:**
  - Express: `server.ts` → `src/serverApp.ts` (about 646 lines).
  - Vercel serverless entry: `api/index.ts`.
  - **Two deployment paths exist:** Vercel (`vercel.json`) and Google AI Studio / Cloud Run (`metadata.json`, port 3000).
- **Auth:** Firebase Auth with a Google sign-in popup. There is also a "Try as Role" demo login with bypass codes, gated at build time by `__DEMO_AUTH_ENABLED__` (driven by `VITE_APP_ENV`, see `src/lib/demoCredentials.ts`).
- **Data:** Firebase Firestore (a named database in project `dogwood-torus-v71nt`), plus Firebase Storage. `firestore.rules` is about 398 lines.
- **Also present, usage unknown:** Drizzle ORM with Postgres (`src/db/*`, the `pg` and `postgres` packages) and `@google/genai` (Gemini).
- **Two lockfiles:** `bun.lock` and `package-lock.json`. Pick one in Step 00.
- **No unit-test framework.** The test convention is `tsx` assertion scripts in `scripts/*.ts`, wired up as `npm run <name>:check`. `npm run lint` is just `tsc --noEmit`. `npm run checks` chains about 50 scripts, several of them `live-*` scripts that need real credentials.

## 2. Two data layers (the most important fact)
**Legacy `DbManager` in `src/lib/db.ts`:**
- About 11,700 lines, with seed data made of fake people.
- It persists to the **browser's localStorage** (keys prefixed `aiec_`).
- About 128 of the 194 screens still read and write through it.
- **Consequence:** data entered on those screens stays in that one browser. The Admin, the technician and the customer do NOT see each other's updates, so these screens cannot run real multi-user orders.

**Canonical layer:**
- **Entities:** `src/domain/entities.ts`, 30 entities with branded IDs from `src/domain/ids.ts`.
- **Repositories:** `src/repository/*`. Firestore is used for real sign-ins; an in-memory demo repository is used for "Try as Role".
- **Dual-write bridges** exist for 16 files, for example `src/services/legacyCommercialBridge.ts`.
- **Only about 2 of the 194 screens read canonically.**

**MVP implication:** every MVP screen must read and write the canonical, shared layer. See DECISIONS D-01.

## 3. Canonical model that already exists (reuse it)
| Entity | Covers |
|---|---|
| `Project` | The order. Field `stage` holds a `ProjectStage`, which has 14 values plus `closed_lost`. |
| `Customer`, `Site`, `CanonicalLead` | Customer, site and lead. Lead stages: `captured, assigned, contacted, survey_done, quoted, negotiating, closed_won, closed_lost`. |
| `Quote`, `QuoteVersion`, `Contract` | Quoting and agreements |
| `PaymentSchedule`, `Payment`, `Invoice` | Payments |
| `Supplier`, `PurchaseOrder`, `ProductionOrder`, `Shipment`, `DeliveryReceipt` | Supply and delivery |
| `InstallationJob`, `QCInspection`, `Snag` | Installation, QC and rework |
| `Handover`, `Warranty`, `AMC`, `ServiceCase` | Handover and after-sales |
| `DocumentRecord`, `NotificationRecord`, `ApprovalRequest`, `AuditEvent`, `WorkflowInstance` | Documents, notifications, approvals, audit and workflow state |

**Missing for the MVP:**
- a persisted **Task** entity (today "work items" are computed on the fly)
- a user-raised **Blocker** entity (today blockers are computed on the fly)
- **survey** and **site_ready** stages
- the **owner**, **sales** and **qc** roles. `CanonicalUserRole` has only `admin | surveyor | technician | customer | supplier`.

## 4. Services and screens to reuse first
| Area | Existing file |
|---|---|
| Universal Order View | `src/services/projectOperatingView.ts` + `src/components/ProjectOperatingView.tsx`. Already assembles stage, progress, next action (`NEXT_ACTION_BY_STAGE`), owner, SLA, blockers and money. |
| Work queue / next action | `src/services/workQueue.ts` + `src/components/WorkQueueScreen.tsx` |
| Needs-attention categories | `src/services/controlTower.ts` (`critical / at_risk / waiting / on_track`) |
| Workflow state machines | `src/workflows/definitions/*` (sales, quote, payment, procurement, installation, qc, handover) |
| Commercial and operations logic | `src/services/commercialWorkflow.ts` (with a payment-before-procurement hard gate), `src/services/operationsWorkflow.ts` |
| Audit, idempotency, authorization | `src/lib/audit.ts`, `src/lib/idempotency.ts`, `src/lib/authz.ts`, `src/domain/permissions.ts` (19 permissions) |
| Notifications | `src/services/notificationService.ts` |
| Camera and evidence | `src/components/CameraCapture.tsx`, `src/components/PhotoVideoEvidenceCaptureScreen.tsx`, `src/offline/mediaUpload.ts`, `src/offline/outbox.ts` |
| Languages | `src/lib/language.ts`. English, Marathi and Hindi (`en/mr/hi`) already exist, but it imports `DbManager`. |
| Navigation | `src/navigation/surfaces.ts` + `src/components/OperatingSurfacesHome.tsx` (five surfaces). Role routers are in `src/routers/*`. |
| Candidate legacy screens for MVP pieces | `LeadInbox`, `LeadDetail`, `LeadFollowUpScheduler`, `SiteVisitVerification`, `QuotePricing`, `QuotationPreview`, `PricingRulesMarginConfig`, `DiscountApprovalWorkflow`, `PaymentStageScheduleSetup`, `PaymentCollectionDashboard`, `SupplierOrderStatusTracking`, `PurchaseOrderGenerator`, `TechnicianHomeMyJobsScreen`, `TechnicianCheckInCheckOutScreen`, `InstallationSopChecklistScreen`, `IssueBlockerReportingScreen`, `QualityChecklistMechanicalScreen`, `ReworkAssignmentScreen`, `FinalHandoverChecklistScreen`, `WarrantyAmcRegistrationScreen`, `CustomerHomeDashboardScreen`, `CustomerDocumentVaultScreen`, `RevenueProfitAnalytics`. **Check which store each one uses before reusing it.** |

**For exact reuse modes per step, including the 16 ★ dual-write-bridged screens, see `docs/mvp/REUSE_MAP.md`.**

## 5. History you must know
- The repo was built by an earlier 62-phase "AIEC Claude Code Sequential Improvement Pack". Its record is in `docs/aiec-implementation-log.md`, `docs/architecture/FINAL-OPERATING-MODEL.md` and about 60 other docs. `docs/` is about 15 MB, mostly screenshots.
- Its final verdict, in `docs/production/FINAL-CUTOVER-DECISION.md`, was **"PRODUCTION READINESS BLOCKED"**. The sandbox never had live Firebase credentials. That pack also warned that the live deployment was probably built without `VITE_APP_ENV=production`, so demo bypass logins may be live.
- **One Firebase project serves both "sandbox" and "production".** There is no staging project, so a test that writes to Firestore writes to real data.
- **This kit supersedes that pack's direction** for Phase 1. Do not continue its legacy-migration phases (54+) for non-MVP screens.

## 6. Context hygiene for Claude
- **Never read `src/lib/db.ts` or `src/types.ts` whole.** Use `grep -n` and read targeted line ranges.
- **Never open `docs/production/screenshots/`.**
- **Prefer the canonical files above** over legacy screens when learning how something works.
