# DECISIONS: how the MVP spec's ambiguities are resolved

> These are the defaults Claude must follow. The Owner can change any of them: edit the line, then note the change in PROGRESS.md.
> Step 01 (Audit) may propose changes. Step 02 (Plan) freezes them, and after that they change only through `U4_CHANGE_REQUEST`.
> `⚖ VERIFY` means the point is legal, tax or regulatory. The software only *records* it and does not decide it.

## A. Data & architecture

**D-01 One shared source of truth.**
- Every MVP screen reads and writes the **canonical Firestore repository** (`src/repository/*`, entities in `src/domain/entities.ts`).
- The legacy `DbManager` (browser localStorage) must never be the store of record for any MVP data.
- Non-MVP legacy screens are hidden, not migrated (D-22).
- Do **not** continue the old pack's legacy-migration phases for non-MVP screens.

**D-02 Order = canonical `Project`.**
- The UI calls it "Order".
- Add a human display code `AE-####` as a new field, e.g. `displayCode`, if one doesn't exist. Generate it once, inside a transaction (for example a counter document), and never change it.
- The internal ID stays as it is.

**D-03 Ten MVP stages.**
- Add `survey` and `site_ready` to `ProjectStage` as an **additive** change: existing values stay valid for old data.
- Expose `toMvpStage(project.stage)`.
- A stage means **"the phase whose work is happening now"**.

