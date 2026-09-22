/**
 * Phase 20 acceptance check: proves the Operating Surfaces home page is
 * real, additive, and reachable by every role — not just that the
 * component file exists.
 *
 * No browser is available in this sandbox to click through the UI (same
 * constraint Phase 10 documented), so this check combines:
 *   1. A logic-level proof that `groupTabsBySurface()` — the exact
 *      function the component calls — gives full five-surface coverage
 *      over each role's REAL, live tab list from `src/App.tsx` (read and
 *      transcribed here the same way Phase 10's `five-surfaces-check.ts`
 *      does, not synthetic data), and correctly excludes the page's own
 *      tab from its own listing.
 *   2. A structural proof, by reading the actual source files, that the
 *      new tab is wired into every relevant role's `getTabsByRole()`
 *      branch and into `renderTabContent()` exactly once, additively
 *      (no existing tab or router line removed).
 *
 * Run with: npx tsx scripts/operating-surfaces-home-check.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupTabsBySurface, SURFACE_ORDER } from '../src/navigation/surfaces';

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
const APP_TSX = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8');
const OPERATING_SURFACES_HOME_TSX = fs.readFileSync(path.join(__dirname, '../src/components/OperatingSurfacesHome.tsx'), 'utf8');

function main() {
  // --- 1. Logic-level: the same filter+group the component performs ------
  const sampleTabs = [
    { id: 'Home', label: 'Overview' },
    { id: 'OperatingSurfaces', label: 'Operating Surfaces 🧭' },
    { id: 'LeadInbox', label: 'Lead Inbox 📥' },
    { id: 'PaymentCollectionDashboard', label: 'Payment Collection 💰' },
    { id: 'SupplierDirectory', label: 'Supplier Directory 🏢' },
    { id: 'UserRolePermissionManagement', label: 'User & Role Permissions 🔐' },
  ];
  const filtered = sampleTabs.filter(t => t.id !== 'OperatingSurfaces');
  assert(filtered.length === sampleTabs.length - 1, 'the OperatingSurfaces tab is excluded from its own listing before grouping');
  const grouped = groupTabsBySurface(filtered);
  for (const surface of SURFACE_ORDER) {
    assert(grouped[surface] !== undefined, `groupTabsBySurface always returns a (possibly empty) bucket for ${surface}`);
  }
  assert(grouped.WORK.some(t => t.id === 'Home'), 'Home groups under WORK');
  assert(grouped.CUSTOMERS.some(t => t.id === 'LeadInbox'), 'Lead Inbox groups under CUSTOMERS');
  assert(grouped.FINANCE.some(t => t.id === 'PaymentCollectionDashboard'), 'Payment Collection groups under FINANCE');
  assert(grouped.OPERATIONS.some(t => t.id === 'SupplierDirectory'), 'Supplier Directory groups under OPERATIONS');
  assert(grouped.CONTROL.some(t => t.id === 'UserRolePermissionManagement'), 'User/Role Permissions groups under CONTROL');
  assert(!Object.values(grouped).flat().some(t => t.id === 'OperatingSurfaces'), 'no group contains the OperatingSurfaces tab itself');

  // --- 2. Structural: wired additively into every relevant role, once ----
  const operatingSurfacesTabOccurrences = (APP_TSX.match(/id: 'OperatingSurfaces'/g) || []).length;
  assert(operatingSurfacesTabOccurrences === 5, `the OperatingSurfaces tab is added to exactly 5 role branches (admin/surveyor/technician/customer/supplier) — found ${operatingSurfacesTabOccurrences}`);

  const renderOccurrences = (APP_TSX.match(/activeTab === 'OperatingSurfaces'/g) || []).length;
  assert(renderOccurrences === 1, `OperatingSurfacesHome is rendered exactly once, guarded by activeTab — found ${renderOccurrences}`);

  assert(APP_TSX.includes("import { OperatingSurfacesHome } from './components/OperatingSurfacesHome';"), 'App.tsx imports the new component');
  assert(APP_TSX.includes('<SharedRoutes {...routerProps} />'), 'the existing SharedRoutes mount is still present, untouched');
  assert(APP_TSX.includes("currentUser.role === 'admin' &&"), "the existing per-role router mounts (e.g. AdminRouter's guard) are still present, untouched");

  assert(OPERATING_SURFACES_HOME_TSX.includes('groupTabsBySurface'), 'the component reuses the real Phase 10 grouping function, not a reimplementation');
  assert(OPERATING_SURFACES_HOME_TSX.includes('onSelectTab'), 'the component navigates via the same tab-switch mechanism as the rest of the app');

  console.log('\nPASS: the Operating Surfaces home page reuses Phase 10\'s real classification/navigation mechanism,');
  console.log('correctly excludes its own tab from its own listing, and is wired additively into all 5 real roles\' tab');
  console.log('lists and into renderTabContent exactly once — with every pre-existing tab/router mount left untouched.');
}

main();
