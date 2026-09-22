/**
 * Phase 14 — generates docs/migration/screen-migration-matrix.md from the
 * real Phase 03 screen registry, the Phase 14 migration status registry,
 * and a live DbManager usage scan — not hand-curated, so it can be
 * re-run after every later phase's screen migrations to stay accurate.
 *
 *   npx tsx scripts/generate-migration-matrix.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenRegistry } from '../src/workflows/screenRegistry';
import { getMigrationRecord, infrastructureScreens, migrationSummary } from '../src/migration/registry';
import { scanComponentDbManagerUsage } from './dbmanager-usage-scan';
import type { MigrationMatrixRow } from '../src/migration/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(REPO_ROOT, 'docs/migration/screen-migration-matrix.md');

/** Collections with real, phase-04-through-12 Firestore rules enforcing
 * server-side authorization (see firestore.rules §§4-12). Kept as an
 * explicit list here (not parsed from the rules file) because the
 * mapping from "entity name" to "collection name" is a judgment call the
 * rules file itself does not state machine-readably. */
const SERVER_ENFORCED_COLLECTIONS = new Set([
  'customers', 'sites', 'projects', 'quotes', 'quote_versions', 'contracts_v2',
  'payment_schedules', 'payments', 'purchase_orders', 'idempotency_keys',
  'workflow_instances', 'workflow_executions', 'snags', 'notifications',
  'handovers', 'qc_inspections', 'shipments', 'delivery_receipts',
  'installation_jobs', 'warranties', 'documents', 'reconciliation_records',
  'observability_events', 'audit_logs', 'users',
]);

/** Screen-name keyword → (entity label, collection name for the
 * authorization-status lookup above). First match wins; order matters. */
const ENTITY_KEYWORDS: Array<[RegExp, string, string | undefined]> = [
  [/lead/i, 'Lead', undefined], // legacy `leads` collection — real rules, but pre-dates the canonical Customer/Site/Project model
  [/customer/i, 'Customer', 'customers'],
  [/site/i, 'Site', 'sites'],
  [/project/i, 'Project', 'projects'],
  [/quote/i, 'Quote', 'quotes'],
  [/negotiat|objection/i, 'Quote (negotiation)', 'quotes'],
  [/contract/i, 'Contract', 'contracts_v2'],
  [/payment|installment|invoice|payout|checkout/i, 'Payment', 'payments'],
  [/supplier/i, 'Supplier', undefined],
  [/purchaseorder|^po[a-z]|procurement/i, 'PurchaseOrder', 'purchase_orders'],
  [/production/i, 'ProductionOrder', undefined],
  [/shipment|dispatch|tracking/i, 'Shipment', 'shipments'],
  [/delivery/i, 'DeliveryReceipt', 'delivery_receipts'],
  [/installation|jobbrief|checkin|sop/i, 'InstallationJob', 'installation_jobs'],
  [/\bqc\b|qualitycheck|inspection|snag/i, 'QCInspection', 'qc_inspections'],
  [/handover|walkthrough/i, 'Handover', 'handovers'],
  [/warrant/i, 'Warranty', 'warranties'],
  [/\bamc\b/i, 'AMC', undefined],
  [/service|ticket|complaint/i, 'ServiceCase', undefined],
  [/document|vault/i, 'Document', 'documents'],
  [/notification|alert/i, 'Notification', 'notifications'],
  [/approv/i, 'ApprovalRequest', undefined],
  [/audit/i, 'AuditEvent', 'audit_logs'],
  [/user|role|permission|team/i, 'User', 'users'],
];

function inferEntity(screenId: string): { entity: string; collection?: string } {
  for (const [re, entity, collection] of ENTITY_KEYWORDS) {
    if (re.test(screenId)) return { entity, collection };
  }
  return { entity: 'N/A / cross-cutting', collection: undefined };
}

function authorizationStatus(collection: string | undefined): string {
  if (!collection) return 'client-only (authz.ts UI convenience; no dedicated server rule)';
  if (SERVER_ENFORCED_COLLECTIONS.has(collection)) return `server-enforced (firestore.rules: ${collection})`;
  return 'client-only (authz.ts UI convenience; no dedicated server rule)';
}

/** Entities the Phase 13 end-to-end suite (or a Phase 08/09 orchestration
 * check) actually exercises with real assertions. */
const E2E_COVERED_ENTITIES = new Set([
  'Lead', 'Customer', 'Site', 'Project', 'Quote', 'Quote (negotiation)', 'Contract', 'Payment',
  'PurchaseOrder', 'Shipment', 'DeliveryReceipt', 'InstallationJob', 'QCInspection', 'Handover',
  'Warranty', 'AuditEvent', 'User',
]);

