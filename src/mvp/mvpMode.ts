/**
 * MVP_MODE (D-22): on by default. When on, the app shows only the MVP screens for each
 * role, through one router (src/mvp/screens/MvpRouter.tsx); hidden screens are never
 * mounted. Off = the legacy app exactly as before.
 *
 * Off switches: build with `VITE_MVP_MODE=off`, or (per browser, for the Admin's own
 * testing) localStorage `aiec_mvp_mode=off`. The local switch changes only what this
 * browser shows; firestore.rules still decide what anyone can read or write.
 */

import type { CanonicalUserRole } from '../domain/entities';

const env: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' ? ((import.meta as any).env ?? {}) : {};

export function isMvpMode(): boolean {
  if (env.VITE_MVP_MODE === 'off') return false;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('aiec_mvp_mode') === 'off') return false;
  } catch {
    // Storage can be unavailable (private mode); fall back to the build default.
  }
  return true;
}

export function setLocalMvpMode(on: boolean): void {
  try {
    if (on) localStorage.removeItem('aiec_mvp_mode');
    else localStorage.setItem('aiec_mvp_mode', 'off');
  } catch {
    // ignore: the build default applies
  }
}

export type MvpTabId =
  | 'MvpDashboard' | 'MvpOrders' | 'MvpOrder' | 'MvpTasks' | 'MvpSettings'
  | 'MvpLeads' | 'MvpNewLead' | 'MvpLead' | 'MvpSurveys' | 'MvpSurvey' | 'MvpSuppliers' | 'MvpToday';

export interface MvpTab { id: MvpTabId; label: string; icon: string }

const DASHBOARD: MvpTab = { id: 'MvpDashboard', label: 'Dashboard', icon: 'dashboard' };
const ORDERS: MvpTab = { id: 'MvpOrders', label: 'Orders', icon: 'orders' };
const TASKS: MvpTab = { id: 'MvpTasks', label: 'My tasks', icon: 'tasks' };
const SETTINGS: MvpTab = { id: 'MvpSettings', label: 'Settings', icon: 'settings' };
const LEADS: MvpTab = { id: 'MvpLeads', label: 'Leads', icon: 'leads' };
const NEW_LEAD: MvpTab = { id: 'MvpNewLead', label: 'New lead', icon: 'leads' };
const SURVEYS: MvpTab = { id: 'MvpSurveys', label: 'Surveys', icon: 'survey' };
const SUPPLIERS: MvpTab = { id: 'MvpSuppliers', label: 'Suppliers', icon: 'supply' };
const TODAY: MvpTab = { id: 'MvpToday', label: 'Today', icon: 'work' };

/** The allow-list per role. Later steps add their screens here (plan §5). */
export const MVP_TABS: Record<CanonicalUserRole, MvpTab[]> = {
  admin: [DASHBOARD, ORDERS, LEADS, TASKS, SUPPLIERS, SETTINGS],
  owner: [DASHBOARD, ORDERS, LEADS, SUPPLIERS, SETTINGS],
  sales: [LEADS, NEW_LEAD, TASKS, ORDERS, SETTINGS],
  surveyor: [SURVEYS, TASKS, SETTINGS],
  technician: [TODAY, TASKS, SETTINGS],
  qc: [TASKS, SETTINGS],
  customer: [ORDERS, TASKS, SETTINGS],
  supplier: [SETTINGS],
};

export function mvpTabsFor(role: string): MvpTab[] {
  return MVP_TABS[role as CanonicalUserRole] ?? [SETTINGS];
}

/** Tabs a role may open, including the detail screens reached from a list. */
export function isAllowedTab(role: string, tabId: string): boolean {
  if (tabId === 'MvpOrder') return mvpTabsFor(role).some(t => t.id === 'MvpOrders' || t.id === 'MvpTasks' || t.id === 'MvpDashboard');
  if (tabId === 'MvpLead') return mvpTabsFor(role).some(t => t.id === 'MvpLeads');
  if (tabId === 'MvpNewLead') return role === 'admin' || role === 'sales';
  if (tabId === 'MvpSurvey') return mvpTabsFor(role).some(t => t.id === 'MvpSurveys') || role === 'admin';
  return mvpTabsFor(role).some(t => t.id === tabId);
}

export function homeTabFor(role: string): MvpTabId {
  return mvpTabsFor(role)[0]?.id ?? 'MvpSettings';
}
