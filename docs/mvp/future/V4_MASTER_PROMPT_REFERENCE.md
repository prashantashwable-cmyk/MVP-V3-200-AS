> **REFERENCE ONLY. DO NOT BUILD FROM THIS FILE IN PHASE 1.**
> This is the long-term V4 vision ("The App Is the Manager"). Phase 1 builds only what `docs/mvp/DECISIONS.md` says.
> Use this file when planning Phase 2+ (see `FUTURE_V4_ROADMAP.md`), and only when the real-data triggers are met.

---

# MASTER PROMPT — ALL INDIA ELEVATORS COMPANY
## Self-Managing Elevator Business Platform · Version 4 — "The App Is the Manager"

> **Paste this entire file into the AI.** It answers in passes (Section 16). After each pass, reply **CONTINUE**.
> Before you paste it, check the defaults in **Section 17 (Owner Decisions)** and change any you disagree with.

---

## 0. HOW YOU MUST WORK (read this first)

You are not writing a brochure. You are designing the operating system for a company that has almost no employees. **Anything you leave vague becomes some person's job, and every person's job counts against the 95% automation target. So vagueness is failure.**

1. **Work in passes** (Section 16). Give one pass per reply. End each pass with `✅ PASS n COMPLETE — reply CONTINUE for PASS n+1`. Never shorten a later pass to make it fit.
2. **Four-layer rule.** Apply it to every requirement:
   - **L1 Feature:** what the requirement says.
   - **L2 Process:** actors, trigger, steps, data, timer, evidence, failure path.
   - **L3 Outcome:** the ₹, safety, liability, or time it protects.
   - **L4 Automation:** what the system does once mature, what stays human, and why.
3. **Go beyond my words.** For every section, cover what I said, what I meant, what I need, and what I did not know to ask. Where my instructions conflict with money safety, human safety, the law, or automation, say so, propose the fix, and continue using the Section 17 default.
4. **Tag everything.** Use `REQ-<AREA>-<nnn>`, a priority of `[MVP]`, `[P2]` or `[P3]`, an automation level from `A0` to `A4` (Section 4.3), and the accountable role.
5. **Record assumptions** in an **Assumption Register** with these columns: ID, assumption, impact if wrong, how to validate. Then keep going. Never stall.
6. **Tag every legal or regulatory point `⚖ VERIFY`.** Say what you believe, what the risk is, and which design stays safe either way. Never present a legal claim as certain.
7. **Format.** Use tables, state-machine tables, JSON schemas, ASCII flows and pseudo-code. Do not write generic filler such as "leverage AI" or "seamless experience". Every sentence must be something a developer can implement or something the business can measure.
8. **Run the Quality Gate** (Section 15) on your own output at the end of every pass, and show the checklist.

---

## 1. YOUR ROLE & MISSION

Act as a combined expert team:
- enterprise product architect
- Indian elevator-industry operations expert
- operations-research and workflow engineer
- two-sided-marketplace designer
- UX designer for low-literacy field users
- automation and AI engineer
- fintech and payments architect
- fraud and security specialist
- Indian regulatory-compliance advisor
- construction safety engineer

**Mission:** design a mobile-first, multi-user, multi-city platform in which **the software itself is the operations manager** of ALL INDIA ELEVATORS COMPANY. The software must:
- plan, staff, assign, brief, and get commitment
- follow up, unblock, verify, and pay
- correct, develop people, report, and improve the process

For every unit of work, it does all of this so that:
- **at least 95% of all work completes with zero touches from a human manager**
- **one Admin handles only the exceptions**
- **the Owner does only business development**

Ask this of every screen, state and rule:
> *"If no human manager ever looks at this, how does the work still get done correctly, safely, on time, and paid for?"*

---

## 2. BUSINESS IDENTITY

| Item | Value |
|---|---|
| Brand | **ALL INDIA ELEVATORS COMPANY** |
| Owner | **Mr. Prashant Vasant Wable** |
| Home region | Pune, Maharashtra, India |
| Compliance base | Lift law, rules and standards applicable in Pune and Maharashtra (Section 11) |
| Expansion structure | Company HQ → Region (State) → City → City Partner (franchise, optional) → Zone (a cluster of about 3–5 km) → Site → Lift |

---

## 3. NON-NEGOTIABLE PRINCIPLES (V4, corrected)

1. **Enterprise-grade and production-ready.** Not a demo.
2. **Scalable from Pune to Maharashtra to all of India.** Multi-tenant from day 1, operating in one city first.
3. **Asset-light.** The company owns no inventory, vehicles or workforce. Smart containers are an asset, which contradicts this, so see D4.
4. **Aggregator marketplace.** The partners are riders, surveyors, technicians, QC inspectors, suppliers, logistics and container operators, NBFCs, statutory liaison consultants and city partners.
5. **Liability-minimized, not "zero-liability".** Indian consumer law holds the brand that sells the service accountable ⚖, so liability cannot be fully signed away. Minimize it with:
   - a licensed contractor of record
   - back-to-back partner contracts
   - an insurance stack
   - immutable evidence logs
   - geo-verified handovers
6. **Zero risk on money.** Use escrow, milestone payments and evidence-gated payouts. **No money ever sits without a timer.**
7. **The app is the manager.** Every unit of work is a Task with:
   - one owner
   - one due time
   - one definition of done
   - one evidence specification
   - one reward
   - one escalation path
8. **One-person monitoring by exception.** The Admin's time is a budgeted and measured resource (Section 4.4).
9. **Automation is earned, not declared.** Every step starts supervised. It becomes autonomous only after data proves it is accurate (Section 4.3).
10. **Every human decision becomes a rule.** Each Admin decision is logged with a reason code. Patterns that repeat become auto-rules.
11. **Control outcomes, not hours.** Enforce SOPs, evidence and commitments. Do not command independent partners' time ⚖, because that risks them being reclassified as employees.
12. **Safety beats speed, always.** No incentive may reward speed on a safety-critical step. Anyone can stop work, and doing so is never penalized.

---

## 4. THE 95% TARGET — DEFINED, MEASURED, EARNED

### 4.1 Definitions
| Term | Definition | Target at maturity |
|---|---|---|
| Work action | An action by the role that performs the work, e.g. a rider captures a lead, a technician installs, a customer pays. This is **not** a manager touch. | — |
| Manager touch | Any action by the Admin, the Owner or internal staff that work needs in order to proceed: approving, deciding, calling, correcting data, reassigning manually, chasing. | — |
| **Touchless Rate (TR)** | Tasks closed with 0 manager touches ÷ all tasks closed | **≥ 95%** |
| **Touches per Lift (TPL)** | Manager touches from lead to handover for one lift | **≤ 5** |
| **Admin Minutes per Lift (AML)** | Admin minutes spent on one lift over its whole lifecycle | **≤ 30** |
| Orphan count | Open jobs with no next task, owner or due time | **Always 0** |
| Idle money | ₹ held in any state without a running timer | **Always ₹0** |
| Time-to-Unblock | Median time from a blocker being raised to it being resolved | Set by the AI |

### 4.2 The Human Reserve — the 5% that stays human *by design*
Confirm and extend this list, and give a reason for each item:
- safety incidents and stop-work resolutions
- disputes and refunds above a ₹ threshold
- statutory interactions that need a person present
- flagged evidence on safety-critical steps that falls below the confidence threshold
- fraud holds and suspensions (the system applies the hold automatically, then a human reviews it)
- new rules and price-list changes
- money movements above a ₹ threshold (maker-checker)
- final approval to onboard L3+ technicians, suppliers and city partners

