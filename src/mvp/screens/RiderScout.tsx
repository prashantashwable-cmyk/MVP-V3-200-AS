/**
 * D-34 "Scout sites": the rider's screen on the bike. Location and address are automatic; the
 * first photo saves the sighting; the lift-shaft and board photos and the number are one tap
 * each and optional. A nearby earlier sighting is shown before saving (no double counting).
 * Below: the rider's own sightings on a map and as a list, with what Sales did with each.
 * Why not reuse LeadForm: a sighting is not a lead yet (no consent from the site), and a form
 * with typing is unusable on a bike.
 */

import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, List, Map as MapIcon, MapPin, Navigation, Phone, TriangleAlert } from 'lucide-react';
import type { User } from '../../types';
import { Card } from '../../components/Common';
import {
  addSightingPhoto, createSighting, findNearbySightings, listMySightings, updateSightingDetails,
} from '../services/scoutService';
import type { ScoutPhotoKind, SiteScout } from '../scouting';
import { MAX_SCOUT_PREVIEW_BYTES } from '../config';
import { lookupAddress, watchFix, type Fix } from '../geo';
import { compressPhoto, makePreview } from './PhotoInput';
import { formatDateTime } from '../format';
import { ErrorNote, inputCls, Loading, useLoad, useMvpCtx, useT } from './ui';

const SiteMap = lazy(() => import('./SiteMap'));

export const STATUS_COLOR: Record<SiteScout['status'], string> = { NEW: '#B8873D', CONVERTED: '#15803d', REJECTED: '#9ca3af' };
const KIND_LABEL: Record<ScoutPhotoKind, string> = { SITE: 'Site photo', SHAFT: 'Lift shaft photo', BOARD: 'Board / number photo' };

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('The photo could not be read.'));
    r.readAsDataURL(file);
  });
}

async function preparePhoto(file: File, kind: ScoutPhotoKind) {
  const dataUrl = await compressPhoto(await readFile(file));
  const previewDataUrl = await makePreview(dataUrl, MAX_SCOUT_PREVIEW_BYTES, kind === 'BOARD' ? 1280 : 960);
  return { kind, dataUrl, contentType: 'image/jpeg', previewDataUrl };
}

/** A big camera button: opens the rear camera directly on phones. */
const CameraButton: React.FC<{ label: string; done?: boolean; disabled?: boolean; big?: boolean; onFile: (f: File) => void }> = ({ label, done, disabled, big, onFile }) => {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
      <button disabled={disabled} onClick={() => ref.current?.click()}
        className={`w-full rounded-2xl font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${big ? 'min-h-[88px] text-lg bg-royalemerald text-white' : `min-h-[56px] text-sm border-2 ${done ? 'border-[#15803d] text-[#15803d] bg-[#15803d]/5' : 'border-[#f0ebe2] bg-white text-charcoal'}`}`}>
        {done ? <CheckCircle2 className="w-5 h-5" /> : <Camera className={big ? 'w-7 h-7' : 'w-5 h-5'} />}{label}
      </button>
    </>
  );
};

