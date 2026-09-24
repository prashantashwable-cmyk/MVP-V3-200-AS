<!-- HOW TO RUN: merge the Step 12 PR → NEW session → paste below the line. -->
---
# MVP STEP 13: Implementation report and roadmap (Phase F). Docs only.

Follow the **Step protocol in CLAUDE.md**. Confirm Step 12 is DONE.

Read:
- `docs/mvp/PROGRESS.md` (all the step notes)
- the audit, the plan and `VERIFICATION_REPORT.md`
- MVP_SPEC §39 and §40
- `git log --oneline` since Step 00

## Write `docs/mvp/MVP_IMPLEMENTATION_REPORT.md`
Base every statement on the actual commits and checks, **not on intentions**. It has these sections:
1. What existed (the before-picture, from the audit)
2. What we kept
3. What we simplified
4. What we disabled or hid (with how to re-enable: `MVP_MODE` off, or the flag or route)
5. What we built
6. What remains manual. Be explicit: payment verification, supplier updates, technician selection, AMC offers, backups…
7. What remains for V4. Update `docs/mvp/future/FUTURE_V4_ROADMAP.md` tables 1 and 2 with the real Phase 1 status.
8. Database changes: every added collection and field, the deprecated fields, the backfills, and whether each backfill has run on real data (it should NOT have, from these sessions)
9. API and service changes
10. Tests performed, with results (link to VERIFICATION_REPORT)
11. Known issues, with severity and workaround
12. Recommended next 10 features. Rank by "removes the most manual Admin work per order". Each gets one line of why and a size estimate.

Then add the **Future roadmap** from spec §40: Phase 1 (current) → 2 → 3 → 4 → 5.
- For each phase, give the **entry criteria based on real data**. For example, "Phase 2 starts when 10 real lifts are completed AND the Admin spends more than X hours/week on Y."
- Confirm that every measurement in `FUTURE_V4_ROADMAP.md` §3 can really be read from the data, and name the gaps. The measurements are: time in each stage, tasks overdue, blockers by reason, rework rate, Admin actions per order.

Also:
- Update the root `CLAUDE.md` "Commands" section.
- Add a short "How to operate the MVP" section to `README.md`: roles, how to invite a user, the daily Admin routine.

## Report back (exactly this, then STOP)
```
## Step 13 report
1. Report written: docs/mvp/MVP_IMPLEMENTATION_REPORT.md (sections complete? y/n)
2. Top 5 known issues
3. Next 10 features (titles)
4. Phase 2 entry criteria
PR: <link>
Next: prompts/14_GO_LIVE_FIRST_REAL_LIFT.md
```
