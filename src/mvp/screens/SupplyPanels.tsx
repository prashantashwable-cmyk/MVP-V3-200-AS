/**
 * Site readiness (customer + Admin) and supplier PO / delivery (Admin) inside the Order View,
 * plus a Suppliers screen. Why not reuse SiteDeliveryChecklist/PurchaseOrderGenerator/
 * SupplierOrderStatusTracking/SupplierDirectory/MaterialReceivedConfirmation: legacy record
 * shapes read through DbManager (4,200 lines); these panels use supplyService on canonical data.
 */

import React, { useState } from 'react';
import type { User } from '../../types';
import type { PurchaseOrder } from '../../domain/entities';
import { Button, Card } from '../../components/Common';
import {
  confirmSiteReady, createSupplier, listOrderPos, listSuppliers, markMaterialReceived, raisePo, READINESS_ITEMS, returnReadiness,
  submitReadiness, updatePo, type ReadinessKey,
} from '../services/supplyService';
import { checkGate, overrideGate } from '../gates';
import { getEvidence } from '../services/evidenceService';
import { listPeople } from '../services/people';
import { purchaseOrderRepository } from '../../repository/entities';
import { formatDate, formatInr } from '../format';
import type { OrderViewExtraProps } from './MvpOrderView';
import { PhotoInput, type SavedPhoto } from './PhotoInput';
import { ErrorNote, inputCls, labelCls, SectionTitle, useAction, useLoad, useMvpCtx } from './ui';

