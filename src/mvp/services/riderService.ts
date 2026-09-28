/**
 * D-34 part 2: the rider's day — route while "On duty" (only while the app is open; never in
 * the background), area covered, where to go next, commission and the weekly leaderboard.
 * Two small collections: `rider_routes/{uid}_{day}` (the GPS points: the rider and
 * Admin/Owner only) and `rider_stats/{uid}_{day}` (km and squares covered: shared with Sales
 * for the leaderboard, no points). All maths is pure, in src/mvp/scouting.ts.
 */

import { getRepository } from '../../repository';
import type { MvpActor, MvpCtx } from './orderService';
import { MvpError, nowOf } from './orderService';
import { scoutRepository } from './scoutService';
import {
  cellsOf, cellKey, earningsFor, leaderboard, monthOf, routeKm, weekOf, whereNext,
  type Earnings, type LeaderRow, type RoutePoint, type WhereNext,
} from '../scouting';
import { dayKeyOf } from '../followUp';
import {
  COMMISSION_ON_BOOKING_INR, COMMISSION_PER_CONFIRMED_INR, COVERAGE_CELL_M, WHERE_NEXT_FRESH_DAYS,
  HEAT_CELL_M, HEAT_HALF_LIFE_DAYS, HEAT_SPREAD_M, HEAT_WEIGHTS, REVISIT_AFTER_DAYS,
} from '../config';
import { heatGrid, hotspots, revisits, type HeatGrid, type HeatSettings, type HeatSighting } from '../heat';

export const HEAT_SETTINGS: HeatSettings = {
  cellM: HEAT_CELL_M, spreadM: HEAT_SPREAD_M, halfLifeDays: HEAT_HALF_LIFE_DAYS, effortCellM: COVERAGE_CELL_M, weights: HEAT_WEIGHTS,
};

export interface RiderRoute {
  id: string;
  riderId: string;
  day: string;
  points: RoutePoint[];
  onDuty: boolean;
  startedAt: string;
  endedAt?: string;
  updatedAt: string;
  version: number;
}

export interface RiderDayStats {
  id: string;
  riderId: string;
  riderName: string;
  day: string;
  km: number;
  cells: string[];
  updatedAt: string;
  version: number;
}

const routeRepository = (ctx: MvpCtx) => getRepository<RiderRoute>('rider_routes', ctx);
const statsRepository = (ctx: MvpCtx) => getRepository<RiderDayStats>('rider_stats', ctx);
const isRider = (a: MvpActor) => a.role === 'sales' || a.role === 'admin';
const MAX_POINTS_PER_DAY = 2000; // ~14 h at one point every 25 m of movement; keeps the document small

async function saveDay(ctx: MvpCtx, actor: MvpActor, route: RiderRoute): Promise<RiderDayStats> {
  const today = await scoutRepository(ctx).query({ scoutedBy: actor.userId } as any);
  const siteCells = today.filter(s => dayKeyOf(new Date(s.createdAt)) === route.day).map(s => cellKey(s.lat, s.lng, COVERAGE_CELL_M));
  const cells = [...new Set([...cellsOf(route.points, COVERAGE_CELL_M), ...siteCells])];
  const id = route.id;
  const existing = await statsRepository(ctx).get(id);
  const stats: RiderDayStats = {
    id, riderId: actor.userId, riderName: actor.name, day: route.day, km: routeKm(route.points), cells,
    updatedAt: nowOf(ctx).toISOString(), version: existing ? existing.version + 1 : 0,
  };
  if (existing) return statsRepository(ctx).update(id, { km: stats.km, cells, riderName: actor.name, updatedAt: stats.updatedAt }, existing.version);
  return statsRepository(ctx).create(stats);
}

/** "Start day": opens (or resumes) today's route. */
export async function startDuty(ctx: MvpCtx, actor: MvpActor): Promise<RiderRoute> {
  if (!isRider(actor)) throw new MvpError('forbidden', 'Only riders can go on duty.');
  const day = dayKeyOf(nowOf(ctx));
  const id = `${actor.userId}_${day}`;
  const now = nowOf(ctx).toISOString();
  const existing = await routeRepository(ctx).get(id);
  if (existing) return existing.onDuty ? existing : routeRepository(ctx).update(id, { onDuty: true, updatedAt: now }, existing.version);
  return routeRepository(ctx).create({ id, riderId: actor.userId, day, points: [], onDuty: true, startedAt: now, updatedAt: now, version: 0 });
}

