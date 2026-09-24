<!-- HOW TO RUN: merge the Step 08 PR → NEW session → paste below the line. -->
---
# MVP STEP 09: QC decision and rework loop, statutory licence, handover, AMC, and emergency

Follow the **Step protocol in CLAUDE.md**. Confirm Step 08 is DONE.

Read:
- **Step 09** in `docs/mvp/MVP_REFACTOR_PLAN.md`
- MVP_SPEC §19, §20 and §21
- DECISIONS D-08, D-14, D-23, D-26, **D-28 and D-29**
- ACCEPTANCE_SCENARIOS S1 steps 14–16, S4, **S9 and S10**

## Goal
- A human QC inspector passes the installation or sends it back for rework.
- The handover is captured with evidence and the customer's confirmation.
- The order completes, and AMC follow-up starts automatically.

## Build
**Reuse first (D-31).** Open the **Step 09** rows in `docs/mvp/REUSE_MAP.md`.
- ◆ canonical code: use it as-is.
- ★ bridged screens: switch their reads to canonical. Don't rebuild them.
- ○ legacy screens over about 600 lines: build a thin new screen that reuses their components.

Put a one-line "why not reuse" in the PR for anything new.

Reuse or simplify: `QcInspectorAssignmentScreen`, `QualityChecklistMechanicalScreen`/`Electrical` (merge them into one simple QC screen), `ReworkAssignmentScreen`, `FinalHandoverChecklistScreen`, `HandoverCompletionCertificateScreen`, `ESignatureCapture` (only if it already works), `WarrantyAmcRegistrationScreen`, and the canonical `QCInspection`, `Snag`, `Handover`, `Warranty` and `AMC`. **Rewire to canonical.**

1. **QC screen (QC role).** It shows:
   - the order summary
   - the installation checklist with photos
   - test-result fields: 10 trial runs OK, floor levelling OK, doors/interlocks OK, emergency stop and alarm OK, ARD/rescue OK if fitted, and remarks
   - QC's own photos

   **The decision is PASS, REWORK or FAIL** (D-23):
   - **PASS:**
     - progress goes to 95
     - the HANDOVER and COLLECT_FINAL_PAYMENT tasks are created
     - the "handover ready" notification is sent
   - **REWORK:**
     - a `Snag` is created
     - a REWORK task goes to the installation technician (+3 days)
     - when it completes, a new QC_INSPECTION task is created
   - **FAIL:**
     - the order goes ON_HOLD
     - a REVIEW_HOLD task is created for the Admin
2. **Handover.**
   - **The Admin (or the technician, if the plan says so) captures:**
     - the final test confirmation
     - photos
     - the required documents (links into the Documents & Compliance list from D-27; statuses only, nothing is enforced legally ⚖)
     - the payment status
     - the handover date
   - **The customer confirms** in their app. Use OTP or signature only if that already works; otherwise use a confirmation tick with name, timestamp and device.
   - **Gate:** the final payment is PAID, or the Admin overrides it (audited).
   - **On completion:**
     - the order's status becomes COMPLETED and its stage becomes AMC
     - a `Warranty` record is created (start date = handover, end date = +12 months from config ⚖)
     - the AMC record's `mvpAmcStatus` is set to WARRANTY
     - an AMC_FOLLOW_UP task is created, due at the warranty end minus 90 days
3. **Statutory licence (D-29)** ⚖.
   - QC PASS creates the STATUTORY_LICENCE task.
   - The task completes when the "lift license" compliance document is DONE with a file attached.
   - Handover completion needs the licence to be DONE. The Admin can override with a reason (audited).
   - After an override, the task stays open and the order shows under Needs Attention → "Licence pending".
4. **Emergency (D-28).** A thin new flow that reuses the UI parts of `EmergencyEscalationAlert.tsx`. No rescue guidance and no GPS.
   - An EMERGENCY button for customers of installed lifts, plus the configured emergency phone number.
   - It creates a `ServiceCase` with priority P0, and an EMERGENCY_RESPONSE task for today's on-call technician (the Admin if none is set), due +45 minutes (config).
   - Immediate in-app alerts go to the Admin, the Owner and the technician.
   - The case sits at the top of Needs Attention, in red.
   - The customer sees the "call 112" line.
   - A simple "on-call technician today" setting for the Admin.
5. **AMC list (Admin).**
   - One simple table of completed lifts with: warranty expiry, AMC status (WARRANTY → AMC_DUE (computed) → AMC_OFFERED → AMC_ACTIVE | AMC_LOST), reminder date, last service, next service, open complaints.
   - The Admin can change the AMC status (audited) and set the next service date.
   - **Complaints:** reuse the canonical `ServiceCase` as a simple complaint record. No marketplace.

## Checks
- S1 steps 14–16 end-to-end: completed order, a Warranty exists, and AMC_FOLLOW_UP has the right due date.
- S4: REWORK loop, then PASS. Rework count = 1. The FAIL variant gives ON_HOLD.
- Handover is refused when the final payment isn't PAID, unless overridden (audited).
- S9 (emergency: alerts, overdue after 45 minutes, resolve, audited; variant with no on-call technician). S10 (licence override leaves the task open and shows "Licence pending").
- A completed order leaves the Active lists and appears in the AMC list and Owner totals.

## Report back (exactly this, then STOP)
```
## Step 09 report
1. Done  2. Files changed  3. Data changes  4. Checks  5. Scope guard
6. How to see it (QC → rework → pass → handover → AMC; screenshots)
7. Deviations  8. Questions (⚖ warranty terms, documents list)
PR: <link>
Next: prompts/10_CUSTOMER_OWNER_NOTIFY_REPORTS_LANG.md
```
