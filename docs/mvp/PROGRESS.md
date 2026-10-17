# MVP PROGRESS LOG

> Claude updates this at the end of **every** step, and reads it at the start of every session.
> The Owner can also write notes here, for example approvals or changed decisions.

## Current position
- **Last completed step:** 13 Implementation report (2026-10-17)
- **Next step:** 14 Go-live (Owner-run checklist in `MVP_IMPLEMENTATION_REPORT.md` §13)
- **Blocked on Owner:** — (optional: confirm or change the audit §8 defaults, especially Q2, the live deployment)

## Step status
| Step | Title | Status | PR | Date | Notes |
|---|---|---|---|---|---|
| 00 | Bootstrap and baseline | DONE | MVP Step 00 draft PR | 2026-09-24 | Baseline all green; emulator works |
| 01 | Audit (Phase A) | DONE | PR #27 | 2026-10-17 | Approved without changes; §8 defaults stand |
| 02 | Plan (Phase B) | DONE | PR #27 | 2026-10-17 | Owner: "Don't stop until the build is finished", so treated as approved |
| 03 | Data foundation | DONE | PR #27 | 2026-10-17 | src/mvp + order service + rules; mvp:checks 833/833, emulator 83/83 |
| 04 | Order View, Admin dashboard, MVP_MODE | DONE | PR #27 | 2026-10-17 | Task-driven Order View in the Owner's reference style; dashboard; MVP_MODE nav |
| 05 | Leads, Sales and Survey | DONE | PR #27 | 2026-10-17 | Leads screen, qualify, survey panel |
| 06 | Quote, Booking and Payments | DONE | PR #27 | 2026-10-17 | Quote builder (cost Admin-only), approval, decision, milestones |
| 07 | Site-ready, Supplier and Delivery | DONE | PR #27 | 2026-10-17 | Readiness, PO, delivery, suppliers |
| 08 | Technician, Installation and Blockers | DONE | PR #27 | 2026-10-17 | My work, START gate, 11-item checklist, blockers, Storage evidence |
| 09 | QC, Handover and AMC | DONE | PR #27 | 2026-10-17 | QC pass/rework/fail, handover gates + licence, AMC, emergency |
| 10 | Customer portal, Owner view, Notifications, Reports, Languages | DONE | PR #27 | 2026-10-17 | Role-filtered Order View, alerts, reports; MVP strings en/mr/hi (field/customer) |
| 11 | Security, Compliance and Production hardening | DONE | PR #27 | 2026-10-17 | Rules + emulator tests, storage.rules, Google-only production login, Gemini off |
| 12 | Test and Verify (Phases D and E) | DONE | PR #27 | 2026-10-17 | mvp:checks 852, emulator 99, legacy 42/42, browser drive 17/17 |
| 13 | Implementation report and roadmap (Phase F) | DONE | PR #27 | 2026-10-17 | MVP_IMPLEMENTATION_REPORT.md |
| 14 | Go-live readiness and first real lift | TODO | | | Owner-run checklist: MVP_IMPLEMENTATION_REPORT.md §13 |

## Commands (filled in by Step 00)
Environment at baseline: Node v22.22.2, npm 10.9.7, OpenJDK 21.0.10, firebase-tools 15.31.0 (via `npx`), Chromium at `/opt/pw-browsers`.
Package manager: **npm** (`package-lock.json`). `bun.lock` is kept for now; Step 01 decides whether to delete it.

| Purpose | Command | Works in the cloud session? |
|---|---|---|
| Install | `npm ci` (the SessionStart hook `.claude/hooks/session-start.sh` runs it automatically) | Yes, ~13-19 s cold, 0 s when already installed |
| Dev server | `npm run dev` (Express + Vite middleware on port 3000) | Yes, HTTP 200 within ~3 s. Warns that `GEMINI_API_KEY` is unset and falls back to demo mode |
| Type check / lint | `npm run lint` (`tsc --noEmit`) | Yes, pass, ~9 s |
| Build | `npm run build` (vite build + esbuild server bundle) | Yes, pass, ~19 s |
| MVP checks | `npm run mvp:checks` (pure, rules table, scenarios S1–S7/S9/S10 on the demo repository) | Yes, ~5 s |
| MVP emulator checks | `npm run mvp:emulator` (S8 rules + S1 through the real service and rules, Firestore and Auth emulators, `demo-aie-mvp`) | Yes, ~40 s |
| Legacy checks | run each non-`live-*` script from `npm run checks` individually (loop below). **Never** run `npm run checks` as a whole: it includes `live-*` scripts | Yes, 42/42 pass, ~104 s total |
| Emulator | `npx -y firebase-tools@15.31.0 emulators:exec --config firebase.emulator.json --project demo-aie-mvp --only firestore,auth,storage "<cmd>"` | Yes, starts in ~19 s (first run downloads the emulator JARs) |
| E2E | Playwright is not installed as a dependency. Chromium is at `$PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`. Do not run `playwright install` | Browser available; no E2E harness yet |

