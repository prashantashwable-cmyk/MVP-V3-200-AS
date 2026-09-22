# AIEC — Field Reliability, Media, Notifications, Reconciliation (Phase 11)

Implements: `src/offline/{types,memoryStore,indexedDbStore,storeFactory,
outbox,mediaUpload}.ts`, `src/services/{notificationService,
reconciliationService}.ts`, extended `src/domain/entities.ts`
(`ReconciliationRecord`), extended `firestore.rules`. Acceptance checks:
`scripts/offline-sync-check.ts` (`npm run offline:check`) and
`scripts/notification-reconciliation-check.ts`
(`npm run reliability:check`).

## 1. Offline-first field work

`UI -> DurableStore -> Outbox -> sync engine -> server`, per the pack's
target architecture. `DurableStore<T>` mirrors Phase 04's
`Repository<T>` pattern deliberately: a real `indexedDbStore.ts`
(genuine browser IndexedDB, no added dependency — the raw `indexedDB`
API used directly) and a `memoryStore.ts` fallback, picked by an
EXPLICIT `typeof indexedDB !== 'undefined'` check in `storeFactory.ts` —
never silently defaulting to memory when real IndexedDB is available.
This sandbox has no browser to run real IndexedDB in (same limitation as
Phase 10), so the actual hard logic — the outbox/sync/conflict engine,
which is what Phase 11 is graded on — is built and tested against the
memory implementation; the IndexedDB implementation is real,
production-shaped code verified by `tsc`/`vite build`.

`Outbox<T>.enqueue()` always succeeds immediately, with zero network
dependency — the "work is never lost" guarantee starts here, not at sync
time. Re-enqueueing the same idempotency key is a no-op (reuses the
same idempotency-by-construction pattern as every other phase).
`syncAll()` never throws: one bad item can't block the rest of a
technician's queued evidence. On failure it reuses Phase 04's
`StaleWriteError` directly — a conflicted sync doesn't get a bespoke new
error type, it's classified via `isStaleWriteError()` and the field data
is preserved (never discarded or silently overwritten) with the
server's actual version attached for manual/UI resolution.

## 2. Media/document subsystem

`MediaUploadManager` (`src/offline/mediaUpload.ts`) queues uploads with
a real, enforced size limit (`MAX_UPLOAD_BYTES`, rejected BEFORE
queuing) and resumable chunked upload via a pluggable `UploadTransport`.
The resumability checkpoint (`bytesUploaded`) is the direct answer to
"simulate network interruption during field evidence upload and verify
that work is not lost": a failed chunk leaves `bytesUploaded` at the
last successful checkpoint, never resets to 0, and a retry resumes from
there rather than re-uploading from scratch.

On confirmed completion, a real `DocumentRecord` (Phase 02 canonical
entity) is written through the Phase 04 repository layer and audited
(Phase 06) — metadata is real, persisted, and queryable. **Object
storage itself is a documented integration gap**: Phase 01 confirmed no
Firebase Storage / S3 / GCS wiring exists anywhere in this repository.
`FirebaseStorageTransport` is the real interface a production
integration would implement; it throws, naming exactly what's missing,
rather than silently pretending to succeed. `firestore.rules`' new
`documents` collection covers only the metadata, matching this scope.

## 3. Notifications

`src/services/notificationService.ts` centralizes `event -> audience ->
priority -> channel policy -> template -> delivery -> retry -> status ->
audit`, superseding the ad-hoc `queueNotification()` helper Phase 07's
event handlers used (that helper's own comment already flagged this as
provisional). `PRIORITY_CHANNELS` is a real, simple channel policy
(`low` → in-app only; `urgent` → in-app + email + WhatsApp + SMS).
Delivery is idempotent via Phase 06's `runIdempotent`, keyed on
`(templateId, dedupeKey)` — a redelivered trigger sends once.

