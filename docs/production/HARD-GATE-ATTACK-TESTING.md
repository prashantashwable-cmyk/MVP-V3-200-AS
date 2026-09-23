# Hard-Gate Attack Testing (Phase 52)

**Date:** 2026-09-23
**HEAD at generation:** `759e6da` (Phase 51)

## Method

Every attack in this phase is executed by calling the real domain/service
functions (`src/services/operationsWorkflow.ts`,
`src/services/commercialWorkflow.ts`) **directly**, bypassing the UI
entirely — this IS the "direct repository/service invocation bypassing
UI" attack category itself. No live Firestore credential is needed: this
tests whether THIS APPLICATION'S OWN CODE enforces its hard gates at the
authoritative layer, per the documented architecture (UI → domain/service
layer → workflow/policy layer → repository → canonical persistence). New
script: `scripts/hard-gate-attack-test.ts`, wired into `npm run checks`.

## Attack results

| # | Attack | Result |
|---|---|---|
| 1a | Check in without confirmed site readiness | **BLOCKED** |
| 1b | Complete installation with no check-in ever recorded | **BLOCKED** |
| 1c | Complete installation after check-in but without evidence capture | **BLOCKED** |
| 2 | Confirm handover compliance with no QC pass at all | **BLOCKED** |
| — | CONTROL: confirmCompliance succeeds once a real QC pass exists | **PASS** (proves the gate is a real conditional, not a permanently-closed door) |
| 3 | Issue handover certificate without customer acceptance | **BLOCKED** |
| 4a | Customer role calls `confirmCompliance` (handover.approve) | **BLOCKED** |
| 4b | Customer role calls `recordQCResult` (qc.approve) | **BLOCKED** |
| 4c | Technician records customer acceptance on the customer's behalf | **BLOCKED** |
| 5a | Supplier role approves their own PO (po.approve) | **BLOCKED** |
| 5b | Customer role approves a purchase order | **BLOCKED** |
| 6 | Create a purchase order for a project with NO payment ever recorded | **Found a REAL gap — fixed this phase, then BLOCKED** |
| — | CONTROL: createProcurementPO succeeds once a real payment exists | **PASS** |
| 7 | Assign an installation job with no prior DeliveryReceipt | Investigated, **reclassified as NOT a gap** (see below) |

**12 of 12 final assertions pass** (`npx tsx scripts/hard-gate-attack-test.ts`).

## Real gap found and fixed this phase: Attack 6

`createProcurementPO()` (`src/services/commercialWorkflow.ts`) checked
only the acting role's permission (`supplier.manage`) — it had **no
precondition that any payment had ever been recorded for the project**.
An admin-permission actor could create a real `PurchaseOrder` for a
project that never received a single payment, contradicting the
lifecycle ordering `collectInstallment()`'s own existing comment already
documented ("payment -> procurement is this pack's canonical lifecycle
ordering") but never actually enforced.

**Fix** (`src/services/commercialWorkflow.ts`):

```diff
+/** Hard gate (Phase 52 — a real gap found by direct attack testing and
+ * closed here): procurement must not begin before the customer has
+ * actually paid anything. ...
 export async function createProcurementPO(
   ctx: RepositoryContext,
   actor: Actor,
   projectId: string,
   supplierId: string,
   amount: number,
   idempotencyKey: string,
 ): Promise<{ po: PurchaseOrder; wasDuplicate: boolean }> {
   assertPermission(actorAsUser(actor), 'supplier.manage');
+  const priorPayments = await paymentRepository(ctx).query({ projectId: projectId as ProjectId });
+  if (priorPayments.length === 0) {
+    throw new Error('Cannot create a purchase order: no payment has been recorded for this project yet. This is a hard gate (Phase 52) — procurement cannot begin before the customer has paid.');
+  }
   const { purchaseOrder, wasDuplicate } = await createPurchaseOrderIdempotent(ctx, {
```

Checked against real **payment records** (not `project.stage`, which a
LATER PO for an already-procuring project should not be blocked by) —
deliberately more robust than a stage-equality check.

**Regression sweep performed before considering this done**: re-ran the
full `npm run checks` pipeline. The new gate correctly broke **6
existing acceptance scripts** whose test fixtures created a PO without
first bridging a real payment (a pre-existing test-setup gap the new
gate correctly exposed, not a flaw in the gate itself):
`scripts/procurement-bridge-check.ts`,
`scripts/delivery-bridge-check.ts`,
`scripts/installation-qc-handover-bridge-check.ts`,
`scripts/project-operating-view-check.ts`,
`scripts/work-queue-check.ts`,
`scripts/global-search-check.ts`. Each was fixed the CORRECT way — by
bridging a real payment via `bridgeLegacyPaymentConfirmed()` before PO
creation, matching the actual, already-proven-correct lifecycle order
`scripts/full-company-simulation.ts` (Phase 29) uses — never by
weakening the new gate. **Full `npm run checks` now passes end to end,
zero regressions**, confirmed by a complete clean run after all 6 fixes.

## Investigated and corrected: Attack 7 is NOT a gap

`assignInstallationJob()` has no precondition requiring a
`DeliveryReceipt` to exist first. Initially this looked like a parallel
gap to Attack 6 ("procurement completion without receipt"). **Cross-
checking against `scripts/full-company-simulation.ts`'s own real,
already-passing, deliberately-designed call order disproved this**:
`bridgeDeliveryScheduled` (which creates the `InstallationJob` and
assigns the technician) is called BEFORE `bridgeMaterialReceiptRecorded`
in that proven-correct simulation — matching real-world logistics
(scheduling delivery and assigning an installer can legitimately happen
while material is still in transit, not strictly after receipt).
Reporting this as a gap would have been a false positive; it is recorded
here, corrected, rather than published uncritically — the same
discipline Phase 48/49 applied to their own false-positive signal check.

## Attacks not applicable to this architecture

- **Direct URL access to a restricted stage**: N/A, per Phase 46's
  confirmed finding — this app has no client-side URL router at all
  (single route `/`, `CustomEvent`-based tab switching). There is no URL
  to navigate to restrict.
- **Unauthorized role state transition**: covered by attacks 4/5 above
  (every role-gated transition attempted by an unauthorized role was
  blocked).

## Summary

Every genuine identity/workflow-state hard gate this phase attempted to
attack (installation readiness, check-in, evidence capture, QC pass,
customer acceptance, role-based approval authority) was **already
correctly enforced** at the authoritative service layer, verified by
direct, UI-bypassing invocation — not merely hidden in the UI. One real,
previously-unenforced sequencing gap (payment-before-procurement) was
found, fixed with a narrowly-scoped, verified change, and confirmed
against a full, zero-regression `npm run checks` run. One initially-
suspected gap was investigated and honestly reclassified as correct,
intended behavior rather than published as a false positive.
