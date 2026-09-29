/**
 * D-37 Sales: open leads on one map (colour = how urgent the follow-up is) and "Today's
 * visits" — the leads due today or overdue, in riding order from where you are, with one-tap
 * Google Maps directions. Leads without a location get "Find on map" (from the address) or
 * "I'm at the site" (GPS). Used by LeadsList.
 * Why not reuse LiveMapDashboard / LeadFollowUpScheduler: legacy localStorage screens.
 */

import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Crosshair, MapPin, Navigation, Search } from 'lucide-react';
import type { User } from '../../types';
import { Card } from '../../components/Common';
import { setLeadLocation } from '../services/leadService';
import type { MvpLead } from '../leadModel';
import { directionsLinks, isOpenLead, locationOf, planVisits, urgencyOf, type LeadUrgency } from '../visitPlan';
import { findPlace, watchFix, type Fix } from '../geo';
import { formatDateTime } from '../format';
import { ErrorNote, Loading, useAction, useMvpCtx, useT } from './ui';

const SiteMap = lazy(() => import('./SiteMap'));

export const URGENCY_COLOR: Record<LeadUrgency, string> = { OVERDUE: '#b91c1c', TODAY: '#B8873D', SOON: '#256abf', LATER: '#15803d', NONE: '#6b7280' };
const URGENCY_LABEL: Record<LeadUrgency, string> = { OVERDUE: 'Overdue', TODAY: 'Today', SOON: 'Next 3 days', LATER: 'Later', NONE: 'No follow-up date' };

function useFix(): { fix: Fix | null; gpsNote: string } {
  const [fix, setFix] = useState<Fix | null>(null);
  const [gpsNote, setGpsNote] = useState('');
  useEffect(() => watchFix(f => { setFix(f); setGpsNote(''); }, setGpsNote), []);
  return { fix, gpsNote };
}

/** Leads with no location yet: place them from the address, or from GPS when standing at the site. */
const NoLocation: React.FC<{ user: User; leads: MvpLead[]; fix: Fix | null; onSaved: () => void }> = ({ user, leads, fix, onSaved }) => {
  const { ctx, actor } = useMvpCtx(user);
  const t = useT();
  const { run, busy, error } = useAction();
  const [missing, setMissing] = useState<string | null>(null);
  if (!leads.length) return null;
  const canEdit = (l: MvpLead) => actor.role === 'admin' || (actor.role === 'sales' && (l.ownerUserId ?? l.surveyorId) === actor.userId);
  return (
    <Card className="p-3 space-y-2">
      <div className="text-xs font-bold">{leads.length} {leads.length === 1 ? t('lead is not on the map yet') : t('leads are not on the map yet')}</div>
      {error && <ErrorNote message={error} />}
      {leads.slice(0, 8).map(l => (
        <div key={l.id} className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold truncate">{l.contactInfo.name}</div>
            <div className="text-[11px] text-warmgray truncate">{l.buildingInfo.address || '—'}{missing === l.id ? ` · ${t('not found, try GPS at the site')}` : ''}</div>
          </div>
          {canEdit(l) && (
            <>
              <button disabled={busy || !l.buildingInfo.address} aria-label={t('Find on map')} title={t('Find on map')}
                onClick={() => run(async () => {
                  const hit = await findPlace(l.buildingInfo.address);
                  if (!hit) { setMissing(l.id); return; }
                  await setLeadLocation(ctx, actor, l.id, hit, 'address'); onSaved();
                })}
                className="min-h-[40px] px-2 rounded-lg border border-[#f0ebe2] bg-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"><Search className="w-3.5 h-3.5" />{t('Find')}</button>
              <button disabled={busy || !fix} aria-label={t("I'm at the site")} title={t("I'm at the site")}
                onClick={() => run(async () => { await setLeadLocation(ctx, actor, l.id, fix!, 'gps'); onSaved(); })}
                className="min-h-[40px] px-2 rounded-lg border border-[#f0ebe2] bg-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"><Crosshair className="w-3.5 h-3.5" />{t('Here')}</button>
            </>
          )}
        </div>
      ))}
    </Card>
  );
};

