/**
 * The one Admin dashboard (spec §9): TODAY, NEEDS ATTENTION, PIPELINE. Every item opens the
 * Order View. Read-only for the Owner. Health comes from src/mvp/health.ts (D-11).
 */

import React from 'react';
import { AlertTriangle, CalendarClock, Columns3, RefreshCw } from 'lucide-react';
import type { User } from '../../types';
import { Card } from '../../components/Common';
import { buildDashboard, PIPELINE_COLUMNS, type DashboardOrder } from '../services/readModels';
import { MVP_STAGE_LABELS } from '../stage';
import { formatDateTime } from '../format';
import { ErrorNote, HealthBadge, Loading, SectionTitle, useLoad, useMvpCtx } from './ui';

const PIPE_LABEL: Record<string, string> = { LEAD: 'Lead', QUALIFIED: 'Qualified', SURVEY: 'Survey', QUOTE: 'Quote', BOOKED: 'Booked', SITE_READY: 'Site ready', DELIVERY: 'Delivery', INSTALLATION: 'Installation', QC: 'QC', HANDOVER: 'Handover', AMC: 'AMC' };

export const AdminDashboard: React.FC<{ user: User; onOpenOrder: (id: string) => void }> = ({ user, onOpenOrder }) => {
  const { ctx } = useMvpCtx(user);
  const { data, error, loading, reload } = useLoad(() => buildDashboard(ctx), [ctx]);

  if (loading && !data) return <Loading label="Loading dashboard…" />;
  if (error) return <ErrorNote message={`Could not load the dashboard: ${error}`} />;
  if (!data) return null;

  const OrderRow: React.FC<{ o: DashboardOrder; emergency?: boolean }> = ({ o, emergency }) => (
    <button onClick={() => onOpenOrder(o.id)}
      className={`w-full text-left p-3 rounded-xl border cursor-pointer hover:bg-alabaster ${emergency ? 'border-error bg-error/5' : 'border-[#f0ebe2]'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-sm">#{o.code} · {o.customerName}</span>
        <HealthBadge health={o.health} />
      </div>
      <div className="text-xs text-warmgray mt-1">
        {MVP_STAGE_LABELS[o.stage]} · {o.progress}% · {o.currentTask ? <>{o.currentTask.title} · due {formatDateTime(o.currentTask.dueDate)}</> : 'NO NEXT ACTION'}
      </div>
    </button>
  );

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-charcoal">{user.role === 'owner' ? 'Company overview' : 'Admin dashboard'}</h2>
        <button onClick={reload} className="text-xs text-warmgray flex items-center gap-1 cursor-pointer"><RefreshCw className="w-3.5 h-3.5" />Refresh</button>
      </div>

      <Card className="p-4">
        <SectionTitle right={<CalendarClock className="w-4 h-4 text-warmgray" />}>Today</SectionTitle>
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
          {data.today.map(t => (
            <button key={t.key} disabled={t.orderIds.length === 0} onClick={() => t.orderIds[0] && onOpenOrder(t.orderIds[0])}
              className="p-2 rounded-xl bg-alabaster text-center cursor-pointer disabled:cursor-default">
              <div className="text-xl font-bold text-charcoal">{t.count}</div>
              <div className="text-[10px] font-semibold text-warmgray leading-tight">{t.label}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <SectionTitle right={<AlertTriangle className="w-4 h-4 text-warmgray" />}>Needs attention</SectionTitle>
        {data.attention.length === 0 && <p className="text-xs text-warmgray">Nothing needs attention. Every active order is on track.</p>}
        {data.attention.map(g => (
          <div key={g.bucket} className="space-y-1.5">
            <div className={`text-xs font-bold ${g.bucket === 'emergency' ? 'text-error' : 'text-charcoal'}`}>{g.label} ({g.orders.length})</div>
            {g.orders.map(o => <OrderRow key={`${g.bucket}-${o.id}`} o={o} emergency={g.bucket === 'emergency'} />)}
          </div>
        ))}
      </Card>

      <Card className="p-4">
        <SectionTitle right={<Columns3 className="w-4 h-4 text-warmgray" />}>Pipeline</SectionTitle>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {PIPELINE_COLUMNS.map(c => (
            <div key={c} className="min-w-[84px] flex-1 p-2 rounded-xl bg-alabaster text-center">
              <div className="text-lg font-bold">{data.pipeline[c]}</div>
              <div className="text-[10px] font-semibold text-warmgray">{PIPE_LABEL[c]}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 space-y-1.5">
        <SectionTitle>All orders ({data.orders.length})</SectionTitle>
        {data.orders.map(o => <OrderRow key={o.id} o={o} />)}
      </Card>
    </div>
  );
};
