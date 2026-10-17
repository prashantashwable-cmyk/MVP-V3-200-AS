/**
 * MVP_MODE navigation (D-22): with the mode on, each role gets only its
 * allow-listed MVP tabs; with it off, App.tsx returns its legacy lists
 * unchanged; no legacy screen file is removed.
 * Run: npx tsx scripts/mvp/navigation-check.ts
 */
import fs from 'fs';
import path from 'path';
import { check, eq, summary } from './assert';
import { MVP_TAB_IDS, mvpTabsForRole, mvpLandingTab } from '../../src/mvp/navigation';

const roles = ['admin', 'owner', 'sales', 'surveyor', 'technician', 'qc', 'customer', 'supplier'];
for (const r of roles) {
  const tabs = mvpTabsForRole(r).map(t => t.id);
  check(tabs.length > 0 && tabs.every(id => (MVP_TAB_IDS as readonly string[]).includes(id)), `${r}: only MVP tabs (${tabs.join(', ')})`);
}
eq(mvpLandingTab('admin'), 'MvpDashboard', 'admin lands on the dashboard');
eq(mvpLandingTab('owner'), 'MvpDashboard', 'owner lands on the dashboard');
eq(mvpLandingTab('technician'), 'MvpMyWork', 'technician lands on My work');
eq(mvpLandingTab('customer'), 'MvpOrders', 'customer lands on their orders');
check(!mvpTabsForRole('owner').some(t => t.id === 'MvpSettings'), 'owner cannot reach Team & settings');
check(!mvpTabsForRole('customer').some(t => ['MvpDashboard', 'MvpReports', 'MvpLeads'].includes(t.id)), 'customer sees no dashboard, reports or leads');

const app = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');
check(app.includes('isMvpModeOn() ? mvpTabsForRole(role) : getLegacyTabsByRole(role)'), 'App.tsx: mode off returns the legacy tab lists unchanged');
check(/const getLegacyTabsByRole = \(role: UserRole\) => \{\s*switch \(role\)/.test(app), 'App.tsx: legacy tab lists are still present');
const components = fs.readdirSync(path.join(process.cwd(), 'src', 'components')).filter(f => f.endsWith('.tsx'));
check(components.length >= 194, `no legacy screen deleted (${components.length} component files)`);

summary('mvp navigation check');
