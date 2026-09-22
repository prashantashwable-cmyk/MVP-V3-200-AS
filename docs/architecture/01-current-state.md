# AIEC — Current State (Phase 01 Baseline)

Generated as part of the AIEC Claude Code Sequential Improvement Pack, Phase 01.
Verified against the live repository on 2026-09-22 (commit `07384aa`, branch `main`).

## 1. Current architecture (as-is)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (React 19 SPA, Vite build)                                  │
│                                                                        │
│  src/App.tsx (2,423 lines)                                            │
│   - holds session/auth state (`currentUser`) in React state           │
│   - restores session from localStorage key `aiec_session_token`       │
│     (format: `session_<userId>`, looked up directly against          │
│     DbManager.users — a client-trusted, forgeable token)              │
│   - renders onboarding/role-selection flows directly                  │
│   - delegates authenticated screens to role routers:                  │
│       src/routers/AdminRouter.tsx                                     │
│       src/routers/CustomerRouter.tsx                                  │
│       src/routers/SurveyorRouter.tsx                                  │
│       src/routers/SupplierRouter.tsx                                  │
│       src/routers/TechnicianRouter.tsx                                │
│       src/routers/SharedRoutes.tsx (60KB — routes usable by >1 role)  │
│                                                                        │
│  src/components/*.tsx  (189 files, ~207 .ts/.tsx files total in src)  │
│   - one file per screen/tool, most self-contained                     │
│   - most read/write through `DbManager` (src/lib/db.ts, 11,703 lines) │
│   - a minority read/write Firestore directly (Leads, Users) or        │
│     localStorage directly (session token, a few draft/cache uses)     │
│                                                                        │
│  src/lib/db.ts — `DbManager`                                          │
│   - a single giant in-memory object literal seeded with realistic     │
│     demo data for ~1,646 method/field entries across every domain     │
│     (leads, deals, jobs, payments, suppliers, POs, deliveries, QC,    │
│     handovers, warranties, automation, etc.)                          │
│   - acts as the *de facto* source of truth for 124+ of the 189        │
│     screens; nothing here survives a page reload beyond what is       │
│     re-seeded, i.e. most of the app's "data" resets on refresh        │
│   - is NOT backed by Firestore, a server API, or any persistent store │
│                                                                        │
│  src/lib/firebase.ts                                                  │
│   - initializes Firebase App/Firestore(named db)/Auth from a          │
│     hardcoded config object (project `dogwood-torus-v71nt`)           │
│   - only Users (firestoreUsers.ts) and Leads (firestoreLeads.ts) are  │
│     wired to real Firestore reads/writes                              │
│                                                                        │
│  firestore.rules                                                      │
│   - covers only: users, leads, contracts, site_sops, breakdown_sos,   │
│     audit_logs, help_articles — a small subset of the ~30+ domain     │
│     entities that exist in src/types.ts                               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  server.ts / server.cjs (Express, 27KB)                              │
│   - static file serving for the built SPA                            │
│   - GET  /api/health                                                  │
│   - GET  /api/config/maps-key                                         │
│   - POST /api/gemini/maps            (Gemini-backed maps assistant)  │
│   - GET  /api/maps/geocode                                            │
│   - POST /api/gemini/generate-image                                   │
│   - POST /api/gemini/ocr                                              │
│   - POST /api/gemini/bot-simulate    (explicitly named "simulate")   │
│   - GET  /api/db/status, /api/db/contracts, /api/db/sops              │
│           (these three now read from Firestore per code inspection,  │
│            but are not the primary path most screens use)             │
│   - no authentication middleware, no authorization checks, no        │
│     idempotency handling, no audit logging on any endpoint            │
└─────────────────────────────────────────────────────────────────────┘
```

## 2. Route / screen inventory

Full machine-generated inventory: `docs/architecture/screen-inventory.csv`
(189 rows, one per file in `src/components`).

Method: cross-referenced every component filename against the 6 router
files (`AdminRouter`, `CustomerRouter`, `SurveyorRouter`, `SupplierRouter`,
`TechnicianRouter`, `SharedRoutes`) and `App.tsx` for a textual reference,
then grepped each component's own source for `DbManager`, `firestore`,
`localStorage` to classify its data source. `surface_candidate` is a
keyword-based hypothesis for the Phase 10 five-surface regrouping — it is
explicitly **not** authoritative until Phase 10 confirms it against actual
usage.

Summary:

| Surface candidate (hypothesis) | Screens |
|---|---|
| CUSTOMERS (sales/customer/lead/site/contract/negotiation) | 39 |
| OPERATIONS (delivery/installation/procurement/QC/handover) | 31 |
| FINANCE (quote/payment/invoice/commission/ledger) | 27 |
| CONTROL (automation/security/settings/audit/reports/users) | 22 |
| WORK (dashboards/tasks/alerts/approvals) | 10 |
| UNCLASSIFIED (needs manual review in Phase 10) | 60 |

| Data source (as detected in file source) | Screens |
|---|---|
| `DbManager` only (fake in-memory/local) | 124 |
| `DbManager` + `localStorage` | 20 |
| props-only / no direct persistence call detected | 33 |
| `localStorage` only | 11 |
| Firestore (real) | 1 (there are 2 real Firestore modules — Users and Leads — but only 1 component calls them directly; most Firestore-backed reads happen inside `App.tsx`/routers rather than leaf screens) |

Components not referenced by name in any router or `App.tsx` (likely
reached only as a modal/subview from inside another screen, or currently
dead code — needs confirmation, not deleted in this phase):
`CameraCapture`, `CustomReportBuilder`, `GeminiTools`, `LeadDetail`,
`MapFiltersLayersControlPanel`.

## 3. Entity inventory (current, pre-canonicalization)

`src/types.ts` currently defines **229** exported interfaces/type aliases,
covering (non-exhaustive): `User`, `Lead`, `Deal`, `Job`, `Payment`,
`LoanApplication`, `Invoice`, `Supplier`, `PurchaseOrder`,
`TechnicianJob`, `DeliverySchedule`, `SiteDeliveryChecklist`,
`DamagedMissingPartsReport`, `SupplierPaymentRecord`,
`ReconciliationRunRecord`, and many more domain-specific records.

Key observations:

- There is **no canonical `Project` entity**. The closest analogues are
  `Lead` (pre-sale) and `Deal` (post-close), which are not linked to each
  other or to a single ID graph that also covers site, quote, contract,
  payment, procurement, and installation records.
- There is **no canonical `Site` entity** as a first-class object separate
  from `Lead`/`BuildingInfo`.
- `Quote`/`QuoteVersion`/`Contract` as named in the pack's target domain
  model do not exist yet as such; quoting/negotiation concepts are spread
  across several screen-specific types (`DealTermsFinalization`,
  `CounterOfferApproval`, `DigitalContractGenerator`, etc.) without a
  shared backing type.
- Status/stage enums are duplicated per-entity rather than derived from a
  shared workflow definition (e.g. `LeadStage`, `JobStatus`,
  `PaymentStatus`, `LoanApplicationStatus`, `EscalationStatus` are all
  independent string unions with no shared vocabulary or transition
  rules).
- No `AuditEvent`, `WorkflowInstance`, or `ApprovalRequest` canonical type
  exists yet (some screens have bespoke, screen-local audit-like records,
  e.g. `DisputeAuditEntry`, `POStatusHistoryEntry`, but they are not a
  unified model).

This confirms the Phase 00/RUN_ALL hypothesis and is the direct input to
Phase 02 (canonical domain model).

## 4. Current data sources

1. **`DbManager` (src/lib/db.ts, 11,703 lines)** — a single large
   TypeScript object literal + methods, instantiated once in memory,
   pre-seeded with demo data. This is the primary "backend" for the large
   majority of screens (124 of 189 detected). It has no network layer, no
   persistence, and resets to its seeded state on every full page reload
   unless a screen has separately cached something to `localStorage`.
2. **Firestore (real, named database)** — wired for exactly two domains:
   `users/{uid}` (`src/lib/firestoreUsers.ts`) and `leads/{leadId}`
   (`src/lib/firestoreLeads.ts`). Both are demo-mode-aware: demo/"Try as
   Role" sessions never call them, so demo sessions cannot corrupt real
   Firestore data. This pattern (demo-mode gate before any Firestore call)
   is worth preserving and generalizing in Phase 04.
3. **`localStorage`** — used for: session token
   (`aiec_session_token`), and various ad-hoc component-local caches/drafts
   (31 files reference it in total, 20 of which also use `DbManager`).
4. **Postgres/Drizzle** — `pg`, `postgres`, and `drizzle-orm` are present
   in `package.json` and `drizzle-kit` is a dev dependency, but no
   `drizzle` schema/config files or query usage were found under `src/` or
   at the repo root in this pass — appears to be scaffolding for a future
   server-side store that was never adopted. Documented here as a known
   half-finished integration path rather than a working data source.

## 5. Current auth model

- Firebase Auth is initialized (`src/lib/firebase.ts`, `getAuth(app)`) and
  used for real Google Sign-In sessions.
- However, the **primary session mechanism used across the app is a
  client-forgeable localStorage token**: `aiec_session_token` is set to
  the literal string `` `session_${user.id}` `` (see `src/App.tsx` lines
  ~276-292, ~458, ~522, ~563, ~1383, and `RoleSelectionWizard.tsx`,
  `ForgotPasswordReset.tsx`). On load, `App.tsx` strips the `session_`
  prefix, treats the remainder as a raw user ID, and looks it up directly
  in `DbManager.users` — there is no cryptographic signature, no
  server-side verification, and no expiry. Any client can set this key to
  impersonate any user ID that exists in the demo `DbManager` seed data.
- Firestore rules (`firestore.rules`) provide real enforcement **only**
  for the 6 collections they cover (see below) and only when the request
  actually carries a Firebase Auth ID token — i.e. only for the
  Users/Leads real-persistence paths. Every other "authorization" in the
  app today is UI-only (conditionally rendering menu items/buttons per
  `currentUser.role`), which the pack's non-negotiable principle #8
  explicitly forbids relying on going forward.
- Firestore rules present: `users`, `leads`, `contracts`, `site_sops`,
  `breakdown_sos`, `audit_logs` (immutable, admin-read-only), and
  `help_articles`. There is no rule coverage yet for quotes, payments,
  invoices, suppliers, purchase orders, deliveries, installation jobs, QC
  inspections, handovers, warranties, or notifications.

## 6. Current workflow/state representations

No shared workflow/state-machine module exists yet. Each domain type
defines its own local status union (see §3) and each screen independently
decides what "next" means, generally by:

- hardcoded button handlers that call a `DbManager` mutation method, then
- either directly setting local component state to switch view, or
- calling a prop callback (e.g. `onNavigate`) with a hardcoded target
  screen name.

There is no single file that defines valid transitions, roles allowed to
perform them, or exception/loop paths (e.g. QC fail → rework → re-inspect)
as data rather than ad-hoc per-screen `if` logic.

## 7. Integration inventory

| Integration | Status |
|---|---|
| Firebase Auth | Real, partially used (Google Sign-In path) |
| Firestore (named DB `ai-studio-buildit-...`) | Real, but only 2 of ~30 domains wired |
| Gemini API (`@google/genai`) | Real, used server-side for maps assist, image gen, OCR, and an explicitly-named "bot-simulate" endpoint |
| Google Maps Platform | Real (geocoding via server proxy) — **superseded**: `c1c2f69` already replaced Google Maps UI with free OpenStreetMap/Leaflet across map screens; the geocode/maps-key server routes may now be partially vestigial (needs confirmation before removal) |
| Postgres/Drizzle | Present in deps only; no active usage found |
| WhatsApp/SMS/Email notification providers | Not found — all "send" actions in components appear to write directly into `DbManager`'s in-memory notification/message records with no outbound network call |
| Payment gateway / bank rails | Not found — payment recording is a `DbManager` mutation only; no gateway SDK or webhook receiver exists |
| Object storage for media/documents | Not found — file/photo "uploads" write into component state or `DbManager` records (often as blob URLs or placeholder metadata), not to Firebase Storage or any bucket |

## 8. Known simulated/demo behavior

- `server.ts` has an endpoint literally named `/api/gemini/bot-simulate`.
- `DbManager` contains seeded records with fields like `lastSimulatedResult`,
  `simulatedOutcome`, `simulatedAt`, and log lines such as `"[..] Simulated
  payload ingested."` inside automation-rule demo data — i.e. the
  automation screens visualize pre-baked simulated outcomes, not a live
  execution engine (confirmed input to Phase 07).
- All "notification sent" / "message sent" / "payout disbursed" /
  "webhook received" behavior currently means "a `DbManager` record was
  created client-side"; none of it reaches a real external system.
- Demo/"Try as Role" sessions are explicitly kept off the real Firestore
  path for Users/Leads (good existing practice — generalize, don't
  regress).

## 9. Duplicated concepts

- Status/stage vocabularies duplicated per entity with no shared source
  (see §3).
- `Lead` and `Deal` are two separate, only loosely related entities that
  both represent stages of what the pack's target model calls a single
  `Project`/deal lifecycle.
- Payment-adjacent concepts are fragmented across `Payment`,
  `PaymentHistoryRecord`, `PaymentOverrideRecord`, `ScheduledPaymentEntry`,
  `SupplierPaymentRecord`, `PaymentMilestoneItem` with no shared
  "payment schedule → attempt → confirmation → receipt → ledger" model
  (this is exactly what Phase 08 asks to correct).
- Audit-like trails exist per-domain (`POStatusHistoryEntry`,
  `DisputeAuditEntry`, `ProductionStageHistory`, `SupplierScorecardDetail`
  history fields, etc.) instead of one `AuditEvent` model.

## 10. High-risk technical debt

1. **Forgeable session token** used as the primary identity mechanism for
   non-Firestore-backed screens (§5) — must be closed out before any real
   authorization work in Phase 05 can be trusted.
2. **No server-side authorization anywhere** except the 6 Firestore-ruled
   collections — every other mutation is enforceable only by the client
   choosing not to call it. This directly violates non-negotiable
   principle #8 today and is the direct subject of Phase 05.
3. **`DbManager` as a silent stand-in for production persistence** — nothing
   in the UI currently tells an operator that most of what they are
   editing evaporates on refresh. Must become an explicit, labeled demo
   mode per Phase 04's DEMO/SANDBOX/PRODUCTION requirement.
4. **No idempotency anywhere** — payments, POs, invoices, messages, and
   automation actions can all be triggered repeatedly with no
   deduplication (direct input to Phase 06).
5. **`server.ts` has zero authentication/authorization middleware** on any
   route, including the Gemini proxy endpoints (cost/abuse exposure) and
   the `/api/db/*` Firestore-reading endpoints.
6. **11,703-line single-file `DbManager`** is a maintenance and
   comprehension risk independent of the persistence question; any
   repository-layer migration (Phase 04) should peel domains out of it
   incrementally rather than attempt a single rewrite (principle #1).
7. **6,571 KB main JS bundle** (`vite build` warning) — a single
   non-code-split bundle; not this pack's primary concern, but relevant to
   Phase 12 production hardening and Phase 11 field-network reliability.

## 11. Recommended migration order

This matches the pack's own phase order, confirmed appropriate given the
above findings:

1. Canonical domain model + Project spine (Phase 02) — needed before any
   persistence work, or the repository layer will just persist the same
   fragmented shapes.
2. Workflow/state machine + screen registry (Phase 03) — needed before
   UX regrouping (Phase 10), or the five surfaces will be built on
   undefined transitions.
3. Repository layer for the Lead→Customer/Site→Project→Quote→Contract→
   Payment vertical slice (Phase 04), replacing the forgeable session
   token with real Firebase Auth-derived identity as part of the same
   effort where practical (pairs naturally with Phase 05).
4. RBAC + server-side authorization (Phase 05).
5. Audit/versioning/idempotency (Phase 06) — required before Phase 07's
   automation engine is allowed to run unattended.
6. Real event bus/workflow engine (Phase 07).
7. Commercial workflows (Phase 08), then operational workflows (Phase 09)
   wired to the engine from Phases 03/07.
8. Five-surface UX (Phase 10) only after 02–09 stabilize the underlying
   model, per `RUN_ALL.md`'s explicit warning not to do UX first.
9. Field reliability/media/notifications/reconciliation (Phase 11).
10. Control tower/search/observability/hardening (Phase 12).
11. Final acceptance (Phase 13).

## 12. Baseline verification (this phase)

- `npm install` — required; the checked-out `node_modules` was incomplete
  (1 entry) and had to be installed before any check below could run.
- `npx tsc --noEmit` — **passes, 0 errors** (project has no dedicated test
  runner; `package.json`'s `"lint"` script is itself `tsc --noEmit`).
- `npx vite build` — **succeeds** (dist output produced, PWA precache
  generated, single-chunk bundle warning noted in §10 item 7).
- No `*.test.*` / `*.spec.*` files exist in the repository — there is no
  automated test suite to run at this baseline. This is itself a gap
  worth naming, though adding a full test framework is out of scope
  unless a later phase specifically requires test coverage for new
  behavior (this pack does not mandate introducing a new test framework;
  where phases below add non-trivial logic — workflow transitions,
  authorization, idempotency — targeted `node`-runnable smoke checks are
  used instead and recorded in this log).

No source files were modified in this phase beyond adding the two
required documentation artifacts and this baseline record. The repository
was buildable before this phase and remains buildable after it.
