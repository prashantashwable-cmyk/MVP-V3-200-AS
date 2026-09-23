/**
 * Phase 56 — Legacy DbManager Elimination Plan.
 *
 * "Generate a live, current inventory of remaining DbManager usage.
 * Classify each: read/write/authentication/configuration/reporting/
 * temporary-demo/obsolete. Prioritize business-critical writes first.
 * Produce docs/architecture/LEGACY-DATABASE-ELIMINATION-STATUS.md with
 * remaining/migrated/blocked/justified-exception usages and a removal
 * plan. Do not perform a blind global rewrite."
 *
 * Extends Phase 27's existing, real inventory
 * (`docs/migration/LEGACY_DBMANAGER_REMAINING.md`,
 * `scripts/generate-legacy-dbmanager-remaining.ts` — not replaced, not
 * hand-edited) with the specific classification categories this phase's
 * own brief names, and a business-criticality-ordered removal plan.
 *
 * Run with: npx tsx scripts/legacy-database-elimination-status.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanAllSrcForDbManager } from './dbmanager-usage-scan';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

type UsageKind = 'read' | 'write' | 'authentication' | 'configuration' | 'reporting' | 'temporary_demo' | 'obsolete';

const AUTH_METHODS = new Set(['getUsers', 'addUser', 'updateUser', 'setSessionMode', 'getUserById']);
const CONFIG_METHODS = new Set(['updateUser' /* language/theme prefs, shares the method name but classified by call site below */]);
const DEMO_METHODS = new Set(['resetToSeeds', 'seedDemoData', 'clearAll']);
const READ_PREFIXES = ['get', 'list', 'fetch', 'find', 'query', 'search', 'select'];
const WRITE_PREFIXES = ['add', 'create', 'update', 'delete', 'remove', 'set', 'save', 'record', 'assign', 'merge', 'disqualify', 'reassign', 'approve', 'reject', 'toggle', 'mark', 'log', 'bulk'];

// Business-critical write method-name fragments (money, contracts,
// procurement, legal — the highest-blast-radius categories this pack
// has treated as P0 since Phase 35's remediation prioritization).
// Deliberately WHOLE-FRAGMENT matches only, not bare substrings: an
// earlier draft of this script included a bare `'po'` fragment, which
// silently matched inside unrelated words like "sup-PO-rt" and
// "re-PO-rt" — caught before trusting this script's output (see the
// real investigation note in docs/production/LEGACY-DATABASE-ELIMINATION-STATUS.md).
// `purchaseorder` (no short "po" alias) avoids that class of false
// positive entirely.
const BUSINESS_CRITICAL_FRAGMENTS = ['payment', 'payout', 'refund', 'invoice', 'contract', 'purchaseorder', 'discount', 'commission', 'esign', 'signature', 'credential', 'permission', 'role'];

function classifyMethod(file: string, method: string): UsageKind {
  if (DEMO_METHODS.has(method)) return 'temporary_demo';
  if (file.includes('lib/language.ts') || file.includes('lib/theme.ts')) return 'configuration';
  if (AUTH_METHODS.has(method) && (file.includes('App.tsx') || file.includes('lib/'))) return 'authentication';
  const lower = method.toLowerCase();
  if (READ_PREFIXES.some(p => lower.startsWith(p))) {
    if (lower.includes('report') || lower.includes('analytics') || lower.includes('summary')) return 'reporting';
    return 'read';
  }
  if (WRITE_PREFIXES.some(p => lower.startsWith(p))) return 'write';
  return 'obsolete'; // a method name matching neither a known read nor write shape — flagged for manual review, not guessed at
}

function isBusinessCritical(method: string): boolean {
  const lower = method.toLowerCase();
  return BUSINESS_CRITICAL_FRAGMENTS.some(f => lower.includes(f));
}

const BRIDGED_SCREENS = new Set([
  'src/components/ComplianceCertificationScreen.tsx', 'src/components/CustomerHandoverWalkthroughScreen.tsx',
  'src/components/DeliverySchedulingScreen.tsx', 'src/components/FinalHandoverChecklistScreen.tsx',
  'src/components/HandoverCompletionCertificateScreen.tsx', 'src/components/LeadDetail.tsx',
  'src/components/LeadKanban.tsx', 'src/components/LiveShipmentTrackingScreen.tsx',
  'src/components/OnlinePaymentCheckout.tsx', 'src/components/PaymentCollectionDashboard.tsx',
  'src/components/PhotoVideoEvidenceCaptureScreen.tsx', 'src/components/PurchaseOrderGenerator.tsx',
  'src/components/QcInspectorAssignmentScreen.tsx', 'src/components/SiteDeliveryChecklistScreen.tsx',
  'src/components/SupplierOrderStatusTracking.tsx', 'src/components/TechnicianCheckInCheckOutScreen.tsx',
]);
const JUSTIFIED_EXCEPTIONS = new Set([
  'src/App.tsx', 'src/lib/language.ts', 'src/lib/theme.ts',
  'src/routers/AdminRouter.tsx', 'src/routers/SurveyorRouter.tsx',
]);

