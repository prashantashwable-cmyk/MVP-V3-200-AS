import React, { useEffect, useMemo, useState } from 'react';
import { AlertOctagon, AlertTriangle, Clock, CheckCircle2, ArrowRight } from 'lucide-react';
import { Card } from './Common';
import type { User } from '../types';
import { resolveEnvironment } from '../lib/environment';
import type { RepositoryContext } from '../repository/types';
import { getWorkQueueItems, getMvpTaskQueue, type WorkQueueItem } from '../services/workQueue';
import { isMvpMode } from '../mvp/mvpMode';
import { toMvpActor } from '../mvp/screens/ui';
import { formatDateTime } from '../mvp/format';
import type { Task } from '../domain/entities';
import type { ControlTowerCategory } from '../services/controlTower';

/**
 * Next Best Action + Work Queue — Phase 22.
 *
 * "The Work surface should become the employee's primary daily
 * interface." One real work item per actionable canonical Project,
 * generated from actual workflow state (`getWorkQueueItems()`) — never
 * a static card. Clicking an item deep-links straight into Phase 21's
 * `ProjectOperatingView` via the `aiec_open_project` event, then
 * switches to that tab via the existing `aiec_switch_tab` mechanism —
 * both real, already-proven navigation primitives, no new routing.
 */

interface WorkQueueScreenProps {
  user: User;
}

const PRIORITY_STYLE: Record<ControlTowerCategory, { icon: React.ComponentType<{ className?: string }>; classes: string; label: string }> = {
  critical: { icon: AlertOctagon, classes: 'text-error bg-error/10', label: 'Critical' },
  at_risk: { icon: AlertTriangle, classes: 'text-[#B8873D] bg-[#B8873D]/10', label: 'At Risk' },
  waiting: { icon: Clock, classes: 'text-warmgray bg-[rgba(0,0,0,0.05)]', label: 'Waiting' },
  on_track: { icon: CheckCircle2, classes: 'text-royalemerald bg-royalemerald/10', label: 'On Track' },
};

const LegacyWorkQueueScreen: React.FC<WorkQueueScreenProps> = ({ user }) => {
  const ctx: RepositoryContext = useMemo(() => ({ environment: resolveEnvironment(user), actorUserId: user.id }), [user]);
  const [items, setItems] = useState<WorkQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getWorkQueueItems(ctx);
        if (!cancelled) setItems(list);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ctx]);

  function openProject(projectId: string) {
    window.dispatchEvent(new CustomEvent('aiec_open_project', { detail: projectId }));
    window.dispatchEvent(new CustomEvent('aiec_switch_tab', { detail: 'ProjectOperatingView' }));
  }

  if (loading) return <div className="p-6 text-sm text-warmgray">Calculating next best actions from live workflow state…</div>;
  if (error) return <Card className="p-6 text-sm text-error">Could not load the work queue: {error}</Card>;

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-24">
      <div className="space-y-1">
        <h1 className="font-serif text-xl font-bold text-charcoal">My Work Queue</h1>
        <p className="text-sm text-warmgray">One real item per project that needs a next action — generated from live workflow state, not a static list.</p>
      </div>

      {items.length === 0 && (
        <Card className="p-6 text-center text-sm text-warmgray">Nothing needs action right now.</Card>
      )}

      <div className="space-y-2">
        {items.map(item => {
          const style = PRIORITY_STYLE[item.priority];
          const Icon = style.icon;
          return (
            <Card key={item.id} className="p-4 flex items-start justify-between gap-3 cursor-pointer hover:shadow-md transition-shadow" onClick={() => openProject(item.projectId)}>
              <div className="flex items-start gap-3 min-w-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${style.classes}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-charcoal truncate">{item.projectTitle}</span>
                    <span className={`text-[10px] font-mono uppercase tracking-wide px-2 py-0.5 rounded-full ${style.classes}`}>{style.label}</span>
                  </div>
                  <p className="text-xs text-charcoal mt-0.5">{item.requiredAction}</p>
                  <p className="text-[11px] text-warmgray mt-0.5">{item.slaText} · Owner: {item.owner}</p>
                  {item.blockers.length > 0 && (
                    <p className="text-[11px] text-error mt-1">{item.blockers[0]}{item.blockers.length > 1 ? ` (+${item.blockers.length - 1} more)` : ''}</p>
                  )}
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-warmgray shrink-0 mt-1" />
            </Card>
          );
        })}
      </div>
    </div>
  );
};

/**
 * MVP (D-06): "My tasks" — the viewer's open persisted tasks, soonest due first.
 * Tapping a task opens its order in the Universal Order View.
 */
const MvpTaskQueue: React.FC<{ user: User; onOpenOrder?: (orderId: string) => void }> = ({ user, onOpenOrder }) => {
  const ctx: RepositoryContext = useMemo(() => ({ environment: resolveEnvironment(user), actorUserId: user.id }), [user]);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getMvpTaskQueue(ctx, toMvpActor(user))
      .then(t => { if (!cancelled) setTasks(t); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [ctx, user]);
  if (error) return <Card className="p-4 text-xs text-error">Could not load your tasks: {error}</Card>;
  if (!tasks) return <div className="p-6 text-sm text-warmgray">Loading your tasks…</div>;
  const now = Date.now();
  return (
    <div className="space-y-2 max-w-3xl mx-auto pb-24">
      <h2 className="text-lg font-bold text-charcoal">My tasks</h2>
      {tasks.length === 0 && <Card className="p-6 text-sm text-warmgray">You have no open tasks.</Card>}
      {tasks.map(t => {
        const overdue = new Date(t.dueDate).getTime() < now;
        return (
          <button key={t.id} disabled={!t.orderId} onClick={() => t.orderId && onOpenOrder?.(t.orderId)} className="w-full text-left cursor-pointer">
            <Card className={`p-4 ${overdue ? 'border-error/40' : ''}`} hoverEffect>
              <div className="flex justify-between gap-2">
                <span className="font-bold text-sm">{t.title}</span>
                <span className={`text-[11px] font-bold ${t.status === 'BLOCKED' || overdue ? 'text-error' : 'text-warmgray'}`}>{t.status === 'BLOCKED' ? 'BLOCKED' : overdue ? 'OVERDUE' : t.status.replace('_', ' ')}</span>
              </div>
              <div className="text-xs text-warmgray mt-1 flex items-center gap-1"><Clock className="w-3.5 h-3.5" />Due {formatDateTime(t.dueDate)}{t.leadId ? ' · lead' : ''}</div>
            </Card>
          </button>
        );
      })}
    </div>
  );
};

export const WorkQueueScreen: React.FC<WorkQueueScreenProps & { onOpenOrder?: (orderId: string) => void }> = ({ user, onOpenOrder }) =>
  isMvpMode() ? <MvpTaskQueue user={user} onOpenOrder={onOpenOrder} /> : <LegacyWorkQueueScreen user={user} />;

