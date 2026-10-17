/**
 * Action panels for field work: survey (spec §15), site readiness and
 * correction, delivery tracking, installation (spec §18, START gate),
 * blockers (spec §12), QC (spec §19), rework and emergency response (D-28).
 */
import React, { useState } from 'react';
import * as svc from '../../../mvp/service';
import { isOpenTask } from '../../../mvp/health';
import { formatIst } from '../../../mvp/money';
import { BLOCKER_REASONS, type BlockerReason, type Evidence, type QcDecision, type SurveyResult } from '../../../mvp/types';
import { Btn, C, Check, ErrorText, EvidenceThumbs, Field, Input, PhotoInput, Pill, Select, TextArea, fromDateInput, toDateInput, useAction } from '../../../mvp/ui/kit';
import { t } from '../../../mvp/ui/i18n';
import type { PanelProps } from './CommercialPanels';

const Photos: React.FC<{ ctx: svc.ServiceCtx; orderKey: string; value: Evidence[]; onChange: (v: Evidence[]) => void; label?: string }> = ({ ctx, orderKey, value, onChange, label }) => (
  <div className="space-y-2">
    <EvidenceThumbs items={value} />
    <PhotoInput ctx={ctx} orderKey={orderKey} label={label ?? t('addPhoto')} onAdd={e => onChange([...value, e])} />
  </div>
);

export const SurveyPanel: React.FC<PanelProps> = ({ ctx, bundle, onDone }) => {
  const [f, setF] = useState({
    floors: bundle.order.lift?.floors ?? 0, stops: 0, capacity: '', shaftWidthMm: 0, shaftDepthMm: 0, pitMm: 0, headroomMm: 0,
    power: '', access: '', siteReadiness: '', remarks: '', feasibility: '', result: 'FEASIBLE' as SurveyResult,
  });
  const [photos, setPhotos] = useState<Evidence[]>([]);
  const a = useAction(onDone);
  const num = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Math.max(0, Number(e.target.value) || 0) });
  const txt = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Field label="Floors"><Input inputMode="numeric" value={f.floors || ''} onChange={num('floors')} /></Field>
        <Field label="Stops"><Input inputMode="numeric" value={f.stops || ''} onChange={num('stops')} /></Field>
        <Field label="Capacity"><Input value={f.capacity} onChange={txt('capacity')} placeholder="8 persons" /></Field>
        <Field label="Shaft width (mm)"><Input inputMode="numeric" value={f.shaftWidthMm || ''} onChange={num('shaftWidthMm')} /></Field>
        <Field label="Shaft depth (mm)"><Input inputMode="numeric" value={f.shaftDepthMm || ''} onChange={num('shaftDepthMm')} /></Field>
        <Field label="Pit (mm)"><Input inputMode="numeric" value={f.pitMm || ''} onChange={num('pitMm')} /></Field>
        <Field label="Headroom (mm)"><Input inputMode="numeric" value={f.headroomMm || ''} onChange={num('headroomMm')} /></Field>
        <Field label="Power"><Input value={f.power} onChange={txt('power')} placeholder="3-phase available" /></Field>
        <Field label="Access"><Input value={f.access} onChange={txt('access')} /></Field>
      </div>
      <Field label="Site readiness"><Input value={f.siteReadiness} onChange={txt('siteReadiness')} /></Field>
      <Field label="Feasibility notes"><Input value={f.feasibility} onChange={txt('feasibility')} /></Field>
      <Field label="Remarks"><TextArea value={f.remarks} onChange={e => setF({ ...f, remarks: e.target.value })} /></Field>
      <Field label="Result">
        <Select value={f.result} onChange={e => setF({ ...f, result: e.target.value as SurveyResult })}>
          <option value="FEASIBLE">Feasible</option>
          <option value="REQUIRES_CORRECTION">Requires correction (customer fixes the site)</option>
          <option value="NOT_FEASIBLE">Not feasible</option>
        </Select>
      </Field>
      <Photos ctx={ctx} orderKey={bundle.order.id} value={photos} onChange={setPhotos} />
      <ErrorText error={a.error} />
      <Btn busy={a.busy} disabled={!photos.length || !f.floors || !f.stops} onClick={() => a.run(() => svc.submitSurvey(ctx, bundle.order.id, { ...f, photos }), 'Survey submitted')}>{t('submit')}</Btn>
    </div>
  );
};