Legacy-check loop (skips `lint` and every `live-*` script):
```bash
for s in $(node -e 'console.log(require("./package.json").scripts.checks.split("&&").map(s=>s.trim().replace("npm run ","")).join(" "))'); do
  case $s in lint|live-*) continue;; esac
  npm run $s >/tmp/$s.log 2>&1 && echo "PASS $s" || echo "FAIL $s"
done
git checkout -- docs/architecture docs/migration docs/production  # some checks rewrite "Regenerated:" dates
```

## Baseline (filled in by Step 00, before any code change)
Taken on 2026-09-24 at `main` `fc505b8`, with no application code changed.

| Command | Result | Duration |
|---|---|---|
| `npm run lint` | PASS | 9 s |
| `npm run build` | PASS (large-bundle warning only) | 19 s |
| 42 non-live checks from `npm run checks` | 42 PASS / 0 FAIL | 104 s total |
| `npm run dev` + `curl localhost:3000` | HTTP 200, title "AIEC — All India Elevators" | ~3 s to ready |
| Emulator `emulators:exec ... "echo ok"` | PASS (`ok`, exit 0) | 19 s |

- Checks that passed at baseline: all 42 non-live scripts in the `checks` chain: domain, workflow:validate, repository, authz, audit, eventbus, commercial, operations, surfaces, offline, reliability, controltower, e2e, migration, bridge, procurement-bridge, delivery-bridge, installation-qc-handover-bridge, portal-summary, operating-surfaces-home, project-operating-view, work-queue, production-demo-gate (20 s), production-bundle-bypass (36 s), legacy-authz-remediation, destructive-action-safety, transactional-idempotency, hard-gate-attack, dual-write-reconciliation, dual-write-cutover, legacy-read-migration, legacy-write-reduction, legacy-database-elimination, final-company-simulation-multi, code-splitting (17 s), security-hardening, integration-boundaries, global-search, data-quality-phase26, dbmanager-remaining, navigation-cutover, simulation:full-company. Each ran against the in-memory demo repository (`environment: 'demo'`). None touched Firestore.
- Checks that failed at baseline (pre-existing, not ours): none.
- Checks skipped (need credentials / touch the real project): `live-firebase-auth:check`, `live-firestore-authz:check`, `live-concurrency-idempotency:check`, `live-e2e:check` (all `live-*`, D-19).
- Side effect: `dual-write-reconciliation`, `dual-write-cutover`, `legacy-read-migration`, `legacy-database-elimination` and the migration matrix rewrite the `Regenerated:` date in 5 docs under `docs/architecture`, `docs/migration` and `docs/production`. Revert those after running them.

## Decision changes (Owner-approved deviations from DECISIONS.md)
| Date | Decision | Change | Why |
|---|---|---|---|
| 2026-10-17 | D-04 | Leads go in the new `canonical_leads` collection | No mixed shapes in the legacy `leads` collection (plan §10) |
| 2026-10-17 | D-13 | Google only in production; roles by Admin invite | Audit F-1, F-2, F-3 |
| 2026-10-17 | D-12 | `qc.approve` added to `qc`, kept on technician | Additive only |
| 2026-10-17 | D-14 | New `payment_milestones` collection | Per-milestone status and proof |
| 2026-10-17 | D-16 | Storage built, not reused | Audit F-6 |
| 2026-10-17 | D-31 | Task panels in the Order View instead of rewiring ★ screens | Plan §1 |

