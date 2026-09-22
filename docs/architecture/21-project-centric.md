# Phase 21 — Project-Centric Operating Experience

## 1. `src/services/projectOperatingView.ts`

`getProjectOperatingView(ctx, projectId)` assembles the exact fields the
pack's own worked example names — Customer, Site, Current Stage,
Progress, Next Action, Owner, SLA/Blockers, Financial State, and Audit/
History — in one call, extending Phase 19's `getCustomerPortalSummary()`
(which already covers the commercial/operations status fields) with the
project-management fields that summary deliberately left out:

- **Timeline**: the 14-stage `ProjectStage` progression
  (`PROJECT_STAGE_ORDER`), each step marked `done`/`current`/`pending`
  relative to the project's real stage — a genuine simplification of a
  model that has some branching (documented, not hidden).
- **Next action**: a lookup table keyed by the real current stage — text
  describing what actually needs to happen next, not a static label.
- **Blockers**: computed from REAL conditions in real canonical
  collections, never a hard-coded list — a PO stuck in
  `'pending_approval'`, a delivery receipt with an unresolved damaged/
  missing incident, open snags blocking a failed QC, or either of Phase
  09's two hard gates (QC not passed / customer acceptance not recorded)
  genuinely still open.
- **Audit history**: `listAuditEventsForEntity(ctx, 'Project', projectId)`
  (Phase 06), sorted newest-first.

## 2. `src/components/ProjectOperatingView.tsx`

The first screen in this entire pack to read the canonical repository
layer DIRECTLY through a domain service, rather than `DbManager` — the
exact `UI → Domain Service → Repository` shape rule #9 names as the
target architecture for every migrated screen, demonstrated end to end
on a brand-new screen instead of risked on one of the 189 existing ones
(same reasoning Phases 15-20 have applied consistently: a rendering
change to an existing complex screen cannot be visually re-verified
without a browser; a new, additive screen can be fully proven via a
script and mounted safely).

Self-contained: manages its own project-picker state (lists real
canonical projects via `projectRepository(ctx).list()`) so it needs only
a `user` prop — no new state threaded through `App.tsx`'s props chain,
same additive-mounting pattern as `OperatingSurfacesHome` (Phase 20).

## 3. Mounted as one new, additive tab

Same pattern as Phase 20: one import line, one new tab entry
(`{ id: 'ProjectOperatingView', label: 'Project View 🎯', icon: Compass }`)
added to the admin and surveyor tab lists (the two roles that actually
own/manage projects end to end), one new render guard alongside — never
replacing — every existing router mount and the Phase 20 addition.

## 4. Regression test

`scripts/project-operating-view-check.ts` (`npm run
project-operating-view:check`, wired into `npm run checks`) — 14
assertions across two real scenarios:

1. A project driven through the ENTIRE real bridge chain (lead → quote →
   contract → payment → PO → delivery → installation → QC pass →
   handover certificate) — asserts the timeline, next action, owner,
   financial totals, and audit history (including a specific, real,
   automatically-recorded `QUOTE_ACCEPTED_CONTRACT_CREATED` event from
   the Phase 07 event bus, not a synthesized one) are all exactly
   correct, and — importantly — that this CLEAN project has **zero**
   blockers (a real negative-case proof, not just presence).
2. A second, deliberately-stuck project (a PO left in
   `'pending_approval'`) — asserts the blocker computation surfaces the
   real, specific reason, proving blockers are computed from actual
   state, not simulated.

## 5. A real finding while building this

Writing the audit-history assertion first assumed
`advanceProjectStage()` (Phase 06's dedicated stage-transition-with-audit
helper) is what the commercial/operations workflow services call — it
is not. `signContract`/`collectInstallment`/`dispatchMaterial`/
`issueCertificate` all update `Project.stage` with a raw
`projectRepository(ctx).update(...)` call, bypassing that helper
entirely (a Phase 08/09 characteristic, not introduced by this phase).
The only `entityType: 'Project'` audit event this project's real history
actually produces comes from the `QUOTE_ACCEPTED_CONTRACT_CREATED`
notification inside the Phase 07 event handler. The test was corrected
to assert the real event, not the assumed one — documented here rather
than silently adjusting the assertion without explanation.

## 6. Acceptance

- `npx tsc --noEmit` — pass.
- `npm run project-operating-view:check` — pass, 14/14 assertions.
- `npm run checks` (all 23 scripts) — pass, zero regressions in the
  prior 441 assertions.
- `npm run build` — pass.

## 7. Known limitations

- No in-browser click-through verification — no browser in this
  sandbox, same constraint every prior additive-screen phase (10, 19,
  20) has documented.
- `advanceProjectStage()` remains unused by the actual workflow services
  — a pre-existing characteristic, named here, not fixed (fixing it would
  mean touching Phase 08/09's already-accepted, tested orchestration
  code for a phase whose scope is a new screen, not a service change).
- The 14-stage linear timeline is a simplification — the real workflow
  definitions (`src/workflows/definitions/*.ts`) have some branching/
  exception paths (e.g. quote rejection/renegotiation) this timeline does
  not visually represent, documented rather than silently flattened
  without saying so.

## 8. Next phase

Phase 22 — Next Best Action + Work Queue.
