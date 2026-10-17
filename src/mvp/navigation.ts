/**
 * MVP_MODE allow-list (D-22): the only tabs each role sees while the MVP
 * mode is on. With the mode off, App.tsx uses its legacy tab lists
 * unchanged; no legacy screen is removed from the code.
 */
import { LayoutDashboard, ClipboardList, Users, ListChecks, BarChart3, Settings as SettingsIcon, Bell } from 'lucide-react';
import type { MvpRole } from './types';

export interface MvpTab {
  id: string;
  label: string;
  icon: any;
}

export const MVP_TAB_IDS = ['MvpDashboard', 'MvpMyWork', 'MvpOrders', 'MvpLeads', 'MvpReports', 'MvpSettings', 'MvpNotifications', 'Settings'] as const;

const T = {
  dashboard: { id: 'MvpDashboard', label: 'Dashboard', icon: LayoutDashboard },
  myWork: { id: 'MvpMyWork', label: 'My work', icon: ListChecks },
  orders: { id: 'MvpOrders', label: 'Orders', icon: ClipboardList },
  leads: { id: 'MvpLeads', label: 'Leads', icon: Users },
  reports: { id: 'MvpReports', label: 'Reports', icon: BarChart3 },
  settings: { id: 'MvpSettings', label: 'Team & settings', icon: SettingsIcon },
  alerts: { id: 'MvpNotifications', label: 'Alerts', icon: Bell },
  profile: { id: 'Settings', label: 'Profile', icon: SettingsIcon },
};

const BY_ROLE: Record<MvpRole, MvpTab[]> = {
  admin: [T.dashboard, T.orders, T.leads, T.myWork, T.reports, T.alerts, T.settings],
  owner: [T.dashboard, T.orders, T.reports, T.alerts],
  sales: [T.leads, T.myWork, T.orders, T.alerts],
  surveyor: [T.myWork, T.orders, T.alerts, T.profile],
  technician: [T.myWork, T.orders, T.alerts, T.profile],
  qc: [T.myWork, T.orders, T.alerts],
  customer: [T.orders, T.myWork, T.alerts, T.profile],
  // D-12: suppliers have no login in Phase 1; if one signs in they see only their alerts.
  supplier: [T.alerts, T.profile],
};

export function mvpTabsForRole(role: string): MvpTab[] {
  return BY_ROLE[role as MvpRole] ?? [T.alerts];
}

let pendingOrderId: string | null = null;

/**
 * Open an order from anywhere: switch to the Orders tab and hand it the
 * order id. The id is held until the (lazily loaded) Orders screen mounts
 * and takes it, so the request cannot be lost to a race.
 */
export function openOrder(orderId: string): void {
  pendingOrderId = orderId;
  window.dispatchEvent(new CustomEvent('aiec_switch_tab', { detail: 'MvpOrders' }));
  window.dispatchEvent(new CustomEvent('aiec_open_project', { detail: orderId }));
}

export function takePendingOrder(): string | null {
  const id = pendingOrderId;
  pendingOrderId = null;
  return id;
}

export function mvpLandingTab(role: string): string {
  return mvpTabsForRole(role)[0].id;
}
