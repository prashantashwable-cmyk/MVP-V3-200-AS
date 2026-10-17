/**
 * "My work" (spec §22): today's open tasks for the signed-in person, with
 * site, task, time; tapping one opens its order. Also the in-app alerts
 * list (spec §25).
 */
import React from 'react';
import type { User } from '../../types';
import * as svc from '../../mvp/service';
import { formatIst } from '../../mvp/money';
import { myTasks } from '../../mvp/views';
import { mvpRepos } from '../../mvp/repo';
import { Btn, C, Empty, ErrorText, Loading, Panel, Pill, Screen, useLoader, useServiceCtx } from '../../mvp/ui/kit';
import { t } from '../../mvp/ui/i18n';
import type { MvpNotification } from '../../mvp/types';
import { openOrder } from '../../mvp/navigation';

const open = (orderId: string) => {
  if (orderId) openOrder(orderId);
  else window.dispatchEvent(new CustomEvent('aiec_switch_tab', { detail: 'MvpLeads' }));
};

export const MvpMyWork: React.FC<{ user: User }> = ({ user }) => {
  const ctx = useServiceCtx(user);
  const { data, error, loading, reload } = useLoader(async () => {
    const tasks = await myTasks(ctx.repo, ctx.actor);
    const orders = new Map<string, { code: string; site: string }>();
    await Promise.all([...new Set(tasks.map(x => x.orderId).filter(Boolean))].map(async id => {
      const o = await mvpRepos(ctx.repo).orders.get(id).catch(() => null);
      if (o) orders.set(id, { code: o.displayCode ?? id, site: o.displaySummary?.siteAddress ?? o.title });
    }));
    return { tasks, orders };
  }, [ctx]);
  const now = new Date();
  const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);
  return (
    <Screen title={t('myWork')} subtitle="START → CHECK IN → DO WORK → UPLOAD EVIDENCE → COMPLETE" right={<Btn tone="ghost" onClick={reload}>Refresh</Btn>}>
      {loading && !data ? <Loading /> : error ? <ErrorText error={error} /> : !data?.tasks.length ? <Empty>{t('nothingToDo')}</Empty> : (
        <>
          {([['Today & overdue', (d: Date) => d <= endOfToday], ['Coming up', (d: Date) => d > endOfToday]] as const).map(([label, test]) => {
            const list = data.tasks.filter(x => test(new Date(x.dueDate)));
            if (!list.length) return null;
            return (
              <Panel key={label} title={label}>
                <div className="space-y-2">
                  {list.map(x => {
                    const o = data.orders.get(x.orderId);
                    const late = new Date(x.dueDate) < now;
                    return (
                      <button key={x.id} onClick={() => open(x.orderId)} className="w-full text-left rounded-xl p-3 flex items-center gap-3 flex-wrap min-h-[56px] focus-visible:ring-2 focus-visible:ring-[#E6C473]"
                        style={{ background: x.type === 'EMERGENCY_RESPONSE' ? '#3B1418' : C.panel2, border: `1px solid ${C.line}` }}>
                        <span className="flex-1 min-w-[180px]">
                          <span className="block text-sm font-semibold">{x.title}</span>
                          <span className="block text-[11px]" style={{ color: C.muted }}>{o ? `${o.code} · ${o.site}` : 'Lead follow-up'}</span>
                        </span>
                        <span className="text-xs" style={{ color: late ? '#FF9A9A' : C.muted }}>{late ? `${t('overdue')} · ` : ''}{formatIst(x.dueDate)}</span>
                        {x.status !== 'TODO' && <Pill tone={x.status === 'BLOCKED' ? 'red' : 'gold'}>{x.status.replace('_', ' ')}</Pill>}
                      </button>
                    );
                  })}
                </div>
              </Panel>
            );
          })}
        </>
      )}
    </Screen>
  );
};

/** In-app alerts for this person, their role pool and (customers) their customer record. */
export const MvpNotifications: React.FC<{ user: User }> = ({ user }) => {
  const ctx = useServiceCtx(user);
  const { data, error, loading, reload } = useLoader(async () => {
    const a = ctx.actor;
    const audiences = a.role === 'customer' ? (a.customerId ? [`customer:${a.customerId}`] : []) : [a.id, `role:${a.role}`];
    const lists = await Promise.all(audiences.map(id => mvpRepos(ctx.repo).notifications.queryWhere([['audienceUserId', '==', id]]).catch(() => [] as MvpNotification[])));
    return lists.flat().sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1)).slice(0, 100);
  }, [ctx]);
  return (
    <Screen title="Alerts" right={<Btn tone="ghost" onClick={reload}>Refresh</Btn>}>
      {loading && !data ? <Loading /> : error ? <ErrorText error={error} /> : !data?.length ? <Empty>No alerts.</Empty> : (
        <div className="space-y-2">
          {data.map(n => (
            <button key={n.id} onClick={() => { svc.markNotificationRead(ctx, n.id).catch(() => {}); if (n.projectId) open(n.projectId); }}
              className="w-full text-left rounded-xl p-3 min-h-[56px] focus-visible:ring-2 focus-visible:ring-[#E6C473]"
              style={{ background: n.templateId === 'emergency' ? '#3B1418' : C.panel2, border: `1px solid ${n.read ? C.line : C.gold}` }}>
              <div className="flex justify-between gap-2 text-sm"><b>{n.title}</b><span className="text-[11px]" style={{ color: C.muted }}>{formatIst(n.createdAt)}</span></div>
              <div className="text-xs" style={{ color: C.muted }}>{n.body}</div>
            </button>
          ))}
        </div>
      )}
    </Screen>
  );
};
