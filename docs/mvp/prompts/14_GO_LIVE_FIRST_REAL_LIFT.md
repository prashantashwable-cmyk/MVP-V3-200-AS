<!-- HOW TO RUN: merge the Step 13 PR → NEW session → paste below the line. Several items are for YOU to do, not Claude. -->
---
# MVP STEP 14: Go-live readiness and the first real lift

Follow the **Step protocol in CLAUDE.md**. Confirm Step 13 is DONE.

Read:
- `VERIFICATION_REPORT.md`, `MVP_IMPLEMENTATION_REPORT.md` and `BACKUP_AND_RESTORE.md`
- the Step 11 report's "Owner actions"

**Claude cannot reach production from this session, and must not try.** This step prepares everything so the Owner can go live safely, and makes the Owner-only actions impossible to miss.

## Produce `docs/mvp/GO_LIVE_CHECKLIST.md`
Two columns: **Claude verified (in repo)** and **Owner must do (outside repo)**. Every item gets a tick box and a "how to check".

1. **Deployment** (D-21):
   - the chosen target
   - the exact build command with `VITE_APP_ENV=production`
   - every required env var
   - how to confirm the live bundle has no demo bypass (a step-by-step for the Owner)
2. **Firebase project control:**
   - the Owner has Owner/Admin access in the console
   - billing
   - deploying `firestore.rules`/storage rules (exact commands)
   - Auth providers enabled
   - authorised domains
3. **Backups:** the first manual export has been done, and a restore test has been done once.
4. **Accounts:**
   - create the real users (Admin, Owner, 1 sales, 1 surveyor, 1–2 technicians, 1 QC)
   - invite flow for customers
   - remove or disable demo accounts in production
5. **Live smoke test by the Owner** (15 minutes): the `live-*` scripts or a manual equivalent, run **by the Owner** with real credentials, plus the parts of `OWNER_UAT_SCRIPT.md` marked "live".
6. **Legal and tax ⚖ VERIFY with professionals, before taking money:**
   - the GST rate and invoicing
   - the customer agreement template (payments, refunds, warranty, delays)
   - partner/technician agreements and insurance
   - statutory lift permissions and inspection responsibilities
   - consent wording for WhatsApp and SMS
7. **Data:**
   - whether any old demo or seed data must be cleaned from the real project. Use a **dry-run report only**; the Owner approves any deletion separately.
   - how real leads are entered (manual entry by sales, or a one-time CSV import if one exists)

## Produce `docs/mvp/FIRST_REAL_LIFT_PLAYBOOK.md`
A one-page, day-by-day guide for running the first real order through the app. Include:
- who does what in the app at each stage
- the **daily Admin routine**: 10 minutes each morning (Needs Attention → Today) and 5 minutes each evening (overdue, blockers)
- what to do when something doesn't fit the app: log it as a note plus a blocker "OTHER", **never work around it outside the app**, and collect it for `U5_PILOT_FEEDBACK_ROUND`
- the weekly review: 5 numbers from the reports, and 3 pain points

Write it in simple English, with a short Marathi summary box (mark it "needs native review").

## Code
**Only** fix defects that block go-live and are found while preparing these documents. Anything else goes to PROGRESS → Open issues.

## Report back (exactly this, then STOP)
```
## Step 14 report
1. Claude-verified items: n/n
2. OWNER ACTIONS before first real customer (numbered, in order)
3. Professional ⚖ checks needed (CA, lawyer, insurer, lift inspector)
4. Playbook: docs/mvp/FIRST_REAL_LIFT_PLAYBOOK.md
PR: <link>
After go-live: use prompts/utilities/U5_PILOT_FEEDBACK_ROUND.md weekly.
```