export const SiteReadinessPanel: React.FC<PanelProps> = ({ ctx, bundle, task, onDone }) => {
  const [photos, setPhotos] = useState<Evidence[]>([]);
  const [note, setNote] = useState('');
  const a = useAction(onDone);
  const correction = task.type === 'SITE_CORRECTION';
  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: C.muted }}>
        {correction ? 'The surveyor asked for site corrections. Fix them, add photos, then submit.' : 'Prepare the shaft, power and access. Add photos of the ready site, then confirm.'}
      </p>
      <Photos ctx={ctx} orderKey={bundle.order.id} value={photos} onChange={setPhotos} />
      <Field label={t('notes')}><TextArea value={note} onChange={e => setNote(e.target.value)} /></Field>
      <ErrorText error={a.error} />
      <Btn busy={a.busy} disabled={!photos.length} onClick={() => a.run(() => correction
        ? svc.completeSiteCorrection(ctx, task.id, photos, note)
        : svc.submitSiteReadiness(ctx, bundle.order.id, photos, note), 'Sent to the Admin')}>
        {correction ? t('submit') : t('siteReady')}
      </Btn>
    </div>
  );
};

export const VerifySitePanel: React.FC<PanelProps> = ({ ctx, bundle, onDone }) => {
  const a = useAction(onDone);
  const readiness = bundle.tasks.filter(x => x.type === 'SITE_READINESS').flatMap(x => x.evidence);
  return (
    <div className="space-y-3">
      <EvidenceThumbs items={readiness} />
      <ErrorText error={a.error} />
      <Btn busy={a.busy} onClick={() => a.run(() => svc.confirmSiteReady(ctx, bundle.order.id), 'Site confirmed — delivery tracking started')}>Confirm site is ready</Btn>
    </div>
  );
};

export const DeliveryPanel: React.FC<PanelProps> = ({ ctx, bundle, people, onDone }) => {
  const techs = people.filter(p => p.role === 'technician');
  const [tech, setTech] = useState(techs[0]?.id ?? '');
  const [photos, setPhotos] = useState<Evidence[]>([]);
  const a = useAction(onDone);
  return (
    <div className="space-y-3">
      {bundle.purchaseOrders.map(po => <PoRow key={po.id} ctx={ctx} po={po} onDone={onDone} />)}
      <Field label="Installing technician">
        <Select value={tech} onChange={e => setTech(e.target.value)}>
          {techs.length === 0 && <option value="">No technician yet — invite one in Team & settings</option>}
          {techs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <Photos ctx={ctx} orderKey={bundle.order.id} value={photos} onChange={setPhotos} label="Photo of material at site" />
      <ErrorText error={a.error} />
      <Btn busy={a.busy} disabled={!tech} onClick={() => a.run(() => svc.markMaterialReceived(ctx, bundle.order.id, tech, photos), 'Material received — installation scheduled')}>Mark material received</Btn>
    </div>
  );
};

const PoRow: React.FC<{ ctx: svc.ServiceCtx; po: any; onDone: () => void }> = ({ ctx, po, onDone }) => {
  const a = useAction(onDone);
  const [status, setStatus] = useState(po.materialStatus);
  const [date, setDate] = useState(toDateInput(po.expectedDeliveryDate));
  const [note, setNote] = useState(po.delayNote ?? '');
  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: C.deep }}>
      <div className="text-sm flex justify-between gap-2 flex-wrap"><b>{po.supplierName}</b><span style={{ color: C.muted }}>expected {formatIst(po.expectedDeliveryDate)}</span></div>
      <div className="grid grid-cols-2 gap-2">
        <Select aria-label="Material status" value={status} onChange={e => setStatus(e.target.value)}>
          {['ORDERED', 'DISPATCHED', 'DELAYED', 'RECEIVED'].map(s => <option key={s}>{s}</option>)}
        </Select>
        <Input aria-label="Expected delivery" type="date" value={date} onChange={e => setDate(e.target.value)} />
        <Input className="col-span-2" placeholder="Delay note (if any)" value={note} onChange={e => setNote(e.target.value)} />
      </div>
      <ErrorText error={a.error} />
      <Btn tone="ghost" busy={a.busy} onClick={() => a.run(() => svc.updatePurchaseOrder(ctx, po.id, { materialStatus: status, expectedDeliveryDate: fromDateInput(date), delayNote: note }), 'PO updated')}>Update PO</Btn>
    </div>
  );
};

