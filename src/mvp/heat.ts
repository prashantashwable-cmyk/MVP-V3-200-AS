/**
 * D-35 opportunity heatmap: where a rider is most likely to find the next *good* site.
 * Pure and explainable (every number on the map can be traced to sites and rides); no AI,
 * no trained model (Phase 1). Three ideas:
 *
 *  1. **Outcome, not count.** A site that became a booked order is strong evidence that the
 *     area is building; a site closed as "already has a lift" is weak evidence against.
 *     A taller building counts more (bigger lift order).
 *  2. **Yield, not footprint.** Plain "where sites were found" mostly shows where riders
 *     already rode. Each area's evidence is discounted by how often it was ridden recently —
 *     combed areas give diminishing returns; nearby unridden streets rise.
 *  3. **Time.** Construction moves on: evidence fades with a half-life. And a site Sales closed
 *     as "not ready yet" is a revisit: its lift shaft may be ready now.
 */

import type { SiteScout } from './scouting';
import { cellKey, distanceM } from './scouting';

export interface HeatSettings {
  cellM: number;
  spreadM: number;
  halfLifeDays: number;
  effortCellM: number;
  weights: {
    BOOKED: number; CONVERTED: number; NEW: number; NOT_READY_YET: number;
    ALREADY_HAS_LIFT: number; NO_LIFT_NEEDED: number; OTHER_REJECTED: number;
  };
}

export type HeatSighting = Pick<SiteScout, 'lat' | 'lng' | 'status' | 'createdAt'> &
  Partial<Pick<SiteScout, 'bookedAt' | 'rejectReason' | 'floors' | 'reviewedAt' | 'id' | 'address'>>;

/** D-36: a planned project (registered, not yet seen by a rider) and how strongly it pulls. */
export interface PlannedPoint { lat: number; lng: number; weight: number }

export interface HeatGrid {
  south: number; west: number; north: number; east: number;
  rows: number; cols: number;
  /** 0..1, row-major from the north-west corner (row 0 = north). */
  values: number[];
  cellM: number;
}

const DAY = 86_400_000;
const M_PER_DEG_LAT = 111_320;

/** How much one site says about its surroundings (can be negative). */
export function evidenceOf(s: HeatSighting, now: Date, st: HeatSettings): number {
  const w = st.weights;
  let base: number;
  if (s.bookedAt) base = w.BOOKED;
  else if (s.status === 'CONVERTED') base = w.CONVERTED;
  else if (s.status === 'NEW') base = w.NEW;
  else if (s.rejectReason === 'NOT_READY_YET') base = w.NOT_READY_YET;
  else if (s.rejectReason === 'ALREADY_HAS_LIFT') base = w.ALREADY_HAS_LIFT;
  else if (s.rejectReason === 'NO_LIFT_NEEDED') base = w.NO_LIFT_NEEDED;
  else base = w.OTHER_REJECTED;
  const size = base > 0 && s.floors ? 1 + Math.min(s.floors, 20) / 20 : 1; // G+19 counts double
  const ageDays = Math.max(0, (now.getTime() - new Date(s.bookedAt ?? s.createdAt).getTime()) / DAY);
  return base * size * 0.5 ** (ageDays / st.halfLifeDays);
}

/** Recent riding per effort square (days ridden, fading with the same half-life). */
export function effortMap(days: { day: string; cells: string[] }[], now: Date, halfLifeDays: number): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of days) {
    const age = Math.max(0, (now.getTime() - new Date(`${d.day}T12:00:00+05:30`).getTime()) / DAY);
    const f = 0.5 ** (age / halfLifeDays);
    for (const c of d.cells) m.set(c, (m.get(c) ?? 0) + f);
  }
  return m;
}

/**
 * The heat grid over the area around the sites (±2 km). Grows its cells if the area is large,
 * so it never computes more than ~6,400 cells on a phone.
 */
export function heatGrid(
  sightings: HeatSighting[], ridden: { day: string; cells: string[] }[], now: Date, st: HeatSettings, planned: PlannedPoint[] = [],
): HeatGrid | null {
  const ev = [
    ...sightings.map(s => ({ s: s as { lat: number; lng: number }, e: evidenceOf(s, now, st) })),
    // Planned projects don't fade (their date is in the future); their weight is set by the lift window.
    ...planned.map(p => ({ s: p, e: p.weight })),
  ].filter(x => Math.abs(x.e) > 0.01);
  if (!ev.some(x => x.e > 0)) return null;
  const margin = 2000;
  const lats = ev.map(x => x.s.lat);
  const lngs = ev.map(x => x.s.lng);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);
  const south = Math.min(...lats) - margin / M_PER_DEG_LAT;
  const north = Math.max(...lats) + margin / M_PER_DEG_LAT;
  const west = Math.min(...lngs) - margin / mPerDegLng;
  const east = Math.max(...lngs) + margin / mPerDegLng;
  const heightM = (north - south) * M_PER_DEG_LAT;
  const widthM = (east - west) * mPerDegLng;
  const cellM = Math.max(st.cellM, Math.ceil(Math.sqrt((heightM * widthM) / 6400)));
  const rows = Math.max(1, Math.ceil(heightM / cellM));
  const cols = Math.max(1, Math.ceil(widthM / cellM));
  const effort = effortMap(ridden, now, st.halfLifeDays);
  const two = 2 * st.spreadM * st.spreadM;
  const reach = 3 * st.spreadM;
  const raw: number[] = new Array(rows * cols).fill(0);
  for (let r = 0; r < rows; r++) {
    const lat = north - ((r + 0.5) * cellM) / M_PER_DEG_LAT;
    for (let c = 0; c < cols; c++) {
      const lng = west + ((c + 0.5) * cellM) / mPerDegLng;
      let signal = 0;
      for (const { s, e } of ev) {
        const d = distanceM({ lat, lng }, s);
        if (d <= reach) signal += e * Math.exp(-(d * d) / two);
      }
      if (signal <= 0) continue;
      // Diminishing returns where riders combed recently (each recent day ridden cuts ~25%).
      const combed = effort.get(cellKey(lat, lng, st.effortCellM)) ?? 0;
      raw[r * cols + c] = signal / (1 + 0.33 * combed);
    }
  }
  const max = Math.max(...raw);
  const values = raw.map(v => (max > 0 ? Math.round((v / max) * 1000) / 1000 : 0));
  return { south, west, north, east, rows, cols, values, cellM };
}