### 4.3 Automation Maturity Ladder (set per workflow step)
| Level | Name | Behaviour |
|---|---|---|
| A0 | Manual | A human does the step; the app records it |
| A1 | Assisted | The app prepares and recommends; a human decides every case |
| A2 | Supervised | The app decides; a human confirms each case with one tap |
| A3 | Exception-only | The app decides. A human sees only flagged cases (low confidence, high value or anomaly) plus a random 5% audit sample. |
| A4 | Autonomous | The app decides; 1% is audited; a human is involved only on dispute |

- **Promotion rule:** a step moves up one level when, over its last 200 decisions, the app and the human agree at least 98% of the time (at least 99.5% for money or safety steps) with zero critical misses.
- **Demotion rule:** a step drops a level automatically when its audit error rate breaches the threshold.
- **Cap:** safety-critical steps are never set above A3.
- **Deliverable:** a matrix of every step showing its Day-1 level, its target level, its promotion criteria and the month it is expected to be promoted.

### 4.4 Admin Capacity Equation
```
Max lifts per month per Admin = Admin productive minutes per month ÷ AML
Example: 6 h × 25 days = 9,000 min
         at AML 90 (early days)  → 100 lifts/month
         at AML 30 (maturity)    → 300 lifts/month
```
Every evening the system forecasts tomorrow's Admin load as the sum of open exceptions × the standard minutes for each exception type. If the forecast exceeds 80% of capacity, the system:
1. batches low-risk items
2. switches from 100% review to sampled audits where the automation level allows it
3. activates the Backup Admin
4. tells the Owner that Admin capacity is now the business's constraint, and that the fix is to hire or add a city partner

---

## 5. THE MANAGER ENGINE (the core of V4 — design every part)

### 5.1 Manager Function Map
| # | What a good human manager does | App mechanism to design | Output / metric |
|---|---|---|---|
| 1 | Plans the work | **Job Planner.** Builds a critical-path master schedule for each lift from the order date, supplier lead time, site readiness and crew availability. | Baseline plan and promised dates |
| 2 | Staffs the team | **Capacity Planner + Recruitment Trigger.** Forecasts the technician-days needed 60–90 days ahead from the pipeline, then launches onboarding campaigns by zone and level. | Hiring pipeline, capacity-gap days |
| 3 | Assigns work | **Dispatcher.** Scoring-based matching, an offer cascade, atomic acceptance and crew templates. | Time-to-assign |
| 4 | Briefs people | **Morning Brief.** A voice message plus a card in the partner's own language: today's tasks, route, materials, SOP steps, earnings target and one safety tip. | Brief-open rate |
| 5 | Gets commitment | **Commitment Protocol.** Each evening the partner confirms tomorrow's tasks; that confirmation is the commitment. No-shows are measured against commitments. | Commitment-kept % |
| 6 | Follows up | **Watchdog timers + Escalation Ladder E0–E6** | On-time % |
| 7 | Removes blockers | **Blocker Engine.** One tap on "I'm blocked" → pick a reason → attach evidence → the blocker is routed automatically to a resolver, who has their own SLA. | Time-to-unblock |
| 8 | Checks quality | Evidence gate, CV verification, random audits and surprise QC | First-time-right % |
| 9 | Decides fairly who is at fault | **Delay & Defect Attribution Engine** | Correct owner of each cost or penalty |
| 10 | Rewards | Earnings ledger, coins, rank and priority access to jobs | Earnings per verified hour |
| 11 | Corrects | Progressive performance management with appeals | Reliability score trend |
| 12 | Develops people | Micro-lessons triggered by specific failures, plus the promotion ladder | Rework trend, promotions |
| 13 | Reports up | Automatic daily Admin digest and weekly Owner memo | Decisions made |
| 14 | Improves the process | Process mining plus a rule-learning loop | Exceptions per lift trend |
| 15 | Keeps promises to customers | **Promise Engine.** Customer dates are computed from real capacity. Delays are communicated proactively, with the new date and the reason. | Promise-kept % |
| 16 | Watches itself | **Zero-Orphan Reconciliation** (Section 5.14) | Orphans = 0 |

### 5.2 The Universal Task Object
Every unit of work is a Task. That includes a rider visit, a survey, an SOP step, a payment follow-up, a QC visit, an AMC visit, a supplier dispatch and an Admin exception. Produce the full JSON Schema. The minimum shape is:
```json
{
  "task_id": "ULID", "display_code": "MH-PUN-KOT-L-7Q4K-T012",
  "parent": {"order_id": "", "site_id": "", "lift_id": "", "stage": "S12"},
  "task_type": "SOP_STEP", "sop_ref": "SOP-INST-04.2",
  "required": {"role": "TECHNICIAN", "min_level": 3, "certifications": ["ELECTRICAL"], "crew_template": "C-INST-3"},
  "location": {"lat": 0, "lng": 0, "geofence_m": 50},
  "window": {"earliest_start": "", "due": "", "sla_class": "S1"},
  "depends_on": ["task_id"], "blocks": ["task_id"],
  "assignee": "partner_id", "standby": "partner_id",
  "state": "READY", "state_entered_at": "", "max_dwell_min": 0,
  "evidence_spec": [{"type": "PHOTO|VIDEO|SCAN|OTP|SIGNATURE", "angle": "", "count": 0, "cv_model": "", "min_confidence": 0.0}],
  "definition_of_done": ["evidence verified", "ledger posted", "next task spawned"],
  "reward": {"base_inr": 0, "coins": 0, "bonus_rules": []}, "penalty_rules": [],
  "escalation_ladder": "ESC-S1-FIELD", "blocker": null, "delay_attribution": null,
  "automation_level": "A2", "audit_sample": false,
  "created_by": "RULE|USER", "history": ["append-only events"]
}
```
**Iron rules. Violating any of them makes the design fail:**
- **One-Owner Rule.** At every moment, every open task has exactly one accountable owner, which is either a person or a system service.
- **Next-Action Rule.** Every open job has at least one open task with a due time. A job with no next task is an *orphan* and raises a P1 alert.
- **Timer Rule.** Every state has a maximum dwell time. There are no exceptions: this includes states owned by customers, suppliers, NBFCs, government bodies and the Admin.
- **Done Rule.** A task is done only when its evidence is verified, its ledger entry is posted and its next task has been spawned.

### 5.3 Universal Task Lifecycle (produce it as a full state table with triggers, guards, timers and actions)
```
DRAFT → READY (dependencies met) → OFFERED → ACCEPTED → SCHEDULED → EN_ROUTE
      → CHECKED_IN (geo + liveness selfie + PPE check) → IN_PROGRESS
      → EVIDENCE_SUBMITTED → AUTO_VERIFIED ─────────────┐
                           → FLAGGED → HUMAN_REVIEW → APPROVED | REWORK
      → APPROVED → SETTLED (ledger posted) → CLOSED (next task spawned)

Side states: BLOCKED(reason, resolver) · PAUSED_CUSTOMER · ESCALATED · REASSIGNED
             · CANCELLED · DISPUTED · SAFETY_HOLD · FRAUD_HOLD
```

### 5.4 Watchdog, Absence-of-Event Detection & Predictive Escalation
- **The most dangerous failures are things that do not happen:** a technician doesn't arrive, a customer doesn't pay, a supplier doesn't dispatch, an NBFC doesn't disburse, the Admin doesn't decide. Give every expected event a deadline and a detector.
- **Predictive triggers.** Act before the due time, not after it. For example:
  - The technician is still 18 km away 20 minutes before check-in → alert the standby now.
  - The customer has not uploaded readiness photos 5 days before the dispatch slot → start the customer ladder.
  - The factory milestone photos are overdue → check the supplier's risk.
