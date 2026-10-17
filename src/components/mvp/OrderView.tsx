/**
 * The Universal Order View (spec §8, Step 04), laid out after the Owner's
 * reference: header + 10-stage rail, the spec §8 summary, the current
 * task with its action panel, a chronological feed of real updates, and
 * a details column (payments, blockers, documents, AMC, team, audit).
 * One column on a phone. The same view serves every role; what each role
 * can read is decided by the service/rules, and cost never reaches
 * non-Admin/Owner roles (I-5).
 */
import React, { useMemo, useState } from 'react';
import { ArrowLeft, Phone } from 'lucide-react';
import type { User } from '../../types';
import * as svc from '../../mvp/service';
import { buildFeed, type FeedTone } from '../../mvp/feed';
import { isOpenTask } from '../../mvp/health';
import { formatInr, formatIst } from '../../mvp/money';
import { loadOrderBundle, summarize } from '../../mvp/views';
import { loadDirectory, labelFor, ROLE_LABELS } from '../../mvp/ui/directory';
import { Btn, C, Empty, ErrorText, EvidenceThumbs, HealthBadge, Loading, Panel, Pill, ProgressBar, StageRail, useLoader, useServiceCtx } from '../../mvp/ui/kit';
import { t } from '../../mvp/ui/i18n';
import type { MvpTask } from '../../mvp/types';
import { AssignSurveyorPanel, PaymentsPanel, QuoteBuilderPanel, QuoteDecisionPanel, RaisePoPanel, type PanelProps } from './panels/CommercialPanels';
import { BlockerForm, DeliveryPanel, EmergencyResponsePanel, InstallationPanel, QcPanel, ReworkPanel, SiteReadinessPanel, SurveyPanel, VerifySitePanel } from './panels/FieldPanels';
import { AmcPanel, CompliancePanel, EmergencyButton, HandoverPanel, HoldReviewPanel } from './panels/ClosePanels';
import { BlockerList, OrderAdminBar, TaskAdminControls } from './panels/AdminPanels';

const FEED_PREVIEW = 8;
const TONE_BG: Record<FeedTone, string> = { neutral: C.card.neutral, info: C.card.info, action: C.card.action, done: C.card.done, money: C.card.money, amc: C.card.amc };

function TaskPanel(p: PanelProps) {
  switch (p.task.type) {
    case 'ASSIGN_SURVEYOR': case 'REVIEW_NOT_FEASIBLE': return <AssignSurveyorPanel {...p} />;
    case 'SURVEY': return <SurveyPanel {...p} />;
    case 'SITE_CORRECTION': case 'SITE_READINESS': return <SiteReadinessPanel {...p} />;
    case 'PREPARE_QUOTE': case 'APPROVE_MARGIN': return <QuoteBuilderPanel {...p} />;
    case 'QUOTE_DECISION': return <QuoteDecisionPanel {...p} />;
    case 'COLLECT_SURVEY_FEE': case 'COLLECT_BOOKING_TOKEN': case 'COLLECT_DELIVERY_PAYMENT': case 'COLLECT_FINAL_PAYMENT':
      return <PaymentsPanel ctx={p.ctx} bundle={p.bundle} onDone={p.onDone} />;
    case 'RAISE_PO': return <RaisePoPanel {...p} />;
    case 'VERIFY_SITE_READY': return <VerifySitePanel {...p} />;
    case 'TRACK_DELIVERY': return <DeliveryPanel {...p} />;
    case 'INSTALLATION': return <InstallationPanel {...p} />;
    case 'QC_INSPECTION': return <QcPanel {...p} />;
    case 'REWORK': return <ReworkPanel {...p} />;
    case 'HANDOVER': return <HandoverPanel {...p} />;
    case 'STATUTORY_LICENCE': return <CompliancePanel ctx={p.ctx} bundle={p.bundle} onDone={p.onDone} only="LIFT_LICENCE" />;
    case 'AMC_FOLLOW_UP': return <AmcPanel ctx={p.ctx} bundle={p.bundle} onDone={p.onDone} />;
    case 'REVIEW_HOLD': return <HoldReviewPanel {...p} />;
    case 'EMERGENCY_RESPONSE': return <EmergencyResponsePanel {...p} />;
    default: return <p className="text-sm" style={{ color: C.muted }}>Complete this outside the app, then the Admin closes it.</p>;
  }
}

