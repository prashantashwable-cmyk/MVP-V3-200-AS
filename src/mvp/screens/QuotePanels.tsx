/**
 * Quote UI inside the Order View (spec §16, D-15).
 *  - Admin: builder (Base, Installation, Freight, Other, Tax % → Selling price) with an
 *    INTERNAL panel (estimated cost, markup %, gross margin %), approve margin, send.
 *  - Customer: the quote (no cost fields exist in their data at all, I-5), Accept / Request changes.
 * Why not reuse QuotePricing/QuotationPreview: they hard-code GST 18% and use mock arrays.
 */

import React, { useMemo, useState } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import type { User } from '../../types';
import { Button, Card } from '../../components/Common';
import { approveMargin, decideQuote, getQuoteForViewer, saveQuote, sendQuote } from '../services/quoteService';
import { computeQuote } from '../quoteMath';
import { GST_RATE_CONFIRMED, GST_RATE_PCT, MIN_MARKUP_PCT } from '../config';
import { formatInr, formatDateTime } from '../format';
import type { OrderViewExtraProps } from './MvpOrderView';
import { ErrorNote, inputCls, labelCls, SectionTitle, useAction, useLoad, useMvpCtx } from './ui';

const TaxWarning: React.FC<{ confirmed?: boolean }> = ({ confirmed }) => confirmed ? null : (
  <div className="p-2 rounded-lg bg-[#B8873D]/10 text-[11px] text-[#8a6224] flex items-center gap-1">
    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />⚖ Tax rate not confirmed by the company's CA.
  </div>
);

