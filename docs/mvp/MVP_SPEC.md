# MVP SPEC: Refactor the existing ALL INDIA ELEVATORS V3 app into a simple, production-usable MVP

> **Status:** This is the source of truth for Phase 1. It is the Owner's master prompt, kept word-for-word.
> **How it is used:** The step prompts in the kit carry out §41 (Execution Method):
> - Phase A = Step 01
> - Phase B = Step 02
> - Phase C = Steps 03–11
> - Phases D and E = Step 12
> - Phase F = Step 13
>
> **Precedence:** Where `docs/mvp/DECISIONS.md` settles something this spec leaves open or ambiguous, DECISIONS.md wins.
> Where `docs/mvp/REPO_FACTS.md` disagrees with the actual code, the code wins. Record the difference in PROGRESS.md.

---

## 1. BUSINESS CONTEXT
- **Company:** ALL INDIA ELEVATORS COMPANY
- **Initial market:** Pune, Maharashtra
- **Business:** Sell, coordinate, install and maintain residential and commercial elevators through a network of customers, sales/riders, surveyors, technicians, QC, suppliers and Admin.
- **Long-term vision:** "The App Is the Manager." The current objective is NOT the full AI Manager.
- **Immediate objective:** Build the simplest reliable digital operating system that can manage the first 10–20 real elevator orders.

## 2. YOUR FIRST JOB — DO NOT CODE YET
**Step 1: Inspect the repository.** Understand:
- frontend, backend and database
- authentication and roles
- existing screens and workflows
- APIs and the database schema
- components and existing business logic
- existing integrations
- seed/demo data
- tests
- environment variables and deployment configuration

**Rules:**
- The actual codebase is the source of truth.
- Do NOT assume the technology stack.
- Do NOT replace the stack unless there is a compelling technical reason.
- Do NOT rewrite working code unnecessarily.

## 3. CREATE AN MVP AUDIT FIRST
Before changing any code, create `MVP_SIMPLIFICATION_AUDIT.md` with these sections:
- **A. KEEP:** features that remain.
- **B. SIMPLIFY:** features that exist but are unnecessarily complex.
- **C. DISABLE:** features not required for the MVP but maybe useful later.
- **D. DELETE:** only genuinely unnecessary or dead code.
- **E. BUILD:** small missing features the simplified MVP needs.
- **F. BROKEN:** existing features that are incomplete or unreliable.

For every feature, fill in: `Feature | Current State | MVP Decision | Reason | Risk`.

## 4. CRITICAL RULE
**DO NOT REBUILD WHAT ALREADY WORKS.**
- If an existing feature can be simplified rather than rewritten, simplify it.
- If an existing database model can support the MVP, reuse it.
- If an existing component can be reused, reuse it.
- If an existing workflow is 70% correct, modify the remaining 30%.
- Avoid architectural churn.

## 5. THE 80% SIMPLIFICATION RULE
Remove approximately 80% of the operational complexity, NOT 80% of the business value.
We want a **simple workflow, reliable tracking and a human Admin fallback**, rather than complex automation that is fragile.

## 6. MVP SUCCESS DEFINITION
The MVP must be able to take ONE real elevator customer from lead → survey → quote → booking → installation → QC → handover → AMC.
It should then be able to handle about 10–20 real lift orders without a complete rewrite.

## 7. SIMPLIFIED CORE WORKFLOW
Ten business stages:
`LEAD → QUALIFIED → SURVEY → QUOTE → BOOKED → SITE_READY → DELIVERY → INSTALLATION → QC_HANDOVER → AMC`

Do NOT create dozens of lifecycle states unless the existing system genuinely requires them.

## 8. UNIVERSAL ORDER VIEW
Every order has one simple canonical view. Example:
```
ORDER #AE-1024
Customer: ABC Builder            Site: Baner, Pune         Lift: G+7 Passenger Lift
CURRENT STAGE: INSTALLATION      PROGRESS: 65%
NEXT ACTION: Complete door installation
OWNER: Technician Rahul          DUE: 25 Sep, 5:00 PM
BLOCKER: None                    PAYMENT: ₹9,60,000 / ₹12,00,000
HEALTH: ON TRACK
```
This screen matters more than advanced AI.

## 9. ADMIN DASHBOARD
The Admin gets ONE primary dashboard, with three sections:
- **TODAY:** new leads, surveys, quotes, bookings, deliveries, installations, QC, payments, AMC.
- **NEEDS ATTENTION:** overdue, blocked, payment pending, customer waiting, technician waiting, supplier delay, QC failure.
- **PIPELINE:** Lead → Qualified → Survey → Quote → Booked → Site Ready → Delivery → Installation → QC → Handover → AMC.

