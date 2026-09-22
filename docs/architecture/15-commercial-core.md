# Phase 15 — Migrate Commercial Core (Lead → Quote → Contract → Payment)

## 1. Why dual-write, not a full cutover, for this phase

The spec's target for Phase 15 is real: "A real commercial project can
move Lead → Quote → Contract → Payment without touching the legacy data
layer." Getting there for all ~40 commercial-core screens in one pass by
rewriting their JSX/state management would mean touching several
thousand lines of intricate, already-working UI (`PaymentCollectionDashboard.tsx`
alone is 1038 lines) with **no browser available in this sandbox** to
visually re-verify any of it — a real risk of silently breaking working
behavior, which rule #4 ("do not replace working business behavior")
and rule #19 ("keep the application buildable after every wave") both
forbid.

Instead this phase ships the industry-standard safe migration pattern
for exactly this situation — **strangler-fig dual write**: the four
highest-value, most business-meaningful commercial-core screens now
ALSO drive the real canonical Project/Quote/Contract/Payment graph
(Phases 04-09's repository/domain-service/event-bus stack — audited,
idempotent, permission-checked, event-driven) every time a user performs
the real underlying business action, in addition to (never instead of)
their existing `DbManager` write, which stays authoritative for that
screen's own rendering. This is honestly reported as `PARTIALLY_MIGRATED`,
not `MIGRATED` — the matrix does not overclaim.

## 2. `src/services/legacyCommercialBridge.ts`

The new bridge module. Two entry points:

