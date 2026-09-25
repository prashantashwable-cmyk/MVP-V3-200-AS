/**
 * Owner View (spec §27): revenue, orders, pipeline, outstanding payments, estimated margin,
 * active installations, completed lifts, AMC. Read-only (D-12) — every number links into the
 * same Order View everyone else uses; no separate operational control centre.
 * Why not build a second dashboard from scratch: the Admin dashboard (`AdminDashboard.tsx`)
 * already gives the Owner Today/Needs attention/Pipeline as a secondary tab; this adds only
 * the money and lifecycle totals the plan asks for (§27), reusing `buildDashboard`'s pipeline.
 */

import React from 'react';
import { IndianRupee, PiggyBank, Building2, Percent, Wrench, CheckCircle2, LifeBuoy } from 'lucide-react';
import type { User } from '../../types';
import { Card } from '../../components/Common';
import { buildOwnerSummary } from '../services/reports';
import { formatInr } from '../format';
import { ErrorNote, Loading, SectionTitle, useLoad, useMvpCtx } from './ui';

const Tile: React.FC<{ icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode }> = ({ icon: Icon, label, value }) => (
  <div className="p-3 rounded-xl bg-alabaster text-center space-y-0.5">
    <Icon className="w-4 h-4 text-[#B8873D] mx-auto" />
    <div className="text-lg font-bold text-charcoal">{value}</div>
    <div className="text-[10px] font-semibold text-warmgray leading-tight">{label}</div>
  </div>
);

export const OwnerView: React.FC<{ user: User }> = ({ user }) => {
  const { ctx } = useMvpCtx(user);
  const { data, error, loading } = useLoad(() => buildOwnerSummary(ctx), [ctx]);
  if (loading && !data) return <Loading label="Loading the company overview…" />;
  if (error) return <ErrorNote message={`Could not load the overview: ${error}`} />;
  if (!data) return null;

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-24">
      <h2 className="text-lg font-bold text-charcoal">Company overview</h2>

      <Card className="p-4 space-y-3">
        <SectionTitle>Money</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Tile icon={IndianRupee} label="Revenue collected" value={formatInr(data.revenueCollected)} />
          <Tile icon={PiggyBank} label="Outstanding" value={formatInr(data.outstanding)} />
          <Tile icon={Building2} label="Booked value" value={formatInr(data.bookedValue)} />
          <Tile icon={Percent} label="Est. margin" value={data.estimatedMarginPct != null ? `${data.estimatedMarginPct}%` : '—'} />
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <SectionTitle>Orders & lifecycle</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Tile icon={Building2} label="Orders" value={data.ordersCount} />
          <Tile icon={Wrench} label="Active installations" value={data.activeInstallations} />
          <Tile icon={CheckCircle2} label="Completed lifts" value={data.completedLifts} />
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <SectionTitle right={<LifeBuoy className="w-4 h-4 text-warmgray" />}>AMC</SectionTitle>
        <div className="grid grid-cols-5 gap-2 text-center text-xs">
          <div><div className="text-base font-bold">{data.amc.warranty}</div>Warranty</div>
          <div><div className="text-base font-bold text-[#8a6224]">{data.amc.due}</div>Due</div>
          <div><div className="text-base font-bold">{data.amc.offered}</div>Offered</div>
          <div><div className="text-base font-bold text-royalemerald">{data.amc.active}</div>Active</div>
          <div><div className="text-base font-bold text-error">{data.amc.lost}</div>Lost</div>
        </div>
      </Card>

      <p className="text-[11px] text-warmgray">Cost and margin figures are internal — never shown to the customer (I-5). See the Dashboard tab for pipeline, Needs Attention and the order-by-order list.</p>
    </div>
  );
};
