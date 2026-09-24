/**
 * QC decision, handover, compliance and AMC panels inside the Order View (spec §19–21,
 * D-26, D-27, D-29), plus the emergency button and its ack/resolve panel (D-28). Payment
 * (including the final payment) is already shown generically by PaymentsPanel — reused
 * as-is, nothing new here for money.
 */

import React, { useState } from 'react';
import { AlertOctagon, Phone } from 'lucide-react';
import type { User } from '../../types';
import type { ComplianceType } from '../../domain/entities';
import { Button, Card } from '../../components/Common';
import {
  acknowledgeEmergency, dateKey, getOnCallTechnician, listOpenEmergencies, raiseEmergency, resolveEmergency, setOnCallTechnician,
} from '../services/emergencyService';
import {
  amcDisplayStatus, checkHandoverGates, completeHandover, COMPLIANCE_TYPES, getAmc, getHandover, listComplianceItems,
  QC_TEST_ITEMS, recordAmcService, setAmcStatus, setComplianceItem, submitQcDecision, type QcTestKey,
} from '../services/qcHandoverService';
import { getJob } from '../services/installationService';
import { overrideGate } from '../gates';
import { listPeople } from '../services/people';
import { EMERGENCY_112_LINE, EMERGENCY_PHONE } from '../config';
import { formatDate, formatDateTime } from '../format';
import type { OrderViewExtraProps } from './MvpOrderView';
import { PhotoInput, type SavedPhoto } from './PhotoInput';
import { ErrorNote, inputCls, labelCls, SectionTitle, useAction, useLoad, useMvpCtx } from './ui';

// ---------------------------------------------------------------------------
// QC decision (spec §19)
// ---------------------------------------------------------------------------

