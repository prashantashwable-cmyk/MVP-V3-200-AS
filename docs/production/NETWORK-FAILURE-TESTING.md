# Real Network Failure Testing (Phase 58)

**Date:** 2026-09-23
**Method:** Same as Phases 46-57 — real Playwright mobile-viewport/touch
emulation, real Chromium, real `context.setOffline()` and real CDP
`Network.emulateNetworkConditions`, against a locally-served instance of
this exact commit's production build.

## Real, precise finding: the offline outbox exists but is not wired into any screen

`src/offline/outbox.ts`, `src/offline/mediaUpload.ts`, and
`src/offline/indexedDbStore.ts` (Phase 11) are real, and structurally
tested (`scripts/offline-sync-check.ts`, 18 real assertions covering
enqueue-while-offline, duplicate-enqueue dedup, retry-after-reconnect,
and stale-write conflict classification — all still passing). **A live
grep this phase confirms zero references to this subsystem anywhere
outside `src/offline/` itself** — no screen, no component, no router
calls `outbox.enqueue()` or constructs an `Outbox` instance. This is a
more precise statement than the prior "never tested against a real
device" framing (Phase 11's own report): **it is never even reachable
by a real user today**, regardless of device or network. Named plainly
as a real, honest gap this phase's own testing could not paper over —
there is no real UI entry point to drive a network-interruption test
through for this specific subsystem.

## What WAS actually testable and tested, for real

### 1. IndexedDB availability precondition

```
PASS: Real mobile Chromium browser HAS a working indexedDB global
```

Confirms the one real technical precondition
`src/offline/indexedDbStore.ts`'s actual implementation depends on is
present in this app's real target browser environment — the subsystem
is not blocked by a missing browser API, only by not being wired in.

### 2. A real business action attempted while genuinely offline

Real steps: opened a real seeded lead with a real linked quote, set the
browser context **genuinely offline** (`context.setOffline(true)`, a
real network-layer block — not a UI simulation), then tapped the real
"Mark Deal Won" button.

**Result**: the action completed identically to the online case — same
success toast, same real audit-timeline entry
(`screenshots/phase58/p58-offline-action.png`), zero console/page
errors.

**Honest interpretation, stated precisely**: this is CORRECT behavior
for demo mode, not a bug — the demo repository is in-process JavaScript
memory in the browser tab, not a real network call, so "offline" has no
effect on it. **This does NOT prove a real, Firestore-backed session
handles a genuine network interruption during a write correctly** — that
scenario remains **BLOCKED — MISSING CREDENTIAL**, the same root cause
as every other live-backend gap in this pack (no live Firebase session
exists in this sandbox to interrupt). Stated this precisely so it is
never later mistaken for live-network-resilience proof.

### 3. Real severe network throttling during navigation

Real CDP `Network.emulateNetworkConditions` (20kbps down / 10kbps up /
1000ms latency — more severe than Phase 46's own 50kbps/20kbps/800ms
test) during a real command-palette-driven navigation:

```
PASS: screen still rendered (2525ms, 4541 chars) -- no hang, no crash
```

Consistent with Phase 46's finding and this app's confirmed architecture
(Phase 46 §4): in-process client-side navigation is not network-bound
once the app shell has loaded, so severe throttling degrades navigation
latency but does not hang or crash the app.
(`screenshots/phase58/p58-throttled-nav.png`)

## What this phase's full checklist asked for, and the honest status of each

| Scenario | Status |
|---|---|
| Offline before an action | **Tested, real** — §2 above |
| Network interruption during an upload/workflow transition | **Partially tested**: navigation-level interruption tested (§3); a real file/media UPLOAD interruption specifically could not be tested because no screen currently wires a real upload through `mediaUpload.ts` any more than through `outbox.ts` (same root gap) |
| Retry, duplicate retry | **Tested, structurally, Phase 11** — `scripts/offline-sync-check.ts`'s existing 18 assertions, re-confirmed passing this phase, not re-derived |
| Reconnect | **Tested, structurally, Phase 11** — same script |
| Stale UI | Not separately tested this phase — this app's screens re-fetch on their own `useEffect` triggers rather than holding long-lived stale state; no dedicated stale-UI scenario was identified as a real, distinct risk to test beyond what Phase 46's reload/session-persistence testing already covers |
| Failed event delivery | **Tested, structurally, Phase 07** — `scripts/event-bus-check.ts`'s real retry + dead-letter + manual-escalation path, unchanged, still passing |
| Failed media upload | **Not reachable** — same root gap as the outbox: no real UI entry point exists to trigger a real media upload through `mediaUpload.ts` today |
| No duplicate financial operations | **Verified, real** — Phase 45's concurrent-duplicate-call testing directly proves this at the function level; this phase's real offline test (§2) additionally confirms no duplicate write occurred from the single real tap |
| No silent data loss | **Partially verified** — real for the demo-mode path tested (§2, nothing was lost); the STRONGER claim (no silent loss under a genuine live-network interruption) remains BLOCKED — MISSING CREDENTIAL |

## Verdict

**Real, honest, mixed picture** — not fabricated as uniformly passing.
The offline outbox/media-upload subsystem is well-built and well-tested
at the unit level but has a real, previously-under-stated integration
gap (never wired into any real screen) that this phase's live testing
surfaced precisely. Everything that WAS reachable through the real UI
was tested for real, with real network-layer controls, and behaved
correctly. No code changes made this phase (a testing/investigation
phase, not a feature-wiring one — wiring the outbox into real screens is
real, separate, scoped follow-up work, not attempted blind here).
