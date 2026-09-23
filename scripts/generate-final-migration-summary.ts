/**
 * Phase 30 — generates docs/migration/final-migration-summary.json.
 *
 * "Also produce a final machine-readable migration summary if
 * practical." One JSON file, computed live from the same real sources
 * every other report in this pack reuses (never hand-typed), suitable
 * for a dashboard or a future phase to consume programmatically.
 *
 *   npx tsx scripts/generate-final-migration-summary.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRows } from './generate-migration-matrix';
import { scanAllSrcForDbManager } from './dbmanager-usage-scan';
import { migrationSummary } from '../src/migration/registry';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(REPO_ROOT, 'docs/migration/final-migration-summary.json');

function main() {
  const rows = buildRows();
  const summary = migrationSummary();
  const dbUsage = scanAllSrcForDbManager();

  const byEntity: Record<string, { total: number; migrated: number; partiallyMigrated: number; legacy: number; contextual: number }> = {};
  for (const r of rows) {
    if (!byEntity[r.entity]) byEntity[r.entity] = { total: 0, migrated: 0, partiallyMigrated: 0, legacy: 0, contextual: 0 };
    byEntity[r.entity].total++;
    if (r.migrationStatus === 'MIGRATED') byEntity[r.entity].migrated++;
    if (r.migrationStatus === 'PARTIALLY_MIGRATED') byEntity[r.entity].partiallyMigrated++;
    if (r.migrationStatus === 'LEGACY') byEntity[r.entity].legacy++;
    if (r.migrationStatus === 'CONTEXTUAL') byEntity[r.entity].contextual++;
  }

  const out = {
    generatedAt: new Date().toISOString(),
    generator: 'scripts/generate-final-migration-summary.ts',
    screens: {
      total: summary.total,
      byStatus: summary.counts,
    },
    dbManagerUsage: {
      filesReferencing: dbUsage.length,
      totalCallSites: dbUsage.reduce((s, u) => s + u.callCount, 0),
    },
    authorization: {
      serverEnforcedScreens: rows.filter(r => r.authorizationStatus.startsWith('server-enforced')).length,
      clientOnlyScreens: rows.filter(r => r.authorizationStatus.startsWith('client-only')).length,
    },
    byEntity,
    phasesCompleted: Array.from({ length: 29 - 14 + 1 }, (_, i) => 14 + i),
    domainsFullyMigrated: [],
    domainsPartiallyMigrated: [
      'Commercial Core (Lead→Quote→Contract→Payment) — Phase 15',
      'Procurement (PO→Approval→Supplier Acceptance→Production→Dispatch) — Phase 16',
      'Delivery (Schedule→Arrival→Receipt, incl. damaged/missing) — Phase 17',
      'Installation + QC (pass path) + Handover — Phase 18',
    ],
    knownGaps: [
      'QC FAIL/Snag/Rework loop has no legacy-screen bridge (Phase 18 §3) — exercised directly via the canonical service layer in Phase 29\'s simulation',
      'Negotiation stage has no legacy-screen bridge (Phase 29 §3)',
      'No canonical ServiceCase entity exists (Phase 29 §3)',
      'Server-side request authentication (server.ts) has no middleware — needs firebase-admin + real credentials',
      'No live Firestore credentials in this sandbox — repository layer verified structurally/via demo mode only',
    ],
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Wrote ${OUT_FILE}`);
}

main();
