# ACCEPTANCE SCENARIOS: exact data and the results to expect

> Automated checks (Step 12) and the manual verification must use these scenarios.
> **Run them only against the Firebase emulator or the demo repository. Never against real data (D-19).**
> All the people and companies below are fictional test fixtures.

## Fixture users
| Key | Role | Name |
|---|---|---|
| admin | ADMIN | Admin One |
| owner | OWNER | Owner Test |
| sales | SALES | Sales Sameer |
| surveyor | SURVEYOR | Surveyor Suresh |
| tech1 | TECHNICIAN | Technician Rahul |
| tech2 | TECHNICIAN | Technician Vikas |
| qc | QC | QC Meera |
| cust | CUSTOMER | ABC Builders (contact: Mr. Kulkarni) |
| cust2 | CUSTOMER | XYZ Homes. Used only in the access checks. |
| supplier | SUPPLIER | Sahyadri Lift Components. Admin-managed by default. |

## Fixture order
- **Site:** Baner, Pune.
- **Lift:** G+7 passenger lift, 8 stops, 8 persons.
- **Quote lines (excl. tax):**

| Line | Amount |
|---|---|
| Base lift | ₹7,80,000 |
| Installation | ₹1,40,000 |
| Freight | ₹50,000 |
| Other | ₹30,000 |
| **Total excl. tax** | **₹10,00,000** |

- **Tax:** the tests use `GST_RATE_PCT = 18` **as a fixture value only**. The real rate is ⚖ VERIFY with a CA. Selling price = **₹11,80,000**.
- **Estimated cost:** ₹8,00,000, giving markup 25% and gross margin 20%. That passes the `MIN_MARKUP_PCT` floor (20%).
- **Low-margin variant:** cost ₹8,50,000, giving markup 17.6%. The quote must require Admin approval.
- **Payment milestones:**

| Milestone | Amount |
|---|---|
| Token | ₹10,000 |
| Delivery | 90% × 11,80,000 − 10,000 = **₹10,52,000** |
| Final | **₹1,18,000** |
| **Sum** | **₹11,80,000** |

## Invariants: assert after EVERY step of EVERY scenario
- **I-1:** Every ACTIVE order has at least one open task with an assignee and a due date. The current task's owner and due date appear in the Order View.
- **I-2:** No order ever has two open tasks of the same type.
- **I-3:** Every change to stage, status, payment, task owner, due date, quote approval, QC decision or cancellation writes an AuditEvent recording who, when, what, and the before and after values.
- **I-4:** Stage never moves backwards, except through an audited Admin override.
- **I-5:** The customer never sees `estimatedCost` or margin. Technicians, QC and surveyors never see cost either.
- **I-6:** Progress and health match the pure functions in D-10 and D-11.

