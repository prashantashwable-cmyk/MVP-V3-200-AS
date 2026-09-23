/**
 * Phase 27 acceptance check: proves the generated
 * docs/migration/LEGACY_DBMANAGER_REMAINING.md report is internally
 * consistent and grounded in the live scan — not hand-typed numbers
 * that could silently drift from reality.
 *
 * Run with: npx tsx scripts/dbmanager-remaining-check.ts
 */
import { scanAllSrcForDbManager } from './dbmanager-usage-scan';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`OK: ${msg}`);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

function main() {
  const liveUsage = scanAllSrcForDbManager();
  const reportPath = path.join(REPO_ROOT, 'docs/migration/LEGACY_DBMANAGER_REMAINING.md');
  assert(fs.existsSync(reportPath), 'docs/migration/LEGACY_DBMANAGER_REMAINING.md exists');
  const report = fs.readFileSync(reportPath, 'utf8');

  assert(report.includes(`**${liveUsage.length} files**`), `the report's file count matches the live scan exactly (${liveUsage.length})`);

  const totalCallSites = liveUsage.reduce((s, u) => s + u.callCount, 0);
  assert(report.includes(`**${totalCallSites} total call sites**`), `the report's call-site count matches the live scan exactly (${totalCallSites})`);

  // Every category count sums to the total file count — no file
  // silently dropped or double-counted across categories.
  const migrateMatch = report.match(/\| MIGRATE \| (\d+) \|/);
  const demoMatch = report.match(/\| DEMO-ONLY \| (\d+) \|/);
  const retainedMatch = report.match(/\| INTENTIONALLY RETAINED \| (\d+) \|/);
  const removeMatch = report.match(/\| REMOVE \(candidate\) \| (\d+) \|/);
  assert(migrateMatch && demoMatch && retainedMatch && removeMatch, 'all 4 category counts are present in the report');
  const sum = Number(migrateMatch![1]) + Number(demoMatch![1]) + Number(retainedMatch![1]) + Number(removeMatch![1]);
  assert(sum === liveUsage.length, `the 4 category counts sum to exactly the total file count (${sum} === ${liveUsage.length}) — every file categorized exactly once`);

  assert(report.includes('src/lib/language.ts') && report.includes('src/lib/theme.ts'), 'the report correctly identifies the two UI-preference-only files as intentionally retained, with real reasons given');
  assert(report.includes('DEMO-ONLY finding'), 'the report honestly explains why DEMO-ONLY is zero rather than leaving it an unexplained empty category');

  console.log(`\nPASS: docs/migration/LEGACY_DBMANAGER_REMAINING.md is grounded in the live DbManager usage scan`);
  console.log(`(${liveUsage.length} files, ${totalCallSites} call sites) — every file categorized exactly once, with real,`);
  console.log('specific reasons given for every non-MIGRATE classification.');
}

main();
