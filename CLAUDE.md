# CLAUDE.md: ALL INDIA ELEVATORS, Phase 1 MVP refactor

This repo is being **simplified** into an MVP that can run 10–20 real lift orders. **It is not a rewrite.**
The goal: **ONE LIFT THROUGH THE SYSTEM**, from lead → survey → quote → booking → site-ready → delivery → installation → QC → handover → AMC.

## Sources of truth (read what the current step says to read)
| File | What it is |
|---|---|
| `docs/mvp/MVP_SPEC.md` | The Owner's requirements |
| `docs/mvp/DECISIONS.md` | Resolved ambiguities (D-01 to D-31). **These win over the spec where they conflict.** |
| `docs/mvp/REPO_FACTS.md` | Pre-inspection notes. Verify them before relying on them. |
| `docs/mvp/REUSE_MAP.md` | **Existing screens, services and checks to reuse for each step.** Check it before creating any file. |
| `docs/mvp/future/` | The V4 vision and roadmap. **Reference only. Never build from it in Phase 1.** |
| `docs/mvp/ACCEPTANCE_SCENARIOS.md` | Test data and expected results |
| `docs/mvp/PROGRESS.md` | Where we are. **Read it first in every session; update it last.** |
| `docs/mvp/MVP_SIMPLIFICATION_AUDIT.md`, `docs/mvp/MVP_REFACTOR_PLAN.md` | Created in Steps 01 and 02. Once approved, the plan is binding. |

## Priority order (when rules conflict)
1. Existing working code
2. Real elevator workflow
3. Reliability
4. Simplicity
5. Data integrity
6. Safety
7. Usability
8. Maintainability
9. Automation
10. Future scalability

## Golden rules
1. **Reuse before you build.** If something is 70% right, fix the remaining 30%. Use `REUSE_MAP.md` in this order:
   - ◆ canonical code, as-is
   - ★ bridged screens: switch their reads to canonical
   - thin new screens that reuse existing components and services
   - rewiring a legacy (○) screen, only when it is small

   Any new screen or service needs a one-line "why not reuse" in the PR (D-31).
2. **One shared database.** MVP screens use the canonical Firestore repository (`src/repository`, `src/domain/entities.ts`). Never use the legacy `DbManager`/localStorage for MVP data (D-01).
3. **Additive schema changes only.** Deprecate fields; don't delete them. No silent or destructive migrations. Backfill scripts must be idempotent and dry-run first.
4. **Hide, don't delete.** Non-MVP screens go behind `MVP_MODE` (D-22). Delete only code proven dead.
5. **Never touch real data from this session.** Tests use the Firebase emulator or the demo repository (D-19). Never run `live-*` scripts. Never commit secrets.
6. **No new dependency** unless the plan justifies it: why it's needed, its size, and the alternative you rejected.
7. **No mock or fake behaviour** in production code paths. Any `TODO` in core MVP flows must be finished before the step closes.
8. **Mark legal/tax assumptions `⚖ VERIFY`.** Never hard-code a tax rate.
9. **Keep it small.** If a step needs more than about 25 files or about 1,500 changed lines, stop and propose a split.

## Do NOT build in Phase 1
- ❌ An AI manager, AI negotiation or AI voice calls
- ❌ Predictive scheduling or ML dispatch/scoring
- ❌ Computer-vision (CV) verification
- ❌ IoT containers or smart locks
- ❌ A fraud engine
- ❌ Gamification, coins or leaderboards
- ❌ Franchise or multi-city tenancy
- ❌ NBFC integration
- ❌ Process mining or rule learning
- ❌ Event sourcing, microservices or a workflow engine
- ❌ More than 8 blocker reasons, or large catalogs of events, exceptions or fraud rules

Existing features on this list are **disabled or hidden, not deleted**.

