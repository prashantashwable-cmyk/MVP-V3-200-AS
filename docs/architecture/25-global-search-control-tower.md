# Phase 25 — Global Search + Control Tower Completion

## 1. What closed the Phase 12 blocker

Phase 12 scoped global search to Project/Customer only, explicitly
because every other named entity "don't yet have a dedicated detail
screen a search result could usefully land on." That blocker is now
closed: Phase 21's `ProjectOperatingView` is exactly that dedicated
screen — real, canonical-data-backed, and already showing quote/
contract/payment/procurement/delivery/installation/QC/handover/warranty
status for one project in one place. Since every one of those entity
types carries a `projectId`, a search result for any of them can deep-
link into that project's operating view.

## 2. `src/navigation/entitySearchProvider.ts` expanded

`refreshEntitySearchCache()` now queries 8 more real repositories
(Quote/Contract/Payment/PurchaseOrder/Shipment/InstallationJob/
QCInspection/Handover) alongside the existing Project/Customer, building
one unified, locally-cached search index (still synchronous per
keystroke — a real production search-as-you-type implementation queries
a local index, not the network, on every keystroke, same reasoning
Phase 12 already established). Each entry's `sublabel` reports the real
status (`Quote · sent`, `PO · pending_approval`, `QC Inspection · pass`)
— not a placeholder.

Selecting any non-Project/Customer result now dispatches the real
`aiec_open_project` event (Phase 22's Work Queue mechanism, reused, not
duplicated) with that record's own `projectId`, then switches to the
`ProjectOperatingView` tab — landing the user on the actual project, with
that Quote/PO/QC's real status visible in context, never a dead end.

## 3. What remains explicitly out of scope, and why

- **Site** — no standalone search-worthy identity beyond its Project
  (a Site is always looked up via its Project in this app's real usage).
- **Lead** — its dual Firestore/`localStorage` split
  (`DbManager.getLeads()`'s `isRealSession` branch) makes a synchronous
  local cache the wrong shape for it without real further work.
- **Invoice/Document/Message** — no canonical repository-backed entity
  exists yet for Invoice (Phase 02 never modeled it as canonical);
  Document metadata exists (Phase 11) but has no dedicated detail screen
  a result could land on either. Reported honestly, not silently
  promised and left unbuilt.

## 4. Control Tower

Phase 12 already built the real Critical/At Risk/Waiting/On Track
classification with a real, navigable `actionTabId` per item — re-read
and confirmed still accurate and unchanged (`scripts/control-tower-check.ts`
passes identically). No further Control Tower work was needed this
phase beyond what Phase 24 already added (real, computed integration
health feeding the same observability summary Control Tower's own
acceptance check already exercises).

## 5. Regression test

`scripts/global-search-check.ts` (`npm run global-search:check`, wired
into `npm run checks`) — 11 assertions: runs a real project through
several real bridge chains (quote, contract auto-creation, PO, delivery,
QC pass), refreshes the search cache, and proves search finds a real
record for every one of the 6 newly-added entity types, that a Quote
result and a QC result both deep-link to the SAME correct real
`projectId` via the real `aiec_open_project` event, and that a result's
sublabel reflects the real recorded outcome (QC "pass", not a
placeholder).

## 6. Acceptance

- `npx tsc --noEmit` — pass.
- `npm run global-search:check` — pass, 11/11 assertions.
- `npm run checks` (all 29 scripts) — pass, zero regressions in the
  prior 509 assertions.
- `npm run build` — pass.

## 7. Next phase

Phase 26 — Data Quality and Single Source of Truth.
