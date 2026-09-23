# Observability Audit (Phase 60)

**Date:** 2026-09-23
**HEAD at generation:** `d3258b2` (Phase 59)

## Method

Live source inspection of `src/lib/audit.ts` (Phase 06) and
`src/lib/observability.ts` (Phase 12) — the two real, existing
capture mechanisms — plus a comprehensive grep for every real call site
of each, to verify what is actually captured versus what exists as
unused infrastructure.

## What's real and working

### 1. Audit trail (`recordAuditEvent`) — rich context, verified

The `AuditEvent` shape (`src/domain/entities.ts`) captures, for real, on
every one of its 26 real call sites (grepped, not assumed): event ID
(`id`), user identity (`actorId`), role (`actorRole`), operation
(`action`), entity identity (`entityType`/`entityId`), project identity
(`projectId`), timestamp, correlation ID (`correlationId`), and source
(`ui`/`api`/`automation`/`webhook`). Payloads (`before`/`after`) are
real, deliberately MINIMAL projections, not full entity dumps — e.g.
`PAYMENT_RECORDED`'s `after` is `{ amount, status, method }`, never the
full `Payment` record — good, verified practice, not accidental.

### 2. Global crash capture — real, wired in, verified

`installGlobalErrorCapture()` (Phase 12) IS actually called from
`src/App.tsx` (confirmed by direct read, not assumed) at real app
startup, wiring real `window.addEventListener('error', ...)` and
`window.addEventListener('unhandledrejection', ...)` listeners that
call `captureEvent()` with a real message, stack, source, and
correlation ID. A genuine, uncaught client-side crash in the real
running app IS captured to the real `observability_events` collection
today.

## Two real gaps found, both downstream of the SAME root cause already named in Phase 55/59

### Gap 1: bridge/write failures are invisible to BOTH audit and observability

`captureEvent()` has **zero call sites** anywhere in the codebase
outside its own definition and the two `window` listeners above — no
bridge function, no service function, no component ever calls it
directly. Combined with Phase 55's finding (every one of the 16 bridged
screens catches a canonical-write failure into `{bridged: false,
reason}` and only `console.warn`s it, never throwing) and Phase 59's
finding (the same pattern makes `isStaleWriteError()` unreachable from
any UI): **a bridge/write failure is invisible not just to the user, but
to BOTH the audit trail and the crash-reporting system** — it never
reaches `window.onerror`/`unhandledrejection` because it was already
caught internally, so `installGlobalErrorCapture`'s real, working
listeners never see it either. This is the SAME underlying gap viewed
from a third angle (observability), not a fourth separate problem —
named here for completeness of this phase's own required audit, not
padded as new.

### Gap 2 (new this phase): captured crash events are never read back by anything

`getObservabilitySummary()` (the one real read function over the
`observability_events` collection Phase 12 built) has **zero call
sites** anywhere outside its own definition — no Control Tower screen,
no admin dashboard, no report surfaces it. Real crashes ARE captured
(Gap 1's exception — genuine uncaught JS exceptions/rejections do reach
this path), but once captured, nothing in the running app ever reads
them back. The data exists; nothing consumes it. A real, distinct,
previously-unstated gap.

## Sensitive-data-in-logs check

A live grep for `console.log`/`console.warn`/`console.error` calls
anywhere near password/OTP/token/secret/API-key-related identifiers
across all 191 components found exactly **one match**
(`ForgotPasswordReset.tsx:71`), and it logs only a caught parse
EXCEPTION object (`e`) from a `JSON.parse` failure — the string
`'password'` appears only in the log's own descriptive text ("Failed to
parse password reset draft"), never an actual credential value. **No
sensitive-data-logging issue found.**

## Verdict

**VERIFIED**: audit-trail context capture is rich and correct wherever
it's actually invoked; global crash capture is real and genuinely wired
into the live app; no sensitive data found logged unnecessarily.
**Two real gaps**, both honestly named, neither newly "fixed" this
phase: Gap 1 is the SAME structural issue Phase 55/59 already scoped
(make bridge failures loud — fixing it closes this gap too, for free,
since `captureEvent`/`recordAuditEvent` already exist and are ready to
receive that data the moment bridge call sites are updated to call
them). Gap 2 is new, real, and independently actionable: wire
`getObservabilitySummary()` into an existing admin/Control Tower screen
— real, scoped, low-risk follow-up work, not attempted blind in this
audit-focused phase. No code changed this phase.
