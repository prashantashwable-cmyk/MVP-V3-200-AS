<!-- HOW TO RUN: merge the Step 05 PR → NEW session → paste below the line. -->
---
# MVP STEP 06: Quote with margin guard, booking, and payment milestones

Follow the **Step protocol in CLAUDE.md**. Confirm Step 05 is DONE.

Read:
- **Step 06** in `docs/mvp/MVP_REFACTOR_PLAN.md`
- MVP_SPEC §16 and §17
- DECISIONS D-08, D-14 and D-15
- ACCEPTANCE_SCENARIOS (fixture order, S1 steps 5–7, S5, S6)

## Goal
- The Admin builds a quote in 2 minutes.
- The system blocks sending a quote below the minimum margin unless the Admin approves it.
- The customer accepts in-app.
- Three payment milestones are tracked.
- A verified booking token moves the order to SITE_READY automatically.

## Build
**Reuse first (D-31).** Open the **Step 06** rows in `docs/mvp/REUSE_MAP.md`.
- ◆ canonical code: use it as-is.
- ★ bridged screens: switch their reads to canonical. Don't rebuild them.
- ○ legacy screens over about 600 lines: build a thin new screen that reuses their components.

Put a one-line "why not reuse" in the PR for anything new.

Reuse or simplify: `QuotePricing`, `QuotationPreview`, `PricingRulesMarginConfig`, `DiscountApprovalWorkflow`, `PaymentStageScheduleSetup`, `PaymentCollectionDashboard`, the canonical `Quote`/`QuoteVersion`, `PaymentSchedule`/`Payment` and `ApprovalRequest`. **Rewire to canonical. Don't build new engines.**

1. **Quote builder (Admin).**
   - **Lines:** base lift, installation, freight, other charges, then tax (from `GST_RATE_PCT` config, with a visible "⚖ rate not confirmed" warning while unset), then the selling price.
   - **Internal-only panel:** estimated cost, markup %, gross margin % (D-15). **The cost must never reach the customer, the technician, QC or the surveyor**, either on screen or in any document they can read. Enforce this with the rules and data layout decided in the plan.
   - **Below `MIN_MARKUP_PCT`:** create an APPROVE_MARGIN task and an `ApprovalRequest`. The Send button stays disabled until the Admin approves with a reason (audited).
   - **Versions:** keep a new version on each edit (reuse `QuoteVersion`).
   - **Preview:** a customer-facing view with no cost fields. PDF only if an existing generator already works; otherwise a printable page is enough.
   - **Send:** creates the QUOTE_DECISION task for the customer and sends the "quote ready" notification.
2. **Customer: quote decision.** Accept, or Request changes (a note that goes back to the Admin's PREPARE_QUOTE task).
   - **Accept:**
     - stage becomes BOOKED
     - the COLLECT_BOOKING_TOKEN task is created
     - the 3 milestones are created with the D-14 default amounts
3. **Payment milestones.**
   - Each milestone holds amount, due date, status, method, reference and notes.
   - The Admin can edit amounts. Each edit is audited, and **the sum must equal the selling price**, otherwise the change is blocked.
   - **Customer:** "I have paid" → UTR/reference plus an optional screenshot (D-16 storage rules).
   - **Admin:** verify, which sets PAID (or PARTIAL with the amount received), or reject with a reason.
   - **Token PAID:**
     - the stage automatically becomes SITE_READY
     - the SITE_READINESS and RAISE_PO tasks are created (D-08)
     - the lead becomes WON
   - Keep the existing payment gateway **only if** the audit marked it real and stable. Otherwise hide it behind `MVP_MODE`.
4. **Soft gates** (D-14). Build a single helper that is reused in Steps 07–09. It returns `{allowed, reason}`, and the Admin can override it with a reason, which is audited.

## Checks
- The fixture quote gives ₹11,80,000 and markup 25%. The low-margin variant requires approval and can't be sent before approval.
- The milestone amounts match the fixture, and edits that don't add up to the total are rejected.
- S1 steps 5–7, S6 (cancel at QUOTE), and the S5 setup (payment overdue gives AT_RISK).
- I-5: cost is not readable by the customer or technician (emulator rules test, or a check at the service or projection level).
- Every payment status change writes an audit event.

## Report back (exactly this, then STOP)
```
## Step 06 report
1. Done  2. Files changed  3. Data changes  4. Checks  5. Scope guard
6. How to see it (Admin quote → Customer accept → payment verify; screenshots)
7. Deviations  8. Questions (incl. anything ⚖ for the CA)
PR: <link>
Next: prompts/07_SITE_READY_SUPPLIER_DELIVERY.md
```
