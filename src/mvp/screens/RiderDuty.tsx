/**
 * D-34 part 2 on the rider's screen: "Start day / End day" (route recorded only while on duty
 * and the app is open; the screen is kept awake on the bike mount), today's numbers, earnings,
 * the weekly leaderboard and "Try here" squares. Used by RiderScout.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Building2, Flame, Navigation, Play, RotateCcw, Square, Trophy, Wallet } from 'lucide-react';
import { Card } from '../../components/Common';
import type { MvpActor, MvpCtx } from '../services/orderService';
import { getMyRouteToday, saveRoutePoints, startDuty, type RiderBoard, type RiderRoute } from '../services/riderService';
import { cellBounds, distanceM, type RoutePoint } from '../scouting';
import { COMMISSION_ON_BOOKING_INR, COMMISSION_PER_CONFIRMED_INR, COVERAGE_CELL_M, ROUTE_MIN_MOVE_M, ROUTE_SAVE_MINUTES } from '../config';
import type { Fix } from '../geo';
import { formatInr } from '../format';
import { ErrorNote, useT } from './ui';
import { PLANNED_COLOR, PlannedRow } from './PlannedProjects';

/** Records the route while on duty: a point every ROUTE_MIN_MOVE_M, saved every few minutes. */
export function useDuty(ctx: MvpCtx, actor: MvpActor, fix: Fix | null, onSaved: () => void) {
  const [route, setRoute] = useState<RiderRoute | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const buffer = useRef<RoutePoint[]>([]);
  const last = useRef<RoutePoint | null>(null);
  const onDuty = !!route?.onDuty;

  useEffect(() => { getMyRouteToday(ctx, actor).then(setRoute).catch(() => undefined); }, [ctx]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!onDuty || !fix || fix.accuracyM > 100) return; // ignore very rough fixes
    const p: RoutePoint = { lat: fix.lat, lng: fix.lng, t: new Date(fix.at).toISOString() };
    const prev = last.current ?? route?.points[route.points.length - 1] ?? null;
    if (!prev || distanceM(prev, p) >= ROUTE_MIN_MOVE_M) { buffer.current.push(p); last.current = p; }
  }, [fix?.at, onDuty]); // eslint-disable-line react-hooks/exhaustive-deps

  const flush = async (end = false) => {
    const pts = buffer.current;
    buffer.current = [];
    try {
      const r = await saveRoutePoints(ctx, actor, pts, end);
      setRoute(r.route); setError(null); onSaved();
    } catch (e: any) {
      buffer.current = [...pts, ...buffer.current]; // keep them; next save retries
      setError(e?.message ?? String(e));
    }
  };

  useEffect(() => {
    if (!onDuty) return;
    const timer = setInterval(() => { if (buffer.current.length) void flush(); }, ROUTE_SAVE_MINUTES * 60_000);
    const onHide = () => { if (document.visibilityState === 'hidden' && buffer.current.length) void flush(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onHide); };
  }, [onDuty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the screen on while riding (supported on Android Chrome; ignored elsewhere).
  useEffect(() => {
    if (!onDuty) return;
    const nav = navigator as any;
    let lock: any = null;
    let stopped = false;
    const request = () => nav.wakeLock?.request('screen').then((l: any) => { lock = l; }).catch(() => undefined);
    void request();
    const onShow = () => { if (!stopped && document.visibilityState === 'visible') void request(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { stopped = true; lock?.release?.(); document.removeEventListener('visibilitychange', onShow); };
  }, [onDuty]);

  const start = async () => {
    setBusy(true);
    try { setRoute(await startDuty(ctx, actor)); setError(null); } catch (e: any) { setError(e?.message ?? String(e)); } finally { setBusy(false); }
  };
  const end = async () => { setBusy(true); try { await flush(true); } finally { setBusy(false); } };
  return { route, onDuty, start, end, error, busy };
}

export const DutyBar: React.FC<{ duty: ReturnType<typeof useDuty>; board: RiderBoard | null }> = ({ duty, board }) => {
  const t = useT();
  const since = duty.route?.startedAt ? new Date(duty.route.startedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '';
  return (
    <div className="space-y-1">
      {duty.error && <ErrorNote message={duty.error} />}
      {duty.onDuty ? (
        <div className="p-3 rounded-2xl bg-[#15803d]/10 border border-[#15803d]/30 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-bold text-[#15803d]">{t('On duty')} · {t('since')} {since}</div>
            <div className="text-xs text-charcoal">{board?.today.km ?? 0} km · {board?.today.cells ?? 0} {t('squares')} · {board?.today.sightings ?? 0} {t('sites')}</div>
            <div className="text-[10px] text-warmgray">{t('Keep this screen open while riding.')}</div>
          </div>
          <button disabled={duty.busy} onClick={duty.end} className="min-h-[48px] px-4 rounded-xl bg-charcoal text-white text-sm font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"><Square className="w-4 h-4" />{t('End day')}</button>
        </div>
      ) : (
        <>
          <button disabled={duty.busy} onClick={duty.start} className="w-full min-h-[52px] rounded-2xl border-2 border-[#15803d] text-[#15803d] bg-white font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
            <Play className="w-5 h-5" />{duty.route?.endedAt ? t('Start again') : t('Start day')}
          </button>
          <p className="text-[10px] text-warmgray">{t('Your route is recorded only while you are on duty and this screen is open. Only you and the Admin see it.')}</p>
        </>
      )}
    </div>
  );
};

export function mapLayersFor(board: RiderBoard | null) {
  if (!board) return [];
  const covered = board.coveredCells.map(k => ({ id: `c_${k}`, ...cellBounds(k, COVERAGE_CELL_M), color: '#15803d', label: 'Covered' }));
  return covered;
}

export const RiderProgress: React.FC<{ board: RiderBoard | null; me: string; here?: { lat: number; lng: number } | null }> = ({ board, me, here }) => {
  const t = useT();
  if (!board) return null;
  const e = board.earnings;
  return (
    <div className="space-y-3">
      <Card className="p-4 space-y-1">
        <div className="text-sm font-bold flex items-center gap-1"><Wallet className="w-4 h-4 text-[#B8873D]" />{t('My earnings this month')}: {formatInr(e.amount)}</div>
        <div className="text-xs text-warmgray">{t('Confirmed sites')} {e.confirmed} × {formatInr(COMMISSION_PER_CONFIRMED_INR)} · {t('Booked')} {e.booked} × {formatInr(COMMISSION_ON_BOOKING_INR)}</div>
        <div className="text-xs text-warmgray">{t('Waiting with Sales')}: {e.pending}</div>
      </Card>
      <Card className="p-4 space-y-2">
        <div className="text-sm font-bold flex items-center gap-1"><Flame className="w-4 h-4 text-[#256abf]" />{t('Best chances to find a good site')}</div>
        {board.hot.length > 0 ? (
          <>
            <div className="text-xs text-warmgray">{t('Dark blue on the map = more likely. Based on booked and confirmed sites nearby, fewer where riders already went recently.')}</div>
            {board.hot.map((h, i) => {
              const km = here ? Math.round(distanceM(here, h) / 100) / 10 : null;
              return (
                <a key={i} href={`https://www.google.com/maps/dir/?api=1&destination=${h.lat.toFixed(5)},${h.lng.toFixed(5)}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between min-h-[44px] px-3 rounded-xl border border-[#256abf]/30 bg-[#256abf]/5 text-xs font-bold text-[#1c5cab]">
                  <span>{i + 1}. {h.value >= 0.8 ? t('Very likely') : h.value >= 0.55 ? t('Likely') : t('Worth a look')}{km !== null ? ` · ${km} km` : ''}</span><Navigation className="w-4 h-4" />
                </a>
              );
            })}
          </>
        ) : board.suggestions.length > 0 ? (
          board.suggestions.slice(0, 3).map(s => {
            const b = cellBounds(s.key, COVERAGE_CELL_M);
            return (
              <a key={s.key} href={`https://www.google.com/maps/dir/?api=1&destination=${((b.south + b.north) / 2).toFixed(5)},${((b.west + b.east) / 2).toFixed(5)}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-between min-h-[44px] px-3 rounded-xl border border-[#256abf]/30 bg-[#256abf]/5 text-xs font-bold text-[#1c5cab]">
                <span>{t('Try here')} · {s.nearbySites} {s.nearbySites === 1 ? t('site nearby') : t('sites nearby')}</span><Navigation className="w-4 h-4" />
              </a>
            );
          })
        ) : <div className="text-xs text-warmgray">{t('Record a few sites and the app will suggest where to go next.')}</div>}
        <div className="text-xs text-warmgray pt-1">{t('Area covered')}: {board.totalAreaKm2} km²</div>
      </Card>
      {(() => {
        // D-36: planned buildings in (or past) their lift window that no rider has recorded yet.
        const due = board.planned.filter(p => !p.visitedScoutId && ['WINDOW', 'LATE', 'OVERDUE'].includes(p.phase))
          .map(p => ({ p, km: here ? Math.round(distanceM(here, p) / 100) / 10 : null }))
          .sort((a, b) => (a.p.phase === 'WINDOW' ? 0 : 1) - (b.p.phase === 'WINDOW' ? 0 : 1) || (a.km ?? 0) - (b.km ?? 0))
          .slice(0, 5);
        if (!due.length) return null;
        return (
          <Card className="p-4 space-y-2">
            <div className="text-sm font-bold flex items-center gap-1"><Building2 className="w-4 h-4" style={{ color: PLANNED_COLOR }} />{t('Planned buildings due for a lift')}</div>
            <div className="text-xs text-warmgray">{t('Registered projects whose completion date says the lift shaft should be ready about now. Go and record the site.')}</div>
            {due.map(({ p, km }) => <PlannedRow key={p.id} p={p} km={km} />)}
          </Card>
        );
      })()}
      {board.revisit.length > 0 && (
        <Card className="p-4 space-y-2">
          <div className="text-sm font-bold flex items-center gap-1"><RotateCcw className="w-4 h-4 text-[#7c3aed]" />{t('Go back: may be ready now')}</div>
          <div className="text-xs text-warmgray">{t('Sales closed these as "not ready yet" over a month ago. The lift shaft may be ready now.')}</div>
          {board.revisit.map(r => (
            <a key={r.id} href={`https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between min-h-[44px] px-3 rounded-xl border border-[#7c3aed]/30 bg-[#7c3aed]/5 text-xs font-bold text-[#6d28d9]">
              <span className="truncate">{r.address}</span><Navigation className="w-4 h-4 flex-none" />
            </a>
          ))}
        </Card>
      )}
      <Card className="p-4 space-y-1">
        <div className="text-sm font-bold flex items-center gap-1"><Trophy className="w-4 h-4 text-[#B8873D]" />{t('Leaderboard this week')}</div>
        {board.week.length === 0 && <div className="text-xs text-warmgray">{t('No sites recorded this week yet.')}</div>}
        {board.week.map((r, i) => (
          <div key={r.riderId} className={`flex justify-between text-xs py-1.5 px-2 rounded-lg ${r.riderId === me ? 'bg-[#B8873D]/10 font-bold' : ''}`}>
            <span>{i + 1}. {r.name}{r.riderId === me ? ` (${t('you')})` : ''}</span>
            <span>{r.confirmed} {t('confirmed')} · {r.sightings} {t('sites')} · {r.cells} {t('squares')}</span>
          </div>
        ))}
      </Card>
    </div>
  );
};
