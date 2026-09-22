/**
 * Phase 14 — automated legacy DbManager usage detection.
 *
 * Live, Node-only (`fs`-based) scan of every `.ts`/`.tsx` file under
 * `src/` for actual `DbManager` import/usage — not the Phase 01 CSV
 * snapshot, which can drift from reality as files change. Reusable as a
 * library (`scanDbManagerUsage()`) by `generate-migration-matrix.ts` and
 * `migration-factory-check.ts`, and runnable standalone:
 *
 *   npx tsx scripts/dbmanager-usage-scan.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface DbManagerUsageRecord {
  screenId: string;
  file: string; // relative path from repo root
  importsDbManager: boolean;
  callCount: number;
  methods: string[]; // unique method names called, e.g. ['getLeads', 'updateLead']
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(REPO_ROOT, 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      out.push(full);
    }
  }
  return out;
}

/** Scans every `.ts`/`.tsx` file under `src/` (not just `src/components/`)
 * so usage in hooks, services, or `App.tsx` is measured too, not just the
 * 189-screen registry's own files. */
export function scanAllSrcForDbManager(): DbManagerUsageRecord[] {
  const files = walk(SRC_DIR);
  const records: DbManagerUsageRecord[] = [];
  for (const full of files) {
    const rel = path.relative(REPO_ROOT, full).split(path.sep).join('/');
    if (rel === 'src/lib/db.ts') continue; // the definition itself, not a usage site
    const content = fs.readFileSync(full, 'utf8');
    const importsDbManager = /\bDbManager\b/.test(content) && /from\s+['"][^'"]*\/db['"]/.test(content);
    const calls = [...content.matchAll(/DbManager\.([A-Za-z0-9_]+)\(/g)].map(m => m[1]);
    if (!importsDbManager && calls.length === 0) continue; // no reference at all — skip, keep report focused
    records.push({
      screenId: path.basename(full).replace(/\.tsx?$/, ''),
      file: rel,
      importsDbManager,
      callCount: calls.length,
      methods: [...new Set(calls)].sort(),
    });
  }
  return records.sort((a, b) => a.file.localeCompare(b.file));
}

/** Convenience: same scan, restricted to src/components/*.tsx (the 189
 * screens the migration matrix reports on) keyed by screenId. */
export function scanComponentDbManagerUsage(): Map<string, DbManagerUsageRecord> {
  const all = scanAllSrcForDbManager();
  const map = new Map<string, DbManagerUsageRecord>();
  for (const r of all) {
    if (r.file.startsWith('src/components/')) map.set(r.screenId, r);
  }
  return map;
}

function main() {
  const records = scanAllSrcForDbManager();
  const totalCalls = records.reduce((sum, r) => sum + r.callCount, 0);
  console.log(`Legacy DbManager usage scan — ${records.length} files reference DbManager, ${totalCalls} total call sites.\n`);
  for (const r of records) {
    console.log(`${r.file}  (${r.callCount} calls: ${r.methods.slice(0, 6).join(', ')}${r.methods.length > 6 ? ', …' : ''})`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
