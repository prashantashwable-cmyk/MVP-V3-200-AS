# MVP PROGRESS LOG

> Claude updates this at the end of **every** step, and reads it at the start of every session.
> The Owner can also write notes here, for example approvals or changed decisions.

## Current position
- **Last completed step:** 01 Audit (Phase A), approved 2026-09-24
- **Next step:** 02 PLAN (`docs/mvp/prompts/02_PLAN.md`)
- **Blocked on Owner:** nothing blocks Step 02. Still needed before go-live: the emergency phone number (audit §8 Q7); `VITE_APP_ENV=production` set in Vercel; Firebase Storage and backups enabled (Q3)

## Step status
| Step | Title | Status | PR | Date | Notes |
|---|---|---|---|---|---|
| 00 | Bootstrap and baseline | DONE | MVP Step 00 draft PR | 2026-09-24 | Baseline all green; emulator works |
| 01 | Audit (Phase A) | DONE | #3 | 2026-09-24 | Owner approved with no changes; §8 defaults accepted |
| 02 | Plan (Phase B) | TODO | | | Needs Owner approval |
| 03 | Data foundation | TODO | | | |
| 04 | Order View, Admin dashboard, MVP_MODE | TODO | | | |
| 05 | Leads, Sales and Survey | TODO | | | |
| 06 | Quote, Booking and Payments | TODO | | | |
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
| MVP checks | `npm run mvp:checks` (Step 03 creates it) | Not yet |
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

