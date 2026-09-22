/**
 * Migration status registry — Phase 14 ("screen migration factory").
 *
 * Single source of truth for where every screen actually stands in the
 * legacy → platform migration (Phases 14-30). Deliberately separate from
 * `src/workflows/screenRegistry.ts` (Phase 03's structural classification
 * of kind/surface/workflow, which does not change as migration proceeds):
 * this module tracks the one thing that DOES change phase over phase —
 * `MigrationStatus` — without requiring 189 hand-edited entries in the
 * generated Phase 03 file.
 *
 * Browser-safe: no `fs`, only imports the static `screenRegistry` data.
 * The live "does this file still literally import DbManager" check lives
 * in `scripts/dbmanager-usage-scan.ts` (Node-only) and is cross-checked
 * against this registry by `scripts/migration-factory-check.ts` so the
 * two can never silently drift (a screen marked MIGRATED here must not
 * still import DbManager on disk).
 */

import { screenRegistry } from '../workflows/screenRegistry';
import type { MigrationStatus, MigrationRecord } from './types';

/**
 * Explicit, hand-maintained overrides for every screen a later phase has
 * actually migrated (or deliberately reclassified). Anything NOT listed
 * here falls through to `defaultStatusFor()`, which derives an honest
 * default from the real Phase 01/03 `dataSource` finding — so a screen
 * this table has not touched yet is never silently reported as migrated.
 *
 * Populated phase-by-phase starting with Phase 15; see
 * docs/migration/screen-migration-matrix.md for the generated, complete
 * accounting and docs/aiec-implementation-log.md for which phase each
 * override was added in.
 */
export const migrationOverrides: Record<
  string,
  { status: MigrationStatus; targetDataSource: string; notes?: string }
> = {
  // Phase 15 — Commercial Core. Each of these screens keeps its
  // DbManager write as the authoritative source for its own rendering
  // (a full cutover risks breaking complex UI this sandbox cannot
  // visually re-verify without a browser — see docs/architecture/
  // 15-commercial-core.md §1) but now ALSO mirrors the real business
  // event into the canonical repository/domain-service/event-bus stack
  // via src/services/legacyCommercialBridge.ts — audited, idempotent,
  // and visible to the control tower/search/data-quality checks. Hence
  // PARTIALLY_MIGRATED, not MIGRATED: honest about what still reads from
  // DbManager vs. what is now real dual-write.
  OnlinePaymentCheckout: {
    status: 'PARTIALLY_MIGRATED',
    targetDataSource: 'src/services/legacyCommercialBridge.ts → src/services/commercialWorkflow.ts (collectInstallment) → src/repository (Payment)',
    notes: 'Phase 15: a confirmed checkout now also records a real, idempotent canonical Payment via the bridge. DbManager.updatePayment remains this screen\'s own read/render path.',
  },
  PaymentCollectionDashboard: {
    status: 'PARTIALLY_MIGRATED',
    targetDataSource: 'src/services/legacyCommercialBridge.ts → src/services/commercialWorkflow.ts (collectInstallment) → src/repository (Payment)',
    notes: 'Phase 15: "mark paid"/"partial" now also records a real canonical Payment via the bridge. Dispute/pause/resume remain DbManager-only status flags (no canonical equivalent yet). List/detail rendering remains DbManager-sourced.',
  },
  LeadKanban: {
    status: 'PARTIALLY_MIGRATED',
    targetDataSource: 'src/services/legacyCommercialBridge.ts → src/services/commercialWorkflow.ts (createQuote/approveQuote/sendQuote/recordCustomerQuoteDecision) → src/repository (Project/Quote/Contract)',
    notes: 'Phase 15: dragging a card to "quoted" now also creates+approves+sends a real canonical Quote; to "closed_won" now also records customer acceptance, which the real Phase 07 event bus turns into a drafted canonical Contract. Board rendering remains DbManager-sourced.',
  },
  LeadDetail: {
    status: 'PARTIALLY_MIGRATED',
    targetDataSource: 'src/services/legacyCommercialBridge.ts → src/services/commercialWorkflow.ts (createQuote/.../recordCustomerQuoteDecision) → src/repository (Project/Quote/Contract)',
    notes: 'Phase 15: "Create Quotation" and moving a lead to "closed_won" now also drive the real canonical Quote/Contract lifecycle via the bridge, same as LeadKanban. Detail/timeline rendering remains DbManager-sourced.',
  },

  // Phase 16 — Procurement. Same dual-write pattern as Phase 15.
  PurchaseOrderGenerator: {
    status: 'PARTIALLY_MIGRATED',
    targetDataSource: 'src/services/legacyCommercialBridge.ts → src/services/commercialWorkflow.ts (createProcurementPO/approvePO) → src/repository (PurchaseOrder)',
    notes: 'Phase 16: drafting a PO and sending it to a supplier now also create/approve a real, idempotent canonical PurchaseOrder linked to the project. Split-PO and line-item editing remain DbManager-only. List/detail rendering remains DbManager-sourced.',
  },
  SupplierOrderStatusTracking: {
    status: 'PARTIALLY_MIGRATED',
    targetDataSource: 'src/services/legacyCommercialBridge.ts → src/services/commercialWorkflow.ts (recordSupplierAcceptance/markInProduction/dispatchMaterial) → src/repository (PurchaseOrder)',
    notes: 'Phase 16: updating a PO to Acknowledged/In Production/Shipped now also drives the matching real canonical PurchaseOrder transition (dispatch also advances the canonical Project to the delivery stage). Ready to Ship/Delivered/Cancelled have no canonical bridge yet (Delivered is Phase 17 scope). List/detail rendering remains DbManager-sourced.',
  },
};

