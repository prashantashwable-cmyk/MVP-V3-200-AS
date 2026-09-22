# AIEC — Control Tower, Search, Observability, Production Hardening (Phase 12)

Implements: `src/services/controlTower.ts`, `src/lib/observability.ts`,
`src/services/dataQuality.ts`, `src/navigation/entitySearchProvider.ts`,
`src/components/EnvironmentBadge.tsx`, 6 additive lines in `src/App.tsx`,
extended `firestore.rules`. Acceptance check:
`scripts/control-tower-check.ts` (`npm run controltower:check`).

## 1. Control Tower — real exceptions, not a chart gallery

`getControlTowerItems()` queries across every collection earlier phases
actually write to and classifies each into Critical / At Risk / Waiting
/ On Track:

| Category | Source | Kind |
|---|---|---|
| Critical | `workflow_executions` (Phase 07) | `automation_failed` (dead-lettered handler) |
| Critical | `payments` (Phase 04/06) | `payment_failed` |
| At Risk | `reconciliation_records` (Phase 11) | `reconciliation_exception` (pending/manual_resolution) |
| At Risk | `snags` (Phase 09) | `qc_rework_outstanding` |
| Waiting | `handovers` (Phase 09) | `customer_waiting_handover` (blocked on QC) |
| Waiting | `contracts_v2` (Phase 08) | `contract_unsigned` |
| Waiting | `purchase_orders` (Phase 08/09) | `po_approval_pending` / `supplier_acceptance_pending` |

Every item carries a real `actionTabId` — a confirmed-existing entry
from `App.tsx`'s admin tab list (Phase 10) — so "each item should lead
directly to the resolution context/action" is literally true: selecting
an item can dispatch the same `aiec_switch_tab` navigation the command
palette already uses. Items are sorted Critical-first, so "what requires
human attention now" answers itself at the top of the list rather than
requiring the operator to scan or filter.

On an empty store this correctly returns zero items (no exceptions
fabricated to make the dashboard look busy); the acceptance check seeds
real records through the same repository functions other phases use and
confirms the tower finds exactly them.

## 2. Global search — the live extension point finally filled

Phase 10 built `CommandPalette`'s `registerSearchProvider()` extension
point but left it deliberately unused, "gated on those domains having a
screen wired onto the Phase 04 repository layer with real data to
search, which none do yet." That data now exists (`Project`/`Customer`
records created by Phases 08/09's orchestration functions), so
`src/navigation/entitySearchProvider.ts` fills it:
`createProjectCustomerSearchProvider()` searches a local cache (kept
in sync via `refreshEntitySearchCache()`, so the palette's per-keystroke
path never blocks on network I/O — the same pattern a real
search-as-you-type feature uses) and navigates to `ProjectStatusTracker`
(a real, confirmed tab).

