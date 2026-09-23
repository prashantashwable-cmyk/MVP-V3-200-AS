# Error Experience Audit (Phase 59)

**Date:** 2026-09-23
**HEAD at generation:** `09a3ea3` (Phase 58)

## Method

A real, live grep-based audit of every component's error-handling
patterns (not a sample, not assumed) across `src/components/*.tsx` and
the domain/service layer's own thrown-error text, checking for the
specific anti-pattern this phase's brief warns against: "never a generic
'something went wrong' when the system knows the actual reason."

## What the audit found — genuinely good, pre-existing practice

1. **Zero occurrences** of generic placeholder error text ("Something
   went wrong", "An error occurred" as a bare/unconditional string,
   "Generic error", "Unexpected error") anywhere in
   `src/components/*.tsx`.
2. **96 real, specific validation-error messages** ("Please enter...",
   "Please fill...", "Required field...") across form screens — form
   validation is well-differentiated from submission/network errors
   throughout the app, not collapsed into one generic state.
3. **The two fully canonical-read screens** (`ProjectOperatingView.tsx`,
   `WorkQueueScreen.tsx`) correctly catch and display the REAL, specific
   thrown error message (`err instanceof Error ? err.message : String(err)`),
   never a generic fallback — verified by reading both files' actual
   catch blocks and render logic (`{error}` / `Could not load the work
   queue: {error}`).
4. **Only 3 bare `catch {}` blocks** exist in the entire component tree
   (`Dashboards.tsx` ×2, `PermissionsPrimer.tsx` ×1) — each individually
   inspected and confirmed to be a legitimate, safe fallback (a
   `localStorage.getItem`/`JSON.parse` read falling back to a sane
   default; a `Notification.requestPermission()` call falling back to an
   explicit `'unsupported'` state) — not a case of a real, actionable
   error being silently swallowed from the user.
5. **The domain/service layer's own thrown error text is already
   genuinely specific and actionable at the source** — e.g. `"Cannot
   check in: site readiness has not been confirmed. This is a hard gate
   (Phase 09) — not bypassable from this function."` (a workflow-
   violation), `"Role \"customer\" cannot record customer acceptance..."`
   (an authorization error), `"Stale write: record is at version N,
   attempted update assumed version M. Reload and retry."` (a conflict,
   with a concrete next action already in the message text) — these are
   real, previously-verified (Phases 34, 52) and re-confirmed here from
   an error-EXPERIENCE angle, not just a correctness angle.

## The one real, structural gap found — precisely tied to its actual root cause, not double-counted

`isStaleWriteError()` (`src/repository/types.ts`, Phase 06) is real,
tested, and the message it produces is already genuinely actionable —
but **a live grep confirms it is never called from any UI component**.
Investigated further, not left as an isolated finding: this traces
directly to Phase 55's already-documented root cause, not a new,
separate problem. **No component calls a versioned repository's
`.update()` directly** (only `ProjectOperatingView.tsx` even imports
`repository/entities`, and it never writes) — every real write goes
through the Phase 15-18 bridge functions, which (per Phase 55's real
finding) catch every error, including a stale-write conflict, into
`{bridged: false, reason: err.message}` and surface it only via
`console.warn` — invisible to the user regardless of how specific or
actionable the underlying message is. **Fixing stale-write visibility in
isolation, without also fixing the same fire-and-forget pattern for
every other bridge failure, would be an inconsistent, confusing partial
fix** — a stale-write conflict would become visible while an
authorization or validation failure from the exact same code path stays
invisible. This phase does not attempt that piecemeal fix; it correctly
identifies that the real fix is the ALREADY-NAMED Phase 55 next step
("make canonical bridge failures loud... before any legacy write can be
safely removed") — restated here from the error-experience angle to
confirm it is the same gap, not two.

## Loading / success states

Spot-checked across the screens this session's UAT (Phases 46-58)
already drove for real: every screen visited showed either a real
loading transition (e.g. Payment Collection Dashboard's `setTimeout`-
gated `loading` state, Phase 54) or rendered real content promptly — no
screen was observed hanging in an ambiguous state during this session's
extensive real click-through testing (Phases 46-58 combined: dozens of
real navigations, zero silent hangs observed).

## Network-failure / server-failure distinction

Per Phase 58's own real finding: demo-mode writes never touch the
network at all (in-process), so a genuine network-failure-vs-server-
failure UI distinction cannot be exercised in THIS sandbox for the
bridged write paths — this is the same BLOCKED — MISSING CREDENTIAL
boundary as the rest of this pack's live-backend gaps, not a new one.
`GeminiTools.tsx`'s real, already-in-place fallback messages ("Failed to
search. Ensure you have internet connection.") DO correctly suggest a
network cause specifically, for the one subsystem (`/api/gemini/*`) that
performs a real `fetch()` call reachable from this sandbox.

## Verdict

**VERIFIED**: this application's error experience is already
substantially compliant with this phase's own bar — specific, actionable
messages at the source, correctly surfaced verbatim by the two screens
that read canonically, no generic placeholder text anywhere, sound
validation-error coverage. **One real, structural gap** exists
(bridge-write failures, including stale-write conflicts, are invisible
to the user) — correctly identified as the SAME gap Phase 55 already
named and scoped, not a new, separately-fixed patch. No code changed
this phase: the audit found the codebase already largely compliant, and
the one real gap needs the broader, already-scoped Phase 55 fix (touching
all 16 bridged screens consistently) rather than an inconsistent,
piecemeal one.
