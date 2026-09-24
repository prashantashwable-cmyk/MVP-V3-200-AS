<!-- HOW TO RUN: merge the Step 11 PR → NEW session → paste below the line. -->
---
# MVP STEP 12: Test and verify (Phases D and E): prove ONE LIFT gets through the system

Follow the **Step protocol in CLAUDE.md**. Confirm Step 11 is DONE.

Read:
- `docs/mvp/ACCEPTANCE_SCENARIOS.md`, all of it
- MVP_SPEC §37 and §38
- the Step 12 section of the plan

**Fix only defects.** No new features. If a fix is larger than about 100 lines, or changes a decision, stop and ask.

## Phase D: automated
1. Run everything, in this order, and record the results in PROGRESS.md:
   - type check
   - build
   - `npm run mvp:checks`
   - `npm run checks:legacy`, or the old suite minus the `live-*` scripts
   - the emulator-backed tests
2. **Scenario coverage.** Make sure `mvp:checks` contains automated versions of **S1–S10** that assert the invariants **I-1 to I-6** after every step.
   - Use the demo repository or the emulator, with injected time.
   - Add whatever is missing, **adapting the existing scripts in REUSE_MAP → Step 12 first**. For example, `full-company-simulation.ts` already covers the QC fail → rework loop. Don't write them from scratch.
3. **E2E, if a browser is available** (Playwright/Chromium per D-23):
   - Drive S1 through the real UI, at least for the key screens of each role, at phone width for field roles and desktop width for the Admin.
   - Save screenshots to `docs/mvp/verification/`, compressed, with no personal data.
   - If no browser is available, say so, and turn Phase E into a precise manual script.
4. **Fix every failure you caused.** For each fix, record the root cause in one line. Leave pre-existing failures logged but untouched, unless they are on an MVP path.

## Phase E: manual verification (you, on the emulator or demo data)
- Walk S1 as each role in turn.
- At **every** step, confirm the Order View shows: current status, owner, next action, due date and evidence (spec §38).
- Write `docs/mvp/VERIFICATION_REPORT.md` with a table:

| Scenario | Step | Expected | Actual | Evidence (screenshot/check name) | PASS/FAIL |

- End it with a **go/no-go for the pilot**, including the reasons and the remaining risks.

## Also produce: `docs/mvp/OWNER_UAT_SCRIPT.md`
A 30-minute script the Owner and one colleague can follow on real phones against the **pilot deployment**, with test accounts, before the first real customer. Written in plain English, with a column for Marathi notes. It covers:
- S1, S3 and S4
- one payment proof
- one language switch

Each step says what to tap, what they should see, and a tick box.

## Report back (exactly this, then STOP)
```
## Step 12 report
1. Automated results: lint · build · mvp:checks n/n · legacy n/n · emulator n/n · E2E n/n
2. Scenario matrix S1–S10: PASS/FAIL each
3. Defects found → fixed (root cause, 1 line each)
4. Still failing / not verifiable here (why, and who can verify)
5. Go/No-go for pilot + remaining risks
6. Owner UAT script ready: docs/mvp/OWNER_UAT_SCRIPT.md
PR: <link>
Next: prompts/13_REPORT_AND_ROADMAP.md
```
