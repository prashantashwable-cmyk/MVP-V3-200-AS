# MVP PROGRESS LOG

> Claude updates this at the end of **every** step, and reads it at the start of every session.
> The Owner can also write notes here, for example approvals or changed decisions.

## Current position
- **Last completed step:** 06 Quote, Booking and Payments
- **Next step:** 07 Site-ready, Supplier and Delivery
- **Mode:** the Owner said "Do autonomously" (2026-09-24). Claude runs Steps 02–11 in sequence, self-approving each gate with the recommended defaults, as stacked draft PRs. It still stops for anything on CLAUDE.md's "stop and ask" list that the approved plan doesn't cover
- **Blocked on Owner:** nothing blocks Step 02. Still needed before go-live: the emergency phone number (audit §8 Q7); `VITE_APP_ENV=production` set in Vercel; Firebase Storage and backups enabled (Q3)

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
| 07 | Site-ready, Supplier and Delivery | TODO | | | |
| 08 | Technician, Installation and Blockers | TODO | | | |
| 09 | QC, Handover and AMC | TODO | | | |
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