/** The heat value (0..1) at a point, or 0 outside the grid. */
export function heatAt(grid: HeatGrid, lat: number, lng: number): number {
  if (lat < grid.south || lat > grid.north || lng < grid.west || lng > grid.east) return 0;
  const r = Math.min(grid.rows - 1, Math.floor(((grid.north - lat) / (grid.north - grid.south)) * grid.rows));
  const c = Math.min(grid.cols - 1, Math.floor(((lng - grid.west) / (grid.east - grid.west)) * grid.cols));
  return grid.values[r * grid.cols + c];
}

/** The hottest spots, at least `apartM` apart (for the "Go here" list). */
export function hotspots(grid: HeatGrid, limit = 3, apartM = 1200): { lat: number; lng: number; value: number }[] {
  const cells = grid.values
    .map((v, i) => ({ v, r: Math.floor(i / grid.cols), c: i % grid.cols }))
    .filter(x => x.v >= 0.35)
    .sort((a, b) => b.v - a.v);
  const out: { lat: number; lng: number; value: number }[] = [];
  for (const x of cells) {
    const lat = grid.north - ((x.r + 0.5) / grid.rows) * (grid.north - grid.south);
    const lng = grid.west + ((x.c + 0.5) / grid.cols) * (grid.east - grid.west);
    if (out.every(o => distanceM(o, { lat, lng }) >= apartM)) out.push({ lat, lng, value: x.v });
    if (out.length >= limit) break;
  }
  return out;
}

export interface WhyHere {
  heat: number;
  booked: number;
  leads: number;
  waiting: number;
  notReady: number;
  noLuck: number;
  daysRiddenRecently: number;
  /** D-36: planned projects within 1.5 km that are in or near their lift window. */
  planned: number;
}

/** Plain-language reasons for the heat at one point (what the rider sees when tapping the map). */
export function whyHere(
  sightings: HeatSighting[], ridden: { day: string; cells: string[] }[], grid: HeatGrid, at: { lat: number; lng: number }, now: Date, st: HeatSettings,
  planned: PlannedPoint[] = [],
): WhyHere {
  const near = sightings.filter(s => distanceM(s, at) <= 1500);
  const effort = effortMap(ridden, now, st.halfLifeDays);
  return {
    heat: heatAt(grid, at.lat, at.lng),
    booked: near.filter(s => !!s.bookedAt).length,
    leads: near.filter(s => s.status === 'CONVERTED' && !s.bookedAt).length,
    waiting: near.filter(s => s.status === 'NEW').length,
    notReady: near.filter(s => s.status === 'REJECTED' && s.rejectReason === 'NOT_READY_YET').length,
    noLuck: near.filter(s => s.status === 'REJECTED' && s.rejectReason !== 'NOT_READY_YET').length,
    daysRiddenRecently: Math.round((effort.get(cellKey(at.lat, at.lng, st.effortCellM)) ?? 0) * 10) / 10,
    planned: planned.filter(p => p.weight >= 1 && distanceM(p, at) <= 1500).length,
  };
}

/** Sites Sales closed as "not ready yet" a while ago: go back, the lift shaft may be ready now. */
export function revisits<T extends HeatSighting>(sightings: T[], now: Date, afterDays: number): T[] {
  return sightings
    .filter(s => s.status === 'REJECTED' && s.rejectReason === 'NOT_READY_YET' &&
      now.getTime() - new Date(s.reviewedAt ?? s.createdAt).getTime() >= afterDays * DAY)
    .sort((a, b) => (a.reviewedAt ?? a.createdAt).localeCompare(b.reviewedAt ?? b.createdAt));
}

/** Blue sequential ramp (light → dark) for the heat colour, per the dataviz reference palette. */
const RAMP: [number, number, number][] = [[205, 226, 251], [134, 182, 239], [57, 135, 229], [37, 106, 191], [16, 66, 129]];

export function heatColor(v: number): [number, number, number, number] {
  if (v <= 0.05) return [0, 0, 0, 0];
  const x = Math.min(1, v) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const f = x - i;
  const [a, b] = [RAMP[i], RAMP[i + 1]];
  const alpha = Math.round(255 * Math.min(0.78, 0.18 + 0.7 * v));
  return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f), alpha];
}
