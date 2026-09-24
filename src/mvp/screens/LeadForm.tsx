/**
 * New Lead (spec §13/§23) — fast, phone-first. Why not reuse LeadInbox: it is 1,646 lines of
 * legacy local state with scoring/AI; this form keeps its field set and uses the canonical
 * lead store through orderService.createLead (validation + QUALIFY_LEAD task + audit).
 */

import React, { useState } from 'react';
import { MapPin, AlertTriangle } from 'lucide-react';
import type { User } from '../../types';
import { Button, Card } from '../../components/Common';
import { createLead, normalizeIndianMobile } from '../services/orderService';
import { findDuplicateLeads } from '../services/leadService';
import type { MvpLead } from '../leadModel';
import { PhotoInput, type SavedPhoto } from './PhotoInput';
import { ErrorNote, inputCls, labelCls, useAction, useMvpCtx } from './ui';

const SITE_TYPES = ['residential', 'commercial', 'industrial', 'institutional', 'mixed-use'] as const;
const STAGES: { v: 'foundation' | 'structure-up' | 'finishing' | 'ready'; label: string }[] = [
  { v: 'foundation', label: 'Foundation' }, { v: 'structure-up', label: 'Structure complete' },
  { v: 'finishing', label: 'Finishing' }, { v: 'ready', label: 'Ready' },
];

export const LeadForm: React.FC<{ user: User; onSaved: (leadId: string) => void; onOpenLead: (leadId: string) => void }> = ({ user, onSaved, onOpenLead }) => {
  const { ctx, actor } = useMvpCtx(user);
  const { run, busy, error } = useAction();
  const [f, setF] = useState({
    name: '', phone: '', location: '', source: 'Walk-in', siteType: 'residential' as typeof SITE_TYPES[number],
    floors: '', liftRequirement: '', constructionStage: 'structure-up' as typeof STAGES[number]['v'], notes: '', nextFollowUp: '', consent: false,
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [photos, setPhotos] = useState<SavedPhoto[]>([]);
  const [dupes, setDupes] = useState<MvpLead[]>([]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });

  const checkDupes = async () => {
    if (!normalizeIndianMobile(f.phone)) { setDupes([]); return; }
    try { setDupes(await findDuplicateLeads(ctx, actor, f.phone)); } catch { setDupes([]); }
  };

  const useGps = () => {
    navigator.geolocation?.getCurrentPosition(
      pos => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCoords(null),
      { timeout: 8000 },
    );
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const lead = await createLead(ctx, actor, {
        name: f.name, phone: f.phone, location: f.location, source: f.source, siteType: f.siteType,
        floors: f.floors ? Number(f.floors) : undefined, liftRequirement: f.liftRequirement,
        constructionStage: f.constructionStage, notes: f.notes, consent: f.consent,
        nextFollowUp: f.nextFollowUp ? new Date(f.nextFollowUp).toISOString() : undefined,
        latitude: coords?.lat, longitude: coords?.lng, photoIds: photos.map(p => p.id),
      });
      onSaved(lead.id);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3 max-w-xl mx-auto pb-24">
      <h2 className="text-lg font-bold text-charcoal">New lead</h2>
      {error && <ErrorNote message={error} />}
      <Card className="p-4 space-y-3">
        <div><label className={labelCls}>Customer name *</label><input className={inputCls} value={f.name} onChange={set('name')} required /></div>
        <div>
          <label className={labelCls}>Mobile number *</label>
          <input className={inputCls} inputMode="tel" value={f.phone} onChange={set('phone')} onBlur={checkDupes} placeholder="98765 43210" required />
          {f.phone && !normalizeIndianMobile(f.phone) && <p className="text-[11px] text-error mt-1">Enter a 10-digit Indian mobile number.</p>}
          {dupes.length > 0 && (
            <div className="mt-2 p-2 rounded-lg bg-[#B8873D]/10 text-xs text-[#8a6224] space-y-1">
              <div className="flex items-center gap-1 font-bold"><AlertTriangle className="w-3.5 h-3.5" />This number already has a lead:</div>
              {dupes.map(d => <button type="button" key={d.id} className="underline cursor-pointer block" onClick={() => onOpenLead(d.id)}>{d.contactInfo.name} · {d.buildingInfo.address}</button>)}
            </div>
          )}
        </div>
        <div>
          <label className={labelCls}>Location *</label>
          <div className="flex gap-2">
            <input className={inputCls} value={f.location} onChange={set('location')} placeholder="Area, city" required />
            <Button type="button" variant="secondary" onClick={useGps} aria-label="Use my location"><MapPin className="w-4 h-4" /></Button>
          </div>
          {coords && <p className="text-[11px] text-warmgray mt-1">GPS saved ({coords.lat.toFixed(4)}, {coords.lng.toFixed(4)})</p>}
        </div>
        <div><label className={labelCls}>Site photo</label><PhotoInput ctx={ctx} actor={actor} target={{}} caption="Lead site photo" photos={photos} onChange={setPhotos} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Site type</label>
            <select className={inputCls} value={f.siteType} onChange={set('siteType')}>{SITE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <div><label className={labelCls}>Floors</label><input className={inputCls} inputMode="numeric" value={f.floors} onChange={set('floors')} /></div>
        </div>
        <div><label className={labelCls}>Lift requirement</label><input className={inputCls} value={f.liftRequirement} onChange={set('liftRequirement')} placeholder="e.g. G+7 passenger lift, 8 persons" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Construction stage</label>
            <select className={inputCls} value={f.constructionStage} onChange={set('constructionStage')}>{STAGES.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}</select></div>
          <div><label className={labelCls}>Source</label>
            <select className={inputCls} value={f.source} onChange={set('source')}>{['Walk-in', 'Referral', 'Phone call', 'Builder visit', 'Online', 'Other'].map(s => <option key={s}>{s}</option>)}</select></div>
        </div>
        <div><label className={labelCls}>Next follow-up</label><input type="datetime-local" className={inputCls} value={f.nextFollowUp} onChange={set('nextFollowUp')} /></div>
        <div><label className={labelCls}>Notes</label><textarea className={inputCls} rows={2} value={f.notes} onChange={set('notes')} /></div>
        {/* ⚖ VERIFY the consent wording with the Owner's lawyer (DPDP Act). */}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 w-5 h-5" checked={f.consent} onChange={set('consent')} />
          <span>The customer agrees that ALL INDIA ELEVATORS may contact them about this lift enquiry and keep these details. *</span>
        </label>
      </Card>
      <Button type="submit" variant="primary" fullWidth disabled={busy}>{busy ? 'Saving…' : 'Save lead'}</Button>
    </form>
  );
};
