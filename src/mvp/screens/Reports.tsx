/**
 * Reports (spec §28): Sales, Operations, Money, Quality — four small tables, no analytics
 * platform. Admin/Owner only. Reuses `buildReports` (src/mvp/services/reports.ts); the
 * "Quality report" rework count referenced in S4 is the Quality section's Rework figure.
 * Why not reuse RevenueProfitAnalytics/SalesFunnelAnalytics: 1,398/1,031-line legacy
 * DbManager dashboards with charts this MVP doesn't need; a plain table is enough at 10–20
 * lifts.
 */

import React from 'react';
import type { User } from '../../types';
import { Card } from '../../components/Common';
import { buildReports } from '../services/reports';
import { formatInr } from '../format';
import { ErrorNote, Loading, SectionTitle, useLoad, useMvpCtx } from './ui';

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex justify-between text-sm py-1 border-b border-[#f0ebe2] last:border-0"><span className="text-warmgray">{label}</span><span className="font-bold">{value}</span></div>
);

export const Reports: React.FC<{ user: User }> = ({ user }) => {
  const { ctx } = useMvpCtx(user);
  const { data, error, loading } = useLoad(() => buildReports(ctx), [ctx]);
  if (loading && !data) return <Loading label="Loading reports…" />;
  if (error) return <ErrorNote message={`Could not load reports: ${error}`} />;
  if (!data) return null;

  return (
    <div className="space-y-4 max-w-3xl mx-auto pb-24">
      <h2 className="text-lg font-bold text-charcoal">Reports</h2>

      <Card className="p-4">
        <SectionTitle>Sales</SectionTitle>
        <Row label="Total leads" value={data.sales.totalLeads} />
        <Row label="Qualified" value={data.sales.qualified} />
        <Row label="Quotes sent" value={data.sales.quotesSent} />
        <Row label="Orders (won)" value={data.sales.orders} />
        <Row label="Conversion" value={`${data.sales.conversionPct}%`} />
      </Card>

      <Card className="p-4">
        <SectionTitle>Operations</SectionTitle>
        <Row label="Active orders" value={data.operations.activeOrders} />
        <Row label="Overdue tasks" value={data.operations.overdueTasks} />
        <Row label="Blocked tasks" value={data.operations.blockedTasks} />
        <Row label="Avg. installation time" value={data.operations.avgInstallDays != null ? `${data.operations.avgInstallDays} days` : 'Not enough data yet'} />
      </Card>

      <Card className="p-4">
        <SectionTitle>Money</SectionTitle>
        <Row label="Booked value" value={formatInr(data.money.booked)} />
        <Row label="Collected" value={formatInr(data.money.collected)} />
        <Row label="Outstanding" value={formatInr(data.money.outstanding)} />
        <Row label="Estimated margin" value={data.money.marginPct != null ? `${data.money.marginPct}%` : '—'} />
      </Card>

      <Card className="p-4">
        <SectionTitle>Quality</SectionTitle>
        <Row label="QC pass" value={data.quality.qcPass} />
        <Row label="Rework" value={data.quality.rework} />
        <Row label="Complaints" value={data.quality.complaints} />
      </Card>
    </div>
  );
};
