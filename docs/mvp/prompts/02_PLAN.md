<!--
HOW TO RUN (Owner):
- Merge the approved Step 01 PR.
- NEW session; paste below the line.
- This step ends by WAITING for your approval.
-->
---
# MVP STEP 02: Refactor plan (Phase B). Docs only.

Follow the **Step protocol in CLAUDE.md**.
- Read `docs/mvp/PROGRESS.md`. Confirm Step 01 is DONE and approved.
- Read the approved `docs/mvp/MVP_SIMPLIFICATION_AUDIT.md`, `docs/mvp/DECISIONS.md`, `docs/mvp/ACCEPTANCE_SCENARIOS.md` and `docs/mvp/MVP_SPEC.md` §41–§43.

**No application code changes in this step.**

## Write `docs/mvp/MVP_REFACTOR_PLAN.md`
The plan must be concrete enough that each later step prompt can say "do the Step NN section of the plan".

1. **Target architecture**, one page:
   - which screens make up the MVP
   - which canonical services back each one
   - the new modules (e.g. `src/mvp/rules.ts`, `stage.ts`, `progress.ts`, `health.ts`, `config.ts`)
   - where `MVP_MODE` is applied
2. **Data changes**, all additive. For every collection and field: name, type, default for old documents, who writes it, and the security rule. Cover:
   - `tasks`, `blockers`
   - Project: `displayCode`, `status`, the new `ProjectStage` values
   - Customer, Site, Lead: any new fields
   - quote cost fields, and how they are hidden from non-admin roles (separate doc or collection, or rules)
   - AMC `mvpAmcStatus`, compliance documents
   - the backfill plan for existing documents (idempotent, dry-run first)
   - **anything deprecated**
3. **Roles and permissions**: the matrix of role × action for the 8 roles. Include the `firestore.rules` and storage-rules changes and the emulator tests that prove them.
4. **Rules automation**: the D-08 table turned into function signatures, with the idempotency approach and where each event is emitted from (which UI action or service).
5. **Screen plan**, taken from `docs/mvp/REUSE_MAP.md` (D-31): for each MVP screen, one of:
   - reuse as-is
   - rewire to canonical
   - simplify
   - new (small)

   Include the files and the role for each. Every screen must say which store it reads and writes.
   Use the ★ bridged screens wherever they fit, and estimate the lines saved by reusing.
   Include D-28 (emergency), D-29 (licence before legal handover) and D-30 (optional survey fee).
6. **Hide plan**: how `MVP_MODE` filters navigation, the command palette and role routers. Confirm legacy screens stay reachable when it is off.
7. **Check plan**:
   - new `mvp:checks` scripts, including pure-function checks and emulator checks
   - which old checks move to `checks:legacy`, and why
   - whether Playwright E2E is justified (D-23)
8. **Step breakdown for Steps 03–11.** For each step, give:
   - the exact files to create or modify
   - estimated lines
   - dependencies on earlier steps
   - acceptance criteria copied from ACCEPTANCE_SCENARIOS
   - the rollback approach

   If a step exceeds about 25 files or about 1,500 lines, split it (e.g. 06a/06b).
9. **Things that stay manual in Phase 1**, e.g. payment verification and supplier updates by the Admin.
10. **Frozen decisions**: list every D-xx as FROZEN, or as CHANGED with the reason.
11. **Risks and rollback**: how to switch `MVP_MODE` off, and how to revert each step's PR safely.

## Report back (exactly this, then STOP and WAIT)
```
## Step 02 report — PLAN (awaiting approval)
1. MVP screens (n) by role
2. Data changes (additive list) + backfills
3. Role matrix summary + rules changes
4. Step breakdown (03–11: title, files, est. lines)
5. New dependencies (should be none; else justify)
6. What stays manual
7. Top risks + rollback
8. Decisions changed vs DECISIONS.md
PR: <link>
Reply "APPROVED" (optionally with changes). Then I will mark Step 02 DONE.
```