export const QuotePanel: React.FC<{ user: User } & OrderViewExtraProps> = ({ user, view, reload }) => {
  const { ctx, actor } = useMvpCtx(user);
  const q = useLoad(() => getQuoteForViewer(ctx, actor, view.order.id), [ctx, view.order.id, view.stage, view.openTasks.length]);
  const { run, busy, error } = useAction();
  const v = q.data?.version;
  const [lines, setLines] = useState({ base: '', installation: '', freight: '', other: '' });
  const [tax, setTax] = useState(GST_RATE_PCT === null ? '' : String(GST_RATE_PCT));
  const [cost, setCost] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const n = (s: string) => (s.trim() === '' ? 0 : Number(s));
  const preview = useMemo(() => {
    const l = { base: n(lines.base), installation: n(lines.installation), freight: n(lines.freight), other: n(lines.other) };
    if (!(l.base > 0) || tax === '' || !(n(cost) > 0)) return null;
    return computeQuote(l, Number(tax), n(cost));
  }, [lines, tax, cost]);

  const isAdmin = user.role === 'admin';
  const internal = isAdmin || user.role === 'owner';
  const stageOk = view.stage === 'QUOTE' || !!q.data?.quote;
  if (!stageOk || (user.role !== 'admin' && user.role !== 'owner' && user.role !== 'customer')) return null;
  const status = q.data?.quote?.status;
  const act = (fn: () => Promise<unknown>) => run(fn).then(ok => { if (ok) { q.reload(); reload(); } });
  const canEdit = isAdmin && view.stage === 'QUOTE' && status !== 'sent' && status !== 'accepted';

  return (
    <Card className="p-4 space-y-3">
      <SectionTitle>Quote{status ? ` · ${status.replace('_', ' ')}` : ''}{v ? ` · v${v.versionNumber}` : ''}</SectionTitle>
      {error && <ErrorNote message={error} />}
      {q.error && <ErrorNote message={q.error} />}

      {v && (
        <div className="space-y-1 text-sm">
          {([['Base lift', v.lines?.base], ['Installation', v.lines?.installation], ['Freight', v.lines?.freight], ['Other charges', v.lines?.other]] as const).map(([l, a]) => (
            <div key={l} className="flex justify-between"><span>{l}</span><span>{formatInr(a ?? 0)}</span></div>
          ))}
          <div className="flex justify-between text-warmgray"><span>Subtotal (excl. tax)</span><span>{formatInr(v.subtotalExclTax ?? 0)}</span></div>
          <div className="flex justify-between text-warmgray"><span>Tax ({v.taxRatePct}%)</span><span>{formatInr(v.taxAmount ?? 0)}</span></div>
          <div className="flex justify-between font-bold text-base"><span>Selling price</span><span>{formatInr(v.sellingPrice ?? 0)}</span></div>
          <TaxWarning confirmed={v.taxRateConfirmed} />
        </div>
      )}

      {internal && q.data?.cost && (
        <div className="p-3 rounded-xl bg-charcoal/5 text-xs space-y-1">
          <div className="font-bold flex items-center gap-1"><Lock className="w-3.5 h-3.5" />Internal — never shown to the customer</div>
          <div>Estimated cost {formatInr(q.data.cost.estimatedCost)} · Markup {q.data.cost.markupPct}% · Gross margin {q.data.cost.grossMarginPct}%</div>
          {q.data.cost.belowMinimum && <div className="text-error font-bold">Below the {MIN_MARKUP_PCT}% minimum markup — Admin approval {q.data.approval?.status === 'approved' ? `given (${q.data.approval.reason})` : 'required'}.</div>}
        </div>
      )}

      {canEdit && (
        <div className="space-y-2 p-3 rounded-xl bg-alabaster">
          <div className="grid grid-cols-2 gap-2">
            {(['base', 'installation', 'freight', 'other'] as const).map(k => (
              <div key={k}><label className={labelCls}>{k === 'base' ? 'Base lift ₹' : k === 'other' ? 'Other ₹' : `${k[0].toUpperCase()}${k.slice(1)} ₹`}</label>
                <input className={inputCls} inputMode="numeric" value={lines[k]} onChange={e => setLines({ ...lines, [k]: e.target.value })} /></div>
            ))}
            <div><label className={labelCls}>Tax rate % ⚖</label><input className={inputCls} inputMode="decimal" value={tax} onChange={e => setTax(e.target.value)} placeholder="Ask your CA" /></div>
            <div><label className={labelCls}>Estimated cost ₹ (internal)</label><input className={inputCls} inputMode="numeric" value={cost} onChange={e => setCost(e.target.value)} /></div>
          </div>
          <TaxWarning confirmed={GST_RATE_CONFIRMED} />
          {preview && (
            <div className="text-xs">
              Selling price <strong>{formatInr(preview.sellingPrice)}</strong> · markup {preview.markupPct}% · margin {preview.grossMarginPct}%
              {preview.belowMinimum && <span className="text-error font-bold"> · below {MIN_MARKUP_PCT}% — needs approval</span>}
            </div>
          )}
          <Button variant="primary" disabled={busy} onClick={() => act(() => saveQuote(ctx, actor, view.order.id, {
            lines: { base: n(lines.base), installation: n(lines.installation), freight: n(lines.freight), other: n(lines.other) },
            taxRatePct: tax === '' ? null : Number(tax), estimatedCost: n(cost),
          }))}>{v ? 'Save new version' : 'Save quote'}</Button>
        </div>
      )}

      {isAdmin && status === 'pending_approval' && (
        <div className="flex gap-2">
          <input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for approving this margin" />
          <Button variant="emerald" disabled={busy || !reason.trim()} onClick={() => act(() => approveMargin(ctx, actor, view.order.id, reason))}>Approve margin</Button>
        </div>
      )}
      {isAdmin && (
        <Button variant="emerald" disabled={busy || status !== 'approved'} onClick={() => act(() => sendQuote(ctx, actor, view.order.id))}
          title={status === 'pending_approval' ? 'Approve the margin first' : undefined}>Send quote to customer</Button>
      )}

      {user.role === 'customer' && status === 'sent' && (
        <div className="space-y-2">
          <Button variant="emerald" fullWidth disabled={busy} onClick={() => act(() => decideQuote(ctx, actor, view.order.id, 'accept'))}>Accept quote</Button>
          <input className={inputCls} value={note} onChange={e => setNote(e.target.value)} placeholder="What would you like changed?" />
          <Button variant="secondary" fullWidth disabled={busy || !note.trim()} onClick={() => act(() => decideQuote(ctx, actor, view.order.id, 'changes', note))}>Request changes</Button>
        </div>
      )}
      {q.data?.quote?.decidedAt && <div className="text-xs text-warmgray">Customer decision {formatDateTime(q.data.quote.decidedAt)}{q.data.quote.decisionNote ? ` — “${q.data.quote.decisionNote}”` : ''}</div>}
    </Card>
  );
};
