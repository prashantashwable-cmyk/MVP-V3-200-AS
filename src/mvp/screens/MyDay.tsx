/**
 * D-33 "My day": every person's own work, in the order to do it — emergencies, late, today,
 * next 3 days, waiting on someone, later. Each task has one tap to open it and one tap for
 * "Can't finish?", which turns silence into a signal:
 *   - "Need more time": a new date + reason (promiseTask); the Admin is told, and the
 *     follow-up ladder holds its reminders until that date.
 *   - "I'm stuck": one of the 8 blocker reasons (raiseBlocker), routed as D-07 already does.
 * Replaces the flat "My tasks" list (WorkQueueScreen's MVP branch) — same data, grouped.
 */

import React, { useState } from 'react';
import { AlertOctagon, Clock, Hourglass, Siren } from 'lucide-react';
import type { User } from '../../types';
import type { BlockerReason } from '../../domain/entities';
import { Button, Card } from '../../components/Common';
import { buildMyDay, type MyDayRow } from '../services/readModels';
import { BLOCKER_REASONS, promiseTask, raiseBlocker } from '../services/orderService';
import type { DayGroup } from '../followUp';
import { formatDateTime } from '../format';
import { ErrorNote, inputCls, labelCls, Loading, useAction, useLoad, useMvpCtx, useT } from './ui';

const GROUP_TITLE: Record<DayGroup, string> = {
  EMERGENCY: 'Emergency', LATE: 'Late', TODAY: 'Today', SOON: 'Next 3 days', WAITING: 'Waiting on someone', LATER: 'Later',
};
const GROUP_STYLE: Record<DayGroup, string> = {
  EMERGENCY: 'border-error bg-error/5', LATE: 'border-error/40', TODAY: 'border-[#B8873D]/50', SOON: '', WAITING: 'border-[#f0ebe2] opacity-80', LATER: '',
};

