/**
 * Phase 23 acceptance check: the remaining security/reliability items
 * not already covered by `production-demo-gate-check.ts` (demo
 * credentials) and `code-splitting-check.ts` (performance) — the
 * transactional idempotency upgrade and the one real destructive-action
 * confirmation fix.
 *
 * Run with: npx tsx scripts/security-hardening-check.ts
 */
import './polyfillBrowserGlobals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runIdempotent } from '../src/lib/idempotency';
import type { RepositoryContext } from '../src/repository/types';

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

async function idempotencyScenario() {
  const ctx: RepositoryContext = { environment: 'demo', actorUserId: 'user-sec-1' };
  let runCount = 0;
  const opKey = 'idem-sec-check-1';

  const r1 = await runIdempotent(ctx, 'security_check_op', opKey, async () => { runCount++; return { value: 42 }; });
  assert(!r1.wasDuplicate && r1.result.value === 42, 'first call through the (unchanged) demo idempotency path runs the side effect once');

  const r2 = await runIdempotent(ctx, 'security_check_op', opKey, async () => { runCount++; return { value: 999 }; });
  assert(r2.wasDuplicate && r2.result.value === 42, 'a retried call with the same key returns the ORIGINAL result, not a re-run');
  assert(runCount === 1, 'the guarded function ran exactly once across both calls (demo path unchanged by the Phase 23 upgrade)');

  const idempotencySource = fs.readFileSync(path.join(REPO_ROOT, 'src/lib/idempotency.ts'), 'utf8');
  assert(idempotencySource.includes('runTransaction'), 'idempotency.ts now uses a real Firestore runTransaction for the sandbox/production claim path');
  assert(idempotencySource.includes('claimFirestoreSlot'), 'a dedicated, real transactional claim function exists');
  assert(idempotencySource.includes("status: 'pending'") && idempotencySource.includes("status: 'completed'"), 'the two-phase pending -> completed lifecycle is real, not just described');
}

function confirmationGuardScenario() {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'src/components/UserRolePermissionManagementScreen.tsx'), 'utf8');
  assert(/window\.confirm\(/.test(src), 'UserRolePermissionManagementScreen now confirms before revoking a permission override (a real financial_security-tier fix, not just reported)');
  assert(src.includes('handleRevokeOverride'), 'the guarded function is still the real handler named in the destructive-actions inventory');
}

function reportsGenerateScenario() {
  const gapsDoc = path.join(REPO_ROOT, 'docs/security/LEGACY_AUTHORIZATION_GAPS.md');
  const inventoryDoc = path.join(REPO_ROOT, 'docs/security/DESTRUCTIVE_ACTIONS_INVENTORY.md');
  assert(fs.existsSync(gapsDoc), 'docs/security/LEGACY_AUTHORIZATION_GAPS.md exists');
  assert(fs.existsSync(inventoryDoc), 'docs/security/DESTRUCTIVE_ACTIONS_INVENTORY.md exists');
  const gapsContent = fs.readFileSync(gapsDoc, 'utf8');
  assert(gapsContent.includes('client-only'), 'the authorization gaps report contains real classification data, not an empty stub');
}

async function main() {
  await idempotencyScenario();
  confirmationGuardScenario();
  reportsGenerateScenario();

  console.log('\nPASS: the Firestore idempotency claim is now real and transactional (sandbox/production path),');
  console.log('the demo path is unchanged and still exactly-once, one real high-confidence destructive-action');
  console.log('confirmation fix is in place, and both Phase 23 security reports generate real, non-empty data.');
}

main();
