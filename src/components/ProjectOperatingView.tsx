import React, { useEffect, useMemo, useState } from 'react';
import { Building2, MapPin, User as UserIcon, AlertTriangle, IndianRupee, History, CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { Card } from './Common';
import type { User } from '../types';
import { resolveEnvironment } from '../lib/environment';
import type { RepositoryContext } from '../repository/types';
import { projectRepository } from '../repository/entities';
import { getProjectOperatingView, type ProjectOperatingView as ProjectOperatingViewData } from '../services/projectOperatingView';
import type { Project } from '../domain/entities';

/**
 * Project-centric operating view — Phase 21.
 *
 * "Make the Project the central operational context... this is the
 * company's operational truth." The first screen in this app to read
 * the canonical repository layer DIRECTLY through a domain service
 * (`getProjectOperatingView`) rather than `DbManager` — the exact
 * UI -> Domain Service -> Repository shape rule #9 names as the target
 * architecture for every migrated screen, demonstrated end to end on a
 * brand-new screen rather than risked on one of the 189 existing ones.
 *
 * Self-contained: manages its own selected-project state (a simple
 * project picker, since no existing screen currently threads a
 * `projectId` through App.tsx's props chain) so it is mountable with
 * only a `user` prop, additively, exactly like `OperatingSurfacesHome`
 * (Phase 20) and `CommandPalette`/`EnvironmentBadge` before it.
 */

interface ProjectOperatingViewProps {
  user: User;
}

const STAGE_LABELS: Record<string, string> = {
  lead: 'Lead', customer_site_confirmed: 'Customer/Site', quoting: 'Quote', negotiation: 'Negotiation',
  contract: 'Contract', payment: 'Payment', procurement: 'Procurement', production: 'Production',
  delivery: 'Delivery', installation: 'Installation', qc: 'QC', handover: 'Handover',
  warranty_amc: 'Warranty/AMC', service: 'Service', closed_lost: 'Closed (Lost)',
};

export const ProjectOperatingView: React.FC<ProjectOperatingViewProps> = ({ user }) => {
  const ctx: RepositoryContext = useMemo(
    () => ({ environment: resolveEnvironment(user), actorUserId: user.id }),
    [user],
  );

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [view, setView] = useState<ProjectOperatingViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await projectRepository(ctx).list();
        if (cancelled) return;
        setProjects(list as unknown as Project[]);
        if (list.length > 0 && !selectedProjectId) setSelectedProjectId(list[0].id);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.environment]);

  useEffect(() => {
    if (!selectedProjectId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getProjectOperatingView(ctx, selectedProjectId as any);
        if (!cancelled) setView(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => { cancelled = true; };
  }, [ctx, selectedProjectId]);

  if (loading) {
    return <div className="p-6 text-sm text-warmgray">Loading canonical projects…</div>;
  }

  if (error) {
    return (
      <Card className="p-6 space-y-2">
        <div className="flex items-center gap-2 text-error"><AlertTriangle className="w-4 h-4" /><span className="font-bold">Could not load project data</span></div>
        <p className="text-xs text-warmgray">{error}</p>
      </Card>
    );
  }

  if (projects.length === 0) {
    return (
      <Card className="p-6 text-center space-y-2">
        <p className="text-sm text-warmgray">No canonical projects exist yet in this environment.</p>
        <p className="text-xs text-warmgray">Projects are created by the dual-write bridges (Phase 15+) as real Lead/Deal actions happen in the legacy screens.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-24">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-serif text-xl font-bold text-charcoal">Project Operating View</h1>
        <select
          value={selectedProjectId ?? ''}
          onChange={e => setSelectedProjectId(e.target.value)}
          className="text-sm border border-[rgba(184,135,61,0.25)] rounded-lg px-3 py-1.5 bg-white text-charcoal"
        >
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.title} ({p.stage})</option>
          ))}
        </select>
      </div>

      {view && (
        <>
          <Card className="p-5 space-y-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2 text-charcoal"><Building2 className="w-4 h-4 text-[#B8873D]" /> {view.customer?.name ?? '—'}</div>
              <div className="flex items-center gap-2 text-charcoal"><MapPin className="w-4 h-4 text-[#B8873D]" /> {view.site?.address ?? '—'}</div>
              <div className="flex items-center gap-2 text-charcoal"><UserIcon className="w-4 h-4 text-[#B8873D]" /> Owner: {view.owner?.userId ?? '—'}</div>
            </div>
            <div className="flex items-center gap-2 text-sm text-charcoal bg-[rgba(184,135,61,0.08)] rounded-lg px-3 py-2">
              <ArrowRight className="w-4 h-4 text-[#B8873D] shrink-0" />
              <span><strong>Next action:</strong> {view.nextAction}</span>
            </div>
          </Card>

          {view.blockers.length > 0 && (
            <Card className="p-5 space-y-2 border-error/30">
              <div className="flex items-center gap-2 text-error font-bold text-sm"><AlertTriangle className="w-4 h-4" /> Blockers</div>
              <ul className="space-y-1 text-sm text-charcoal">
                {view.blockers.map((b, i) => <li key={i} className="flex items-start gap-2"><span className="text-error">•</span>{b}</li>)}
              </ul>
            </Card>
          )}

          <Card className="p-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-charcoal"><IndianRupee className="w-4 h-4 text-[#B8873D]" /> Financial state</div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div><div className="text-warmgray text-xs">Paid</div><div className="font-bold text-charcoal">₹{view.financial.totalPaid.toLocaleString('en-IN')}</div></div>
              <div><div className="text-warmgray text-xs">PO value</div><div className="font-bold text-charcoal">₹{view.financial.poValue.toLocaleString('en-IN')}</div></div>
              <div><div className="text-warmgray text-xs">Schedule</div><div className="font-bold text-charcoal">{view.financial.scheduleActive ? 'Active' : 'None'}</div></div>
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <div className="text-sm font-bold text-charcoal">Timeline</div>
            <div className="flex flex-wrap gap-2">
              {view.timeline.map(step => (
                <div key={step.stage} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                  step.status === 'done' ? 'bg-royalemerald/10 text-royalemerald' :
                  step.status === 'current' ? 'bg-[#B8873D]/15 text-[#B8873D] font-bold' : 'bg-[rgba(0,0,0,0.04)] text-warmgray'
                }`}>
                  {step.status === 'done' ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                  {STAGE_LABELS[step.stage] ?? step.stage}
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-charcoal"><History className="w-4 h-4 text-[#B8873D]" /> Audit history ({view.auditHistory.length})</div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {view.auditHistory.length === 0 && <p className="text-xs text-warmgray">No audit events recorded for this project yet.</p>}
              {view.auditHistory.slice(0, 20).map(ev => (
                <div key={ev.id} className="text-xs text-charcoal border-b border-[rgba(184,135,61,0.08)] py-1">
                  <span className="font-mono text-warmgray">{new Date(ev.timestamp).toLocaleString('en-IN')}</span> — <strong>{ev.action}</strong> by {ev.actorRole}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
};
