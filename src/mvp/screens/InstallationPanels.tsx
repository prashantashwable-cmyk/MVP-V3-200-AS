/**
 * Technician app (spec §18, §22): "Today" list and the job runner inside the Order View
 * (START → CHECK IN → 11-item checklist with photos → COMPLETE, plus BLOCKED), and the
 * Admin's installation panel (assign technician / QC inspector, override the start gate).
 * Why not reuse TechnicianMobileApp/InstallationProgressTracker: legacy DbManager records
 * and gamified earnings (out of scope); these reuse PhotoInput, AdminActions' blocker
 * reasons and installationService on canonical data.
 */

import React, { useState } from 'react';
import { MapPin, Phone, Wrench } from 'lucide-react';
import type { User } from '../../types';
import type { BlockerReason, Task } from '../../domain/entities';
import { Button, Card } from '../../components/Common';
import { getMvpTaskQueue } from '../../services/workQueue';
import { projectRepository } from '../../repository/entities';
import { BLOCKER_REASONS, raiseBlocker } from '../services/orderService';
import {
  assignQcInspector, assignTechnician, checkInAtSite, checklistDoneCount, CHECKLIST_ITEMS, completeWork, getJob, setChecklistItem, startWork,
} from '../services/installationService';
import { checkGate, overrideGate } from '../gates';
import { listPeople } from '../services/people';
import { CHECKLIST_ITEM_COUNT, TIME_ZONE } from '../config';
import { formatDateTime } from '../format';
import type { OrderViewExtraProps } from './MvpOrderView';
import { PhotoInput, type SavedPhoto } from './PhotoInput';
import { ErrorNote, inputCls, labelCls, Loading, SectionTitle, useAction, useLoad, useMvpCtx } from './ui';

const WORK_TYPES: Task['type'][] = ['INSTALLATION', 'REWORK'];

export const TechToday: React.FC<{ user: User; onOpenOrder: (orderId: string) => void }> = ({ user, onOpenOrder }) => {
  const { ctx, actor } = useMvpCtx(user);
  const { data, error, loading } = useLoad(async () => {
    const tasks = (await getMvpTaskQueue(ctx, actor)).filter(t => WORK_TYPES.includes(t.type) && t.orderId);
    const orders = await Promise.all(tasks.map(t => projectRepository(ctx).get(t.orderId!)));
    return tasks.map((t, i) => ({ task: t, order: orders[i] }));
  }, [ctx]);
  if (loading && !data) return <Loading label="Loading your jobs…" />;
  if (error) return <ErrorNote message={error} />;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
  const isToday = (t: Task) => new Date(t.dueDate).toLocaleDateString('en-CA', { timeZone: TIME_ZONE }) <= today;
  const rows = data ?? [];
  const section = (title: string, list: typeof rows) => list.length > 0 && (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-warmgray">{title}</h3>
      {list.map(({ task, order }) => (
        <Card key={task.id} className="p-4 space-y-1">
          <button onClick={() => onOpenOrder(task.orderId!)} className="w-full text-left cursor-pointer">
            <div className="flex justify-between gap-2">
              <span className="font-bold text-sm">#{order?.displayCode} · {order?.displaySummary?.customerName}</span>
              <span className={`text-[11px] font-bold ${task.status === 'BLOCKED' ? 'text-error' : 'text-warmgray'}`}>{task.status.replace('_', ' ')}</span>
            </div>
            <div className="text-xs flex items-center gap-1"><Wrench className="w-3.5 h-3.5" />{task.title} · due {formatDateTime(task.dueDate)}</div>
            <div className="text-xs text-warmgray flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{order?.displaySummary?.siteAddress || '—'}</div>
          </button>
          {order?.displaySummary?.customerPhone && (
            <a href={`tel:${order.displaySummary.customerPhone}`} className="text-xs text-royalemerald font-semibold inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" />Call customer</a>
          )}
        </Card>
      ))}
    </div>
  );
  return (
    <div className="space-y-4 max-w-xl mx-auto pb-24">
      <h2 className="text-lg font-bold text-charcoal">Today</h2>
      {rows.length === 0 && <Card className="p-6 text-sm text-warmgray">No installation or rework jobs assigned to you.</Card>}
      {section('Today', rows.filter(r => isToday(r.task)))}
      {section('Upcoming', rows.filter(r => !isToday(r.task)))}
      {/* Earnings: no partner rate is stored in the MVP, so nothing is shown rather than a made-up figure. */}
      <p className="text-[11px] text-warmgray">Earnings: —</p>
    </div>
  );
};

function currentPosition(): Promise<{ lat: number; lng: number; accuracyM?: number } | undefined> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(undefined);
  return new Promise(resolve => navigator.geolocation.getCurrentPosition(
    p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy) }),
    () => resolve(undefined), // GPS is optional (spec §18): refusing it never blocks check-in
    { timeout: 8000, maximumAge: 60000 },
  ));
}

