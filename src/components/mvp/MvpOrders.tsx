/**
 * Order list → Order View, for every role (each sees only what the rules
 * let them read). Deep links use the existing `aiec_open_project` event.
 */
import React, { useEffect, useState } from 'react';
import type { User } from '../../types';
import { formatInr, formatIst } from '../../mvp/money';
import { loadSummaries, listOrdersFor, type OrderSummary } from '../../mvp/views';
import { Btn, C, Empty, ErrorText, HealthBadge, Loading, Panel, Screen, Select, useLoader, useServiceCtx } from '../../mvp/ui/kit';
import { t } from '../../mvp/ui/i18n';
import { mvpRepos } from '../../mvp/repo';
import { OrderView } from './OrderView';
import { takePendingOrder } from '../../mvp/navigation';

export const OrderRow: React.FC<{ s: OrderSummary; onOpen: () => void }> = ({ s, onOpen }) => (
  <button onClick={onOpen} className="w-full text-left rounded-xl p-3 flex items-center gap-3 flex-wrap focus-visible:ring-2 focus-visible:ring-[#E6C473] min-h-[56px]"
    style={{ background: s.openEmergency ? '#3B1418' : C.panel2, border: `1px solid ${s.openEmergency ? '#C0392B' : C.line}` }}>
    <span className="font-mono font-bold text-sm" style={{ color: C.gold }}>{s.displayCode}</span>
    <span className="flex-1 min-w-[160px]">
      <span className="block text-sm font-semibold">{s.customerName}</span>
      <span className="block text-[11px]" style={{ color: C.muted }}>{s.stageLabel} · {s.progress}% · {s.nextAction}{s.dueDate ? ` · due ${formatIst(s.dueDate)}` : ''}</span>
    </span>
    <span className="text-[11px]" style={{ color: C.muted }}>{s.total ? `${formatInr(s.paid)} / ${formatInr(s.total)}` : ''}</span>
    <HealthBadge health={s.health} />
  </button>
);

export const MvpOrders: React.FC<{ user: User }> = ({ user }) => {
  const [openId, setOpenId] = useState<string | null>(() => takePendingOrder());
  const [filter, setFilter] = useState<'ACTIVE' | 'ALL'>('ACTIVE');
  // Demo only: "Try as Customer" has no linked customer record, so the trainer picks whose order to view.
  const [demoCustomer, setDemoCustomer] = useState<string>('');
  const needsDemoPick = user.isDemo && user.role === 'customer' && !(user as any).customerId;
  const ctx = useServiceCtx(user, demoCustomer || undefined);
  const { data, error, loading, reload } = useLoader(() => loadSummaries(ctx.repo, ctx.actor, new Date()), [ctx]);
  const demoOrders = useLoader(async () => (needsDemoPick ? (await mvpRepos(ctx.repo).orders.list()).filter(o => o.displayCode) : []), [needsDemoPick]);

  useEffect(() => {
    const h = (e: Event) => { const id = (e as CustomEvent).detail; if (typeof id === 'string') { takePendingOrder(); setOpenId(id); } };
    window.addEventListener('aiec_open_project', h);
    return () => window.removeEventListener('aiec_open_project', h);
  }, []);

  if (openId) {
    return (
      <Screen title="Order">
        <OrderView user={user} orderId={openId} customerOverride={demoCustomer || undefined} onBack={() => { setOpenId(null); reload(); }} />
      </Screen>
    );
  }
  const rows = (data ?? []).map(d => d.summary).filter(s => filter === 'ALL' || s.status === 'ACTIVE' || s.status === 'ON_HOLD');
  return (
    <Screen title={t('orders')} subtitle="Every order, its stage, next action, owner and due date"
      right={<Select aria-label="Filter" value={filter} onChange={e => setFilter(e.target.value as any)} className="!w-auto"><option value="ACTIVE">Active</option><option value="ALL">All incl. completed & cancelled</option></Select>}>
      {needsDemoPick && (
        <Panel title="Demo: view as the customer of…">
          <Select value={demoCustomer} onChange={e => setDemoCustomer(e.target.value)}>
            <option value="">Choose an order</option>
            {(demoOrders.data ?? []).map(o => <option key={o.id} value={o.customerId}>{o.displayCode} · {o.displaySummary?.customerName}</option>)}
          </Select>
        </Panel>
      )}
      {loading && !data ? <Loading /> : error ? <><ErrorText error={error} /><Btn tone="ghost" onClick={reload}>{t('retry')}</Btn></> : rows.length === 0 ? (
        <Empty>{user.role === 'customer' ? 'No orders linked to your login yet. The Admin links your login to your order.' : 'No orders yet. Orders are created when a lead is qualified.'}</Empty>
      ) : (
        <div className="space-y-2">{rows.map(s => <OrderRow key={s.id} s={s} onOpen={() => setOpenId(s.id)} />)}</div>
      )}
    </Screen>
  );
};

export { listOrdersFor };
