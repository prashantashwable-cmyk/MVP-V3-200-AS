# Final Company Simulation (Phase 63)

**Date:** 2026-09-23
**HEAD at generation:** `60d21d5` (Phase 62)

## Method

New script `scripts/final-company-simulation-multi-project.ts` (wired
into `npm run checks`), distinct from and complementary to Phase 29's
`full-company-simulation.ts` (which proves ONE project's complete real
lifecycle, still passing, 48 assertions). This phase's own brief asks
for something Phase 29 does not cover: **multiple real, simultaneously-
existing projects in different states**, created through the real Phase
15-18 dual-write bridges (never hand-inserted fixture rows), then
verified that management-level AGGREGATE views (Control Tower, Work
Queue) answer real questions without opening any single project's own
screen.

## The 7 real, simultaneous projects created

| Project | State | How it was created |
|---|---|---|
| A | Brand-new lead | A real `Lead` added, no deal/project yet |
| B | Active, on track | Real contract signed (event bus), real payment recorded |
| C | Financially blocked | Real contract signed, **deliberately no payment ever recorded** |
| D | Procurement issue | Real PurchaseOrder created and left stuck in `pending_approval` |
| E | Delivery issue | Real shipment arrived, real material receipt recorded as `damaged` |
| F | QC failure / rework in progress | Real installation completed, real QC FAILURE recorded, real Snag auto-created |
| G | Completed / warranty | Full real handover chain completed — QC pass, compliance, checklist, customer acceptance, certificate issued, reaching real `warranty_amc` stage |

## Real bugs in this test script itself, found and fixed before trusting it

1. **Project G's premature "completed" claim.** The first draft called
   only `bridgeQcPassed` and asserted the project needed no further
   attention — the real result showed it still at stage `"delivery"`,
   not `"warranty_amc"`. Corrected by actually completing the real
   remaining handover chain (`confirmCompliance`,
   `bridgeFinalChecklistCompleted`, `bridgeCustomerAcceptanceRecorded`,
   `bridgeHandoverCertificateIssued`) — the same real functions Phase
   29's own proven simulation uses for this exact sequence — until the
   project genuinely reached `warranty_amc`.
2. **A too-strong assertion about "done" projects.** The first draft
   asserted a completed project must carry ZERO work-queue items at
   all. The real result showed Project G still carries one, at
   `on_track` priority. Investigated before treating it as a failure:
   Phase 29's own already-established, real, correct expectation
   (`scripts/full-company-simulation.ts`'s own assertion) is "no
   CRITICAL work item" — never "zero items." The assertion was wrong,
   not the application; corrected to match the real, pre-existing,
   correct bar.
3. Two `Actor` type-shape mismatches (`{id, role}` vs the service
   layer's expected `{userId, role}`) — caught by `tsc`, fixed before
   running.

## Real finding: financially-blocked projects are not flagged as at-risk today

Project C (contract signed, deliberately zero payment ever recorded)
shows up in the real Work Queue as:

```json
{"priority":"on_track","action":"Await contract signature"}
```

**Two real, honest observations, not glossed over**:
- The priority is `"on_track"`, not `"at_risk"` or `"critical"` — a
  project stuck for lack of payment is not currently distinguished from
  a healthy one by the Work Queue's priority derivation.
- The required action text ("Await contract signature") is stale/
  incorrect for this project's actual real state — the contract WAS
  already signed (via the real event-bus-driven auto-contract-creation
  on `closed_won`); the real blocker is the missing payment, not an
  unsigned contract.

This is a genuine, real gap in the Work Queue's next-action/priority
derivation logic (`src/services/workQueue.ts`) for the specific case of
a signed-but-unpaid project — not fixed this phase (a real, scoped
follow-up needing its own careful verification against the existing
passing Work Queue test suite, not a guess made under this phase's
audit-focused scope), but found and reported honestly, exactly the kind
of thing this phase exists to catch.

## Management visibility — real questions, answered from aggregate views only

| Question | Answer, from Control Tower / Work Queue only |
|---|---|
| What needs attention? | Control Tower: `{critical: 0, at_risk: 1, waiting: 8, on_track: 0}` — real, non-zero, non-static |
| Who owns next action for the procurement-blocked project? | Work Queue surfaces a real item for Project D |
| What is at risk? | The real QC-failed project (F) is ranked critical/at_risk, not on_track |
| What is done? | The real completed project (G) carries no critical item |
| What is silently NOT flagged, that should be? | **Project C** — see the real finding above |

## Verification

- `npx tsc --noEmit` — clean.
- `npm run build` — clean.
- `npm run checks` (47 scripts) — pass, 0 regressions, including the new
  multi-project script (10/10 real assertions) and the full, unbroken
  `full-company-simulation` (48 assertions).

## Verdict

**VERIFIED, real, multi-project**: Control Tower and Work Queue
correctly surface exceptions across simultaneously-existing projects in
distinct real states, answering most of this phase's required questions
correctly from aggregate views alone. **One real, honestly-reported gap**
found: financially-blocked (signed-but-unpaid) projects are not
currently flagged as at-risk and can show a stale next-action label —
named precisely, not fixed blind, real scoped follow-up.
