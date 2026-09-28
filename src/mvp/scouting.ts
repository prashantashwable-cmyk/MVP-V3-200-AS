/**
 * D-34 field scouting (rider on a bike finds construction sites whose lift shaft is ready).
 * Pure types and geometry; `now` is always injected. No AI, no image recognition.
 *
 * A **sighting** (`site_scouts`) is what the rider records at the roadside: GPS, the address
 * the app looks up, up to three photos (site, lift shaft, builder's board with the number) and
 * an optional phone number. It is not yet a lead: nobody at the site has agreed to be
 * contacted. Sales sees every new sighting at once, calls, and — with consent — converts it
 * into a lead (`createLead`), or marks it "not useful" with a reason.
 */

export type ScoutPhotoKind = 'SITE' | 'SHAFT' | 'BOARD';
export const SCOUT_PHOTO_KINDS: ScoutPhotoKind[] = ['SITE', 'SHAFT', 'BOARD'];

export type ScoutStatus = 'NEW' | 'CONVERTED' | 'REJECTED';

export type ScoutRejectReason = 'NO_LIFT_NEEDED' | 'ALREADY_HAS_LIFT' | 'WRONG_NUMBER' | 'DUPLICATE' | 'NOT_READY_YET' | 'OTHER';
export const SCOUT_REJECT_REASONS: ScoutRejectReason[] = ['NO_LIFT_NEEDED', 'ALREADY_HAS_LIFT', 'WRONG_NUMBER', 'DUPLICATE', 'NOT_READY_YET', 'OTHER'];

export interface ScoutPhoto {
  kind: ScoutPhotoKind;
  /** The full photo, in `documents` (readable by its uploader and Admin/Owner). */
  docId: string;
  /** A readable preview (≤ ~90 KB) kept on the sighting so Sales can read the board number. */
  previewDataUrl: string;
}

