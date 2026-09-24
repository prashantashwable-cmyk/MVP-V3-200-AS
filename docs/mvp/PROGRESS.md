# MVP PROGRESS LOG

> Claude updates this at the end of **every** step, and reads it at the start of every session.
> The Owner can also write notes here, for example approvals or changed decisions.

## Current position
- **Last completed step:** 09 QC, Handover and AMC (draft PR #13)
- **Next step:** 10 Customer portal, Owner view, Notifications, Reports, Languages. Branch `claude/mvp-step-10-customer-owner-i18n` from `claude/mvp-step-09-qc-handover-amc`; PR base = that branch.
- **Mode:** the Owner said "Do autonomously" (2026-09-24). Claude runs Steps 02–11 in sequence, self-approving each gate with the recommended defaults, as stacked draft PRs. It still stops for anything on CLAUDE.md's "stop and ask" list that the approved plan doesn't cover.
- **Owner standing instructions (2026-09-24):**
  - Every step must include screenshots, sent to the Owner in chat.
  - Every step must include a verified `npm run build`.
  - See CLAUDE.md step protocol items 4 and 8.
- **Blocked on Owner:** still needed before go-live:
  - the emergency phone number (audit §8 Q7)
  - `VITE_APP_ENV=production` set in Vercel
  - Firebase Storage and backups enabled (Q3)
  - the GST rate (⚖ VERIFY with the CA)

## Handoff notes (for any model or session picking this up)
- **Stacked draft PRs, none merged:**

  | PR | Step |
  |---|---|
  | #3 | 01 |
  | #4 | 02 |
  | #5 | 03a |
  | #6 | 03b |
  | #7 | 04a |
  | #8 | 04b |
  | #9 | 05 |
  | #10 | 06 |
  | #11 | 07 |
  | #12 | 08 |
  | #13 | 09 |

  Each PR's base is the previous step's branch. Start a new step's branch from the latest step branch, not from `main`.
- **Where things are:**
  - Services: `src/mvp/services/*`
  - Screens: `src/mvp/screens/*`. Add stage panels to `OrderExtras.tsx`, and new tabs to `mvpMode.ts` and `MvpRouter.tsx`.
  - Scenario driver: `scripts/mvp/scenario.ts` `runS1(ctx, clock, step)`. Step 13a = 13.5, 13b = 13.9. Extend it for steps 14+.
  - Fixtures: `scripts/mvp/fixtures.ts`.
  - Each step adds `scripts/mvp-<name>-check.ts` and wires it into `mvp:checks` in package.json.
  - Rules tests: `scripts/mvp-rules-emulator-check.ts`, run with `npm run mvp:rules`.
- **Screenshots:**
  1. Start the dev server in the background with `npm run dev`.
  2. Run `node scripts/mvp/screenshot.mjs "http://localhost:3000/?demoRole=<role>" docs/mvp/screenshots/step-NN/<name>.png 390 <height> ["button text to click" ...]`.
  3. Stop the server with `ps -eo pid,args | grep "[t]sx server" | awk '{print $1}' | xargs -r kill`. Don't use `pkill -f`, which kills its own shell.
  4. Send the PNGs to the Owner.
- **Step 10 should add:** a demo order at AMC bound to a second demo customer, so EmergencyButton/AmcPanel are screenshot-able via `?demoRole=customer` (open issue 17); decouple `language.ts` from DbManager; the overdue/digest notification scan.
- **Step 11 must add:**
  - `onlyKeys` limits on technician `installation_jobs` updates, and a 0–11 bound on `checklistDone` (open issue from Step 08)
  - scope `qc_inspections` create to `isParticipantOf(projectId)` (open issue 15, Step 09)
  - the final S8 rules suite and `mvp-audit-coverage-check.ts`

## Step status
| Step | Title | Status | PR | Date | Notes |
|---|---|---|---|---|---|
| 00 | Bootstrap and baseline | DONE | MVP Step 00 draft PR | 2026-09-24 | Baseline all green; emulator works |
| 01 | Audit (Phase A) | DONE | #3 | 2026-09-24 | Owner approved with no changes; §8 defaults accepted |
| 02 | Plan (Phase B) | DONE | MVP Step 02 draft PR | 2026-09-24 | Self-approved per the Owner's autonomous instruction |
| 03 | Data foundation | DONE | 03a + 03b draft PRs | 2026-09-24 | Split in two (size rule). mvp:checks 3/3, mvp:rules 51/51, 42/42 legacy |
| 04 | Order View, Admin dashboard, MVP_MODE | DONE | 04a + 04b draft PRs | 2026-09-24 | Split in two (file-count rule). mvp:checks 5/5 + backfill, 42/42 legacy |
| 05 | Leads, Sales and Survey | DONE | MVP Step 05 draft PR | 2026-09-24 | mvp:checks 6/6 + backfill, mvp:rules 66/66, 42/42 legacy |
| 06 | Quote, Booking and Payments | DONE | MVP Step 06 draft PR | 2026-09-24 | mvp:checks 7/7 + backfill, mvp:rules 69/69, 42/42 legacy |
| 07 | Site-ready, Supplier and Delivery | DONE | MVP Step 07 draft PR | 2026-09-24 | mvp:checks 8/8 + backfill, mvp:rules 71/71, 42/42 legacy |
| 08 | Technician, Installation and Blockers | DONE | MVP Step 08 draft PR | 2026-09-24 | mvp:checks 9/9 + backfill, mvp:rules 80/80, 42/42 legacy |
| 09 | QC, Handover and AMC | DONE | MVP Step 09 draft PR | 2026-09-24 | mvp:checks 10/10 + backfill, mvp:rules 102/102, 42/42 legacy |
| 10 | Customer portal, Owner view, Notifications, Reports, Languages | TODO | | | |
| 11 | Security, Compliance and Production hardening | TODO | | | |
| 12 | Test and Verify (Phases D and E) | TODO | | | |
| 13 | Implementation report and roadmap (Phase F) | TODO | | | |
| 14 | Go-live readiness and first real lift | TODO | | | Owner-run checklist |

## Commands (filled in by Step 00)
Environment at baseline: Node v22.22.2, npm 10.9.7, OpenJDK 21.0.10, firebase-tools 15.31.0 (via `npx`), Chromium at `/opt/pw-browsers`.
Package manager: **npm** (`package-lock.json`). `bun.lock` is kept for now; Step 01 decides whether to delete it.

| Purpose | Command | Works in the cloud session? |
|---|---|---|
| Install | `npm ci` (the SessionStart hook `.claude/hooks/session-start.sh` runs it automatically) | Yes, ~13-19 s cold, 0 s when already installed |
| Dev server | `npm run dev` (Express + Vite middleware on port 3000) | Yes, HTTP 200 within ~3 s. Warns that `GEMINI_API_KEY` is unset and falls back to demo mode |
| Type check / lint | `npm run lint` (`tsc --noEmit`) | Yes, pass, ~9 s |
| Build | `npm run build` (vite build + esbuild server bundle) | Yes, pass, ~19 s |
| MVP checks | `npm run mvp:checks` (demo repository) and `npm run mvp:rules` (Firestore emulator, ~40 s) | Yes |
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
| 2026-09-24 | D-04 | Lead store = existing Firestore `leads` (extended), `CanonicalLead` deprecated | Only real shared lead data (audit R-1) |
| 2026-09-24 | D-13 | Google sign-in + Admin invite list only; OTP/password hidden | Those logins are client-side fakes (audit R-3) |
| 2026-09-24 | D-16 | Evidence inline in Firestore `documents` (≤ 900 KB) instead of Storage | Storage rules can't check participants here (plan §10) |
| 2026-09-24 | D-12 (addition) | Participant model via `Project.participantIds` | Needed for rules-based per-order access |
| 2026-09-24 | D-21 | Pilot = Vercel | Audit default; live today |
| 2026-09-24 | D-08 (row "Survey REQUIRES_CORRECTION") | When the customer completes the correction, create ASSIGN_SURVEYOR → Admin (one-click re-assign) instead of SURVEY directly | A customer's action must not grant a surveyor access to the order (firestore.rules, Step 03 scope-guard fix) |

## Open issues / known gaps
| # | Issue | Found in step | Severity | Plan |
|---|---|---|---|---|
| 1 | Emulator tooling (Java, firebase-tools, emulator JARs) is not cached in the image. Each fresh session downloads firebase-tools (~27 s) and the JARs (~10 s) on first use | 00 | Low | Optional: add the setup-script lines from the kit README to the environment to preinstall them |
| 2 | `emulator/storage.rules` is an emulator-only placeholder (signed-in users can read and write). The repo has no real `storage.rules` | 00 | Medium | Step 11 designs real Storage rules |
| 3 | Some legacy checks rewrite "Regenerated:" dates in tracked docs | 00 | Low | Revert after running; Step 01 can decide whether to keep these generators |
| 4 | Both `bun.lock` and `package-lock.json` exist. npm was chosen (package-lock updated most recently in phase 57; `bun.lock` was last touched in phase 17; the earlier pack's logs use npm) | 00 | Low | Audit decision: delete `bun.lock` in Step 03 |
| 5 | F-1: `users` create rule lets a signed-in user self-assign any non-admin role and status (e.g. surveyor, which can read all customers and sites) | 01 | **High** | Step 03/11 rules fix, with emulator tests |
| 6 | F-3/F-4: "Try as Role" is not build-gated, and the live Vercel build probably lacks `VITE_APP_ENV=production` (env vars unreadable: Vercel connector 403) | 01 | High | Owner sets the env var; Step 04 hides the demo tab in production; Step 11 verifies |
| 7 | F-8: non-admin whole-collection `list()`/`subscribe()` are denied by the rules | 01 | High | MVP queries filter by assignee/participant (audit R-6) |
| 8 | F-9: no Firebase Storage integration and no `storage.rules`; lead photos are base64 inside Firestore docs | 01 | High | Build the Storage transport + rules (Steps 03/08/11); Owner enables the bucket |
| 9 | F-12: `/api/gemini/*` and `/api/db/*` have no auth | 01 | Medium | Disable them under `MVP_MODE` (audit R-8) |
| 10 | F-5: the localStorage session token restores any local user without Firebase verification | 01 | Medium | Step 04/11 |
| 11 | F-11: GST 18% hard-coded in 26 components ⚖ | 01 | Medium | Config value + warning (D-15); legacy screens hidden |
| 12 | `firestore.rules` changes only take effect when deployed. Deploying rules is an Owner action (Firebase console or `firebase deploy --only firestore:rules`) | 03 | High | Add to the go-live checklist (Step 14). Deploy them together with the MVP build, not before: legacy surveyors lose read access to all customers/sites (F-1 fix) |
| 13 | Pre-existing rules bug: `request.auth.token.role` threw for tokens without a role claim, so `getUserRole()` errored and admins other than the owner email were always denied | 03 | High (fixed) | Fixed in 03b with safe `.get()` lookups; the emulator check covers it |
| 14 | Participants can write limited workflow fields client-side (rules restrict keys and forward-only stages); no server-side API | 03 | Medium | Accepted for invited-only users (plan §11); Phase 2 option: verified server API |
| 15 | `qc_inspections` create has no order-scoping (`isTechnician()`, a legacy Phase 35 rule predating the MVP participant model): any technician/QC/admin can create an inspection record for any order, not just their own | 09 | Medium | Step 11: scope it to `isParticipantOf(projectId)` |
| 16 | AMC status transitions (WARRANTY→AMC_OFFERED→AMC_ACTIVE/AMC_LOST) are not sequence-enforced; the Admin can set any of the three non-WARRANTY values at any time | 09 | Low | Acceptable for a manual, rarely-used Admin action; revisit if AMC volume grows |
| 17 | No customer-facing demo order reaches AMC (the demo customer login stays bound to AE-1003, mid-installation, to keep Step 08's screenshots valid), so EmergencyButton/AmcPanel aren't reachable via the demo "Try as customer" flow. Fully covered by `mvp-qc-handover-check.ts` instead | 09 | Low | Optional in Step 10: add a demo order at AMC bound to a second demo customer |

## Step notes
<!-- Claude appends one block per step: what changed, checks run and their results, deviations, follow-ups. -->

### Step 00: Bootstrap and baseline (2026-09-24)
- Installed the kit from the zip attached to the session: `CLAUDE.md`, `docs/mvp/*` (including `future/`), `.claude/agents/mvp-scope-guard.md`, and `docs/mvp/prompts/` (00–14 plus `utilities/U1–U5`). There was no earlier root `CLAUDE.md`, so nothing needed merging.
- Added the SessionStart hook: `.claude/hooks/session-start.sh` and `.claude/settings.json`. It runs only when `CLAUDE_CODE_REMOTE=true`, runs `npm ci` when `node_modules` is missing or older than `package-lock.json`, and skips otherwise. Tested cold (13 s) and warm (0 s).
- Added emulator-only config (D-19): `firebase.emulator.json` (Auth 9099, Firestore 8080, Storage 9199, UI off, uses the existing `firestore.rules`) and `emulator/storage.rules`. These always run under the `demo-aie-mvp` project ID, so they cannot reach a real project. There is no `firebase.json` or `.firebaserc`, and no production Firebase setting was changed.
- No application code changed. No `live-*` script was run.

### Step 01: Audit, Phase A (2026-09-24), DONE
- Read-only on application code. Created `docs/mvp/MVP_SIMPLIFICATION_AUDIT.md`. Corrected `docs/mvp/REUSE_MAP.md` in place, as the step prompt's item 8 asks ("Step 01:" notes; new mark ◐). REPO_FACTS differences are recorded in audit §10 and the file itself was left as the pre-inspection snapshot.
- Key findings: only `leads` and `users` are really shared today. The 16 ★ bridges are soft-fail shadow writes. There is no Storage integration. The payment gateway is simulated. Customers have no rules access to canonical data. There is a self-role-claim hole in the `users` rules. "Try as Role" is not build-gated.
- Classification of 194 screens: KEEP 8, SIMPLIFY 35, DISABLE 150, DELETE 1 (`CustomReportBuilder`, proven dead). Marks: ◆ 2, ★ 16, ○ 137, □ 39.
- Live deployment: Vercel project `v3-200-ai-studio` confirmed to exist (read-only Vercel connector). Its deployments and env vars returned 403 (scope), so `VITE_APP_ENV` on the live build is unverified.
- Proposed DECISIONS changes R-1 to R-8 (audit §6). **Not applied**; they wait for Owner approval.
- Commands run (no code changed): `npm run lint` PASS; `npm run build` PASS; `project-operating-view:check`, `work-queue:check`, `production-demo-gate:check`, `authz:check`, `e2e:check`, `simulation:full-company` all PASS. No `live-*` script run. `git status` clean after the checks (no doc-date rewrites).
- **Owner approval (2026-09-24):** "Approved", with no changes. So:
  - The audit's §8 defaults stand: Google sign-in with an invite list only; Vercel pilot; treat Firestore `leads`/`users` as real; record payments manually; survey fee 0; Admin handles the licence with a 30-day task ⚖; GST unconfirmed until the CA confirms it; a staging project is recommended but not blocking.
  - Q7 (the emergency number) is still open.
  - DECISIONS.md is unchanged. The Owner changed no decision. Step 02 folds the audit's R-1 to R-8 into the plan and freezes them.

### Step 02: Plan, Phase B (2026-09-24), DONE
- Wrote `docs/mvp/MVP_REFACTOR_PLAN.md` (target architecture, additive data changes, role matrix + rules, rules automation, screen plan, hide plan, check plan, Steps 03–11 breakdown, manual items, frozen decisions, rollback).
- Updated DECISIONS.md with the changes above (amendment lines under D-04, D-12, D-13, D-16, D-21).
- Docs only; no application code changed.
- Approval: the Owner's standing instruction "Do autonomously" (2026-09-24). The plan is binding from here.

### Step 03: Data foundation (2026-09-24), DONE
- **Split** into two PRs because the step exceeded the ~1,500-line guideline (CLAUDE.md):
  - **03a backbone:** `src/mvp/{config,stage,progress,health,rules,format,leadModel}.ts`, `src/mvp/services/{orderService,notify}.ts`, `src/repository/transactions.ts`; additive entities (Task, Blocker, PaymentMilestone, SiteSurvey, QuoteCost, ComplianceItem, Invite; stages `survey`/`site_ready`; roles owner/sales/qc; Project `displayCode`/`status`/`participantIds`/…); new repositories; MVP notification templates; `mvp:checks`; `checks:legacy`; deleted the stale `bun.lock`.
  - **03b rules and backfill:** `firestore.rules` (participant model, F-1 fix, cost hiding, forward-only stages, the pre-existing `token.role` bug fixed); `scripts/mvp-rules-emulator-check.ts` (51 assertions incl. S8); idempotency `ownerUid` (additive); `src/mvp/backfill.ts` + `scripts/mvp-backfill-projects.ts` (dry-run default; demo only; idempotent).
- **Checks:** `npm run lint` PASS · `npm run build` PASS · `npm run mvp:checks` PASS (pure 38, rules table 150+, order service 81 assertions, backfill idempotent) · `npm run mvp:rules` PASS (51/51 on the emulator) · all 42 non-live legacy checks PASS.
- **Deviations from the plan:**
  - `qualifyLead` is *convergent* rather than one transaction: deterministic ids (`cust_/site_/ord_<leadId>`) + `createIfAbsent` + `runIdempotent` per lead, so a retry after a partial failure completes the same records instead of duplicating them.
  - A bug found by the check: `applyEvent` wrote tasks before rejecting a backward stage move. It now validates before any write.
  - `customers`/`sites` reads are tightened (surveyors no longer read every customer). Legacy screens relying on that are hidden by MVP_MODE (Step 04).
- **Scope guard:** first run FAILED on rules breadth (customers could change money/QC fields, participants and stages, or complete others' tasks). Fixed in 03b (per-role stage map, QC-only hold, own-task writes, surveyor-only survey create, 11 new negative emulator tests → 62/62). Re-run: PASS with warnings (accepted residual risk = open issue 14; Step 03 size ≈ 3,000 lines across 03a+03b; QC-role stage move to add with a test in Step 09).
- **Data:** additive only. Backfill dry-run output (demo): 2 sample legacy projects → status ACTIVE, AE-1001/1002, participants, REVIEW_ORDER task; re-plan after apply = 0 changes.

### Step 04: Order View, Admin dashboard, MVP_MODE (2026-09-24), DONE
- **Split** (30 code files > ~25): **04a** read models + allow-list + queries + checks; **04b** UI, App wiring, server lockdown, invites on sign-in, screenshots.
- **Built:**
  - `src/mvp/services/readModels.ts`: `buildOrderView` (spec §8, role-filtered) and `buildDashboard` (spec §9: TODAY, NEEDS ATTENTION, PIPELINE); `listOrdersFor` uses rule-provable queries (new additive `Repository.queryContains`).
  - `workQueue.getMvpTaskQueue` (D-06: persisted tasks).
  - `src/mvp/mvpMode.ts` (allow-list per role).
  - Screens: `MvpRouter`, `AdminDashboard`, `OrdersList`, `MvpOrderView` (rendered by the extended `ProjectOperatingView`), `AdminActions` (reassign, due date, hold/resume, cancel, override, create next task, raise/resolve blocker, assign surveyor), `MvpSettings`, `MvpLogin` (8-role demo login + "ask the Admin to invite you").
  - `src/mvp/demoSeed.ts` (demo-only sample orders, made through the real services).
- **App.tsx:**
  - MVP_MODE mounts only `MvpRouter`; navigation and the command palette use the allow-list.
  - The login shows Google only; the demo tab is hidden in production builds (R-5).
  - Pending users see "ask the Admin to invite you"; onboarding wizards are skipped.
  - `?demoRole=` for screenshots works in demo-auth builds only.
- **Invites (D-13):** `firestoreUsers.getOrCreateFirestoreUser` applies the Admin's invite on first sign-in (never an admin invite).
- **Server (R-8):** `/api/gemini`, `/api/maps`, `/api/db` return 404 in MVP_MODE.
- **Checks:** lint PASS · build PASS · `mvp:checks` PASS (added `mvp-mode-check`: allow-list vs the 140 legacy tab ids, legacy navigation unchanged when off; `mvp-readmodels-check`: S1 1–13a including 71% at 13a, role filtering, S2/S3/S5/supplier-delay/NO NEXT ACTION buckets) · `production-demo-gate:check` extended for R-5 · all 42 non-live legacy checks PASS.
- **Bugs found and fixed:**
  - App.tsx remounts routed content on every tab change, which lost the selected order (fixed with a module-level selection).
  - D-11's "within 24 h" made a task due in exactly 24 h at risk from the moment it was created; the window is now strict.
- **Screenshots:** `docs/mvp/screenshots/step-04/` (dashboard phone + desktop, Order View phone, technician tasks phone), taken with headless Chromium over the DevTools protocol (`scripts/mvp/screenshot.mjs`, no new dependency).

### Step 05: Leads, Sales and Survey (2026-09-24), DONE
- **Services:**
  - `evidenceService.ts`: D-16 as changed; images/PDF only; ≤ 900 KB; audited.
  - `leadService.ts`: lists per role; tabs My leads / Follow-ups / Won / Lost; exact-phone duplicate warning; follow-up date, audited.
  - `orderService`: `phoneNormalized` and `photoIds` on leads; D-30 survey fee (a SURVEY_FEE milestone when the fee is above 0, and an audited `waiveSurveyFee`).
- **Screens:**
  - `LeadForm` (spec §13/§23 fields, GPS, site photo, consent ⚖) and `LeadsList`.
  - `LeadDetail` (contacted, follow-up, qualify → Order, lost with reason).
  - `SurveyList` (today, then upcoming) and `SurveyForm` (spec §15 fields in mm, 2+ photos, result).
  - `PhotoInput` reuses `CameraCapture` and compresses on the device.
  - `OrderExtras` (survey summary, survey-fee waive, "Start the survey").
- **Allow-list:** sales get Leads / New lead / My tasks / Orders; the surveyor gets Surveys / My tasks.
- **Offline:** the forms refuse to submit when `navigator.onLine` is false and keep the entries ("No network — not saved"). The outbox is not used: it has no canonical Firestore write transport.
- **Checks:** lint PASS · build PASS · `mvp:checks` PASS (new `mvp-leads-survey-check`: lists and ownership, follow-up sort, duplicates, lost + reason, validation, survey fee assign-gate + waive audit, survey assigned to another surveyor, evidence type/size) · `mvp:rules` 66/66 (new: survey and lead scoping) · 42/42 legacy.
- **Known limits:**
  - The duplicate warning only sees the leads the user may read (sales: their own), because of the rules. The Admin sees all.
  - Lead site photos are saved before the lead exists (`ownerEntityId` is empty; the lead keeps the ids in `photoIds`). An abandoned form leaves those documents unlinked, and only the uploader, Admin and Owner can read them.
- **Scope guard:** PASS with warnings. Applied: the waive guard, the demo-only fee override, and the timezone from config. Carried to Step 06: a waived milestone must count as settled in the payment totals and the D-30 token credit.
- **Screenshots:** `docs/mvp/screenshots/step-05/`.

### Step 06: Quote, Booking and Payments (2026-09-24), DONE
- **`src/mvp/quoteMath.ts`** (pure): spec §16 price build-up, markup and gross margin (D-15), and the D-14 default milestones with the D-30 survey-fee credit.
- **`quoteService.ts`:**
  - Versioned quotes on the canonical Quote/QuoteVersion; each save is a new immutable version.
  - Cost goes to `quote_costs` (Admin/Owner only, I-5).
  - Below MIN_MARKUP_PCT: an ApprovalRequest plus an APPROVE_MARGIN task. Send stays blocked until the Admin approves with a reason (audited).
  - Send sets the selling price, prepares the milestones and notifies the customer.
  - The customer can accept or request changes (idempotent).
- **`paymentService.ts`:**
  - Customer proof: UTR plus an optional screenshot.
  - Admin: verify (PAID / PARTIAL / REFUNDED), reject proof with a reason, edit amounts (they must add up to the selling price), set due dates.
  - All of it is audited and idempotent. A token marked PAID moves the order to SITE_READY and the lead to WON.
- **`src/mvp/gates.ts`:** D-14 soft gates (SITE_READY entry, INSTALLATION START, handover final payment, handover licence) with an audited Admin override. Reused by Steps 08 and 09.
- **UI:** `QuotePanels.tsx` (Admin builder with an internal cost panel and a ⚖ "tax rate not confirmed" warning; customer quote with Accept / Request changes) and `PaymentsPanel.tsx`, both inside the Order View. The demo seed now uses the real quote and payment services.
- **Deviation:** the three milestones are created when the Admin **sends** the quote (still all PENDING when the customer accepts), not at acceptance. The rules make milestones Admin-created, so a customer's acceptance cannot write payment records. Re-sending after changes re-prices unpaid milestones.
- **Rules:** the customer's quote read now queries `quote_versions` by `projectId`, the field the rule checks. Emulator 69/69 (new: customer lists own quote versions and milestones; another customer cannot).
- **Checks:** lint PASS · build PASS · `mvp:checks` PASS (new `mvp-quote-payment-check`: fixture ₹11,80,000 / 25% / 20%, low-margin block + approval, milestones 10,000 / 10,52,000 / 1,18,000 and the sum rule, S1 5–7, double-accept and double-verify idempotency, S6, the S5 AT_RISK set-up, I-5, the payment audit trail, gates and override) · 42/42 legacy.
- **Screenshots:** `docs/mvp/screenshots/step-06/`.
- **Scope guard:** PASS with warnings, all applied: no reject on a settled payment, deterministic notification keys, and `saveQuote` writes through `createIfAbsent` (a double-tap can't clash). Quote status updates have no optimistic lock (single Admin writer); accepted for the pilot.

### Step 07: Site-ready, Supplier and Delivery (2026-09-24), DONE
- **`supplyService.ts`:**
  - Customer site-readiness checklist: 5 items, each with a photo (power may give a date instead). It is recorded on the customer's own SITE_READINESS task (additive `Task.data`; the own-task update rule gains the `data` key).
  - Admin: return with a reason (the customer task reopens, +7 days), or confirm (soft gate: token paid, D-14) → DELIVERY. The delivery-payment due date is set to the delivery date + 2.
  - Suppliers (Admin-managed, D-12).
  - POs reuse `createPurchaseOrderIdempotent`. Material status is ORDERED / DISPATCHED / DELAYED (DELAYED needs a reason). A change to the expected date moves TRACK_DELIVERY and the delivery milestone; both changes are audited.
  - Material received (photo + count note + condition; technician optional) → DeliveryReceipt, InstallationJob, PO DELIVERED, INSTALLATION task; the technician and the customer are notified.
- **UI:** `SupplyPanels.tsx`
  - Customer: "Get the site ready" with a "complete by" date.
  - Admin: verify readiness with photos, gate override, confirm or return; PO raise and update; material received.
  - Admin/Owner: a Suppliers tab (directory + open POs, delays in red).
- **Demo seed:** now goes through the real supply services.
- **Checks:** lint PASS · build PASS · `mvp:checks` PASS (new `mvp-supply-check`: S1 8–12; readiness validation, return and resubmit; supplier delay → date follows and is audited, supplier-delay bucket; S2 overdue → hold → resume + extend, audited; S5 material received without the delivery payment; the customer never sees PO amounts) · `mvp:rules` 71/71 (the customer writes `data` on their own task; another customer cannot) · 42/42 legacy.
- **Screenshots:** `docs/mvp/screenshots/step-07/`.
- **Scope guard:** PASS with warnings. Applied: PO creation now also writes a `PO_RAISED` audit with the Admin's role, and `Task.data` is limited to 10 keys in the rules.
- **Known limits:**
  - One delivery receipt per order (`rcpt_<orderId>`); partial deliveries are noted in the count note.
  - A double-tap on "Add supplier" can create a duplicate supplier (the button is disabled while busy).
  - The customer's own-task `data` could be written directly without photos. The Admin verifies the photos before confirming.

### Step 08: Technician, Installation and Blockers (2026-09-24), DONE
- **`installationService.ts`** (reuses the canonical InstallationJob):
  - START: the INSTALLATION_START soft gate ("Waiting for delivery payment"; Admin override, audited).
  - CHECK IN: GPS is saved only if the phone gives it; it is never required.
  - The 11-item checklist (spec §18). Every item needs a stored photo except "Site cleaned". The count is mirrored to `project.checklistDone` (D-10) and each tick is audited.
  - COMPLETE needs 11/11 → QC_HANDOVER + QC_INSPECTION → the order's QC inspector, or the Admin if none is set; "QC required" goes to QC and the customer.
  - REWORK needs a photo of the fixed work → the snags assigned to the technician move to `reinspection_pending` → a new QC_INSPECTION.
  - Admin: `assignTechnician`, and `assignQcInspector` (an open QC task waiting on the Admin moves to the inspector).
  - `reassignTask` now also moves the InstallationJob to the new technician (`syncInstallationJob`).
  - `displaySummary.customerPhone` (additive) so the technician can call the customer.
- **UI:** `InstallationPanels.tsx`
  - Technician "Today" tab: today, then upcoming; call button. Earnings show "—" because no partner rate exists, so no made-up figure is shown.
  - The job runner in the Order View: START / CHECK IN / the checklist with photos / COMPLETE, plus a BLOCKED dialog with the 8 reasons, a description and an optional photo. REWORK shows the QC remarks.
  - The Admin's "Installation team" panel: technician, QC inspector, and the start-gate override.
  - Why not reuse TechnicianMobileApp or InstallationProgressTracker: they use legacy DbManager records and gamified earnings.
- **Demo seed:** AE-1003 is now at 6/11 (71 %), with QC Meera set as its inspector.
- **Scenario driver:** `runS1` 13a (13.5) and 13b (13.9) now go through the real services; the `checklistDone` shortcut is removed.
- **Checks:**
  - lint PASS · build PASS · 42/42 legacy.
  - `mvp:checks` PASS. The new `mvp-installation-check` (57 assertions) covers:
    - S1 13a (71 %) and 13b (QC_INSPECTION → qc, 90 %, notification)
    - S3 (blocker → BLOCKED, Admin notified, buckets; resolve → IN_PROGRESS / ON_TRACK)
    - S5 (START refused "Waiting for delivery payment" → audited override → START)
    - S7 (2 audits with before/after; tech2 notified; tech1 loses the task and participation; the job follows)
    - the guards: order of steps, photos, another technician, a BLOCKED job
    - the rework path
  - `mvp:rules` 80/80. New assertions:
    - a technician updates their own job and `checklistDone`, and creates the QC task; another technician and the customer cannot
    - S7: after reassignment, tech1 can no longer read the task or update the job
    - only the snag's assignee moves it to re-inspection
- **Scope guard:** PASS with warnings. Applied:
  - the snag status change is audited
  - the job is marked completed only after the INSTALLATION_COMPLETED event succeeds
  - `startWork` reuses `orderService.setTaskInProgress`
  - the why-not-reuse note now covers the ★ screens `TechnicianCheckInCheckOutScreen` and `PhotoVideoEvidenceCaptureScreen`, which read and write DbManager throughout
  - the emulator assertions above
- **Open issue for Step 11 (rules hardening):**
  - `installation_jobs` updates by the assigned technician are not key-limited
  - `checklistDone` has no 0–11 bound
  - the checklist photo and order rules are enforced in the service only
- **Screenshots:** `docs/mvp/screenshots/step-08/`.
- **Known limits:**
  - The Admin sees the job runner too, so they can act for a technician without a phone. Those actions are audited under the Admin.
  - The QC remarks on REWORK are the task notes. Step 09's QC service writes them.

### Step 09: QC, Handover and AMC (2026-09-24), DONE
- **Orient finding:** the D-08 rules table (`rules.ts`), the handover gates (`gates.ts`), the read models' `licencePending`/`amcDisplayStatus`-shaped fields, the `emergency`/`qc_failure`/`licence_pending` dashboard buckets, and the `qc_inspections`/`handovers`/`warranties`/`amcs`/`service_cases`/`compliance_items`/`mvp_settings` collections in `firestore.rules` were **all already built in Step 03**, anticipating this step. Step 09 is almost entirely the service layer and screens that call them; no rules changes were needed except adding emulator tests for those collections, which had none yet.
- **`qcHandoverService.ts`:**
  - `submitQcDecision`: writes a `QCInspection` (a 4-item checklist + remarks, no large catalog), then the D-08 `QC_DECISION` event.
    - PASS sets `project.qcPassedAt` (→ 95%) and notifies the customer "Handover ready".
    - REWORK creates a `Snag` and carries the remarks onto the new REWORK task's `notes` (additive `TaskSpec.notes` in `rules.ts`, written at task creation so it needs no extra permission beyond creating the task itself).
    - FAIL puts the order ON_HOLD (existing D-08 logic; no new code).
  - `completeHandover` (Admin only): refused until the final payment is in and the lift licence is DONE, listing every closed gate's message — unless the Admin has overridden it (the existing generic `gates.ts` override, reused as-is). Records the `Handover`, then `HANDOVER_COMPLETED` creates the `Warranty` (`WARRANTY_MONTHS` = 12) and the `AMC` record (`mvpAmcStatus: 'WARRANTY'`).
  - `setComplianceItem` (Admin only, D-27 ⚖ record, not a guarantee): the 8 fixed compliance types; marking `LIFT_LICENSE` DONE with a document completes `STATUTORY_LICENCE` if it's still open (D-29).
  - `amcDisplayStatus` (pure): derives `AMC_DUE` from `warrantyEnd − AMC_REMINDER_DAYS` — never stored (D-26). `setAmcStatus`/`recordAmcService` (Admin only).
- **`emergencyService.ts`** (D-28, life safety):
  - `raiseEmergency`: any actor (in practice the customer) looks up today's on-call technician (`mvp_settings/oncall_<date>`, Admin-set), creates a `ServiceCase` (P0) and the `EMERGENCY_RESPONSE` task (the existing D-08 event; rules already special-case this task type for a customer creator). Notifies the Admin, the Owner and the technician immediately, in-app (D-17 FROZEN — no WhatsApp/SMS gateway exists, so `notify()`'s priority stays `low` on purpose).
  - `acknowledgeEmergency` / `resolveEmergency` reuse `setTaskInProgress`/`completeTask` from `orderService.ts` and record `acknowledgedAt`/`resolvedAt`/`resolutionNote` on the case.
  - `setOnCallTechnician` (Admin only, a global per-day setting, not per-order).
  - **Safety fix to `health.ts` (D-11):** `computeHealth` returned `ON_TRACK` for every COMPLETED/CANCELLED order unconditionally, so an emergency raised after handover (a normal case — AMC-stage lifts break down too) could never show OVERDUE. Now it only short-circuits to `ON_TRACK` when there is no open `EMERGENCY_RESPONSE` task, so an unacknowledged emergency still escalates on a completed order. Minimal, additive to `HealthInput.tasks`'s type (`+'type'`); every existing check still passes.
- **UI:** `QcHandoverPanels.tsx` — `QcPanel`, `HandoverPanel` (with the per-gate override prompt), `CompliancePanel`, `AmcPanel`, `EmergencyButton` (customer, shown once the lift is installed) + `EmergencyPanel` (technician/admin ack/resolve), `OnCallSetting` (added to `MvpSettings.tsx`, Admin only). All wired into `OrderExtras.tsx`. **Payments (including the final handover payment) needed no new UI** — `PaymentsPanel.tsx` already renders every milestone generically.
- **Why not reuse:** `QcInspectorAssignmentScreen`/`QualityChecklistMechanicalScreen`(+Electrical)/`FinalHandoverChecklistScreen`/`HandoverCompletionCertificateScreen`/`CustomerHandoverWalkthroughScreen`/`WarrantyAmcRegistrationScreen` all read/write DbManager, and the QC checklist is legacy-split into two 600-line screens; `EmergencyEscalationAlert` (1,135 lines) is a legacy DbManager screen, only its UI parts (the button, the "call 112" line) were carried over.
- **Demo seed:** two new orders — AE-1005 (QC_HANDOVER, `QC_INSPECTION` open for QC Meera) and AE-1006 (just past a QC PASS: `HANDOVER`/`COLLECT_FINAL_PAYMENT`/`STATUTORY_LICENCE` open, both handover gates closed, for the override screenshot). AE-1003 (the demo customer's own lift) is left mid-installation, unchanged from Step 08.
- **Scenario driver:** `runS1` extended to steps 14 (QC PASS), 15 (final payment), 15.5 (=15b, licence DONE) and 16 (handover, via the real services).
- **Checks:**
  - `npm run lint` PASS · `npm run build` PASS (same pre-existing bundle-size warning as before) · 42/42 legacy.
  - `npm run mvp:checks` 10/10 + backfill PASS. New `mvp-qc-handover-check` (61 assertions): S1 14–16 (95% → both gates refused in turn → 100%, Warranty 12 months, AMC WARRANTY, `AMC_FOLLOW_UP` due = warranty end − 90 days), S4 rework + FAIL variant (rework count = 1 via the `Snag` record), S9 emergency + the no-on-call variant (46 minutes on, unacknowledged → OVERDUE — exercises the `health.ts` fix), S10 licence-pending-at-handover (override → completes → "Licence pending" → clears once the licence is later marked DONE).
  - `npm run mvp:rules` 102/102 (up from 80). New: `qc_inspections` create/update ownership, Admin-only `handovers`/`warranties`/`amcs`/`compliance_items`, `mvp_settings` Admin-only, `service_cases` create (participant + `reportedBy == self`) and update (assignee-only, key-limited), the customer's `EMERGENCY_RESPONSE` task create.
- **Scope guard:** self-reviewed against the checklist (subagent unavailable this run): no legacy-store use, additive schema only (`TaskSpec.notes`, `HealthInput.tasks` type widening), no new dependency, no destructive change, ⚖ marks kept on GST/warranty/licence-timeline text, catalogs stay small (4 QC test items, 8 compliance types — both fixed, matching D-27's own cap).
- **Screenshots:** `docs/mvp/screenshots/step-09/` (QC's task list and decision panel on a phone; the Admin's handover panel with both gates refused, on desktop).
- **Open issues:** logged as 15 (rules), 16 (AMC sequencing) and 17 (demo reach) above.

