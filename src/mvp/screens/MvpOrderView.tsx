/**
 * Universal Order View (spec §8), rendered by components/ProjectOperatingView.tsx in MVP_MODE.
 * One column on phones. Money only for admin/owner/customer; audit only for admin/owner; cost never.
 */

import React from 'react';
import { ArrowLeft, Building2, MapPin, IndianRupee, History, Image as ImageIcon, AlertTriangle, ListChecks } from 'lucide-react';
import type { User } from '../../types';
import { Card, Button } from '../../components/Common';
import { buildOrderView, assigneeLabel, type OrderViewModel } from '../services/readModels';
import { listPeople, nameMap, type Person } from '../services/people';
import { formatDateTime, formatInr, formatDate } from '../format';
import { AdminActions } from './AdminActions';
import { EvidenceThumb } from './PhotoInput';
import { ErrorNote, HealthBadge, Loading, ProgressBar, SectionTitle, useLoad, useMvpCtx, useMvpLang } from './ui';
import { translateStage } from '../i18n';
import { tr } from '../i18nUi';

export interface OrderViewExtraProps {
  view: OrderViewModel;
  reload: () => void;
}

export const MvpOrderView: React.FC<{
  user: User;
  orderId: string;
  onBack?: () => void;
  renderExtra?: (props: OrderViewExtraProps) => React.ReactNode;
}> = ({ user, orderId, onBack, renderExtra }) => {
  const { ctx, actor } = useMvpCtx(user);
  const lang = useMvpLang();
  const t = (s: string) => tr(lang, s);
  const canListPeople = actor.role === 'admin' || actor.role === 'owner';
  const people = useLoad<Person[]>(() => (canListPeople ? listPeople(ctx) : Promise.resolve([])), [ctx, canListPeople]);
  const names = nameMap(people.data ?? []);
  const { data: view, error, loading, reload } = useLoad(
    () => (orderId ? buildOrderView(ctx, actor, orderId, names) : Promise.resolve(null)),
    [ctx, orderId, people.data],
  );

  if (!orderId) return <Card className="p-6 text-sm text-warmgray">Choose an order from the list.</Card>;
  if (loading && !view) return <Loading label={t('Loading order…')} />;
  if (error) return <ErrorNote message={`Could not load the order: ${error}`} />;
  if (!view) return <Card className="p-6 text-sm text-warmgray">{t('This order was not found, or you do not have access to it.')}</Card>;

  const blockerText = view.blockers.length ? view.blockers.map(b => t(b.reason.replace(/_/g, ' ').toLowerCase())).join(', ') : t('None');
  const row = (label: string, value: React.ReactNode) => (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wider text-warmgray">{label}</div>
      <div className="text-sm font-semibold text-charcoal break-words">{value}</div>
    </div>
  );

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-24">
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 text-xs font-semibold text-warmgray hover:text-charcoal cursor-pointer min-h-[40px] pr-3">
          <ArrowLeft className="w-4 h-4" /> {t('Back')}
        </button>
      )}

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-mono text-warmgray uppercase">{t('Order')}</div>
            <h2 className="text-xl font-bold text-charcoal">#{view.code}</h2>
          </div>
          <div className="flex items-center gap-2">
            {view.status !== 'ACTIVE' && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-charcoal/10">{t(view.status.replace('_', ' '))}</span>}
            <HealthBadge health={view.health} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {row(t('Customer'), <span className="flex items-center gap-1"><Building2 className="w-4 h-4 text-[#B8873D]" />{view.customerName}</span>)}
          {row(t('Site'), <span className="flex items-center gap-1"><MapPin className="w-4 h-4 text-[#B8873D]" />{view.siteAddress || '—'}</span>)}
          {row(t('Lift'), view.lift || '—')}
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs"><span className="font-bold uppercase">{t('Current stage')}: {translateStage(lang, view.stage)}</span><span className="font-bold uppercase">{t('Progress')}: {view.progress}%</span></div>
          <ProgressBar value={view.progress} />
        </div>
        {view.noNextAction && (
          <div className="p-3 rounded-xl bg-error/10 text-error text-xs font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4" />NO NEXT ACTION — this active order has no open task.</div>
        )}
        {view.licencePending && (
          <div className="p-3 rounded-xl bg-[#B8873D]/10 text-[#8a6224] text-xs font-bold">Licence pending — the statutory lift licence task is still open (⚖ VERIFY).</div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {row(t('Next action'), view.currentTask ? t(view.currentTask.title) : '—')}
          {row(t('Owner'), t(view.currentOwner))}
          {row(t('Due'), view.currentTask ? formatDateTime(view.currentTask.dueDate) : '—')}
          {row(t('Blocker'), blockerText)}
          {view.payments && row(t('Payment'), view.payments.total > 0
            ? <span className="flex items-center gap-1"><IndianRupee className="w-4 h-4 text-[#B8873D]" />{formatInr(view.payments.paid)} / {formatInr(view.payments.total)}</span>
            : t('Not set yet (after the quote is accepted)'))}
          {row(t('Health'), <HealthBadge health={view.health} />)}
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle>{t('Stages')}</SectionTitle>
        <ol className="flex flex-wrap gap-1.5">
          {view.timeline.map(t => (
            <li key={t.stage} className={`px-2 py-1 rounded-lg text-[11px] font-semibold ${
              t.state === 'done' ? 'bg-royalemerald/10 text-royalemerald' : t.state === 'current' ? 'bg-[#B8873D] text-white' : 'bg-alabaster text-warmgray'}`}>
              {translateStage(lang, t.stage)}
            </li>
          ))}
        </ol>
      </Card>

      {renderExtra?.({ view, reload })}

      <Card className="p-4">
        <SectionTitle right={<ListChecks className="w-4 h-4 text-warmgray" />}>{t('Open tasks')}</SectionTitle>
        {view.openTasks.length === 0 ? <p className="text-xs text-warmgray">{t('No open tasks.')}</p> : (
          <ul className="divide-y divide-[#f0ebe2]">
            {view.openTasks.map(t => (
              <li key={t.id} className="py-2 flex flex-wrap justify-between gap-2 text-sm">
                <span className="font-semibold">{tr(lang, t.title)}</span>
                <span className="text-xs text-warmgray">{tr(lang, assigneeLabel(t.assigneeId, actor, names))} · {tr(lang, 'due')} {formatDateTime(t.dueDate)} · {tr(lang, t.status.replace('_', ' '))}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AdminActions view={view} ctx={ctx} actor={actor} people={people.data ?? []} onDone={reload} />

      <Card className="p-4">
        <SectionTitle right={<ImageIcon className="w-4 h-4 text-warmgray" />}>{t('Evidence')}</SectionTitle>
        {view.evidence.length === 0 ? <p className="text-xs text-warmgray">{t('No photos or documents yet.')}</p> : (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {view.evidence.map(d => (
              <figure key={d.id} className="space-y-1">
                <EvidenceThumb ctx={ctx} doc={d} />
                <figcaption className="text-[10px] text-warmgray truncate">{d.caption ?? formatDate(d.uploadedAt)}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </Card>

      {view.audit && (
        <Card className="p-4">
          <SectionTitle right={<History className="w-4 h-4 text-warmgray" />}>{t('History')}</SectionTitle>
          <ul className="space-y-1.5 max-h-80 overflow-y-auto">
            {view.audit.map(e => (
              <li key={e.id} className="text-xs">
                <span className="font-mono text-warmgray">{formatDateTime(e.timestamp)}</span>{' '}
                <strong>{e.action.replace(/_/g, ' ').toLowerCase()}</strong>{' '}
                by {names[e.actorId as string] ?? e.actorRole}
                {e.reason ? <> — “{e.reason}”</> : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {!view.audit && view.closedTasks.length > 0 && (
        <Card className="p-4">
          <SectionTitle>Done</SectionTitle>
          <ul className="space-y-1">{view.closedTasks.slice(0, 10).map(t => <li key={t.id} className="text-xs text-warmgray">{t.title} · {t.status.toLowerCase()}</li>)}</ul>
        </Card>
      )}
      {onBack && <Button variant="ghost" onClick={onBack}>{t('Back')}</Button>}
    </div>
  );
};
