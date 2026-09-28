/**
 * D-36 "Planned projects": registered buildings that will need a lift, with their lift window.
 * The Admin pastes a list (e.g. copied from MahaRERA's project search, with its permission —
 * ⚖ VERIFY), the app finds each address on the map, previews what will change, then saves.
 * Sales and riders see the list sorted by "go now" first; riders also see them on their map.
 * Why not reuse the Sightings inbox list: these have no photos or status yet — only a date.
 */

import React, { useState } from 'react';
import { CheckCircle2, Navigation, Upload } from 'lucide-react';
import type { User } from '../../types';
import { Button, Card } from '../../components/Common';
import { dismissProspect, importProspects, listProspects, type ImportResult, type ProspectView } from '../services/prospectService';
import { parseProspectList, type LiftPhase, type ProspectRow } from '../prospects';
import { findPlace } from '../geo';
import { LIFT_WINDOW_FROM_MONTHS, LIFT_WINDOW_TO_MONTHS } from '../config';
import { ErrorNote, inputCls, labelCls, Loading, useAction, useLoad, useMvpCtx, useT } from './ui';

export const PLANNED_COLOR = '#0f766e';
export const PHASE_COLOR: Record<LiftPhase, string> = { WINDOW: '#15803d', LATE: '#B8873D', OVERDUE: '#9a3412', UNKNOWN: '#6b7280', EARLY: '#6b7280' };