export const ReadinessPanel: React.FC<{ user: User } & OrderViewExtraProps> = ({ user, view, reload }) => {
  const { ctx, actor } = useMvpCtx(user);
  const { run, busy, error } = useAction();
  const [photos, setPhotos] = useState<Record<string, SavedPhoto[]>>({});
  const [powerDate, setPowerDate] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const ask = view.openTasks.find(t => t.type === 'SITE_READINESS');
  const verify = view.openTasks.find(t => t.type === 'VERIFY_SITE_READY');
  const submitted = view.closedTasks.find(t => t.type === 'SITE_READINESS' && t.status === 'COMPLETED');
  const evidence = useLoad(() => (verify && submitted?.evidenceIds?.length ? getEvidence(ctx, submitted.evidenceIds) : Promise.resolve([])), [verify?.id, submitted?.id]);
  const gate = useLoad(() => (verify ? checkGate(ctx, view.order.id, 'SITE_READY_ENTRY') : Promise.resolve(null)), [verify?.id, view.payments?.paid]);
  const act = (fn: () => Promise<unknown>) => run(fn).then(ok => ok && reload());

  if (ask && user.role === 'customer') {
    return (
      <Card className="p-4 space-y-3">
        <SectionTitle>Get the site ready</SectionTitle>
        <p className="text-sm">Please complete by <strong>{formatDate(ask.dueDate)}</strong>. Add a photo for each item.</p>
        {error && <ErrorNote message={error} />}
        {READINESS_ITEMS.map(i => (
          <div key={i.key} className="p-3 rounded-xl bg-alabaster space-y-1">
            <div className="text-sm font-semibold">{i.label}</div>
            <PhotoInput ctx={ctx} actor={actor} target={{ orderId: view.order.id, taskId: ask.id }} caption={i.label}
              photos={photos[i.key] ?? []} onChange={p => setPhotos({ ...photos, [i.key]: p })} />
            {i.key === 'powerAvailable' && (
              <div><label className={labelCls}>…or the date power will be available</label>
                <input type="date" className={inputCls} value={powerDate} onChange={e => setPowerDate(e.target.value)} /></div>
            )}
          </div>
        ))}
        <textarea className={inputCls} rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Anything we should know (optional)" />
        <Button variant="primary" fullWidth disabled={busy} onClick={() => act(() => submitReadiness(ctx, actor, view.order.id, {
          items: Object.fromEntries(READINESS_ITEMS.map(i => [i.key, { ok: !!photos[i.key]?.length, photoId: photos[i.key]?.[0]?.id }])) as Record<ReadinessKey, { ok: boolean; photoId?: string }>,
          powerDate: powerDate || undefined, note,
        }))}>The site is ready — send to the Admin</Button>
      </Card>
    );
  }
  if (verify && user.role === 'admin') {
    const data = (submitted?.data ?? {}) as { powerDate?: string; note?: string };
    return (
      <Card className="p-4 space-y-3">
        <SectionTitle>Verify site readiness</SectionTitle>
        {error && <ErrorNote message={error} />}
        <div className="flex flex-wrap gap-2">{(evidence.data ?? []).map(d => d.dataUrl && <figure key={d.id} className="w-20"><img src={d.dataUrl} alt={d.caption} className="w-20 h-20 object-cover rounded-lg" /><figcaption className="text-[10px] text-warmgray truncate">{d.caption}</figcaption></figure>)}</div>
        {data.powerDate && <div className="text-xs">Power available from {formatDate(data.powerDate)}</div>}
        {data.note && <div className="text-xs">Customer note: {data.note}</div>}
        {gate.data && !gate.data.allowed && (
          <div className="p-2 rounded-lg bg-error/10 text-xs text-error">{gate.data.reason}. Override with a reason to continue:
            <div className="flex gap-2 mt-1"><input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} placeholder="Override reason" />
              <Button variant="ghost" disabled={busy || !reason.trim()} onClick={() => act(() => overrideGate(ctx, actor, view.order.id, 'SITE_READY_ENTRY', reason))}>Override</Button></div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="emerald" disabled={busy || (gate.data ? !gate.data.allowed : false)} onClick={() => act(() => confirmSiteReady(ctx, actor, view.order.id))}>Confirm site ready</Button>
          <input className={`${inputCls} flex-1`} value={reason} onChange={e => setReason(e.target.value)} placeholder="What is still missing?" />
          <Button variant="ghost" disabled={busy || !reason.trim()} onClick={() => act(() => returnReadiness(ctx, actor, view.order.id, reason))}>Return to customer</Button>
        </div>
      </Card>
    );
  }
  return null;
};

const PoRow: React.FC<{ po: PurchaseOrder; user: User; onDone: () => void }> = ({ po, user, onDone }) => {
  const { ctx, actor } = useMvpCtx(user);
  const { run, busy, error } = useAction();
  const [status, setStatus] = useState(po.materialStatus ?? 'ORDERED');
  const [reason, setReason] = useState(po.delayReason ?? '');
  const [date, setDate] = useState('');
  return (
    <li className="py-2 space-y-1 text-sm">
      <div className="flex justify-between gap-2"><span className="font-semibold">{po.items}</span><span>{formatInr(po.amount)}</span></div>
      <div className="text-xs text-warmgray">Expected {formatDate(po.expectedDeliveryDate)} · {po.materialStatus}{po.delayReason ? ` — ${po.delayReason}` : ''}</div>
      {error && <ErrorNote message={error} />}
      {po.materialStatus !== 'DELIVERED' && (
        <div className="flex flex-wrap gap-2">
          <select className={`${inputCls} max-w-[150px]`} value={status} onChange={e => setStatus(e.target.value as any)}>
            {['ORDERED', 'DISPATCHED', 'DELAYED'].map(s => <option key={s}>{s}</option>)}
          </select>
          <input type="date" className={`${inputCls} max-w-[170px]`} value={date} onChange={e => setDate(e.target.value)} />
          <input className={`${inputCls} flex-1`} value={reason} onChange={e => setReason(e.target.value)} placeholder="Delay reason" />
          <Button variant="secondary" disabled={busy} onClick={() => run(() => updatePo(ctx, actor, po.id, {
            materialStatus: status, delayReason: reason, expectedDeliveryDate: date ? new Date(`${date}T12:00:00+05:30`).toISOString() : undefined,
          })).then(ok => ok && onDone())}>Update</Button>
        </div>
      )}
    </li>
  );
};

export const SupplyPanel: React.FC<{ user: User } & OrderViewExtraProps> = ({ user, view, reload }) => {
  const { ctx, actor } = useMvpCtx(user);
  const { run, busy, error } = useAction();
  const show = user.role === 'admin' && ['SITE_READY', 'DELIVERY', 'INSTALLATION'].includes(view.stage);
  const pos = useLoad(() => (show ? listOrderPos(ctx, view.order.id) : Promise.resolve([])), [show, view.order.id, view.stage]);
  const sups = useLoad(() => (show ? listSuppliers(ctx) : Promise.resolve([])), [show]);
  const techs = useLoad(() => (show ? listPeople(ctx, 'technician') : Promise.resolve([])), [show]);
  const [f, setF] = useState({ supplierId: '', newSupplier: '', items: '', amount: '', date: '' });
  const [recv, setRecv] = useState({ note: '', technicianId: '', condition: 'ok' });
  const [photos, setPhotos] = useState<SavedPhoto[]>([]);
  if (!show) return null;
  const done = () => { pos.reload(); sups.reload(); reload(); };
  const tracking = view.openTasks.some(t => t.type === 'TRACK_DELIVERY');
  return (
    <Card className="p-4 space-y-3">
      <SectionTitle>Supplier & delivery (internal)</SectionTitle>
      {error && <ErrorNote message={error} />}
      <ul className="divide-y divide-[#f0ebe2]">{(pos.data ?? []).map(p => <PoRow key={p.id} po={p} user={user} onDone={done} />)}</ul>
      {view.stage !== 'INSTALLATION' && (
        <details open={(pos.data ?? []).length === 0} className="text-sm"><summary className="cursor-pointer font-semibold">Raise a purchase order</summary>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            <div><label className={labelCls}>Supplier</label>
              <select className={inputCls} value={f.supplierId} onChange={e => setF({ ...f, supplierId: e.target.value })}>
                <option value="">Choose…</option>{(sups.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}<option value="__new">+ New supplier</option>
              </select></div>
            {f.supplierId === '__new' && <div><label className={labelCls}>New supplier name</label><input className={inputCls} value={f.newSupplier} onChange={e => setF({ ...f, newSupplier: e.target.value })} /></div>}
            <div><label className={labelCls}>Items</label><input className={inputCls} value={f.items} onChange={e => setF({ ...f, items: e.target.value })} /></div>
            <div><label className={labelCls}>Amount ₹ (internal)</label><input className={inputCls} inputMode="numeric" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></div>
            <div><label className={labelCls}>Expected delivery</label><input type="date" className={inputCls} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></div>
          </div>
          <Button className="mt-2" variant="primary" disabled={busy} onClick={() => run(async () => {
            const supplierId = f.supplierId === '__new' ? (await createSupplier(ctx, actor, { name: f.newSupplier })).id : f.supplierId;
            await raisePo(ctx, actor, view.order.id, { supplierId, items: f.items, amount: Number(f.amount), expectedDeliveryDate: f.date ? new Date(`${f.date}T12:00:00+05:30`).toISOString() : '' });
          }).then(ok => ok && done())}>Raise PO</Button>
        </details>
      )}
      {tracking && (
        <div className="p-3 rounded-xl bg-alabaster space-y-2">
          <div className="text-sm font-semibold">Material received at site</div>
          <PhotoInput ctx={ctx} actor={actor} target={{ orderId: view.order.id }} caption="Material at site" photos={photos} onChange={setPhotos} />
          <input className={inputCls} value={recv.note} onChange={e => setRecv({ ...recv, note: e.target.value })} placeholder='Count note, e.g. "all 14 boxes received"' />
          <div className="grid grid-cols-2 gap-2">
            <select className={inputCls} value={recv.condition} onChange={e => setRecv({ ...recv, condition: e.target.value })}>
              <option value="ok">All OK</option><option value="damaged">Some damaged</option><option value="missing_items">Items missing</option>
            </select>
            <select className={inputCls} value={recv.technicianId} onChange={e => setRecv({ ...recv, technicianId: e.target.value })}>
              <option value="">Technician (choose later)</option>{(techs.data ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <Button variant="emerald" disabled={busy} onClick={() => run(() => markMaterialReceived(ctx, actor, view.order.id, {
            note: recv.note, photoIds: photos.map(p => p.id), condition: recv.condition as any, technicianId: recv.technicianId || undefined,
          })).then(ok => ok && done())}>Mark material received</Button>
        </div>
      )}
    </Card>
  );
};

export const SuppliersScreen: React.FC<{ user: User }> = ({ user }) => {
  const { ctx, actor } = useMvpCtx(user);
  const { run, busy, error } = useAction();
  const sups = useLoad(() => listSuppliers(ctx), [ctx]);
  const pos = useLoad(async () => (await purchaseOrderRepository(ctx).list()).filter(p => p.materialStatus && p.materialStatus !== 'DELIVERED'), [ctx]);
  const [s, setS] = useState({ name: '', contactName: '', phone: '' });
  return (
    <div className="space-y-3 max-w-3xl mx-auto pb-24">
      <h2 className="text-lg font-bold">Suppliers</h2>
      {error && <ErrorNote message={error} />}
      <Card className="p-4 space-y-2">
        <SectionTitle>Open purchase orders</SectionTitle>
        {(pos.data ?? []).length === 0 && <p className="text-xs text-warmgray">No open POs.</p>}
        {(pos.data ?? []).map(p => (
          <div key={p.id} className={`text-sm flex justify-between gap-2 ${p.materialStatus === 'DELAYED' ? 'text-error' : ''}`}>
            <span>{p.items} · {(sups.data ?? []).find(x => x.id === p.supplierId)?.name ?? p.supplierId}</span>
            <span className="text-xs">{p.materialStatus} · {formatDate(p.expectedDeliveryDate)}</span>
          </div>
        ))}
      </Card>
      <Card className="p-4 space-y-2">
        <SectionTitle>Directory</SectionTitle>
        {(sups.data ?? []).map(x => <div key={x.id} className="text-sm">{x.name}{x.contactName ? ` · ${x.contactName}` : ''}{x.phone ? ` · ${x.phone}` : ''}</div>)}
        {user.role === 'admin' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
            <input className={inputCls} placeholder="Name" value={s.name} onChange={e => setS({ ...s, name: e.target.value })} />
            <input className={inputCls} placeholder="Contact" value={s.contactName} onChange={e => setS({ ...s, contactName: e.target.value })} />
            <input className={inputCls} placeholder="Phone" value={s.phone} onChange={e => setS({ ...s, phone: e.target.value })} />
            <Button variant="primary" disabled={busy} onClick={() => run(() => createSupplier(ctx, actor, s)).then(ok => { if (ok) { setS({ name: '', contactName: '', phone: '' }); sups.reload(); } })}>Add supplier</Button>
          </div>
        )}
      </Card>
    </div>
  );
};