The Admin can click any item and immediately see what happened, what needs to happen next, who owns it, and when it is due.

## 10. REMOVE THE NEED FOR A COMPLEX AI MANAGER
**Do NOT implement:**
- an autonomous AI manager
- predictive scheduling
- AI dispatch optimization
- machine-learning lead scoring
- AI negotiation
- an AI voice manager
- process mining
- automatic rule learning
- advanced CV verification
- an autonomous fraud engine
- advanced predictive escalation

**Implement SIMPLE RULE AUTOMATION instead:**

| IF | THEN create |
|---|---|
| Survey completed | Quote task |
| Quote accepted | Booking task |
| Booking confirmed | Site-readiness task |
| Site ready | Delivery task |
| Delivery completed | Installation task |
| Installation completed | QC task |
| QC passed | Handover task |
| Handover completed | AMC follow-up |

## 11. TASK MODEL
Reuse or simplify an existing Task model if there is one.

**Minimum fields:** `id, order_id, type, assigned_to, status, due_date, completed_at, notes, evidence`.

**Statuses:** `TODO, IN_PROGRESS, BLOCKED, COMPLETED, CANCELLED`.

Every active order must have a CURRENT TASK, an OWNER and a DUE DATE. This is the MVP version of the "One Owner / Next Action" rule.

## 12. BLOCKER SYSTEM
A technician, Admin or customer can raise a blocker with one of these reasons:
`CUSTOMER_NOT_READY, MATERIAL_MISSING, POWER_UNAVAILABLE, SITE_UNSAFE, WRONG_MEASUREMENT, PAYMENT_PENDING, SUPPLIER_DELAY, OTHER`

A blocker holds: reason, description, photo/evidence if applicable, created_at, owner, status.

Do NOT build a blocker engine with 30+ categories.

## 13. LEAD MODULE
**Fields:** `name, phone, location, source, site_type, floors, lift_requirement, construction_stage, notes, status, next_followup`

**Statuses:** `NEW, CONTACTED, QUALIFIED, SURVEY, QUOTE, WON, LOST`

No sophisticated AI lead scoring.

## 14. CUSTOMER MODULE
**The customer sees:** My Lift, Current Stage, Progress, Next Action, Promised Date, Payment Status, Documents, Support.

**The customer can:**
- approve a quote
- upload site photos
- confirm readiness
- make or record a payment
- view installation progress
- raise a blocker
- approve the handover
- view the AMC

Keep it simple.

## 15. SURVEY MODULE
**The surveyor receives:** Survey Assignment, Customer, Site, Date.

**Survey form:**
- Floors, Stops, Capacity
- Shaft Width, Shaft Depth, Pit, Headroom
- Power, Access, Site Readiness
- Remarks, Photos, Feasibility

**Result:** `FEASIBLE / REQUIRES_CORRECTION / NOT_FEASIBLE`.

No advanced computer vision and no specialized hardware. A phone camera and manual measurements are enough.

## 16. QUOTE MODULE
Use the existing pricing architecture if there is one.

**Price:** Base Lift + Installation + Freight + Other Charges + Tax = Selling Price.

**Track:** Estimated Cost, Selling Price, Estimated Gross Margin.

**Minimum Margin rule:** if the margin falls below the minimum, ADMIN APPROVAL IS REQUIRED.

No AI negotiation bot, no dynamic pricing engine and no complicated pricing optimizer.

## 17. PAYMENT MODULE
Do NOT build a sophisticated wallet. Track payment milestones:
- **Recommended milestones:** `BOOKING TOKEN, DELIVERY PAYMENT, FINAL HANDOVER PAYMENT`
- **Each payment holds:** amount, due_date, status, payment_method, reference, notes
- **Statuses:** `PENDING, PARTIAL, PAID, FAILED, REFUNDED`

If the app already has a stable payment integration, keep it. Do not replace a working payment system purely for architectural purity.

## 18. INSTALLATION MODULE
A simple checklist:
- [ ] Material received
- [ ] Site checked
- [ ] Rails installed
- [ ] Brackets installed
- [ ] Machine installed
- [ ] Controller installed
- [ ] Doors installed
- [ ] Wiring completed
- [ ] Safety components installed
- [ ] Testing completed
- [ ] Site cleaned

Each item allows: photo, note, completed_by, timestamp. No AI CV verification in the MVP.

## 19. QC MODULE
**QC screen shows:** Order, Installation checklist, Evidence, Test results, Remarks.

**Decision:** `PASS / REWORK / FAIL`. On REWORK, automatically create a REWORK TASK assigned to the technician.