## Open issues / known gaps
| # | Issue | Found in step | Severity | Plan |
|---|---|---|---|---|
| 1 | Emulator tooling (Java, firebase-tools, emulator JARs) is not cached in the image. Each fresh session downloads firebase-tools (~27 s) and the JARs (~10 s) on first use | 00 | Low | Optional: add the setup-script lines from the kit README to the environment to preinstall them |
| 2 | ~~`emulator/storage.rules` placeholder~~ Fixed in Step 11: real `storage.rules`, used by the emulator config. Reads are capability links because Storage rules cannot look up the named Firestore database | 00 | Medium | Phase 2: signed-URL Cloud Function |
| 3 | Some legacy checks rewrite "Regenerated:" dates in tracked docs | 00 | Low | Revert after running; Step 01 can decide whether to keep these generators |
| 4 | Both `bun.lock` and `package-lock.json` exist. npm was chosen (package-lock updated most recently in phase 57; `bun.lock` was last touched in phase 17; the earlier pack's logs use npm) | 00 | Low | Step 01 audit decides whether to delete `bun.lock` |
| 5 | The Owner supplied a conversation-style Order View reference (image and handoff package), saved under `docs/mvp/design/order-view-conversation/`. Parts of it are out of Phase 1 scope (quote bot, GPS tracking, chat composer) | pre-01 (2026-10-16) | Low | Step 04 uses it as design input, following `DESIGN_NOTES.md`. Not built before Step 04 (Owner's choice) |
| 6 | Firestore rules cannot make the client fully trustworthy: a participant can still write the fields their role is allowed (there is no server) | 03 | Medium | Accepted for 10–20 orders; Phase 2 moves the order service behind Cloud Functions |
| 7 | Storage reads are capability links (any signed-in user with the exact path) | 11 | Medium | Phase 2 signed-URL Cloud Function; re-test on the live project after deploy |
| 8 | `firestore.rules` and `storage.rules` are not deployed from this session (D-19) | 11 | High | Owner deploys them at go-live (report §13), then smoke-tests with test logins |
| 9 | Marathi and Hindi MVP strings need native review; the Admin screens are English only | 10 | Low | Owner review |

## Step notes
<!-- Claude appends one block per step: what changed, checks run and their results, deviations, follow-ups. -->

### Step 00: Bootstrap and baseline (2026-09-24)
- Installed the kit from the zip attached to the session: `CLAUDE.md`, `docs/mvp/*` (including `future/`), `.claude/agents/mvp-scope-guard.md`, and `docs/mvp/prompts/` (00–14 plus `utilities/U1–U5`). There was no earlier root `CLAUDE.md`, so nothing needed merging.
- Added the SessionStart hook: `.claude/hooks/session-start.sh` and `.claude/settings.json`. It runs only when `CLAUDE_CODE_REMOTE=true`, runs `npm ci` when `node_modules` is missing or older than `package-lock.json`, and skips otherwise. Tested cold (13 s) and warm (0 s).
- Added emulator-only config (D-19): `firebase.emulator.json` (Auth 9099, Firestore 8080, Storage 9199, UI off, uses the existing `firestore.rules`) and `emulator/storage.rules`. These always run under the `demo-aie-mvp` project ID, so they cannot reach a real project. There is no `firebase.json` or `.firebaserc`, and no production Firebase setting was changed.
- No application code changed. No `live-*` script was run.

### Step 01: Audit (2026-10-16; approved 2026-10-17)
- Read-only on application code. Wrote `docs/mvp/MVP_SIMPLIFICATION_AUDIT.md` and corrected 9 rows of `REUSE_MAP.md` in place (marked *(Step 01)*).
- Ran in the same session and PR as the Order View design input (PR #27), because this session has one branch.
- Method: a scan of all 194 `src/components/*.tsx` files for `DbManager`, canonical and bridge usage and router mounting, plus targeted reads. Result: 142 `DbManager` screens, 16 bridged, 3 canonical, 50 with no store; 189 routed.
- Classification: KEEP 8, SIMPLIFY 46, DISABLE 139, DELETE 1 (`CustomReportBuilder`, pending Step 02 confirmation).
- Main findings:
  - **F-1:** a new user's role is saved only in their own browser
  - **F-2:** the rules let a user self-claim `surveyor`
  - **F-5:** customers can't read their own canonical order
  - **F-6:** no Firebase Storage integration exists (REPO_FACTS was wrong)
  - **F-3:** phone OTP and email/password logins are simulated
- Read-only Vercel lookup: 9 projects in the team, none Git-linked to this repo (Owner question 2).
- Checks: none run (docs only; no application code changed). No `live-*` script was run.
- **Approval (2026-10-17):** the Owner replied "Approved" with no changes, so the audit stands as written. The Owner didn't answer the §8 questions individually, so each one's stated default applies until the Owner changes it. DECISIONS.md is unchanged; Step 02 decides on the 7 recommended changes (audit §6) and freezes them.

### Step 02: Plan (2026-10-17)
- Wrote `docs/mvp/MVP_REFACTOR_PLAN.md`: architecture, additive data model, role matrix, rules automation, screen plan, hide plan, check plan, step breakdown, manual list, frozen decisions and risks.
- The Owner told me to continue through the build without stopping, so the plan is treated as approved. The steps run in this one session and all commits go into PR #27.

### Step 03: Data foundation (2026-10-17)
- **New `src/mvp/`:**
  - `types`, `config` (D-09 due dates; `GST_RATE_PCT` deliberately unset ⚖), `stage` (D-03), `progress` (D-10), `health` (D-11 plus the current-task rule), `money` (D-14/D-15), `rules` (the D-08 table, pure and idempotent), `repo`, `views`
  - `service/{core,sales,field,admin}`, the only place stage, status and tasks change. Every command checks permissions, applies the rules, writes through the canonical repositories and writes an audit event.
- **Canonical changes (additive only):**
  - `ProjectStage` gets `survey` and `site_ready`.
  - Roles gain `owner`, `sales` and `qc` (in `CanonicalUserRole`, `UserRole` and the permission map).
  - `Project` gains optional MVP fields.
  - New permissions; `User.customerId`; `Task` and `Blocker` re-exported from `entities.ts`.
- **Repository:**
  - `queryWhere` (equality and array-contains).
  - Firestore `update` is now transactional (audit F-4) and returns the merged record.
  - Order-code counter `counters/orders`.
- **`firestore.rules`:**
  - Rules for 17 new collections.
  - `users` self-create narrowed to `pending_selection` or the invited role (F-2).
  - Owner, participants and the order's own customer can read orders, customers and sites (F-5).
  - Owner can read audit logs.
  - MVP idempotency records are readable.
  - The legacy `authz:check` guard is kept.
- **`src/lib/firebase.ts`:** connects to the emulator, under a `demo-aie-mvp` project id, only when an emulator host is set (D-19).
- **Interpretations recorded:**
  - COLLECT_DELIVERY_PAYMENT is due 2 days after the site is confirmed for delivery, which is what S5's expected AT_RISK result needs.
  - The current task is the primary task of its rule row first, then the earliest due date (S1 step 7 expects SITE_READINESS, not RAISE_PO).
- **Checks run:**
  - `npm run lint` PASS
  - `npm run build` PASS
  - `npm run mvp:checks` PASS (pure 52, rules 30, scenarios 751)
  - `npm run mvp:emulator` PASS (rules S8 39, S1 through the service, real rules and sign-ins 44)
  - 42/42 legacy checks PASS (`authz:check` failed once on a text guard and passed after the guard was put back)
  - Backfill dry run and apply on demo, re-run idempotent

### Steps 04–13 (2026-10-17, one session at the Owner's instruction "Don't stop until the build is finished")
- **Step 04:**
  - `MVP_MODE` (default on) filters `getTabsByRole`, the sidebar, mobile nav and command palette to 4–7 MVP tabs per role. The legacy lists are unchanged when it is off. Hidden tabs fall back to the role's landing tab.
  - The Order View (`src/components/mvp/OrderView.tsx`) follows the Owner's reference: stage rail, the spec §8 summary, the current task with its action panel, a feed of real updates, and payments, blockers, tasks, documents, AMC and audit.
  - The Admin dashboard has TODAY, NEEDS ATTENTION (every non-ON_TRACK order, D-11) and PIPELINE.
- **Steps 05–10:** one action panel per task type (`src/components/mvp/panels/*`), plus the Leads, My work, Alerts, Reports/Owner view and Team & settings screens (invites, on-call, emergency number, GST ⚖, survey fee, suppliers).
- **Step 08:** evidence uploads to Firebase Storage under `orders/{id}/<uid>_<random>`, compressed on the device; demo mode keeps a data URL instead.
- **Step 11:**
  - `storage.rules`; invite-based roles on first Google sign-in, and *Waiting for a role* for uninvited sign-ins.
  - Production builds offer Google sign-in only (no Try-as-Role, no simulated OTP or password).
  - `/api/gemini/*` is off unless `AIEC_ENABLE_GEMINI=true`.
- **Step 12:**
  - `checks:legacy` split (10 checks moved; nothing deleted).
  - `scripts/mvp/ui-drive.cjs`: Chromium drive with no new dependency.
  - `OWNER_UAT_SCRIPT.md`; screenshots in `docs/mvp/screenshots/`.
- **Step 13:** `MVP_IMPLEMENTATION_REPORT.md`.
- **Bugs found and fixed by the browser drive:**
  - Opening an order from another tab raced the lazily loaded Orders screen; it now uses a pending-open handoff.
  - Compliance rows showed stale values after a save.
  - At-risk orders were missing from Needs Attention.
- **Checks run (final):**
  - `npm run lint` PASS
  - `npm run build` PASS
  - `npm run mvp:checks` 852/852 PASS
  - `npm run mvp:emulator` 99/99 PASS
  - All 42 non-live checks from `checks` + `checks:legacy` PASS
  - Browser drive 17/17 steps PASS (demo build)
  - No `live-*` script was run. Nothing touched `dogwood-torus-v71nt`.
- **Scope guard (checklist):** no new dependency, no file deleted, no secrets, no `DbManager` in MVP code, no Phase 1 "do not build" item added.
- **Deviation:** Steps 03 and 04 each exceeded the ~25-file / 1,500-line guideline. They were kept whole because the Owner asked not to stop.
