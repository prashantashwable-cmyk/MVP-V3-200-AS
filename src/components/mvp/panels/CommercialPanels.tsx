/**
 * Action panels for the commercial tasks: assign surveyor, quote (D-15),
 * customer decision, payment milestones (D-14, D-30) and the supplier PO.
 * Every button calls one order-service command; nothing changes in React
 * state alone.
 */
import React, { useState } from 'react';
import * as svc from '../../../mvp/service';
import { MVP_CONFIG } from '../../../mvp/config';
import { formatInr, formatIst, marginMeasures, quotePricing, isBelowMinimum } from '../../../mvp/money';
import type { MvpMilestone, MvpQuote, MvpTask } from '../../../mvp/types';
import type { OrderBundle } from '../../../mvp/views';
import type { Person } from '../../../mvp/ui/directory';
import { Btn, C, ErrorText, Field, Input, Pill, Select, TextArea, fromDateInput, toDateInput, useAction, useLoader } from '../../../mvp/ui/kit';
import { t } from '../../../mvp/ui/i18n';

export interface PanelProps {
  ctx: svc.ServiceCtx;
  bundle: OrderBundle;
  task: MvpTask;
  people: Person[];
  onDone: () => void;
}

export const AssignSurveyorPanel: React.FC<PanelProps> = ({ ctx, bundle, people, onDone }) => {
  const surveyors = people.filter(p => p.role === 'surveyor');
  const [who, setWho] = useState(surveyors[0]?.id ?? '');
  const [date, setDate] = useState(toDateInput(new Date(Date.now() + 2 * 86400e3).toISOString()));
  const a = useAction(onDone);
  return (
    <div className="space-y-3">
      <Field label="Surveyor">
        <Select value={who} onChange={e => setWho(e.target.value)}>
          {surveyors.length === 0 && <option value="">No surveyor yet — invite one in Team & settings</option>}
          {surveyors.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <Field label="Survey date"><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
      <ErrorText error={a.error} />
      <Btn busy={a.busy} disabled={!who || !date} onClick={() => a.run(() => svc.assignSurveyor(ctx, bundle.order.id, who, fromDateInput(date, 11)), 'Surveyor assigned')}>Assign surveyor</Btn>
    </div>
  );
};

export const QuoteBuilderPanel: React.FC<PanelProps> = ({ ctx, bundle, onDone }) => {
  const settings = useLoader(() => svc.loadSettings(ctx), [ctx]);
  const confirmedRate = settings.data?.gstRatePct ?? MVP_CONFIG.GST_RATE_PCT;
  const latest = [...bundle.quotes].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  const [lines, setLines] = useState(latest?.lines ?? { baseLift: 0, installation: 0, freight: 0, other: 0 });
  const [tax, setTax] = useState<string>(latest ? String(latest.taxRatePct) : confirmedRate !== null ? String(confirmedRate) : '');
  const [cost, setCost] = useState<string>(bundle.quoteCosts.find(c => c.quoteId === latest?.id)?.estimatedCost?.toString() ?? '');
  const a = useAction(onDone);
  const taxN = Number(tax);
  const price = quotePricing(lines, Number.isFinite(taxN) ? taxN : 0);
  const m = Number(cost) > 0 ? marginMeasures(price.totalExclTax, Number(cost)) : null;
  const set = (k: keyof typeof lines) => (e: React.ChangeEvent<HTMLInputElement>) => setLines({ ...lines, [k]: Math.max(0, Number(e.target.value) || 0) });
  const unsent = latest && (latest.status === 'APPROVED' || latest.status === 'PENDING_APPROVAL') ? latest : null;
  return (
    <div className="space-y-3">
      {unsent && <UnsentQuote ctx={ctx} quote={unsent} onDone={onDone} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Base lift (₹, excl. tax)"><Input inputMode="numeric" value={lines.baseLift || ''} onChange={set('baseLift')} /></Field>
        <Field label="Installation (₹)"><Input inputMode="numeric" value={lines.installation || ''} onChange={set('installation')} /></Field>
        <Field label="Freight (₹)"><Input inputMode="numeric" value={lines.freight || ''} onChange={set('freight')} /></Field>
        <Field label="Other charges (₹)"><Input inputMode="numeric" value={lines.other || ''} onChange={set('other')} /></Field>
        <Field label="GST rate % ⚖ VERIFY" hint={confirmedRate === null ? 'Tax rate not confirmed by a CA. Set it in Team & settings once confirmed.' : `Confirmed rate: ${confirmedRate}%`}>
          <Input inputMode="decimal" value={tax} onChange={e => setTax(e.target.value)} />
        </Field>
        <Field label="Estimated cost (₹, Admin only)"><Input inputMode="numeric" value={cost} onChange={e => setCost(e.target.value)} /></Field>
      </div>
      <div className="rounded-xl p-3 text-sm grid grid-cols-2 gap-2" style={{ background: C.deep }}>
        <span style={{ color: C.muted }}>Total excl. tax</span><span className="text-right font-semibold">{formatInr(price.totalExclTax)}</span>
        <span style={{ color: C.muted }}>Tax</span><span className="text-right">{formatInr(price.taxAmount)}</span>
        <span style={{ color: C.muted }}>Selling price</span><span className="text-right font-bold" style={{ color: C.gold }}>{formatInr(price.sellingPrice)}</span>
        {m && <><span style={{ color: C.muted }}>Gross margin / markup</span><span className="text-right">{m.grossMarginPct}% / {m.markupPct}%</span></>}
      </div>
      {confirmedRate === null && <p className="text-xs" style={{ color: '#F5D27A' }}>⚠ Tax rate not confirmed. The quote will say so until the Owner confirms the GST rate.</p>}
      {m && isBelowMinimum(m.markupPct) && <p className="text-xs" style={{ color: '#FF9A9A' }}>Markup is below {MVP_CONFIG.MIN_MARKUP_PCT}%: Admin approval will be needed before sending.</p>}
      <ErrorText error={a.error} />
      <Btn busy={a.busy} disabled={!(price.totalExclTax > 0) || !(Number(cost) > 0) || tax === ''} onClick={() => a.run(() => svc.prepareQuote(ctx, bundle.order.id, lines, taxN, Number(cost)), 'Quote prepared')}>
        {unsent ? 'Replace with this quote' : 'Prepare quote'}
      </Btn>
    </div>
  );
};

const UnsentQuote: React.FC<{ ctx: svc.ServiceCtx; quote: MvpQuote; onDone: () => void }> = ({ ctx, quote, onDone }) => {
  const a = useAction(onDone);
  const [reason, setReason] = useState('');
  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: C.goldTint, border: `1px solid ${C.gold}` }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Quote {formatInr(quote.sellingPrice)}</span>
        <Pill tone={quote.status === 'APPROVED' ? 'green' : 'red'}>{quote.status === 'APPROVED' ? 'Ready to send' : 'Needs margin approval'}</Pill>
      </div>
      {quote.status === 'PENDING_APPROVAL' && (
        <>
          <Field label="Approval reason"><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. strategic first order" /></Field>
          <Btn tone="ghost" busy={a.busy} disabled={!reason.trim()} onClick={() => a.run(() => svc.approveMargin(ctx, quote.id, reason), 'Margin approved')}>Approve margin</Btn>
        </>
      )}
      {quote.status === 'APPROVED' && <Btn busy={a.busy} onClick={() => a.run(() => svc.sendQuote(ctx, quote.id), 'Quote sent to the customer')}>Send to customer</Btn>}
      <ErrorText error={a.error} />
    </div>
  );
};