QC stays human-controlled.

## 20. HANDOVER
**Capture:**
- final test
- customer confirmation
- required documents
- photos
- payment status
- signature/OTP, if already supported
- handover date

Then set ORDER = COMPLETED and automatically create an AMC FOLLOW-UP.

## 21. AMC
**Statuses:** `WARRANTY, AMC_DUE, AMC_OFFERED, AMC_ACTIVE, AMC_LOST`

**Track:** warranty expiry, AMC reminder date, last service, next service, complaint, AMC status.

No advanced AMC marketplace.

## 22. TECHNICIAN APP
The home screen is extremely simple. It lists **TODAY's** jobs, each showing site, job type, time and ₹. For example:
- Site A, Installation, 10:00 AM, ₹…
- Site B, QC/Rework, 3:00 PM, ₹…

**Task flow:** START → CHECK IN → DO WORK → UPLOAD EVIDENCE → COMPLETE.

**Buttons:** START, BLOCKED, COMPLETE.

No complex gamification and no leaderboards. No coins, unless they already exist and are trivial to maintain.

## 23. RIDER / SALES
**Screens:** New Lead, My Leads, Follow-ups, Won, Lost.

**New lead fields:** Customer, Phone, Location, Site Photo, Floors, Lift Requirement, Construction Stage, Notes, Consent.

Keep it fast.

## 24. SUPPLIER
No full supplier marketplace. The Admin manages supplier information.

**Minimum:** Supplier, PO, Expected Delivery, Material Status, Delay, Contact.

If a supplier portal already exists and works, simplify it rather than deleting it.

## 25. NOTIFICATIONS
Keep notifications simple. Implement these:
- task assigned
- task due
- task overdue
- survey scheduled
- quote ready
- payment due
- installation scheduled
- QC required
- handover ready
- AMC reminder

Use the existing notification infrastructure where possible. No AI voice calls and no complex notification orchestration.

## 26. ROLES
Keep the existing role architecture if possible. Required roles:
`ADMIN, OWNER, SALES/RIDER, SURVEYOR, TECHNICIAN, QC, CUSTOMER, SUPPLIER`

Do not create other roles unless genuinely needed.

## 27. OWNER VIEW
No operational control center. Show only:
- Revenue
- Orders
- Pipeline
- Outstanding Payments
- Estimated Margin
- Active Installations
- Completed Lifts
- AMC

## 28. REPORTING
- **Sales:** leads, qualified, quotes, orders, conversion.
- **Operations:** active orders, overdue tasks, blocked tasks, installation duration.
- **Money:** booked value, collected, outstanding, estimated margin.
- **Quality:** QC pass, rework, complaints.

No advanced analytics platform.

## 29. MOBILE-FIRST
Must work well on mobile, prioritising technician, rider, surveyor and customer. The Admin can use a desktop or tablet.

No separate native apps unless they already exist. A responsive web app is enough.

## 30. LANGUAGES
English, then Marathi, then Hindi. Use a simple translation structure that can be expanded later, and keep any multilingual support that already exists.

## 31. SECURITY
Minimum:
- authentication and authorization
- role checks
- a secure API
- input validation
- an audit log for important actions
- secure access to files and evidence
- backups
- environment secrets

Do not build security infrastructure beyond what the MVP needs.

## 32. ⚖ COMPLIANCE
Mark every legal or regulatory assumption **⚖ VERIFY**. Do not pretend the software itself solves regulatory compliance.

Keep configurable fields or workflows to record these documents and statuses:
- lift license
- statutory inspection
- contractor responsibility
- insurance
- GST
- TDS
- customer agreement
- partner agreement

## 33. WHAT MUST NOT BE BUILT NOW
❌ AI Manager ❌ AI negotiation ❌ AI voice calling ❌ predictive scheduling ❌ machine-learning dispatch ❌ CV verification ❌ IoT containers ❌ smart locks ❌ advanced fraud engine ❌ complex gamification ❌ city franchise system ❌ multi-city tenancy complexity ❌ advanced NBFC integration ❌ process mining ❌ event-sourcing overhaul ❌ microservices rewrite ❌ complex workflow engine ❌ 80+ domain events ❌ 40+ exception types ❌ 30+ fraud workflows

These belong on the future roadmap.

## 34. PRESERVE FUTURE EXTENSIBILITY
Use clean, separate concepts so automation can be added later:
`Order, Task, Evidence, Payment, Partner, Installation, QC, AMC`

Do NOT build the future system prematurely.

## 35. CODE QUALITY RULES
**Before changing code:**
1. Read the existing architecture.
2. Identify reusable components.
3. Identify duplicate code.
4. Identify dead code.
5. Identify broken flows.
6. Identify database dependencies.
7. Identify integration dependencies.