export interface SiteScout {
  id: string;
  scoutedBy: string;
  scoutedByName: string;
  lat: number;
  lng: number;
  accuracyM?: number;
  address: string;
  phone?: string;
  notes?: string;
  floors?: number;
  photos: ScoutPhoto[];
  status: ScoutStatus;
  leadId?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectReason?: ScoutRejectReason;
  rejectNote?: string;
  /** D-34: set when the lead from this sighting became a booked order (booking bonus). */
  bookedAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

const EARTH_M = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function validLatLng(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

/** Sightings recorded near this spot recently — shown before saving, so a site isn't counted twice. */
export function nearbySightings<T extends Pick<SiteScout, 'lat' | 'lng' | 'createdAt' | 'status'>>(
  list: T[], at: { lat: number; lng: number }, now: Date, radiusM: number, withinDays: number,
): (T & { distanceM: number })[] {
  const since = now.getTime() - withinDays * 86_400_000;
  return list
    .filter(s => s.status !== 'REJECTED' && new Date(s.createdAt).getTime() >= since)
    .map(s => ({ ...s, distanceM: Math.round(distanceM(s, at)) }))
    .filter(s => s.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM);
}

// ---------------------------------------------------------------------------
// D-34 part 2: route, area covered, where next, commission, leaderboard (all pure)
// ---------------------------------------------------------------------------

export interface RoutePoint { lat: number; lng: number; t: string }

/** Kilometres ridden: ignores GPS jitter (< 15 m) and impossible jumps (> 3 km between fixes). */
export function routeKm(points: Pick<RoutePoint, 'lat' | 'lng'>[]): number {
  let m = 0;
  for (let i = 1; i < points.length; i++) {
    const d = distanceM(points[i - 1], points[i]);
    if (d >= 15 && d <= 3000) m += d;
  }
  return Math.round(m / 100) / 10;
}

/** The city as squares about `cellM` wide: a stable key per square. */
export function cellKey(lat: number, lng: number, cellM: number): string {
  const dLat = cellM / 111_320;
  const i = Math.floor(lat / dLat);
  const dLng = cellM / (111_320 * Math.cos(((i + 0.5) * dLat * Math.PI) / 180));
  return `${i}:${Math.floor(lng / dLng)}`;
}

export function cellBounds(key: string, cellM: number): { south: number; west: number; north: number; east: number } {
  const [i, j] = key.split(':').map(Number);
  const dLat = cellM / 111_320;
  const dLng = cellM / (111_320 * Math.cos(((i + 0.5) * dLat * Math.PI) / 180));
  return { south: i * dLat, north: (i + 1) * dLat, west: j * dLng, east: (j + 1) * dLng };
}

export function cellsOf(points: Pick<RoutePoint, 'lat' | 'lng'>[], cellM: number): string[] {
  return [...new Set(points.map(p => cellKey(p.lat, p.lng, cellM)))];
}

/** Squares next to a square (the 8 around it). */
function neighbours(key: string): string[] {
  const [i, j] = key.split(':').map(Number);
  const out: string[] = [];
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (a || b) out.push(`${i + a}:${j + b}`);
  return out;
}

export interface WhereNext { key: string; score: number; nearbySites: number }

/**
 * Rule-based "where to find more leads" (no AI): building activity clusters, so squares next
 * to squares where sites were found (confirmed ones count double) are promising — unless
 * someone covered them in the last `freshDays` days. Best first.
 */
export function whereNext(
  sightings: Pick<SiteScout, 'lat' | 'lng' | 'status' | 'createdAt'>[],
  coveredCellsByDay: { day: string; cells: string[] }[],
  now: Date, cellM: number, freshDays: number, limit = 5,
): WhereNext[] {
  const since = now.getTime() - freshDays * 86_400_000;
  const fresh = new Set(coveredCellsByDay.filter(d => new Date(`${d.day}T23:59:59+05:30`).getTime() >= since).flatMap(d => d.cells));
  const siteCells = new Map<string, number>();
  for (const s of sightings) {
    if (s.status === 'REJECTED') continue;
    const k = cellKey(s.lat, s.lng, cellM);
    siteCells.set(k, (siteCells.get(k) ?? 0) + (s.status === 'CONVERTED' ? 2 : 1));
  }
  for (const k of siteCells.keys()) fresh.add(k); // a square with a site in it has been visited
  const score = new Map<string, number>();
  for (const [k, w] of siteCells) for (const n of neighbours(k)) if (!fresh.has(n)) score.set(n, (score.get(n) ?? 0) + w);
  return [...score.entries()]
    .map(([key, sc]) => ({ key, score: sc, nearbySites: neighbours(key).reduce((a, n) => a + (siteCells.has(n) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .slice(0, limit);
}

export interface Earnings { confirmed: number; booked: number; pending: number; amount: number }

/** Commission for sightings in a period: confirmed (Sales made it a lead) + booked bonus. */
export function earningsFor(
  mine: Pick<SiteScout, 'status' | 'reviewedAt' | 'bookedAt' | 'createdAt'>[], from: Date, to: Date, perConfirmed: number, perBooking: number,
): Earnings {
  const inRange = (iso?: string) => !!iso && new Date(iso) >= from && new Date(iso) < to;
  const confirmed = mine.filter(s => s.status === 'CONVERTED' && inRange(s.reviewedAt)).length;
  const booked = mine.filter(s => inRange(s.bookedAt)).length;
  const pending = mine.filter(s => s.status === 'NEW').length;
  return { confirmed, booked, pending, amount: confirmed * perConfirmed + booked * perBooking };
}

export interface LeaderRow { riderId: string; name: string; confirmed: number; sightings: number; cells: number; km: number }

/** Weekly ranking (Owner-approved, D-34): confirmed sites first, then sightings, then area covered. */
export function leaderboard(
  sightings: Pick<SiteScout, 'scoutedBy' | 'scoutedByName' | 'status' | 'reviewedAt' | 'createdAt'>[],
  stats: { riderId: string; riderName: string; day: string; km: number; cells: string[] }[],
  from: Date, to: Date,
): LeaderRow[] {
  const inRange = (iso?: string) => !!iso && new Date(iso) >= from && new Date(iso) < to;
  const rows = new Map<string, LeaderRow & { cellSet: Set<string> }>();
  const row = (id: string, name: string) => {
    if (!rows.has(id)) rows.set(id, { riderId: id, name, confirmed: 0, sightings: 0, cells: 0, km: 0, cellSet: new Set() });
    return rows.get(id)!;
  };
  for (const s of sightings) {
    if (inRange(s.createdAt)) row(s.scoutedBy, s.scoutedByName).sightings++;
    if (s.status === 'CONVERTED' && inRange(s.reviewedAt)) row(s.scoutedBy, s.scoutedByName).confirmed++;
  }
  for (const d of stats) {
    if (!inRange(`${d.day}T12:00:00+05:30`)) continue;
    const r = row(d.riderId, d.riderName);
    r.km = Math.round((r.km + d.km) * 10) / 10;
    d.cells.forEach(c => r.cellSet.add(c));
  }
  return [...rows.values()]
    .map(({ cellSet, ...r }) => ({ ...r, cells: cellSet.size }))
    .sort((a, b) => b.confirmed - a.confirmed || b.sightings - a.sightings || b.cells - a.cells || a.name.localeCompare(b.name));
}

/** Monday 00:00 IST of the week containing `now`, and the next Monday. */
export function weekOf(now: Date): { from: Date; to: Date } {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  const dow = (ist.getUTCDay() + 6) % 7;
  const mondayIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - dow) - 5.5 * 3_600_000;
  return { from: new Date(mondayIst), to: new Date(mondayIst + 7 * 86_400_000) };
}

/** The first of this month 00:00 IST, and of the next month. */
export function monthOf(now: Date): { from: Date; to: Date } {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  const from = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 5.5 * 3_600_000;
  const to = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + 1, 1) - 5.5 * 3_600_000;
  return { from: new Date(from), to: new Date(to) };
}