## MVP vocabulary (use these names)
| Concept | Values |
|---|---|
| Order (the canonical `Project`) | Display code `AE-####` |
| Stages | `LEAD, QUALIFIED, SURVEY, QUOTE, BOOKED, SITE_READY, DELIVERY, INSTALLATION, QC_HANDOVER, AMC` |
| Order status | `ACTIVE, ON_HOLD, CANCELLED, COMPLETED` |
| Health | `ON_TRACK, AT_RISK, OVERDUE, BLOCKED, ON_HOLD` |
| Task status | `TODO, IN_PROGRESS, BLOCKED, COMPLETED, CANCELLED` |
| Blocker reasons | `CUSTOMER_NOT_READY, MATERIAL_MISSING, POWER_UNAVAILABLE, SITE_UNSAFE, WRONG_MEASUREMENT, PAYMENT_PENDING, SUPPLIER_DELAY, OTHER` |
| Payment status | `PENDING, PARTIAL, PAID, FAILED, REFUNDED` |
| Roles | `admin, owner, sales, surveyor, technician, qc, customer, supplier` |

## Step protocol (every step prompt follows this)
1. **Orient.**
   - Read `docs/mvp/PROGRESS.md` and this step's section of the plan.
   - Run `git status` and `git log --oneline -5`.
   - If the previous step isn't marked DONE, **stop and say so**.
2. **Restate.**
   - Give your plan for this step in 10 bullets or fewer, listing the files you will touch.
   - Flag any deviation from the approved plan.
   - If a deviation is large or destructive, **stop and ask**.
3. **Implement** in small commits: `mvp(step-NN): <what>`.
4. **Verify.** Run the commands listed in PROGRESS.md: type check, build, `mvp:checks`, and the relevant existing checks.
   - Fix anything you broke.
   - Log pre-existing failures; don't fix them unless the fix is trivial and in scope.
5. **Guard.** Run the `mvp-scope-guard` subagent on your diff, or its checklist yourself if it's unavailable. Fix any FAIL.
6. **Record.** Update `docs/mvp/PROGRESS.md`: the status row, a step note, the commands run and their results, open issues.
7. **Ship.**
   - Push to this session's branch.
   - Open a **draft PR** titled `MVP Step NN: <title>`.
   - The PR body covers: summary, files, data changes, checks with results, manual test steps, screenshots for UI steps, risks.
8. **Report and stop.** Use the report format in the step prompt. **Don't start the next step.**

## Stop and ask the Owner before
- dropping or renaming any collection or field, or deleting any data
- deleting more than 5 files, or any screen that the audit didn't mark DELETE
- changing the auth provider, the deployment target, the payment provider or Firebase project settings
- changing `firestore.rules` or `storage.rules` in a way that widens access
- anything that would touch real customer data or production

## Context hygiene
- Never read `src/lib/db.ts` (about 11,700 lines) or `src/types.ts` whole. Use `grep -n` and line ranges.
- Never open `docs/production/screenshots/`.
- Summarise long command output. Don't paste it.

## Commands
Package manager: **npm**. Don't use bun, and don't delete `bun.lock` until the audit decides.

| Purpose | Command |
|---|---|
| Install | `npm ci` (the SessionStart hook runs it automatically in cloud sessions) |
| Dev server | `npm run dev` on port 3000. Start it in the background, curl it, then stop it with `pkill -f "tsx server.ts"` |
| Type check | `npm run lint` (`tsc --noEmit`) |
| Build | `npm run build` |
| MVP checks | `npm run mvp:checks` (created in Step 03) |
| Legacy checks | Run the non-`live-*` scripts from `npm run checks` one by one (see the loop in `docs/mvp/PROGRESS.md`). **Never run `npm run checks` whole**, because it calls `live-*` scripts. Afterwards run `git checkout -- docs/architecture docs/migration docs/production` to revert the date-only rewrites |
| Emulators | `npx -y firebase-tools@15.31.0 emulators:exec --config firebase.emulator.json --project demo-aie-mvp --only firestore,auth,storage "<cmd>"`. Always use a `demo-*` project ID |
| E2E | Chromium is at `$PLAYWRIGHT_BROWSERS_PATH` (`/opt/pw-browsers`). No harness yet. Never run `playwright install` |