export function phaseText(p: Pick<ProspectView, 'phase' | 'monthsToCompletion'>, t: (s: string) => string): string {
  const m = p.monthsToCompletion === null ? 0 : Math.abs(Math.round(p.monthsToCompletion));
  switch (p.phase) {
    case 'WINDOW': return t('Lift window now');
    case 'LATE': return `${t('Completing soon')} · ${t('lift may be ordered')}`;
    case 'OVERDUE': return `${t('Past its date')} (${m} ${t('months')}) · ${t('may be delayed, check')}`;
    case 'EARLY': return `${t('Too early')} · ${t('window in')} ${Math.max(1, m - LIFT_WINDOW_FROM_MONTHS)} ${t('months')}`;
    default: return t('No completion date');
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
/** Nominatim's fair-use policy: at most one lookup per second, light use only. ⚖ VERIFY for heavy use. */
const LOOKUP_GAP_MS = 1100;
const MAX_ADDRESS_LOOKUPS = 100;

export const PlannedRow: React.FC<{ p: ProspectView; km?: number | null; children?: React.ReactNode }> = ({ p, km, children }) => {
  const t = useT();
  return (
    <Card className="p-3 space-y-1">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-bold">{p.name}{p.floors ? ` · ${p.floors} ${t('floors')}` : ''}</div>
          <div className="text-[11px] text-warmgray truncate">{p.address}</div>
          <div className="text-[11px] font-bold" style={{ color: PHASE_COLOR[p.phase] }}>
            {phaseText(p, t)}{p.completion ? ` · ${t('completion')} ${p.completion.slice(0, 7)}` : ''}{km != null ? ` · ${km} km` : ''}
          </div>
          {p.visitedScoutId && <div className="text-[11px] font-bold text-[#15803d] flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{t('A rider has recorded this site')}</div>}
          {(p.regNo || p.promoter) && <div className="text-[10px] text-warmgray truncate">{[p.regNo, p.promoter].filter(Boolean).join(' · ')}</div>}
        </div>
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat.toFixed(5)},${p.lng.toFixed(5)}`} target="_blank" rel="noopener noreferrer"
          aria-label={t('Directions')} className="flex-none min-h-[44px] min-w-[44px] rounded-xl border border-[#f0ebe2] bg-white flex items-center justify-center"><Navigation className="w-4 h-4" /></a>
      </div>
      {children}
    </Card>
  );
};

const Dismiss: React.FC<{ user: User; p: ProspectView; onDone: () => void }> = ({ user, p, onDone }) => {
  const { ctx, actor } = useMvpCtx(user);
  const t = useT();
  const { run, busy, error } = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) return <button onClick={() => setOpen(true)} className="text-[11px] font-bold text-warmgray min-h-[32px] cursor-pointer">{t('Not worth a visit')}</button>;
  return (
    <div className="flex gap-2 items-center">
      {error && <ErrorNote message={error} />}
      <input className={inputCls} placeholder={t('Why? (already built, cancelled, no lift…)')} value={reason} onChange={e => setReason(e.target.value)} />
      <button disabled={busy || !reason.trim()} onClick={() => run(async () => { await dismissProspect(ctx, actor, p.id, reason); onDone(); })}
        className="min-h-[44px] px-3 rounded-xl bg-charcoal text-white text-xs font-bold cursor-pointer disabled:opacity-40">{t('Remove')}</button>
    </div>
  );
};

const Import: React.FC<{ user: User; onDone: () => void }> = ({ user, onDone }) => {
  const { ctx, actor } = useMvpCtx(user);
  const t = useT();
  const [text, setText] = useState('');
  const [source, setSource] = useState('MahaRERA project search');
  const [rows, setRows] = useState<ProspectRow[] | null>(null);
  const [errors, setErrors] = useState<{ line: number; message: string }[]>([]);
  const [finding, setFinding] = useState<{ done: number; total: number } | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [saved, setSaved] = useState<ImportResult | null>(null);
  const { run, busy, error } = useAction();

  const readFile = (f: File) => { const r = new FileReader(); r.onload = () => setText(String(r.result)); r.readAsText(f); };

  const check = () => run(async () => {
    setSaved(null); setPreview(null);
    const parsed = parseProspectList(text);
    setErrors(parsed.errors);
    // Rows without latitude/longitude: look the address up (about one per second).
    const need = parsed.rows.filter(r => r.lat === undefined);
    // OpenStreetMap's free lookup is for light use: a big list must bring its own coordinates.
    if (need.length > MAX_ADDRESS_LOOKUPS) {
      throw new Error(t(`More than ${MAX_ADDRESS_LOOKUPS} rows have no Latitude/Longitude. Add those two columns for a list this big, or paste it in parts.`));
    }
    setFinding({ done: 0, total: need.length });
    for (let i = 0; i < need.length; i++) {
      const r = need[i];
      if (i > 0) await sleep(LOOKUP_GAP_MS);
      let hit = await findPlace([r.address, r.pincode].filter(Boolean).join(', '));
      if (!hit && r.pincode) { await sleep(LOOKUP_GAP_MS); hit = await findPlace(`${r.name}, ${r.pincode}`); }
      if (hit) { r.lat = hit.lat; r.lng = hit.lng; }
      setFinding({ done: i + 1, total: need.length });
    }
    setFinding(null);
    setRows(parsed.rows);
    setPreview(await importProspects(ctx, actor, parsed.rows, { source, dryRun: true }));
  });

  const save = () => run(async () => {
    if (!rows) return;
    setSaved(await importProspects(ctx, actor, rows, { source, dryRun: false }));
    setPreview(null); setRows(null); setText(''); onDone();
  });

  return (
    <Card className="p-4 space-y-2">
      <div className="text-sm font-bold flex items-center gap-1"><Upload className="w-4 h-4" />{t('Add planned projects')}</div>
      <p className="text-[11px] text-warmgray">
        {t('Paste a list with a header line: Project name, Address (or Latitude, Longitude), PIN code, Proposed completion date, Registration no, Promoter, Floors. From a spreadsheet: copy the cells and paste. Phone numbers and e-mails are ignored.')}
      </p>
      <p className="text-[11px] text-[#9a3412]">⚖ VERIFY {t('MahaRERA data may be reused only with its permission: get it before copying its lists in.')}</p>
      <div><label className={labelCls}>{t('Where the list is from')}</label><input className={inputCls} value={source} onChange={e => setSource(e.target.value)} /></div>
      <textarea className={`${inputCls} min-h-[120px] font-mono text-[11px]`} value={text} onChange={e => { setText(e.target.value); setPreview(null); }}
        placeholder={'Project name,Registration no,Address,PIN code,Proposed completion date,Floors\nSkyline Heights,P52100012345,"Survey 12, Wakad, Pune",411057,31/12/2027,14'} />
      <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="text-xs" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) readFile(f); }} />
      {error && <ErrorNote message={error} />}
      {errors.length > 0 && (
        <div className="text-[11px] text-[#9a3412] space-y-0.5">{errors.slice(0, 8).map((e, i) => <div key={i}>{t('Line')} {e.line}: {e.message}</div>)}</div>
      )}
      {finding && <div className="text-xs text-warmgray">{t('Finding places on the map…')} {finding.done}/{finding.total}</div>}
      {preview && (
        <div className="p-3 rounded-xl bg-alabaster text-xs space-y-1">
          <div className="font-bold">{t('Check before saving')}: {preview.added.length} {t('new')} · {preview.updated.length} {t('updated')} · {preview.unchanged} {t('unchanged')}</div>
          {preview.noLocation.length > 0 && (
            <div className="text-[#9a3412]">{preview.noLocation.length} {t('not found on the map (not saved): fix the address or add Latitude, Longitude')}: {preview.noLocation.slice(0, 5).map(r => `${t('line')} ${r.line} ${r.name}`).join('; ')}</div>
          )}
          <Button variant="primary" disabled={busy || preview.added.length + preview.updated.length === 0} onClick={save}>{t('Save')} {preview.added.length + preview.updated.length}</Button>
        </div>
      )}
      {saved && <div className="text-xs font-bold text-[#15803d]">{t('Saved')}: {saved.added.length} {t('new')} · {saved.updated.length} {t('updated')}</div>}
      {!preview && <Button variant="secondary" disabled={busy || !text.trim()} onClick={check}>{busy ? t('Checking…') : t('Check the list')}</Button>}
    </Card>
  );
};

export const PlannedProjects: React.FC<{ user: User }> = ({ user }) => {
  const { ctx, actor } = useMvpCtx(user);
  const t = useT();
  const { data, error, loading, reload } = useLoad(() => listProspects(ctx, actor), [ctx]);
  if (loading && !data) return <Loading label={t('Loading planned projects…')} />;
  if (error) return <ErrorNote message={error} />;
  const list = data ?? [];
  const now = list.filter(p => p.phase === 'WINDOW' && !p.visitedScoutId).length;
  return (
    <div className="space-y-2">
      <p className="text-xs text-warmgray">
        {t('Registered buildings that will need a lift.')} {t('Lift window')}: {LIFT_WINDOW_FROM_MONTHS}–{LIFT_WINDOW_TO_MONTHS} {t('months before completion')} (⚖ VERIFY). <b>{now}</b> {t('in the window and not visited yet.')}
      </p>
      {actor.role === 'admin' && <Import user={user} onDone={reload} />}
      {list.length === 0 && <p className="text-xs text-warmgray">{t('No planned projects yet.')}</p>}
      {list.map(p => (
        <PlannedRow key={p.id} p={p}>{actor.role === 'admin' && <Dismiss user={user} p={p} onDone={reload} />}</PlannedRow>
      ))}
    </div>
  );
};
