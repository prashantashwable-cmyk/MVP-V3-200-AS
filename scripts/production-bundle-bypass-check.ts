/**
 * Phase 32 — the real, empirical proof: builds an ACTUAL
 * `VITE_APP_ENV=production` bundle and greps the real output files for
 * every known demo login bypass literal, asserting NONE are present.
 * Also builds a real non-production (demo/sandbox) bundle and asserts
 * the SAME literals ARE present there — a positive control proving this
 * check can actually detect the strings (a check that always passes
 * because it never finds anything, even when it should, is worse than no
 * check at all), and proving demo behavior genuinely remains available
 * in an explicitly-identified demo build, not silently deleted
 * everywhere per rule #10 of the AIEC Phase 31-40 spec ("do not make
 * destructive actions noisy" is about UX, but the same "don't overcorrect"
 * spirit applies here: production-only removal, not blanket deletion).
 *
 * This is the stronger, slower companion to
 * `scripts/production-demo-gate-check.ts` (structural, fast, runs in
 * `npm run checks`). This script does two real `vite build` runs (~30s
 * total) so it is wired into `npm run checks` as its own step but kept
 * separate for clarity.
 *
 * Literals checked (every one found during the Phase 31 audit):
 *   - OTP bypass codes: 1234, 123456, 888888
 *   - Email/password fallback: password123
 *   - The demo email->role map, including the privileged admin identity
 *   - ForgotPasswordReset.tsx's universal password-reset bypass code
 *     (123456 — the same pool, reused) and its "Developer Rapid Testing
 *     Sandbox" panel (admin@aiec.com quick-fill)
 *
 * Run with: npx tsx scripts/production-bundle-bypass-check.ts
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

// Exact-quoted forms only — deliberately avoids bare substrings like
// "1234" or "123456" that also occur, entirely unrelated, inside GSTIN/
// PAN example strings, base64 charset alphabets, and numeric ID ranges
// elsewhere in the real app (verified false positives during Phase 32's
// own investigation) — this check must be precise, not paranoid-broad,
// or a real regression would drown in noise.
const BYPASS_LITERALS = [
  { literal: '"1234"', label: 'OTP bypass code 1234 (login + e-signature)' },
  { literal: '"123456"', label: 'OTP bypass code / password-reset bypass code 123456' },
  { literal: '"888888"', label: 'OTP bypass code 888888' },
  { literal: '"password123"', label: 'email/password fallback credential' },
  { literal: 'admin@aiec.com', label: 'privileged demo admin identity' },
  { literal: '"4321"', label: 'e-signature demo OTP bypass code 4321' },
  { literal: '"5541"', label: 'offer-agreement demo OTP bypass code 5541' },
];

function buildTo(outDir: string, viteAppEnv: string | undefined): void {
  const env = { ...process.env };
  if (viteAppEnv === undefined) {
    delete env.VITE_APP_ENV;
  } else {
    env.VITE_APP_ENV = viteAppEnv;
  }
  execSync(`npx vite build --outDir ${outDir}`, {
    cwd: REPO_ROOT,
    env,
    stdio: 'pipe',
  });
}

function grepBundle(outDir: string, literal: string): boolean {
  const assetsDir = path.join(REPO_ROOT, outDir, 'assets');
  if (!fs.existsSync(assetsDir)) return false;
  for (const file of fs.readdirSync(assetsDir)) {
    if (!file.endsWith('.js')) continue;
    const content = fs.readFileSync(path.join(assetsDir, file), 'utf8');
    if (content.includes(literal)) return true;
  }
  return false;
}

function main() {
  const prodDir = 'dist-bypass-check-prod-tmp';
  const demoDir = 'dist-bypass-check-demo-tmp';
  const prodPath = path.join(REPO_ROOT, prodDir);
  const demoPath = path.join(REPO_ROOT, demoDir);

  try {
    console.log('Building VITE_APP_ENV=production bundle (real build, not simulated)...');
    buildTo(prodDir, 'production');
    console.log('Building default (demo/sandbox) bundle for the positive-control comparison...');
    buildTo(demoDir, undefined);

    for (const { literal, label } of BYPASS_LITERALS) {
      const inProd = grepBundle(prodDir, literal);
      const inDemo = grepBundle(demoDir, literal);
      assert(!inProd, `production bundle output does NOT contain ${literal} (${label})`);
      assert(inDemo, `demo/sandbox bundle output DOES contain ${literal} (${label}) — proves this check can detect it, and that demo behavior remains available in an explicit demo build`);
    }

    console.log('\nPASS: a real VITE_APP_ENV=production build contains zero demo login bypass credentials in its');
    console.log('bundle output (grepped directly, not inferred), while a real demo/sandbox build genuinely still');
    console.log('contains them — the Phase 23 residual gap (bundle-TEXT presence) is closed, not just the runtime');
    console.log('behavior. See docs/production/ENVIRONMENT-READINESS.md for the full accounting.');
  } finally {
    fs.rmSync(prodPath, { recursive: true, force: true });
    fs.rmSync(demoPath, { recursive: true, force: true });
  }
}

main();
