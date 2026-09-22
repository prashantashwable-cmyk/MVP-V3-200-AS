# Phase 16 — Migrate Procurement

Same dual-write "strangler fig" pattern as Phase 15, applied to
Procurement: `Project Need → Supplier/RFQ → PO → Approval → Supplier
Acceptance → Production → Ready for Dispatch`.

## 1. What was added

- **`src/services/commercialWorkflow.ts`**: added `markInProduction()` —
  the one canonical transition missing between `recordSupplierAcceptance`
  and `dispatchMaterial` (the legacy PO lifecycle has an explicit "In
  Production" status; the canonical `PurchaseOrderStatus` enum already
  had `'in_production'` defined since Phase 02 but no service function
  set it). Deliberately the same lightweight shape as the two existing
  neighboring functions (no `assertPermission` call) rather than
  introducing an inconsistent permission model piecemeal on only one of
  the three post-approval transitions.
- **`src/services/legacyCommercialBridge.ts`**: added
  `bridgeProcurementPoCreated()` (legacy PO draft → real, idempotent
  canonical `PurchaseOrder`, linked to the same canonical Project the
  Lead/Deal already resolve to via Phase 15's `ensureCanonicalProject`)
  and `bridgeProcurementPoStatusChanged()` (legacy status string →
  canonical transition: `'Sent'` → `approvePO`, `'Acknowledged'` →
  `recordSupplierAcceptance`, `'In Production'` → `markInProduction`,
  `'Shipped'` → `dispatchMaterial`, which also advances the canonical
  Project to the `delivery` stage). A canonical PO id is derived
  deterministically from the legacy PO's own id
  (`po_<legacyPoId>`) — no separate id-mapping table needed.

## 2. Screens wired

| Screen | Business action bridged |
|---|---|
| `PurchaseOrderGenerator.tsx` | Auto-draft PO from a closed deal (`handleDraftPoFromDeal`); "Send to Supplier" (`handleSendPoToSupplier`) |
| `SupplierOrderStatusTracking.tsx` | Generic PO status update (`handleUpdatePOStatus`) — routes to the matching canonical transition for `Acknowledged`/`In Production`/`Shipped` |

Both, same as Phase 15: a small, additive, non-blocking `.then()` call
right after the existing `DbManager.addPurchaseOrder`/`updatePurchaseOrder`
write — no JSX/state/control-flow restructured.

## 3. What was NOT bridged this phase, and why

- **`'Ready to Ship'`, `'Delivered'`, `'Cancelled'`** legacy PO statuses
  have no canonical bridge yet. `'Delivered'` belongs to Phase 17's
  Delivery workflow migration (`DeliveryReceipt`, not `PurchaseOrder`, is
  the canonical record for "material received" — Phase 09 already built
  that transition in `operationsWorkflow.ts`). `bridgeProcurementPoStatusChanged`
  reports these honestly (`{bridged: false, reason: 'no bridge defined
  yet for PO status "..."'}`), never silently drops them.
- **Split-PO** (`handleConfirmSplitPo`) and **line-item editing**
  (`handleSaveEditorChanges`) in `PurchaseOrderGenerator.tsx` remain
  DbManager-only — they mutate an already-bridged PO's line items/notes,
  not its lifecycle stage; no canonical equivalent exists for a "split a
  PO into two supplier POs" operation, and inventing one without a named
  requirement would be scope creep, not migration.
- `SupplierCatalogPricing.tsx`, `SupplierDirectory.tsx`,
  `SupplierOnboarding.tsx`, `ManufacturerProductionStatus.tsx` and the
  ~15 supplier-payment/dispute/scorecard screens the matrix lists remain
  `LEGACY` — real, but this phase targeted the exact
  `PO → Approval → Supplier Acceptance → Production → Dispatch` spine
  the acceptance criterion names first.

## 4. Regression test

`scripts/procurement-bridge-check.ts` (`npm run procurement-bridge:check`,
wired into `npm run checks`) — 17 assertions against a real legacy
Lead/Deal/PurchaseOrder fixture: draft → real canonical PO (linked to the
right Project, correct amount), idempotent redraft, the full
`Sent → Acknowledged → In Production → Shipped` transition chain each
independently verified against the stored canonical status, dispatch
advancing the canonical Project to `delivery`, an honest non-bridge for
`'Delivered'`, a soft failure for a status change on a PO never bridged
at creation, and an unauthorized-role (`supplier`) denial on PO drafting.

## 5. Acceptance

- `npx tsc --noEmit` — pass.
- `npm run procurement-bridge:check` — pass, 17/17 assertions.
- `npm run checks` (all 18 scripts) — pass, zero regressions in the prior
  353 assertions.
- `npm run build` — pass.
- Matrix regenerated: 7 `PARTIALLY_MIGRATED` (up from 5), 149 `LEGACY`
  (down from 151), zero registry drift.

## 6. Known limitations

- Same dual-write caveat as Phase 15 §7: not a distributed transaction;
  each bridged step is independently idempotent/re-enterable, not
  atomic with its legacy counterpart.
- `markInProduction`/`recordSupplierAcceptance`/`dispatchMaterial` still
  have no `assertPermission` call (a pre-existing Phase 08 gap, not
  introduced or fixed here) — anyone able to call these functions at all
  can move a PO through this part of its lifecycle; Phase 23's security
  hardening pass is the right place to close this, not a piecemeal fix on
  one function in this phase.
- `bridgeProcurementPoCreated` assumes `legacyPo.supplierId` is already a
  valid identifier (no cross-check against a canonical `Supplier` record
  — the canonical `Supplier` entity has no repository accessor yet; out
  of this phase's scope).

## 7. Next phase

Phase 17 — Migrate Delivery (Ready for Delivery → Schedule → Dispatch →
Live Tracking → Arrived → Site Delivery Checklist → Material
Verification → Receipt, with the Damaged/Missing → Incident → Supplier
Resolution exception path).