export const RiderScout: React.FC<{ user: User }> = ({ user }) => {
  const { ctx, actor } = useMvpCtx(user);
  const t = useT();
  const [fix, setFix] = useState<Fix | null>(null);
  const [gpsNote, setGpsNote] = useState('Finding your location…');
  const [current, setCurrent] = useState<SiteScout | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nearby, setNearby] = useState<(SiteScout & { distanceM: number })[] | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [phone, setPhone] = useState('');
  const [view, setView] = useState<'map' | 'list'>('map');
  const [picked, setPicked] = useState<SiteScout | null>(null);
  const mine = useLoad(() => listMySightings(ctx, actor), [ctx]);

  useEffect(() => watchFix(f => { setFix(f); setGpsNote(''); }, setGpsNote), []);

  // No address at capture (weak network)? Keep trying quietly and fill it in when it comes.
  useEffect(() => {
    if (!current || !/^-?\d+\.\d+, -?\d+\.\d+$/.test(current.address)) return;
    let stop = false;
    const timer = setTimeout(async () => {
      const address = await lookupAddress(current.lat, current.lng);
      if (!stop && address) {
        try { setCurrent(await updateSightingDetails(ctx, actor, current.id, { address })); mine.reload(); } catch { /* next time */ }
      }
    }, 8000);
    return () => { stop = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.address]);

  const saveNew = async (file: File) => {
    if (!fix) { setError(t('No GPS location yet. Wait for the location, then take the photo.')); return; }
    setBusy('SITE'); setError(null); setNearby(null); setPending(null);
    try {
      const at = { lat: fix.lat, lng: fix.lng };
      const [photo, address] = await Promise.all([preparePhoto(file, 'SITE'), lookupAddress(at.lat, at.lng)]);
      const s = await createSighting(ctx, actor, { ...at, accuracyM: fix.accuracyM, address, photo });
      setCurrent(s); setPhone('');
      mine.reload();
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(null); }
  };

  const onSitePhoto = async (file: File) => {
    if (!fix) { setError(t('No GPS location yet. Wait for the location, then take the photo.')); return; }
    const near = await findNearbySightings(ctx, { lat: fix.lat, lng: fix.lng }).catch(() => []);
    if (near.length) { setNearby(near); setPending(file); return; }
    await saveNew(file);
  };

  const addPhoto = async (kind: ScoutPhotoKind, file: File) => {
    if (!current) return;
    setBusy(kind); setError(null);
    try { setCurrent(await addSightingPhoto(ctx, actor, current.id, await preparePhoto(file, kind))); mine.reload(); }
    catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(null); }
  };

  const savePhone = async () => {
    if (!current) return;
    setBusy('PHONE'); setError(null);
    try { setCurrent(await updateSightingDetails(ctx, actor, current.id, { phone })); mine.reload(); }
    catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(null); }
  };

  const has = (k: ScoutPhotoKind) => !!current?.photos.some(p => p.kind === k);
  const list = mine.data ?? [];
  const today = list.filter(s => new Date(s.createdAt).toDateString() === new Date().toDateString()).length;

  return (
    <div className="space-y-3 max-w-2xl mx-auto pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-charcoal">{t('Scout sites')}</h2>
        <span className="text-xs font-bold text-warmgray">{t('Today')}: {today} · {t('Total')}: {list.length}</span>
      </div>
      <div className={`text-xs font-semibold flex items-center gap-1 ${fix ? 'text-[#15803d]' : 'text-[#B8873D]'}`}>
        <MapPin className="w-4 h-4" />{fix ? `${t('Location ready')} (±${fix.accuracyM} m)` : t(gpsNote)}
      </div>
      {error && <ErrorNote message={error} />}

      {nearby && pending && (
        <Card className="p-4 space-y-2 border-[#B8873D]">
          <div className="font-bold text-sm flex items-center gap-1"><TriangleAlert className="w-4 h-4 text-[#B8873D]" />{t('Already recorded nearby')}</div>
          {nearby.slice(0, 3).map(n => (
            <div key={n.id} className="text-xs text-warmgray">{n.distanceM} m · {n.scoutedByName} · {formatDateTime(n.createdAt)} · {n.address}</div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => { setNearby(null); setPending(null); }} className="flex-1 min-h-[48px] rounded-xl border border-[#f0ebe2] bg-white font-bold text-sm cursor-pointer">{t('Same site, skip')}</button>
            <button onClick={() => saveNew(pending)} className="flex-1 min-h-[48px] rounded-xl bg-charcoal text-white font-bold text-sm cursor-pointer">{t('Different site, save')}</button>
          </div>
        </Card>
      )}

      {!current ? (
        <CameraButton big label={busy === 'SITE' ? t('Saving…') : t('New site: take photo')} disabled={!!busy || !fix} onFile={onSitePhoto} />
      ) : (
        <Card className="p-4 space-y-3">
          <div className="text-sm font-bold flex items-center gap-1 text-[#15803d]"><CheckCircle2 className="w-4 h-4" />{t('Site saved')}</div>
          <div className="text-xs text-warmgray">{current.address}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <CameraButton label={busy === 'SHAFT' ? t('Saving…') : t(KIND_LABEL.SHAFT)} done={has('SHAFT')} disabled={!!busy} onFile={f => addPhoto('SHAFT', f)} />
            <CameraButton label={busy === 'BOARD' ? t('Saving…') : t(KIND_LABEL.BOARD)} done={has('BOARD')} disabled={!!busy} onFile={f => addPhoto('BOARD', f)} />
          </div>
          <div className="flex gap-2">
            <input className={inputCls} inputMode="tel" placeholder={t('Contact number (optional)')} value={phone} onChange={e => setPhone(e.target.value)} />
            <button disabled={!!busy || !phone.trim()} onClick={savePhone} className="min-h-[44px] px-4 rounded-xl bg-charcoal text-white text-sm font-bold cursor-pointer disabled:opacity-40">
              <Phone className="w-4 h-4 inline mr-1" />{current.phone ? t('Saved') : t('Save')}
            </button>
          </div>
          <CameraButton big label={t('Next site: take photo')} disabled={!!busy || !fix} onFile={f => { setCurrent(null); void onSitePhoto(f); }} />
          <p className="text-[11px] text-warmgray">{t('Sales gets this site at once and calls the builder.')}</p>
        </Card>
      )}

      <div className="flex items-center justify-between pt-2">
        <h3 className="text-sm font-bold text-charcoal">{t('My sightings')}</h3>
        <div className="flex gap-1">
          <button onClick={() => setView('map')} aria-label={t('Map')} className={`min-h-[40px] px-3 rounded-lg text-xs font-bold cursor-pointer ${view === 'map' ? 'bg-charcoal text-white' : 'bg-white border border-[#f0ebe2]'}`}><MapIcon className="w-4 h-4 inline" /> {t('Map')}</button>
          <button onClick={() => setView('list')} aria-label={t('List')} className={`min-h-[40px] px-3 rounded-lg text-xs font-bold cursor-pointer ${view === 'list' ? 'bg-charcoal text-white' : 'bg-white border border-[#f0ebe2]'}`}><List className="w-4 h-4 inline" /> {t('List')}</button>
        </div>
      </div>
      {mine.loading && !mine.data ? <Loading /> : view === 'map' ? (
        <Suspense fallback={<Loading label={t('Loading map…')} />}>
          <SiteMap points={list.map(s => ({ id: s.id, lat: s.lat, lng: s.lng, color: STATUS_COLOR[s.status], label: `${s.address} · ${t(s.status === 'NEW' ? 'With Sales' : s.status === 'CONVERTED' ? 'Became a lead' : 'Not useful')}` }))}
            me={fix} onPick={id => setPicked(list.find(s => s.id === id) ?? null)} />
        </Suspense>
      ) : (
        <div className="space-y-2">
          {list.length === 0 && <p className="text-xs text-warmgray">{t('No sightings yet.')}</p>}
          {list.map(s => <SightingRow key={s.id} s={s} onOpen={() => setPicked(s)} />)}
        </div>
      )}
      {picked && <SightingCard s={picked} onClose={() => setPicked(null)} />}
    </div>
  );
};

export const SightingRow: React.FC<{ s: SiteScout; onOpen: () => void }> = ({ s, onOpen }) => {
  const t = useT();
  const site = s.photos.find(p => p.kind === 'SITE') ?? s.photos[0];
  return (
    <button onClick={onOpen} className="w-full text-left cursor-pointer">
      <Card className="p-3 flex gap-3 items-center" hoverEffect>
        {site ? <img src={site.previewDataUrl} alt="" className="w-16 h-16 rounded-xl object-cover flex-none" /> : <div className="w-16 h-16 rounded-xl bg-alabaster flex-none" />}
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold truncate">{s.address}</div>
          <div className="text-[11px] text-warmgray">{formatDateTime(s.createdAt)} · {s.scoutedByName}</div>
          <div className="text-[11px] font-bold mt-0.5" style={{ color: STATUS_COLOR[s.status] }}>
            {t(s.status === 'NEW' ? 'With Sales' : s.status === 'CONVERTED' ? 'Became a lead' : 'Not useful')}
          </div>
        </div>
      </Card>
    </button>
  );
};

/** The details of one sighting: photos (tap to enlarge), address, number, directions. */
export const SightingCard: React.FC<{ s: SiteScout; onClose: () => void; children?: React.ReactNode }> = ({ s, onClose, children }) => {
  const t = useT();
  const [big, setBig] = useState<string | null>(null);
  return (
    <Card className="p-4 space-y-3 border-charcoal/30">
      <div className="flex justify-between items-start gap-2">
        <div>
          <div className="text-sm font-bold">{s.address}</div>
          <div className="text-[11px] text-warmgray">{formatDateTime(s.createdAt)} · {s.scoutedByName}{s.accuracyM ? ` · ±${s.accuracyM} m` : ''}</div>
        </div>
        <button onClick={onClose} className="min-h-[40px] px-3 text-xs font-bold text-warmgray cursor-pointer">{t('Close')}</button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {s.photos.map(p => (
          <button key={p.kind} onClick={() => setBig(p.previewDataUrl)} className="cursor-pointer text-left">
            <img src={p.previewDataUrl} alt={t(KIND_LABEL[p.kind])} className="w-full aspect-square object-cover rounded-xl" />
            <div className="text-[10px] text-warmgray mt-0.5">{t(KIND_LABEL[p.kind])}</div>
          </button>
        ))}
      </div>
      {big && (
        <button onClick={() => setBig(null)} className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3 cursor-pointer">
          <img src={big} alt="" className="max-w-full max-h-full rounded-xl" />
        </button>
      )}
      <div className="flex flex-wrap gap-2">
        {s.phone && <a href={`tel:+91${s.phone}`} className="min-h-[44px] px-4 rounded-xl bg-royalemerald text-white text-sm font-bold inline-flex items-center gap-1.5"><Phone className="w-4 h-4" />{s.phone}</a>}
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`} target="_blank" rel="noopener noreferrer"
          className="min-h-[44px] px-4 rounded-xl border border-[#f0ebe2] bg-white text-sm font-bold inline-flex items-center gap-1.5"><Navigation className="w-4 h-4" />{t('Directions')}</a>
      </div>
      {s.status === 'REJECTED' && <div className="text-xs text-warmgray">{t('Not useful')}: {t((s.rejectReason ?? 'OTHER').replace(/_/g, ' ').toLowerCase())}{s.rejectNote ? ` — ${s.rejectNote}` : ''}</div>}
      {children}
    </Card>
  );
};
