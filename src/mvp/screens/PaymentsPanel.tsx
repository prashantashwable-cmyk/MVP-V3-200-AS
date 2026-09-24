/**
 * Payment milestones inside the Order View (spec §17, D-14). Customer: "I have paid" with a
 * UTR/reference and an optional screenshot. Admin: verify (PAID / PARTIAL / REFUNDED), reject
 * the proof, edit amounts (must add up to the selling price). All through paymentService.
 * Why not reuse PaymentStageScheduleSetup/PaymentCollectionDashboard: legacy local data (1,100–1,300 lines).
 */

import React, { useState } from 'react';
import type { User } from '../../types';
import type { PaymentMilestone } from '../../domain/entities';
import { Button, Card } from '../../components/Common';
import { editMilestoneAmounts, isSettled, listMilestones, rejectPaymentProof, submitPaymentProof, verifyPayment } from '../services/paymentService';
import { formatDate, formatInr } from '../format';
import type { OrderViewExtraProps } from './MvpOrderView';
import { PhotoInput, type SavedPhoto } from './PhotoInput';
import { ErrorNote, inputCls, labelCls, SectionTitle, useAction, useLoad, useMvpCtx } from './ui';

const Row: React.FC<{ m: PaymentMilestone; user: User; orderId: string; onDone: () => void }> = ({ m, user, orderId, onDone }) => {
  const { ctx, actor } = useMvpCtx(user);
  const { run, busy, error } = useAction();
  const [ref, setRef] = useState(m.proof?.reference ?? '');
  const [method, setMethod] = useState('UPI');
  const [partial, setPartial] = useState('');
  const [reason, setReason] = useState('');
  const [shot, setShot] = useState<SavedPhoto[]>([]);
  const act = (fn: () => Promise<unknown>) => run(fn).then(ok => ok && onDone());
  const settled = isSettled(m);
  return (
    <li className="py-3 space-y-2">
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span className="font-semibold">{m.label}</span>
        <span>{formatInr(m.amount)} · <strong className={settled ? 'text-royalemerald' : ''}>{m.waived ? 'WAIVED' : m.status}</strong>{m.dueDate ? ` · due ${formatDate(m.dueDate)}` : ''}</span>
      </div>
      {m.status === 'PARTIAL' && <div className="text-xs text-warmgray">Received {formatInr(m.amountReceived)} so far</div>}
      {m.proof && !settled && <div className="text-xs">Proof submitted: <strong>{m.proof.reference}</strong></div>}
      {m.rejectedReason && !settled && <div className="text-xs text-error">Proof not accepted: {m.rejectedReason}</div>}
      {error && <ErrorNote message={error} />}

      {user.role === 'customer' && !settled && m.kind !== 'SURVEY_FEE' && (
        <div className="space-y-2 p-3 rounded-xl bg-alabaster">
          <label className={labelCls}>UTR / transaction reference</label>
          <input className={inputCls} value={ref} onChange={e => setRef(e.target.value)} />
          <PhotoInput ctx={ctx} actor={actor} target={{ orderId }} caption={`${m.label} payment screenshot`} photos={shot} onChange={setShot} label="Screenshot" />
          <Button variant="primary" disabled={busy || !ref.trim()} onClick={() => act(() => submitPaymentProof(ctx, actor, m.id, ref, shot[0]?.id))}>I have paid</Button>
        </div>
      )}

      {user.role === 'admin' && !settled && (
        <div className="space-y-2 p-3 rounded-xl bg-alabaster">
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelCls}>Method</label>
              <select className={inputCls} value={method} onChange={e => setMethod(e.target.value)}>{['UPI', 'NEFT', 'RTGS', 'Cheque', 'Cash', 'Bank transfer'].map(x => <option key={x}>{x}</option>)}</select></div>
            <div><label className={labelCls}>Reference</label><input className={inputCls} value={ref} onChange={e => setRef(e.target.value)} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="emerald" disabled={busy || !ref.trim()} onClick={() => act(() => verifyPayment(ctx, actor, m.id, { status: 'PAID', method, reference: ref }))}>Mark PAID</Button>
            <input className={`${inputCls} max-w-[140px]`} inputMode="numeric" value={partial} onChange={e => setPartial(e.target.value)} placeholder="Part amount ₹" />
            <Button variant="secondary" disabled={busy || !partial || !ref.trim()} onClick={() => act(() => verifyPayment(ctx, actor, m.id, { status: 'PARTIAL', amountReceived: Number(partial), method, reference: ref }))}>Mark PARTIAL</Button>
          </div>
          {m.proof && (
            <div className="flex gap-2">
              <input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why the proof is not accepted" />
              <Button variant="ghost" disabled={busy || !reason.trim()} onClick={() => act(() => rejectPaymentProof(ctx, actor, m.id, reason))}>Reject proof</Button>
            </div>
          )}
        </div>
      )}
      {user.role === 'admin' && m.status === 'PAID' && (
        <details className="text-xs"><summary className="cursor-pointer text-warmgray">Record a refund</summary>
          <div className="flex gap-2 mt-2">
            <input className={inputCls} value={ref} onChange={e => setRef(e.target.value)} placeholder="Refund reference" />
            <Button variant="ghost" disabled={busy || !ref.trim()} onClick={() => act(() => verifyPayment(ctx, actor, m.id, { status: 'REFUNDED', method: 'Refund', reference: ref, notes: 'Refund recorded (⚖ per the customer agreement)' }))}>Mark REFUNDED</Button>
          </div>
        </details>
      )}
    </li>
  );
};

export const PaymentsPanel: React.FC<{ user: User } & OrderViewExtraProps> = ({ user, view, reload }) => {
  const { ctx, actor } = useMvpCtx(user);
  const ms = useLoad(() => listMilestones(ctx, view.order.id), [ctx, view.order.id, view.stage, view.payments?.paid]);
  const { run, busy, error } = useAction();
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  if (!view.payments || !(ms.data ?? []).length) return null;
  const done = () => { ms.reload(); reload(); };
  return (
    <Card className="p-4">
      <SectionTitle>Payments · {formatInr(view.payments.paid)} / {formatInr(view.payments.total)}</SectionTitle>
      <ul className="divide-y divide-[#f0ebe2]">{ms.data!.map(m => <Row key={m.id} m={m} user={user} orderId={view.order.id} onDone={done} />)}</ul>
      {user.role === 'admin' && (
        <details className="mt-2 text-xs"><summary className="cursor-pointer text-warmgray">Edit milestone amounts</summary>
          <div className="space-y-2 mt-2">
            {error && <ErrorNote message={error} />}
            {ms.data!.filter(m => m.kind !== 'SURVEY_FEE').map(m => (
              <div key={m.id} className="flex items-center gap-2"><span className="w-40">{m.label}</span>
                <input className={inputCls} inputMode="numeric" placeholder={String(m.amount)} value={edit[m.kind] ?? ''} onChange={e => setEdit({ ...edit, [m.kind]: e.target.value })} /></div>
            ))}
            <input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (audited)" />
            <Button variant="secondary" disabled={busy || !reason.trim()} onClick={() => run(() => editMilestoneAmounts(ctx, actor, view.order.id,
              Object.fromEntries(Object.entries(edit).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])), reason)).then(ok => ok && done())}>Save amounts</Button>
          </div>
        </details>
      )}
    </Card>
  );
};
