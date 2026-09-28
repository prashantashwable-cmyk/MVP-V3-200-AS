/**
 * D-34 "Sightings": Sales' inbox of every site the riders recorded, on a map or as a list,
 * new first. Tap one → photos (read the builder's number off the board photo), call, get
 * directions, then either convert it into a lead (with the person's consent, `createLead`)
 * or close it as not useful with a reason. The rider's own sightings are confirmed by someone
 * else (commission is earned on confirmed sightings).
 * Why not reuse LeadsList: sightings are not leads yet and need the map and the photos first.
 */

import React, { Suspense, lazy, useState } from 'react';
import { List, Map as MapIcon } from 'lucide-react';
import type { User } from '../../types';
import { Button } from '../../components/Common';
import { convertSightingToLead, listSightings, rejectSighting } from '../services/scoutService';
import { SCOUT_REJECT_REASONS, type ScoutRejectReason, type SiteScout } from '../scouting';
import { ErrorNote, inputCls, labelCls, Loading, useAction, useLoad, useMvpCtx, useT } from './ui';
import { STATUS_COLOR, SightingCard, SightingRow } from './RiderScout';

const SiteMap = lazy(() => import('./SiteMap'));

const Review: React.FC<{ s: SiteScout; user: User; onDone: (leadId?: string) => void }> = ({ s, user, onDone }) => {
  const { ctx, actor } = useMvpCtx(user);
  const t = useT();
  const { run, busy, error } = useAction();
  const [mode, setMode] = useState<'lead' | 'reject'>('lead');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(s.phone ?? '');
  const [floors, setFloors] = useState(s.floors ? String(s.floors) : '');
  const [consent, setConsent] = useState(false);
  const [reason, setReason] = useState<ScoutRejectReason>('NO_LIFT_NEEDED');
  const [note, setNote] = useState('');

  if (s.status !== 'NEW') return null;
  if (actor.role === 'sales' && s.scoutedBy === actor.userId) {
    return <p className="text-xs text-warmgray">{t('You recorded this site. Another salesperson or the Admin will call and confirm it.')}</p>;
  }
  if (actor.role === 'owner') return null;

  const convert = () => run(async () => {
    const lead = await convertSightingToLead(ctx, actor, s.id, { name, phone, consent, floors: floors ? Number(floors) : undefined });
    onDone(lead.id);
  });
  const reject = () => run(async () => { await rejectSighting(ctx, actor, s.id, reason, note); onDone(); });

  return (
    <div className="p-3 rounded-xl bg-alabaster space-y-2">
      <div className="flex gap-2">
        <button onClick={() => setMode('lead')} className={`min-h-[40px] px-3 rounded-lg text-xs font-bold cursor-pointer ${mode === 'lead' ? 'bg-charcoal text-white' : 'bg-white border border-[#f0ebe2]'}`}>{t('Make it a lead')}</button>
        <button onClick={() => setMode('reject')} className={`min-h-[40px] px-3 rounded-lg text-xs font-bold cursor-pointer ${mode === 'reject' ? 'bg-charcoal text-white' : 'bg-white border border-[#f0ebe2]'}`}>{t('Not useful')}</button>
      </div>
      {error && <ErrorNote message={error} />}
      {mode === 'lead' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div><label className={labelCls}>Contact name</label><input className={inputCls} value={name} onChange={e => setName(e.target.value)} /></div>
            <div><label className={labelCls}>Mobile</label><input className={inputCls} inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} /></div>
            <div><label className={labelCls}>Floors</label><input className={inputCls} inputMode="numeric" value={floors} onChange={e => setFloors(e.target.value)} /></div>
          </div>
          <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5 w-5 h-5" checked={consent} onChange={e => setConsent(e.target.checked)} />
            I spoke to this person and they agreed to be contacted about a lift. ⚖ VERIFY consent wording</label>
          <Button variant="primary" disabled={busy || !name.trim() || !phone.trim() || !consent} onClick={convert}>Create lead</Button>
        </>
      ) : (
        <>
          <select className={inputCls} value={reason} onChange={e => setReason(e.target.value as ScoutRejectReason)}>
            {SCOUT_REJECT_REASONS.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ').toLowerCase()}</option>)}
          </select>
          <input className={inputCls} placeholder="Note (required for 'other')" value={note} onChange={e => setNote(e.target.value)} />
          <Button variant="primary" disabled={busy} onClick={reject}>Close sighting</Button>
        </>
      )}
    </div>
  );
};

export const SightingsInbox: React.FC<{ user: User; onOpenLead: (id: string) => void }> = ({ user, onOpenLead }) => {
  const { ctx, actor } = useMvpCtx(user);
  const t = useT();
  const { data, error, loading, reload } = useLoad(() => listSightings(ctx, actor), [ctx], { every: 1 });
  const [view, setView] = useState<'list' | 'map'>('list');
  const [filter, setFilter] = useState<'NEW' | 'ALL'>('NEW');
  const [picked, setPicked] = useState<SiteScout | null>(null);

  if (loading && !data) return <Loading label="Loading sightings…" />;
  if (error) return <ErrorNote message={`Could not load sightings: ${error}`} />;
  const all = data ?? [];
  const shown = filter === 'NEW' ? all.filter(s => s.status === 'NEW') : all;
  const fresh = all.filter(s => s.status === 'NEW').length;

  return (
    <div className="space-y-3 max-w-3xl mx-auto pb-24">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-charcoal">{t('Site sightings')} <span className="text-sm text-[#B8873D]">({fresh} {t('new')})</span></h2>
        <div className="flex gap-1">
          <button onClick={() => setView('list')} className={`min-h-[40px] px-3 rounded-lg text-xs font-bold cursor-pointer ${view === 'list' ? 'bg-charcoal text-white' : 'bg-white border border-[#f0ebe2]'}`}><List className="w-4 h-4 inline" /> {t('List')}</button>
          <button onClick={() => setView('map')} className={`min-h-[40px] px-3 rounded-lg text-xs font-bold cursor-pointer ${view === 'map' ? 'bg-charcoal text-white' : 'bg-white border border-[#f0ebe2]'}`}><MapIcon className="w-4 h-4 inline" /> {t('Map')}</button>
        </div>
      </div>
      <div className="flex gap-2 text-xs">
        {(['NEW', 'ALL'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`min-h-[36px] px-3 rounded-full font-bold cursor-pointer ${filter === f ? 'bg-[#B8873D] text-white' : 'bg-white border border-[#f0ebe2]'}`}>{f === 'NEW' ? t('To call') : t('All')}</button>
        ))}
      </div>
      {picked && (
        <SightingCard s={picked} onClose={() => setPicked(null)}>
          <Review s={picked} user={user} onDone={leadId => { setPicked(null); reload(); if (leadId) onOpenLead(leadId); }} />
        </SightingCard>
      )}
      {view === 'map' ? (
        <Suspense fallback={<Loading label="Loading map…" />}>
          <SiteMap heightClass="h-[28rem]" points={shown.map(s => ({ id: s.id, lat: s.lat, lng: s.lng, color: STATUS_COLOR[s.status], label: `${s.address} · ${s.scoutedByName}` }))}
            onPick={id => setPicked(all.find(s => s.id === id) ?? null)} />
        </Suspense>
      ) : (
        <div className="space-y-2">
          {shown.length === 0 && <p className="text-xs text-warmgray">{filter === 'NEW' ? t('No new sightings to call.') : t('No sightings yet.')}</p>}
          {shown.map(s => <SightingRow key={s.id} s={s} onOpen={() => setPicked(s)} />)}
        </div>
      )}
    </div>
  );
};
