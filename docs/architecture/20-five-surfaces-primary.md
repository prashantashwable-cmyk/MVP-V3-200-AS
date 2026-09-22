# Phase 20 — Make the Five Operating Surfaces Primary

## 1. What "primary" means here, and why not a full chrome replacement

Phase 10 built the five-surface classification (`src/navigation/surfaces.ts`)
and made it reachable through the Ctrl/Cmd+K command palette — necessarily
a transient, modal experience. This phase's instruction is to make the
surface model the PRIMARY way people navigate, while its own rules are
explicit: **do not delete the old screens**, reclassify them, and this
pack's own later Phase 28 ("Full Navigation Cutover") is deliberately
the separate point where the five surfaces become the actual default —
this phase is about them becoming genuinely, prominently reachable, not
about deleting 100+ tabs of working navigation this sandbox has no
browser to visually re-verify.

## 2. `src/components/OperatingSurfacesHome.tsx`

A new, real, full-page (not modal) component: every one of a role's real
tabs, grouped under WORK / CUSTOMERS / OPERATIONS / FINANCE / CONTROL
using the EXACT SAME `groupTabsBySurface()` function the command palette
already uses (no reimplementation, no drift risk between the two). Each
surface renders as a card with its tagline and every tab as a clickable
row; selecting one dispatches the same `aiec_switch_tab` window event
every other cross-screen link in this app already uses — zero new
routing mechanism, exactly Phase 10's own precedent.

## 3. Mounted as one new, additive tab

- `src/App.tsx`: one new import line, one new tab entry
  (`{ id: 'OperatingSurfaces', label: 'Operating Surfaces 🧭', icon: Grid }`)
  added to the admin/surveyor/technician/customer/supplier tab-list
  branches of `getTabsByRole()` (5 branches, one line each), and one new
  `{activeTab === 'OperatingSurfaces' && (...)}` render guard added
  alongside — never replacing — the existing per-role router mounts and
  `<SharedRoutes>`.
- Every existing tab, router, and rendering path is completely untouched
  — confirmed structurally (§5), not just claimed.
- The tab appears in the sidebar, mobile bottom nav ("More" menu), AND
  the Phase 10 command palette automatically, since all three already
  read from the same `getTabsByRole()` data this phase extended.

## 4. A small real correctness fix along the way

The "Operating Surfaces" tab's own label doesn't match any of
`classifyTabSurface()`'s keyword buckets (it says "operating", not any
of "procure/production/installation/..."), so it falls into CONTROL's
catch-all — which would make the page list itself, recursively, under
its own CONTROL section. Fixed by filtering the tab out of its own
grouped listing before rendering — a real, deliberate UX correctness
fix, not a cosmetic detail skipped.

## 5. Regression test

`scripts/operating-surfaces-home-check.ts` (`npm run
operating-surfaces-home:check`, wired into `npm run checks`) — 18
assertions, in two parts since no browser exists to click through the
UI (same documented constraint as Phase 10):

1. **Logic-level**: the exact `groupTabsBySurface()` call the component
   makes, against a realistic tab sample, correctly buckets each surface
   and excludes the self-referential tab.
2. **Structural**: reads the real `src/App.tsx` and
   `OperatingSurfacesHome.tsx` source directly and asserts the new tab
   was added to exactly 5 role branches, the render guard appears
   exactly once, the import exists, and — critically — that every
   pre-existing router mount (`SharedRoutes`, the `AdminRouter` guard)
   is still textually present, i.e. nothing was accidentally deleted
   while adding this.

Also verified, matching Phase 10's own verification method: `npm run
build` succeeds, the built JS bundle contains the new component's text
(grep-confirmed), and the built server boots and answers `GET /` with
200.

## 6. Acceptance

- `npx tsc --noEmit` — pass.
- `npm run operating-surfaces-home:check` — pass, 18/18 assertions.
- `npm run checks` (all 22 scripts) — pass, zero regressions in the
  prior 423 assertions.
- `npm run build` — pass; server smoke test — `GET /` → 200.

## 7. Known limitations

- In-browser click-through was not visually verified — no browser in
  this sandbox, same limitation Phase 10 documented and this phase
  inherits, not newly introduced.
- The five surfaces are now reachable via a dedicated, prominent tab
  (in addition to the palette) but are still not the DEFAULT landing
  screen for any role — that is explicitly Phase 28's job
  ("full navigation cutover"), not this phase's.
- `scripts/five-surfaces-check.ts`'s transcribed admin tab fixture
  (Phase 10) was not updated to include the new `OperatingSurfaces` tab
  — it is a snapshot for regression-testing the CLASSIFIER, not a live
  read of `App.tsx`, and adding one more admin-only tab does not change
  what that script needs to prove; documented in that file already as
  something to keep in sync by hand if a broader edit is made.

## 8. Next phase

Phase 21 — Project-Centric Operating Experience.
