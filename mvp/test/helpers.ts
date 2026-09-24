import { openDb } from '../server/db';
import type { DB } from '../server/db';
import { seedIfEmpty, DEMO_SITES } from '../server/seed';
import { Engine, SYSTEM } from '../server/workflow/engine';
import type { Actor, EngineOptions, WorkItemRow } from '../server/workflow/engine';
import { demoEvidence } from '../server/demo';
import type { EvidenceVariant } from '../server/demo';

export const T0 = Date.UTC(2026, 8, 1, 4, 30); // 1 Sep 2026, 10:00 IST
export const MIN = 60_000;
export const HOUR = 60 * MIN;

export class ManualClock {
  t = T0;
  now = () => this.t;
  advance(ms: number) { this.t += ms; }
}

export function setup(opts: EngineOptions & { path?: string; clock?: ManualClock } = {}) {
  const clock = opts.clock ?? new ManualClock();
  const db: DB = openDb(opts.path ?? ':memory:');
  seedIfEmpty(db, clock.t);
  const engine = new Engine(db, { baseNow: clock.now, ...opts });
  return { db, engine, clock };
}

export const ADMIN: Actor = { id: 'admin', role: 'admin', name: 'Prashant Wable' };

export function actorFor(engine: Engine, userId: string): Actor {
  const u = engine.user(userId)!;
  return { id: u.id, role: u.role, name: u.name };
}

export function newProject(engine: Engine, siteIndex = 0, overrides: Record<string, unknown> = {}) {
  return engine.createLead(ADMIN, { ...DEMO_SITES[siteIndex], ...overrides } as any);
}

export function current(engine: Engine, projectId: string): WorkItemRow {
  const w = engine.currentItem(projectId);
  if (!w) throw new Error(`no current work item for ${projectId} (state ${engine.project(projectId).state})`);
  return w;
}

export function ownerOf(engine: Engine, w: WorkItemRow): Actor {
  if (!w.assigned_user_id) throw new Error(`${w.id} has no owner`);
  return actorFor(engine, w.assigned_user_id);
}

/** Do the current work item exactly as a well-behaved owner would. */
export async function doCurrent(engine: Engine, projectId: string, variant: EvidenceVariant = {}): Promise<WorkItemRow> {
  const w = current(engine, projectId);
  const def = engine.def(w.type);
  const actor = ownerOf(engine, w);
  if (w.status === 'ASSIGNED') engine.acceptTask(actor, w.id);
  if (def.completion === 'decision') {
    engine.decideQuote(actor, w.id, true);
  } else if (def.completion === 'payment') {
    const r = await engine.pay(actor, w.id, { cardNumber: '4111111111111111' });
    if (!r.ok) throw new Error(`payment failed: ${r.reason}`);
  } else {
    for (const ev of demoEvidence(def, engine.project(projectId), engine.now(), variant)) engine.addEvidence(actor, w.id, ev);
    const r = engine.submitTask(actor, w.id);
    if (r.outcome !== 'PASS') throw new Error(`${w.type} submit ${r.outcome}: ${(r.missing ?? r.validation?.reasons ?? []).join('; ')}`);
  }
  return engine.item(w.id);
}

export async function runUntil(engine: Engine, projectId: string, state: string, max = 30): Promise<void> {
  for (let i = 0; i < max && engine.project(projectId).state !== state; i++) await doCurrent(engine, projectId);
  if (engine.project(projectId).state !== state) throw new Error(`did not reach ${state}; at ${engine.project(projectId).state}`);
}

export function events(engine: Engine, projectId?: string): any[] {
  return (projectId
    ? engine.db.prepare('SELECT * FROM events WHERE project_id = ? ORDER BY seq').all(projectId)
    : engine.db.prepare('SELECT * FROM events ORDER BY seq').all()) as any[];
}

export { SYSTEM };