Then make the smallest safe change.

**Never:**
- rewrite unnecessarily
- add unnecessary dependencies or libraries
- ship fake or mock functionality in production
- leave TODOs where core MVP functionality is required
- break existing flows
- run silent database migrations
- make destructive data changes without an explicit reason

## 36. DATA MIGRATION
Do NOT destroy existing production-like data. The order is: migration → backward compatibility → clean up later. Mark V3 fields that are no longer needed as deprecated rather than deleting them immediately.

## 37. TESTING
Test the complete happy path: Lead → Qualification → Survey → Quote → Booking → Site Ready → Delivery → Installation → QC → Handover → AMC.

Also test these scenarios:

| Scenario | What it covers |
|---|---|
| Happy path | One complete successful order |
| Customer delay | The customer does not make the site ready |
| Technician blocker | The technician reports missing material |
| QC failure | QC sends the installation back for rework |
| Payment pending | A payment stays unpaid |
| Cancelled order | The order is cancelled |
| Admin intervention | The Admin manually changes a task |

## 38. ACCEPTANCE TEST
The MVP passes when this sequence works:

| # | Actor | Action |
|---|---|---|
| 1 | Customer | Creates or receives a lead |
| 2 | Sales | Qualifies the customer |
| 3 | Surveyor | Completes the survey with photos |
| 4 | Admin | Creates and approves the quote |
| 5 | Customer | Accepts the quote / booking |
| 6 | Admin | Confirms site readiness |
| 7 | Supplier / Admin | Tracks delivery |
| 8 | Technician | Completes the installation checklist |
| 9 | QC | Passes, or sends for rework |
| 10 | Customer | Completes the handover |
| 11 | System | Creates the AMC follow-up |

At every step, these must be visible: current status, owner, next action, due date and evidence.

## 39. BEFORE YOU FINISH
Create `MVP_IMPLEMENTATION_REPORT.md` covering:
1. What existed
2. What was kept
3. What was simplified
4. What was disabled
5. What was built
6. What remains manual
7. What remains for V4
8. Database changes
9. API changes
10. Tests performed
11. Known issues
12. The recommended next 10 features

## 40. FUTURE ROADMAP
| Phase | Scope | Scale |
|---|---|---|
| **PHASE 1 (CURRENT MVP)** | Simple digital operations | 10–20 lifts |
| PHASE 2 | More automation | 50+ lifts |
| PHASE 3 | AI-assisted Manager | 100+ lifts |
| PHASE 4 | Exception-only management | 500+ lifts |
| PHASE 5 | Multi-city / marketplace | — |

The current task is ONLY Phase 1.

## 41. EXECUTION METHOD
| Phase | What happens | Output |
|---|---|---|
| A — AUDIT | Inspect the repo, then summarize findings | `MVP_SIMPLIFICATION_AUDIT.md` |
| B — PLAN | List the exact files and modules that will change | `MVP_REFACTOR_PLAN.md` |
| C — IMPLEMENT | Make the smallest set of changes required | Code changes |
| D — TEST | Run type checking, lint, unit tests, integration tests, the build and relevant E2E tests; fix errors | Passing checks |
| E — VERIFY | Manually verify the complete elevator workflow | Verified flow |
| F — DOCUMENT | Write up the result | `MVP_IMPLEMENTATION_REPORT.md` |

## 42. CLAUDE CODE BEHAVIOUR
Act as a senior software architect, product engineer, QA engineer and business workflow analyst. Do not blindly generate code.
- Reuse what already works.
- Remove or disable anything unnecessary.
- Preserve anything that is dangerous to remove, and explain why.
- When a simplification conflicts with an existing dependency, find the smallest safe solution.

## 43. PRIORITY HIERARCHY
1. Existing working code
2. Real elevator business workflow
3. Reliability
4. Simplicity
5. Data integrity
6. Safety
7. Usability
8. Maintainability
9. Automation
10. Future scalability

Do NOT sacrifice a working MVP for theoretical architecture.

## 44. FINAL PRODUCT PHILOSOPHY
The goal is not "the world's most advanced elevator AI platform". It is a simple application that lets ALL INDIA ELEVATORS COMPANY sell and deliver its first real elevators with much less manual coordination.

**ONE LIFT THROUGH THE SYSTEM. Then 10 lifts. Then 20 lifts.** Add advanced automation only after real operational data exists.

**WAIT FOR APPROVAL BEFORE MAKING LARGE DESTRUCTIVE CHANGES.** Small, safe changes are allowed only when clearly necessary for the audit or inspection.
