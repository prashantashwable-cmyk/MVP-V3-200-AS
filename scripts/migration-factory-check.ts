/**
 * Phase 14 acceptance check: proves the migration factory itself works —
 * every screen classifiable, legacy usage measurable, no drift between
 * the migration registry's claims and what is actually on disk.
 *
 * Run with: npx tsx scripts/migration-factory-check.ts
 */

import { screenRegistry } from '../src/workflows/screenRegistry';
import { allMigrationRecords, getMigrationRecord, migrationSummary } from '../src/migration/registry';
import { scanAllSrcForDbManager, scanComponentDbManagerUsage } from './dbmanager-usage-scan';
import type { MigrationStatus } from '../src/migration/types';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`OK: ${msg}`);
}

const VALID_STATUSES: MigrationStatus[] = [
  'MIGRATED', 'PARTIALLY_MIGRATED', 'LEGACY', 'CONTEXTUAL', 'COMMAND_ONLY', 'CONTROL_ONLY', 'RETIRED',
];

function main() {
  // 1. Every one of the 189 screens gets a classifiable migration record.
  const records = allMigrationRecords();
  assert(screenRegistry.length === 189, `screen registry still has exactly 189 entries (found ${screenRegistry.length})`);
  const legacyRecords = records.filter(r => screenRegistry.some(s => s.screenId === r.screenId));
  assert(legacyRecords.length === 189, `all 189 legacy screens produce a migration record (found ${legacyRecords.length})`);
  for (const r of records) {
    assert(VALID_STATUSES.includes(r.status), `${r.screenId} has a valid MigrationStatus (got "${r.status}")`);
    assert(typeof r.targetDataSource === 'string' && r.targetDataSource.length > 0, `${r.screenId} has a non-empty targetDataSource`);
  }

  // 2. Legacy usage is measurable, live, from the real filesystem — not a stale snapshot.
  const allUsage = scanAllSrcForDbManager();
  assert(allUsage.length > 0, 'live DbManager usage scan finds real usage sites in src/');
  const componentUsage = scanComponentDbManagerUsage();
  assert(componentUsage.size > 0, 'live DbManager usage scan finds usage inside src/components/*.tsx specifically');
  const dbTsUsage = allUsage.find(u => u.file === 'src/lib/db.ts');
  assert(dbTsUsage === undefined, 'the scan excludes src/lib/db.ts itself (the definition, not a usage site)');

  // 3. No registry drift: a screen this registry claims is MIGRATED must
  // not still literally import DbManager on disk — the exact regression
  // guard rule #6 ("no new direct DbManager usage in migrated domains")
  // depends on, going forward.
  let driftCount = 0;
  for (const s of screenRegistry) {
    const rec = getMigrationRecord(s.screenId, s.dataSource);
    if (rec.status === 'MIGRATED') {
      const usage = componentUsage.get(s.screenId);
      if (usage?.importsDbManager) driftCount += 1;
    }
  }
  assert(driftCount === 0, `zero MIGRATED screens still import DbManager (found ${driftCount} drifted)`);

  // 4. The build is never blocked by legacy screens remaining — this
  // check only measures and reports, it never throws on LEGACY status by
  // itself, matching Phase 14's explicit acceptance criterion.
  const summary = migrationSummary();
  assert(summary.total === 189 + 2, `migration summary totals 189 legacy + 2 infrastructure screens (got ${summary.total})`);
  assert(summary.counts.LEGACY + summary.counts.CONTEXTUAL + summary.counts.PARTIALLY_MIGRATED + summary.counts.MIGRATED === 189,
    'every one of the 189 legacy screens falls into LEGACY/CONTEXTUAL/PARTIALLY_MIGRATED/MIGRATED');

  console.log(`\nPASS: migration factory classifies all 189 screens, measures real DbManager usage (${allUsage.length} files, ` +
    `${allUsage.reduce((s, r) => s + r.callCount, 0)} call sites), and has zero drift between claimed and actual migration status.`);
  console.log(`Current summary: ${JSON.stringify(summary.counts)}`);
}

main();
