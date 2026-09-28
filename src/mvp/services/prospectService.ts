/**
 * D-36 planned projects (`site_prospects`): the Admin pastes a list of registered projects;
 * riders see where and *when* to go. Canonical Firestore repository; the Admin imports and
 * dismisses, Sales / Owner read. Re-importing the same list is safe (matched by registration
 * number, else by name and place) and always previewed first (dry run).
 * Why not reuse site_scouts: a sighting is something a rider saw (photos, commission); a
 * planned project is a paper record nobody has visited yet.
 */

import { getRepository } from '../../repository';
import { recordAuditEvent, newCorrelationId } from '../../lib/audit';
import type { MvpActor, MvpCtx } from './orderService';
import { MvpError, nowOf } from './orderService';
import { scoutRepository } from './scoutService';
import { validLatLng } from '../scouting';
import { liftPhase, PHASE_ORDER, PHASE_WEIGHT, sameProject, visitedBy, type LiftPhase, type ProspectRow, type SiteProspect } from '../prospects';
import type { PlannedPoint } from '../heat';
import { LIFT_WINDOW_FROM_MONTHS, LIFT_WINDOW_TO_MONTHS, PROSPECT_MATCH_RADIUS_M } from '../config';

export const prospectRepository = (ctx: MvpCtx) => getRepository<SiteProspect>('site_prospects', ctx);

const MAX_IMPORT_ROWS = 500;

export interface ImportResult {
  added: SiteProspect[];
  updated: SiteProspect[];
  unchanged: number;
  /** Rows that still have no location (fix the address, or add latitude/longitude). */
  noLocation: ProspectRow[];
}

const FIELDS = ['name', 'regNo', 'promoter', 'address', 'pincode', 'completion', 'floors'] as const;

/**
 * Saves the rows (each must have a location by now). `dryRun` returns what *would* happen
 * without writing anything — the screen shows it before the Admin confirms.
 */
export async function importProspects(
  ctx: MvpCtx, actor: MvpActor, rows: ProspectRow[], opts: { source: string; dryRun: boolean },
): Promise<ImportResult> {
  if (actor.role !== 'admin') throw new MvpError('forbidden', 'Only the Admin can import planned projects.');
  if (rows.length > MAX_IMPORT_ROWS) throw new MvpError('invalid', `At most ${MAX_IMPORT_ROWS} projects at a time. Split the list.`);
  const source = opts.source.trim() || 'Imported list';
  const existing = await prospectRepository(ctx).list();
  const now = nowOf(ctx).toISOString();
  const result: ImportResult = { added: [], updated: [], unchanged: 0, noLocation: [] };
  const seen = new Set<string>();
  for (const r of rows) {
    if (!validLatLng(r.lat, r.lng)) { result.noLocation.push(r); continue; }
    const at = { ...r, lat: r.lat!, lng: r.lng! };
    const match = existing.find(p => sameProject(at, p, PROSPECT_MATCH_RADIUS_M));
    if (match) {
      if (seen.has(match.id)) { result.unchanged++; continue; } // listed twice in the same paste
      seen.add(match.id);
      const patch: Partial<SiteProspect> = {};
      for (const f of FIELDS) if (r[f] !== undefined && r[f] !== match[f]) (patch as any)[f] = r[f];
      if (!Object.keys(patch).length) { result.unchanged++; continue; }
      const next = { ...match, ...patch, updatedAt: now };
      result.updated.push(opts.dryRun ? next : await prospectRepository(ctx).update(match.id, { ...patch, updatedAt: now }, match.version));
      continue;
    }
    const id = `prj_${(r.regNo ?? '').replace(/[^A-Z0-9]/g, '') || `${Date.parse(now).toString(36)}_${Math.random().toString(36).slice(2, 6)}`}`;
    const p: SiteProspect = {
      id, name: r.name, address: r.address || `${at.lat.toFixed(5)}, ${at.lng.toFixed(5)}`, lat: at.lat, lng: at.lng,
      source, status: 'OPEN', importedBy: actor.userId, createdAt: now, updatedAt: now, version: 0,
    };
    for (const f of ['regNo', 'promoter', 'pincode', 'completion', 'floors'] as const) if (r[f] !== undefined) (p as any)[f] = r[f];
    existing.push(p); // a later duplicate row in the same list matches this one
    seen.add(id);
    result.added.push(opts.dryRun ? p : await prospectRepository(ctx).create(p));
  }
  if (!opts.dryRun && (result.added.length || result.updated.length)) {
    await recordAuditEvent(ctx, {
      actorId: actor.userId, actorRole: actor.role, action: 'PROSPECTS_IMPORTED', entityType: 'SiteProspect', entityId: source,
      after: { added: result.added.length, updated: result.updated.length } as any, source: 'ui', correlationId: newCorrelationId(),
    });
  }
  return result;
}

