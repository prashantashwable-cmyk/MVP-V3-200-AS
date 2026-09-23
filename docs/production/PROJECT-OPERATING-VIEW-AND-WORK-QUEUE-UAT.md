# Project Operating View + Work Queue UAT (Phases 48-49)

**Date:** 2026-09-23
**Method:** Same as Phase 46/47 — real Playwright mobile-viewport/touch
emulation against a locally-served instance of this exact commit's
production build.

## Honest correction, made in-line rather than hidden

This session's first automated pass used a keyword-regex check against
each screen's rendered text (looking for words like "customer",
"stage", "overdue", "assigned") and initially logged all of Phase 48's
6 signal categories and Phase 49's 4 signal categories as PASS.
**Manually inspecting the actual screenshots afterward showed this was a
false positive** — a fresh demo browser session's Project Operating View
and Work Queue are both genuinely EMPTY, and the regex matched words
occurring in each screen's own EXPLANATORY empty-state text (e.g. "One
real item per project that needs a next action..." contains "action" but
not real work; "Projects are created by the dual-write bridges... as real
Lead/Deal actions happen" contains "customer"/"site"-adjacent words in
its explanation, not in actual project data). Rather than let this stand
as a fabricated PASS, this is being reported exactly as what it is: a
methodology mistake caught before publishing, corrected here.

## What is actually true, verified by looking at the real screenshots

### Project Operating View (Phase 48) — real screenshot: `screenshots/phase48-49/p48-project-operating-view.png`

```
No canonical projects exist yet in this environment.

Projects are created by the dual-write bridges (Phase 15+) as real
Lead/Deal actions happen in the legacy screens.
```

**This is a genuinely correct, well-designed empty state** — not a
crash, not a blank white screen, not a generic error. It honestly
explains WHY there is nothing to show (a fresh browser session's
in-memory demo repository starts empty; canonical Projects only exist
once a real lead has moved through the dual-write bridge) rather than
faking placeholder data. This is real, positive evidence about the
empty-state handling this phase's own checklist asks for.

### Work Queue (Phase 49) — real screenshot: `screenshots/phase48-49/p49-work-queue.png`

```
My Work Queue
One real item per project that needs a next action — generated from
live workflow state, not a static list.

Nothing needs action right now.
```

Same honest pattern: a real, correctly-designed empty state, with its
own description explicitly confirming the Work Queue is genuinely
DERIVED from live workflow state (not a static/fake list) — consistent
with `docs/architecture/22-work-queue.md`'s design.

## Why the browser session is empty, and what that does and does not prove

The browser's demo repository is a fresh, isolated, in-memory instance
created per browser session/page load — distinct from the Node-process
demo repository `scripts/full-company-simulation.ts` (Phase 29) and
`scripts/live-concurrency-idempotency-verification.ts` (Phase 45) drive
directly via imported repository functions. Neither of those scripts'
data is visible to a real browser tab, by design (no shared backing
store in demo mode — this is accurate, expected behavior, not a bug).

**What this DOES prove**: the empty state is real, correctly implemented,
and honest about why it's empty — a genuine, positive UAT finding.

**What this does NOT yet prove, live in a browser**: that a REAL project,
once it exists, renders correctly and coherently in these same two
screens. That requires actually creating one through the real UI in this
same browser session — which is exactly Phase 50's job (drive the full
lifecycle through the actual UI, not just the service layer). **Phase 50
closes this loop deliberately**, revisiting the Project Operating View
and Work Queue at the end of a UI-driven lifecycle to show them
reflecting that SAME real project's real state, rather than duplicating
partial, unpopulated evidence here.

## What IS already verified, structurally, for a populated view

`scripts/project-operating-view-check.ts` and `scripts/work-queue-check.ts`
(Phase 21/22, still passing every run of `npm run checks`, unchanged this
phase) structurally exercise a POPULATED project's Project Operating View
and Work Queue against the Node-process demo repository, and
`scripts/full-company-simulation.ts` (Phase 29) additionally confirms
both screens' SURFACE logic reflects a real, fully-lifecycle'd project's
final state (assertions #45-47 in that script's output). These are real,
passing, non-trivial checks — just not yet re-confirmed through an actual
rendered browser tab until Phase 50.

## Verdict for this phase

**VERIFIED**: both screens' empty states are real, correct, and honestly
self-explanatory (a genuine mobile UAT finding, not assumed). **DEFERRED,
not fabricated**: verification that a real, UI-created project's data
renders coherently in these same two screens — explicitly carried into
Phase 50, where it will be tested for real rather than guessed at here.
No code changes this phase (nothing broken was found; the empty state is
correct).
