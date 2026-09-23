/**
 * Phase 23 acceptance check: proves real code splitting exists (not
 * just claimed) and measures its effect, so a future edit that silently
 * reverts it (e.g. someone converting a `React.lazy()` back to a static
 * import) is caught.
 *
 * Structural checks (source) + a real build measurement, mirroring
 * `production-demo-gate-check.ts`'s two-part approach for the same
 * "no browser available" reason — a bundle-size regression is
 * observable from the build output without needing to render anything.
 *
 * Run with: npx tsx scripts/code-splitting-check.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
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
  // --- 1. Structural: the lazy conversion is really in the source --------
  const sharedRoutes = fs.readFileSync(path.join(REPO_ROOT, 'src/routers/SharedRoutes.tsx'), 'utf8');
  const adminRouter = fs.readFileSync(path.join(REPO_ROOT, 'src/routers/AdminRouter.tsx'), 'utf8');

  const sharedRoutesLazyCount = (sharedRoutes.match(/React\.lazy\(\(\) => import\(/g) || []).length;
  const adminRouterLazyCount = (adminRouter.match(/React\.lazy\(\(\) => import\(/g) || []).length;

  assert(sharedRoutesLazyCount >= 100, `SharedRoutes.tsx lazy-loads at least 100 screens (found ${sharedRoutesLazyCount})`);
  assert(adminRouterLazyCount >= 70, `AdminRouter.tsx lazy-loads at least 70 screens (found ${adminRouterLazyCount})`);
  assert(sharedRoutes.includes('Suspense') && sharedRoutes.includes('<Suspense fallback='), 'SharedRoutes.tsx wraps its render in a real <Suspense> boundary');
  assert(adminRouter.includes('Suspense') && adminRouter.includes('<Suspense fallback='), 'AdminRouter.tsx wraps its render in a real <Suspense> boundary');

  // --- 2. Build: measure the real effect on the main chunk ----------------
  const outDir = 'dist-code-splitting-check-tmp';
  const outPath = path.join(REPO_ROOT, outDir);
  try {
    execSync(`npx vite build --outDir ${outDir}`, { cwd: REPO_ROOT, stdio: 'pipe' });
    const assetsDir = path.join(outPath, 'assets');
    const files = fs.readdirSync(assetsDir);
    const jsFiles = files.filter(f => f.endsWith('.js'));
    const mainChunk = jsFiles.find(f => f.startsWith('index-'));
    assert(!!mainChunk, 'the build produces a main "index-*.js" chunk');
    const mainChunkBytes = fs.statSync(path.join(assetsDir, mainChunk!)).size;
    const lazyChunkCount = jsFiles.length - 1; // everything except the main chunk

    console.log(`Main chunk: ${(mainChunkBytes / 1024 / 1024).toFixed(2)} MB — ${lazyChunkCount} separate lazy-loaded chunk files.`);

    // Regression guard: before this phase, the entire app was one
    // ~6.6MB chunk. A real ceiling well below that, with margin for
    // future growth, catches a silent revert without being so tight
    // that ordinary feature growth trips it.
    assert(mainChunkBytes < 4.5 * 1024 * 1024, `the main chunk stays well under the pre-Phase-23 ~6.6MB baseline (got ${(mainChunkBytes / 1024 / 1024).toFixed(2)} MB) — code splitting has not silently regressed`);
    assert(lazyChunkCount >= 150, `at least 150 separate lazy-loaded screen chunks exist (found ${lazyChunkCount})`);
  } finally {
    fs.rmSync(outPath, { recursive: true, force: true });
  }

  console.log('\nPASS: SharedRoutes.tsx and AdminRouter.tsx (177 screens combined) really lazy-load via');
  console.log('React.lazy()/Suspense, not just static imports pretending to be dynamic — and a real build');
  console.log('measurement confirms the main chunk stays well below the pre-Phase-23 monolithic-bundle baseline.');
}

main();