export const LeadsMap: React.FC<{ user: User; leads: MvpLead[]; onOpenLead: (id: string) => void; onSaved: () => void }> = ({ user, leads, onOpenLead, onSaved }) => {
  const t = useT();
  const { fix } = useFix();
  const now = new Date();
  const open = leads.filter(isOpenLead);
  const placed = open.filter(l => locationOf(l));
  const counts = placed.reduce((m: Record<string, number>, l) => { const u = urgencyOf(l, now); m[u] = (m[u] ?? 0) + 1; return m; }, {});
  return (
    <div className="space-y-2">
      <Suspense fallback={<Loading label={t('Loading map…')} />}>
        <SiteMap heightClass="h-[26rem]" me={fix}
          points={placed.map(l => { const at = locationOf(l)!; const u = urgencyOf(l, now); return { id: l.id, ...at, color: URGENCY_COLOR[u], label: `${l.contactInfo.name} · ${t(URGENCY_LABEL[u])}` }; })}
          onPick={onOpenLead} />
      </Suspense>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-warmgray">
        {(Object.keys(URGENCY_COLOR) as LeadUrgency[]).map(u => (
          <span key={u} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: URGENCY_COLOR[u] }} />{t(URGENCY_LABEL[u])} ({counts[u] ?? 0})</span>
        ))}
      </div>
      <NoLocation user={user} leads={open.filter(l => !locationOf(l))} fix={fix} onSaved={onSaved} />
    </div>
  );
};

export const DayPlan: React.FC<{ user: User; leads: MvpLead[]; onOpenLead: (id: string) => void; onSaved: () => void }> = ({ user, leads, onOpenLead, onSaved }) => {
  const t = useT();
  const { fix, gpsNote } = useFix();
  const now = new Date();
  const due = leads.filter(l => isOpenLead(l) && ['OVERDUE', 'TODAY'].includes(urgencyOf(l, now)));
  const placed = due.filter(l => locationOf(l)).map(l => ({ ...l, ...locationOf(l)! }));
  const start = fix ? { lat: fix.lat, lng: fix.lng } : null;
  // Re-plan only when the set of stops changes or the rider moves ~300 m, not on every GPS tick.
  const startKey = start ? `${start.lat.toFixed(3)},${start.lng.toFixed(3)}` : '';
  const plan = useMemo(() => planVisits(start, placed), [startKey, placed.map(p => p.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const links = directionsLinks(start, plan.order);
  return (
    <div className="space-y-2">
      <Card className="p-3 space-y-1">
        <div className="text-sm font-bold flex items-center gap-1"><MapPin className="w-4 h-4 text-[#B8873D]" />{t("Today's visits")}: {plan.order.length} · {plan.km} km</div>
        <div className="text-[11px] text-warmgray">{t('Leads due today or overdue, nearest first from where you are. Straight-line km; the road is longer.')}{!start ? ` ${gpsNote ? t(gpsNote) : t('Waiting for your location…')}` : ''}</div>
        {links.map((href, i) => (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-between min-h-[48px] px-3 rounded-xl bg-royalemerald text-white text-sm font-bold">
            <span>{links.length > 1 ? `${t('Directions')} ${i + 1}/${links.length} (${t('stops')} ${i * 4 + 1}–${Math.min(plan.order.length, i * 4 + 4)})` : t('Directions for all stops')}</span><Navigation className="w-4 h-4" />
          </a>
        ))}
      </Card>
      {plan.order.length === 0 && <p className="text-xs text-warmgray">{t('No visits due today. Set a follow-up date on a lead to plan it here.')}</p>}
      {plan.order.map((l, i) => {
        const u = urgencyOf(l, now);
        return (
          <button key={l.id} onClick={() => onOpenLead(l.id)} className="w-full text-left cursor-pointer">
            <Card className="p-3 flex gap-3 items-center" hoverEffect>
              <span className="w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center flex-none" style={{ background: URGENCY_COLOR[u] }}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold truncate">{l.contactInfo.name}</div>
                <div className="text-[11px] text-warmgray truncate">{l.buildingInfo.address}</div>
                <div className="text-[11px]" style={{ color: URGENCY_COLOR[u] }}>{t(URGENCY_LABEL[u])} · {formatDateTime(l.nextFollowUp!)} · +{plan.legsKm[i]} km</div>
              </div>
              {l.contactInfo.phone && <a href={`tel:${l.contactInfo.phone}`} onClick={e => e.stopPropagation()} className="min-h-[40px] px-3 rounded-lg border border-[#f0ebe2] bg-white text-[11px] font-bold flex items-center">{t('Call')}</a>}
            </Card>
          </button>
        );
      })}
      <NoLocation user={user} leads={due.filter(l => !locationOf(l))} fix={fix} onSaved={onSaved} />
    </div>
  );
};
