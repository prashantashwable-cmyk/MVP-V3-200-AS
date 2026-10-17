/**
 * The one Admin dashboard (spec §9): TODAY, NEEDS ATTENTION and PIPELINE.
 * Health and buckets come from the pure functions (D-11), computed when
 * the page loads (no scheduler in Phase 1). Every item opens the Order View.
 */
import React from 'react';
import type { User } from '../../types';
import { BUCKET_LABELS, buildDashboard } from '../../mvp/views';
import { Btn, C, Empty, ErrorText, Loading, Panel, Screen, useLoader, useServiceCtx } from '../../mvp/ui/kit';
import { OrderRow } from './MvpOrders';
import { openOrder } from '../../mvp/navigation';


export const MvpDashboard: React.FC<{ user: User }> = ({ user }) => {
  const ctx = useServiceCtx(user);
  const { data, error, loading, reload } = useLoader(() => buildDashboard(ctx.repo, ctx.actor, new Date()), [ctx]);
  if (loading && !data) return <Screen title="Dashboard"><Loading /></Screen>;
  if (error || !data) return <Screen title="Dashboard"><ErrorText error={error} /><Btn tone="ghost" onClick={reload}>Retry</Btn></Screen>;
  return (
    <Screen title="Dashboard" subtitle="What happened, what's next, who owns it, when it's due" right={<Btn tone="ghost" onClick={reload}>Refresh</Btn>}>
      <Panel title="Today">
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
          {Object.entries(data.today).map(([k, v]) => (
            <div key={k} className="rounded-xl p-2 text-center" style={{ background: C.panel2 }}>
              <div className="text-xl font-bold" style={{ color: v ? C.gold : C.muted }}>{v}</div>
              <div className="text-[10px]" style={{ color: C.muted }}>{k}</div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Needs attention">
        {data.attention.length === 0 ? <Empty>Nothing needs attention. Every active order is on track.</Empty> : data.attention.map(a => (
          <div key={a.bucket} className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: a.bucket === 'EMERGENCY' ? '#FF6B6B' : C.gold }}>{BUCKET_LABELS[a.bucket]} · {a.orders.length}</h3>
            {a.orders.map(o => <OrderRow key={`${a.bucket}_${o.id}`} s={o} onOpen={() => openOrder(o.id)} />)}
          </div>
        ))}
      </Panel>
      <Panel title="Pipeline">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {data.pipeline.map(p => (
            <div key={p.column} className="rounded-xl p-2 min-w-[86px] text-center" style={{ background: C.panel2 }}>
              <div className="text-lg font-bold" style={{ color: p.count ? C.text : C.muted }}>{p.count}</div>
              <div className="text-[10px]" style={{ color: C.muted }}>{p.column}</div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title={`All orders (${data.rows.length})`}>
        {data.rows.length === 0 ? <Empty>No orders yet. Qualify a lead to create the first order.</Empty> : data.rows.map(o => <OrderRow key={o.id} s={o} onOpen={() => openOrder(o.id)} />)}
      </Panel>
    </Screen>
  );
};
