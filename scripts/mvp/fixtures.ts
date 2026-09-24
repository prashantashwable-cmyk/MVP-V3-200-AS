/**
 * Shared fixtures for MVP checks (docs/mvp/ACCEPTANCE_SCENARIOS.md). Demo repository only —
 * nothing here can reach Firestore (D-19). The clock is injectable so scenarios can
 * "move time forward" without waiting.
 */
import '../polyfillBrowserGlobals';
import type { MvpActor, MvpCtx } from '../../src/mvp/services/orderService';
import { listOrderTasks, listOpenBlockers } from '../../src/mvp/services/orderService';
import { projectRepository } from '../../src/repository/entities';
import { listAuditEventsForEntity } from '../../src/lib/audit';
import { isOpenTask, currentTask } from '../../src/mvp/health';
import { toMvpStage, stageIndex } from '../../src/mvp/stage';

let failures = 0;

export function check(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`OK: ${msg}`);
}

export function done(name: string): void {
  if (failures === 0 && !process.exitCode) console.log(`\nPASS: ${name}`);
}

/** A controllable clock. Starts at a fixed instant so due dates are reproducible. */
export class Clock {
  constructor(private t = new Date('2026-10-01T04:30:00.000Z')) {}
  now = (): Date => new Date(this.t.getTime());
  advanceDays(days: number): void { this.t = new Date(this.t.getTime() + days * 86_400_000); }
  advanceMinutes(minutes: number): void { this.t = new Date(this.t.getTime() + minutes * 60_000); }
}

export function demoCtx(clock: Clock, actor: MvpActor): MvpCtx {
  return { environment: 'demo', actorUserId: actor.userId, now: clock.now };
}

export const USERS = {
  admin: { userId: 'u_admin', role: 'admin', name: 'Admin One', authMethod: 'firebase_auth' },
  owner: { userId: 'u_owner', role: 'owner', name: 'Owner Test' },
  sales: { userId: 'u_sales', role: 'sales', name: 'Sales Sameer' },
  surveyor: { userId: 'u_surveyor', role: 'surveyor', name: 'Surveyor Suresh' },
  tech1: { userId: 'u_tech1', role: 'technician', name: 'Technician Rahul' },
  tech2: { userId: 'u_tech2', role: 'technician', name: 'Technician Vikas' },
  qc: { userId: 'u_qc', role: 'qc', name: 'QC Meera' },
} satisfies Record<string, MvpActor>;

export function customerActor(customerId: string): MvpActor {
  return { userId: 'u_cust', role: 'customer', name: 'ABC Builders', customerId };
}

export const FIXTURE_LEAD = {
  name: 'ABC Builders (Mr. Kulkarni)',
  phone: '+91 98765 43210',
  location: 'Baner, Pune',
  source: 'Referral',
  siteType: 'commercial' as const,
  floors: 8,
  liftRequirement: 'G+7 passenger lift, 8 stops, 8 persons',
  constructionStage: 'structure-up' as const,
  notes: 'Structure complete',
  consent: true,
};

export const FIXTURE_SURVEY = {
  floors: 8, stops: 8, capacityPersons: 8,
  shaftWidthMm: 1800, shaftDepthMm: 1900, pitMm: 1500, headroomMm: 4200,
  power: '3-phase available', access: 'Truck access from main road', siteReadiness: 'Structure complete',
  remarks: 'Standard shaft', photoIds: ['doc_fixture_1', 'doc_fixture_2'], result: 'FEASIBLE' as const,
};

/** Tracks stage history per order so I-4 can be asserted across steps. */
const stageHistory = new Map<string, number>();

/** I-1..I-4 (ACCEPTANCE_SCENARIOS "Invariants"). I-5/I-6 are checked where they apply. */
export async function assertInvariants(ctx: MvpCtx, orderId: string, label: string, opts: { allowStageBack?: boolean } = {}): Promise<void> {
  const order = await projectRepository(ctx).get(orderId);
  check(order, `${label}: order exists`);
  const tasks = await listOrderTasks(ctx, orderId);
  const open = tasks.filter(isOpenTask);
  if ((order!.status ?? 'ACTIVE') === 'ACTIVE') {
    const cur = currentTask(open, toMvpStage(order!.stage));
    check(!!cur && !!cur.assigneeId && !!cur.dueDate, `${label}: I-1 active order has a current task with assignee and due date`);
  }
  const types = open.map(t => t.type);
  check(new Set(types).size === types.length, `${label}: I-2 no two open tasks of the same type (${types.join(', ')})`);
  const stageEvents = (await listAuditEventsForEntity(ctx, 'Project', orderId)).filter(e => e.action === 'ORDER_STAGE_CHANGED' || e.action === 'ORDER_STAGE_OVERRIDE');
  const idx = stageIndex(toMvpStage(order!.stage));
  const prev = stageHistory.get(orderId);
  if (prev !== undefined && idx !== prev) {
    check(stageEvents.length > 0, `${label}: I-3 stage change is audited`);
  }
  if (prev !== undefined && !opts.allowStageBack) check(idx >= prev, `${label}: I-4 stage never moves backwards`);
  stageHistory.set(orderId, idx);
  void listOpenBlockers;
}
