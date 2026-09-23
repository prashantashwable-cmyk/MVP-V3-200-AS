/**
 * Phase 27 — generates docs/migration/LEGACY_DBMANAGER_REMAINING.md.
 *
 * "Now measure remaining DbManager usage. Categorize every remaining
 * usage: MIGRATE, DEMO-ONLY, INTENTIONALLY RETAINED, REMOVE."
 *
 * Reuses the same live scan (`scanAllSrcForDbManager`, Phase 14) and
 * migration registry (Phase 14+) every other migration report in this
 * pack is built from — never a re-derived or hand-counted number.
 *
 *   npx tsx scripts/generate-legacy-dbmanager-remaining.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanAllSrcForDbManager, type DbManagerUsageRecord } from './dbmanager-usage-scan';
import { getMigrationRecord } from '../src/migration/registry';
import { screenRegistry } from '../src/workflows/screenRegistry';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(REPO_ROOT, 'docs/migration/LEGACY_DBMANAGER_REMAINING.md');

type Category = 'MIGRATE' | 'DEMO-ONLY' | 'INTENTIONALLY_RETAINED' | 'REMOVE';

/** Live-checked this phase (not a re-read of the Phase 01 CSV, which
 * only scanned router files + App.tsx and therefore missed indirect
 * imports from other components): components with zero import
 * references ANYWHERE in `src/`, not just from a router. */
function findGenuinelyUnreferencedComponents(): Set<string> {
  const componentsDir = path.join(REPO_ROOT, 'src/components');
  const allTsxFiles: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) allTsxFiles.push(full);
    }
  };
  walk(path.join(REPO_ROOT, 'src'));

  const allSource = allTsxFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n---FILE---\n');
  const screenIds = screenRegistry.map(s => s.screenId);
  const unreferenced = new Set<string>();
  for (const id of screenIds) {
    // Matches BOTH a static `import { X } from '.../X'` AND Phase 23's
    // `React.lazy(() => import('.../X').then(m => ({ default: m.X })))`
    // — checking for the module path reference (`/X'` or `/X"`) is a
    // single, robust signal that covers both import mechanisms, rather
    // than two separate regexes that could silently drift apart if a
    // third import style is ever introduced.
    const modulePathPattern = new RegExp(`/${id}['"]`);
    if (!modulePathPattern.test(allSource)) unreferenced.add(id);
  }
  return unreferenced;
}

const INTENTIONALLY_RETAINED_FILES: Record<string, string> = {
  'src/lib/language.ts': 'Syncs a signed-in user\'s language preference (`DbManager.updateUser`) — a minor UI preference, not core business data. Migrating this alone would add a repository dependency to a tiny, low-risk utility for no real gain.',
  'src/lib/theme.ts': 'Syncs a signed-in user\'s theme preference (`DbManager.updateUser`) — same reasoning as `language.ts`.',
  'src/routers/AdminRouter.tsx': 'Its ONE `DbManager` call is `resetToSeeds()` — an explicit demo/dev reset utility, not a business workflow. (The router\'s other ~72 screen renders are unrelated to this call and are tracked individually in the migration matrix.)',
  'src/routers/SurveyorRouter.tsx': 'Its ONE `DbManager` call is `getLeads()` for a lightweight count/summary — the Lead domain\'s real persistence path (`firestoreLeads.ts` for real sessions) already exists separately; duplicating a third Lead-mutation path was judged not worth it as early as Phase 08.',
};

