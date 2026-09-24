# MVP Gap Register

Gaps are found three ways: the **static gap detector** (Workflow health tab, `gaps.ts`), the **runtime invariant check** (every active project has one state, next action, owner, deadline and completion condition), and the **intervention causes** (Automation improvement tab). Readiness at the time of writing: **97.9%** overall (`npm run mvp:simulate` prints the current value).

| ID | Workflow | Gap | Impact | Current Manual Action | Proposed Automation | Status |
| -- | -------- | --- | ------ | --------------------- | ------------------- | ------ |
| G-01 | Sales / Handover | Customer non-response ends with Admin | 1 intervention per silent customer (simulation: 1 of 3 projects) | Admin phones the customer, then uses *Extend deadline* | Automated WhatsApp/voice reminder before Admin escalation (needs a provider) | Open — detector shows "partial" |
| G-02 | Payments | 3 failed payments block the project | Money stuck; Admin reconciles | Admin records an audited offline payment (NEFT/cheque ref) | Offer UPI/NEFT/EMI links automatically after the first failure; bank-statement reconciliation | Open — partial |
| G-03 | Lead generation | Incomplete lead data needs Admin | Lead cannot be quoted | Admin completes the fields (QUALIFY_LEAD task) | Enforce GPS, floors and phone at capture (V3 rider capture screen) | Open — partial |
| G-04 | Technical clearance | Out-of-tolerance measurements need a human decision | Project waits on Admin review | Admin approves or rejects the FLAG | Engineering rule table (car size vs shaft) to auto-approve known-safe cases | Open — by design (safety) |
| G-05 | All field work | Photo content is not analysed (**MVP MOCK** CV) | A staged or irrelevant photo passes the rule checks | None (GPS + timestamp + checklist are enforced) | Plug a CV model into `PhotoAnalyzer`. It can already return `suspicious` → FLAG | Open |
| G-06 | All | Notifications are in-app only (SMS/WhatsApp **MVP MOCK**) | A user who doesn't open the app misses reminders; the ladder still escalates and reassigns | None needed: the ladder recovers | Real SMS/WhatsApp transport (V3 `ChannelTransport` interface) | Open |
| G-07 | All | Identity is demo PIN login | Not production authentication | – | Firebase Auth (V3 already integrates Google sign-in) mapped to MVP users | Open — demo only |
| G-08 | Dispatch | Supplier reassignment needs a second supplier | With one supplier, a no-show goes to Admin | Admin assigns manually | Onboard backup suppliers; supplier SLA penalties | Mitigated (2 seeded suppliers) |
| G-09 | Installation | 14-day SOP is a single work item | Progress inside installation isn't tracked step by step | None | Split into per-SOP-stage work items (V3 installation definition has the stages) | Open |
| G-10 | Field | Offline covers evidence capture; submit needs network | A technician who stays offline cannot finish until back online | Wait for network (UI says so; evidence is safe) | Queue the submit in the outbox as well | Open |
| G-11 | Payouts | Earnings become ELIGIBLE but aren't disbursed | Technician payout is manual | Finance pays weekly outside the MVP | Payout batch + bank integration, gated on ELIGIBLE | Out of MVP scope |
| G-12 | Scale | Single Node process, SQLite, polling | Fine for tens of users, not thousands | – | Postgres + a job queue (V3 already has drizzle/pg) behind the same engine API | Out of MVP scope |
| G-13 | Invariant | A state with no rule orphans a project | Detected (AUTOMATION EXCEPTION), not prevented at design time | – | Gap detector blocks startup if `stateProblems` is non-empty | Detected; test `gaps.test.ts` |
| G-14 | Reassignment | Lost-access reassignment counts toward the reassignment limit | Rare early Admin escalation | Admin assigns | Don't count HR deactivations against the limit | Open (minor) |
