/** Orders the viewer may see (admin/owner: all; sales: own; customer: own; staff: assigned). */

import React from 'react';
import type { User } from '../../types';
import { Card } from '../../components/Common';
import { listOrdersFor } from '../services/readModels';
import { toMvpStage } from '../stage';
import { computeProgress } from '../progress';
import { ErrorNote, Loading, ProgressBar, useLoad, useMvpCtx, useMvpLang } from './ui';
import { translateStage } from '../i18n';

export const OrdersList: React.FC<{ user: User; onOpenOrder: (id: string) => void }> = ({ user, onOpenOrder }) => {
  const { ctx, actor } = useMvpCtx(user);
  const lang = useMvpLang();
  const { data, error, loading } = useLoad(() => listOrdersFor(ctx, actor), [ctx]);
  if (loading && !data) return <Loading label="Loading orders…" />;
  if (error) return <ErrorNote message={`Could not load orders: ${error}`} />;
  const orders = data ?? [];
  return (
    <div className="space-y-2 max-w-3xl mx-auto pb-24">
      <h2 className="text-lg font-bold text-charcoal">{user.role === 'customer' ? 'My lift' : 'Orders'}</h2>
      {orders.length === 0 && <Card className="p-6 text-sm text-warmgray">No orders yet.</Card>}
      {orders.map(o => {
        const stage = toMvpStage(o.stage);
        const progress = computeProgress({ stage, checklistDone: o.checklistDone, qcPassed: !!o.qcPassedAt });
        return (
          <button key={o.id} onClick={() => onOpenOrder(o.id)} className="w-full text-left cursor-pointer">
            <Card className="p-4 space-y-2" hoverEffect>
              <div className="flex justify-between gap-2">
                <span className="font-bold">#{o.displayCode ?? '—'} · {o.displaySummary?.customerName ?? o.title}</span>
                <span className="text-xs text-warmgray">{o.status && o.status !== 'ACTIVE' ? o.status.replace('_', ' ') : translateStage(lang, stage)}</span>
              </div>
              <div className="text-xs text-warmgray">{o.displaySummary?.siteAddress}</div>
              <ProgressBar value={progress} />
            </Card>
          </button>
        );
      })}
    </div>
  );
};