function defaultStatusFor(dataSource: string): MigrationStatus {
  if (dataSource.startsWith('DbManager')) return 'LEGACY';
  if (dataSource === 'localStorage') return 'LEGACY';
  // A screen that already talks to Firestore directly (bypassing the
  // repository/domain-service layer) is further along than pure
  // DbManager, but is exactly the "direct Firestore calls into random
  // components" anti-pattern rule #8 forbids introducing more of — never
  // treated as fully MIGRATED until it goes through the repository layer.
  if (dataSource === 'Firestore') return 'PARTIALLY_MIGRATED';
  if (dataSource === 'props-only/none-detected') return 'CONTEXTUAL';
  return 'LEGACY';
}

export function getMigrationRecord(screenId: string, dataSource: string): MigrationRecord {
  const override = migrationOverrides[screenId];
  if (override) {
    return {
      screenId,
      status: override.status,
      targetDataSource: override.targetDataSource,
      notes: override.notes,
    };
  }
  return {
    screenId,
    status: defaultStatusFor(dataSource),
    targetDataSource: 'src/repository (Firestore/demo) via a domain service in src/services/',
  };
}

/**
 * Real infrastructure screens added by Phases 10-12 that are NOT part of
 * the original 189 (`src/workflows/screenRegistry.ts`) — they never had a
 * DbManager phase to migrate away from. Listed here so the matrix's
 * accounting of the running application is complete, not just the legacy
 * inventory.
 */
export const infrastructureScreens: MigrationRecord[] = [
  {
    screenId: 'CommandPalette',
    status: 'COMMAND_ONLY',
    targetDataSource: 'src/navigation/entitySearchProvider.ts (repository-backed live search)',
    notes: 'Phase 10/12: Ctrl/Cmd+K global palette; not a navigable screen of its own.',
  },
  {
    screenId: 'EnvironmentBadge',
    status: 'CONTROL_ONLY',
    targetDataSource: 'src/lib/environment.ts (build-time AppEnvironment flag, no persistence)',
    notes: 'Phase 12: renders demo/sandbox/production; no business workflow.',
  },
];

export function allMigrationRecords(): MigrationRecord[] {
  return [...screenRegistry.map(s => getMigrationRecord(s.screenId, s.dataSource)), ...infrastructureScreens];
}

export function migrationSummary(): { total: number; counts: Record<MigrationStatus, number> } {
  const records = allMigrationRecords();
  const counts = {
    MIGRATED: 0,
    PARTIALLY_MIGRATED: 0,
    LEGACY: 0,
    CONTEXTUAL: 0,
    COMMAND_ONLY: 0,
    CONTROL_ONLY: 0,
    RETIRED: 0,
  } as Record<MigrationStatus, number>;
  for (const r of records) counts[r.status] += 1;
  return { total: records.length, counts };
}