- **Job Health Score (0–100)** for each lift. Compute it from schedule variance, open blockers, payment status, evidence quality and customer sentiment. It sets the colour of the lift's map node. **The Admin sees only amber and red jobs.**

### 5.5 Standard Escalation Ladder (refine it for each SLA class and each party)
| Level | When | Action |
|---|---|---|
| E0 | Before the due time (lead time depends on the SLA class) | Reminder push in the person's language |
| E1 | At the due time | Push + WhatsApp + in-app banner |
| E2 | Due time + grace (e.g. 15 min for field work, 4 h for office work) | AI voice call: "Are you on it? Press 1 for yes, 2 if you are blocked, 3 if you can't do it" |
| E3 | No response, or "can't do it" | Offer the task to the standby. Notify the original assignee. Apply the reliability-score impact. |
| E4 | The standby also fails | Auto-reassign the task and broadcast it with a surge bonus over a widening radius (5 → 10 → 20 km) |
| E5 | Still unresolved, or money or safety is involved | Admin exception card with a recommended action and one-tap options |
| E6 | A safety incident, a legal issue, ₹ above the threshold, or the Admin missed their own SLA | Owner alert |

- **SLA classes:**
  - **S0** Safety and emergency: minutes
  - **S1** Customer-facing field work: hours
  - **S2** Commercial: 1 business day
  - **S3** Back office: 2–3 days
- **Non-worker parties get their own ladders too.** For example, the customer ladder is: reminder → call → site hold → storage fee → cancellation as per the contract. Supplier, NBFC, government-liaison and Admin ladders are also required.

### 5.6 Blocker Engine & Delay Attribution
- **Blocker catalog.** Design at least 30 entries. Each entry needs a reason code, the evidence required, the resolver, the resolver's SLA and who pays. Examples:

| Blocker | Resolver | Cost owner |
|---|---|---|
| No power at site | Customer | Customer |
| Shaft dimension mismatch | Re-survey, then customer civil work | Surveyor or customer, per attribution |
| Material missing or damaged | Supplier or logistics | Supplier or logistics |
| Container won't unlock | IoT ops | Platform or vendor |
| Unsafe condition | Safety workflow (stop-work) | Per attribution |
| Rain or flooding | — | External (pause the timers) |
| Evidence upload failing | Platform | Platform |
| Customer absent for signature | Customer | Customer |

- **Attribution decides three things:** whose SLA clock pauses, who bears the cost (revisit fee, penalty, surge cost) and whose score changes.
- **Technicians are never penalized for delays caused by the customer, supplier or platform** when they logged the blocker with evidence. A blocker claimed without evidence does not pause the clock.
- **Chronic blockers drive process fixes.** For example, if 30% of sites report "no power", add a power check to the site-readiness gate.

### 5.7 Dispatcher (Matching & Allocation)
- **Score** = f(travel time, level and certification fit, reliability, first-time-right rate, current load, customer rating, fairness (recent share of jobs), language match, safety record). Propose the weights, the pseudo-code and a method for tuning them.
- **Offer cascade:**
  1. an exclusive offer to the #1 candidate for N minutes
  2. then a parallel offer to the top 3
  3. then a broadcast with surge steps

  An atomic lock means the first valid accept wins, and the others are told "taken" instantly. Every step is idempotent.
- **Crews, not individuals.** Each installation stage has a crew template, e.g. 1 × L3 lead + 1 × L2 + 1 × L1.
- **Standby.** Every critical scheduled task has a pre-notified standby, who receives a small standby retainer.
- **WIP limits** per partner (concurrent sites by level) and per zone per stage.

### 5.8 Production-Line Flow Control (Theory of Constraints)
Model the business as a chain of queues:
```
Leads → Qualified → Surveyed → Quoted → Booked → Permitted → Manufactured → Site-ready
 → Delivered → Installing → Tested → QC/Statutory → Handed-over → Settled → AMC
```
Every day, compute each stage's queue, throughput and cycle time, find the **bottleneck**, and act on it automatically:
- **Installation bottleneck:**
  - cut rider incentives in saturated zones
  - lengthen the promised dates in new quotes
  - launch technician recruitment
  - raise surge pay
- **Sales bottleneck:** throttle lead capture and add bot capacity.
- **Supplier bottleneck:** move POs to the second supplier.
- **Admin bottleneck:** apply Section 4.4.

Also:
- **Little's Law sizing.** Containers needed = deliveries per day × (average days on site + return days). Size crews the same way.
- **Seasonality calendar.** Account for monsoon (roughly June–September, which slows Pune construction) and festival labour dips (Ganeshotsav, Diwali, Holi migration). Pre-build capacity and adjust promised dates before these periods arrive.

### 5.9 Exception Inbox (the only screen the Admin really needs)
- **Each exception card shows:**
  - what happened, with its evidence
  - the impact in ₹, safety and days
  - a recommended action with a confidence score
  - one-tap options: Approve, Alternate, Escalate
  - the decision deadline
- **Sort order:** risk × value × time-to-breach. Similar low-risk items can be handled in one batch.
- **Every decision needs a reason code.** This feeds the **Rule-Learning Loop**: *"You approved this pattern 20 times out of 20. Convert it to an auto-rule?"* Money rules also need Owner approval.
- **Deliverable:** an **exception catalog** of at least 40 types, each with its trigger, the default recommended action and the standard Admin minutes it takes.

### 5.10 Manager Rituals (automated)
| Time | Ritual | Who | Output |
|---|---|---|---|
| 07:00 | Morning Brief (voice + card) | Every active partner | Plan viewed |
| Shift start | Check-in: geo + liveness selfie + PPE check by CV + fitness declaration | Field partners | Permission to start |
| 13:00 | Midday pulse: plan vs actual; automatic re-plan | System | Updated plan |
| 18:30 | End-of-day close: evidence completeness, material and scrap reconciliation, open blockers | Field partners | Day closed |
| 20:00 | Tomorrow's plan is offered and committed | Field partners | Commitments |
| Monday | Weekly scorecard, payout, coaching focus; the Admin reviews rule proposals | All + Admin | Payout + rule changes |
| Month start | Owner business-review memo (auto-generated) | Owner | Decisions |

Quiet hours run from 21:00 to 07:00 for everything except S0.

### 5.11 Performance Management (fair, explainable, appealable)
- **Reliability Score components:**
  - commitments kept
  - on-time check-in
  - first-time-right evidence
  - rework rate
  - customer rating
  - safety compliance
  - blocker honesty (the share of claimed blockers that were verified)
- **The score mainly drives access,** not money: priority for nearby and high-value jobs, and promotion eligibility.
- **Progressive steps:** nudge → targeted micro-lesson → probation (restricted job types) → suspension (reviewed by a human) → offboarding.
- **Immediate automatic holds only for safety or fraud,** and a human must review the hold within 24 hours.
- **Every negative action shows its evidence and comes with an in-app appeal** that has its own SLA.

### 5.12 Communication Policy
- **Channel ladder:** in-app → push → WhatsApp (approved templates, opted-in users only) → SMS (DLT-registered) → AI voice call → human call.
- **Notification budget:** a maximum of N non-critical messages per person per day. Bundle messages, use the person's language, and use voice-first for low-literacy users.
- **Number masking** on every customer ↔ partner call. This protects privacy and prevents deals moving off the platform.

### 5.13 Policy-as-Configuration
- **Every threshold lives in a versioned rules console:** SLA timers, radii, surge %, coin values, margin floors, audit rates and penalties. The Owner or Admin can change them without a developer.
- **Every change is logged.**
- **A what-if simulator** replays the last 30 days under the new rule before the rule is activated.

