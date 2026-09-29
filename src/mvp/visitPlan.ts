/**
 * D-37 Sales day plan: open leads on a map by urgency, and today's site visits in a sensible
 * riding order. Pure; `now` injected. The order is "nearest next stop" from where the
 * salesperson is (plus one clean-up pass that removes crossings) — simple and predictable,
 * not an optimiser, no ML (Phase 1).
 */

import { distanceM } from './scouting';
import { leadStatus, type MvpLead } from './leadModel';
import { dayKeyOf } from './followUp';
import { MY_DAY_SOON_HOURS } from './config';

export type LeadUrgency = 'OVERDUE' | 'TODAY' | 'SOON' | 'LATER' | 'NONE';

const OPEN = ['NEW', 'CONTACTED', 'QUALIFIED', 'SURVEY', 'QUOTE'];
const istDay = dayKeyOf; // calendar day in the company's time zone (config TIME_ZONE)

export function isOpenLead(l: Pick<MvpLead, 'mvpStatus' | 'stage'>): boolean {
  return OPEN.includes(leadStatus(l));
}

/** How urgent the lead's next follow-up is (calendar days in IST). */
export function urgencyOf(l: Pick<MvpLead, 'nextFollowUp'>, now: Date, soonDays = MY_DAY_SOON_HOURS / 24): LeadUrgency {
  if (!l.nextFollowUp) return 'NONE';
  const due = new Date(l.nextFollowUp);
  if (Number.isNaN(due.getTime())) return 'NONE';
  const today = istDay(now);
  const day = istDay(due);
  if (day < today) return 'OVERDUE';
  if (day === today) return 'TODAY';
  const soon = istDay(new Date(now.getTime() + soonDays * 86_400_000));
  return day <= soon ? 'SOON' : 'LATER';
}

export function locationOf(l: Pick<MvpLead, 'buildingInfo'>): { lat: number; lng: number } | null {
  const lat = l.buildingInfo?.latitude;
  const lng = l.buildingInfo?.longitude;
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) ? { lat, lng } : null;
}

export interface Stop { id: string; lat: number; lng: number }

const pathM = (start: { lat: number; lng: number } | null, stops: Stop[]) =>
  stops.reduce((sum, s, i) => sum + distanceM(i === 0 ? (start ?? s) : stops[i - 1], s), 0);

/**
 * Visiting order: nearest next stop from `start` (or from the first stop when the location is
 * unknown), then a 2-opt pass (reverse any stretch that shortens the ride).
 */
export function planVisits<T extends Stop>(start: { lat: number; lng: number } | null, stops: T[]): { order: T[]; km: number; legsKm: number[] } {
  const left = [...stops];
  const order: T[] = [];
  let at = start ?? left[0];
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (distanceM(at, left[i]) < distanceM(at, left[best])) best = i;
    at = left.splice(best, 1)[0];
    order.push(at as T);
  }
  let improved = true;
  for (let pass = 0; improved && pass < 20; pass++) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const next = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        if (pathM(start, next) + 1 < pathM(start, order)) { order.splice(0, order.length, ...next); improved = true; }
      }
    }
  }
  const legsKm = order.map((s, i) => Math.round(distanceM(i === 0 ? (start ?? s) : order[i - 1], s) / 100) / 10);
  return { order, km: Math.round(legsKm.reduce((a, b) => a + b, 0) * 10) / 10, legsKm };
}

/**
 * Google Maps directions for the whole plan, split into links of at most 4 stops each
 * (mobile browsers accept only 3 waypoints per link). Each link starts where the last ended.
 */
export function directionsLinks(start: { lat: number; lng: number } | null, order: Stop[], perLink = 4): string[] {
  const p = (s: { lat: number; lng: number }) => `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`;
  const links: string[] = [];
  let from = start;
  for (let i = 0; i < order.length; i += perLink) {
    const part = order.slice(i, i + perLink);
    const dest = part[part.length - 1];
    const via = part.slice(0, -1);
    links.push(`https://www.google.com/maps/dir/?api=1${from ? `&origin=${p(from)}` : ''}&destination=${p(dest)}` +
      `${via.length ? `&waypoints=${encodeURIComponent(via.map(p).join('|'))}` : ''}&travelmode=driving`);
    from = dest;
  }
  return links;
}
