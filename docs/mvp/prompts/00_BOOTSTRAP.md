<!--
HOW TO RUN (Owner):
- Start a NEW Claude Code session on github.com/prashantashwable-cmyk/MVP-V3-200-AS, from the default branch.
- Optional: attach AIE-MVP-CLAUDE-CODE-KIT.zip to the message.
- Paste everything below the line.
-->
---
# MVP STEP 00: Bootstrap the kit and record a baseline (no app code changes)

You are starting the Phase 1 MVP refactor of the ALL INDIA ELEVATORS app in this repo, `MVP-V3-200-AS`.
This step installs the working files, makes the repo testable in Claude Code cloud sessions, and records a **baseline**.
**Do not change application code in this step.**

## 1. Install the kit files into the repo
The kit's `repo-files/` folder contains `CLAUDE.md`, `docs/mvp/*` and `.claude/agents/mvp-scope-guard.md`.
Get them with the first option that works:
1. If `docs/mvp/MVP_SPEC.md` already exists in the repo, the kit is already installed. Skip to section 2.
2. If a zip file is attached to this message, unzip it and copy the contents of `AIE-MVP-CLAUDE-CODE-KIT/repo-files/` into the repo root.
3. Otherwise, use your `add_repo` tool to get **read** access to `prashantashwable-cmyk/AUG-PROMPT-APP`.
   - Clone it with the command the tool gives you.
   - Copy `AIE-MVP-CLAUDE-CODE-KIT/repo-files/*` into this repo's root.
   - Try the default branch first. If the folder isn't there, use branch `claude/app-workflow-automation-gaps-t167yf`.
4. If none of these works, stop and ask me to upload the zip.

Rules for copying:
- If a root `CLAUDE.md` already exists, **merge** ours into it under a heading `## Phase 1 MVP rules`. Never delete existing content.
- Copy the kit's `prompts/` folder, including `utilities/`, to `docs/mvp/prompts/`. Later steps and `U1` refer to it there.
- Then read `CLAUDE.md`, `docs/mvp/REPO_FACTS.md` and `docs/mvp/DECISIONS.md`.

## 2. Make the repo runnable in this cloud session
1. **Choose the package manager.** The repo has both `package-lock.json` and `bun.lock`. Use npm (`npm ci`) unless there's clear evidence the project is built with bun. Record the choice. Don't delete either lockfile yet; the audit decides.
2. **SessionStart hook.** Use the **`session-start-hook` skill** to create a SessionStart hook that installs dependencies, so every future web session can run the type check, build and checks straight away. Keep the hook fast and idempotent.
3. **Firebase Emulator Suite** (Auth, Firestore, Storage) for tests (DECISIONS D-19):
   - Check whether `java -version` and `npx firebase --version` work.
   - If they do, add a minimal emulator config (`firebase.json` emulators section, or a separate emulator-only config) **without** changing any production Firebase settings.
   - Prove it starts: `firebase emulators:exec --only firestore,auth,storage "echo ok"`.
   - If Java or the downloads are blocked:
     - tell me which command failed and which host was blocked
     - give me the exact lines to add to the cloud environment's **Setup script** (session title bar → environment menu → Edit)
     - record the gap in PROGRESS.md
     - carry on without the emulator
   - **Do not loop on this.**
4. **Never** run `live-*` scripts, and never point anything at the real Firebase project.

## 3. Record the baseline (before any code change)
Run each of these and record pass/fail and duration in `docs/mvp/PROGRESS.md` → Baseline and Commands:
- `npm run lint` (this is `tsc --noEmit`)
- `npm run build`
- every script in `npm run checks` **except** `live-*` ones and any that need credentials. Run them individually so one failure doesn't hide the others.
- Record which checks were skipped and why.
- If the whole `checks` chain takes more than about 10 minutes, run the non-live checks in one loop and summarise the results.

Also note:
- Node and npm versions.
- Whether the dev server starts (`npm run dev` on port 3000). Start it in the background, curl it, then stop it.
- Whether Chromium or Playwright is available (`echo $PLAYWRIGHT_BROWSERS_PATH`). **Do not run `playwright install`.**

## 4. Finish
- Fill in the Commands table in PROGRESS.md and the "Commands" section of `CLAUDE.md`.
- Set Step 00 to DONE in PROGRESS.md.
- Commit with `mvp(step-00): install MVP kit, session hook, baseline`.
- Push and open a **draft PR** titled `MVP Step 00: Bootstrap and baseline`.

## Report back (exactly this format, then STOP)
```
## Step 00 report
1. Kit installed from: <option used>, files added: <list>
2. Package manager: <npm|bun> — why
3. SessionStart hook: <file> — tested? <yes/no>
4. Emulator: <works | blocked: reason + setup-script lines for Owner>
5. Baseline: lint <P/F>, build <P/F>, checks <n passed / n failed / n skipped> (list failures)
6. Dev server: <starts | fails: why>
7. Browser for E2E: <available at … | not available>
8. Surprises vs REPO_FACTS.md: <list>
9. What I need from you: <numbered list>
PR: <link>
Next: paste prompts/01_AUDIT.md into a NEW session after merging this PR.
```
