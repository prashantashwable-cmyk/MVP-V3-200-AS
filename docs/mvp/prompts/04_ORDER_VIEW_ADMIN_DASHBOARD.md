<!-- HOW TO RUN: merge the Step 03 PR → NEW session → paste below the line. -->
---
# MVP STEP 04: Universal Order View, the one Admin dashboard, and MVP_MODE navigation

Follow the **Step protocol in CLAUDE.md**. Confirm Step 03 is DONE.

Read:
- **Step 04** in `docs/mvp/MVP_REFACTOR_PLAN.md`
- MVP_SPEC §8 and §9
- DECISIONS D-06, D-10, D-11 and D-22

## Goal
An Admin who opens the app sees one dashboard. Clicking any order shows **one canonical Order View** that answers four questions: what happened, what's next, who owns it, and when it's due.

## Build
**Reuse first (D-31).** Open the **Step 04** rows in `docs/mvp/REUSE_MAP.md`.
- ◆ canonical code: use it as-is.
- ★ bridged screens: switch their reads to canonical. Don't rebuild them.
- ○ legacy screens over about 600 lines: build a thin new screen that reuses their components.

Put a one-line "why not reuse" in the PR for anything new.

1. **Universal Order View.**
   - **Extend the existing** `src/services/projectOperatingView.ts` and `src/components/ProjectOperatingView.tsx`. Don't write a parallel one.
   - It must show every field in the spec §8 example: order code, customer, site, lift, current stage, progress %, next action (the current task title), owner, due date (Asia/Kolkata), blocker, payment (paid / total, ₹ in en-IN format) and health badge.
   - Below that:
     - a stage timeline (10 stages)
     - open tasks
     - an evidence gallery
     - payment milestones
     - audit history (who, what, when)
   - **Admin actions**, each audited and each going through the Step 03 order service:
     - reassign task
     - change due date
     - put on hold / resume
     - cancel
     - override a gate (reason required)
     - create next task (for NO NEXT ACTION)
   - Mobile-friendly: one column on a phone.
   - The same component, **filtered by role**, is reused later for customers, technicians and others. **Never render cost or margin for non-admin roles.**
2. **Admin dashboard.** A single page. Reuse `controlTower.ts` categories and `workQueue.ts` where they fit.
   - **TODAY:** counts and lists for new leads, surveys, quotes, bookings, deliveries, installations, QC, payments due and AMC due.
   - **NEEDS ATTENTION:** grouped by overdue, blocked, payment pending, customer waiting, technician waiting, supplier delay, QC failure and **NO NEXT ACTION**. Health comes from `health.ts`.
   - **PIPELINE:** columns Lead → Qualified → Survey → Quote → Booked → Site Ready → Delivery → Installation → QC → Handover → AMC, each with counts. QC and Handover are split by task type.
   - Every item opens the Order View.
   - Refreshing should be cheap. Use Firestore listeners or queries with sensible limits; don't load every collection.
3. **`MVP_MODE`** (on by default, D-22):
   - Filter `src/navigation/surfaces.ts`, the role routers and the command palette down to the MVP screens in the plan.
   - The Admin's landing page becomes the new dashboard.
   - When `MVP_MODE` is off, the old navigation must still work exactly as before.
   - **Do not delete any screen.**

## Checks
- The Order View model builds correctly for S1 steps 1–13a using the demo repository, and shows 71% at 13a.
- The dashboard groups S2, S3 and S5 orders into the right Needs-Attention buckets.
- A NO NEXT ACTION order is detected.
- With `MVP_MODE` on, navigation exposes only allow-listed screens. With it off, navigation matches the baseline.
- UI check: if Playwright or Chromium is available, take phone-width and desktop screenshots of the dashboard and the Order View and attach them to the PR. Otherwise describe how to check manually.

## Report back (exactly this, then STOP)
```
## Step 04 report
1. Done (bullets)
2. Files changed: n (key files)
3. Data changes (should be none or trivial)
4. Checks: lint · build · mvp:checks · legacy checks
5. Scope guard: <result>
6. How to see it: login as <role> → <path>; screenshots
7. Deviations from plan + why
8. Questions for you
PR: <link>
Next: prompts/05_LEADS_SALES_SURVEY.md
```
