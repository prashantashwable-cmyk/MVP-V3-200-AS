# MVP Workflow Audit — AIEC V3 repository

Written **before** any MVP code, from a read of the V3 codebase as of commit
`fc505b8`. It answers one question: what in V3 can run a real, multi-user,
self-coordinating workflow, and what can't?

---

## 1. Current architecture (V3)

| Layer | What exists | Where |
|---|---|---|
| Frontend | React 19 + Vite + Tailwind SPA, 194 component files (~189 "screens"), role routers | `src/App.tsx` (2.5k lines), `src/components/*`, `src/routers/*` |
| Legacy data | `DbManager`: an 11.7k-line **browser `localStorage`** store with seed data | `src/lib/db.ts` |
| Canonical domain | 30 typed entities with branded IDs, plus adapters to the legacy types | `src/domain/entities.ts`, `ids.ts`, `adapters.ts` |
| Repository | `Repository<T>` interface: Firestore implementation, plus an in-memory "demo" implementation that lives only as long as the module | `src/repository/*` |
| Workflow definitions | 7 state machines stored as data (sales, quote, payment, procurement, installation, QC, handover), with a validator | `src/workflows/types.ts`, `src/workflows/definitions/*` |
| Event bus | In-process publish → handlers, with idempotency, retry and a dead-letter state | `src/events/bus.ts`, `handlers.ts` |
| Audit / idempotency | `recordAuditEvent()`, `runIdempotent()` | `src/lib/audit.ts`, `src/lib/idempotency.ts` |
| Offline | `Outbox` + `DurableStore` (IndexedDB and memory implementations), with conflict detection | `src/offline/*` |
| Services | control tower, work queue, project operating view, data quality, notifications, reconciliation | `src/services/*` |
| Server | Express: Gemini/maps proxy endpoints, and 3 Cloud-SQL read routes. **No auth middleware and no workflow endpoints** | `src/serverApp.ts`, `server.ts` |
| SQL schema | Drizzle/Postgres: `users`, `elevator_contracts`, `site_sops_and_inspections`, `audit_logs_master`, `breakdown_alerts_sos`. It needs Cloud SQL credentials and isn't used by the workflow code | `src/db/*` |
| Authz | Role→permission map (19 permissions × 5 roles), a client-side `authz.ts`, and `firestore.rules` as the only server-side boundary | `src/domain/permissions.ts`, `src/lib/authz.ts`, `firestore.rules` |
| Tests | ~60 `tsx` acceptance scripts (`npm run checks`). Most run against the in-memory demo repository | `scripts/*` |

### Roles
`UserRole = 'admin' | 'surveyor' | 'technician' | 'customer' | 'supplier'`. There is
no QC role: QC is a technician with `qc.approve`.

### Existing state machines (reusable as data)
- `installation`: assigned → job_brief → site_readiness → checked_in → safety → SOP → material usage → evidence → completion → qc_requested. Exception path: `blocked_site_not_ready`.
- `qc`: assigned → inspection → passed | snag_raised → rework → reinspection → compliance → handover_ready.
- `payment`: schedule → due → direct/loan → confirmed → receipt → ledger → reconciled. Exceptions: failed, disputed, overdue.
- `quote`, `sales`, `procurement`, `handover`: same pattern.

`validateWorkflowDefinition()` already catches dead-end states. It does **not**
check owner, SLA, evidence or failure policy. That is the gap detector this MVP adds.

### Existing automation
- 6 event types have real handlers. Example: `QUOTE_ACCEPTED` drafts a contract, and `PAYMENT_OVERDUE` escalates.
- Hard gates exist: handover requires QC passed, and procurement requires payment (Phase 52).
- The "work queue" (`services/workQueue.ts`) produces **one item per project**. Its owner is always the project's sales owner (`ownerUserId`), and its next action is static text by stage (`NEXT_ACTION_BY_STAGE`). Its "SLA" is only a days-in-stage heuristic.

---

## 2. What already works (and is reused)

| V3 asset | Status | MVP reuse |
|---|---|---|
| `WorkflowDefinition` / `canTransition` / `validateWorkflowDefinition` | Clean, pure, tested | **Imported directly** by the MVP project lifecycle |
| `Outbox` + `DurableStore` + IndexedDB/memory stores | Clean, pure, tested | **Imported directly** by the MVP technician client (offline evidence) and the offline test |
| `CanonicalUserRole` vocabulary | Clean | Reused. MVP roles are a subset (admin/technician/customer/supplier) |
| Stage vocabulary and hard-gate ideas (QC before handover, payment before procurement, evidence before completion) | Proven by the Phase 52 attack tests | Re-expressed as MVP payment and evidence gates |
| Control-tower categories (`critical`/`at_risk`/`waiting`/`on_track`) | Good vocabulary | Reused as exception severities |
| Seed personas (Prashant/Admin, Rajesh/Technician, Sun Elevators/Supplier, Rohan/Customer) | Seed data | Reused as MVP demo users |

