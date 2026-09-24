<!--
HOW TO RUN (Owner):
- Merge the Step 00 PR first.
- Start a NEW Claude Code session on MVP-V3-200-AS and paste everything below the line.
- This step ends by WAITING for your approval. Reply in the same session.
-->
---
# MVP STEP 01: Audit (Phase A). Read-only on application code.

Follow the **Step protocol in CLAUDE.md**. Read, in this order:
1. `CLAUDE.md`
2. `docs/mvp/PROGRESS.md`. Confirm Step 00 is DONE.
3. `docs/mvp/MVP_SPEC.md`, all of it
4. `docs/mvp/DECISIONS.md`
5. `docs/mvp/REPO_FACTS.md`
6. `docs/mvp/REUSE_MAP.md`

**Do NOT modify application code.** The only files you may create or change are `docs/mvp/MVP_SIMPLIFICATION_AUDIT.md` and `docs/mvp/PROGRESS.md`.

## What to inspect
Use the real code as the source of truth. Verify every line of REPO_FACTS.md and correct anything wrong.
1. **Architecture.**
   - The frontend shell and how routing works (`src/App.tsx`, `src/routers/*`, `src/navigation/*`).
   - The server and API (`src/serverApp.ts`, `api/index.ts`).
   - Which deployment is live, or at least configured.
2. **Data.**
   - For each of the ~30 canonical entities: is it used, and by which screens and services?
   - Is Drizzle/Postgres (`src/db/*`) used at runtime at all?
   - For each MVP-relevant legacy screen (list in REPO_FACTS §4): **which store does it read and write** — canonical Firestore, the dual-write bridge, or the legacy `DbManager`/localStorage?
3. **Auth and roles.**
   - How real users sign in today.
   - How a role is assigned.
   - What "Try as Role" demo mode can reach.
   - Whether the live build could ship demo bypasses.
4. **Workflows.**
   - `src/workflows/definitions/*`, `commercialWorkflow.ts`, `operationsWorkflow.ts`, `projectOperatingView.ts`, `workQueue.ts`, `controlTower.ts`.
   - What can be reused for the 10 MVP stages and the D-08 rules?
5. **Integrations.** Gemini, the payment gateway, logistics, accounting/ERP, WhatsApp/SMS. For each: real, stubbed or simulated?
6. **Security.** `firestore.rules`, storage rules, `authz.ts`, `permissions.ts`, audit, idempotency.
7. **Tests.** Which of the ~50 check scripts cover code the MVP keeps, and which cover only code that will be hidden.
8. **Reuse map.** Verify every row of `docs/mvp/REUSE_MAP.md`:
   - Is the store mark (◆ ★ ○ □) right?
   - Do the 16 ★ bridged screens really write canonically?
   - Correct the map in place, and note the changes in the audit.
9. **Screens.** Classify **all 194** in one table (you can group obvious families): KEEP / SIMPLIFY / DISABLE (hide) / DELETE (only if proven dead) / BUILD / BROKEN. Use `src/workflows/screenRegistry.ts` and `docs/architecture/screen-inventory.csv` as a head start.

## Write `docs/mvp/MVP_SIMPLIFICATION_AUDIT.md`
1. **Executive summary** in 10 lines or fewer, written for a non-technical Owner.
2. **Current architecture**: one diagram in ASCII, plus a short explanation.
3. **The data-layer truth**: which MVP functions would actually be shared between users today, and which live only in one browser.
4. **Sections A–F** (KEEP, SIMPLIFY, DISABLE, DELETE, BUILD, BROKEN). Each is a table with these columns: `Feature | Current State | MVP Decision | Reason | Risk | Files`.
5. **Mapping to the MVP spec.** For each spec section, §7–§32: what exists, what gets reused, and the gap.
6. **Recommended changes to DECISIONS.md**, if the code shows a better option. Give a reason for each.
7. **Risks**, ranked, each with a mitigation.
8. **Questions for the Owner**, 10 at most, each with your recommended default. Always include:
   - How will real staff and customers log in? (D-13)
   - Which deployment is the pilot target? (D-21)
   - Does the Owner have full admin access to Firebase project `dogwood-torus-v71nt` (console, billing, backups, rules deploy)? If not, who does?
   - Is any real customer data already stored in Firestore or in browsers?
   - Does the existing payment gateway integration take real money?
   - Survey fee: the amount, or 0 for off (D-30).
   - The emergency phone number, and who is on call for the first lifts (D-28).
   - Who handles the statutory lift licence, and how long it usually takes (D-29).

## Report back (exactly this, then STOP and WAIT)
```
## Step 01 report — AUDIT (awaiting approval)
1. Current architecture (≤8 lines)
2. Existing major features (≤10 bullets)
3. Recommend KEEP (top items)
4. Recommend SIMPLIFY (top items)
5. Recommend DISABLE/HIDE (count + families)
6. Missing / must BUILD
7. Exact implementation plan outline (Steps 03–11, one line each)
8. Estimated files/modules affected per step
9. Risks (top 5)
10. Proposed MVP end-to-end workflow (stage → screen → role → store)
11. Questions for you (with my defaults)
PR: <link>
Reply "APPROVED" (optionally with changes) and I will update the audit and mark Step 01 DONE.
```
When I reply:
- Apply my changes to the audit, and to DECISIONS.md if I changed a decision (log it in PROGRESS → Decision changes).
- Mark Step 01 DONE, push, and stop.
