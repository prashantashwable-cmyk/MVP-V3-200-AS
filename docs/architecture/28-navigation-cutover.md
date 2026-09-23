# Phase 28 — Full Navigation Cutover

## 1. What "cutover" means here, honestly

This phase's own instruction is explicit: legacy route compatibility MAY
remain temporarily, and the old screens are never deleted. Given ~145
screens are still `LEGACY` in the migration matrix (Phase 27), claiming
the underlying APPLICATION is "fully migrated" would overclaim — that is
not what this phase asks for. What it asks for is a NAVIGATION change:
the five operating surfaces become the PRIMARY way people orient
themselves, not an optional extra tab someone has to know to look for
(Phase 20's state). That is a real, scoped, honest thing to deliver
without needing every underlying screen to be repository-backed first.

## 2. The actual cutover

Three real changes in `src/App.tsx`, all additive/reordering, nothing
deleted:

1. **Default landing state**: `useState('OperatingSurfaces')` (was
   `'Home'`). This one line covers BOTH a fresh login and — the more
   common real-world case — a restored session on page reload, which
   never calls `setActiveTab` itself and therefore depends entirely on
   this initial value.
2. **Every real login-success path** (OTP verify, email/password,
   Google Sign-In, demo-role bypass, and the header's demo-partner
   shortcut — 5 call sites) now explicitly lands on `'OperatingSurfaces'`
   too, for the case where the component was already mounted (a login
   inside the same session, not a fresh page load). The logout/reset
   handler's `setActiveTab('Home')` was deliberately left alone — it is
   a different kind of moment (clearing form state while signed out),
   not a "where does a user land" decision.
3. **Tab ordering**: `OperatingSurfaces` now appears FIRST in every
   role's `getTabsByRole()` list (admin/surveyor/technician/customer/
   supplier) — visually primary in the sidebar, mobile bottom nav (whose
   "primary tabs" are the first 4 entries), and the Phase 10 command
   palette's browse view, not just reachable somewhere in a long list.

## 3. What stayed exactly as it was

- Every old per-role dashboard tab (`Home`/`TechnicianHomeMyJobs`/
  `CustomerHomeDashboard`) is still present in every tab list — fully
  reachable with one click, unchanged content, unchanged rendering.
- The Phase 10 command palette remains mounted and unchanged — "the
  command palette remains available," per this phase's own rule.
- No router, no screen, no `renderTabContent()` branch was touched.

## 4. Regression test

`scripts/navigation-cutover-check.ts` (`npm run navigation-cutover:check`,
wired into `npm run checks`) — 23 assertions, structural (reads the real
source, same no-browser reasoning as Phases 10/20/21/22): the initial
state is really `'OperatingSurfaces'`; at least 4 explicit login-success
paths were updated; the logout handler was deliberately NOT touched
(and still exists); every old dashboard tab id is still present for
every role; `OperatingSurfaces` is the literal first entry in all 5
roles' tab arrays; the command palette is still mounted.

## 5. Acceptance

- `npx tsc --noEmit` — pass.
- `npm run navigation-cutover:check` — pass, 23/23 assertions.
- `npm run checks` (all 32 scripts) — pass, zero regressions in the
  prior 546 assertions.
- `npm run build` — pass; server smoke test — `GET /` → 200.

## 6. Known limitations

- No in-browser click-through verification — no browser in this
  sandbox, same constraint every prior App.tsx-touching phase has
  documented.
- The underlying application is NOT fully migrated — ~145 screens remain
  `LEGACY` (Phase 27). This phase changes what a user is ORIENTED by
  first, not the completeness of the migration underneath it; both facts
  are true simultaneously and neither is hidden by the other.
- "A new employee should not need to understand the old 189-screen
  structure" is now true for their FIRST screen and their primary
  navigation model — it is not yet true for every task they might need
  to do, many of which still live on an old, unmigrated screen reached
  through the surface grouping.

## 7. Next phase

Phase 29 — Full Company Simulation.