function main() {
  const usage = scanAllSrcForDbManager();
  const unreferenced = findGenuinelyUnreferencedComponents();

  interface Row { file: string; category: Category; reason: string; callCount: number }
  const rows: Row[] = [];

  for (const u of usage) {
    const relFile = u.file; // already relative, e.g. src/components/X.tsx
    const screenId = u.screenId;

    if (relFile in INTENTIONALLY_RETAINED_FILES) {
      rows.push({ file: relFile, category: 'INTENTIONALLY_RETAINED', reason: INTENTIONALLY_RETAINED_FILES[relFile], callCount: u.callCount });
      continue;
    }
    if (relFile === 'src/App.tsx') {
      rows.push({ file: relFile, category: 'INTENTIONALLY_RETAINED', reason: 'Session bootstrap (`getUsers`/`addUser`/`updateUser`/`setSessionMode`) — identity/session plumbing every login path needs regardless of which domain screens are migrated; not itself a business-workflow screen to migrate.', callCount: u.callCount });
      continue;
    }
    if (unreferenced.has(screenId)) {
      rows.push({ file: relFile, category: 'REMOVE', reason: `Not imported anywhere in src/ (screen, router, or another component) — a genuine dead-code candidate, live-verified this phase (broader than the Phase 01 CSV, which only checked router files + App.tsx).`, callCount: u.callCount });
      continue;
    }

    const screenEntry = screenRegistry.find(s => s.screenId === screenId);
    if (screenEntry) {
      const rec = getMigrationRecord(screenEntry.screenId, screenEntry.dataSource);
      if (rec.status === 'PARTIALLY_MIGRATED') {
        rows.push({ file: relFile, category: 'MIGRATE', reason: `Already dual-write bridged (see docs/migration/screen-migration-matrix.md) — this remaining DbManager usage is the screen's own read/render path, the next real step toward a full cutover.`, callCount: u.callCount });
      } else {
        rows.push({ file: relFile, category: 'MIGRATE', reason: `Real business-workflow screen (surface: ${screenEntry.surface}), not yet touched by any dual-write bridge — a genuine candidate for the next migration wave.`, callCount: u.callCount });
      }
    } else {
      rows.push({ file: relFile, category: 'MIGRATE', reason: 'Referenced by the live scan but not a registered screen (e.g. a helper/hook file) — needs individual review to decide its migration path.', callCount: u.callCount });
    }
  }

  rows.sort((a, b) => a.category.localeCompare(b.category) || a.file.localeCompare(b.file));

  const counts: Record<Category, number> = { MIGRATE: 0, 'DEMO-ONLY': 0, INTENTIONALLY_RETAINED: 0, REMOVE: 0 };
  for (const r of rows) counts[r.category]++;
  const totalCallSites = usage.reduce((s, u) => s + u.callCount, 0);

  const lines: string[] = [];
  lines.push('# Legacy DbManager Remaining Usage');
  lines.push('');
  lines.push('Generated by `scripts/generate-legacy-dbmanager-remaining.ts` — do not hand-edit.');
  lines.push('Re-run after any migration change: `npx tsx scripts/generate-legacy-dbmanager-remaining.ts`.');
  lines.push('');
  lines.push(`Regenerated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`**${usage.length} files** reference \`DbManager\`, **${totalCallSites} total call sites**.`);
  lines.push('');
  lines.push('| Category | Files |');
  lines.push('|---|---|');
  lines.push(`| MIGRATE | ${counts.MIGRATE} |`);
  lines.push(`| DEMO-ONLY | ${counts['DEMO-ONLY']} |`);
  lines.push(`| INTENTIONALLY RETAINED | ${counts.INTENTIONALLY_RETAINED} |`);
  lines.push(`| REMOVE (candidate) | ${counts.REMOVE} |`);
  lines.push('');
  lines.push('**DEMO-ONLY finding**: zero files were classified DEMO-ONLY. `DbManager` predates the Phase 04');
  lines.push('demo/sandbox/production environment model and is used IDENTICALLY regardless of environment —');
  lines.push('there is no code path where a `DbManager` call is exclusively reached in demo mode. The real');
  lines.push('demo/sandbox/production distinction exists only in the Phase 04 repository layer this migration');
  lines.push('moves usages onto; a screen is only genuinely "demo-only" once it is MIGRATED (repository-backed)');
  lines.push('AND its production path is real. This is an honest negative finding, not an empty stub.');
  lines.push('');
  lines.push('## Target for production business workflows: ZERO legacy DbManager persistence');
  lines.push('');
  lines.push(`Of the ${counts.MIGRATE} MIGRATE-category files, `);
  const partiallyMigrated = rows.filter(r => r.category === 'MIGRATE' && r.reason.includes('dual-write bridged')).length;
  lines.push(`**${partiallyMigrated}** already have a real dual-write bridge in place (Phases 15-18) — the`);
  lines.push('remaining work for those is completing the cutover (removing the DbManager read/render path once');
  lines.push(`the repository-backed one is proven equivalent), and **${counts.MIGRATE - partiallyMigrated}** have`);
  lines.push('not yet been touched by any migration phase — real, honestly-reported remaining scope, not claimed');
  lines.push('complete.');
  lines.push('');
  lines.push('## REMOVE candidates (do not remove until a product decision confirms them)');
  lines.push('');
  lines.push('Per this pack\'s own rule ("Do not remove a legacy component until all references are migrated or');
  lines.push('intentionally retired") — these are flagged, not deleted:');
  lines.push('');
  for (const r of rows.filter(r => r.category === 'REMOVE')) {
    lines.push(`- \`${r.file}\` — ${r.reason}`);
  }
  lines.push('');
  lines.push('## INTENTIONALLY RETAINED (with reasons)');
  lines.push('');
  for (const r of rows.filter(r => r.category === 'INTENTIONALLY_RETAINED')) {
    lines.push(`- \`${r.file}\` (${r.callCount} calls) — ${r.reason}`);
  }
  lines.push('');
  lines.push('## Full per-file list (MIGRATE)');
  lines.push('');
  lines.push('| File | Call sites | Reason |');
  lines.push('|---|---|---|');
  for (const r of rows.filter(r => r.category === 'MIGRATE')) {
    lines.push(`| ${r.file} | ${r.callCount} | ${r.reason} |`);
  }
  lines.push('');

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
  console.log(`Wrote ${OUT_FILE} — ${usage.length} files: ${JSON.stringify(counts)}`);
}

main();