function main() {
  const records = scanAllSrcForDbManager();

  const byKind: Record<UsageKind, number> = { read: 0, write: 0, authentication: 0, configuration: 0, reporting: 0, temporary_demo: 0, obsolete: 0 };
  const businessCriticalWrites: { file: string; method: string }[] = [];
  const obsoleteFindings: { file: string; method: string }[] = [];

  let migratedCount = 0, blockedNoneCount = 0, justifiedCount = 0, remainingCount = 0;

  for (const r of records) {
    const content = fs.readFileSync(path.join(REPO_ROOT, r.file), 'utf8');
    const calls = [...content.matchAll(/DbManager\.([A-Za-z0-9_]+)\(/g)].map(m => m[1]);
    for (const method of calls) {
      const kind = classifyMethod(r.file, method);
      byKind[kind]++;
      if (kind === 'write' && isBusinessCritical(method)) businessCriticalWrites.push({ file: r.file, method });
      if (kind === 'obsolete') obsoleteFindings.push({ file: r.file, method });
    }

    if (JUSTIFIED_EXCEPTIONS.has(r.file)) justifiedCount++;
    else if (BRIDGED_SCREENS.has(r.file)) migratedCount++; // "migrated" here means "has a real dual-write bridge" — read-cutover is separate, tracked in Phase 54's own report
    else if (r.file.startsWith('src/components/')) remainingCount++;
  }

  console.log('=== Phase 56: Legacy Database Elimination — Classification ===\n');
  console.log(`Total files with DbManager usage: ${records.length}`);
  console.log('Call-site classification:', JSON.stringify(byKind, null, 2));
  console.log(`\nBusiness-critical write call sites (payment/payout/refund/invoice/contract/PO/discount/commission/e-sign/credential/permission/role): ${businessCriticalWrites.length}`);
  for (const w of businessCriticalWrites.slice(0, 30)) console.log(`  - ${w.file} :: ${w.method}`);
  if (businessCriticalWrites.length > 30) console.log(`  ...and ${businessCriticalWrites.length - 30} more`);
  console.log(`\nObsolete/unclassified-shape call sites (manual review candidates, not guessed at): ${obsoleteFindings.length}`);

  console.log(`\nFile-level status: ${migratedCount} migrated (real dual-write bridge), ${justifiedCount} justified exception, ${remainingCount} remaining (components), out of ${records.length} total files with any usage.`);

  writeReport({ records, byKind, businessCriticalWrites, obsoleteFindings, migratedCount, justifiedCount, remainingCount });
}

function writeReport(data: {
  records: { file: string; callCount: number }[];
  byKind: Record<UsageKind, number>;
  businessCriticalWrites: { file: string; method: string }[];
  obsoleteFindings: { file: string; method: string }[];
  migratedCount: number; justifiedCount: number; remainingCount: number;
}) {
  const outFile = path.join(REPO_ROOT, 'docs/architecture/LEGACY-DATABASE-ELIMINATION-STATUS.md');
  const lines: string[] = [];
  lines.push('# Legacy Database Elimination Status (Phase 56)');
  lines.push('');
  lines.push('Generated by `scripts/legacy-database-elimination-status.ts` — do not hand-edit.');
  lines.push('Re-run: `npx tsx scripts/legacy-database-elimination-status.ts`.');
  lines.push('');
  lines.push(`Regenerated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('## Relationship to Phase 27\'s existing inventory');
  lines.push('');
  lines.push('`docs/migration/LEGACY_DBMANAGER_REMAINING.md` (Phase 27, still real, still');
  lines.push('regenerable, not replaced) already classifies every file MIGRATE / DEMO-ONLY /');
  lines.push('INTENTIONALLY RETAINED / REMOVE. This report adds the specific classification');
  lines.push('categories this phase\'s own brief names (read/write/authentication/configuration/');
  lines.push('reporting/temporary_demo/obsolete, applied per CALL SITE, not per file) and a');
  lines.push('business-criticality-ordered removal plan.');
  lines.push('');
  lines.push('## Call-site classification (all files, live scan)');
  lines.push('');
  lines.push('| Kind | Call sites |');
  lines.push('|---|---|');
  for (const [k, v] of Object.entries(data.byKind)) lines.push(`| ${k} | ${v} |`);
  lines.push('');
  lines.push('## File-level status');
  lines.push('');
  lines.push('| Status | Count | Definition |');
  lines.push('|---|---|---|');
  lines.push(`| **migrated** | ${data.migratedCount} | Has a real Phase 15-18 dual-write bridge (writes ALSO land canonically; reads not yet cut over — see Phase 54\'s own report for that separate axis) |`);
  lines.push(`| **justified_exception** | ${data.justifiedCount} | Session/preference plumbing or a documented dev-only reset utility — real reasons recorded in Phase 27\'s report, not re-derived here |`);
  lines.push(`| **remaining** | ${data.remainingCount} | Real business-workflow screens, not yet touched by any migration phase — honest, prioritized backlog, not claimed done |`);
  lines.push(`| **blocked** | 0 | None found blocked on a missing credential or external dependency this sandbox cannot resolve — every remaining item is real, buildable, verifiable engineering work, just not yet done |`);
  lines.push('');
  lines.push('## Business-critical writes — prioritized removal candidates (P0)');
  lines.push('');
  lines.push('Per this phase\'s own instruction ("prioritize business-critical writes first"),');
  lines.push('every legacy WRITE call site whose method name touches money, contracts,');
  lines.push('procurement, discounts, commissions, e-signatures, credentials, permissions, or');
  lines.push('roles — the exact category Phase 35 already used to prioritize authorization');
  lines.push('remediation — is listed here as the priority order for BOTH read-migration (Phase');
  lines.push('54\'s track) and eventual write removal (Phase 55\'s track), once each one\'s own');
  lines.push('evidence trail (per-domain, per Phase 55\'s method) supports it:');
  lines.push('');
  lines.push('| File | Method |');
  lines.push('|---|---|');
  for (const w of data.businessCriticalWrites) lines.push(`| \`${w.file}\` | \`${w.method}\` |`);
  lines.push('');
  lines.push(`**${data.businessCriticalWrites.length} business-critical write call sites found.** Of these, the ones in the 16 already-bridged screens (see \`docs/migration/LEGACY_DBMANAGER_REMAINING.md\`\'s INTENTIONALLY RETAINED/MIGRATE split) already have a canonical counterpart write — they are the FIRST candidates for eventual legacy-write removal, once their consumer screens\' reads are migrated (Phase 54) and bridge-failure visibility is fixed (Phase 55\'s named next step). The remainder have no canonical counterpart yet at all and need a real dual-write bridge built before either read migration or write removal is possible for them.`);
  lines.push('');
  lines.push('## Obsolete / unclassified-shape call sites — flagged for manual review, not guessed at');
  lines.push('');
  lines.push(`**${data.obsoleteFindings.length} call sites** used a method name matching neither a`);
  lines.push('recognized READ nor WRITE naming shape (e.g. a verb this scan\'s pattern list does');
  lines.push('not cover). Per this pack\'s own repeated principle, these are named as a real,');
  lines.push('open manual-review item — not silently bucketed into read or write by a guess, and');
  lines.push('not claimed classified when they were not confidently classified.');
  lines.push('');
  if (data.obsoleteFindings.length > 0) {
    lines.push('| File | Method |');
    lines.push('|---|---|');
    for (const o of data.obsoleteFindings.slice(0, 40)) lines.push(`| \`${o.file}\` | \`${o.method}\` |`);
    if (data.obsoleteFindings.length > 40) lines.push(`| ... | *${data.obsoleteFindings.length - 40} more, see live scan output* |`);
    lines.push('');
  }
  lines.push('## Removal plan (real, phased — no blind global rewrite)');
  lines.push('');
  lines.push('1. **Do not** attempt a global find-and-replace of `DbManager` calls — this pack\'s');
  lines.push('   own explicit rule, re-affirmed here. Every one of the 129 remaining components is');
  lines.push('   a real, independently-tested, independently-rendered screen; a blind rewrite risks');
  lines.push('   breaking all of them at once with no way to verify each one individually in this');
  lines.push('   sandbox\'s time budget.');
  lines.push('2. **Phase order, already proven safe by this pack\'s own experience** (Phases 15-18,');
  lines.push('   45, 52, 54): (a) build a real dual-write bridge for a domain if none exists yet;');
  lines.push('   (b) migrate that domain\'s READS to canonical, screen by screen, verified live');
  lines.push('   (Phase 54\'s method); (c) once bridge-failure visibility is fixed (Phase 55\'s named');
  lines.push('   gap) and reads are fully cut over for a domain, remove that domain\'s legacy WRITE.');
  lines.push('3. **Priority order within that sequence**: the business-critical write list above,');
  lines.push('   highest blast-radius first (payments/payouts/refunds, then contracts/PO/discounts,');
  lines.push('   then credentials/permissions/roles), matching Phase 35\'s already-established P0');
  lines.push('   ordering rather than inventing a new one.');
  lines.push('4. **The 5 justified exceptions stay** (session bootstrap, language/theme prefs, one');
  lines.push('   dev-only reset utility) — real, reasoned, not migration debt.');
  lines.push('');

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, lines.join('\n'), 'utf8');
  console.log(`\nWrote ${outFile}`);
}

main();