### 5.14 Zero-Orphan Reconciliation (automated, daily at 23:00)
It checks that:
- every open job has a next task, an owner and a due time
- every ₹ received is allocated to an order milestone
- every payout has verified evidence
- every container is assigned, returning, or idle at the depot
- every lead has had a status change within X days
- every timer that should have fired did fire
- every dispute has an owner

It fixes what it can automatically and lists the rest for the Admin. **Target: 0 orphans.**

---

## 6. MULTI-USER, MULTI-PARTY, MULTI-TENANT DESIGN

### 6.1 The "customer" is several people — design a stakeholder model
| Stakeholder | Example | Typical rights |
|---|---|---|
| Decision-maker | Builder, bungalow owner, society chairman | Approves the quote and signs the agreement |
| Payer | Builder's accounts team, an individual, or an NBFC | Payments |
| Site contact | Site supervisor or engineer | Readiness checks, site access, being present at handover |
| Technical consultant | Architect or structural engineer | Approves drawings |
| Future owner | Housing society after possession | AMC, complaints, license renewals |
| End users | Residents | Emergency button, complaints |

Design:
- an **authority matrix** that says which stakeholder may do what, and whether that needs an OTP or an eSign
- how authority is **delegated**
- the **ownership-transfer workflow** when the builder hands over to the society (AMC novation, change of license holder ⚖)

### 6.2 Cardinality
- A customer has 1–N sites, and a site has 1–N lifts.
- A job is the installation of one lift.
- A partner has 1–N concurrent tasks, within the WIP limits.
- A crew has N partners for each stage.
- A supplier has 1–N orders.
- A container has one active job at a time.

### 6.3 Concurrency & integrity
- **Duplicate leads.** Detect them by geo-radius (e.g. 50 m), perceptual photo hash and phone number. The first *verified* lead wins. A later rider who adds new information earns a small "confirmation" coin.
- **Races.** Use atomic locks on accepts. Put idempotency keys on every payment, payout and state change.
- **Offline edits.** Sync with event sourcing, using these conflict rules:
  - the server's time is authoritative for money states
  - field data is merged
  - evidence is never overwritten
- **Devices.** Handle one user on two devices, and shared devices at a site (each person logs in with biometrics).

### 6.4 Multi-tenancy, delegation & controls on the Admin
- **Tenant structure:** HQ → City Partner (franchise) → Zone.
  - Data is isolated at row level.
  - Each City Partner Admin gets the same Exception Inbox, scoped to their tenant.
  - HQ sees everything.
  - Royalty is settled automatically on each transaction.
- **Backup Admin.** Has delegated authority and is activated automatically when the primary Admin misses an S1 SLA or is marked off duty.
- **Maker-checker** is required for:
  - payouts and refunds above ₹X
  - manual margin overrides
  - rule changes
  - reinstating a partner
  - overriding a container lock
- **Watching the watcher.**
  - The Admin can never approve their own high-value exceptions.
  - The Owner receives a weekly "Admin actions audit".
  - Logs are append-only.

### 6.5 Platform leakage (disintermediation), the hidden killer of marketplaces
**The risk:** technicians and customers deal directly for AMC, repairs and the builder's next project, or a supplier sells straight to the customer.

**Countermeasures to design:**
- number masking and in-app-only chat
- warranty and statutory documents that stay valid only through platform service
- AMC priced to win, with the technician's share higher when the work stays on the platform
- customer loyalty benefits
- non-circumvention clauses in contracts
- suppliers see the customer's identity only at dispatch
- leakage detection, e.g. a technician's GPS repeatedly at a site where they have no task

---

## 7. END-TO-END LIFECYCLE V4 (re-sequenced production line)

**Why the sequence changed.** V3:
- locked the price before the shaft was measured
- dispatched material before the site was ready
- checked EMI only after delivery
- skipped statutory permission, supplier manufacturing, container return and emergency response

Each of these creates stuck work that needs a human. V4 fixes them:

| # | Stage | Entry gate | Automated manager actions | Done when | ₹ event |
|---|---|---|---|---|---|
| S0 | Zone planning | — | AI heatmap of construction activity. **Seed a lead universe from public registries (e.g. MahaRERA project list, municipal building permissions ⚖ check the terms of use)** so riders *verify* sites instead of *searching* for them. Rider zones and routes. | Riders have zones and routes | — |
| S1 | Lead capture (Rider) | Rider checked in | One-tap photo + GPS + automatic address. **Consent capture**: the site contact scans the rider's QR code or WhatsApp opt-in, or confirms an OTP. Dedupe. AI checks (shaft visible? real site? unique?). Construction-stage tag. | Verified lead with consent | Rider micro-coin |
| S2 | Qualification (bot) | Consent present | WhatsApp message with the site's own photo (approved template). Chat and voice bot collects: decision-maker, floors and stops, capacity, shaft status and expected ready date, budget, timeline. B2C or B2B routing. Lead score. | Qualified, or in nurture with a follow-up date, or lost with a reason | — |
| S3 | Indicative quote & booking | Qualified | Automatic indicative price range. Negotiation bot inside the margin guard. **Refundable booking token of ₹10,000** (refunded if the survey finds installation infeasible). | Token paid | Token to escrow; rider tranche 2 |
| S4 | Site survey & technical clearance | Token received | Nearest L3+ surveyor is dispatched. They measure shaft width, depth, pit, headroom, plumbness and openings, and check power, access and storage space. Laser and photo evidence. Feasibility and readiness date. Drawings shown in the customer app. | Survey approved | Surveyor payout |
| S5 | Final quote, negotiation & agreement | Survey approved | Final price from the measured spec. Bot → manual negotiator → hard floor. Price valid 15 days, with an escalation clause. eSign by the stakeholders required by the authority matrix. Payment plan chosen. **NBFC application and pre-approval happen here.** | Agreement signed | — |
| S6 | Drawings & permissions | Agreement | GA drawings and specs generated automatically. Customer or architect approves them. **Statutory permission-to-erect pack prepared ⚖.** Liaison task created. | Drawings approved; permission applied for or granted | Liaison fee |
| S7 | Supplier PO & manufacturing | Drawings approved | Supplier chosen automatically (rating, price, capacity, lead time). PO issued. Manufacturing milestone evidence: factory photos, QC certificate, video of kit packing against the BOM. Supplier ETA feeds the Promise Engine. | Material ready and kitted | Supplier payment per terms |
| S8 | **Site-readiness gate** | Manufacturing ≥ X% | Customer checklist with photos: shaft finished, pit dry, 3-phase power (or temporary supply), hoisting hook or beam, scaffolding plan, truck access, container space. AI verifies; a technician confirms. **The V3 "2-week rule" applies here:** the site must be ready within 14 days of "material ready", otherwise the order goes to Customer Hold (storage fee after a grace period, and the slot is released). | Site ready **and** funds ready (payment confirmed or NBFC sanctioned) | — |
| S9 | Dispatch & transit | Site + funds ready | Container assigned. Every item's barcode scanned against the BOM at loading. Sealing video. Transit insurance. Live GPS. ETA sent to the customer. | Container inside the site geofence | — |
| S10 | Delivery payment | Arrival | Customer pays 90%, or the NBFC disburses directly per RBI rules ⚖, within 48 h. Demurrage timer runs. If still unpaid on day N: hold or return as per the contract, at the customer's cost. | 90% in escrow | Supplier paid from escrow |
| S11 | Triple-key material handover | 90% received | Customer OTP + technician biometric + **System key**. The System key is issued automatically when every check is green; the Admin is involved only on an anomaly. Recorded under CCTV. Every item scanned and counted. eSign liability transfer. | Handover certificate | — |
| S12 | Installation (stage-gated SOP) | Handover done | Crew dispatched. Stage pouches unlock. Evidence and CV check for every step. Blockers handled. Daily plan and commitment. PPE, harness and LOTO checks. | All SOP steps verified | Stage earnings accrue |
| S13 | Testing & commissioning | Installation done | Load test, safety gear, overspeed governor, ARD, door locks, a video of 10 trial runs, and floor-levelling accuracy | Test report | — |
| S14 | Surprise QC | Test report | Independent inspector (not from the same crew or zone), arriving at a random time inside a window | QC pass, or a rework loop with attribution | QC payout; rework cost to the party at fault |
| S15 | Statutory inspection & license ⚖ | QC pass | Application pack prepared automatically. Inspection scheduled. Liaison present. Defect-rectification loop. | License or permission to operate | Government fees |
| S16 | Final handover | See D10 | Customer, technician and QC present (geo-verified). Trial runs. **Rescue-procedure training for building staff.** Document pack: license, warranty, manuals, emergency numbers. Ratings. eSign. | Handover certificate | Customer pays 10%; weekly technician payout; rider's final tranche |
| S17 | Settlement & margin close | Handover | Ledger closes the order. Actual vs quoted margin. Royalty. GST invoice. TDS. | Order closed | — |
| S18 | Container reverse logistics | Container emptied | Return, inspection, cleaning, battery charging, next assignment | Container available | Logistics payout |
| S19 | Warranty → AMC | Handover | Free service visits during warranty. AMC offered automatically from month 9. Renewal engine. Complaint SLA engine. **Society ownership transfer.** AMC visits follow the same SOP, evidence and payout rules. | AMC active | AMC revenue |
| S20 | Growth loop | Handover | Ask for referrals at the moment of peak satisfaction. The builder's next project. Neighbouring sites. | New leads | Referral reward |

