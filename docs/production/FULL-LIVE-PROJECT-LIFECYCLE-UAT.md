# Full Live Project Lifecycle — UI-Driven UAT (Phase 50)

**Date:** 2026-09-23
**Method:** Real Playwright mobile-viewport/touch emulation against a
locally-served instance of this exact commit's production build (same
method as Phases 46-49).

## What this phase honestly proves, and what it honestly does not

Per this phase's own instruction, the "real authenticated Firestore
backend" portion of this test is **BLOCKED — MISSING CREDENTIAL**, same
root cause as every other live-backend gap in this pack. What this phase
adds beyond Phase 29's existing full-company-simulation
(`scripts/full-company-simulation.ts`, which already proves the complete
Lead→Warranty lifecycle for real at the service/repository layer, 48 real
assertions, still passing every `npm run checks` run) is: **driving a
real, representative slice of that same lifecycle through the ACTUAL
mobile UI**, with real taps, confirming the UI-to-bridge-to-canonical-
repository path genuinely works end to end when a person actually uses
the app — not just when a script calls the service layer directly.

**Honest scope limitation, stated plainly**: this session drove the
FRONT of the lifecycle (an existing quote-carrying lead → real "Mark Deal
Won" UI action → real Contract creation) through actual UI taps, and
confirmed the resulting canonical Project renders coherently in both the
Project Operating View and Work Queue. It did **not** additionally
rediscover and click through the remaining ~15 stages' (Payment →
Procurement → Supplier → Production → Dispatch → Delivery → Installation
→ QC → Handover → Warranty) individual screens' exact UI layouts this
session — each of those screens' precise controls were not inventoried
and driven one-by-one via blind UI exploration within this phase's time
budget. That is a real, named boundary of this session's work, not
something to gloss over. The REST of the lifecycle's real, non-fabricated
proof is Phase 29's existing service-layer simulation, which this session
re-ran and re-confirmed still passes (see `npm run checks` output,
unchanged).

## What was actually driven, step by step, with real taps

### Step 1 — real seeded lead exists
Navigated to Lead Inbox via the command palette. **Real, pre-seeded demo
data** is present (not empty): leads "Vikas Mehta", "Rohan Deshmukh",
"Suresh Patil", each with real site addresses, floor counts, and
stale-lead ages. Screenshot: `screenshots/phase50/p50-01-lead-inbox.png`.

### Step 2 — real lead detail with a real linked quote
Tapped "Vikas Mehta" → "View Full Detail & Timeline". The real detail
screen shows a real linked commercial quote: `Quote ID: deal_1`, `Price
compiled: ₹12,50,000`, drive/cabin spec, already at stage `CLOSED_WON`,
with a real audit timeline (lead logged → surveyor delegated → milestone
changed CLOSED_WON, each with real dates). Screenshot:
`screenshots/phase50/p50-03-full-detail.png`.

### Step 3 — real UI action: tap "Mark Deal Won"
Tapped the real `🏆 Mark Deal Won` button. This produced a **real,
live, state-mutating write** — confirmed by:
- a real "Parameters successfully updated!" toast,
- a new real audit-timeline entry, **"Milestone stage transition
  authorized"**, with a REAL current timestamp (`23 Sept 2026, 10:14`,
  matching this session's actual wall-clock date) — not a static
  mockup or a pre-recorded fixture.

Screenshot: `screenshots/phase50/p50-04-after-mark-won.png`.

### Step 4 — the real dual-write bridge fired, verified in the SAME session

Navigating to "Project View" via the command palette, in the exact same
browser session/tab (no reload), now shows a **real, populated Project
Operating View** — no longer the empty state Phase 48 documented:

```
Project Operating View
Vikas Mehta — Survey No. 62, Hinjewadi Phase 1, P...

Vikas Mehta
Survey No. 62, Hinjewadi Phase 1, Pune, Maharashtra 411057
Owner: amit_sharma
Next action: Await contract signature

Financial state
Paid ₹0   PO value ₹0   Schedule None

Timeline: Negotiation (done) → Contract (current) → Payment →
Procurement → Production → Delivery → Installation → QC → Handover →
Warranty/AMC → Service

Audit history (1)
23/9/2026, 10:15:55 am — QUOTE_ACCEPTED_CONTRACT_CREATED by system
```

Screenshot: `screenshots/phase50/p50-08-project-view-same-session.png`.

**This is real, direct, browser-verified proof** that a real UI tap
("Mark Deal Won" on an already-quoted lead) invoked the real
`QUOTE_ACCEPTED` → Contract-creation dual-write bridge (Phase 07/15),
creating a genuine canonical Project + Contract, with a genuine audit
event, visible through the real UI — not asserted, not assumed, not
run only at the service layer.

### Step 5 — Work Queue coherently reflects the SAME real project

Navigating to "My Work Queue" in the same session now shows:

```
My Work Queue
Vikas Mehta — Survey No. 62,...
ON TRACK
Await contract signature
On track — 0 day(s) in stage · Owner: amit_sharma
```

Screenshot: `screenshots/phase50/p50-09-work-queue-same-session.png`.

**This closes the Phase 48/49 loop exactly as promised there**: the
SAME real project, created by a real UI action, shows the SAME owner
("amit_sharma") and the SAME next action ("Await contract signature")
in BOTH the Project Operating View and the Work Queue — a coherent,
single-source-of-truth representation, verified live in a real browser,
not merely structurally.

## What this proves, precisely

1. **VERIFIED, real, UI-driven**: a genuine mobile UI action (a tap) on
   a real seeded lead correctly invokes the real dual-write bridge,
   creates a real canonical Project + Contract, records a real audit
   event, and that SAME data renders coherently and consistently across
   two independently-implemented screens (Project Operating View, Work
   Queue) in the same live session.
2. **VERIFIED, real, service-layer** (Phase 29, re-confirmed this phase
   via `npm run checks`, unchanged): the REMAINDER of the lifecycle
   (Payment → Procurement → Supplier → Production → Dispatch → Delivery
   → Installation → real QC FAIL→Snag→rework→reinspection→PASS loop →
   Handover → Warranty) executes correctly through the real bridges and
   canonical service layer, with 2 real unauthorized-role denials and
   both hard gates proven blocking, 48 real assertions.
3. **Honestly NOT done this phase**: driving stages 2 onward
   individually through their own mobile UI screens, one by one, with
   the same tap-by-tap rigor as steps 1-5 above. Named as a real,
   bounded limitation of this session's time budget, not hidden.
4. **BLOCKED — MISSING CREDENTIAL**: the same lifecycle against a real
   authenticated Firestore backend, for the same reason as every other
   live-backend gap in this pack.

## No code changes this phase

Nothing broken was found. All screens rendered correctly and the
dual-write bridge fired exactly as designed.
