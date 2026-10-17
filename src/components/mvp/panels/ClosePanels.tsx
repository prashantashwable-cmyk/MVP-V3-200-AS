/**
 * Closing panels: handover with its gates (spec §20, D-14, D-29),
 * documents and compliance (D-27), AMC (D-26), hold review (D-24) and the
 * customer's EMERGENCY button (D-28).
 */
import React, { useState } from 'react';
import { PhoneCall, Siren } from 'lucide-react';
import * as svc from '../../../mvp/service';
import { MVP_CONFIG } from '../../../mvp/config';
import { formatIst } from '../../../mvp/money';
import { COMPLIANCE_TYPES, type ComplianceStatus, type ComplianceType, type Evidence, type MvpAmcStatus } from '../../../mvp/types';
import type { OrderBundle } from '../../../mvp/views';
import { Btn, C, ErrorText, EvidenceThumbs, Field, Input, PhotoInput, Pill, Select, TextArea, fromDateInput, toDateInput, useAction, useLoader } from '../../../mvp/ui/kit';
import { t } from '../../../mvp/ui/i18n';
import type { PanelProps } from './CommercialPanels';

export const HandoverPanel: React.FC<PanelProps> = ({ ctx, bundle, onDone }) => {
  const a = useAction(onDone);
  const [finalTest, setFinalTest] = useState('');
  const [photos, setPhotos] = useState<Evidence[]>([]);
  const [overrides, setOverrides] = useState<Partial<Record<svc.HandoverGate, string>>>({});
  const fin = bundle.milestones.find(m => m.kind === 'FINAL');
  const licence = bundle.compliance.find(d => d.type === 'LIFT_LICENCE');
  const approved = !!bundle.handover?.customerApprovedAt;
  if (ctx.actor.role === 'customer') {
    return (
      <div className="space-y-3">
        <p className="text-sm" style={{ color: C.muted }}>Check the lift with the team. When you are satisfied, approve the handover.</p>
        {approved ? <Pill>Approved {formatIst(bundle.handover!.customerApprovedAt)}</Pill> : (
          <Btn tone="green" busy={a.busy} onClick={() => a.run(() => svc.approveHandoverAsCustomer(ctx, bundle.order.id), 'Thank you — handover approved')}>{t('approveHandover')}</Btn>
        )}
        <ErrorText error={a.error} />
      </div>
    );
  }
  const gates: [svc.HandoverGate, string, boolean][] = [
    ['FINAL_PAYMENT', 'Final payment PAID', fin?.status === 'PAID'],
    ['LICENCE', 'Statutory lift licence DONE ⚖ VERIFY', licence?.status === 'DONE'],
    ['CUSTOMER_APPROVAL', 'Customer approved the handover', approved],
  ];
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {gates.map(([g, label, ok]) => (
          <li key={g} className="rounded-xl p-2 text-sm space-y-1" style={{ background: ok ? '#0B2A1E' : '#2A1416' }}>
            <div>{ok ? '✅' : '⛔'} {label}</div>
            {!ok && <Input placeholder="Override reason (Admin, audited)" value={overrides[g] ?? ''} onChange={e => setOverrides({ ...overrides, [g]: e.target.value })} />}
          </li>
        ))}
      </ul>
      {!approved && <Btn tone="ghost" busy={a.busy} onClick={() => a.run(() => svc.approveHandoverAsCustomer(ctx, bundle.order.id), 'Customer approval recorded on their behalf')}>Record customer approval (on behalf)</Btn>}
      <Field label="Final test"><TextArea value={finalTest} onChange={e => setFinalTest(e.target.value)} /></Field>
      <EvidenceThumbs items={photos} />
      <PhotoInput ctx={ctx} orderKey={bundle.order.id} onAdd={e => setPhotos([...photos, e])} />
      <ErrorText error={a.error} />
      <Btn tone="green" busy={a.busy} onClick={() => a.run(() => svc.completeHandover(ctx, bundle.order.id, { finalTest, photos, overrides }), 'Handover complete — warranty and AMC tracking started')}>Complete handover</Btn>
    </div>
  );
};