- **`ensureCanonicalProject(ctx, lead, deal)`** — creates the canonical
  Customer/Site/Project spine (via Phase 02's `src/domain/adapters.ts`
  and Phase 04's `createProjectFromLead`) on first touch, using the
  same deterministic derived-id scheme (`proj_<leadId>`) the domain
  adapters already use, so it is idempotent by construction: two bridged
  screens racing to touch the same lead is a benign lost-race (re-checked
  after a failed create), never a duplicate Project.
- **`bridgeLeadStageTransition(actor, lead, deal, targetStage, opts)`**
  — bridges the two real business-meaningful Kanban/detail moves:
  `'quoted'` creates + approves + sends a real Quote (one line item, from
  the deal's agreed price); `'closed_won'` records the customer's
  acceptance, which the REAL Phase 07 event bus (not a direct call) turns
  into a drafted canonical Contract. Deliberately stops at `draft` — it
  does not fabricate a customer signature; that stays with
  `DigitalContractGenerator` (see §4).
- **`bridgeLegacyPaymentConfirmed(actor, legacyPayment)`** — resolves the
  legacy `Payment.dealId → Deal.leadId → Lead`, ensures the canonical
  Project, lazily creates a placeholder `PaymentSchedule` if the
  project's real Contract has not been signed yet (converges with the
  real one on the same derived id once it has), then calls
  `commercialWorkflow.collectInstallment` — idempotent via
  `legacy:<paymentId>`.

Both functions are **permission-checked** (Phase 05's `assertPermission`,
via `commercialWorkflow.ts`) and **never throw out to the caller** — a
denied permission, a not-yet-resolvable deal/lead, or any other canonical-
side failure returns `{ bridged: false, reason }` instead of breaking the
legacy flow the user is already committed to completing. Callers log a
`console.warn` on a soft failure and continue.

## 3. Screens wired

| Screen | Business action bridged | What stays legacy-only |
|---|---|---|
| `LeadKanban.tsx` | Card moved to `'quoted'` / `'closed_won'` | Board rendering, all other stage moves |
| `LeadDetail.tsx` | "Create Quotation" button, stage change to `'closed_won'` | Detail/timeline rendering |
| `PaymentCollectionDashboard.tsx` | "Mark Paid" (full or partial) | Dispute/pause/resume (no canonical equivalent function exists yet), list rendering |
| `OnlinePaymentCheckout.tsx` | Simulated gateway success (this remains a documented Phase 24 gap — no live payment gateway exists in this repo) | Gateway UI itself |

Each wiring is a small, additive, non-blocking `.then()` call placed
immediately after the existing `DbManager` write — no existing JSX,
state, or control flow was restructured, minimizing the risk of a
behavior change this sandbox cannot visually verify.

## 4. What was NOT migrated this phase, and why

- **`DigitalContractGenerator.tsx`** stayed `CONTEXTUAL` (unchanged).
  Inspected directly: it is a fully self-contained demo/preview screen
  with hardcoded contract text (a fixed fictitious price/deal number) and
  no `DbManager` read or write at all — it does not receive a specific
  deal/lead id as a prop, so there is nothing real yet to bridge it to.
  Wiring real contract signing (`commercialWorkflow.signContract`) needs
  that screen rebuilt to operate on a real selected Project/Contract
  first — real, but larger, follow-up work, honestly left as `CONTEXTUAL`
  rather than falsely marked migrated.
- **`QuotePricing.tsx`** stayed `LEGACY` (unchanged, `localStorage`-only
  draft-spec persistence for a multi-step pricing calculator) — it feeds
  into the Kanban/Detail quoting flow already bridged above rather than
  persisting a quote of its own.
- Sales pre-quote sub-workflow (qualification/assignment/follow-up/site
  survey) — same deferral as Phase 08 §5: `Lead` already has a working
  real persistence path this pack chose not to duplicate a third time.
- The other ~35 commercial-core screens found by the matrix (supplier
  payment configuration/scorecards, tax/GST, training-adjacent payment
  screens, etc.) remain `LEGACY` — real, but lower business-priority than
  the Lead→Quote→Contract→Payment spine this phase's acceptance
  criterion names explicitly.

## 5. Regression test

`scripts/commercial-core-bridge-check.ts` (`npm run bridge:check`, wired
into `npm run checks`) exercises the bridge with REAL legacy Lead/Deal/
Payment fixtures — not hand-built canonical objects — seeded into an
actual (polyfilled) `DbManager` instance, proving the exact code path the
4 screens above now call. 14 assertions: quote creation, idempotent
re-entry, auto-drafted contract via the real event bus, unauthorized-role
denial (technician cannot create a quote; supplier cannot confirm a
payment), idempotent payment collection (a retried confirmation produces
exactly one canonical Payment, not two), and a soft, non-throwing failure
for a payment referencing an unresolvable deal.

`scripts/polyfillBrowserGlobals.ts` is a small, Node-only
`localStorage`/`window` polyfill (imported first, so ES module execution
order sets the globals before `db.ts`'s own top-level code runs) — needed
because `DbManager` assumes a browser environment; no production code was
changed to make this possible.

## 6. Acceptance

- `npx tsc --noEmit` — pass.
- `npm run bridge:check` — pass, 14/14 assertions.
- `npm run checks` (all 17 scripts) — pass, zero regressions in the prior
  339 assertions.
- `npm run build` — pass, bundle +~16KB (one new service module, two new
  imports in 4 existing screens — no screen's UI/JSX changed).
- `docs/migration/screen-migration-matrix.md` regenerated: 5
  `PARTIALLY_MIGRATED` (up from 1), 151 `LEGACY` (down from 155), zero
  registry drift.

## 7. Known limitations

- Dual-write means a genuine, if narrow, risk of the two stores
  disagreeing if a canonical-side write partially fails after its legacy
  counterpart already succeeded (e.g. a Firestore permission error mid-
  chain in `bridgeLeadStageTransition`'s multi-step create→approve→send).
  Every step is independently idempotent and safely re-enterable (the
  next stage-move retries from wherever it left off), but this is not a
  distributed transaction — documented, not silently assumed atomic.
- `OnlinePaymentCheckout`'s underlying "gateway" remains a `setTimeout`-
  based 95%-success simulation (Phase 01 baseline, unchanged this phase)
  — bridging its OUTCOME into the canonical model is real; the gateway
  interaction itself is Phase 24's documented scope.
- The placeholder `PaymentSchedule` `bridgeLegacyPaymentConfirmed`
  creates when no real signed Contract exists yet has an empty
  `installments[]` — adequate for `collectInstallment`'s needs (which
  does not read `installments` for a direct-path payment), not a real
  schedule a UI should render as-is.

## 8. Next phase

Phase 16 — Migrate Procurement (Supplier → RFQ → PO → Approval → Supplier
Acceptance → Production → Dispatch).
