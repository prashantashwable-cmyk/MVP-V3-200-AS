/** Icons for MVP navigation tabs (names used in src/mvp/mvpMode.ts). */
import type React from 'react';
import {
  LayoutDashboard, Building2, ListChecks, Settings, UserPlus, Ruler, FileText, Wrench, ShieldCheck, Users, BarChart3, LifeBuoy, Truck,
} from 'lucide-react';

export const MVP_NAV_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard, orders: Building2, tasks: ListChecks, settings: Settings, leads: UserPlus, survey: Ruler,
  quote: FileText, work: Wrench, qc: ShieldCheck, users: Users, reports: BarChart3, amc: LifeBuoy, supply: Truck,
};