export const OrderView: React.FC<{ user: User; orderId: string; customerOverride?: string; onBack?: () => void }> = ({ user, orderId, customerOverride, onBack }) => {
  const ctx = useServiceCtx(user, customerOverride);
  const { data, error, loading, reload } = useLoader(async () => {
    const [bundle, people] = await Promise.all([loadOrderBundle(ctx.repo, ctx.actor, orderId), loadDirectory(ctx.repo, ctx.actor)]);
    const audits = ctx.actor.role === 'admin' || ctx.actor.role === 'owner'
      ? (await svc.repos(ctx).audit.query({ projectId: orderId } as any).catch(() => [])).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
      : [];
    return { bundle, people, audits };
  }, [ctx, orderId]);
  const now = useMemo(() => new Date(), [data]);
  const [blocking, setBlocking] = useState<string | null>(null);
  const [allUpdates, setAllUpdates] = useState(false);

  if (loading && !data) return <Loading />;
  if (error) return <Panel><ErrorText error={error} /><Btn tone="ghost" onClick={reload}>{t('retry')}</Btn></Panel>;
  if (!data?.bundle) return <Panel><Empty>This order is not available to you.</Empty></Panel>;
  const { bundle, people, audits } = data;
  const s = summarize(bundle, now);
  const feed = buildFeed(bundle);
  const name = (id?: string | null) => labelFor(id, people, bundle.customer?.name);
  const isAdmin = ctx.actor.role === 'admin';
  const mine = (task: MvpTask) => isOpenTask(task) && svc.actorOwnsTask(ctx, task);
  const actionable = bundle.tasks.filter(task => mine(task) && (task.type !== 'HANDOVER' || isAdmin));
  // The customer approves the handover even though the task is the Admin's.
  const handoverForCustomer = ctx.actor.role === 'customer' ? bundle.tasks.find(x => x.type === 'HANDOVER' && isOpenTask(x)) : undefined;
  const panels = [...(s.currentTask && mine(s.currentTask) ? [s.currentTask] : []), ...actionable.filter(x => x.id !== s.currentTask?.id), ...(handoverForCustomer ? [handoverForCustomer] : [])];
  const canRaiseBlocker = ['admin', 'technician', 'customer'].includes(ctx.actor.role) && s.status === 'ACTIVE';

  return (
    <div className="space-y-4">
      <header className="rounded-2xl p-4 space-y-3" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
        <div className="flex items-start gap-3 flex-wrap">
          {onBack && <button onClick={onBack} aria-label="Back to orders" className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center" style={{ border: `1px solid ${C.line}` }}><ArrowLeft className="w-4 h-4" /></button>}
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-lg" style={{ color: C.gold }}>{s.displayCode}</span>
              <span className="font-serif text-lg font-bold">{s.customerName}</span>
            </div>
            <div className="text-xs" style={{ color: C.muted }}>{s.siteAddress} · {s.lift}</div>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <Pill tone={s.status === 'ACTIVE' ? 'green' : s.status === 'COMPLETED' ? 'gold' : s.status === 'CANCELLED' ? 'red' : 'grey'}>{s.status.replace('_', ' ')}</Pill>
            <HealthBadge health={s.health} />
          </div>
        </div>
        <StageRail stage={s.stage} completed={s.status === 'COMPLETED'} />
      </header>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-4">
        <div className="space-y-4 min-w-0">
          <Panel>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <Item k={t('stage')} v={s.stageLabel} />
              <div className="col-span-2 sm:col-span-1"><dt className="text-[11px]" style={{ color: C.muted }}>{t('progress')} · {s.progress}%</dt><dd className="mt-1"><ProgressBar value={s.progress} /></dd></div>
              <Item k={t('nextAction')} v={s.nextAction} strong={s.noNextAction ? '#FF9A9A' : undefined} wide />
              <Item k={t('owner')} v={name(s.ownerId)} />
              <Item k={t('due')} v={s.dueDate ? formatIst(s.dueDate) : '—'} strong={s.dueDate && new Date(s.dueDate) < now ? '#FF9A9A' : undefined} />
              <Item k={t('blocker')} v={s.openBlocker ? s.openBlocker.reason.replace(/_/g, ' ') : t('none')} strong={s.openBlocker ? '#FF9A9A' : undefined} />
              <Item k={t('payment')} v={s.total ? `${formatInr(s.paid)} / ${formatInr(s.total)}` : '—'} />
            </dl>
          </Panel>

          {panels.map(task => (
            <Panel key={task.id} title={<span>{task.type === 'EMERGENCY_RESPONSE' ? '🚨 ' : ''}{task.title}</span>}
              right={<span className="text-[11px]" style={{ color: C.muted }}>{t('due')} {formatIst(task.dueDate)}</span>}>
              {task.status === 'BLOCKED' && <p className="text-sm" style={{ color: '#FF9A9A' }}>Blocked — waiting for the blocker below to be resolved.</p>}
              <TaskPanel ctx={ctx} bundle={bundle} task={task} people={people} onDone={reload} />
              {canRaiseBlocker && task.status !== 'BLOCKED' && ['technician', 'customer'].includes(ctx.actor.role) && (
                blocking === task.id
                  ? <BlockerForm ctx={ctx} orderId={bundle.order.id} taskId={task.id} defaultReason={ctx.actor.role === 'customer' ? 'CUSTOMER_NOT_READY' : 'MATERIAL_MISSING'} onDone={() => { setBlocking(null); reload(); }} />
                  : <Btn tone="ghost" onClick={() => setBlocking(task.id)}>{t('blocked')}…</Btn>
              )}
              {isAdmin && <TaskAdminControls ctx={ctx} task={task} bundle={bundle} people={people} onDone={reload} />}
            </Panel>
          ))}
          {!panels.length && s.currentTask && (
            <Panel><p className="text-sm" style={{ color: C.muted }}>Waiting on {name(s.currentTask.assigneeId)}: {s.currentTask.title} (due {formatIst(s.currentTask.dueDate)}).</p>
              {isAdmin && <TaskAdminControls ctx={ctx} task={s.currentTask} bundle={bundle} people={people} onDone={reload} />}
            </Panel>
          )}

          {s.stage === 'AMC' && ['customer', 'admin'].includes(ctx.actor.role) && <EmergencyButton ctx={ctx} bundle={bundle} onDone={reload} />}

          <Panel title="Updates" right={feed.length > FEED_PREVIEW ? <Btn tone="ghost" onClick={() => setAllUpdates(v => !v)}>{allUpdates ? 'Show latest' : `Show all ${feed.length}`}</Btn> : undefined}>
            {feed.length === 0 ? <Empty>No updates yet.</Empty> : (
              <ol className="space-y-2">
                {(allUpdates ? feed : feed.slice(-FEED_PREVIEW)).map(f => (
                  <li key={f.id} className="flex gap-3">
                    <div className="w-20 shrink-0 text-[10px] pt-2 text-right" style={{ color: C.muted }}>
                      <div className="font-semibold" style={{ color: C.text }}>{f.actorRole === 'system' ? 'AIEC' : ROLE_LABELS[f.actorRole]}</div>
                      {formatIst(f.at)}
                    </div>
                    <div className="flex-1 rounded-xl p-3 space-y-1 min-w-0" style={{ background: TONE_BG[f.tone], color: '#141A20' }}>
                      <div className="text-sm font-semibold break-words">{f.title}</div>
                      {f.body && <div className="text-xs break-words">{f.body}</div>}
                      {f.evidence && <EvidenceThumbs items={f.evidence} />}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <aside className="space-y-4 min-w-0">
          <Panel title="Details">
            <dl className="text-sm space-y-2">
              <Row k="Customer" v={bundle.customer?.name ?? '—'} />
              {bundle.customer?.phone && (
                <Row k="Contact" v={<a className="inline-flex items-center gap-1 underline" style={{ color: C.gold }} href={`tel:${bundle.customer.phone}`}><Phone className="w-3 h-3" aria-hidden />{bundle.customer.phone}</a>} />
              )}
              <Row k="Site" v={s.siteAddress} />
              <Row k="Lift" v={s.lift} />
            </dl>
          </Panel>
          <Panel title={t('payment')}><PaymentsPanel ctx={ctx} bundle={bundle} onDone={reload} /></Panel>
          <Panel title="Blockers">
            <BlockerList ctx={ctx} blockers={bundle.blockers} onDone={reload} />
            {isAdmin && s.status === 'ACTIVE' && (blocking === 'order'
              ? <BlockerForm ctx={ctx} orderId={bundle.order.id} taskId={s.currentTask?.id} onDone={() => { setBlocking(null); reload(); }} />
              : <Btn tone="ghost" onClick={() => setBlocking('order')}>Raise blocker…</Btn>)}
          </Panel>
          <Panel title="Tasks">
            <ul className="space-y-1 text-sm">
              {[...bundle.tasks].sort((a, b) => Number(isOpenTask(b)) - Number(isOpenTask(a)) || (a.dueDate < b.dueDate ? -1 : 1)).map(x => (
                <li key={x.id} className="flex justify-between gap-2" style={{ opacity: isOpenTask(x) ? 1 : 0.55 }}>
                  <span className="truncate">{x.title}</span>
                  <span className="text-[11px] whitespace-nowrap" style={{ color: C.muted }}>{x.status} · {name(x.assigneeId)}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Documents & compliance"><CompliancePanel ctx={ctx} bundle={bundle} onDone={reload} /></Panel>
          {bundle.amc && <Panel title="Warranty & AMC"><AmcPanel ctx={ctx} bundle={bundle} onDone={reload} /></Panel>}
          {isAdmin && <Panel title="Admin actions"><OrderAdminBar ctx={ctx} bundle={bundle} people={people} onDone={reload} /></Panel>}
          {audits.length > 0 && (
            <Panel title={`Audit history (${audits.length})`}>
              <ul className="space-y-1 max-h-72 overflow-y-auto text-[11px]">
                {audits.map(ev => (
                  <li key={ev.id} style={{ color: C.muted }}>
                    <span style={{ color: C.text }}>{formatIst(ev.timestamp)}</span> · <b style={{ color: C.text }}>{ev.action}</b> by {name(ev.actorId)} ({ev.actorRole})
                    {ev.reason ? ` — ${ev.reason}` : ''}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
};

const Item: React.FC<{ k: string; v: React.ReactNode; strong?: string; wide?: boolean }> = ({ k, v, strong, wide }) => (
  <div className={wide ? 'col-span-2' : ''}>
    <dt className="text-[11px]" style={{ color: C.muted }}>{k}</dt>
    <dd className="font-semibold break-words" style={{ color: strong ?? C.text }}>{v}</dd>
  </div>
);
const Row: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <div className="flex justify-between gap-3"><dt style={{ color: C.muted }}>{k}</dt><dd className="text-right break-words min-w-0">{v}</dd></div>
);
