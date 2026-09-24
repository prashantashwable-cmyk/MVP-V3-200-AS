<!-- HOW TO RUN: merge the Step 10 PR → NEW session → paste below the line. -->
---
# MVP STEP 11: Security, compliance records, and production hardening

Follow the **Step protocol in CLAUDE.md**. Confirm Step 10 is DONE.

Read:
- **Step 11** in `docs/mvp/MVP_REFACTOR_PLAN.md`
- MVP_SPEC §31–§33 and §35–§36
- DECISIONS D-12, D-16, D-19, D-20, D-22 and D-27

Also, **if** the `/security-review` skill is available, run it on the MVP code paths at the end of this step and fix what it finds.

## Goal
Make the MVP safe to use with real customer data. Real access is locked to real roles, evidence is private, every important action is audited, demo shortcuts can't reach production, and compliance paperwork can be recorded.

## Build and verify
**Reuse first (D-31).** Open the **Step 11** rows in `docs/mvp/REUSE_MAP.md`.
- ◆ canonical code: use it as-is.
- ★ bridged screens: switch their reads to canonical. Don't rebuild them.
- ○ legacy screens over about 600 lines: build a thin new screen that reuses their components.

Put a one-line "why not reuse" in the PR for anything new.

1. **Authorization, end to end.**
   - Every MVP write goes through a role check in the service layer **and** in `firestore.rules`/storage rules.
   - Remove any MVP code path that trusts a role from client-side state alone.
   - Run the S8 access tests on the emulator. If the emulator is unavailable, write the tests anyway, mark them "needs emulator", and add them to the go-live checklist.
2. **Evidence privacy** (D-16).
   - Storage paths are per order. Only participants of that order, plus the Admin and Owner, can read them.
   - No public URLs. Enforce size and type limits.
3. **Input validation.** Check every MVP form and service input (phone, amounts, dates, mm sizes, enums) on the server side or in the service layer, not only in the UI.
4. **Audit coverage.** A check script that performs every I-3 action and asserts an AuditEvent exists for each.
5. **Demo and production separation** (D-20).
   - Confirm `production-bundle-bypass:check` passes.
   - Confirm "Try as Role" cannot read or write canonical Firestore data.
   - Document the exact production build command, including `VITE_APP_ENV=production`, in PROGRESS.md and the plan.
   - If the live deployment is configured differently, **tell the Owner exactly what to change**. Don't change hosting settings yourself.
6. **Secrets.**
   - Confirm no keys are committed.
   - List every env var the production deploy needs, and where each is set.
   - Note that `firebase-applet-config.json` holds web config, which is public by design; access is protected by the rules.
7. **Compliance records** (D-27).
   - A Documents & Compliance section on each order: lift license, statutory inspection, contractor responsibility, insurance, GST invoice, TDS, customer agreement, partner agreement.
   - Each item has a status, a file and a note, and uses `DocumentRecord`.
   - Label every item "⚖ VERIFY — record only".
8. **Backups** (docs plus the Owner's action). Write `docs/mvp/BACKUP_AND_RESTORE.md`:
   - Firestore export/import commands, schedule and who runs them.
   - How to restore to a new database.
   - Mark as an Owner action anything that needs console access.
9. **Hidden features stay hidden.** With `MVP_MODE` on:
   - AI or Gemini features, gamification, NBFC/loan, IoT, franchise, auto-negotiation and the like are unreachable from navigation, the command palette and direct routes. Guard the routes; don't just hide the links.
   - **No code is deleted** unless the audit marked it DELETE.
10. **Performance sanity.** The field-role screens must load on a mid-range phone. Check that code splitting keeps hidden screens out of the MVP routes' bundles (reuse `code-splitting:check`).

## Report back (exactly this, then STOP)
```
## Step 11 report
1. Done  2. Files changed  3. Rules changes (tightened only?)  4. Checks (incl. S8, audit coverage, bundle bypass)
5. Scope guard + security review findings (fixed / accepted with reason)
6. Owner actions required before go-live (numbered: hosting env vars, backups, Firebase console access, …)
7. Deviations  8. Questions
PR: <link>
Next: prompts/12_TEST_AND_VERIFY.md
```