export const CompliancePanel: React.FC<{ ctx: svc.ServiceCtx; bundle: OrderBundle; onDone: () => void; only?: ComplianceType }> = ({ ctx, bundle, onDone, only }) => {
  const rows = COMPLIANCE_TYPES.filter(([k]) => !only || k === only);
  const canEdit = ctx.actor.role === 'admin';
  return (
    <div className="space-y-2">
      <p className="text-[11px]" style={{ color: C.muted }}>⚖ VERIFY: the app records these documents; it does not make the lift legally compliant.</p>
      {rows.map(([type, label]) => {
        const d = bundle.compliance.find(x => x.type === type);
        // Keyed by the stored version so the form shows fresh values after every save.
        return canEdit ? <ComplianceRow key={`${type}_${d?.updatedAt ?? ''}`} ctx={ctx} orderId={bundle.order.id} type={type} label={label} doc={d} onDone={onDone} />
          : <div key={type} className="flex justify-between text-sm"><span>{label}</span><span style={{ color: C.muted }}>{d?.status ?? 'NOT_STARTED'}</span></div>;
      })}
    </div>
  );
};

const ComplianceRow: React.FC<{ ctx: svc.ServiceCtx; orderId: string; type: ComplianceType; label: string; doc?: any; onDone: () => void }> = ({ ctx, orderId, type, label, doc, onDone }) => {
  const a = useAction(onDone);
  const [status, setStatus] = useState<ComplianceStatus>(doc?.status ?? 'NOT_STARTED');
  const [file, setFile] = useState<Evidence | undefined>(doc?.file);
  const [note, setNote] = useState(doc?.note ?? '');
  return (
    <div className="rounded-xl p-2 space-y-2" style={{ background: C.deep }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-semibold">{label}</span>
        {file ? <EvidenceThumbs items={[file]} /> : <PhotoInput ctx={ctx} orderKey={orderId} accept="application/pdf,image/*" label="Attach file" onAdd={setFile} />}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select aria-label={`${label} status`} value={status} onChange={e => setStatus(e.target.value as ComplianceStatus)}>
          {['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'NOT_APPLICABLE'].map(s => <option key={s}>{s}</option>)}
        </Select>
        <Input aria-label={`${label} note`} placeholder="Note" value={note} onChange={e => setNote(e.target.value)} />
      </div>
      <ErrorText error={a.error} />
      <Btn tone="ghost" busy={a.busy} onClick={() => a.run(() => svc.setComplianceDoc(ctx, orderId, type, status, file, note), `${label} saved`)}>{t('save')}</Btn>
    </div>
  );
};

export const AmcPanel: React.FC<{ ctx: svc.ServiceCtx; bundle: OrderBundle; onDone: () => void }> = ({ ctx, bundle, onDone }) => {
  const amc = bundle.amc;
  const a = useAction(onDone);
  const [status, setStatus] = useState<MvpAmcStatus>(amc?.mvpAmcStatus ?? 'WARRANTY');
  const [last, setLast] = useState(toDateInput(amc?.lastService));
  const [next, setNext] = useState(toDateInput(amc?.nextService));
  const [complaint, setComplaint] = useState('');
  if (!amc) return <p className="text-sm" style={{ color: C.muted }}>AMC tracking starts at handover.</p>;
  const shown = svc.effectiveAmcStatus(amc, new Date());
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-xl p-3 grid grid-cols-2 gap-1" style={{ background: C.card.amc, color: '#1C1238' }}>
        <span>Status</span><b className="text-right">{shown.replace('_', ' ')}</b>
        <span>Warranty ends</span><span className="text-right">{formatIst(amc.warrantyEnd)}</span>
        <span>AMC reminder</span><span className="text-right">{formatIst(amc.amcReminderDate)}</span>
        <span>Last service</span><span className="text-right">{formatIst(amc.lastService)}</span>
        <span>Next service</span><span className="text-right">{formatIst(amc.nextService)}</span>
        <span>Complaints</span><span className="text-right">{amc.complaints.length}</span>
      </div>
      {ctx.actor.role === 'admin' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="AMC status">
              <Select value={status} onChange={e => setStatus(e.target.value as MvpAmcStatus)}>
                {['WARRANTY', 'AMC_OFFERED', 'AMC_ACTIVE', 'AMC_LOST'].map(s => <option key={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Last service"><Input type="date" value={last} onChange={e => setLast(e.target.value)} /></Field>
            <Field label="Next service"><Input type="date" value={next} onChange={e => setNext(e.target.value)} /></Field>
            <Field label="New complaint"><Input value={complaint} onChange={e => setComplaint(e.target.value)} /></Field>
          </div>
          <ErrorText error={a.error} />
          <Btn tone="ghost" busy={a.busy} onClick={() => a.run(() => svc.updateAmc(ctx, bundle.order.id, {
            mvpAmcStatus: status, lastService: last ? fromDateInput(last) : undefined, nextService: next ? fromDateInput(next) : undefined, complaint: complaint || undefined,
          }), 'AMC updated')}>{t('save')}</Btn>
        </>
      )}
    </div>
  );
};

export const HoldReviewPanel: React.FC<PanelProps> = ({ ctx, bundle, onDone }) => {
  const a = useAction(onDone);
  const [reason, setReason] = useState('');
  return (
    <div className="space-y-3">
      <p className="text-sm">On hold: <b>{bundle.order.holdReason || '—'}</b> · review {formatIst(bundle.order.holdReviewDate)}</p>
      <ErrorText error={a.error} />
      <div className="flex gap-2 flex-wrap">
        <Btn tone="green" busy={a.busy} onClick={() => a.run(() => svc.resumeOrder(ctx, bundle.order.id), 'Order resumed')}>Resume order</Btn>
        <Input placeholder="Reason to cancel" value={reason} onChange={e => setReason(e.target.value)} className="max-w-xs" />
        <Btn tone="danger" busy={a.busy} disabled={!reason.trim()} onClick={() => a.run(() => svc.cancelOrder(ctx, bundle.order.id, reason), 'Order cancelled')}>Cancel order</Btn>
      </div>
    </div>
  );
};

/** D-28: one red button for an installed lift, plus the configured emergency number. */
export const EmergencyButton: React.FC<{ ctx: svc.ServiceCtx; bundle: OrderBundle; onDone: () => void }> = ({ ctx, bundle, onDone }) => {
  const settings = useLoader(() => svc.loadSettings(ctx), [ctx]);
  const [open, setOpen] = useState(false);
  const [what, setWhat] = useState('Lift stuck between floors');
  const a = useAction(() => { setOpen(false); onDone(); });
  const phone = settings.data?.emergencyPhone || MVP_CONFIG.EMERGENCY_PHONE_FALLBACK;
  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: '#2A0D0F', border: '1px solid #C0392B' }}>
      <p className="text-sm font-bold" style={{ color: '#FFB3B3' }}>{MVP_CONFIG.EMERGENCY_TRAPPED_MESSAGE} <span className="text-[10px] font-normal">⚖ VERIFY</span></p>
      <div className="flex gap-2 flex-wrap">
        <a href={`tel:${phone}`} className="min-h-[44px] px-4 rounded-xl text-sm font-semibold inline-flex items-center gap-2" style={{ border: '1px solid #FFB3B3', color: '#FFB3B3' }}>
          <PhoneCall className="w-4 h-4" aria-hidden /> {t('call')} {phone}
        </a>
        {!open && <Btn tone="danger" onClick={() => setOpen(true)}><Siren className="w-4 h-4" aria-hidden /> {t('emergency')}</Btn>}
      </div>
      {open && (
        <div className="space-y-2">
          <Field label={t('emergencyHelp')}>
            <Select value={what} onChange={e => setWhat(e.target.value)}>
              {['Lift stuck between floors', 'Someone trapped inside', 'Doors not opening', 'Unusual noise or smell', 'Other danger'].map(x => <option key={x}>{x}</option>)}
            </Select>
          </Field>
          <ErrorText error={a.error} />
          <Btn tone="danger" busy={a.busy} onClick={() => a.run(() => svc.raiseEmergency(ctx, bundle.order.id, what), 'Emergency sent — the on-call technician is alerted')}>Send emergency alert</Btn>
        </div>
      )}
    </div>
  );
};

export { TextArea };