## S1: Happy path (spec §38)
| # | Actor | Action | Stage after | Current task → owner | Progress | Expected extras |
|---|---|---|---|---|---|---|
| 1 | sales | Creates a lead. Consent ✓, 1 site photo, construction stage "structure complete". | LEAD (lead) | QUALIFY_LEAD → sales | 0 | Lead status NEW |
| 2 | sales | Marks the lead qualified | QUALIFIED | ASSIGN_SURVEYOR → admin | 5 | Customer, Site and Order `AE-####` are created. Lead is QUALIFIED. |
| 3 | admin | Assigns the surveyor, date = today + 2 | SURVEY | SURVEY → surveyor | 10 | Lead is SURVEY. The "survey scheduled" notification is sent. |
| 4 | surveyor | Submits every survey field and 2 photos. Result FEASIBLE. | QUOTE | PREPARE_QUOTE → admin | 20 | Lead is QUOTE |
| 5 | admin | Prepares the quote with the fixture lines and cost, then sends it | QUOTE | QUOTE_DECISION → cust | 20 | No approval needed. "Quote ready" notification. |
| 6 | cust | Accepts the quote | BOOKED | COLLECT_BOOKING_TOKEN → admin | 30 | 3 milestones are created, all PENDING |
| 7 | cust → admin | The customer submits UTR `TEST123`; the Admin marks the token PAID | SITE_READY | SITE_READINESS → cust (due +14 days) | 40 | RAISE_PO → admin is also open. Payment shows ₹10,000 / ₹11,80,000. Lead is WON. |
| 8 | admin | Raises a PO to the supplier, expected delivery = today + 10 | SITE_READY | SITE_READINESS → cust | 40 | RAISE_PO completes |
| 9 | cust | Uploads 2 site photos and confirms the site is ready | SITE_READY | VERIFY_SITE_READY → admin | 40 | — |
| 10 | admin | Confirms the site is ready | DELIVERY | TRACK_DELIVERY → admin (due = PO date) | 50 | COLLECT_DELIVERY_PAYMENT is also open |
| 11 | admin | Records the delivery payment as PAID | DELIVERY | TRACK_DELIVERY → admin | 50 | Payment shows ₹10,62,000 / ₹11,80,000 |
| 12 | admin | Marks the material received, with a photo | INSTALLATION | INSTALLATION → tech1 | 55 | "Installation scheduled" notification |
| 13a | tech1 | START, CHECK IN, then completes 6 of the 11 checklist items, each with a photo | INSTALLATION | INSTALLATION → tech1 (IN_PROGRESS) | **71** | Progress = round(55 + 30 × 6/11) |
| 13b | tech1 | Completes the remaining 5 items, then COMPLETE | QC_HANDOVER | QC_INSPECTION → qc | 90 | "QC required" notification |
| 14 | qc | PASS, with test results and remarks | QC_HANDOVER | HANDOVER → admin | 95 | COLLECT_FINAL_PAYMENT and STATUTORY_LICENCE (+30 days) are also open. "Handover ready" notification. |
| 15 | admin | Records the final payment as PAID | QC_HANDOVER | HANDOVER → admin | 95 | Payment shows ₹11,80,000 / ₹11,80,000 |
| 15b | admin | Marks the "lift license" compliance document DONE, with a file attached (fixture PDF) | QC_HANDOVER | HANDOVER → admin | 95 | STATUTORY_LICENCE completes (D-29) |
| 16 | cust → admin | The customer approves the handover (OTP or signature if supported, otherwise a confirmation tick); the Admin completes it with photos and documents | AMC | AMC_FOLLOW_UP → admin (due = warranty end − 90 days) | 100 | Order is COMPLETED. The Warranty ends 12 months after handover. The AMC status is WARRANTY. |

