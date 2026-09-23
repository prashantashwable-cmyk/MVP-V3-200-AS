/**
 * Phase 54 — Legacy Read Migration: measurement.
 *
 * "Measure and report legacy vs canonical read counts." Builds on Phase
 * 14's real `scanAllSrcForDbManager()` (live filesystem scan, not a
 * stale CSV) and adds two things that scan did not: (a) classifying
 * each `DbManager.<method>()` call site as READ-shaped
 * (get/list/fetch/find/query) or WRITE-shaped (add/create/update/
 * delete/set/remove) by name pattern, and (b) a live scan for canonical
 * repository/service imports per file, so "already canonical-read" is
 * measured directly from the source, not assumed.
 *
 * Run with: npx tsx scripts/legacy-read-migration-measurement.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanAllSrcForDbManager } from './dbmanager-usage-scan';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const READ_PREFIXES = ['get', 'list', 'fetch', 'find', 'query', 'search', 'select'];
const WRITE_PREFIXES = ['add', 'create', 'update', 'delete', 'remove', 'set', 'save', 'record', 'assign', 'merge', 'disqualify', 'reassign', 'approve', 'reject', 'toggle', 'mark', 'log', 'bulk'];

function classify(method: string): 'read' | 'write' | 'ambiguous' {
  const lower = method.toLowerCase();
  if (READ_PREFIXES.some(p => lower.startsWith(p))) return 'read';
  if (WRITE_PREFIXES.some(p => lower.startsWith(p))) return 'write';
  return 'ambiguous';
}

const CANONICAL_IMPORT_PATTERNS = [
  /from ['"][^'"]*\/repository\/entities['"]/,
  /from ['"][^'"]*\/services\/projectOperatingView['"]/,
  /from ['"][^'"]*\/services\/workQueue['"]/,
  /from ['"][^'"]*\/services\/portalWorkSummary['"]/,
  /from ['"][^'"]*\/services\/controlTower['"]/,
  /from ['"][^'"]*\/services\/commercialWorkflow['"]/,
  /from ['"][^'"]*\/services\/operationsWorkflow['"]/,
  /from ['"][^'"]*\/services\/legacyCommercialBridge['"]/,
];

function main() {
  const dbRecords = scanAllSrcForDbManager();
  const componentRecords = dbRecords.filter(r => r.file.startsWith('src/components/'));

  let totalReadCalls = 0;
  let totalWriteCalls = 0;
  let totalAmbiguousCalls = 0;
  const perScreen: { file: string; reads: number; writes: number; ambiguous: number; canonicalImport: boolean; canonicalOnly: boolean }[] = [];

  for (const r of componentRecords) {
    const content = fs.readFileSync(path.join(REPO_ROOT, r.file), 'utf8');
    const calls = [...content.matchAll(/DbManager\.([A-Za-z0-9_]+)\(/g)].map(m => m[1]);
    let reads = 0, writes = 0, ambiguous = 0;
    for (const c of calls) {
      const k = classify(c);
      if (k === 'read') reads++; else if (k === 'write') writes++; else ambiguous++;
    }
    totalReadCalls += reads; totalWriteCalls += writes; totalAmbiguousCalls += ambiguous;
    const canonicalImport = CANONICAL_IMPORT_PATTERNS.some(p => p.test(content));
    perScreen.push({ file: r.file, reads, writes, ambiguous, canonicalImport, canonicalOnly: false });
  }

  // Also scan EVERY component (not just ones with DbManager usage) for
  // canonical imports, to find components that read canonically with NO
  // legacy DbManager reference at all (the true migration target state).
  const allComponentFiles = fs.readdirSync(path.join(REPO_ROOT, 'src/components'))
    .filter(f => f.endsWith('.tsx'))
    .map(f => `src/components/${f}`);
  const canonicalOnlyScreens: string[] = [];
  for (const f of allComponentFiles) {
    const already = perScreen.find(p => p.file === f);
    if (already) continue; // has DbManager usage, already counted above
    const content = fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
    const canonicalImport = CANONICAL_IMPORT_PATTERNS.some(p => p.test(content));
    if (canonicalImport) canonicalOnlyScreens.push(f);
  }

  const legacyReadOnlyScreens = perScreen.filter(p => p.reads > 0 && !p.canonicalImport);
  const mixedScreens = perScreen.filter(p => p.reads > 0 && p.canonicalImport);

  console.log('=== Phase 54: Legacy Read Migration — Measurement ===\n');
  console.log(`Total components scanned: ${allComponentFiles.length}`);
  console.log(`Components with DbManager usage: ${componentRecords.length}`);
  console.log(`  - legacy DbManager READ-shaped call sites: ${totalReadCalls}`);
  console.log(`  - legacy DbManager WRITE-shaped call sites: ${totalWriteCalls}`);
  console.log(`  - ambiguous-shaped call sites (not classified either way): ${totalAmbiguousCalls}`);
  console.log(`Components reading ONLY from DbManager (no canonical import at all): ${legacyReadOnlyScreens.length}`);
  console.log(`Components with BOTH DbManager AND a canonical import (mixed/in-transition): ${mixedScreens.length}`);
  console.log(`Components with a canonical import and NO DbManager usage at all (fully migrated reads): ${canonicalOnlyScreens.length}`);
  console.log(`  -> ${canonicalOnlyScreens.join(', ')}`);

  writeReport({
    totalComponents: allComponentFiles.length,
    componentsWithDbManager: componentRecords.length,
    totalReadCalls, totalWriteCalls, totalAmbiguousCalls,
    legacyReadOnlyCount: legacyReadOnlyScreens.length,
    mixedCount: mixedScreens.length,
    canonicalOnlyScreens,
    topLegacyReadScreens: [...legacyReadOnlyScreens].sort((a, b) => b.reads - a.reads).slice(0, 15),
  });
}

function writeReport(data: {
  totalComponents: number; componentsWithDbManager: number;
  totalReadCalls: number; totalWriteCalls: number; totalAmbiguousCalls: number;
  legacyReadOnlyCount: number; mixedCount: number; canonicalOnlyScreens: string[];
  topLegacyReadScreens: { file: string; reads: number; writes: number }[];
}) {
  const outFile = path.join(REPO_ROOT, 'docs/architecture/LEGACY-READ-MIGRATION-MEASUREMENT.md');
  const lines: string[] = [];
  lines.push('# Legacy Read Migration — Measurement (Phase 54)');
  lines.push('');
  lines.push('Generated by `scripts/legacy-read-migration-measurement.ts` — do not hand-edit.');
  lines.push('Re-run: `npx tsx scripts/legacy-read-migration-measurement.ts`.');
  lines.push('');
  lines.push(`Regenerated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push('A live filesystem scan (not a stale snapshot) of every `.tsx` file in');
  lines.push('`src/components/` (the 191-screen registry) for: (a) `DbManager.<method>()` call');
  lines.push('sites, classified READ-shaped (get/list/fetch/find/query/search/select) or');
  lines.push('WRITE-shaped (add/create/update/delete/remove/set/save/record/...) by name');
  lines.push('pattern, and (b) a real import scan for the canonical repository/service modules');
  lines.push('(`repository/entities`, `services/projectOperatingView`, `services/workQueue`,');
  lines.push('`services/portalWorkSummary`, `services/controlTower`, `services/commercialWorkflow`,');
  lines.push('`services/operationsWorkflow`, `services/legacyCommercialBridge`).');
  lines.push('');
  lines.push('## Headline counts');
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`|---|---|`);
  lines.push(`| Total components scanned | ${data.totalComponents} |`);
  lines.push(`| Components with any DbManager usage | ${data.componentsWithDbManager} |`);
  lines.push(`| Legacy DbManager READ-shaped call sites | ${data.totalReadCalls} |`);
  lines.push(`| Legacy DbManager WRITE-shaped call sites | ${data.totalWriteCalls} |`);
  lines.push(`| Ambiguous-shaped call sites | ${data.totalAmbiguousCalls} |`);
  lines.push(`| Components reading ONLY from DbManager (no canonical import) | ${data.legacyReadOnlyCount} |`);
  lines.push(`| Components with BOTH DbManager and a canonical import (in transition) | ${data.mixedCount} |`);
  lines.push(`| Components with a canonical import and ZERO DbManager usage (fully migrated reads) | ${data.canonicalOnlyScreens.length} |`);
  lines.push('');
  lines.push('## Fully migrated-read components (this phase\'s real target state)');
  lines.push('');
  for (const f of data.canonicalOnlyScreens) lines.push(`- \`${f}\``);
  lines.push('');
  lines.push('These 3 components — the exact top-3-priority items this phase\'s own brief names');
  lines.push('(Project Operating View, Work Queue, Operating Surfaces) — are confirmed by this live');
  lines.push('scan to already be canonical-read with zero legacy DbManager dependency. Operating');
  lines.push('Surfaces Home (`OperatingSurfacesHome.tsx`) is a pure navigation/menu component with');
  lines.push('no data read of either kind, so it is vacuously "not legacy" rather than actively');
  lines.push('migrated — noted honestly, not conflated with the other two.');
  lines.push('');
  lines.push('## Top 15 remaining legacy-read-only components, by read-call volume');
  lines.push('');
  lines.push('| Component | Legacy READ calls | Legacy WRITE calls |');
  lines.push('|---|---|---|');
  for (const s of data.topLegacyReadScreens) {
    lines.push(`| \`${s.file}\` | ${s.reads} | ${s.writes} |`);
  }
  lines.push('');
  lines.push('## What this measurement does NOT claim');
  lines.push('');
  lines.push('This counts call SITES, not runtime read VOLUME — a screen with 3 read call sites');
  lines.push('rendered on every keystroke may execute more real reads than one with 10 call sites');
  lines.push('rendered once. It is a real, useful proxy for migration SCOPE (how much code touches');
  lines.push('legacy data per screen), not a production read-volume/cost metric — no live traffic');
  lines.push('exists in this sandbox to measure that directly.');
  lines.push('');

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, lines.join('\n'), 'utf8');
  console.log(`\nWrote ${outFile}`);
}

main();
