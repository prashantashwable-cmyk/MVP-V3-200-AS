/**
 * Phase 28 acceptance check: proves the five operating surfaces are now
 * genuinely the PRIMARY landing experience — not just reachable (Phase
 * 20) — while every old screen/tab stays fully reachable, per this
 * phase's own explicit rule ("do NOT delete the old screens... Legacy
 * route compatibility may remain temporarily").
 *
 * Structural (reads the real source), same reasoning as every other
 * App.tsx-touching phase (10, 20, 21, 22) — no browser in this sandbox.
 *
 * Run with: npx tsx scripts/navigation-cutover-check.ts
 */
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
const APP_TSX = fs.readFileSync(path.join(REPO_ROOT, 'src/App.tsx'), 'utf8');

function main() {
  // --- 1. The default landing state is now the five-surface home ---------
  assert(
    APP_TSX.includes("const [activeTab, setActiveTab] = useState('OperatingSurfaces');"),
    'the initial activeTab state is "OperatingSurfaces" — covers both a fresh login AND a restored session on page reload (which never calls setActiveTab itself)',
  );

  // --- 2. Every real login-success path lands there too --------------------
  const cutoverSetActiveTabCount = (APP_TSX.match(/setActiveTab\('OperatingSurfaces'\); \/\/ Phase 28: full navigation cutover/g) || []).length;
  assert(cutoverSetActiveTabCount >= 4, `at least 4 explicit login-success paths (OTP/email-password/Google/demo-bypass) now land on OperatingSurfaces — found ${cutoverSetActiveTabCount}`);

  // The logout/reset handler is a DIFFERENT kind of moment (clearing
  // state while signed out) and is deliberately left alone — confirm it
  // still exists and was not accidentally cutover too or deleted.
  assert(/setOtpAttempts\(0\);\s*\n\s*setActiveTab\('Home'\);/.test(APP_TSX), 'the logout/reset handler still resets to "Home" — a deliberate, distinct case, not touched by the cutover');

  // --- 3. Old screens are NOT deleted — "Home" is still a real, reachable tab
  for (const [role, homeId] of [['admin', "id: 'Home', label: 'Overview'"], ['surveyor', "id: 'Home', label: 'Capture Portal'"], ['supplier', "id: 'Home', label: 'Catalog Engine'"]] as const) {
    assert(APP_TSX.includes(homeId), `${role}'s old dashboard tab is still present in getTabsByRole — not deleted, per this phase's own rule`);
  }
  assert(APP_TSX.includes("{ id: 'TechnicianHomeMyJobs'"), "technician's old dashboard tab is still present");
  assert(APP_TSX.includes("{ id: 'CustomerHomeDashboard'"), "customer's old dashboard tab is still present");

  // --- 4. OperatingSurfaces is now listed FIRST (visually primary) for every role
  const roles = ['admin', 'surveyor', 'technician', 'customer', 'supplier'];
  let firstEntryChecks = 0;
  for (const role of roles) {
    const caseIdx = APP_TSX.indexOf(`case '${role}':`);
    assert(caseIdx !== -1, `getTabsByRole has a case for role "${role}"`);
    const afterCase = APP_TSX.slice(caseIdx, caseIdx + 400);
    const firstIdMatch = afterCase.match(/\{\s*id: '([^']+)'/);
    assert(!!firstIdMatch, `role "${role}"'s tab list has at least one entry within the first 400 chars after its case`);
    firstEntryChecks++;
    assert(firstIdMatch![1] === 'OperatingSurfaces', `role "${role}"'s tab list starts with OperatingSurfaces, not "${firstIdMatch![1]}" — it is now visually primary, not just reachable`);
  }
  assert(firstEntryChecks === 5, `all 5 roles' tab lists were checked for OperatingSurfaces-first ordering (found ${firstEntryChecks})`);

  // --- 5. The command palette remains available (per this phase's own rule)
  assert(APP_TSX.includes('<CommandPalette'), 'the Phase 10 command palette is still mounted — "the command palette remains available"');

  console.log('\nPASS: the five operating surfaces are now the genuine default landing experience for every');
  console.log('real login path (including restored sessions) and are listed first in every role\'s navigation —');
  console.log('while every old dashboard tab remains fully present and reachable, and the command palette stays');
  console.log('available, satisfying this phase\'s explicit "do not delete the old screens" rule.');
}

main();