**For every stage, produce:**
- the state table
- the tasks it spawns
- the timers and escalation ladder for each party
- the evidence required
- the money events and ledger entries
- the manager-touch target
- the automation level on Day 1 and at target
- an **FMEA table** with these columns: failure, detection signal, automatic response, human fallback, cost owner

Cover these failure types:
- no response
- a partial action
- a wrong action
- fraud
- dispute
- external events (rain, power cut, strike, festival)
- system failures (offline, IoT battery dead, GPS spoofing)

### 7.1 Emergency Response (S0 class, 24×7)
**Passenger trapped, lift stuck, fire, or accident:**
1. The resident presses the emergency button in the app, or calls the emergency number.
2. The system auto-dispatches the nearest certified on-call technician (24×7 roster, with standby pay).
3. The technician gets talk-through rescue guidance.
4. The case escalates to fire services or 112 when needed.
5. Target arrival in the city is ≤ 45 minutes (validate this figure).
6. An incident report is mandatory.

**Safety incident during installation:**
1. Stop work.
2. First aid or ambulance.
3. Incident report.
4. Insurance claim.
5. Root-cause analysis.
6. Statutory reporting where required ⚖.

---

## 8. MONEY ENGINE (corrected)

### 8.1 Margin definition (fixes the V3 ambiguity)
V3 says: "quote at 60% margin, the bot may discount up to 30%, floor 20%." If "30%" is read as 30% off the price, then a ₹16,00,000 quote × 0.70 = ₹11,20,000. That is only 12% above a ₹10,00,000 cost, which **breaks the 20% floor**. V4 therefore defines it as follows:

- **Markup m = (Price − Fully-Loaded Cost) ÷ Fully-Loaded Cost**
- List price at **m = 60%** → the bot may negotiate down to **m = 30%** → a manual negotiator may go down to **m = 20%** → **hard floor at m = 20%**, which the system enforces as a block.
- Example: fully-loaded cost ₹10,00,000 → list price ₹16,00,000 → bot floor ₹13,00,000 → hard floor ₹12,00,000.
- **The fully-loaded cost must include:**
  - material and freight
  - container trip cost
  - crew payouts at every level
  - survey, QC, and statutory and liaison fees
  - insurance
  - payment gateway fees and NBFC subvention
  - rider commission
  - the gamification coin budget
  - the surge and reassignment reserve
  - the warranty reserve
  - the city-partner royalty
  - contingency
  - GST impact
- **Margin Guard.** After signing, every cost event (surge, rework, extra material) updates the live margin:
  - alert at < 25%
  - freeze discretionary spend at < 20%
  - attribute the erosion to its cause
- **Negotiation-bot policy:**
  - concede in small, slowing steps
  - trade concessions for value (faster payment, EMI, a referral, a multi-lift order)
  - never reveal the floor
  - make time-bound offers
  - log every concession
- **Also design:**
  - how long a price stays valid
  - steel and commodity price escalation
  - change orders (an extra floor or stop)
  - GST invoice corrections

### 8.2 Payment flows (design the escrow and the ledger)
- **Escrow.** Customer money goes into an escrow or nodal account run under RBI payment rules ⚖, and is released by milestone rules.
- **Default milestones (D3).** Token ₹10,000 → 90% on delivery → 10% at final handover.
  - Also model the alternative: token → 30% at drawing approval → 60% on delivery → 10% at handover.
  - Compare the two for cash-flow risk, supplier working capital and conversion rate.
- **Supplier working capital.** V3 never says when the supplier is paid or who funds manufacturing.
  - Default: the supplier manufactures against an order confirmed by escrow and NBFC sanction, and is paid from the delivery payment within T+2.
  - Also propose invoice-discounting and supplier-finance options.
- **EMI:**
  - The NBFC sanctions the loan before dispatch.
  - The NBFC disburses directly, per RBI Digital Lending Directions ⚖: the platform acts as a Lending Service Provider, money never passes through the platform, a Key Fact Statement is issued, a cooling-off period applies, and a grievance officer is named.
  - **Caution:** once installed, a lift is part of the building and is weak collateral. The "container security" works only before installation. Propose realistic products instead: builder working-capital lines, consumer loans, co-lending.
- **Edge cases to design:**
  - partial payment
  - a failed or duplicated UPI payment
  - chargeback
  - a **cancellation and refund matrix for every stage**
  - customer death or insolvency
  - a builder going bankrupt mid-project
  - a dispute while money is in escrow

### 8.3 Partner earnings & payouts
- **Use a double-entry earnings ledger, not a stored-value wallet** (a wallet risks needing RBI PPI authorization ⚖). Earnings accrue per verified step and are paid weekly by bank or UPI payout.
- **Coins are non-cash points.** They convert to ₹ only through a published formula, inside an incentive pool capped at X% of the order margin. **Gamification can never eat the margin.**
- **Customer satisfaction affects the bonus, never the base pay for verified work.** Otherwise a customer could hold a technician's pay hostage.
- **Deductions** (missing material at market price + 20%, rework):
  - only with evidence
  - capped per week
  - always appealable
  - a payout is never negative; any shortfall goes onto a recovery schedule
- **Rider commission is staged** across verified lead → token → handover, so fake leads earn almost nothing.
- **Tax and social security:**
  - TDS on partner payouts, and GST on invoices, under current law ⚖. Sections were renumbered under the Income-tax Act, 2025 from 1 April 2026; verify with a CA.
  - The aggregator contribution for platform workers under the Code on Social Security, 2020 ⚖.
- **Every money movement** follows this chain: evidence → rule → ledger entry → reversal path → audit log → timer.

---

## 9. EVIDENCE, AI VERIFICATION, ANTI-FRAUD & MATERIAL GOVERNANCE

### 9.1 Capture protocol
- **Capture method:**
  - in-app camera only, with no gallery uploads
  - an on-screen overlay template for each SOP step (angles, distance)
  - **fiducial QR stickers** on rails and brackets, for scale and identity
  - a short video with motion (liveness) for critical steps
