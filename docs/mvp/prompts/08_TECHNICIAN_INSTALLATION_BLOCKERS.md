<!-- HOW TO RUN: merge the Step 07 PR → NEW session → paste below the line. -->
---
# MVP STEP 08: Technician app, installation checklist, and blockers

Follow the **Step protocol in CLAUDE.md**. Confirm Step 07 is DONE.

Read:
- **Step 08** in `docs/mvp/MVP_REFACTOR_PLAN.md`
- MVP_SPEC §12, §18 and §22
- DECISIONS D-07, D-14 (START gate) and D-16
- ACCEPTANCE_SCENARIOS S1 step 13, S3, S5 and S7

## Goal
A technician opens the app on a phone at the site and sees only TODAY's work. They press START → CHECK IN → do the checklist with photos → COMPLETE, and can report BLOCKED in two taps. **No gamification.**

## Build
**Reuse first (D-31).** Open the **Step 08** rows in `docs/mvp/REUSE_MAP.md`.
- ◆ canonical code: use it as-is.
- ★ bridged screens: switch their reads to canonical. Don't rebuild them.
- ○ legacy screens over about 600 lines: build a thin new screen that reuses their components.

Put a one-line "why not reuse" in the PR for anything new.

Reuse or simplify: `TechnicianHomeMyJobsScreen`, `TechnicianCheckInCheckOutScreen`, `InstallationSopChecklistScreen`, `IssueBlockerReportingScreen`, `CameraCapture`, and the canonical `InstallationJob`. **Rewire to canonical.** Hide leaderboards, coins, badges and similar screens behind `MVP_MODE`; don't delete them.

1. **Technician home: TODAY.**
   - Cards for the technician's open tasks (INSTALLATION, REWORK and any others assigned), each showing site, task type, time and earnings.
   - **Earnings:** show them only if a partner rate exists in the canonical data. Otherwise show "—". **Never invent an amount.**
   - Then an "Upcoming" list.
   - Huge touch targets, readable outdoors, English, Marathi and Hindi.
2. **Task flow:**
   - **START.** Blocked for INSTALLATION unless the delivery payment is PAID or the Admin has overridden (show the reason "Waiting for delivery payment").
   - **CHECK IN.** Captures a timestamp and GPS if permitted. Location is optional; never block on it.
   - **DO WORK.** The 11-item checklist from spec §18. Each item gets a tick, a photo (required for every item except "Site cleaned", where it's optional), a note, `completed_by` and a timestamp. Progress updates live (D-10).
   - **COMPLETE.** Only when all 11 items are done. Then the QC_INSPECTION task is created, the stage becomes QC_HANDOVER, and the "QC required" notification is sent.
   - **REWORK tasks** use the same flow, with the QC remarks shown at the top and a photo required on completion.
3. **Blockers** (D-07), from the technician's task card and from the Order View (Admin and customer):
   - Choose one of the 8 reasons, add a description and an optional photo.
   - The task becomes BLOCKED, the blocker's owner is set per D-07, the Admin is notified, and health becomes BLOCKED.
   - The Admin or the blocker's owner resolves it with a note, and the task returns to its previous status.
4. **Photo uploads** follow D-16:
   - Show upload progress and retry.
   - Queue offline if the outbox supports canonical writes.
   - **Never mark an item done until its photo is stored.**
5. **Reassignment** (S7) from the Order View:
   - the old technician loses access
   - the new one is notified
   - the change is audited

## Checks
- S1 step 13a gives progress 71. Step 13b triggers the QC task.
- S3: blocker open, then resolved.
- S5: START refused, then Admin override (audited), then allowed.
- S7: reassign and change the due date, with 2 audit events, and tech1 loses access.
- A technician can't read orders where they have no task, or any cost fields (emulator if available).
- Take phone-width screenshots of TODAY, the checklist and the BLOCKED dialog if a browser is available.

## Report back (exactly this, then STOP)
```
## Step 08 report
1. Done  2. Files changed  3. Data changes  4. Checks  5. Scope guard
6. How to see it (login as technician on a phone-size screen; screenshots)
7. Deviations  8. Questions
PR: <link>
Next: prompts/09_QC_HANDOVER_AMC.md
```