export const QuoteDecisionPanel: React.FC<PanelProps> = ({ ctx, bundle, onDone }) => {
  const q = bundle.quotes.find(x => x.status === 'SENT');
  const a = useAction(onDone);
  const [note, setNote] = useState('');
  if (!q) return <p className="text-sm" style={{ color: C.muted }}>No sent quote yet.</p>;
  return (
    <div className="space-y-3">
      <QuoteSummary quote={q} />
      <Field label="Note (optional)"><Input value={note} onChange={e => setNote(e.target.value)} /></Field>
      <ErrorText error={a.error} />
      <div className="flex gap-2 flex-wrap">
        <Btn tone="green" busy={a.busy} onClick={() => a.run(() => svc.decideQuote(ctx, q.id, true, note), 'Quote accepted')}>{t('accept')}</Btn>
        <Btn tone="ghost" busy={a.busy} onClick={() => a.run(() => svc.decideQuote(ctx, q.id, false, note), 'Quote rejected')}>{t('reject')}</Btn>
      </div>
      {ctx.actor.role === 'admin' && <p className="text-[11px]" style={{ color: C.muted }}>You are recording the customer's decision on their behalf (audited).</p>}
    </div>
  );
};

export const QuoteSummary: React.FC<{ quote: MvpQuote }> = ({ quote }) => (
  <div className="rounded-xl p-3 text-sm grid grid-cols-2 gap-1" style={{ background: C.card.info, color: '#0B1D2C' }}>
    <span>Base lift</span><span className="text-right">{formatInr(quote.lines.baseLift)}</span>
    <span>Installation</span><span className="text-right">{formatInr(quote.lines.installation)}</span>
    <span>Freight</span><span className="text-right">{formatInr(quote.lines.freight)}</span>
    <span>Other</span><span className="text-right">{formatInr(quote.lines.other)}</span>
    <span>Tax ({quote.taxRatePct}%){!quote.taxRateConfirmed ? ' ⚖ not confirmed' : ''}</span><span className="text-right">{formatInr(quote.taxAmount)}</span>
    <span className="font-bold">Total</span><span className="text-right font-bold">{formatInr(quote.sellingPrice)}</span>
  </div>
);

/** All milestones of the order: the customer submits proof, the Admin verifies (D-14). */
export const PaymentsPanel: React.FC<{ ctx: svc.ServiceCtx; bundle: OrderBundle; onDone: () => void }> = ({ ctx, bundle, onDone }) => {
  const ms = [...bundle.milestones].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  if (!ms.length) return <p className="text-sm" style={{ color: C.muted }}>Payment milestones appear when the quote is accepted.</p>;
  return <div className="space-y-2">{ms.map(m => <MilestoneRow key={m.id} ctx={ctx} m={m} onDone={onDone} />)}</div>;
};
const ORDER = ['SURVEY_FEE', 'BOOKING_TOKEN', 'DELIVERY', 'FINAL'];

const MilestoneRow: React.FC<{ ctx: svc.ServiceCtx; m: MvpMilestone; onDone: () => void }> = ({ ctx, m, onDone }) => {
  const a = useAction(onDone);
  const [ref, setRef] = useState(m.reference ?? '');
  const [method, setMethod] = useState(m.method ?? 'UPI');
  const [amount, setAmount] = useState(String(m.amount - m.amountPaid));
  const [why, setWhy] = useState('');
  const open = m.status === 'PENDING' || m.status === 'PARTIAL' || m.status === 'FAILED';
  const isAdmin = ctx.actor.role === 'admin';
  const isCustomer = ctx.actor.role === 'customer';
  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: C.card.money, color: '#2B2006' }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-semibold text-sm">{m.label}</span>
        <span className="text-sm">{formatInr(m.amountPaid)} / {formatInr(m.amount)}</span>
      </div>
      <div className="text-xs flex gap-3 flex-wrap">
        <span>Status: <b>{m.status}</b></span>
        {m.dueDate && <span>Due {formatIst(m.dueDate)}</span>}
        {m.reference && <span>Ref {m.reference} ({m.method})</span>}
      </div>
      {open && isCustomer && (
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder={t('reference')} value={ref} onChange={e => setRef(e.target.value)} style={{ background: 'white', color: '#111' }} />
          <Select value={method} onChange={e => setMethod(e.target.value)} style={{ background: 'white', color: '#111' }}>
            {['UPI', 'NEFT', 'RTGS', 'Cheque', 'Cash'].map(x => <option key={x}>{x}</option>)}
          </Select>
          <Btn className="col-span-2" busy={a.busy} disabled={!ref.trim()} onClick={() => a.run(() => svc.submitPaymentProof(ctx, m.id, ref, method), 'Proof sent to the Admin')}>{t('submitProof')}</Btn>
        </div>
      )}
      {open && isAdmin && (
        <div className="grid grid-cols-2 gap-2">
          <Input aria-label="Amount received" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} style={{ background: 'white', color: '#111' }} />
          <Input aria-label="Reference" placeholder="UTR / reference" value={ref} onChange={e => setRef(e.target.value)} style={{ background: 'white', color: '#111' }} />
          <Btn tone="green" className="col-span-2" busy={a.busy} disabled={!(Number(amount) > 0)} onClick={() => a.run(() => svc.markPaymentPaid(ctx, m.id, { amount: Number(amount), reference: ref || undefined, method }), 'Payment recorded')}>
            Verify &amp; record payment
          </Btn>
          {m.kind === 'SURVEY_FEE' && (
            <>
              <Input placeholder="Reason to waive" value={why} onChange={e => setWhy(e.target.value)} style={{ background: 'white', color: '#111' }} />
              <Btn tone="ghost" busy={a.busy} disabled={!why.trim()} onClick={() => a.run(() => svc.waiveSurveyFee(ctx, m.orderId, why), 'Fee waived')} className="!text-[#2B2006]">Waive fee</Btn>
            </>
          )}
        </div>
      )}
      <ErrorText error={a.error} />
    </div>
  );
};