const BlockedDialog: React.FC<{ user: User; orderId: string; taskId: string; onDone: () => void; onCancel: () => void }> = ({ user, orderId, taskId, onDone, onCancel }) => {
  const { ctx, actor } = useMvpCtx(user);
  const { run, busy, error } = useAction();
  const [reason, setReason] = useState<BlockerReason | ''>('');
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<SavedPhoto[]>([]);
  return (
    <div className="p-3 rounded-xl bg-error/5 border border-error/20 space-y-2">
      <div className="text-sm font-semibold">What is blocking the work?</div>
      {error && <ErrorNote message={error} />}
      <select className={inputCls} value={reason} onChange={e => setReason(e.target.value as BlockerReason)}>
        <option value="">Choose a reason…</option>
        {BLOCKER_REASONS.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ').toLowerCase()}</option>)}
      </select>
      <textarea className={inputCls} rows={2} value={text} onChange={e => setText(e.target.value)} placeholder="Describe the problem" />
      <PhotoInput ctx={ctx} actor={actor} target={{ orderId, taskId }} caption="Blocker" photos={photos} onChange={setPhotos} label="Photo (optional)" />
      <div className="flex gap-2">
        <Button variant="primary" disabled={busy || !reason || !text.trim()} onClick={() => run(() => raiseBlocker(ctx, actor, {
          orderId, taskId, reason: reason as BlockerReason, description: text, evidence: photos.map(p => p.id),
        })).then(ok => ok && onDone())}>Report blocker</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
};

/** The job runner for the assigned technician (or the Admin acting for them). */
export const InstallationPanel: React.FC<{ user: User } & OrderViewExtraProps> = ({ user, view, reload }) => {
  const { ctx, actor } = useMvpCtx(user);
  const { run, busy, error } = useAction();
  const task = view.openTasks.find(t => WORK_TYPES.includes(t.type) && (t.assigneeId === user.id || user.role === 'admin'));
  const job = useLoad(() => (task ? getJob(ctx, view.order.id) : Promise.resolve(null)), [task?.id, task?.status]);
  const gate = useLoad(() => (task?.type === 'INSTALLATION' && task.status === 'TODO' ? checkGate(ctx, view.order.id, 'INSTALLATION_START') : Promise.resolve(null)), [task?.id, task?.status]);
  const [photos, setPhotos] = useState<Record<string, SavedPhoto[]>>({});
  const [note, setNote] = useState('');
  const [blocked, setBlocked] = useState(false);
  if (!task || user.role === 'owner') return null;
  const refresh = () => { job.reload(); gate.reload(); reload(); };
  const act = (fn: () => Promise<unknown>) => run(fn).then(ok => ok && refresh());
  const j = job.data;
  const done = checklistDoneCount(j);
  const started = task.status === 'IN_PROGRESS';
  const isRework = task.type === 'REWORK';

  return (
    <Card className="p-4 space-y-3">
      <SectionTitle right={!isRework && <span className="text-xs font-bold">{done}/{CHECKLIST_ITEM_COUNT}</span>}>{isRework ? 'Rework' : 'Installation'} · {task.status.replace('_', ' ')}</SectionTitle>
      {error && <ErrorNote message={error} />}
      {isRework && task.notes && <div className="p-2 rounded-lg bg-[#B8873D]/10 text-xs"><strong>QC remarks:</strong> {task.notes}</div>}
      {task.status === 'BLOCKED' && <div className="p-2 rounded-lg bg-error/10 text-xs text-error">Blocked. The Admin or the blocker owner must resolve it before work continues.</div>}
      {gate.data && !gate.data.allowed && <div className="p-2 rounded-lg bg-error/10 text-xs text-error">{gate.data.reason}. The Admin can override this.</div>}

      <div className="flex flex-wrap gap-2">
        {task.status === 'TODO' && (
          <Button variant="primary" disabled={busy || (gate.data ? !gate.data.allowed : false)} onClick={() => act(() => startWork(ctx, actor, task.id))}>START</Button>
        )}
        {started && !isRework && !j?.checkedInAt && (
          <Button variant="primary" disabled={busy} onClick={() => act(async () => checkInAtSite(ctx, actor, task.id, await currentPosition()))}>CHECK IN at site</Button>
        )}
        {j?.checkedInAt && !isRework && <span className="text-xs text-warmgray self-center">Checked in {formatDateTime(j.checkedInAt)}</span>}
        {task.status !== 'BLOCKED' && !blocked && <Button variant="outline" onClick={() => setBlocked(true)}>BLOCKED</Button>}
      </div>
      {blocked && <BlockedDialog user={user} orderId={view.order.id} taskId={task.id} onCancel={() => setBlocked(false)} onDone={() => { setBlocked(false); refresh(); }} />}

      {!isRework && started && j?.checkedInAt && (
        <ol className="space-y-2">
          {CHECKLIST_ITEMS.map((item, i) => {
            const state = j.checklist?.[item.key];
            const optional = 'photoOptional' in item;
            return (
              <li key={item.key} className={`p-3 rounded-xl ${state?.done ? 'bg-royalemerald/5' : 'bg-alabaster'} space-y-2`}>
                <div className="flex justify-between gap-2 text-sm">
                  <span className="font-semibold">{i + 1}. {item.label}{optional ? ' (photo optional)' : ''}</span>
                  {state?.done && <span className="text-xs text-royalemerald font-bold">Done</span>}
                </div>
                {!state?.done && (
                  <>
                    <PhotoInput ctx={ctx} actor={actor} target={{ orderId: view.order.id, taskId: task.id }} caption={item.label}
                      photos={photos[item.key] ?? []} onChange={p => setPhotos({ ...photos, [item.key]: p })} />
                    <Button variant="emerald" disabled={busy || (!optional && !(photos[item.key]?.length))}
                      onClick={() => act(() => setChecklistItem(ctx, actor, task.id, item.key, { done: true, documentId: photos[item.key]?.[0]?.id }))}>Mark done</Button>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {isRework && started && (
        <div className="space-y-2">
          <label className={labelCls}>Photo of the fixed work</label>
          <PhotoInput ctx={ctx} actor={actor} target={{ orderId: view.order.id, taskId: task.id }} caption="Rework done" photos={photos.rework ?? []} onChange={p => setPhotos({ ...photos, rework: p })} />
        </div>
      )}
      {started && (isRework || done === CHECKLIST_ITEM_COUNT) && (
        <div className="space-y-2">
          <textarea className={inputCls} rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Note for QC (optional)" />
          <Button variant="emerald" fullWidth disabled={busy || (isRework && !photos.rework?.length)}
            onClick={() => act(() => completeWork(ctx, actor, task.id, { note, documentId: photos.rework?.[0]?.id }))}>COMPLETE — send to QC</Button>
        </div>
      )}
    </Card>
  );
};

/** Admin: technician and QC inspector for the order, and the D-14 start-gate override. */
export const AdminInstallationPanel: React.FC<{ user: User } & OrderViewExtraProps> = ({ user, view, reload }) => {
  const { ctx, actor } = useMvpCtx(user);
  const { run, busy, error } = useAction();
  const show = user.role === 'admin' && ['DELIVERY', 'INSTALLATION', 'QC_HANDOVER'].includes(view.stage);
  const people = useLoad(() => (show ? listPeople(ctx) : Promise.resolve([])), [show]);
  const install = view.openTasks.find(t => t.type === 'INSTALLATION');
  const gate = useLoad(() => (show && install?.status === 'TODO' ? checkGate(ctx, view.order.id, 'INSTALLATION_START') : Promise.resolve(null)), [show, install?.id, install?.status, view.payments?.paid]);
  const [tech, setTech] = useState('');
  const [qc, setQc] = useState(view.order.qcUserId ?? '');
  const [reason, setReason] = useState('');
  if (!show) return null;
  const act = (fn: () => Promise<unknown>) => run(fn).then(ok => ok && (gate.reload(), reload()));
  const techs = (people.data ?? []).filter(p => p.role === 'technician');
  const qcs = (people.data ?? []).filter(p => p.role === 'qc' || (p.role as string) === 'qc_inspector');
  return (
    <Card className="p-4 space-y-3">
      <SectionTitle>Installation team</SectionTitle>
      {error && <ErrorNote message={error} />}
      {install && (
        <div className="flex gap-2">
          <select className={inputCls} value={tech} onChange={e => setTech(e.target.value)}>
            <option value="">Technician…</option>{techs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <Button variant="secondary" disabled={busy || !tech} onClick={() => act(() => assignTechnician(ctx, actor, view.order.id, tech))}>Assign</Button>
        </div>
      )}
      <div className="flex gap-2">
        <select className={inputCls} value={qc} onChange={e => setQc(e.target.value)}>
          <option value="">QC inspector…</option>{qcs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <Button variant="secondary" disabled={busy || !qc || qc === view.order.qcUserId} onClick={() => act(() => assignQcInspector(ctx, actor, view.order.id, qc))}>Set QC</Button>
      </div>
      {gate.data && !gate.data.allowed && (
        <div className="p-2 rounded-lg bg-error/10 text-xs text-error">{gate.data.reason}. Override with a reason to let the technician start:
          <div className="flex gap-2 mt-1"><input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} placeholder="Override reason" />
            <Button variant="ghost" disabled={busy || !reason.trim()} onClick={() => act(() => overrideGate(ctx, actor, view.order.id, 'INSTALLATION_START', reason))}>Override</Button></div>
        </div>
      )}
    </Card>
  );
};