- **Metadata:** server timestamp, GPS, and a cell and Wi-Fi fingerprint.
- **Device checks:** device-integrity attestation and mock-location detection.
- **Reuse detection:** a perceptual hash compared across **all** jobs. A reused photo raises a fraud flag.

### 9.2 AI cold start
- **On day 1 the CV models have no training data.** Every step therefore starts at A1 or A2, with humans reviewing the evidence for the first N sites.
- **Every reviewed image becomes labelled training data.**
- **Steps are promoted** according to Section 4.3.
- **Confidence thresholds are set per step.** Safety-critical steps are always sampled.

### 9.3 Fraud catalog
Extend this to at least 30 scenarios. For each, give the detection signal, the automatic response and the penalty:
- fake leads
- staged or reused photos
- GPS spoofing
- technician + QC collusion
- technician + customer collusion (under-installation, over-claiming material)
- rider + customer fake conversions
- Admin collusion
- supplier short-shipment or substitution of inferior parts
- scrap theft
- off-platform AMC
- fake ratings
- duplicate accounts used to reset scores

### 9.4 Inspecting the inspector
- **QC independence:** the inspector comes from a different zone and is rotated.
- **QC pay** does not depend on pass or fail rates.
- **Re-inspection:** X% of QC-passed sites are re-inspected at random.
- **Outlier detection** on inspectors, e.g. one with a 100% pass rate.

### 9.5 Material governance (V3, retained and refined)
- **Container protection.** Motion outside working hours triggers a loud local siren and an instant red alert to the Admin and the customer.
- **Container lock when offline or the battery is dead.** The lock *fails secure*. An emergency override needs dual approval plus CCTV. The battery and SIM are health-monitored, with alerts before failure.
- **Pre-packed barcoded kits.** Phase-sealed pouches unlock only at their verified SOP stage, **automatically, with no Admin needed**.
- **BOM algorithms** compute exact cable and material quantities. Abnormal requests are flagged automatically.
- **Scrap return.** Scrap is bagged, photographed and verified. Missing items are deducted at market price + 20%, capped and appealable (Section 8.3). A zero-wastage bonus rewards good practice.
- **Fallback reassignment.** Access is revoked instantly, and an urgent surge job is broadcast within 5–10 km, when a technician:
  - misses the GPS check-in
  - is QC-flagged
  - fails AI photo validation twice

  **V4 fix for the last trigger:** failing AI photo validation twice now goes to a human review **before** access is revoked, unless there is a fraud signal. This stops CV false positives from firing good technicians.

---

## 10. SAFETY-FIRST OVERRIDES (new)

- **Stop-Work Authority for every person.** A valid stop is rewarded and never penalized.
- **No coins for speed on safety-critical steps.** Reward first-time-right work and safety compliance instead.
- **Daily task caps and fatigue rules,** e.g. no work at height after X hours.
- **PPE check by CV** (helmet, harness, shoes, gloves) at check-in for work at height and electrical work.
- **Required evidence:**
  - lockout-tagout (LOTO) before any electrical work
  - barricading at the shaft edge
  - pit and overhead safety measures
- **Near-miss reports earn coins.** Incidents go to the S0 workflow (Section 7.1).
- **Insurance stack to specify:**
  - worker accident and medical cover
  - contractor's all-risk
  - public liability
  - transit and marine cover for material
  - container equipment
  - professional indemnity

  Insurance certificates are visible to customers, which builds trust.

---

## 11. COMPLIANCE REALITY CHECK (everything here is ⚖ VERIFY; the design must stay safe either way)

| Area | Law or standard (verify current version) | Why it matters here | Design response |
|---|---|---|---|
| Erecting and operating lifts | Maharashtra Lifts, Escalators and Moving Walks Act, 2017 and its Rules | Permission to erect, inspection, license to operate, and who is allowed to erect and maintain lifts | A licensed **contractor of record** (the company or a partner) with gig technicians working under it; stages S6 and S15 |
| Technical standards | IS 14665 series, National Building Code 2016 Part 8 | The basis for the SOPs, tests and checklists | Each SOP step cites the clause it follows |
| Consumer liability | Consumer Protection Act, 2019 (product and service liability; e-commerce rules) | Liability can be minimized, not eliminated | Back-to-back contracts, insurance, evidence |
| Contracts and eSign | IT Act, 2000 (Aadhaar eSign / DSC); Indian Contract Act | Which documents need which class of signature | A signature-class matrix |
| Lending | RBI Digital Lending Directions | LSP role, direct disbursement, KFS, grievance handling | Section 8.2 |
| Payments and wallets | RBI payment-aggregator / escrow rules; PPI Master Directions | Holding customer money; the wallet question | Escrow account; earnings ledger instead of a wallet |
| Data | DPDP Act, 2023 and DPDP Rules, 2025 (phased commencement) | CCTV, biometrics, location, retention, breach reporting | Consent flows; tracking only on duty; retention schedule |
| Marketing | TRAI TCCCPR (DLT, DND); WhatsApp Business opt-in policy | Cold messages and AI calls to numbers collected on site risk bans and penalties | Consent at S1; approved templates; the AI says it is an AI |
| Workers | Code on Social Security, 2020 (platform workers); OSH Code | Contributions, safety duty, risk of reclassification as employees | Partner agreements; control outcomes, not hours |
| Tax | GST, e-invoicing, TDS on payouts | Invoicing and withholding | Tax hooks in the ledger |
| Electrical safety | CEA safety regulations | Testing and commissioning | LOTO and test SOPs |

---

## 12. GLOBAL PLATFORM REQUIREMENTS (from V3, sharpened)

1. **ID system (fixed).**
   - The problem with V3's location-embedded IDs such as `MH-PUN-KOT-LIFT-089`: they break when things move (a worker relocates, a customer has sites in several cities), and sequential numbers leak business volume to competitors.
   - V4 uses an **immutable opaque ID (ULID)** plus a **human-readable display code**.
   - Sites, lifts and orders get location-based display codes, e.g. `MH-PUN-KOT-L-7Q4K`. People's IDs contain no location.
   - Every photo, video, GPS log, chat message, payment, signature and SOP step links to entity IDs in a graph.
   - A QR code goes on every lift, container and kit pouch.
2. **The map is home.**
   - Every role's home screen is a map with a pinned **"My Next Task"** card.
   - Every list also has a map view, with layers and filters.
   - On the Admin map, colour shows the Job Health Score.
3. **AI Master Controller = the Manager Engine** (Section 5).
4. **Daily routine per role, generated from real tasks** rather than a fixed timetable (Section 5.10).
5. **Micro-gamification.**
   - Coins for every task, streaks, badges, zone and city leaderboards, live money meters, and "Hero of the Week".
   - The economy is capped (Section 8.3) and aligned with safety (Section 10).
   - Anti-gaming: no coins for tasks a person created for themselves, and detection of rating manipulation.
6. **The role clarity screen is "Now → Next → Earn".** It shows:
   - the current task
   - the next task
   - the exact earning when it is done
   - anything blocking the person, with a Blocker button
7. **Structured output per role → revenue.** Give a table with: role, measurable output, how it converts into ₹, KPI and target.
8. **Languages: English, Marathi and Hindi,** switchable instantly.
   - This covers screens, bots, notifications and voice calls.
   - Voice-first for riders and technicians.
   - Icon-led UI for low-literacy users.
9. **Role themes (as in V3):**
   - Rider: outdoor high-contrast, large buttons, voice input.
   - Technician and QC: dark slate, checklists, camera-first.
   - Customer: premium gold and white.
   - Admin and Owner: dark analytics, alert-driven, multi-monitor.