/** Not worth a visit (built already, cancelled, not a lift building): hidden from riders. */
export async function dismissProspect(ctx: MvpCtx, actor: MvpActor, id: string, reason: string): Promise<SiteProspect> {
  if (actor.role !== 'admin') throw new MvpError('forbidden', 'Only the Admin can remove a planned project.');
  if (!reason.trim()) throw new MvpError('invalid', 'Write why this project is not worth a visit.');
  const p = await prospectRepository(ctx).get(id);
  if (!p) throw new MvpError('not_found', 'Planned project not found.');
  const updated = await prospectRepository(ctx).update(id, { status: 'DISMISSED', dismissReason: reason.trim(), updatedAt: nowOf(ctx).toISOString() }, p.version);
  await recordAuditEvent(ctx, {
    actorId: actor.userId, actorRole: actor.role, action: 'PROSPECT_DISMISSED', entityType: 'SiteProspect', entityId: id,
    before: { status: p.status } as any, after: { status: 'DISMISSED' } as any, reason: reason.trim(), source: 'ui', correlationId: newCorrelationId(),
  });
  return updated;
}

export interface ProspectView extends SiteProspect {
  phase: LiftPhase;
  monthsToCompletion: number | null;
  /** A rider recorded a site here since the project was added (its sighting id). */
  visitedScoutId?: string;
}

/** Open planned projects with their lift window, most useful first (window now → later). */
export function viewProspects(prospects: SiteProspect[], sightings: { id: string; lat: number; lng: number; createdAt: string }[], now: Date): ProspectView[] {
  return prospects
    .filter(p => p.status === 'OPEN')
    .map(p => {
      const { phase, months } = liftPhase(p.completion, now, LIFT_WINDOW_FROM_MONTHS, LIFT_WINDOW_TO_MONTHS);
      return { ...p, phase, monthsToCompletion: months, visitedScoutId: visitedBy(p, sightings, PROSPECT_MATCH_RADIUS_M)?.id };
    })
    .sort((a, b) => Number(!!a.visitedScoutId) - Number(!!b.visitedScoutId) || PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] ||
      (a.monthsToCompletion ?? 99) - (b.monthsToCompletion ?? 99) || a.name.localeCompare(b.name));
}

/** Unvisited projects as heat: a rider's own finding there replaces the paper record. */
export function plannedHeat(views: ProspectView[]): PlannedPoint[] {
  return views.filter(v => !v.visitedScoutId).map(v => ({ lat: v.lat, lng: v.lng, weight: PHASE_WEIGHT[v.phase] * (v.floors ? 1 + Math.min(v.floors, 20) / 20 : 1) }));
}

export async function listProspects(ctx: MvpCtx, actor: MvpActor): Promise<ProspectView[]> {
  if (!['sales', 'admin', 'owner'].includes(actor.role)) throw new MvpError('forbidden', 'Only Sales, Admin and Owner see planned projects.');
  const [prospects, sightings] = await Promise.all([prospectRepository(ctx).list(), scoutRepository(ctx).list()]);
  return viewProspects(prospects, sightings, nowOf(ctx));
}