| MVP stage | Legacy `ProjectStage` values it maps from | Entered when |
|---|---|---|
| LEAD | `lead` (a lead that hasn't converted yet; normally still a Lead record) | Lead created |
| QUALIFIED | `customer_site_confirmed` | Sales marks the lead qualified. **The Order is created here.** |
| SURVEY | `survey` (new) | A surveyor is assigned |
| QUOTE | `quoting`, `negotiation` | Survey result is FEASIBLE |
| BOOKED | `contract`, `payment` | Customer accepts the quote. Booking (token and agreement) is now in progress. |
| SITE_READY | `site_ready` (new) | Booking token is PAID. The customer is now preparing the site. |
| DELIVERY | `procurement`, `production`, `delivery` | Admin confirms the site is ready |
| INSTALLATION | `installation` | Material is marked received at site |
| QC_HANDOVER | `qc`, `handover` | Technician completes the installation checklist |
| AMC | `warranty_amc`, `service` | Handover is completed |

- Stages only move forward, with two exceptions: an Admin override, which requires a reason and is audited, and the QC rework loop, which stays inside QC_HANDOVER.

**D-04 Lead vs Order.**
- A lead stays a `CanonicalLead` until it is QUALIFIED.
- Qualification creates the Customer, the Site and the Project/Order (with `sourceLeadId`) in one transaction.
- After conversion, the lead's status follows the order automatically:

| Order state | Lead status |
|---|---|
| SURVEY stage | SURVEY |
| QUOTE stage | QUOTE |
| Booking token paid | WON |
| Cancelled before booking | LOST |

- Map the spec's lead statuses onto `CanonicalLeadStage`: NEW=`captured`, CONTACTED=`contacted`, QUALIFIED=`assigned`, SURVEY=`survey_done`, QUOTE=`quoted` or `negotiating`, WON=`closed_won`, LOST=`closed_lost`. If a cleaner additive mapping exists, Step 02 decides it.
- The Pipeline's "Lead" column shows leads that haven't converted.

**D-05 Order status is separate from stage.**
- Status is one of `ACTIVE | ON_HOLD | CANCELLED | COMPLETED`, added as an additive field. A missing value means ACTIVE.
- Putting an order on hold or cancelling it never changes its stage, so it always shows where it stopped.

**D-06 Task.**
- A new canonical entity in a new `tasks` collection.
- Fields: the spec §11 fields, plus `stage`, `title`, `createdBy`, `createdAt`, `updatedAt` and `version`. `version` gives optimistic concurrency, matching the existing repositories.
- The **current task** is the open task (TODO, IN_PROGRESS or BLOCKED) in the order's current stage with the earliest due date.
- **Invariant:** every ACTIVE order has at least one open task with an assignee and a due date. If one doesn't, show a **NO NEXT ACTION** alert on the Admin dashboard, with a one-click "create next task" (D-08).
- Rewire `workQueue.ts` and `projectOperatingView.ts` to read persisted tasks. Don't duplicate them.

**D-07 Blocker.**
- A new canonical entity in a new `blockers` collection.
- Fields: `orderId`, `taskId?`, `reason` (one of the spec's 8 reasons), `description`, `evidence[]`, `ownerUserId`, `status` (`OPEN | RESOLVED`), `resolutionNote`, `createdAt`, `createdBy`, `resolvedAt`.
- **Opening a blocker:**
  - the task becomes BLOCKED
  - order health becomes BLOCKED
  - the Admin is notified
- **Resolving it:** the task returns to its previous status.
- **Default owner for each reason:**

| Reason | Owner |
|---|---|
| CUSTOMER_NOT_READY | Customer |
| POWER_UNAVAILABLE | Customer |
| PAYMENT_PENDING | Customer |
| Every other reason | Admin |

- The Admin can reassign a blocker. The default due date is 2 days after it is raised.

**D-08 Simple rule automation.**
- Build **one pure module**, e.g. `src/mvp/rules.ts`, that maps each event to the next tasks.
- Make it **idempotent**: never create a second open task of the same type for the same order.
- Give it unit check scripts.
- No workflow engine and no event-sourcing overhaul. Reuse `src/workflows/definitions/*` only where it fits.

| Event | Stage becomes | Creates task(s): type → default owner, due |
|---|---|---|
| Lead created | LEAD | QUALIFY_LEAD → lead's sales owner, +2 days |
| Lead qualified | QUALIFIED | ASSIGN_SURVEYOR → Admin, +1 day |
| Lead qualified, and `SURVEY_FEE_INR > 0` (D-30) | QUALIFIED | COLLECT_SURVEY_FEE → Admin, +2 days. The surveyor can't be assigned until the fee is PAID or the Admin waives it (audited). |
| Surveyor assigned | SURVEY | SURVEY → surveyor, scheduled date (default +3 days) |
| Survey FEASIBLE | QUOTE | PREPARE_QUOTE → Admin, +2 days |
| Survey REQUIRES_CORRECTION | stays SURVEY | SITE_CORRECTION → customer, +14 days. When the customer completes it, create SURVEY again. |
| Survey NOT_FEASIBLE | stays SURVEY | REVIEW_NOT_FEASIBLE → Admin, +1 day. The Admin cancels the order or re-surveys. |
| Quote prepared, margin below minimum | stays QUOTE | APPROVE_MARGIN → Admin, +1 day |
| Quote sent | stays QUOTE | QUOTE_DECISION → customer, +7 days |
| Quote accepted | BOOKED | COLLECT_BOOKING_TOKEN → Admin, +3 days |
| Booking token PAID | SITE_READY | SITE_READINESS → customer, +14 days (the "2-week rule"), **and** RAISE_PO → Admin, +2 days |
| Customer submits readiness (photos) | stays SITE_READY | VERIFY_SITE_READY → Admin, +1 day |
| Admin confirms site ready | DELIVERY | TRACK_DELIVERY → Admin (or supplier), due = PO expected delivery date, **and** COLLECT_DELIVERY_PAYMENT → Admin, delivery date +2 days |
| Material received at site | INSTALLATION | INSTALLATION → technician, +21 days |
| Installation checklist complete | QC_HANDOVER | QC_INSPECTION → QC, +2 days |
| QC PASS | stays QC_HANDOVER | HANDOVER → Admin (customer approves), +3 days, **and** COLLECT_FINAL_PAYMENT → Admin, +3 days, **and** STATUTORY_LICENCE → Admin, +30 days (D-29) |
| QC REWORK | stays QC_HANDOVER | REWORK → technician, +3 days. Also creates a `Snag`. When REWORK completes, create QC_INSPECTION again. |
| QC FAIL | stays QC_HANDOVER | Order status → ON_HOLD, and REVIEW_HOLD → Admin, +1 day |
| Handover completed | AMC | Order status → COMPLETED, a Warranty record is created, and AMC_FOLLOW_UP → Admin, due = warranty end − 90 days |
| Order put ON_HOLD | unchanged | REVIEW_HOLD → Admin, due = hold review date. **Required, so a held order never disappears.** |
| Order CANCELLED | unchanged | All open tasks → CANCELLED. Payments are left untouched. |
| EMERGENCY raised (D-28), on any installed lift | unchanged | EMERGENCY_RESPONSE → today's on-call technician (or the Admin if none is set), due +45 minutes. The Admin and Owner are alerted immediately. |

**D-09 Due-date defaults** live in a **single constants/config file**, set to the values in D-08. Every due date shown in the UI comes from a task.

**D-10 Progress % is deterministic.** It is a pure function with a unit check.

| Stage | Progress |
|---|---|
| LEAD | 0 |
| QUALIFIED | 5 |
| SURVEY | 10 |
| QUOTE | 20 |
| BOOKED | 30 |
| SITE_READY | 40 |
| DELIVERY | 50 |
| INSTALLATION | 55 + 30 × (checklist items done ÷ 11) |
| QC_HANDOVER | 90, or 95 once QC has passed |
| AMC | 100 |

**D-11 Health is deterministic.** Apply the first rule that matches:

| Order | Health | When |
|---|---|---|
| 1 | ON_HOLD | Order status is ON_HOLD |
| 2 | BLOCKED | There is an open blocker |
| 3 | OVERDUE | The current task is past its due date, **or** there is NO NEXT ACTION |
| 4 | AT_RISK | The current task is due within 24 hours and is still TODO, **or** any payment milestone is past due |
| 5 | ON_TRACK | Otherwise |

The Admin's "Needs Attention" section shows every order whose health is not ON_TRACK.

## B. Roles & access

**D-12 Roles.**
- Add `owner`, `sales` and `qc` to `CanonicalUserRole` and the permission map as an **additive** change. Map legacy `UserRole` values through an adapter.
- Only the Admin can assign roles (`user.manage`).
- Enforce every permission in **both** the UI and `firestore.rules`/`storage.rules`. Test the rules with the emulator (D-19).

| Role | Can see and do |
|---|---|
| Admin | Everything |
| Owner | Read-only on everything, plus reports. Money approvals stay with the Admin unless the Owner asks otherwise. |
| Sales | Create leads, see their own leads and the orders converted from them |
| Surveyor | Assigned surveys only |
| Technician | Assigned tasks and those orders' site details only |
| QC | Assigned QC tasks only |
| Customer | Their own orders only |
| Supplier | Their own POs only. Default: the Admin manages suppliers, and the supplier has no login (D-15). |

**D-13 Logins for real people.** Ask the Owner in Step 01: Google sign-in only, or also email/password or phone OTP?
- Default: Google sign-in for staff and customers, with email/password as a fallback if it already works.
- An invited user's email is linked to their role and to their Customer or partner record on first sign-in.
- No self-signup into internal roles.

## C. Money

**D-14 Payment milestones.**
- Default milestones:
  - Booking token ₹10,000
  - Delivery payment = 90% of the selling price including tax, minus the token
  - Final handover payment = 10%
- The Admin can edit the amounts for each order; every edit is audited.
- Each milestone holds the spec §17 fields and statuses.
- **Recording a payment:** the customer submits proof (UTR, reference or screenshot), then the Admin verifies it and marks it PAID. Payments are recorded manually by default.
- Keep the existing `src/integrations/paymentGateway.ts` **only if** Step 01 proves it is real and stable. Otherwise hide it.
- **Soft gates** (the Admin can override with a reason; overrides are audited):

| Gate | Requirement |
|---|---|
| Enter SITE_READY | Token PAID |
| Technician presses START on the INSTALLATION task | Delivery payment PAID. The material itself can be marked received without it. |
| Complete handover | Final payment PAID **and** STATUTORY_LICENCE done (D-29). The Admin can override either one, with a reason. |

- Refunds are recorded as REFUNDED with a reference. The software moves no money ⚖ VERIFY refund terms in the customer agreement.

**D-15 Quote & margin.**
- Quote lines follow spec §16.
- `estimatedCost` is Admin-only, and the customer must never be able to see it.
- **Show both measures:**
  - **Gross margin %** = (price excl. tax − cost) ÷ price excl. tax
  - **Markup %** = (price excl. tax − cost) ÷ cost
- **Minimum rule:** configurable `MIN_MARKUP_PCT`, default **20**, matching the Owner's "minimum 20% margin".
- If the quote falls below the minimum, create an `ApprovalRequest` (existing entity) plus an APPROVE_MARGIN task. The quote can't be sent until it is approved.
- **Tax rate:** `GST_RATE_PCT` is a config value. The Owner sets it only after a CA confirms it ⚖ VERIFY. Until then, show a visible "tax rate not confirmed" warning on quotes. **Never hard-code a tax rate.**
- Reuse `QuotePricing`, `QuotationPreview` and `PricingRulesMarginConfig` only if Step 01 finds they can be wired to the canonical `Quote` cheaply.

## D. Evidence, notifications, UX

**D-16 Evidence.**
- Store files in Firebase Storage under `orders/{orderId}/...`, with metadata on the task or checklist item.
- Only that order's participants and the Admin/Owner can access them. Use storage rules plus short-lived URLs.
- Accept images only, up to 10 MB, compressed on the device if an existing helper does it.
- Reuse `CameraCapture.tsx` and `src/offline/mediaUpload.ts`/`outbox.ts`.
- No computer vision.

**D-17 Notifications.**
- In-app notifications use the existing `notificationService`/`NotificationRecord`.
- Use WhatsApp, SMS or email only if they already work end-to-end. WhatsApp goes only to recipients who have given consent ⚖ VERIFY.
- Detect overdue tasks when the dashboard loads, plus one daily digest. Use a scheduled endpoint only if the deployment already supports one.
- No new infrastructure and no voice calls.

**D-18 Languages & locale.**
- Reuse `src/lib/language.ts` (`en/mr/hi`). Decouple it from `DbManager` if needed.
- Translate the field screens (technician, sales, surveyor, customer) into all three languages.
- Missing keys fall back to English.
- Mark new Marathi and Hindi strings `// needs native review`.
- Show all times in Asia/Kolkata and all money as ₹ in en-IN format (₹12,00,000).

## E. Safety of the build itself

**D-19 Never test against real data.**
- Automated checks run against the **Firebase Emulator Suite** (Auth, Firestore, Storage) or against the in-memory demo repository.
- Nothing automated may write to project `dogwood-torus-v71nt`.
- `live-*` scripts are run by a human only, and are listed in the go-live checklist.
- No credentials are committed.
- If the emulator can't run in the cloud session (Java missing, or a download blocked), use demo-repository checks, and log the gap in PROGRESS.md. **Do not loop on "missing credential".**

**D-20 Demo mode.**
- Keep "Try as Role" for training only if it can never touch real data.
- The production build must use `VITE_APP_ENV=production`, and `production-bundle-bypass:check` must pass.

**D-21 One pilot deployment target.** Vercel or AI Studio/Cloud Run: the Owner decides in Step 01. The default is whichever one is live now. Document it in the plan.

**D-22 Hide, don't delete.**
- Add `MVP_MODE`, on by default, which filters navigation and command-palette entries down to MVP screens.
- Non-MVP screens stay in the code and are reachable with `MVP_MODE` off.
- Delete only code that is **proven** dead: nothing imports it, and no route or check uses it.
- Leave the legacy `DbManager` in place for the hidden screens.

**D-23 Old check suite.**
- Checks that cover MVP code must keep passing.
- Checks that only cover hidden subsystems move to `npm run checks:legacy`, which is kept, not deleted.
- New MVP checks go into `npm run mvp:checks`, following the existing `tsx` script convention.
- Add Playwright E2E only if Step 02 justifies it. Cloud sessions often have Chromium preinstalled; check `PLAYWRIGHT_BROWSERS_PATH`.

## F. Lifecycle edges

**D-24 Hold.** ON_HOLD requires a reason and a review date, and creates a REVIEW_HOLD task (D-08). Resuming the order returns it to ACTIVE, with the previous stage unchanged.

**D-25 Cancel.**
- Only the Admin can cancel, and a reason is required.
- Open tasks become CANCELLED and the linked lead becomes LOST.
- Payments are left untouched.

**D-26 Handover & AMC.**
- Handover sets the order's status to COMPLETED and its stage to AMC.
- It creates a `Warranty` (existing entity), with its end date = handover + 12 months by default. This is configurable ⚖ VERIFY against the agreement.
- Add an additive `mvpAmcStatus` field to the AMC record: `WARRANTY → AMC_DUE → AMC_OFFERED → AMC_ACTIVE | AMC_LOST`.
- **AMC_DUE is computed:** it starts 90 days before the warranty ends.
- Track these dates: warranty expiry, AMC reminder, last service, next service.

**D-27 Compliance records** ⚖ VERIFY.
- Each order has a simple "Documents & Compliance" list. Each item has a type, a status (`NOT_STARTED | IN_PROGRESS | DONE | NOT_APPLICABLE`), a file and a note.
- Types: lift license, statutory inspection, contractor responsibility, insurance, GST invoice, TDS, customer agreement, partner agreement.
- Reuse `DocumentRecord`.
- The software records compliance. It does not guarantee it.

## G. Additions carried over from the V4 workflow (small on purpose)

**D-28 Emergency and breakdown (life safety).**
- **Any installed lift's customer (and a resident, if the plan adds that access) has one EMERGENCY button, plus an emergency phone number shown on the Order View and in AMC.** The number is configured.
- Pressing it creates a canonical `ServiceCase` with priority `P0`, and an EMERGENCY_RESPONSE task for today's **on-call technician**. The Admin sets the on-call technician per day with a simple setting; if none is set, the task goes to the Admin.
- **Alerts:** in-app, to the Admin, the Owner and the technician, straight away. Use WhatsApp or SMS only if they already work.
- **Timing:** the task is due in 45 minutes, which is configurable ⚖ VERIFY the right target. An unacknowledged emergency shows at the top of Needs Attention in red.
- **Shown on screen:** "If someone is trapped and unwell, call 112 now." ⚖ VERIFY the wording.
- **Not in Phase 1:** no rescue guidance, no call bridging, no GPS dispatch.
- Reuse the UI parts of `EmergencyEscalationAlert.tsx`, but build a thin new flow (REUSE_MAP).

**D-29 Statutory licence before legal handover** ⚖ VERIFY the process with the lift inspector or a consultant.
- QC PASS creates a STATUTORY_LICENCE task (Admin, +30 days). It completes when the "lift license" compliance document (D-27) is DONE and a file is attached.
- **Handover completion needs the licence to be DONE.** The Admin can override with a reason, e.g. "technical handover accepted by customer; licence pending".
- If the Admin overrides, the order completes, **but the STATUTORY_LICENCE task stays open** and shows under Needs Attention → "Licence pending" until it is done.
- The software records this. It does not make the installation legal.

**D-30 Optional survey fee.**
- `SURVEY_FEE_INR` in config. The default is **0, which means off**.
- When it is above 0:
  - qualification creates a COLLECT_SURVEY_FEE task and a SURVEY_FEE payment record, both before the surveyor is assigned
  - the Admin can waive the fee, with a reason (audited)
  - when the order is booked, the fee is credited against the booking token, using the same milestone mechanics as D-14 ⚖ VERIFY the refund terms
- The Owner decides the amount in Step 01.

**D-31 Reuse first.**
- Every step checks `docs/mvp/REUSE_MAP.md` before creating files.
- Prefer ◆ canonical code, then ★ bridged screens (switch their reads), then thin new screens.
- Rewire ○ legacy screens only if they are small.
- Every new screen or service gets a one-line "why not reuse" in the PR.
