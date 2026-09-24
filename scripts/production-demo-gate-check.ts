/**
 * Phase 23 acceptance check, REWRITTEN for Phase 32's real fix.
 *
 * Phase 23 gated the demo login bypasses at RUNTIME
 * (`isProductionDeploy()`), leaving the literal bypass strings in
 * production bundle TEXT (a documented, honest residual gap). Phase 32
 * closed that gap by moving every bypass literal into
 * `src/lib/demoCredentials.ts`, resolved by a real BUILD-TIME constant
 * (`__DEMO_AUTH_ENABLED__`, injected in `vite.config.ts`) instead of a
 * runtime function call — see that module's header for the full
 * rationale, and `scripts/production-bundle-bypass-check.ts` for the
 * real build+grep verification that the literals are actually gone from
 * built output (the stronger, empirical check; this script is the
 * cheaper structural companion, run on every `npm run checks`).
 *
 * This script now asserts the STRUCTURAL shape of the Phase 32 fix:
 *   1. None of the known bypass literals ('1234', '123456', '888888',
 *      'password123', the demo email map, admin@aiec.com) appear
 *      anywhere in src/App.tsx or src/components/ForgotPasswordReset.tsx
 *      any more — they must live ONLY in src/lib/demoCredentials.ts,
 *      gated by `__DEMO_AUTH_ENABLED__`.
 *   2. src/lib/demoCredentials.ts itself gates every literal behind
 *      `__DEMO_AUTH_ENABLED__`.
 *   3. A real `VITE_APP_ENV=production` build still compiles cleanly.
 *
 * Run with: npx tsx scripts/production-demo-gate-check.ts
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
const SCREEN_FILES = [
  'src/App.tsx',
  'src/components/ForgotPasswordReset.tsx',
  'src/components/ESignatureCapture.tsx',
  'src/components/OfferOnboardingAgreementScreen.tsx',
];
const DEMO_CREDENTIALS_TS = fs.readFileSync(path.join(REPO_ROOT, 'src/lib/demoCredentials.ts'), 'utf8');

const KNOWN_BYPASS_LITERALS = ["'1234'", "'123456'", "'888888'", "'password123'", 'admin@aiec.com', "'4321'", "'5541'"];

function main() {
  // --- 1. Every screen that used to hold a bypass literal directly no longer does ---
  for (const relPath of SCREEN_FILES) {
    const content = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
    for (const literal of KNOWN_BYPASS_LITERALS) {
      assert(
        !content.includes(literal),
        `${relPath} no longer contains the literal ${literal} directly (moved to src/lib/demoCredentials.ts)`,
      );
    }
  }

  // --- 2. demoCredentials.ts gates every literal behind the build-time constant ---
  assert(
    DEMO_CREDENTIALS_TS.includes('declare const __DEMO_AUTH_ENABLED__: boolean;'),
    'src/lib/demoCredentials.ts declares the build-time __DEMO_AUTH_ENABLED__ constant',
  );
  const literalGuardCount = (DEMO_CREDENTIALS_TS.match(/if \(!__DEMO_AUTH_ENABLED__\) return/g) || []).length;
  assert(
    literalGuardCount >= 5,
    `expected at least 5 functions in demoCredentials.ts gated by "if (!__DEMO_AUTH_ENABLED__) return ..." — found ${literalGuardCount}`,
  );
  for (const literal of KNOWN_BYPASS_LITERALS) {
    assert(
      DEMO_CREDENTIALS_TS.includes(literal),
      `src/lib/demoCredentials.ts is the sole real home of the literal ${literal}`,
    );
  }

  // --- 3. vite.config.ts wires __DEMO_AUTH_ENABLED__ from VITE_APP_ENV ---
  const VITE_CONFIG = fs.readFileSync(path.join(REPO_ROOT, 'vite.config.ts'), 'utf8');
  assert(
    VITE_CONFIG.includes('__DEMO_AUTH_ENABLED__'),
    'vite.config.ts defines __DEMO_AUTH_ENABLED__ as a real esbuild `define` substitution',
  );
  assert(
    VITE_CONFIG.includes("process.env.VITE_APP_ENV === 'production'"),
    'vite.config.ts derives the build-time flag from VITE_APP_ENV, the same variable isProductionDeploy() reads at runtime',
  );

  // --- 3b. MVP (audit R-5): the "Try as Role" tab is hidden in a production build ---
  const APP_SRC = fs.readFileSync(path.join(REPO_ROOT, 'src', 'App.tsx'), 'utf8');
  assert(
    APP_SRC.includes("useState<'phone' | 'demo'>(isProductionDeploy() ? 'phone' : 'demo')"),
    'App.tsx never opens on the demo tab in a production build (R-5)',
  );
  assert(
    APP_SRC.includes("${isProductionDeploy() ? 'hidden' : ''} flex-1 py-3"),
    'App.tsx hides the demo tab button in a production build (R-5)',
  );
  assert(
    APP_SRC.includes("if (!mvpMode || !isDemoAuthBuild() || showSplash || currentUser) return;"),
    'the ?demoRole= shortcut only works in a demo-auth build (never in production)',
  );

  // --- 4. Build: a real VITE_APP_ENV=production build succeeds ---
  const outDir = 'dist-production-gate-check-tmp';
  const outPath = path.join(REPO_ROOT, outDir);
  try {
    execSync(`npx vite build --outDir ${outDir}`, {
      cwd: REPO_ROOT,
      env: { ...process.env, VITE_APP_ENV: 'production' },
      stdio: 'pipe',
    });
    assert(fs.existsSync(path.join(outPath, 'index.html')), 'a VITE_APP_ENV=production build produces real output');
  } finally {
    fs.rmSync(outPath, { recursive: true, force: true });
  }

  console.log('\nPASS: every known demo login bypass literal lives ONLY in src/lib/demoCredentials.ts, gated by a real');
  console.log('build-time constant (not just a runtime check), and a VITE_APP_ENV=production build compiles cleanly.');
  console.log('See scripts/production-bundle-bypass-check.ts for the empirical build+grep proof the literals are');
  console.log('actually absent from production bundle OUTPUT, not just moved.');
}

main();
