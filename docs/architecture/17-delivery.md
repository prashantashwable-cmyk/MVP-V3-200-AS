# Phase 17 — Migrate Delivery

Same dual-write pattern as Phases 15-16, applied to Delivery: `Ready for
Delivery → Schedule → Dispatch/Live Tracking → Arrived → Site Delivery
Checklist → Material Verification → Receipt`, with the `Damaged/Missing →
Incident → Supplier Resolution` exception path.

## 1. What was added

`src/services/legacyCommercialBridge.ts` gained three functions, all
keyed off the same legacy PO id the Phase 16 procurement bridge already
derives a canonical `PurchaseOrder`/`Project` from — no new Lead/Deal
resolution needed:

- **`bridgeDeliveryScheduled(actor, legacyPoId)`** — real canonical
  `Shipment` in `'scheduled'` status (`operationsWorkflow.scheduleDelivery`).
  Requires the PO to already be bridged (Phase 16); reports that honestly
  if not, rather than fabricating a PO.
- **`bridgeShipmentArrived(actor, legacyPoId)`** — canonical `Shipment`
  `'arrived'` (`markShipmentArrived`).
- **`bridgeMaterialReceiptRecorded(actor, legacyPoId, condition)`** — real
  canonical `DeliveryReceipt`. `condition: 'ok'` publishes the real
  `MATERIAL_RECEIVED` event; `'damaged'`/`'missing_items'` records an
  audited incident instead — Phase 09's already-built damaged/missing
  exception path (`DeliveryReceipt.incidentId`), exercised end-to-end by
  a real legacy screen for the first time in this pack.

All three are idempotent (checked against the existing Shipment/Receipt
before writing) and never throw out to the caller, matching Phases 15-16.

## 2. Screens wired

| Screen | Business action bridged |
|---|---|
| `DeliverySchedulingScreen.tsx` | Lock delivery schedule + assign technician (`handleConfirmScheduleLock`) |
| `LiveShipmentTrackingScreen.tsx` | Milestone advanced to `'arrived'` (`handleAdvanceMilestone`) |
| `SiteDeliveryChecklistScreen.tsx` | Checklist completed (`handleCompleteChecklist`) — this is also the exact screen that sets the legacy PO to `'Delivered'`, closing the gap Phase 16 §3 explicitly deferred |

## 3. What was NOT bridged this phase, and why

- **`DamagedMissingPartsReportScreen.tsx`** remains `LEGACY`. It is a
  more detailed, supplementary damage-claim/resolution screen (fault
  attribution, resolution status, admin review) that typically follows
  the checklist's initial discrepancy flag, not the primary "material
  received" moment itself — that moment is already bridged via
  `SiteDeliveryChecklistScreen`. There is also no canonical `Incident`
  entity to attach a richer claim workflow to (Phase 02's domain model
  deliberately did not define one — Phase 09's own doc says so); a
  `DeliveryReceipt.incidentId` anchor exists, but building a full
  supplier-resolution sub-workflow on top of it is real, separate scope,
  not silently skipped.
- Site-readiness checklist confirmation (`DeliverySchedulingScreen`'s
  `handleUpdateChecklistState`, before the schedule lock) and reschedule
  (`handleSaveReschedule`) remain DbManager-only — neither has a
  canonical equivalent operation.
- `DeliveryAnalyticsScreen.tsx`, `DeliveryDelayAlertEscalationScreen.tsx`,
  `DeliveryPartnerManagementScreen.tsx`, `DeliverySopConfigScreen.tsx`
  remain `LEGACY` — reporting/configuration screens, not the delivery
  workflow's own state transitions.

## 4. Regression test

`scripts/delivery-bridge-check.ts` (`npm run delivery-bridge:check`,
wired into `npm run checks`) — 15 assertions against real legacy Lead/
Deal/PurchaseOrder fixtures: an honest non-bridge for a delivery
scheduled against a PO that was never created through the Phase 16
bridge, schedule → real Shipment (correct status, correctly linked
Project), idempotent re-scheduling, arrival, a clean receipt (no
incident id, real `MATERIAL_RECEIVED` path), idempotent re-completion,
and — on a second, separate PO/project — the damaged exception path
producing a receipt with a real incident id.

## 5. Acceptance

- `npx tsc --noEmit` — pass.
- `npm run delivery-bridge:check` — pass, 15/15 assertions.
- `npm run checks` (all 19 scripts) — pass, zero regressions in the prior
  370 assertions.
- `npm run build` — pass.
- Matrix regenerated: 10 `PARTIALLY_MIGRATED` (up from 7), 146 `LEGACY`
  (down from 149), zero registry drift.

## 6. Known limitations

- Same dual-write caveat as Phases 15-16 (not a distributed transaction).
- The damaged/missing exception path stops at "an audited incident
  exists" (Phase 09's own scope) — no automated supplier-resolution
  sub-workflow exists yet to close the loop back to `receipt`/
  `reconciliation_payable` in `procurement.ts`'s state machine.
- `bridgeMaterialReceiptRecorded`'s idempotency check only prevents a
  duplicate receipt for the SAME condition path being re-run; it does
  not handle a legacy screen somehow recording an `'ok'` receipt and then
  a later `'damaged'` one for the same PO (the legacy UI has no such
  flow today, so this was not built defensively against a case that
  cannot currently occur).

## 7. Next phase

Phase 18 — Migrate Installation + QC + Handover.