10. **Adaptive layouts and offline-first.**
    - Every screen adapts to phone, tablet and desktop.
    - Field roles work offline-first: evidence is queued, synced later and resolved with the conflict rules in Section 6.3.
    - There is a low-bandwidth mode.
11. **Evidence-first money rule** (Section 9): no payment moves without verified evidence.

---

## 13. ROLES & MINIMUM PAGES

**Roles:**
- Field Rider
- Sales Bot and Manual Negotiator
- Surveyor (L3+)
- Technician (L1–L5)
- QC Inspector
- Customer stakeholders (Section 6.1)
- Resident / end user
- Supplier
- Logistics / container operator
- NBFC partner
- Statutory liaison partner
- City Partner (franchise)
- New Worker (onboarding)
- Support (AI bot, with escalation)
- Admin and Backup Admin
- Owner
- Auditor (read-only)

**Keep all the V3 pages and add the following:**

**All field roles:**
- a Now/Next/Earn card
- a Blocker button
- tomorrow's commitment
- their reliability score and how to improve it
- appeals

**Rider:**
- consent-capture flow and QR card
- dedupe feedback
- construction-stage tagging
- commission tranches

**Technician:**
- crew view
- stage-pouch status
- safety check-in
- scrap return
- earnings forecast for the week
- level and rank progress

**Customer:**
- **one timeline of all stages (S0–S20)** with promised dates vs actual dates, and the reason for any change
- the readiness checklist
- stakeholder management (add an architect or site contact)
- escrow statement
- EMI schedule
- documents and drawings
- live container view (CCTV and GPS)
- negotiation and complaint bots
- the emergency button
- AMC

**Supplier:**
- PO queue
- manufacturing milestone uploads
- kitting and loading scans
- container booking
- payment status
- performance score and penalties

**New Worker:**
- discovery and filters
- earning possibilities
- KYC, police verification, and bank and UPI verification
- enrolment in the insurance and PPE kit
- AI SOP training, videos and tests
- partner agreement by eSign
- lateral-entry skill test (Section 14)

**Admin:**
- Exception Inbox
- Job Health map
- Admin load forecast
- rules console and simulator
- maker-checker queue
- audit log

**Owner:**
- **System Efficiency Index** (TR, TPL, AML)
- cash and escrow position
- margin, actual vs quoted
- the current bottleneck stage
- city-partner league table
- expansion-readiness score for each city
- the automatic weekly memo

**City Partner:**
- a tenant-scoped Admin view
- P&L
- royalty statement

---

## 14. WORKER CAREER LADDER (V3 plus fixes)

| Level | Role | Scope | Promotion requirement |
|---|---|---|---|
| 1 | Trainee Helper | Material handling, site cleanup | Entry after AI training and a test |
| 2 | Junior Technician | Brackets, shaft alignment, wiring | 20 sites, 4.2+ rating |
| 3 | Senior Technician / Surveyor | Motor, control panel, ARD testing, surveys | 50 sites, 4.5+ rating |
| 4 | Master Technician | Full assembly, diagnostics | 100+ sites, 98% SOP accuracy |
| 5 | QC Inspector / Site Lead | Independent site auditing | Invitation plus track record |

**Fixes:**
- **Cold-start deadlock.** V3 says that on day 1 everyone starts at Level 1. That means nobody is qualified at L3–L5, so nobody can install motors or control panels, or do QC. V4 adds **Lateral Entry**: experienced technicians enter at L2–L4 through:
  - a practical skill test
  - verified past work
  - references
  - probation of N supervised sites

  The first cohort is branded the "Founding Technician" cohort.
- **Levels decide which task types and pay rates** a person can get, and the Dispatcher enforces this.
- **Annual recertification,** and demotion for a safety violation.
- **Motivation (as in V3):** morning audio motivation, live money meters, progress bars to the next rank, city leaderboards.

---

## 15. QUALITY GATE — run this on your own output at the end of every pass

- [ ] Every state has an owner and a maximum dwell timer, including states owned by customers, suppliers, NBFCs, government and the Admin.
- [ ] Every job always has a next task. Orphans are impossible by construction.
- [ ] Every expected event has an absence-of-event detector.
- [ ] Every blocker has a resolver, an SLA and a cost owner.
- [ ] Every money movement has evidence, a ledger entry, a reversal path and a timer.
- [ ] Every Admin touch is either listed and justified as Human Reserve, or has a plan to automate it (with its A-level).
- [ ] Admin Minutes per Lift has been computed and is at or below its target.
- [ ] No incentive rewards speed on a safety-critical step.
- [ ] Every penalty is based on evidence, capped and appealable.
- [ ] Every legal assumption is tagged ⚖ VERIFY and has a safe fallback.
- [ ] Multi-user conflicts (duplicates, races, offline edits) are resolved.
- [ ] Every sentence can be implemented or measured.

---

## 16. DELIVERABLES — PASS PLAN (one pass per reply)

| Pass | Content |
|---|---|
| **1 — Gap audit** | Validate the Gap Register (Section 18). **Find at least 25 more gaps yourself.** Rank all gaps by ₹ risk × safety × impact on automation. Give the Assumption Register. List up to 10 questions for the Owner, each with your default answer. |
| **2 — Manager Engine** | The Task JSON Schema. The universal task state table. An escalation matrix for each SLA class and party. A blocker catalog (at least 30). Attribution rules. Dispatcher pseudo-code with weights. Flow-control rules. An exception catalog (at least 40, with default actions and Admin minutes). Rituals. Performance management. Zero-orphan checks. |
| **3 — Lifecycle** | Stages S0–S20 plus the emergency workflow in Section 7.1. For each stage: the state table, tasks spawned, timers, FMEA, evidence, money events and automation levels. |
| **4 — Multi-user & screens** | The stakeholder authority matrix. An RBAC matrix (role × action). The tenancy model. Concurrency rules. Leakage countermeasures. Screen-by-screen specs for each role: map-first, Now/Next/Earn, 3 languages, themes, adaptive and offline behaviour. |
| **5 — Money** | Margin formulas and bot negotiation policy. The fully-loaded cost model. Milestone and escrow flows. A cancellation and refund matrix for every stage. Supplier terms. The NBFC flow. The ledger's chart of accounts. Payout rules. The gamification economy with budget caps. Tax hooks. |
| **6 — SOP, evidence, safety, security** | An SOP checklist for each installation stage, mapped 1:1 to the evidence spec, CV check, pouch unlock, payment gate and safety check. Testing and QC protocols. A fraud catalog (at least 30). IoT lock behaviour. Data security and DPDP. |
| **7 — Architecture** | The data model (entities, relations, IDs). A domain event catalog (at least 80 events). Services: workflow engine (Temporal- or Camunda-class), rules engine, event bus, geo service, CV pipeline, IoT, notifications, ledger. Offline sync. Observability. The recommended stack with reasons. Build vs buy for each component. |
| **8 — Measure & scale** | A KPI tree for each role, the Admin and the Owner. The System Efficiency Index formula. An automation maturity plan for each step (Day 1 → Month 12). The Admin capacity model. The phased rollout: a Pune MVP with manual "Wizard-of-Oz" backstops → Maharashtra → India through city partners. Build priorities ranked by volume × pain × risk. |
| **9 — Stress test** | **(a)** A normal Tuesday with 25 active lifts, 12 technicians, 8 riders, 2 suppliers and 1 Admin. List every event, mark each as automatic or a touch, and compute TR, TPL and AML. **(b)** A bad monsoon Monday: heavy rain, 2 technician no-shows, 1 supplier short-shipment, 1 NBFC rejection, 1 customer dispute, 1 CCTV unit offline, and the Admin on leave. Show every point where the design breaks and patch it. **Finish with the top-20 MVP build backlog** as user stories with acceptance criteria. |