/** Saves the points collected since the last save (every few minutes while on duty). */
export async function saveRoutePoints(ctx: MvpCtx, actor: MvpActor, points: RoutePoint[], end = false): Promise<{ route: RiderRoute; stats: RiderDayStats }> {
  const day = dayKeyOf(nowOf(ctx));
  const id = `${actor.userId}_${day}`;
  let route = await routeRepository(ctx).get(id);
  if (!route) route = await startDuty(ctx, actor);
  const seen = new Set(route.points.map(p => p.t));
  const fresh = points
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && !seen.has(p.t))
    .map(p => ({ lat: Math.round(p.lat * 1e5) / 1e5, lng: Math.round(p.lng * 1e5) / 1e5, t: p.t }));
  const all = [...route.points, ...fresh].sort((a, b) => a.t.localeCompare(b.t)).slice(-MAX_POINTS_PER_DAY);
  const now = nowOf(ctx).toISOString();
  route = await routeRepository(ctx).update(id, {
    points: all, updatedAt: now, ...(end ? { onDuty: false, endedAt: now } : {}),
  }, route.version);
  return { route, stats: await saveDay(ctx, actor, route) };
}

export async function getMyRouteToday(ctx: MvpCtx, actor: MvpActor): Promise<RiderRoute | null> {
  return routeRepository(ctx).get(`${actor.userId}_${dayKeyOf(nowOf(ctx))}`);
}

export interface RiderBoard {
  today: { km: number; cells: number; sightings: number };
  totalAreaKm2: number;
  coveredCells: string[];
  suggestions: WhereNext[];
  earnings: Earnings;
  week: LeaderRow[];
  /** D-35 opportunity heatmap and the data behind "why here" (all riders' sites and rides). */
  heat: HeatGrid | null;
  hot: { lat: number; lng: number; value: number }[];
  revisit: HeatSighting[];
  heatSightings: HeatSighting[];
  ridden: { day: string; cells: string[] }[];
}

/** Everything the rider's screen shows about their progress. */
export async function buildRiderBoard(ctx: MvpCtx, actor: MvpActor): Promise<RiderBoard> {
  const now = nowOf(ctx);
  const [sightings, stats] = await Promise.all([scoutRepository(ctx).list(), statsRepository(ctx).list()]);
  const mine = sightings.filter(s => s.scoutedBy === actor.userId);
  const myStats = stats.filter(s => s.riderId === actor.userId);
  const day = dayKeyOf(now);
  const todayStats = myStats.find(s => s.day === day);
  const coveredCells = [...new Set([...myStats.flatMap(s => s.cells), ...mine.map(s => cellKey(s.lat, s.lng, COVERAGE_CELL_M))])];
  const cellKm2 = (COVERAGE_CELL_M / 1000) ** 2;
  const slim: HeatSighting[] = sightings.map(s => ({
    id: s.id, lat: s.lat, lng: s.lng, status: s.status, createdAt: s.createdAt, bookedAt: s.bookedAt,
    rejectReason: s.rejectReason, floors: s.floors, reviewedAt: s.reviewedAt, address: s.address,
  }));
  const ridden = stats.map(s => ({ day: s.day, cells: s.cells }));
  const heat = heatGrid(slim, ridden, now, HEAT_SETTINGS);
  const month = monthOf(now);
  const week = weekOf(now);
  return {
    today: { km: todayStats?.km ?? 0, cells: todayStats?.cells.length ?? 0, sightings: mine.filter(s => dayKeyOf(new Date(s.createdAt)) === day).length },
    totalAreaKm2: Math.round(coveredCells.length * cellKm2 * 100) / 100,
    coveredCells,
    // Squares covered by any rider recently are not suggested (no two riders on the same streets).
    suggestions: whereNext(sightings, stats.map(s => ({ day: s.day, cells: s.cells })), now, COVERAGE_CELL_M, WHERE_NEXT_FRESH_DAYS),
    earnings: earningsFor(mine, month.from, month.to, COMMISSION_PER_CONFIRMED_INR, COMMISSION_ON_BOOKING_INR),
    week: leaderboard(sightings, stats, week.from, week.to),
    heat, hot: heat ? hotspots(heat) : [],
    revisit: revisits(slim, now, REVISIT_AFTER_DAYS).slice(0, 5),
    heatSightings: slim,
    ridden,
  };
}

export interface CommissionRow extends Earnings { riderId: string; name: string }

/** The Admin's monthly commission sheet (Owner/Admin only). */
export async function riderCommissionTable(ctx: MvpCtx, actor: MvpActor, at?: Date): Promise<{ month: string; rows: CommissionRow[] }> {
  if (actor.role !== 'admin' && actor.role !== 'owner') throw new MvpError('forbidden', 'Only the Admin and the Owner see the commission sheet.');
  const now = at ?? nowOf(ctx);
  const { from, to } = monthOf(now);
  const sightings = await scoutRepository(ctx).list();
  const byRider = new Map<string, { name: string; list: typeof sightings }>();
  for (const s of sightings) {
    if (!byRider.has(s.scoutedBy)) byRider.set(s.scoutedBy, { name: s.scoutedByName, list: [] });
    byRider.get(s.scoutedBy)!.list.push(s);
  }
  const rows = [...byRider.entries()]
    .map(([riderId, v]) => ({ riderId, name: v.name, ...earningsFor(v.list, from, to, COMMISSION_PER_CONFIRMED_INR, COMMISSION_ON_BOOKING_INR) }))
    .filter(r => r.amount > 0 || r.pending > 0)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  return { month: dayKeyOf(from).slice(0, 7), rows };
}