/** datetime-local value for "tomorrow 6 pm", a sensible default for a new promised date. */
function tomorrowEvening(): string {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  d.setHours(18, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const CantFinish: React.FC<{ row: MyDayRow; user: User; onDone: () => void }> = ({ row, user, onDone }) => {
  const { ctx, actor } = useMvpCtx(user);
  const t = useT();
  const { run, busy, error } = useAction();
  const [mode, setMode] = useState<'time' | 'stuck'>('time');
  const [when, setWhen] = useState(tomorrowEvening());
  const [reason, setReason] = useState<BlockerReason>('CUSTOMER_NOT_READY');
  const [text, setText] = useState('');
  const canBlock = !!row.task.orderId;

  const save = () => run(async () => {
    if (mode === 'time') await promiseTask(ctx, actor, row.task.id, new Date(when).toISOString(), text);
    else await raiseBlocker(ctx, actor, { orderId: row.task.orderId!, taskId: row.task.id, reason, description: text });
  }).then(ok => { if (ok) onDone(); });

  return (
    <div className="mt-2 p-3 rounded-xl bg-alabaster space-y-2">
      <div className="flex gap-2">
        <button onClick={() => setMode('time')} className={`min-h-[40px] px-3 rounded-lg text-xs font-bold cursor-pointer ${mode === 'time' ? 'bg-charcoal text-white' : 'bg-white border border-[#f0ebe2]'}`}>{t('Need more time')}</button>
        {canBlock && <button onClick={() => setMode('stuck')} className={`min-h-[40px] px-3 rounded-lg text-xs font-bold cursor-pointer ${mode === 'stuck' ? 'bg-charcoal text-white' : 'bg-white border border-[#f0ebe2]'}`}>{t("I'm stuck")}</button>}
      </div>
      {error && <ErrorNote message={error} />}
      {mode === 'time' ? (
        <div><label className={labelCls}>{t('I will finish by')}</label>
          <input type="datetime-local" className={inputCls} value={when} onChange={e => setWhen(e.target.value)} /></div>
      ) : (
        <div><label className={labelCls}>{t('What is stopping you?')}</label>
          <select className={inputCls} value={reason} onChange={e => setReason(e.target.value as BlockerReason)}>
            {BLOCKER_REASONS.map(r => <option key={r} value={r}>{t(r.replace(/_/g, ' ').toLowerCase())}</option>)}
          </select></div>
      )}
      <div><label className={labelCls}>{mode === 'time' ? t('Why? (the Admin sees this)') : t('Details (the Admin sees this)')}</label>
        <input className={inputCls} value={text} onChange={e => setText(e.target.value)} /></div>
      <Button variant="primary" disabled={busy || !text.trim()} onClick={save}>{mode === 'time' ? t('Send new date') : t('Report the problem')}</Button>
    </div>
  );
};

export const MyDay: React.FC<{ user: User; onOpenOrder?: (orderId: string) => void }> = ({ user, onOpenOrder }) => {
  const { ctx, actor } = useMvpCtx(user);
  const t = useT();
  const { data, error, loading, reload } = useLoad(() => buildMyDay(ctx, actor), [ctx], { every: 1 });
  const [open, setOpen] = useState<string | null>(null);

  if (loading && !data) return <Loading label={t('Loading your tasks…')} />;
  if (error) return <ErrorNote message={`${t('Could not load your tasks')}: ${error}`} />;
  const rows = data ?? [];
  const now = rows.filter(r => r.group === 'EMERGENCY' || r.group === 'LATE' || r.group === 'TODAY').length;
  const groups = [...new Set(rows.map(r => r.group))];

  return (
    <div className="space-y-3 max-w-3xl mx-auto pb-24">
      <div>
        <h2 className="text-lg font-bold text-charcoal">{t('My day')}</h2>
        <p className="text-sm text-warmgray">{rows.length === 0 ? t('You have no open tasks.') : now === 0 ? t('Nothing is due today.') : `${t('Things to do today')}: ${now}`}</p>
      </div>
      {groups.map(g => (
        <div key={g} className="space-y-2">
          <div className={`text-xs font-bold uppercase flex items-center gap-1 ${g === 'EMERGENCY' || g === 'LATE' ? 'text-error' : 'text-warmgray'}`}>
            {g === 'EMERGENCY' ? <Siren className="w-3.5 h-3.5" /> : g === 'LATE' ? <AlertOctagon className="w-3.5 h-3.5" /> : g === 'WAITING' ? <Hourglass className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
            {t(GROUP_TITLE[g])}
          </div>
          {rows.filter(r => r.group === g).map(r => (
            <Card key={r.task.id} className={`p-4 ${GROUP_STYLE[g]}`}>
              <div className="flex justify-between gap-2">
                <span className="font-bold text-sm">{t(r.task.title)}</span>
                {r.orderCode && <span className="text-[11px] font-bold text-warmgray whitespace-nowrap">#{r.orderCode}</span>}
              </div>
              <div className="text-xs text-warmgray mt-1">
                {r.customerName ? `${r.customerName} · ` : ''}
                {r.promisedAt ? `${t('You promised')} ${formatDateTime(r.promisedAt)}` : `${t('Due')} ${formatDateTime(r.task.dueDate)}`}
                {g === 'WAITING' ? ` · ${t('Blocked: waiting on someone else')}` : ''}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {r.task.orderId && (
                  <button onClick={() => onOpenOrder?.(r.task.orderId!)} className="min-h-[44px] px-4 rounded-lg bg-royalemerald text-white text-sm font-bold cursor-pointer">{t('Open')}</button>
                )}
                {g !== 'WAITING' && (
                  <button onClick={() => setOpen(open === r.task.id ? null : r.task.id)} className="min-h-[44px] px-4 rounded-lg border border-[#f0ebe2] bg-white text-sm font-bold cursor-pointer">{t("Can't finish?")}</button>
                )}
              </div>
              {open === r.task.id && <CantFinish row={r} user={user} onDone={() => { setOpen(null); reload(); }} />}
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
};