function testStatus(status: string, entity: string): string {
  if (status === 'MIGRATED' || status === 'PARTIALLY_MIGRATED') {
    return E2E_COVERED_ENTITIES.has(entity)
      ? 'covered (npm run e2e:check / commercial:check / operations:check)'
      : 'screen migrated but not yet in a scripted regression check — add one before further changes';
  }
  return 'none (legacy screen; not yet migrated)';
}

function remainingRisk(status: string, importsDbManagerLive: boolean, collection: string | undefined): string {
  if (status === 'MIGRATED') {
    return importsDbManagerLive
      ? 'DRIFT: registry says MIGRATED but file still imports DbManager — investigate immediately'
      : 'low — server-enforced' + (collection ? '' : ' pending a dedicated Firestore rule for this entity');
  }
  if (status === 'PARTIALLY_MIGRATED') return 'medium — some paths still bypass the repository/domain-service layer';
  if (status === 'LEGACY') return collection
    ? 'high — client-only authorization; real server rules exist for this entity once migrated'
    : 'high — client-only authorization; no server-side enforcement for this entity at all yet';
  if (status === 'CONTEXTUAL') return 'low — no owned data source; risk lives in whichever screen supplies its data';
  return 'none';
}

function buildRows(): MigrationMatrixRow[] {
  const dbUsage = scanComponentDbManagerUsage();
  const rows: MigrationMatrixRow[] = screenRegistry.map(s => {
    const rec = getMigrationRecord(s.screenId, s.dataSource);
    const { entity, collection } = inferEntity(s.screenId);
    const usage = dbUsage.get(s.screenId);
    return {
      screen: s.screenId,
      role: s.roles.join(', '),
      surface: s.surface,
      workflow: s.workflow ? `${s.workflow}${s.stage ? ` (${s.stage})` : ''}` : '—',
      entity,
      currentDataSource: s.dataSource,
      targetDataSource: rec.targetDataSource,
      migrationStatus: rec.status,
      authorizationStatus: authorizationStatus(collection),
      testStatus: testStatus(rec.status, entity),
      remainingRisk: remainingRisk(rec.status, usage?.importsDbManager ?? false, collection),
    };
  });
  for (const infra of infrastructureScreens) {
    rows.push({
      screen: infra.screenId,
      role: 'all',
      surface: '—',
      workflow: '—',
      entity: 'N/A / infrastructure',
      currentDataSource: infra.targetDataSource,
      targetDataSource: infra.targetDataSource,
      migrationStatus: infra.status,
      authorizationStatus: 'n/a',
      testStatus: 'covered (surfaces:check / controltower:check)',
      remainingRisk: 'none',
    });
  }
  return rows.sort((a, b) => a.screen.localeCompare(b.screen));
}

function renderMarkdown(rows: MigrationMatrixRow[]): string {
  const summary = migrationSummary();
  const lines: string[] = [];
  lines.push('# Screen Migration Matrix');
  lines.push('');
  lines.push('Generated by `scripts/generate-migration-matrix.ts` — do not hand-edit.');
  lines.push('Re-run after any migration change: `npx tsx scripts/generate-migration-matrix.ts`.');
  lines.push('');
  lines.push(`Regenerated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`Total screens tracked: **${summary.total}** (189 legacy + ${summary.total - 189} infrastructure)`);
  lines.push('');
  lines.push('| Status | Count |');
  lines.push('|---|---|');
  for (const [status, count] of Object.entries(summary.counts)) {
    lines.push(`| ${status} | ${count} |`);
  }
  lines.push('');
  lines.push('## Per-screen matrix');
  lines.push('');
  lines.push('| Screen | Role | Surface | Workflow | Entity | Current data source | Target data source | Migration status | Authorization | Test status | Remaining risk |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    lines.push(
      `| ${r.screen} | ${r.role} | ${r.surface} | ${r.workflow} | ${r.entity} | ${r.currentDataSource} | ${r.targetDataSource} | ${r.migrationStatus} | ${r.authorizationStatus} | ${r.testStatus} | ${r.remainingRisk} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function main() {
  const rows = buildRows();
  const md = renderMarkdown(rows);
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, md, 'utf8');
  const summary = migrationSummary();
  console.log(`Wrote ${OUT_FILE} — ${rows.length} rows. Summary: ${JSON.stringify(summary.counts)}`);
}

main();
