<!-- HOW TO RUN: merge the Step 09 PR → NEW session → paste below the line. -->
---
# MVP STEP 10: Customer portal, Owner view, notifications, reports, and languages

Follow the **Step protocol in CLAUDE.md**. Confirm Step 09 is DONE.

Read:
- **Step 10** in `docs/mvp/MVP_REFACTOR_PLAN.md`
- MVP_SPEC §14, §25, §27, §28, §29 and §30
- DECISIONS D-13, D-17 and D-18

## Goal
Make the whole flow usable by real people:
- a simple customer home
- a one-page Owner view
- the 10 notifications
- 4 small reports
- field screens in English, Marathi and Hindi

## Build
**Reuse first (D-31).** Open the **Step 10** rows in `docs/mvp/REUSE_MAP.md`.
- ◆ canonical code: use it as-is.
- ★ bridged screens: switch their reads to canonical. Don't rebuild them.
- ○ legacy screens over about 600 lines: build a thin new screen that reuses their components.

Put a one-line "why not reuse" in the PR for anything new.

Reuse or simplify: `CustomerHomeDashboardScreen`, `CustomerDocumentVaultScreen`, `CustomerSupportTicketScreen` (or ServiceCase), `CustomerNotificationCenterScreen`, `RevenueProfitAnalytics`/`SalesFunnelAnalytics` (as data only), `notificationService`, and `src/lib/language.ts`.

1. **Customer home: "My Lift".**
   - The role-filtered Order View from Step 04, showing: current stage, progress, next action (in customer words), promised date (the current customer-facing task's due date), payment status, documents, support.
   - **Customer actions in one place:**
     - approve quote
     - upload site photos / confirm readiness
     - submit payment proof
     - view installation progress and photos
     - raise a blocker
     - approve handover
     - view AMC
     - the **EMERGENCY** button and emergency number (D-28, built in Step 09), always visible once the lift is installed
   - **Multiple orders:** if the customer has more than one order, show a simple list first.
   - **Customer login** (D-13): an invited email is linked to the Customer record on first sign-in. **No self-signup into other roles.**
2. **Owner view** (read-only, one page, mobile-friendly):
   - revenue (collected)
   - orders (active, completed)
   - pipeline counts
   - outstanding payments
   - estimated margin (sum over booked orders)
   - active installations
   - completed lifts
   - AMC (active, due)

   **No operational controls.**
3. **Notifications:** the 10 from spec §25.
   - They are **in-app** through the existing `notificationService`/`NotificationRecord`. A bell with an unread count links to the order.
   - External channels (WhatsApp, SMS, email) **only if** the audit found them working end-to-end, and only for users who have given consent ⚖.
   - **Overdue detection:** runs on dashboard load, plus a daily digest for the Admin (use a scheduled endpoint only if the deployment supports it; otherwise "on first Admin login of the day").
   - **No duplicates:** each notification gets an idempotency key.
4. **Reports** (Admin and Owner, simple tables with date filters; CSV export only if trivial):

| Report | Measures |
|---|---|
| Sales | leads, qualified, quotes, orders, conversion % |
| Operations | active orders, overdue tasks, blocked tasks, average installation duration (INSTALLATION start → QC_HANDOVER) |
| Money | booked value, collected, outstanding, estimated margin (admin and owner only) |
| Quality | QC first-pass %, rework count, complaints |

5. **Languages** (D-18):
   - Translate every technician, sales, surveyor and customer screen into English, Marathi and Hindi. Missing keys fall back to English.
   - Put the language switch in the header.
   - Decouple `language.ts` from `DbManager` if the audit flagged it.
   - Mark new Marathi and Hindi strings `// needs native review`, and list them in the PR so the Owner can check them.

## Checks
- The customer sees their own order and none of: cost, margin, other customers.
- The Owner totals match a hand calculation on the fixture data: after S1, collected = ₹11,80,000 and completed = 1.
- Each of the 10 notifications fires once, with no duplicates on refresh.
- Switching language changes the field screens with no missing-key crashes (a check script over the keys used by MVP screens).

## Report back (exactly this, then STOP)
```
## Step 10 report
1. Done  2. Files changed  3. Data changes  4. Checks  5. Scope guard
6. How to see it (customer phone view, owner view, bell, reports, language switch; screenshots)
7. Deviations  8. Strings needing native review (count + file)  9. Questions
PR: <link>
Next: prompts/11_SECURITY_COMPLIANCE_HARDENING.md
```
