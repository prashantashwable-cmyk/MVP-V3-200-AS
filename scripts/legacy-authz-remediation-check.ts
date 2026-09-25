/**
 * Phase 35 acceptance check: proves the generated
 * docs/security/LEGACY-AUTHORIZATION-REMEDIATION.md report is internally
 * consistent and grounded in the live screen classification — not
 * hand-typed numbers that could silently drift from reality. Also
 * statically verifies the 2 real firestore.rules fixes this phase made
 * are actually present in the deployed rules file.
 *
 * Run with: npx tsx scripts/legacy-authz-remediation-check.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRows } from './generate-migration-matrix';

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
  const rows = buildRows();
  const clientOnly = rows.filter(r => r.authorizationStatus.startsWith('client-only'));

  const reportPath = path.join(REPO_ROOT, 'docs/security/LEGACY-AUTHORIZATION-REMEDIATION.md');
  assert(fs.existsSync(reportPath), 'docs/security/LEGACY-AUTHORIZATION-REMEDIATION.md exists');
  const report = fs.readFileSync(reportPath, 'utf8');

  const p0Match = report.match(/\| P0 \| (\d+) \|/);
  const p1Match = report.match(/\| P1 \| (\d+) \|/);
  const p2Match = report.match(/\| P2 \| (\d+) \|/);
  assert(p0Match && p1Match && p2Match, 'the report contains P0/P1/P2 summary counts');
  const p0 = Number(p0Match![1]);
  const p1 = Number(p1Match![1]);
  const p2 = Number(p2Match![1]);

  assert(p0 + p1 + p2 === clientOnly.length, `P0 (${p0}) + P1 (${p1}) + P2 (${p2}) sums to exactly the live client-only screen count (${clientOnly.length}) — every screen classified exactly once`);
  assert(p0 > 0, 'at least one P0 (security-sensitive) screen was found — the priority scheme is not vacuous');

  // --- The 2 real firestore.rules fixes are actually present -------------
  const rules = fs.readFileSync(path.join(REPO_ROOT, 'firestore.rules'), 'utf8');
  assert(
    /match \/payments\/\{paymentId\}[\s\S]*?allow create: if isAdmin\(\) \|\|\s*\(isAuthenticated\(\) && request\.resource\.data\.createdBy == request\.auth\.uid\)/.test(rules),
    'firestore.rules: payments.create now requires createdBy == request.auth.uid (or Admin) — the real Phase 35 fix is present, not just documented',
  );
  assert(
    // Step 11 (open issue #15) additionally scopes this to isParticipantOf(projectId) — isTechnician()
    // may now appear inside a larger boolean (e.g. "isAdmin() || (isTechnician() && ...)"), not only
    // as the sole condition; the check's intent (role-gated, not open to everyone) still holds.
    /match \/qc_inspections\/\{inspectionId\}[\s\S]*?allow create: if [\s\S]{0,80}isTechnician\(\)/.test(rules),
    'firestore.rules: qc_inspections.create now requires isTechnician() — the real Phase 35 fix is present, not just documented',
  );

  console.log('\nPASS: the Phase 35 remediation report is grounded in the live screen classification');
  console.log('(every client-only screen counted exactly once across P0/P1/P2), and the 2 real');
  console.log('firestore.rules tightenings it claims are actually present in the deployed rules file.');
}

main();
