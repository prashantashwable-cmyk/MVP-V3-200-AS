import React, { useMemo } from 'react';
import { Briefcase, Users, Settings2, Wallet, ShieldCheck, Grid } from 'lucide-react';
import { Card, IconTile } from './Common';
import { groupTabsBySurface, SURFACE_ORDER, SURFACE_LABELS, type Surface, type NavTab } from '../navigation/surfaces';

/**
 * Five Operating Surfaces — primary navigation home — Phase 20.
 *
 * "Make the Five Operating Surfaces Primary... The key UX rule: Users
 * should not need to know the name of the next screen. They should know
 * what they need to accomplish." Phase 10 built the surface model and
 * made it reachable via the Ctrl/Cmd+K command palette (necessarily
 * transient — a modal you open, use, and close). This component is the
 * next step: a real, full-page, always-reachable surface home — reusing
 * the exact same `groupTabsBySurface()` classification and
 * `aiec_switch_tab` navigation mechanism Phase 10 already proved live,
 * so nothing about how navigation actually works changes, only how
 * prominently it is organized and reached.
 *
 * Mounted as one new, additive tab (`OperatingSurfaces`) alongside every
 * existing tab — the legacy sidebar/bottom-nav and command palette both
 * remain fully intact and unchanged, per this phase's own explicit rule
 * ("do NOT delete the old screens... Reclassify them") and per Phase
 * 28's later, separate "full navigation cutover" being the point where
 * this becomes the default rather than an addition.
 */

const SURFACE_ICONS: Record<Surface, React.ComponentType<{ className?: string }>> = {
  WORK: Briefcase,
  CUSTOMERS: Users,
  OPERATIONS: Settings2,
  FINANCE: Wallet,
  CONTROL: ShieldCheck,
};

const SURFACE_TAGLINES: Record<Surface, string> = {
  WORK: 'What needs my attention today — tasks, approvals, exceptions, follow-ups.',
  CUSTOMERS: 'Every customer, project, and communication.',
  OPERATIONS: 'Procurement, production, delivery, installation, QC, service.',
  FINANCE: 'Quotes, payments, invoices, payables, reconciliation.',
  CONTROL: 'People, permissions, automation, compliance, settings, reports.',
};

interface OperatingSurfacesHomeProps {
  tabs: NavTab[];
  onSelectTab: (tabId: string) => void;
}

export const OperatingSurfacesHome: React.FC<OperatingSurfacesHomeProps> = ({ tabs, onSelectTab }) => {
  // Exclude this page's own tab from its own listing — otherwise it
  // shows up filed under CONTROL (the classifier's catch-all bucket for
  // a label it cannot confidently place), which is confusing, not wrong.
  const grouped = useMemo(() => groupTabsBySurface(tabs.filter(t => t.id !== 'OperatingSurfaces')), [tabs]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-24">
      <div className="space-y-1">
        <h1 className="font-serif text-2xl font-bold text-charcoal">Operating Surfaces</h1>
        <p className="text-sm text-warmgray">
          Everything you can do, organized by what you're trying to accomplish — not by screen name.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SURFACE_ORDER.map(surface => {
          const surfaceTabs = grouped[surface];
          if (surfaceTabs.length === 0) return null;
          const Icon = SURFACE_ICONS[surface];
          return (
            <Card key={surface} className="p-5 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[rgba(184,135,61,0.10)] flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-[#B8873D]" />
                </div>
                <div>
                  <h2 className="font-serif text-lg font-bold text-charcoal">{SURFACE_LABELS[surface]}</h2>
                  <p className="text-xs text-warmgray">{SURFACE_TAGLINES[surface]}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {surfaceTabs.map(tab => (
                  <IconTile
                    key={tab.id}
                    icon={tab.icon ?? Grid}
                    label={tab.label}
                    onClick={() => onSelectTab(tab.id)}
                  />
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