export const InstallationPanel: React.FC<PanelProps> = ({ ctx, bundle, task, onDone }) => {
  const a = useAction(onDone);
  const [reason, setReason] = useState('');
  const items = bundle.checklist?.items ?? [];
  const done = items.filter(i => i.done).length;
  const delivery = bundle.milestones.find(m => m.kind === 'DELIVERY');
  const gated = task.status === 'TODO' && delivery?.status !== 'PAID' && !task.gateOverrides?.[svc.GATE_DELIVERY_PAYMENT];
  return (
    <div className="space-y-3">
      {task.status === 'TODO' && (
        <div className="space-y-2">
          {gated && <p className="text-sm" style={{ color: '#F5D27A' }}>Waiting for delivery payment. START opens once the Admin records it (or overrides).</p>}
          <Btn busy={a.busy} onClick={() => a.run(() => svc.startTask(ctx, task.id), 'Started')}>{t('start')}</Btn>
          {gated && ctx.actor.role === 'admin' && (
            <div className="flex gap-2 items-end flex-wrap">
              <Field label="Override reason"><Input value={reason} onChange={e => setReason(e.target.value)} /></Field>
              <Btn tone="ghost" busy={a.busy} disabled={!reason.trim()} onClick={() => a.run(() => svc.overrideGate(ctx, task.id, svc.GATE_DELIVERY_PAYMENT, reason), 'Gate overridden (audited)')}>Override gate</Btn>
            </div>
          )}
        </div>
      )}
      {task.status === 'IN_PROGRESS' && !task.checkedInAt && <Btn tone="ghost" busy={a.busy} onClick={() => a.run(() => svc.checkIn(ctx, task.id), 'Checked in')}>{t('checkIn')}</Btn>}
      {task.checkedInAt && <Pill tone="gold">Checked in {formatIst(task.checkedInAt)}</Pill>}
      {task.status !== 'TODO' && (
        <div className="space-y-2">
          <div className="text-sm font-semibold">{t('checklist')} · {done}/{items.length}</div>
          {items.map(i => <ChecklistRow key={i.key} ctx={ctx} orderId={bundle.order.id} item={i} disabled={task.status === 'BLOCKED'} onDone={onDone} />)}
        </div>
      )}
      <ErrorText error={a.error} />
      {task.status === 'IN_PROGRESS' && (
        <Btn tone="green" busy={a.busy} disabled={done < items.length} onClick={() => a.run(() => svc.completeInstallation(ctx, bundle.order.id), 'Installation complete — QC requested')}>{t('complete')}</Btn>
      )}
    </div>
  );
};