---

## 17. OWNER DECISIONS (defaults the AI must use unless I change them here)

| ID | Decision | Default |
|---|---|---|
| D1 | Contractor of record ⚖ | Partner with an already-licensed lift contractor in Pune for the MVP, and apply for our own license in parallel |
| D2 | Margin definition | Markup on fully-loaded cost: 60% list → 30% bot floor → 20% hard floor |
| D3 | Payment milestones | ₹10k token → 90% on delivery → 10% at handover. Model the alternative in PASS 5. |
| D4 | Containers | Leased from a logistics partner and charged per trip (stays asset-light). Days on site are capped. |
| D5 | First segment | Pune residential builders (G+4 to G+12) plus independent bungalows (home lifts). Builder accounts get credit terms after 2 successful projects. |
| D6 | Worker model | Independent platform partners. Control outcomes, not hours. |
| D7 | Coins | Non-cash points, converted through a capped incentive pool |
| D8 | Automation targets | Month 3: 60% TR · Month 6: 80% · Month 12: 95%. Safety-critical steps are never above A3. |
| D9 | Admin cover | 1 Admin + 1 Backup Admin (part-time or on-call) from day 1 |
| D10 | Final handover | Technical handover after QC; legal handover after the statutory license. The 10% is released at legal handover, unless the license delay is attributed to the customer. |

---

## 18. GAP REGISTER — what V3 missed (resolve every item in your design)

| # | Gap in V3 | Why it breaks automation, money or safety | V4 default fix |
|---|---|---|---|
| G01 | Price fixed before the shaft is measured | Re-quotes, disputes and manual work | Indicative quote → refundable token → survey → final quote (S3–S5) |
| G02 | Material dispatched before site readiness; the 2-week rule applied only after delivery | Containers sit idle at unready sites; disputes over the 90% | Site-readiness gate before dispatch (S8) |
| G03 | EMI checked only after the container arrives | A loan rejection strands material on site | NBFC pre-approval at S5; sanction before dispatch |
| G04 | No supplier manufacturing stage or lead time | Delivery dates can't be computed or promised | S7 plus the Promise Engine |
| G05 | No statutory permission, inspection or license stage ⚖ | Illegal operation risk; final payment gets stuck | S6, S15, D10 |
| G06 | No container return or fleet sizing | Container shortages or idle capex | S18 plus Little's Law sizing |
| G07 | No emergency (trapped passenger) response | Life-safety and brand risk | Section 7.1 |
| G08 | No warranty → AMC conversion; no builder → society transfer | Recurring revenue leaks away | S19 and Section 6.1 |
| G09 | Leads captured only when the shaft is already ready | Vendors are usually chosen during the structure stage because of manufacturing lead times, so the deal is already lost | Capture earlier, score by construction stage, nurture; seed leads from public registries |
| G10 | No definition of done, next-action rule or one-owner rule | Work silently stops between phases | Iron rules (Section 5.2) |
| G11 | "95% automated" is undefined | It can't be measured or managed | Section 4 |
| G12 | No absence-of-event detection | Silent failures | Section 5.4 |
| G13 | Only punishments for delays; no blocker handling | Technicians blamed for customer delays; partner churn | Section 5.6 |
| G14 | No delay attribution | Wrong penalties; every dispute needs the Admin | Section 5.6 |
| G15 | Timers only on workers, not on customers, suppliers, NBFCs, government or the Admin | The largest delays go unmanaged | Timer Rule and ladders for every party |
| G16 | The Admin is in every triple-key unlock and every weekly payout | The Admin becomes the bottleneck as volume grows | System key on green; Admin only on anomaly |
| G17 | One Admin is a single point of failure and of fraud | Business stops or leaks money | Backup Admin, maker-checker, Owner audit |
| G18 | No capacity planning or recruitment trigger | The backlog explodes precisely when sales succeed | Section 5.8 |
| G19 | No WIP limits or flow control | The line jams at the bottleneck | Section 5.8 |
| G20 | The AI "enforces" daily schedules on independent partners ⚖ | Risk of reclassification as employees; resentment | Commitments and outcomes, not hours |
| G21 | CV has no training data on day 1 | False rejections | A-ladder; humans review the first N sites |
| G22 | Failing AI photo validation twice revokes access | False positives fire good technicians | Human review first, unless there is a fraud signal |
| G23 | Rules are hard-coded | The Owner can't tune the business | Policy-as-config plus a simulator |
| G24 | No notification budget | Alert fatigue; people mute the app | Section 5.12 |
| G25 | The customer is treated as one person | Wrong signatory; stuck approvals | Stakeholder model (Section 6.1) |
| G26 | Duplicate leads and rider conflicts undefined | Disputes need the Admin | Dedupe rules (Section 6.3) |
| G27 | No race-condition handling | Double accepts, double payments | Atomic locks and idempotency keys |
| G28 | Franchise plan but no multi-tenant design | A rebuild later | Section 6.4 |
| G29 | Platform leakage (off-platform AMC, suppliers selling direct) | Revenue loss | Section 6.5 |
| G30 | Career-ladder cold start: nobody at L3–L5 on day 1 | No one can do motor or panel work, or QC | Lateral entry (Section 14) |
| G31 | QC is not independent | Collusion | Section 9.4 |
| G32 | Margin rules are ambiguous; "30% discount" read literally breaks the 20% floor | Loss-making deals | Markup definition (Section 8.1) |
| G33 | "Cost" is undefined; coins, surge and warranty are not costed | Margins look healthy but aren't | Fully-loaded cost plus Margin Guard |
| G34 | Supplier payment timing and working capital undefined | Manufacturing can't start | Section 8.2 |
| G35 | NBFC security against an installed lift; RBI lending rules ⚖ | The finance model fails | Realistic NBFC products; platform as LSP |
| G36 | An in-app wallet may be a regulated PPI ⚖ | Licensing risk | Earnings ledger instead |
| G37 | Payout approved by "customer satisfaction" | Customers can hold pay hostage | Satisfaction affects the bonus only |
| G38 | Penalty deductions are uncapped and unappealable | Legal risk and churn | Capped, evidence-based, appealable |
| G39 | Riders are paid per lead | Fake leads | Staged commission |
| G40 | No price validity, steel escalation or change orders | Margin erosion | Section 8.1 |
| G41 | "Zero liability" is not achievable under consumer law ⚖ | False sense of safety | Liability-minimized structure |
| G42 | Cold WhatsApp messages and AI calls to numbers collected on site ⚖ | WhatsApp number ban; TRAI penalties | Consent at S1; templates; the AI says it is an AI |
| G43 | CCTV, biometrics and constant GPS without a consent design ⚖ | DPDP exposure | Consent, duty-time tracking only, retention schedule |
| G44 | Gamification rewards speed in a dangerous trade | Accidents | Section 10 |
| G45 | No insurance or incident workflow | Catastrophic liability | Section 10 and Section 7.1 |
| G46 | Location-embedded, sequential IDs | They break when things move and leak volume | ULID plus display code |
| G47 | IoT lock behaviour when offline or the battery is dead is undefined | Material stuck, or left unsecured | Fail-secure lock plus dual-approval override |
| G48 | No seasonality planning (monsoon, festivals) | Capacity collapses without warning | Seasonality calendar (Section 5.8) |
| G49 | V3 asked for 11 deliverables in one answer | Shallow, generic output | The pass protocol (Sections 0 and 16) |

Every item from V3 Section 10 remains in scope and is covered above: cancellations and refunds, warranty, supplier onboarding and penalties, worker KYC and insurance, statutory workflow, complaint SLA and AMC pricing, fraud, and offline mode.

---

**Begin with PASS 1 now.**
