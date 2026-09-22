# AIEC — Event Bus and Real Workflow Automation (Phase 07)

Implements: `src/events/types.ts`, `src/events/bus.ts`,
`src/events/handlers.ts`, `src/events/index.ts`, extended
`firestore.rules`. Acceptance check: `scripts/event-bus-check.ts`
(`npm run eventbus:check`).

## 1. Canonical event vocabulary

`src/events/types.ts`'s `CanonicalEventType` is exactly the 18 events
listed in `07_EVENT_BUS_WORKFLOW_AUTOMATION.md`. These already appear as
`event` values on transitions in `src/workflows/definitions/*.ts`
(Phase 03) — that alignment was deliberate there, so the state machines
and this event bus speak one vocabulary rather than needing a
translation layer.

## 2. Execution model — real, not simulated

`publishEvent(ctx, event)`:

1. Persists one `WorkflowInstance` (Phase 02 canonical type) per event
   occurrence — `id = wfi_<event.id>`.
2. Runs every handler registered for that event type
   (`src/events/handlers.ts`), each wrapped by:
   - **Idempotency** — reuses Phase 06's `runIdempotent()` directly,
     keyed `${event.type}:${event.id}:${handler.name}`. Redelivering the
     same event id (e.g. a double-submit, or — once a real queue exists —
     an at-least-once delivery retry) reruns nothing.
   - **Retry** — up to 3 attempts on handler failure, in-process.
   - **Dead-letter** — on exhaustion, a `WorkflowExecution` with
     `status: 'dead_letter'` and the real error message is persisted
     through the repository layer, and a `WORKFLOW_HANDLER_DEAD_LETTERED`
     `AuditEvent` is written.
3. Marks the `WorkflowInstance` `completed` or `failed` depending on
   whether any handler dead-lettered.

`retryDeadLetter(ctx, event, handlerName)` is the "manual retry / human
escalation" path: re-invokes the same handler for the same event
occurrence and records a new `WorkflowExecution` (the original
dead-letter record is left in place — audit trails are never edited or
deleted, consistent with Phase 06).

**Scope, stated plainly (not hidden):** this runs in-process,
synchronously, within the caller's request — it proves the execution
MODEL (idempotent, retried, audited, dead-letterable) is real, not that
there is a durable, cross-process, at-least-once message queue behind
it. A production deployment with real traffic should move `publishEvent`
onto a durable queue (Cloud Tasks/Pub-Sub); the `registerHandler`/
`publishEvent` API would not need to change for callers.

## 3. The two worked examples, implemented for real

**`QUOTE_ACCEPTED`** (`src/events/handlers.ts`,
`createContractOnQuoteAccepted`):
1. Looks up the existing `Project` (throws loudly, rather than
   fabricating one with guessed data, if it's missing — "create project
   if required" is honored by checking, not by silently inventing
   customer/site data this handler doesn't have).
2. Creates a real `Contract` record via `contractRepository`.
3. Advances the `Project.stage` to `'contract'`.
4. Queues a `NotificationRecord` (`status: 'queued'`, `channel: 'in_app'`)
   for finance and for operations each — honestly labeled `'queued'`,
   not `'delivered'`, since no real email/WhatsApp/SMS provider exists
   yet (Phase 11's job; Phase 01 §7 confirmed none exists today).
5. Writes an `AuditEvent`.

**`QC_FAILED`** (`createSnagAndPauseHandover`):
1. Creates a real `Snag` record, already `status: 'assigned'` to the
   reporting technician ("create snag" + "assign rework" as one step).
2. Queues a notification to the technician.
3. **Pauses handover**: forces the project's `Handover.qcPassed = false`
   and `status: 'blocked_qc_not_passed'` — creating the record if it
   doesn't exist yet, or correcting it back to blocked if it does. This
   is the same field Phase 02's domain model and Phase 03's `handover`
   workflow both key their hard gate on, so this handler and that gate
   cannot drift apart.
4. "Start SLA": records an audited due-by marker. A real SLA timer/
   escalation job (which would fire `SLA_BREACHED`) is Phase 12's
   control-tower/observability work — not fabricated here.
5. Writes an `AuditEvent`.

Two smaller handlers (`PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`) show the
pattern generalizes beyond the two worked examples, without claiming
coverage of all 18 canonical events in this phase — only events with a
real, tested handler are registered, per "do not claim an automation is
active if it is only simulated."

## 4. Acceptance

`scripts/event-bus-check.ts` — 14 assertions:

- `QUOTE_ACCEPTED` creates a real `Contract`, advances the `Project`
  stage, queues both notifications — verified by reading the records
  back through the repository layer, not by checking the handler
  "returned ok."
- Redelivering the identical event id does not double-create the
  contract or double-queue the notification.
- `QC_FAILED` creates a real `Snag` assigned to the technician and
  leaves `Handover.qcPassed === false` — directly proving "a failed QC
  cannot accidentally reach handover" (Phase 09's requirement) at the
  automation layer, ahead of Phase 09 building the screens around it.
- A handler forced to fail (`__setSimulateOverdueFailure(true)`) is
  retried exactly 3 times, then dead-lettered with a real, persisted
  `WorkflowExecution` record carrying the actual error message.
- After fixing the simulated condition, `retryDeadLetter()` succeeds —
  proving the human-escalation path works, not just the failure path.

## 5. Firestore rules extended

Added `workflow_instances`, `workflow_executions` (immutable, mirrors
`audit_logs`), `snags`, `notifications`, `handovers` (admin-write-only —
`qcPassed` is too important a gate to let any non-admin path set), and
`qc_inspections`. All prior rules from Phases 01/04/05/06 untouched.

## 6. What this phase deliberately did not do

- Did not wire any of the 189 existing screens to call `publishEvent()`
  yet — the pack's "existing automation screens should be wired to the
  real engine where feasible" is continued in Phases 08/09 as those
  workflows are actually rebuilt, not retrofitted onto every current
  screen in this phase.
- Did not implement all 18 canonical events' handlers — only the 2
  worked examples plus 2 smaller ones, each with a real, tested effect.
  Registering a handler for an event without a genuine effect would be
  exactly the "simulated automation" anti-pattern this phase exists to
  replace.
- Did not move the engine onto a durable external queue — see §2's
  documented scope statement.

## 7. Build/typecheck

`npx tsc --noEmit` passes. `npm run checks` (lint + domain + workflow +
repository + authz + audit + eventbus) passes in full — 14/14 new
assertions. `npx vite build` passes.
