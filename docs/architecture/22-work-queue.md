# Phase 22 — Next Best Action + Work Queue

## 1. `src/services/workQueue.ts`

`getWorkQueueItems(ctx)` — one real work item per actionable canonical
Project, generated from live workflow state, never a static card:

- **Required action** reuses `NEXT_ACTION_BY_STAGE` (now exported from
  Phase 21's `projectOperatingView.ts` rather than duplicated).
- **Blockers** reuse `computeBlockers()` (also exported from Phase 21) —
  the exact same real per-project condition checks, not a second
  implementation.
- **Priority** deliberately reuses Phase 12's `ControlTowerCategory`
  vocabulary (`critical`/`at_risk`/`waiting`/`on_track`) rather than
  inventing a new one: a hard-gate blocker (QC/customer-acceptance) ranks
  `critical`; any other real blocker ranks `at_risk`; a project stalled
  more than 7 days with no blockers ranks `waiting`; otherwise
  `on_track`.
- **SLA text** and **days in stage** are derived from the real
  `Project.updatedAt` timestamp — the only "clock" the canonical model
  currently exposes (no per-stage due-date field exists yet, documented
  as a simplification, not fabricated).
- Terminal (`closed_lost`) projects generate no work item — nothing
  actionable to do.
- Sorted most-urgent-first, same rank order as the Control Tower, for a
  consistent mental model across both surfaces.

Control Tower (Phase 12) and this work queue are deliberately
complementary, not duplicative: Control Tower answers "what needs
intervention, across every entity type" (payments, POs, snags,
automation failures); this queue answers "for my projects, what's the
next concrete thing to do" — one item per project, always with a
required action attached.

## 2. `src/components/WorkQueueScreen.tsx`

A real, additive screen listing every work item, priority-colored,
sorted. Clicking an item dispatches a new `aiec_open_project` custom
window event (the same established pattern as `aiec_switch_tab`) that
Phase 21's `ProjectOperatingView` now listens for, deep-linking straight
into that project's full operating view — then switches to that tab via
the existing `aiec_switch_tab` mechanism. Two real, already-proven
navigation primitives combined, no new routing infrastructure.

## 3. Mounted as one new, additive tab

Same pattern as Phases 20-21: one import, one new tab entry
(`{ id: 'WorkQueue', label: 'My Work Queue ✅', icon: Layers }`) added to
admin and surveyor tab lists, one new render guard — nothing existing
touched. Also a small, real addition to `ProjectOperatingView.tsx`: a
new `useEffect` listening for `aiec_open_project`.

## 4. Regression test

`scripts/work-queue-check.ts` (`npm run work-queue:check`, wired into
`npm run checks`) — 11 assertions across 3 real projects: a clean
project (must rank `on_track`/`waiting`, zero blockers), a project with a
PO stuck pending approval (must rank `at_risk` — not `critical`, since
it's not a hard-gate blocker — and surface the real reason), and a
`closed_lost` project (must generate NO work item at all). Also asserts
correct sort order (the at-risk item ranks ahead of the on-track item)
and that `currentStage` reflects the real, live `Project.stage`, not a
cached value.

## 5. Acceptance

- `npx tsc --noEmit` — pass.
- `npm run work-queue:check` — pass, 11/11 assertions.
- `npm run checks` (all 24 scripts) — pass, zero regressions in the
  prior 455 assertions.
- `npm run build` — pass.

## 6. Known limitations

- No in-browser click-through verification — no browser in this
  sandbox.
- SLA/"days in stage" is derived from `Project.updatedAt` only — no
  per-stage due-date model exists yet; a real SLA system needs that
  modeled, not approximated further.
- The work queue currently lists every actionable project system-wide,
  not filtered to "assigned to me" — `Project.ownerUserId` is displayed
  per item but not used to filter the query; a real per-user queue needs
  that filter added once a screen actually passes the signed-in user's
  id as an owner filter (currently additive-only, not yet the primary
  daily interface any role is forced through).

## 7. Next phase

Phase 23 — Security, Reliability, and Performance Lockdown.
