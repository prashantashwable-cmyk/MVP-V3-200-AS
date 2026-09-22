# AIEC — Commercial Core Workflows (Phase 08)

Implements: `src/services/commercialWorkflow.ts`. Acceptance check:
`scripts/commercial-workflow-check.ts` (`npm run commercial:check`).
Also fixes a real bug in the Phase 04 repository layer found while
building this phase (see §3).

## 1. What "implement the workflow" means in this phase

`08_WORKFLOWS_SALES_FINANCE_PROCUREMENT.md`'s acceptance line is: "A
project can travel from accepted quote through contract/payment/
procurement without the user needing to manually stitch screens
together." That is an orchestration/business-logic requirement, testable
without touching a single React component — and `RUN_ALL.md` is explicit
that the five-surface UX rebuild (which is where the 189 existing
screens actually get rewired to call into this layer) is Phase 10, done
**after** phases 02-09 establish the model:

> "Do not run Phase 10 UX simplification before Phases 02–09 establish
> the workflow/data model. Otherwise the UI will be simplified around an
> unstable architecture."

So this phase builds and proves the real orchestration layer;
Phase 10 is where it gets wired into the screens a person actually
clicks through. This is stated plainly here and in the implementation
log — not glossed over.

## 2. `src/services/commercialWorkflow.ts` — what it does

Each exported function: permission-checks via `assertPermission`
(Phase 05), persists through the repository layer (Phase 04), audits
(Phase 06), and publishes a canonical event (Phase 07) where doing so
triggers a real downstream effect.

| Function | Does | Permission | Event published |
|---|---|---|---|
| `createQuote` | Quote + QuoteVersion v1 from line items | `quote.create` | — (audited directly) |
| `approveQuote` | draft → approved | `quote.approve` | — |
| `sendQuote` | approved → sent | — | `QUOTE_SENT` |
| `recordCustomerQuoteDecision('accept')` | sent → accepted, **publishes `QUOTE_ACCEPTED`** | — | `QUOTE_ACCEPTED` → real Phase 07 handler creates the `Contract` and advances `Project.stage` automatically |
| `recordCustomerQuoteDecision('reject'\|'counter')` | sent → rejected/negotiating | — | — |
| `signContract` | customer + internal signature, creates `PaymentSchedule` from the accepted `QuoteVersion` total, advances `Project.stage` to `payment` | `contract.approve` | `CONTRACT_SIGNED` |
| `collectInstallment` | idempotent payment (reuses Phase 06's `createPaymentIdempotent`), advances `Project.stage` to `procurement` on the first confirmed payment | `payment.create` | `PAYMENT_RECEIVED` → real Phase 07 handler |
| `createProcurementPO` | idempotent PO creation (Phase 06) | `supplier.manage` | — |
| `approvePO` | pending_approval → sent_to_supplier, checked against `procurementWorkflow`'s actual transition (Phase 03) | `po.approve` | `PO_APPROVED` |
| `recordSupplierAcceptance` | → accepted_by_supplier | — | — |
| `dispatchMaterial` | → dispatched, advances `Project.stage` to `delivery` | — | `MATERIAL_DISPATCHED` |

`recordCustomerQuoteDecision`'s acceptance path is the concrete proof of
"without the user needing to manually stitch screens together": the
caller does not create the Contract, does not know a Contract needs to
be created, and does not touch `contractRepository` at all — accepting
the quote publishes an event, and the REAL handler built in Phase 07
does the rest. This is the actual event-driven architecture working
across two phases' code, not a same-file function call pretending to be
decoupled.

## 3. A real repository-layer bug found and fixed while building this

Writing this phase's multi-step scenario (approve → send → accept →
sign, each an `update()` with an incrementing `expectedVersion`) hit a
`StaleWriteError` on the SECOND update, always. Root cause:
`demoRepository.update()`/`firestoreRepository.update()` checked
`expectedVersion` against the stored `version` but never wrote a new
`version` back unless the caller's `patch` explicitly included one —
`advanceProjectStage` (Phase 06) happened to always pass `version`
explicitly, so this bug was invisible until a second call site
(`commercialWorkflow.ts`) didn't.

**Fixed in both repository implementations**: `update()` now
auto-increments to `expectedVersion + 1` whenever `expectedVersion` is
provided and the caller's `patch` doesn't already set `version`
explicitly. This is a correctness fix to Phase 04 infrastructure, not a
new/optional feature — every future caller of `Repository.update()` with
optimistic concurrency now gets correct behavior by default instead of
needing to remember to bump the version themselves. Re-ran the full
`npm run checks` suite (all prior phases' acceptance scripts) after the
fix to confirm nothing regressed — all still pass.

## 4. Acceptance

`scripts/commercial-workflow-check.ts` — 21 assertions, running
(approximately) Scenario A + B from
`13_FINAL_END_TO_END_ACCEPTANCE.md` early:

- Quote created → an unauthorized approval attempt (surveyor) is denied
  → admin approves → sent → customer accepts → **Contract is
  automatically created via the event bus** → Project auto-advances to
  `contract`.
- Contract signed → PaymentSchedule created with correct installment
  amounts computed from the accepted quote total → Project auto-advances
  to `payment`.
- Advance payment collected; a retried request with the same
  idempotency key does not double-charge; an unauthorized actor
  (supplier) cannot record a customer payment; Project auto-advances to
  `procurement`.
- PO created → unauthorized approval attempt (surveyor) denied → admin
  approves → supplier acceptance recorded → material dispatched →
  Project auto-advances to `delivery` (end of Phase 08 scope; Phase 09
  continues from here).
- Every record created traces back to the same `projectId` (Phase 13
  Scenario B's requirement, verified early).

All 21/21 pass. Full `npm run checks` (all 8 phases' acceptance
scripts, 100+ assertions total) still passes after this phase's
repository-layer fix.

## 5. What this phase deliberately did not do

- Did not rewire any of the 189 existing screens to call
  `commercialWorkflow.ts` — see §1.
- Did not implement the Sales sub-workflow's pre-quote stages (lead
  qualification/assignment/follow-up/site survey) as service functions —
  those operate on `Lead`, which already has a working real persistence
  path (`firestoreLeads.ts`, confirmed in Phase 01) with a different
  shape than the canonical `CanonicalLead` (Phase 02). Building a third,
  parallel Lead-mutation path in this phase risked exactly the kind of
  duplicated-concept problem Phase 01 flagged as existing technical debt,
  for a part of the journey the Phase 03 state machine already models
  faithfully without needing new persisted code. Left as documented scope
  for whichever phase reconciles the canonical vs. Firestore `Lead` shape.
- Branding/pricing-rule/history/analytics/objection-library/negotiation-
  configuration "supporting tools" (per the phase's own instruction to
  treat these as contextual, not mandatory workflow steps) were not
  touched — correctly out of scope.

## 6. Build/typecheck

`npx tsc --noEmit` passes. `npm run checks` (all 8 acceptance scripts)
passes in full — 21/21 new assertions, zero regressions in the prior
100+. `npx vite build` passes.