## 3. What must be simplified or left out

| V3 thing | Why not in MVP |
|---|---|
| 189 screens and 5 "operating surfaces" | The MVP needs one "next action" screen per role and one Control Tower |
| `DbManager` (localStorage) | Browser-local, so each user sees a different "truth". It can't be multi-user |
| Dual-write bridge (legacy + canonical) | Migration machinery, not workflow |
| Firestore repository | Needs live credentials that aren't available here. Phases 43–45 of V3 record this as BLOCKED |
| 30 canonical entities | The MVP needs ~9 tables (see `MVP_ARCHITECTURE.md`) |
| Gemini endpoints, maps, heatmaps, gamification, NBFC, IoT containers, AMC, training, recruitment | Out of MVP scope (prompt §24) |

## 4. Where the workflow breaks today (the real gaps)

1. **No server-side source of truth for workflow.** State lives in each browser (`localStorage`) or in the in-memory demo repository. A technician completing a task on one device **cannot** move the project forward for the customer on another device unless Firestore is live, and Firestore is not verified in this environment. This is the single biggest blocker to "multiple real users".
2. **No work item assigned to a person.** The work queue is per project and owned by the sales owner. Nothing assigns clearance to *Technician 103* or dispatch to *Supplier A*.
3. **No deadlines, reminders, escalations or reassignment.** No scheduler runs, so a task no one touches waits forever. This breaks "no silent failure" (§7).
4. **Next step comes from a human reading a stage label.** `NEXT_ACTION_BY_STAGE` is prose. Nothing *creates* the next task when the previous one completes.
5. **Evidence exists but is not a gate.** V3 screens capture photos, but completion isn't blocked by evidence validation on a server.
6. **Payment status can be set from the UI** (the legacy screens write `DbManager` payment flags directly). This breaks the money safety rule (§14).
7. **The server has no authentication** (documented by V3 itself in FINAL-OPERATING-MODEL §8). Role scoping exists only in the frontend and in firestore.rules.
8. **No measure of automation.** Nothing counts Admin interventions or automatic transitions.
9. **No workflow gap detection.** The validator checks graph shape only, not owner, SLA, evidence, retry or escalation.
10. **The location-based ID scheme (`MH-PUN-KOT-LIFT-001`) is specified but not implemented.** V3 uses `lead_1`, `proj_…` and random suffixes.

## 5. Where human (Admin) intervention is currently required

Every stage handoff is manual in V3. Each one maps to an MVP rule:

| Hand-off | V3 today | MVP rule that removes it |
|---|---|---|
| Lead → quote | Admin/surveyor builds a quote | Auto-qualify, then an auto-quote engine with a margin floor |
| Quote accepted → token | Admin chases | Payment work item with an SLA and reminders |
| Token → clearance | Admin picks a technician | Auto-assign the least-loaded active technician, nearest first |
| Technician silent | Admin phones them | Reminder → escalation → auto-reassign |
| Clearance → dispatch | Admin raises a PO | Supplier dispatch task auto-created |
| Dispatch → receipt → installation | Admin coordinates | Chained work items gated by evidence and payment |
| QC fail | Admin assigns rework | Auto-rework to the installer, then auto re-QC |
| Handover → final payment | Admin chases | Customer tasks with an SLA and escalation |

## 6. Rules missing for 95% automation

1. Task-type catalog with owner role, assignment strategy, SLA, evidence spec, validator, success and failure transitions, retry, escalation and reassignment.
2. Deterministic scheduler: reminder → escalate → reassign → Admin exception.
3. Invariant: every active project has exactly one open work item with an owner, a deadline and a completion condition.
4. Evidence validator (rule-based now; a slot for computer vision later).
5. Payment gates enforced server-side, with no free-form payment status writes.
6. Intervention ledger with a cause category, driving the "automation improvement" loop.

## 7. Recommended MVP extraction strategy (the smallest architecture that proves the loop)

- **New isolated folder `mvp/`.** V3 code is left untouched; the MVP imports only the pure V3 modules listed in §2.
- **One Node process** (Express, already a dependency) owns all workflow state. It persists to **SQLite via Node's built-in `node:sqlite`**, which adds no new dependency and survives restarts. It also runs transactions, so two users can't both perform the same transition.
- **Deterministic engine** plus a **scheduler tick**, with a **demo clock** that can be fast-forwarded so SLAs can be shown in minutes.
- **Token-based auth** checked on every endpoint. Scoping (own work, own project, own money) happens on the server.
- **One small React client** (React is already a dependency), bundled at startup by esbuild (already a dependency). Polling keeps multiple users in sync. The technician's evidence is kept offline in IndexedDB via V3's `Outbox`.
- **Tests via `node:test`** (built in): the 10 failure scenarios, the gap test and a multi-user HTTP E2E.
