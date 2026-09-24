# FUTURE V4 ROADMAP: how the MVP grows into "The App Is the Manager"

> **REFERENCE ONLY. Phase 1 builds nothing from this file**, apart from D-28 to D-30, which are already in DECISIONS.md.
> Full V4 text: `V4_MASTER_PROMPT_REFERENCE.md` in this folder.
> **Rule:** a V4 feature moves into a build step only when its **data trigger** is met. Use `U5_PILOT_FEEDBACK_ROUND` to check.

## 1. The V4 21-stage workflow compared with the MVP's 10 stages
| V4 stage | MVP Phase 1 | Grows into it in | Data trigger |
|---|---|---|---|
| S0 Zone planning, heatmap, public-registry lead seeding | ❌ | Phase 2 | Leads per week from riders flatten out |
| S1 Lead capture, consent, dedupe | ✅ LEAD (consent tick box, duplicate phone number) | Phase 2: photo and GPS checks against fake leads | Fake or duplicate leads above 10% |
| S2 Qualification bot (WhatsApp/voice) | ⚠️ Manual qualification by the salesperson | Phase 3 | Sales spends more than 2 hours a day qualifying |
| S3 Refundable token **before** survey | ⚠️ Optional survey fee (D-30) | Phase 2 | More than 30% of surveys don't lead to a quote |
| S4 Survey before the final price | ✅ SURVEY | — | — |
| S5 Final quote, margin guard, negotiation bot, NBFC pre-approval | ✅ quote + margin floor; ❌ bot and NBFC | Bot: Phase 3 · NBFC: Phase 2 | More than 20% of lost deals are lost on price or financing |
| S6 Drawings + statutory permission to erect | ⚠️ Compliance document status (D-27) | Phase 2: a proper stage with liaison tasks | Permission delays hold up installs |
| S7 Supplier PO + manufacturing milestones | ⚠️ PO + expected date | Phase 2: factory milestone evidence | Supplier delays in more than 20% of orders |
| S8 Site-ready gate before dispatch + 2-week rule | ✅ SITE_READY | — | — |
| S9 Dispatch: container, barcode, GPS | ⚠️ PO status + material received | Phase 3–4 | Material loss or disputes happen |
| S10 90% on delivery | ✅ with START gate | — | — |
| S11 Triple-key IoT lock handover | ❌ | Phase 4 | Material theft incidents |
| S12–S13 Stage-gated SOP + testing | ✅ 11-item checklist with photos | Phase 3: CV checks; kit pouches | Rework rate above 15%, or more than 20 installs a month |
| S14 Surprise, independent QC | ⚠️ Human QC, scheduled | Phase 2: random timing, rotation | More than 3 QC inspectors |
| S15 Statutory inspection + licence | ⚠️ Licence task before legal handover (D-29) | Phase 2: full liaison workflow | — |
| S16 Final handover | ✅ | — | — |
| S17 Settlement, actual vs quoted margin, partner payouts ledger | ⚠️ Estimated margin in reports | **Phase 2 (high priority)** | Paying technicians by hand takes more than 3 hours a week |
| S18 Container reverse logistics | ❌ | With S11 | — |
| S19 Warranty → AMC renewal engine | ✅ simple AMC statuses | Phase 2: renewal reminders and pricing | More than 10 lifts under warranty |
| 7.1 Emergency response, 24×7 | ⚠️ Emergency button, on-call technician, P0 task (D-28) | Phase 2: on-call roster, response SLA reports | First real emergency, or more than 5 lifts in AMC |
| S20 Referral / growth loop | ❌ | Phase 2 | More than 5 happy handovers |

## 2. V4 Manager Engine compared with the MVP
| V4 Manager function | MVP Phase 1 | Future phase |
|---|---|---|
| Task object + One-Owner / Next-Action / Timer / Done rules | ✅ Task entity; current task, owner and due date; "no next action" alert | P2: every state gets a timer |
| Watchdog, absence-of-event detection | ⚠️ Overdue detection on dashboard load + daily digest | P2 |
| Escalation ladder E0–E6 | ❌ (in-app notifications only) | P2: E0–E2 · P3: E3–E6 |
| Blocker engine + delay attribution | ⚠️ 8 reasons, owner by reason | P2: attribution and cost owner |
| Dispatcher / matching / surge | ❌ Admin assigns | P3 |
| Flow control, capacity, recruitment trigger | ❌ | P3 |
| Exception inbox + rule learning | ⚠️ "Needs Attention" section | P3–P4 |
| Rituals (morning brief, commitments) | ❌ | P2: morning brief · P3: commitments |
| Performance management / reliability score | ❌ | P3 |
| Promise engine (dates computed from capacity) | ⚠️ Due dates shown to the customer | P3 |
| Zero-orphan reconciliation | ⚠️ "No next action" check | P2: full nightly checks |
| Automation maturity A0–A4 and touchless-rate metrics | ❌ | **P2: start measuring** (Admin actions per order) |
| Gamification, coins, career ladder | ❌ (hidden) | P3 |
| Multi-tenant / city partners | ❌ | P5 |

## 3. Measurements Phase 1 must already collect, so later phases can be decided on data
- Time spent in each stage, per order. This comes from the audit trail.
- Tasks created, on time and overdue, by task type and by owner.
- Blockers by reason and time to resolve them.
- QC first-pass rate and rework count.
- **Admin actions per order.** This is the baseline for V4's "touches per lift".
- Emergencies: time to acknowledge and time to arrive.

Step 13 must confirm that each of these can be read from the data.