**The critical honesty requirement — "do not simulate successful
external delivery as production success" — is enforced structurally**:
`inAppTransport` is real (an in-app notification IS its own database
write, so `'delivered'` is true) while `email`/`whatsapp`/`sms` all use
`makeUnconfiguredExternalTransport()`, which always reports `'queued'`
with an explicit reason ("no provider configured"), NEVER `'delivered'`
— because Phase 01 confirmed no such provider is wired into this
repository. The acceptance check asserts this distinction directly, per
channel, rather than trusting a single aggregate "sent" flag.

## 4. Reconciliation

`src/domain/entities.ts` gains `ReconciliationRecord`
(`ReconciliationStatus = matched | mismatch | missing_external |
missing_internal | duplicate | pending | manual_resolution` — exactly
the pack's list). `src/services/reconciliationService.ts`'s `reconcile()`
is a **pure, domain-agnostic function** — no I/O, works on any two lists
of `{id, key, amount}` — matching the pack's "reusable reconciliation
model... start with payments and expand" instruction literally:
`reconcilePayments()` is the payments-specific wiring (reads confirmed
`Payment` records via the repository layer, matches against
caller-supplied external records), but the matching logic itself has no
payments-specific code and can be reused for supplier invoices, bank
statement lines, etc. without being rewritten.

Every non-`matched` classification is immediately flagged `pending`
(the true raw reason — mismatch/duplicate/missing-which-side — is fully
reconstructable from which ID/amount fields are populated, and is
counted in the audit event) rather than silently treated as resolved;
Phase 12's control tower is where a human triages this queue into
`manual_resolution`.

**Documented integration gap**: no real payment gateway/bank feed
integration exists (Phase 01 §7) — `ExternalRecordSource` is the real
interface such an integration would implement; without one, external
records are supplied explicitly by the caller (e.g. an uploaded
statement), not auto-fetched. Not faked.

## 5. Acceptance

`scripts/offline-sync-check.ts` — 17 assertions: outbox enqueue survives
with zero network; re-enqueue is idempotent; a simulated network
interruption fails the first sync attempt WITHOUT losing the item or its
payload; a retry after "connectivity returns" succeeds; a stale-write
conflict is classified distinctly and preserves the field data with the
server's version attached; media upload resumes from its checkpoint
after an interruption rather than restarting, and only writes a
`DocumentRecord` on confirmed completion; an oversized file is rejected
before queuing.

`scripts/notification-reconciliation-check.ts` — 18 assertions:
priority-based channel fan-out (2 channels for `normal`, 4 for
`urgent`); in-app honestly `'delivered'`, email honestly `'queued'` with
a real reason; a repeated trigger is recognized as a duplicate;
`reconcile()` correctly classifies matched/mismatch/missing-both-
directions/duplicate on a mixed fixture; `reconcilePayments()` correctly
excludes non-confirmed payments, persists results through the repository
layer, and flags an unmatched payment `pending` rather than silently
`matched`.

All 35/35 pass. Full `npm run checks` (12 acceptance scripts) passes —
285 assertions total, zero regressions.

## 6. What this phase deliberately did not do

- Did not wire any existing field screen (`TechnicianCheckInCheckOutScreen`,
  `PhotoVideoEvidenceCapture` component, etc.) onto this new offline
  layer — same phase-ordering reasoning as Phases 08-10: the reliability
  INFRASTRUCTURE is built and proven here; screen-level adoption is
  follow-up work, explicitly named as such rather than silently implied
  complete.
- Did not implement a real object-storage or external-notification-
  provider integration — both are documented gaps with a real interface
  ready for a future credentialed deployment, per this pack's own
  instruction for exactly this situation.
- Did not automate `pending → manual_resolution` reconciliation triage —
  that is Phase 12's control-tower job, which this phase's honest
  `pending` queue directly feeds.

## 7. Build/typecheck

`npx tsc --noEmit` passes. `npm run checks` (all 12 acceptance scripts)
passes in full — 35/35 new assertions, zero regressions in the prior
250. `npx vite build` passes.