export const RaisePoPanel: React.FC<PanelProps> = ({ ctx, bundle, onDone }) => {
  const suppliers = useLoader(() => svc.repos(ctx).suppliers.list(), [ctx]);
  const [supplierId, setSupplierId] = useState('');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(toDateInput(new Date(Date.now() + 10 * 86400e3).toISOString()));
  const a = useAction(onDone);
  const list = suppliers.data ?? [];
  return (
    <div className="space-y-3">
      <Field label="Supplier">
        <Select value={supplierId} onChange={e => { setSupplierId(e.target.value); setName(list.find(s => s.id === e.target.value)?.name ?? ''); }}>
          <option value="">Type a new supplier name below…</option>
          {list.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </Field>
      {!supplierId && <Field label="Supplier name"><Input value={name} onChange={e => setName(e.target.value)} /></Field>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="PO amount (₹)"><Input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
        <Field label="Expected delivery"><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
      </div>
      <ErrorText error={a.error} />
      <Btn busy={a.busy} disabled={!name.trim() || !date} onClick={() => a.run(() => svc.raisePurchaseOrder(ctx, bundle.order.id, {
        supplierId: supplierId || `manual:${name.trim()}`, supplierName: name.trim(), amount: Number(amount) || 0, expectedDeliveryDate: fromDateInput(date),
      }), 'PO raised')}>Raise PO</Btn>
    </div>
  );
};