const ChecklistRow: React.FC<{ ctx: svc.ServiceCtx; orderId: string; item: any; disabled: boolean; onDone: () => void }> = ({ ctx, orderId, item, disabled, onDone }) => {
  const a = useAction(onDone);
  const [photo, setPhoto] = useState<Evidence | undefined>(item.photo);
  return (
    <div className="rounded-xl p-2 flex items-center gap-2 flex-wrap" style={{ background: item.done ? '#0B2A1E' : C.deep }}>
      <button
        type="button"
        disabled={disabled || a.busy}
        aria-pressed={item.done}
        aria-label={`${item.label}: ${item.done ? 'done, tap to undo' : 'mark done'}`}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-[#E6C473]"
        onClick={() => a.run(() => svc.updateChecklistItem(ctx, orderId, item.key, !item.done, photo))}
      >
        <Check done={item.done} />
      </button>
      <span className="text-sm flex-1 min-w-[140px]">{item.label}</span>
      {photo ? <EvidenceThumbs items={[photo]} /> : !item.done && <PhotoInput ctx={ctx} orderKey={orderId} onAdd={setPhoto} label="Photo" />}
      <ErrorText error={a.error} />
    </div>
  );
};

export const BlockerForm: React.FC<{ ctx: svc.ServiceCtx; orderId: string; taskId?: string; onDone: () => void; defaultReason?: BlockerReason }> = ({ ctx, orderId, taskId, onDone, defaultReason = 'MATERIAL_MISSING' }) => {
  const [reason, setReason] = useState<BlockerReason>(defaultReason);
  const [desc, setDesc] = useState('');
  const [photos, setPhotos] = useState<Evidence[]>([]);
  const a = useAction(onDone);
  return (
    <div className="space-y-3">
      <Field label={t('reason')}>
        <Select value={reason} onChange={e => setReason(e.target.value as BlockerReason)}>
          {BLOCKER_REASONS.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ').toLowerCase()}</option>)}
        </Select>
      </Field>
      <Field label={t('description')}><TextArea value={desc} onChange={e => setDesc(e.target.value)} /></Field>
      <Photos ctx={ctx} orderKey={orderId} value={photos} onChange={setPhotos} />
      <ErrorText error={a.error} />
      <Btn tone="danger" busy={a.busy} disabled={!desc.trim()} onClick={() => a.run(() => svc.raiseBlocker(ctx, orderId, { taskId, reason, description: desc, evidence: photos }), 'Blocker raised — the Admin is notified')}>{t('blocked')}</Btn>
    </div>
  );
};

export const QcPanel: React.FC<PanelProps> = ({ ctx, bundle, onDone }) => {
  const [testResults, setTests] = useState('');
  const [remarks, setRemarks] = useState('');
  const [photos, setPhotos] = useState<Evidence[]>([]);
  const a = useAction(onDone);
  const decide = (d: QcDecision) => a.run(() => svc.recordQcDecision(ctx, bundle.order.id, { decision: d, testResults, remarks, evidence: photos }), `QC ${d}`);
  const install = bundle.tasks.filter(x => x.type === 'INSTALLATION' || x.type === 'REWORK').flatMap(x => x.evidence);
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="text-xs font-semibold" style={{ color: C.muted }}>Installation checklist</div>
        {(bundle.checklist?.items ?? []).map(i => (
          <div key={i.key} className="flex items-center gap-2 text-sm"><Check done={i.done} /> {i.label} {i.photo && <EvidenceThumbs items={[i.photo]} />}</div>
        ))}
        <EvidenceThumbs items={install} />
      </div>
      <Field label="Test results"><TextArea value={testResults} onChange={e => setTests(e.target.value)} /></Field>
      <Field label="Remarks (required for rework or fail)"><TextArea value={remarks} onChange={e => setRemarks(e.target.value)} /></Field>
      <Photos ctx={ctx} orderKey={bundle.order.id} value={photos} onChange={setPhotos} />
      <ErrorText error={a.error} />
      <div className="flex gap-2 flex-wrap">
        <Btn tone="green" busy={a.busy} onClick={() => decide('PASS')}>PASS</Btn>
        <Btn busy={a.busy} disabled={!remarks.trim()} onClick={() => decide('REWORK')}>REWORK</Btn>
        <Btn tone="danger" busy={a.busy} disabled={!remarks.trim()} onClick={() => decide('FAIL')}>FAIL</Btn>
      </div>
    </div>
  );
};

export const ReworkPanel: React.FC<PanelProps> = ({ ctx, bundle, task, onDone }) => {
  const last = [...bundle.qcRecords].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  const [photos, setPhotos] = useState<Evidence[]>([]);
  const [note, setNote] = useState('');
  const a = useAction(onDone);
  return (
    <div className="space-y-3">
      {last && <div className="rounded-xl p-3 text-sm" style={{ background: C.card.action, color: '#3B0A10' }}>QC: {last.remarks}</div>}
      <Photos ctx={ctx} orderKey={bundle.order.id} value={photos} onChange={setPhotos} label="Photo of the fix" />
      <Field label={t('notes')}><TextArea value={note} onChange={e => setNote(e.target.value)} /></Field>
      <ErrorText error={a.error} />
      <Btn tone="green" busy={a.busy} disabled={!photos.length} onClick={() => a.run(() => svc.completeRework(ctx, task.id, photos, note), 'Rework done — QC re-inspection requested')}>{t('complete')}</Btn>
    </div>
  );
};

export const EmergencyResponsePanel: React.FC<PanelProps> = ({ ctx, bundle, task, onDone }) => {
  const sc = bundle.serviceCases.find(s => s.taskId === task.id);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<Evidence | undefined>();
  const a = useAction(onDone);
  if (!sc) return null;
  return (
    <div className="space-y-3">
      <div className="rounded-xl p-3 text-sm font-semibold" style={{ background: '#C0392B', color: 'white' }}>{sc.description} · raised {formatIst(sc.createdAt)}</div>
      {sc.status === 'OPEN' && <Btn tone="danger" busy={a.busy} onClick={() => a.run(() => svc.acknowledgeEmergency(ctx, sc.id), 'Acknowledged')}>Acknowledge — I am on it</Btn>}
      <Field label="Resolution note"><TextArea value={note} onChange={e => setNote(e.target.value)} /></Field>
      {photo ? <EvidenceThumbs items={[photo]} /> : <PhotoInput ctx={ctx} orderKey={bundle.order.id} onAdd={setPhoto} />}
      <ErrorText error={a.error} />
      <Btn tone="green" busy={a.busy} disabled={!note.trim()} onClick={() => a.run(() => svc.resolveEmergency(ctx, sc.id, note, photo), 'Emergency resolved')}>Resolve</Btn>
    </div>
  );
};

export const openBlockerFor = (bundle: PanelProps['bundle'], taskId: string) => bundle.blockers.find(b => b.taskId === taskId && b.status === 'OPEN');
export { isOpenTask };