## S2: Customer delay
1. Run S1 to step 7.
2. Simulate the clock moving forward 15 days (inject "now" into the pure functions; don't rely on real time).
3. **Expect:**
   - SITE_READINESS is overdue
   - health is OVERDUE
   - the order appears under Admin → Needs Attention → Overdue / Customer waiting
4. The Admin puts the order ON_HOLD with reason CUSTOMER_NOT_READY and review date today + 7.
5. **Expect:**
   - health is ON_HOLD
   - REVIEW_HOLD → admin is created
   - the stage is still SITE_READY
6. The Admin resumes the order and extends SITE_READINESS by 7 days.
7. **Expect:** status ACTIVE and health ON_TRACK. **Both the due-date change and the resume are audited.**

## S3: Technician blocker
1. Run S1 to step 13a.
2. tech1 taps **BLOCKED**, chooses MATERIAL_MISSING, and adds a description and a photo.
3. **Expect:**
   - the INSTALLATION task is BLOCKED
   - a blocker is OPEN, owned by admin
   - health is BLOCKED
   - the Admin receives a notification
   - the order appears under Needs Attention → Blocked / Technician waiting
4. The Admin resolves the blocker with the note "brackets dispatched".
5. **Expect:** the task returns to IN_PROGRESS, health is ON_TRACK, and the blocker is RESOLVED with a resolvedAt time.

## S4: QC rework
1. Run S1 to step 13b.
2. QC chooses **REWORK** with the remark "Door gap uneven, floor 4".
3. **Expect:**
   - a Snag is created
   - REWORK → tech1 is created, due +3 days, and becomes the current task
   - progress stays at 90
4. tech1 completes REWORK with a photo.
5. **Expect:** a new QC_INSPECTION → qc task.
6. QC chooses PASS.
7. **Expect:** the order continues from S1 step 14, and the Quality report shows rework count = 1.

**Variant FAIL:**
- QC chooses FAIL.
- **Expect:** the order goes ON_HOLD and REVIEW_HOLD → admin is created.

## S5: Payment pending
1. Run S1 to step 10. Do **not** record the delivery payment.
2. Move the clock past its due date.
3. **Expect:** health is AT_RISK and the order appears under Needs Attention → Payment pending.
4. The Admin marks the material received.
5. **Expect:** the stage becomes INSTALLATION and the INSTALLATION task exists.
6. tech1 presses START.
7. **Expect:** the action is refused, with the message "Waiting for delivery payment".
8. The Admin overrides with a reason.
9. **Expect:** the override is audited and tech1 can now START.

## S6: Cancelled order
1. Run S1 to step 5 (QUOTE stage).
2. The Admin cancels the order with the reason "Customer chose another vendor".
3. **Expect:**
   - the status is CANCELLED
   - every open task is CANCELLED
   - the lead is LOST
   - the order is no longer in Active lists, but is still in reports and history
   - **nothing is deleted**

## S7: Admin intervention
1. Run S1 to step 12.
2. The Admin reassigns the INSTALLATION task from tech1 to tech2 and moves its due date 3 days earlier.
3. **Expect:**
   - 2 audit events with the before and after values
   - tech2 is notified
   - tech1 no longer sees the task
   - the Order View immediately shows the new owner and due date

## S8: Access control (run with the emulator security rules)
| Check | Expected |
|---|---|
| cust2 reads cust's order, tasks or evidence | Denied |
| tech2 reads an order where they have no task | Denied |
| A non-admin changes a role, a payment status or a quote price | Denied |
| cust or tech1 reads a quote's `estimatedCost` | Not visible. Stored separately, or stripped by the server. |
| A signed-out user reads anything | Denied |

## S9: Emergency (D-28)
1. Run S1 to the end (the order is COMPLETED, stage AMC). The Admin sets tech2 as today's on-call technician.
2. cust presses **EMERGENCY** and chooses "Lift stuck between floors".
3. **Expect:**
   - a `ServiceCase` with priority P0
   - an EMERGENCY_RESPONSE → tech2 task, due +45 minutes
   - immediate in-app alerts to the Admin, the Owner and tech2
   - the case at the top of Needs Attention, in red
   - the customer sees "If someone is trapped and unwell, call 112 now"
4. Move the clock forward 46 minutes without anyone acknowledging.
5. **Expect:** the case shows as overdue.
6. tech2 acknowledges, then resolves it with a note and a photo.
7. **Expect:** the case is resolved, the time to acknowledge and the time to resolve are recorded, and everything is audited.

**Variant:** no on-call technician is set, so the task goes to the Admin.

## S10: Licence pending at handover (D-29)
1. Run S1 to step 15. **Skip step 15b.**
2. The Admin tries to complete the handover.
3. **Expect:** it is refused, with the message "Statutory licence not done".
4. The Admin overrides with the reason "Technical handover accepted; licence pending".
5. **Expect:**
   - the order is COMPLETED and the stage is AMC
   - **the STATUTORY_LICENCE task stays open**
   - the order appears under Needs Attention → "Licence pending"
   - the override is audited
6. The Admin later marks the licence DONE.
7. **Expect:** the task completes and the order leaves "Licence pending".
