/**
 * Owner view (spec §27) and reports (spec §28): plain tables from the
 * canonical records. Margin only for Admin/Owner (I-5).
 */
import React from 'react';
import type { User } from '../../types';
import { formatInr } from '../../mvp/money';
import { buildReports } from '../../mvp/views';
import { Btn, C, ErrorText, Loading, Panel, Screen, useLoader, useServiceCtx } from '../../mvp/ui/kit';

const Grid: React.FC<{ rows: [string, React.ReactNode][] }> = ({ rows }) => (
  <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
    {rows.map(([k, v]) => (
      <div key={k} className="rounded-xl p-3" style={{ background: C.panel2 }}>
        <dt className="text-[11px]" style={{ color: C.muted }}>{k}</dt>
        <dd className="text-lg font-bold">{v}</dd>
      </div>
    ))}
  </dl>
);

export const MvpReports: React.FC<{ user: User }> = ({ user }) => {
  const ctx = useServiceCtx(user);
  const { data: r, error, loading, reload } = useLoader(() => buildReports(ctx.repo, ctx.actor, new Date()), [ctx]);
  if (loading && !r) return <Screen title="Reports"><Loading /></Screen>;
  if (error || !r) return <Screen title="Reports"><ErrorText error={error} /><Btn tone="ghost" onClick={reload}>Retry</Btn></Screen>;
  return (
    <Screen title={user.role === 'owner' ? 'Owner view' : 'Reports'} subtitle="Revenue, orders, pipeline, money and quality" right={<Btn tone="ghost" onClick={reload}>Refresh</Btn>}>
      <Panel title="Money">
        <Grid rows={[
          ['Booked value', formatInr(r.money.booked)],
          ['Collected', formatInr(r.money.collected)],
          ['Outstanding', formatInr(r.money.outstanding)],
          ...(r.money.estimatedMarginInr !== null ? [['Estimated margin (excl. tax)', formatInr(r.money.estimatedMarginInr)] as [string, string]] : []),
        ]} />
      </Panel>
      <Panel title="Operations">
        <Grid rows={[
          ['Active orders', r.operations.activeOrders], ['Active installations', r.operations.activeInstallations], ['Completed lifts', r.operations.completedLifts],
          ['Overdue tasks', r.operations.overdueTasks], ['Blocked tasks', r.operations.blockedTasks],
          ['Avg installation (days)', r.operations.avgInstallDays ?? '—'],
        ]} />
      </Panel>
      <Panel title="Sales">
        <Grid rows={[['Leads', r.sales.leads], ['Qualified', r.sales.qualified], ['Quotes', r.sales.quotes], ['Orders', r.sales.orders], ['Conversion', `${r.sales.conversionPct}%`]]} />
      </Panel>
      <Panel title="Quality">
        <Grid rows={[['QC pass', r.quality.qcPass], ['Rework', r.quality.rework], ['QC fail', r.quality.fail], ['Complaints & emergencies', r.quality.complaints]]} />
      </Panel>
      <Panel title="AMC">
        {r.amc.length === 0 ? <p className="text-sm" style={{ color: C.muted }}>No lifts handed over yet.</p> : (
          <ul className="text-sm space-y-1">{r.amc.map(x => <li key={x.code} className="flex justify-between"><span>{x.code}</span><b>{x.status.replace('_', ' ')}</b></li>)}</ul>
        )}
      </Panel>
    </Screen>
  );
};