export const QcPanel: React.FC<{ user: User } & OrderViewExtraProps> = ({ user, view, reload }) => {
  const { ctx, actor } = useMvpCtx(user);
  const { run, busy, error } = useAction();
  const task = view.openTasks.find(t => t.type === 'QC_INSPECTION');
  const job = useLoad(() => (task ? getJob(ctx, view.order.id) : Promise.resolve(null)), [task?.id]);
  const techs = useLoad(() => (task ? listPeople(ctx, 'technician') : Promise.resolve([])), [task?.id]);
  const [tests, setTests] = useState<Record<QcTestKey, boolean>>({});
  const [remarks, setRemarks] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [photos, setPhotos] = useState<SavedPhoto[]>([]);
  if (!task || (user.role !== 'qc' && user.role !== 'admin')) return null;
  const act = (decision: 'PASS' | 'REWORK' | 'FAIL') => run(() => submitQcDecision(ctx, actor, view.order.id, {
    decision, tests, remarks, technicianId: technicianId || undefined, documentIds: photos.map(p => p.id),
  })).then(ok => ok && reload());

  return (
    <Card className="p-4 space-y-3">
      <SectionTitle>QC inspection</SectionTitle>
      {error && <ErrorNote message={error} />}
      <ul className="space-y-1">
        {QC_TEST_ITEMS.map(item => (
          <li key={item.key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!tests[item.key]} onChange={e => setTests({ ...tests, [item.key]: e.target.checked })} />
            {item.label}
          </li>
        ))}
      </ul>
      <PhotoInput ctx={ctx} actor={actor} target={{ orderId: view.order.id, taskId: task.id }} caption="QC inspection" photos={photos} onChange={setPhotos} label="Add photo" />
      <div>
        <label className={labelCls}>Remarks (required)</label>
        <textarea className={inputCls} rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Test results and remarks" />
      </div>
      <div>
        <label className={labelCls}>If REWORK: technician</label>
        <select className={inputCls} value={technicianId} onChange={e => setTechnicianId(e.target.value)}>
          <option value="">{job.data?.technicianId ? 'Same technician (default)' : 'Choose…'}</option>
          {(techs.data ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="emerald" disabled={busy || !remarks.trim()} onClick={() => act('PASS')}>PASS</Button>
        <Button variant="secondary" disabled={busy || !remarks.trim()} onClick={() => act('REWORK')}>REWORK</Button>
        <Button variant="danger" disabled={busy || !remarks.trim()} onClick={() => act('FAIL')}>FAIL</Button>
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Handover (spec §20, D-26, D-29)
// ---------------------------------------------------------------------------

export const HandoverPanel: React.FC<{ user: User } & OrderViewExtraProps> = ({ user, view, reload }) => {
  const { ctx, actor } = useMvpCtx(user);
  const { run, busy, error } = useAction();
  const task = view.openTasks.find(t => t.type === 'HANDOVER');
  const gates = useLoad(() => (task ? checkHandoverGates(ctx, view.order.id) : Promise.resolve([])), [task?.id, view.payments?.paid]);
  const [name, setName] = useState(view.customerName);
  const [tested, setTested] = useState(false);
  const [photos, setPhotos] = useState<SavedPhoto[]>([]);
  const [reason, setReason] = useState('');
  if (!task) return null;
  if (user.role !== 'admin') {
    return (
      <Card className="p-4 text-sm text-warmgray">Handover in progress — the Admin will complete this with you on site.</Card>
    );
  }
  const blocked = (gates.data ?? []).filter(g => !g.allowed);
  const act = () => run(() => completeHandover(ctx, actor, view.order.id, {
    customerConfirmedName: name, finalTestConfirmed: tested, documentIds: photos.map(p => p.id),
  })).then(ok => ok && reload());

  return (
    <Card className="p-4 space-y-3">
      <SectionTitle>Handover</SectionTitle>
      {error && <ErrorNote message={error} />}
      {blocked.map(g => (
        <div key={g.gate} className="p-2 rounded-lg bg-error/10 text-xs text-error">
          {g.reason}. Override with a reason to continue:
          <div className="flex gap-2 mt-1">
            <input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} placeholder="Override reason" />
            <Button variant="ghost" disabled={busy || !reason.trim()} onClick={() => run(() => overrideGate(ctx, actor, view.order.id, g.gate, reason)).then(ok => ok && gates.reload())}>Override</Button>
          </div>
        </div>
      ))}
      <div>
        <label className={labelCls}>Customer's name (confirming handover)</label>
        <input className={inputCls} value={name} onChange={e => setName(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={tested} onChange={e => setTested(e.target.checked)} />
        The final test run was confirmed with the customer
      </label>
      <PhotoInput ctx={ctx} actor={actor} target={{ orderId: view.order.id, taskId: task.id }} caption="Handover" photos={photos} onChange={setPhotos} label="Handover photo" />
      <Button variant="emerald" fullWidth disabled={busy || !name.trim() || !tested || blocked.length > 0}
        onClick={act}>Complete handover</Button>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Compliance (D-27 ⚖ VERIFY — a record, not a guarantee)
// ---------------------------------------------------------------------------

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

const ComplianceRow: React.FC<{ user: User; orderId: string; type: ComplianceType; label: string; item?: { status: string; documentId?: string; note?: string }; onDone: () => void }> = ({ user, orderId, type, label, item, onDone }) => {
  const { ctx, actor } = useMvpCtx(user);
  const { run, busy, error } = useAction();
  const [status, setStatus] = useState(item?.status ?? 'NOT_STARTED');
  const [note, setNote] = useState(item?.note ?? '');
  const [fileError, setFileError] = useState<string | null>(null);
  const [busyFile, setBusyFile] = useState(false);
  const save = (documentId?: string) => run(() => setComplianceItem(ctx, actor, orderId, type, { status: status as any, documentId: documentId ?? item?.documentId, note })).then(ok => ok && onDone());
  return (
    <li className="py-2 space-y-1 text-sm">
      <div className="flex justify-between gap-2"><span className="font-semibold">{label}</span>{item?.documentId && <span className="text-royalemerald text-xs font-bold">Document attached</span>}</div>
      {(error || fileError) && <ErrorNote message={error ?? fileError!} />}
      <div className="flex flex-wrap gap-2">
        <select className={`${inputCls} max-w-[170px]`} value={status} onChange={e => setStatus(e.target.value)}>
          {['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'NOT_APPLICABLE'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <input className={`${inputCls} flex-1`} value={note} onChange={e => setNote(e.target.value)} placeholder="Note" />
        <label className={`px-3 py-2.5 rounded-xl border border-[#e6dfd4] text-xs font-semibold cursor-pointer ${busyFile ? 'opacity-50' : ''}`}>
          {busyFile ? 'Reading…' : 'Attach file'}
          <input type="file" accept="application/pdf,image/*" className="hidden" disabled={busyFile} onChange={async e => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusyFile(true); setFileError(null);
            try {
              const dataUrl = await readFileAsDataUrl(file);
              const { saveEvidence } = await import('../services/evidenceService');
              const doc = await saveEvidence(ctx, actor, { dataUrl, contentType: file.type, orderId, caption: label });
              await save(doc.id);
            } catch (err) {
              setFileError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusyFile(false);
            }
          }} />
        </label>
        <Button variant="secondary" disabled={busy} onClick={() => save()}>Save</Button>
      </div>
    </li>
  );
};

export const CompliancePanel: React.FC<{ user: User } & OrderViewExtraProps> = ({ user, view }) => {
  const { ctx } = useMvpCtx(user);
  const items = useLoad(() => listComplianceItems(ctx, view.order.id), [ctx, view.order.id]);
  if (user.role !== 'admin') return null;
  const byType = Object.fromEntries((items.data ?? []).map(i => [i.type, i]));
  return (
    <Card className="p-4">
      <SectionTitle>Documents & compliance (⚖ record only, not a guarantee)</SectionTitle>
      <ul className="divide-y divide-[#f0ebe2]">
        {COMPLIANCE_TYPES.map(t => <ComplianceRow key={t.key} user={user} orderId={view.order.id} type={t.key} label={t.label} item={byType[t.key]} onDone={items.reload} />)}
      </ul>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// AMC (D-26)
// ---------------------------------------------------------------------------

const AMC_LABELS: Record<string, string> = { WARRANTY: 'Under warranty', AMC_DUE: 'AMC due', AMC_OFFERED: 'AMC offered', AMC_ACTIVE: 'AMC active', AMC_LOST: 'AMC lost', NONE: '—' };

export const AmcPanel: React.FC<{ user: User } & OrderViewExtraProps> = ({ user, view }) => {
  const { ctx, actor } = useMvpCtx(user);
  const { run, busy, error } = useAction();
  const amc = useLoad(() => (view.stage === 'AMC' ? getAmc(ctx, view.order.id) : Promise.resolve(null)), [ctx, view.order.id, view.stage]);
  const [last, setLast] = useState('');
  const [next, setNext] = useState('');
  if (view.stage !== 'AMC') return null;
  const display = amcDisplayStatus(amc.data, new Date());
  const act = (fn: () => Promise<unknown>) => run(fn).then(ok => ok && amc.reload());
  return (
    <Card className="p-4 space-y-2">
      <SectionTitle>Warranty & AMC</SectionTitle>
      {error && <ErrorNote message={error} />}
      <div className="text-sm">Warranty ends {formatDate(amc.data?.warrantyEnd)} · <strong>{AMC_LABELS[display] ?? display}</strong></div>
      {amc.data?.lastServiceDate && <div className="text-xs text-warmgray">Last service {formatDate(amc.data.lastServiceDate)}</div>}
      {amc.data?.nextServiceDate && <div className="text-xs text-warmgray">Next service {formatDate(amc.data.nextServiceDate)}</div>}
      {user.role === 'admin' && amc.data && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => act(() => setAmcStatus(ctx, actor, view.order.id, 'AMC_OFFERED'))}>Offer AMC</Button>
            <Button variant="emerald" disabled={busy} onClick={() => act(() => setAmcStatus(ctx, actor, view.order.id, 'AMC_ACTIVE'))}>Mark AMC active</Button>
            <Button variant="ghost" disabled={busy} onClick={() => act(() => setAmcStatus(ctx, actor, view.order.id, 'AMC_LOST'))}>Mark AMC lost</Button>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div><label className={labelCls}>Last service</label><input type="date" className={inputCls} value={last} onChange={e => setLast(e.target.value)} /></div>
            <div><label className={labelCls}>Next service</label><input type="date" className={inputCls} value={next} onChange={e => setNext(e.target.value)} /></div>
            <Button variant="secondary" disabled={busy || (!last && !next)} onClick={() => act(() => recordAmcService(ctx, actor, view.order.id, {
              lastServiceDate: last ? new Date(`${last}T12:00:00+05:30`).toISOString() : undefined,
              nextServiceDate: next ? new Date(`${next}T12:00:00+05:30`).toISOString() : undefined,
            }))}>Save</Button>
          </div>
        </>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Emergency (D-28, life safety)
// ---------------------------------------------------------------------------

const INSTALLED_STAGES = ['QC_HANDOVER', 'AMC'];

export const EmergencyButton: React.FC<{ user: User } & OrderViewExtraProps> = ({ user, view, reload }) => {
  const { ctx, actor } = useMvpCtx(user);
  const { run, busy, error } = useAction();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<SavedPhoto[]>([]);
  if (user.role !== 'customer' || !INSTALLED_STAGES.includes(view.stage)) return null;
  return (
    <Card className="p-4 space-y-2 border-2 border-error/30">
      <div className="text-xs font-bold text-error">{EMERGENCY_112_LINE}</div>
      {EMERGENCY_PHONE && <a href={`tel:${EMERGENCY_PHONE}`} className="text-sm font-bold text-error flex items-center gap-1"><Phone className="w-4 h-4" />{EMERGENCY_PHONE}</a>}
      {!open && <Button variant="danger" fullWidth onClick={() => setOpen(true)}><AlertOctagon className="w-4 h-4" />EMERGENCY</Button>}
      {open && (
        <div className="space-y-2">
          {error && <ErrorNote message={error} />}
          <textarea className={inputCls} rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder='What is happening, e.g. "Lift stuck between floors"' />
          <PhotoInput ctx={ctx} actor={actor} target={{ orderId: view.order.id }} caption="Emergency" photos={photos} onChange={setPhotos} label="Photo (optional)" />
          <div className="flex gap-2">
            <Button variant="danger" disabled={busy || !description.trim()} onClick={() => run(() => raiseEmergency(ctx, actor, view.order.id, {
              description, evidenceIds: photos.map(p => p.id),
            })).then(ok => { if (ok) { setOpen(false); setDescription(''); reload(); } })}>Send emergency alert</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
};

export const EmergencyPanel: React.FC<{ user: User } & OrderViewExtraProps> = ({ user, view, reload }) => {
  const { ctx, actor } = useMvpCtx(user);
  const { run, busy, error } = useAction();
  const cases = useLoad(() => listOpenEmergencies(ctx, view.order.id), [ctx, view.order.id, view.openTasks.length]);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<SavedPhoto[]>([]);
  if (user.role === 'customer') return null;
  const open = (cases.data ?? [])[0];
  if (!open) return null;
  const act = (fn: () => Promise<unknown>) => run(fn).then(ok => ok && (cases.reload(), reload()));
  return (
    <Card className="p-4 space-y-2 border-2 border-error bg-error/5">
      <div className="flex items-center gap-2 text-error font-bold text-sm"><AlertOctagon className="w-4 h-4" />EMERGENCY — {open.description}</div>
      {error && <ErrorNote message={error} />}
      <div className="text-xs text-warmgray">Reported {formatDateTime(open.createdAt)}{open.acknowledgedAt ? ` · acknowledged ${formatDateTime(open.acknowledgedAt)}` : ''}</div>
      {!open.acknowledgedAt && <Button variant="danger" disabled={busy} onClick={() => act(() => acknowledgeEmergency(ctx, actor, open.id))}>Acknowledge</Button>}
      {open.acknowledgedAt && (
        <div className="space-y-2">
          <textarea className={inputCls} rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="What was done" />
          <PhotoInput ctx={ctx} actor={actor} target={{ orderId: view.order.id }} caption="Emergency resolved" photos={photos} onChange={setPhotos} />
          <Button variant="emerald" disabled={busy || !note.trim()} onClick={() => act(() => resolveEmergency(ctx, actor, open.id, { note, documentId: photos[0]?.id }))}>Mark resolved</Button>
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Admin: today's on-call technician (D-28, a global daily setting — not per-order)
// ---------------------------------------------------------------------------

export const OnCallSetting: React.FC<{ user: User }> = ({ user }) => {
  const { ctx, actor } = useMvpCtx(user);
  const { run, busy, error } = useAction();
  const today = dateKey(new Date());
  const current = useLoad(() => getOnCallTechnician(ctx, today), [ctx, today]);
  const techs = useLoad(() => listPeople(ctx, 'technician'), [ctx]);
  const [pick, setPick] = useState('');
  if (user.role !== 'admin') return null;
  return (
    <Card className="p-4 space-y-2">
      <SectionTitle>Today's on-call technician (emergency response)</SectionTitle>
      {error && <ErrorNote message={error} />}
      <p className="text-xs text-warmgray">If none is set, emergencies go to the Admin.</p>
      <div className="flex gap-2">
        <select className={inputCls} value={pick} onChange={e => setPick(e.target.value)}>
          <option value="">{current.data ? (techs.data ?? []).find(t => t.id === current.data)?.name ?? current.data : 'Not set'}</option>
          {(techs.data ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <Button variant="secondary" disabled={busy || !pick} onClick={() => run(() => setOnCallTechnician(ctx, actor, today, pick)).then(ok => ok && (setPick(''), current.reload()))}>Set for today</Button>
      </div>
    </Card>
  );
};