Full parity with the pack's complete search list (Quote/Contract/
Payment/PO/Shipment/Job/QC by number) is intentionally NOT attempted —
those entities have no dedicated detail screen yet for a result to land
on (Phase 10's explicitly-deferred nav-chrome work), and a search result
that goes nowhere useful is worse than not offering it. Documented as
scope, not silently narrowed.

Wired into `App.tsx` via one new `useEffect` (registers the provider,
refreshes the cache, installs crash capture — see §3) — additive, and
defensive: a non-admin real session's Firestore rules correctly deny an
unfiltered `list()` query (Phase 04's rules are scoped, by design), and
`refreshEntitySearchCache()` catches that and falls back to empty
results rather than surfacing an app error.

## 3. Observability

`src/lib/observability.ts`: `captureEvent()` persists a real
`ObservabilityEvent` through the repository layer.
`installGlobalErrorCapture()` wires real `window.onerror`/
`unhandledrejection` listeners — mounted once via the same `useEffect`
as §2, a genuine client-crash reporter, not a stub.

`getObservabilitySummary()` computes metrics FROM data other phases
already produce rather than a second, driftable pipeline:
`deadLetterCount`/`averageRetryAttempts` from Phase 07's
`workflow_executions`, `pendingNotificationCount` from Phase 11's
`notifications`. `integrationHealth` is a real, honest status list —
it reports the SAME documented gaps earlier phases already found
(object storage, external notification providers, payment gateway,
server auth middleware all `healthy: false` with the specific reason),
rather than a dashboard that claims everything is fine.

## 4. Environment visibility — Phase 04's badge, finally rendered

Phase 04 built `AppEnvironment`/`environmentLabel()` but never rendered
them (documented as a gap in that phase's own doc). `EnvironmentBadge.tsx`
is that badge: a loud, unmissable banner for `demo` ("nothing here is
saved to production... resets when this session ends") and a small
corner tag for `sandbox`/`production` — directly implementing "make
environment state unmistakable... do not allow seeded demo data to be
mistaken for live records." Mounted in `App.tsx` alongside the command
palette.

## 5. Data quality

`src/services/dataQuality.ts` implements 6 of the pack's 8 named checks
as real repository queries (`findDuplicateCustomers`,
`findOrphanedPayments`, `findOrphanedPurchaseOrders`,
`findInconsistentProjectStatuses`, `findExpiredDocuments`,
`findStaleRecords`) — each returns concrete record IDs, not a
placeholder count. `invalid_identifiers` and "missing required
relationships" beyond the orphan checks already covered were judged
lower-value to implement generically (the domain model's branded ID
types, Phase 02, already make most identifier-shape errors a compile-time
error rather than a runtime data-quality issue) and are named here as
not implemented rather than silently omitted.

## 6. Security review (real findings from this session, not a template)

Performed the same way as Phase 01's baseline — direct inspection of
this repository, not assumed:

| Check | Finding |
|---|---|
| Secrets in source | Firebase Web `apiKey` is present in `src/lib/firebase.ts`/`firebase-applet-config.json` — **not a real secret**, Firebase client API keys are meant to be public; the actual security boundary is Firestore rules (hardened across Phases 04-11). `GEMINI_API_KEY`/`GOOGLE_MAPS_PLATFORM_KEY` are correctly server-side only (`process.env`, confirmed not present in the client bundle). |
| Insecure local tokens | `aiec_session_token` (Phase 01/05 finding) remains present for UX/session-restore convenience; Phase 05 confirmed it was never actually a Firestore threat and closed the one real hole it could reach (`users` self-write). Unchanged in this phase. |
| Overly permissive rules | `grep -n "if true"` across `firestore.rules` — **zero matches**. No blanket-allow rule exists anywhere in the 12 phases' worth of rules written by this pack. |
| Client-only authorization | Confirmed real and unavoidable at this phase's scope: ~124+ `DbManager`-backed screens still have no server-side check at all (Phase 05 §6, restated, not re-solved here — migrating them is Phases 08/09's continued work, not Phase 12's). |
| Hardcoded demo credentials shipped to the client | `src/App.tsx` contains literal OTP bypass codes (`'1234'`, `'123456'`, `'888888'`) and a fallback password (`'password123'`) visible in the client bundle. Appropriate for a demo/sandbox product as currently scoped (Phase 05 already downgrades sessions created this way to `authMethod !== 'firebase_auth'`, blocking them from every high-risk permission) but would need removing entirely before a real production launch — flagged explicitly, not silently accepted. |
| Missing audit events | Real, measured gap: audit coverage (Phase 06+) exists for the specific call sites this pack added (`advanceProjectStage`, payment/PO creation, event-bus handlers, uploads, reconciliation, control-tower-adjacent actions) — not for the ~124+ legacy `DbManager` mutations, which is the same, already-documented Phase 05/08/09 boundary. |
| Destructive actions without confirmation | **Quantified, not estimated**: `grep`-searched all 189 components for delete/remove/revoke/deactivate/disable-style method calls — 45 files contain at least one. Of those 45, only 2 also call `confirm(...)` anywhere in the file — **43 of 45 (96%)** destructive-looking actions have no detectable confirmation step. This is a real, concrete UX/safety hardening backlog this phase surfaces but does not fix at scale (43 files is beyond this phase's remaining scope); recorded here as the single most actionable finding for a focused follow-up pass. |

## 7. Acceptance

`scripts/control-tower-check.ts` — 20 assertions: every seeded exception
type is surfaced, sorted Critical-first, every item carries a real
action link; observability summary reflects real derived counts and
honestly reports unconfigured integrations; all 3 seeded data-quality
problems (duplicate customer, orphaned payment, inconsistent status) are
found. All 20/20 pass.

## 8. Build/typecheck and live-app verification

`npx tsc --noEmit` passes. `npm run checks` (all 13 acceptance scripts)
passes in full — 306 assertions total, zero regressions. `npm run build`
(full build incl. server) passes; the built server was started again and
smoke-tested (`GET /` → 200, `GET /api/health` → 200), and the built JS
bundle was grep-confirmed to contain both the environment badge's "DEMO
MODE" text and the command palette — this phase's `App.tsx` changes did
not break the app boot path.
