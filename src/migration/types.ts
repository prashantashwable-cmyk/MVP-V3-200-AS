/**
 * Screen migration factory — Phase 14.
 *
 * The pack's own required vocabulary for classifying every screen's
 * migration state, used by `src/migration/registry.ts`,
 * `scripts/generate-migration-matrix.ts`, and
 * `docs/migration/screen-migration-matrix.md`.
 */

export type MigrationStatus =
  | 'MIGRATED' // fully reads/writes through the repository/domain-service layer; no DbManager persistence remains
  | 'PARTIALLY_MIGRATED' // some paths go through the new layer, others (or a direct Firestore call) do not yet
  | 'LEGACY' // reads/writes exclusively through DbManager (or raw localStorage) today
  | 'CONTEXTUAL' // no owned data source of its own; renders/acts on data passed in by a parent screen
  | 'COMMAND_ONLY' // reachable only via the command palette / a keyboard-driven action, not a navigable screen
  | 'CONTROL_ONLY' // admin/control-surface chrome (badges, banners) with no business workflow of its own
  | 'RETIRED'; // no longer reachable from any router/tab and not scheduled to be — candidate for deletion

export interface MigrationRecord {
  screenId: string;
  status: MigrationStatus;
  /** Where this screen's data SHOULD come from once migration is complete. */
  targetDataSource: string;
  notes?: string;
}

/** A single row of docs/migration/screen-migration-matrix.md. */
export interface MigrationMatrixRow {
  screen: string;
  role: string;
  surface: string;
  workflow: string;
  entity: string;
  currentDataSource: string;
  targetDataSource: string;
  migrationStatus: MigrationStatus;
  authorizationStatus: string;
  testStatus: string;
  remainingRisk: string;
}
