<!-- HOW TO RUN: merge the approved Step 02 PR → NEW session → paste below the line. -->
---
# MVP STEP 03: Data foundation (one shared database, roles, Task, Blocker, stage rules)

Follow the **Step protocol in CLAUDE.md**. Confirm Step 02 is DONE and APPROVED in `docs/mvp/PROGRESS.md`.

Read:
- **Step 03** in `docs/mvp/MVP_REFACTOR_PLAN.md`. This is the binding plan.
- DECISIONS D-01 to D-12, D-19 and D-22.
- MVP_SPEC §11, §12, §26, §34, §36.

## Goal
Build the backbone every later step uses. No new screens yet, apart from anything the plan puts in this step.

## Build (additive only)
1. **MVP module**, e.g. `src/mvp/`, holding only pure logic plus a thin repository layer:
   - `config.ts`: every due-date default (D-09), `MIN_MARKUP_PCT`, `GST_RATE_PCT` (unset or placeholder, flagged ⚖), warranty months, AMC reminder days, and the `MVP_MODE` default.
   - `stage.ts`: the 10 MVP stages, `toMvpStage(projectStage)` per D-03, and the allowed forward transitions.
   - `progress.ts` (D-10) and `health.ts` (D-11). Both take an injectable `now` so tests can control the clock.
   - `rules.ts`: the D-08 event → next-tasks table as pure functions. **Idempotent**: it never creates a duplicate open task of the same type.
2. **Canonical entities** in `src/domain/entities.ts`, following the existing patterns (branded IDs, `version` for optimistic concurrency, repositories in `src/repository/entities.ts`):
   - `Task` (D-06) and `Blocker` (D-07), with their collections.
   - Project gains `displayCode` and `status` (D-02, D-05). `ProjectStage` gains `survey` and `site_ready` (D-03).
   - Generate `displayCode` exactly once, safely under concurrency (transaction or counter document).
3. **Roles.** Add `owner`, `sales` and `qc` to `CanonicalUserRole`, the permission map and the legacy-role adapter (D-12). Don't change existing roles' permissions except where the plan says so.
4. **Order service**, the only place stage and status change:
   - Functions such as `qualifyLead`, `advance(orderId, event, actor)`, `putOnHold`, `resume`, `cancel`, `adminOverride`, `completeTask`, `reassignTask`, `changeDueDate`, `raiseBlocker` and `resolveBlocker`.
   - Each one calls `rules.ts`, writes through the canonical repositories, writes **AuditEvents** (reuse `src/lib/audit.ts`) and uses idempotency keys (reuse `src/lib/idempotency.ts`).
5. **Security rules** for the new collections and fields, following the plan's role matrix:
   - Customers see only their own orders.
   - Technicians, QC and surveyors see only orders where they have a task.
   - Cost fields are admin- and owner-only.
   - **Never widen existing access.**
6. **Backfill script** for existing Projects, only if the plan requires one:
   - default `status: ACTIVE`
   - assign `displayCode`
   - create a missing current task where needed

   It must be dry-run by default, idempotent, and runnable **only against the emulator or the demo repository** in this session.

## Checks to add (under `npm run mvp:checks`, using the existing `tsx` script style)
- Stage mapping, progress and health, covering every D-10 and D-11 case, including the 71% example.
- The rules table:
  - every D-08 row produces the right tasks, owners and due dates
  - running an event twice creates no duplicates
- The order service against the demo repository. Walk S1 steps 1–4, and assert invariants I-1 to I-4 after each step.
- Security rules against the emulator, if it is available: the S8 access checks for the new collections.

## Do NOT
- Build screens in this step, beyond anything the plan assigns here.
- Change legacy `DbManager` behaviour.
- Delete old stages, fields or permissions.
- Add a workflow engine.

## Report back (exactly this, then STOP)
```
## Step 03 report
1. Done (bullets)
2. Files changed: n (key files)
3. Data changes: collections/fields added · deprecated · backfill (dry-run output on emulator/demo only)
4. Checks: lint P/F · build P/F · mvp:checks n/n · legacy checks n/n (failures + pre-existing?)
5. Scope guard: <result>
6. How to verify manually
7. Deviations from plan + why
8. Questions for you (with my defaults)
PR: <link>
Next: merge, then prompts/04_ORDER_VIEW_ADMIN_DASHBOARD.md in a NEW session.
```
