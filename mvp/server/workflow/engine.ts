/**
 * AIEC Work Manager — the deterministic workflow engine.
 *
 *   TRIGGER → STATE CHANGE → CREATE WORK → ASSIGN → NOTIFY → START SLA →
 *   WAIT → DETECT COMPLETION → VALIDATE EVIDENCE → NEXT WORK | RETRY |
 *   REASSIGN | ESCALATE
 *
 * Invariants this engine maintains:
 *  - Every mutation runs in one SQLite `BEGIN IMMEDIATE` transaction, so
 *    concurrent attempts at the same transition serialize: exactly one
 *    wins, and the other sees the new state and is refused (409).
 *  - A project enters a state only through `transition()`, which checks
 *    the lifecycle graph (V3 `WorkflowDefinition`).
 *  - Entering a state creates that state's work item (from the catalog)
 *    and assigns it. There is no "someone should now tell X".
 *  - Payment status is written only here, only through the gateway (or
 *    an audited Admin offline-payment record), and only when the project
 *    is in the matching *_REQUIRED state.
 *  - Every action writes an immutable event (see db.ts triggers).
 *
 * No LLM is involved anywhere in this file.
 */
import type { DB } from '../db';
import { getMeta, setMeta } from '../db';
import { CATALOG, taskForState } from './catalog';
import type { LadderStep, Role, TaskType, TaskTypeDef } from './catalog';
import { HAPPY_PATH, STATE_LABEL, TRANSIENT_NEXT, isLegalTransition } from './lifecycle';
import type { ProjectState } from './lifecycle';
import { distanceMeters, mockPhotoAnalyzer, precheck, validateEvidence } from './evidence';
import type { EvidenceRecord, PhotoAnalyzer, ValidationResult } from './evidence';
import { buildQuote, inr, milestoneAmounts, mockGateway } from './money';
import type { Milestone, PaymentGateway } from './money';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Actor { id: string; role: Role | 'system'; name?: string }
export const SYSTEM: Actor = { id: 'system', role: 'system', name: 'SYSTEM' };

export class WorkflowError extends Error {
  constructor(public code: string, public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export type WorkStatus =
  | 'UNASSIGNED' | 'ASSIGNED' | 'OPEN' | 'ACCEPTED' | 'IN_PROGRESS'
  | 'REJECTED' | 'FLAGGED' | 'COMPLETED' | 'CANCELLED';

export const OPEN_STATUSES: WorkStatus[] = ['UNASSIGNED', 'ASSIGNED', 'OPEN', 'ACCEPTED', 'IN_PROGRESS', 'REJECTED', 'FLAGGED'];
const OPEN_SQL = OPEN_STATUSES.map(s => `'${s}'`).join(',');

export type ExceptionCause =
  | 'TECHNICIAN_NO_RESPONSE' | 'TECHNICIAN_OVERDUE' | 'SUPPLIER_DELAY' | 'CUSTOMER_NO_RESPONSE'
  | 'EVIDENCE_REVIEW' | 'PAYMENT_BLOCKED' | 'NO_ELIGIBLE_OWNER' | 'INCOMPLETE_LEAD'
  | 'MANUAL_REASSIGNMENT' | 'OTHER';

export interface UserRow { id: string; name: string; role: Role; phone: string | null; pin: string; active: number; home_lat: number | null; home_lng: number | null; org: string | null; created_at: number }

export interface ProjectRow {
  id: string; title: string; customer_id: string | null; site_address: string | null; area: string | null;
  lat: number | null; lng: number | null; floors: number | null; door_type: string | null; finish: string | null;
  state: ProjectState; quote_total: number | null; quote_cost: number | null; installer_id: string | null;
  counters: string; flags: string; version: number; created_at: number; updated_at: number;
  state_entered_at: number; completed_at: number | null;
}

export interface WorkItemRow {
  id: string; project_id: string; type: TaskType; status: WorkStatus; priority: string;
  assigned_user_id: string | null; assigned_role: string | null;
  created_at: number; assigned_at: number | null; accepted_at: number | null; started_at: number | null;
  phase_started_at: number; accept_by: number | null; due_at: number | null;
  submitted_at: number | null; completed_at: number | null;
  validation_status: string | null; validation: string | null; failure_reason: string | null;
  retry_count: number; reassign_count: number; ladder_step: number; escalation_level: number;
  admin_required: number; exception_cause: ExceptionCause | null;
  last_system_action: string | null; last_system_action_at: number | null;
  excluded_users: string; result: string | null; earning: number; payout_status: string; version: number;
}

export interface PaymentRow {
  id: string; project_id: string; milestone: Milestone; amount: number; status: 'REQUIRED' | 'PROCESSING' | 'PAID' | 'FAILED';
  work_item_id: string | null; attempts: number; gateway_ref: string | null; failure_reason: string | null;
  method: string | null; paid_at: number | null; created_at: number; version: number;
}

export interface NewLeadInput {
  title: string; customerId: string; siteAddress?: string; area?: string;
  lat?: number | null; lng?: number | null; floors?: number | null;
  doorType?: 'automatic' | 'manual'; finish?: 'SS' | 'MS';
}

export interface EvidenceInput {
  kind: EvidenceRecord['kind']; label?: string; data: unknown; capturedAt?: number;
  lat?: number | null; lng?: number | null; idempotencyKey?: string;
}

export interface EngineOptions {
  /** Wall clock. Tests inject a manual clock. */
  baseNow?: () => number;
  gateway?: PaymentGateway;
  analyzer?: PhotoAnalyzer;
  catalog?: Record<TaskType, TaskTypeDef>;
}

type EventKind = 'transition' | 'routing' | 'info';

const MIN = 60_000;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class Engine {
  readonly db: DB;
  readonly catalog: Record<TaskType, TaskTypeDef>;
  private baseNow: () => number;
  private gateway: PaymentGateway;
  private analyzer: PhotoAnalyzer;
  private inTx = false;

  constructor(db: DB, opts: EngineOptions = {}) {
    this.db = db;
    this.baseNow = opts.baseNow ?? (() => Date.now());
    this.gateway = opts.gateway ?? mockGateway;
    this.analyzer = opts.analyzer ?? mockPhotoAnalyzer;
    this.catalog = opts.catalog ?? CATALOG;
  }

  // ---- clock ---------------------------------------------------------------

  /** Business time = wall clock + demo offset (persisted, so a restart keeps it). */
  now(): number {
    return this.baseNow() + Number(getMeta(this.db, 'clock_offset_ms') ?? 0);
  }

  clockOffsetMs(): number {
    return Number(getMeta(this.db, 'clock_offset_ms') ?? 0);
  }

  /** DEMO ONLY: fast-forward business time so SLA behaviour is visible in minutes. */
  advanceClock(actor: Actor, minutes: number): { offsetMs: number; actions: string[] } {
    if (actor.role !== 'admin' && actor.role !== 'system') throw new WorkflowError('FORBIDDEN', 403, 'Only Admin can move the demo clock');
    if (!(minutes > 0 && minutes <= 14 * 24 * 60)) throw new WorkflowError('BAD_INPUT', 400, 'minutes must be between 1 and 20160');
    this.tx(() => {
      setMeta(this.db, 'clock_offset_ms', String(this.clockOffsetMs() + minutes * MIN));
      this.record({ actor, action: 'CLOCK_ADVANCED', kind: 'info', detail: `Demo clock advanced ${fmtDuration(minutes * MIN)}` });
    });
    const actions = this.tick();
    return { offsetMs: this.clockOffsetMs(), actions };
  }

  changeSeq(): number {
    return Number(getMeta(this.db, 'change_seq') ?? 0);
  }

  // ---- transactions ----------------------------------------------------------

  tx<T>(fn: () => T): T {
    if (this.inTx) return fn();
    this.db.exec('BEGIN IMMEDIATE');
    this.inTx = true;
    try {
      const result = fn();
      setMeta(this.db, 'change_seq', String(this.changeSeq() + 1));
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    } finally {
      this.inTx = false;
    }
  }

  // ---- lookups ---------------------------------------------------------------

  user(id: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow | undefined;
  }

  users(role?: Role): UserRow[] {
    return (role
      ? this.db.prepare('SELECT * FROM users WHERE role = ? ORDER BY id').all(role)
      : this.db.prepare('SELECT * FROM users ORDER BY role, id').all()) as unknown as UserRow[];
  }

  project(id: string): ProjectRow {
    const p = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as unknown as ProjectRow | undefined;
    if (!p) throw new WorkflowError('NOT_FOUND', 404, `Project ${id} not found`);
    return p;
  }

  projects(): ProjectRow[] {
    return this.db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as unknown as ProjectRow[];
  }

  item(id: string): WorkItemRow {
    const w = this.db.prepare('SELECT * FROM work_items WHERE id = ?').get(id) as unknown as WorkItemRow | undefined;
    if (!w) throw new WorkflowError('NOT_FOUND', 404, `Work item ${id} not found`);
    return w;
  }

  itemsForProject(projectId: string): WorkItemRow[] {
    return this.db.prepare('SELECT * FROM work_items WHERE project_id = ? ORDER BY created_at, id').all(projectId) as unknown as WorkItemRow[];
  }

  openItems(): WorkItemRow[] {
    return this.db.prepare(`SELECT * FROM work_items WHERE status IN (${OPEN_SQL}) ORDER BY created_at, id`).all() as unknown as WorkItemRow[];
  }

  /** The single open workflow step of a project (the "current work item"). */
  currentItem(projectId: string): WorkItemRow | undefined {
    return this.db.prepare(`SELECT * FROM work_items WHERE project_id = ? AND status IN (${OPEN_SQL}) ORDER BY created_at DESC LIMIT 1`).get(projectId) as unknown as WorkItemRow | undefined;
  }

  evidenceFor(itemId: string, includeSuperseded = false): (EvidenceRecord & { submitted_by: string; created_at: number; superseded: number })[] {
    return this.db.prepare(`SELECT * FROM evidence WHERE work_item_id = ? ${includeSuperseded ? '' : 'AND superseded = 0'} ORDER BY created_at, id`).all(itemId)
      .map((r: any) => ({ ...r, data: JSON.parse(r.data) }));
  }

  payment(projectId: string, milestone: Milestone): PaymentRow | undefined {
    return this.db.prepare('SELECT * FROM payments WHERE project_id = ? AND milestone = ?').get(projectId, milestone) as unknown as PaymentRow | undefined;
  }

  paymentsFor(projectId: string): PaymentRow[] {
    return this.db.prepare('SELECT * FROM payments WHERE project_id = ? ORDER BY id').all(projectId) as unknown as PaymentRow[];
  }

  def(type: TaskType): TaskTypeDef {
    const d = this.catalog[type];
    if (!d) throw new WorkflowError('NO_RULE', 500, `No workflow rule for task type ${type}`);
    return d;
  }

  flags(p: ProjectRow): Record<string, any> {
    return JSON.parse(p.flags || '{}');
  }

  setFlag(actor: Actor, projectId: string, key: string, value: unknown): void {
    this.tx(() => {
      const p = this.project(projectId);
      const flags = { ...this.flags(p), [key]: value };
      this.db.prepare('UPDATE projects SET flags = ? WHERE id = ?').run(JSON.stringify(flags), projectId);
      this.record({ projectId, actor, action: 'DEMO_FLAG_SET', kind: 'info', detail: `Demo switch ${key} = ${JSON.stringify(value)}` });
    });
  }

  // ---- ids ---------------------------------------------------------------------

  /** Location-based project IDs: MH-PUN-KOT-LIFT-001 (prompt §32). */
  private newProjectId(area: string | undefined): string {
    const areaCode = (area ?? 'GEN').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
    const prefix = `MH-PUN-${areaCode}-LIFT`;
    const n = Number(getMeta(this.db, `seq:${prefix}`) ?? 0) + 1;
    setMeta(this.db, `seq:${prefix}`, String(n));
    return `${prefix}-${String(n).padStart(3, '0')}`;
  }

  /** Child IDs hang off the project: -W01, -E001, -P001, -EVT001. */
  private childId(projectId: string, kind: 'W' | 'E' | 'P' | 'EVT'): string {
    const row = this.db.prepare('SELECT counters FROM projects WHERE id = ?').get(projectId) as { counters: string };
    const counters = JSON.parse(row.counters);
    counters[kind] = (counters[kind] ?? 0) + 1;
    this.db.prepare('UPDATE projects SET counters = ? WHERE id = ?').run(JSON.stringify(counters), projectId);
    return `${projectId}-${kind}${String(counters[kind]).padStart(kind === 'W' ? 2 : 3, '0')}`;
  }

  private systemEventId(): string {
    const n = Number(getMeta(this.db, 'seq:SYS-EVT') ?? 0) + 1;
    setMeta(this.db, 'seq:SYS-EVT', String(n));
    return `SYS-EVT${String(n).padStart(6, '0')}`;
  }

  // ---- audit + notifications ---------------------------------------------------

  record(e: {
    projectId?: string; workItemId?: string; actor: Actor; action: string; kind: EventKind;
    detail: string; data?: unknown; interventionCause?: ExceptionCause;
  }): void {
    const actorType = e.actor.role === 'system' ? 'SYSTEM' : e.actor.role === 'admin' ? 'ADMIN' : 'USER';
    const id = e.projectId ? this.childId(e.projectId, 'EVT') : this.systemEventId();
    this.db.prepare(`INSERT INTO events (id, project_id, work_item_id, at, actor_type, actor_id, actor_role, action, kind, intervention, intervention_cause, detail, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, e.projectId ?? null, e.workItemId ?? null, this.now(), actorType, e.actor.id, e.actor.role, e.action, e.kind,
      e.interventionCause && actorType === 'ADMIN' ? 1 : 0, e.interventionCause ?? null, e.detail,
      e.data === undefined ? null : JSON.stringify(e.data),
    );
  }

  notify(userId: string, title: string, body: string, projectId?: string, workItemId?: string): void {
    this.db.prepare('INSERT INTO notifications (user_id, project_id, work_item_id, at, title, body, channel) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(userId, projectId ?? null, workItemId ?? null, this.now(), title, body, 'in_app');
  }

  notifyAdmins(title: string, body: string, projectId?: string, workItemId?: string): void {
    for (const a of this.users('admin').filter(u => u.active)) this.notify(a.id, title, body, projectId, workItemId);
  }

  // ---- project lifecycle -----------------------------------------------------------

  createLead(actor: Actor, input: NewLeadInput): ProjectRow {
    if (actor.role !== 'admin') throw new WorkflowError('FORBIDDEN', 403, 'Only Admin can create leads in the MVP');
    if (!input.title?.trim()) throw new WorkflowError('BAD_INPUT', 400, 'title is required');
    const customer = this.user(input.customerId);
    if (!customer || customer.role !== 'customer') throw new WorkflowError('BAD_INPUT', 400, 'customerId must be an existing customer');
    return this.tx(() => {
      const now = this.now();
      const id = this.newProjectId(input.area);
      this.db.prepare(`INSERT INTO projects (id, title, customer_id, site_address, area, lat, lng, floors, door_type, finish, state, created_at, updated_at, state_entered_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'LEAD', ?, ?, ?)`).run(
        id, input.title.trim(), input.customerId, input.siteAddress ?? null, input.area ?? null,
        input.lat ?? null, input.lng ?? null, input.floors ?? null, input.doorType ?? 'automatic', input.finish ?? 'SS', now, now, now,
      );
      this.record({ projectId: id, actor, action: 'LEAD_CREATED', kind: 'info', detail: `Lead created: ${input.title} for ${customer.name}` });
      this.onEnter(id);
      return this.project(id);
    });
  }

  leadMissing(p: ProjectRow): string[] {
    const missing: string[] = [];
    if (!p.site_address) missing.push('site address');
    if (p.lat == null || p.lng == null) missing.push('site GPS');
    if (!p.floors || p.floors < 2) missing.push('number of floors (≥2)');
    const c = p.customer_id ? this.user(p.customer_id) : undefined;
    if (!c?.phone) missing.push('customer phone');
    return missing;
  }

  private transition(projectId: string, to: ProjectState, actor: Actor, detail: string): void {
    const p = this.project(projectId);
    if (p.state === to) return;
    if (!isLegalTransition(p.state, to)) {
      throw new WorkflowError('ILLEGAL_TRANSITION', 409, `Project ${projectId} cannot move ${p.state} → ${to}`);
    }
    const now = this.now();
    this.db.prepare('UPDATE projects SET state = ?, state_entered_at = ?, updated_at = ?, version = version + 1 WHERE id = ?').run(to, now, now, projectId);
    this.record({ projectId, actor, action: 'STATE_CHANGED', kind: 'transition', detail: `${STATE_LABEL[p.state]} → ${STATE_LABEL[to]}: ${detail}`, data: { from: p.state, to } });
    this.onEnter(projectId);
  }

  /** What happens automatically when a project ENTERS its current state. */
  private onEnter(projectId: string): void {
    const p = this.project(projectId);
    const state = p.state;

    if (state === 'LEAD') {
      const missing = this.leadMissing(p);
      if (missing.length === 0) {
        this.transition(projectId, 'QUALIFIED', SYSTEM, 'lead data complete — auto-qualified');
      } else {
        this.createWork(p, this.def('QUALIFY_LEAD'), { missing });
      }
      return;
    }

    if (state === 'QUALIFIED') {
      const q = buildQuote({ floors: p.floors ?? 2, doorType: (p.door_type as any) ?? 'automatic', finish: (p.finish as any) ?? 'SS' });
      this.db.prepare('UPDATE projects SET quote_total = ?, quote_cost = ? WHERE id = ?').run(q.total, q.cost, projectId);
      this.record({ projectId, actor: SYSTEM, action: 'QUOTE_GENERATED', kind: 'routing', detail: `Auto-quote ${inr(q.total)} (${q.marginPct}% margin, floor 20%)`, data: q });
      this.transition(projectId, 'QUOTE_SENT', SYSTEM, `quotation ${inr(q.total)} sent to customer`);
      return;
    }

    const next = TRANSIENT_NEXT[state];
    if (next) {
      this.transition(projectId, next, SYSTEM, 'automatic hand-off');
      return;
    }

    if (state === 'COMPLETED') {
      this.db.prepare('UPDATE projects SET completed_at = ? WHERE id = ?').run(this.now(), projectId);
      if (p.customer_id) this.notify(p.customer_id, 'Project complete', `${p.title} is complete. Thank you!`, projectId);
      return;
    }

    if (state === 'CLOSED_LOST') {
      for (const w of this.itemsForProject(projectId).filter(w => OPEN_STATUSES.includes(w.status))) {
        this.db.prepare("UPDATE work_items SET status = 'CANCELLED', version = version + 1 WHERE id = ?").run(w.id);
        this.record({ projectId, workItemId: w.id, actor: SYSTEM, action: 'WORK_CANCELLED', kind: 'routing', detail: `${this.def(w.type).label} cancelled — project closed` });
      }
      return;
    }

    const def = taskForState(state, this.catalog);
    if (!def) {
      // A non-terminal state with no rule is exactly the "nobody knows what
      // happens next" situation. Record it loudly; the Control Tower's
      // invariant check will surface it as an AUTOMATION EXCEPTION.
      this.record({ projectId, actor: SYSTEM, action: 'NO_RULE_FOR_STATE', kind: 'info', detail: `No work rule for state ${state}` });
      this.notifyAdmins('Automation exception', `${projectId}: no workflow rule for state ${state}`, projectId);
      return;
    }
    if (def.paymentMilestone) this.ensurePayment(p, def.paymentMilestone);
    let extra: Record<string, unknown> | undefined;
    if (def.type === 'REWORK') {
      const lastQc = this.itemsForProject(projectId).filter(w => w.type === 'QC_INSPECTION' && w.status === 'COMPLETED').pop();
      extra = { snags: lastQc?.result ? JSON.parse(lastQc.result).snags ?? [] : [] };
    }
    this.createWork(p, def, extra);
  }

  private ensurePayment(p: ProjectRow, milestone: Milestone): PaymentRow {
    const existing = this.payment(p.id, milestone);
    if (existing) return existing;
    const amount = milestoneAmounts(p.quote_total ?? 0)[milestone];
    const id = this.childId(p.id, 'P');
    this.db.prepare("INSERT INTO payments (id, project_id, milestone, amount, status, created_at) VALUES (?, ?, ?, ?, 'REQUIRED', ?)").run(id, p.id, milestone, amount, this.now());
    this.record({ projectId: p.id, actor: SYSTEM, action: 'PAYMENT_REQUIRED', kind: 'routing', detail: `${milestone} payment of ${inr(amount)} required` });
    return this.payment(p.id, milestone)!;
  }

  // ---- work creation + assignment --------------------------------------------------

  private createWork(p: ProjectRow, def: TaskTypeDef, result?: Record<string, unknown>): WorkItemRow {
    const id = this.childId(p.id, 'W');
    const now = this.now();
    this.db.prepare(`INSERT INTO work_items (id, project_id, type, status, created_at, phase_started_at, earning, payout_status, result)
      VALUES (?, ?, ?, 'UNASSIGNED', ?, ?, ?, ?, ?)`).run(
      id, p.id, def.type, now, now, def.earning ?? 0, (def.earning ?? 0) > 0 ? 'PENDING_EVIDENCE' : 'NOT_APPLICABLE',
      result ? JSON.stringify(result) : null,
    );
    this.record({ projectId: p.id, workItemId: id, actor: SYSTEM, action: 'WORK_CREATED', kind: 'routing', detail: `Created ${def.label}` });
    if (def.paymentMilestone) {
      this.db.prepare('UPDATE payments SET work_item_id = ? WHERE project_id = ? AND milestone = ?').run(id, p.id, def.paymentMilestone);
    }
    this.assign(id, SYSTEM);
    return this.item(id);
  }

  private openLoad(userId: string): number {
    return (this.db.prepare(`SELECT COUNT(*) AS n FROM work_items WHERE assigned_user_id = ? AND status IN (${OPEN_SQL})`).get(userId) as { n: number }).n;
  }

  /** Deterministic owner selection. Returns undefined if nobody is eligible. */
  pickCandidate(def: TaskTypeDef, p: ProjectRow, excluded: string[]): UserRow | undefined {
    const eligible = (role: Role) => this.users(role).filter(u => u.active && !excluded.includes(u.id));
    const byLoadThenDistance = (list: UserRow[]) => list
      .map(u => ({
        u,
        load: this.openLoad(u.id),
        dist: u.home_lat != null && p.lat != null ? distanceMeters(u.home_lat, u.home_lng ?? 0, p.lat, p.lng ?? 0) : Number.MAX_SAFE_INTEGER,
      }))
      .sort((a, b) => a.load - b.load || a.dist - b.dist || a.u.id.localeCompare(b.u.id))[0]?.u;

    switch (def.assignment) {
      case 'project_customer': {
        const c = p.customer_id ? this.user(p.customer_id) : undefined;
        return c && c.active && !excluded.includes(c.id) ? c : undefined;
      }
      case 'admin':
        return eligible('admin')[0];
      case 'nearest_least_loaded_technician':
        return byLoadThenDistance(eligible('technician'));
      case 'project_installer': {
        const inst = p.installer_id ? this.user(p.installer_id) : undefined;
        if (inst && inst.active && !excluded.includes(inst.id)) return inst;
        return byLoadThenDistance(eligible('technician'));
      }
      case 'qc_technician_not_installer':
        // Separation of duties: the installer never inspects their own work.
        return byLoadThenDistance(eligible('technician').filter(u => u.id !== p.installer_id));
      case 'least_loaded_supplier':
        return byLoadThenDistance(eligible('supplier'));
      default:
        return undefined;
    }
  }

  private assign(itemId: string, actor: Actor, forcedUserId?: string): void {
    const w = this.item(itemId);
    const def = this.def(w.type);
    const p = this.project(w.project_id);
    const excluded: string[] = JSON.parse(w.excluded_users);
    const now = this.now();

    let owner: UserRow | undefined;
    if (forcedUserId) {
      owner = this.user(forcedUserId);
      if (!owner || !owner.active) throw new WorkflowError('BAD_INPUT', 400, 'Target user is missing or inactive');
      if (def.ownerRole && owner.role !== def.ownerRole) throw new WorkflowError('BAD_INPUT', 400, `${def.label} must be owned by a ${def.ownerRole}`);
      if (w.type === 'QC_INSPECTION' && owner.id === p.installer_id) throw new WorkflowError('BAD_INPUT', 400, 'The installer cannot inspect their own work');
    } else {
      owner = def.ownerRole ? this.pickCandidate(def, p, excluded) : undefined;
    }

    if (!owner) {
      this.db.prepare(`UPDATE work_items SET status = 'UNASSIGNED', assigned_user_id = NULL, admin_required = 1, escalation_level = 2,
        exception_cause = 'NO_ELIGIBLE_OWNER', last_system_action = ?, last_system_action_at = ?, version = version + 1 WHERE id = ?`)
        .run('No eligible owner — Admin must assign', now, itemId);
      this.record({ projectId: p.id, workItemId: itemId, actor: SYSTEM, action: 'ADMIN_REQUIRED', kind: 'routing', detail: `No eligible ${def.ownerRole ?? 'owner'} for ${def.label}` });
      this.notifyAdmins('Admin action required', `${p.id}: no eligible ${def.ownerRole ?? 'owner'} for ${def.label}`, p.id, itemId);
      return;
    }

    const acceptBy = def.requiresAcceptance && def.sla?.acceptMins ? now + def.sla.acceptMins * MIN : null;
    const dueAt = def.sla ? now + ((def.requiresAcceptance ? def.sla.acceptMins ?? 0 : 0) + def.sla.completeMins) * MIN : null;
    this.db.prepare(`UPDATE work_items SET status = ?, assigned_user_id = ?, assigned_role = ?, assigned_at = ?, accepted_at = NULL, started_at = NULL,
      phase_started_at = ?, accept_by = ?, due_at = ?, ladder_step = 0, escalation_level = 0, admin_required = 0, exception_cause = NULL,
      last_system_action = ?, last_system_action_at = ?, version = version + 1 WHERE id = ?`).run(
      def.requiresAcceptance ? 'ASSIGNED' : 'OPEN', owner.id, owner.role, now, now, acceptBy, dueAt,
      `Assigned to ${owner.name}`, now, itemId,
    );
    if ((w.type === 'MATERIAL_RECEIPT' || w.type === 'INSTALLATION') && owner.role === 'technician') {
      this.db.prepare('UPDATE projects SET installer_id = ? WHERE id = ?').run(owner.id, p.id);
    }
    this.record({
      projectId: p.id, workItemId: itemId, actor, action: 'WORK_ASSIGNED', kind: 'routing',
      detail: `${def.label} assigned to ${owner.name}${actor.role === 'admin' ? ' by Admin' : ''}`, data: { userId: owner.id },
    });
    const deadline = def.requiresAcceptance && acceptBy ? `Accept by ${fmtTime(acceptBy)}` : dueAt ? `Due ${fmtTime(dueAt)}` : '';
    this.notify(owner.id, `New work: ${def.label}`, `${p.title} — ${deadline}`, p.id, itemId);
  }

  /** Take work away from its current owner and give it to the next eligible one. */
  private reassign(itemId: string, actor: Actor, reason: string, opts: { exclude?: boolean } = {}): void {
    const w = this.item(itemId);
    const def = this.def(w.type);
    const excluded: string[] = JSON.parse(w.excluded_users);
    // Non-responders are excluded from this item for good; a user who merely
    // lost access is not (inactive users are filtered anyway, and should be
    // eligible again if access is restored).
    if (opts.exclude !== false && w.assigned_user_id && !excluded.includes(w.assigned_user_id)) excluded.push(w.assigned_user_id);
    this.db.prepare('UPDATE work_items SET excluded_users = ?, reassign_count = reassign_count + 1, version = version + 1 WHERE id = ?').run(JSON.stringify(excluded), itemId);
    // The next owner starts clean: evidence belongs to the person who captured it.
    this.db.prepare('UPDATE evidence SET superseded = 1 WHERE work_item_id = ?').run(itemId);
    this.record({ projectId: w.project_id, workItemId: itemId, actor, action: 'REASSIGNED', kind: 'routing', detail: `${def.label} taken from ${this.user(w.assigned_user_id ?? '')?.name ?? 'nobody'}: ${reason}` });
    if (w.assigned_user_id) this.notify(w.assigned_user_id, `Work withdrawn: ${def.label}`, reason, w.project_id, itemId);
    this.assign(itemId, SYSTEM);
  }

  // ---- owner actions -----------------------------------------------------------------

  private requireOwner(actor: Actor, w: WorkItemRow): void {
    if (actor.role === 'system') return;
    if (w.assigned_user_id !== actor.id) throw new WorkflowError('FORBIDDEN', 403, 'This work item is not assigned to you');
  }

  private requireVersion(w: WorkItemRow, expectedVersion?: number): void {
    if (expectedVersion != null && expectedVersion !== w.version) {
      throw new WorkflowError('STALE', 409, `Work item changed (version ${w.version}, you had ${expectedVersion}). Refresh and retry.`);
    }
  }

  acceptTask(actor: Actor, itemId: string, expectedVersion?: number): WorkItemRow {
    return this.tx(() => {
      const w = this.item(itemId);
      this.requireOwner(actor, w);
      this.requireVersion(w, expectedVersion);
      if (w.status !== 'ASSIGNED') throw new WorkflowError('BAD_STATE', 409, `Cannot accept: work is ${w.status}`);
      const def = this.def(w.type);
      const now = this.now();
      const due = now + (def.sla?.completeMins ?? 0) * MIN;
      this.db.prepare(`UPDATE work_items SET status = 'ACCEPTED', accepted_at = ?, phase_started_at = ?, due_at = ?, ladder_step = 0, escalation_level = 0, version = version + 1 WHERE id = ?`).run(now, now, due, itemId);
      this.record({ projectId: w.project_id, workItemId: itemId, actor, action: 'WORK_ACCEPTED', kind: 'transition', detail: `${actor.name ?? actor.id} accepted ${def.label}; due ${fmtTime(due)}` });
      return this.item(itemId);
    });
  }

  declineTask(actor: Actor, itemId: string, reason: string): WorkItemRow {
    return this.tx(() => {
      const w = this.item(itemId);
      this.requireOwner(actor, w);
      if (!['ASSIGNED', 'ACCEPTED'].includes(w.status)) throw new WorkflowError('BAD_STATE', 409, `Cannot decline: work is ${w.status}`);
      this.record({ projectId: w.project_id, workItemId: itemId, actor, action: 'WORK_DECLINED', kind: 'transition', detail: `Declined: ${reason || 'no reason given'}` });
      this.reassign(itemId, SYSTEM, `declined by ${actor.name ?? actor.id}`);
      return this.item(itemId);
    });
  }

  startTask(actor: Actor, itemId: string): WorkItemRow {
    return this.tx(() => {
      const w = this.item(itemId);
      this.requireOwner(actor, w);
      if (w.status === 'IN_PROGRESS') return w;
      if (w.status !== 'ACCEPTED') throw new WorkflowError('BAD_STATE', 409, `Cannot start: work is ${w.status}`);
      this.db.prepare("UPDATE work_items SET status = 'IN_PROGRESS', started_at = ?, version = version + 1 WHERE id = ?").run(this.now(), itemId);
      this.record({ projectId: w.project_id, workItemId: itemId, actor, action: 'WORK_STARTED', kind: 'transition', detail: `${actor.name ?? actor.id} started work` });
      return this.item(itemId);
    });
  }

  /** Idempotent: re-sending the same idempotencyKey (offline retry) never duplicates. */
  addEvidence(actor: Actor, itemId: string, input: EvidenceInput): { id: string; duplicate: boolean } {
    return this.tx(() => {
      if (input.idempotencyKey) {
        const dup = this.db.prepare('SELECT id, work_item_id FROM evidence WHERE idempotency_key = ?').get(input.idempotencyKey) as { id: string; work_item_id: string } | undefined;
        if (dup) {
          if (dup.work_item_id !== itemId) throw new WorkflowError('BAD_INPUT', 400, 'Idempotency key reused for a different work item');
          return { id: dup.id, duplicate: true };
        }
      }
      const w = this.item(itemId);
      this.requireOwner(actor, w);
      if (!['OPEN', 'ACCEPTED', 'IN_PROGRESS', 'REJECTED'].includes(w.status)) {
        throw new WorkflowError('BAD_STATE', 409, w.status === 'ASSIGNED' ? 'Accept the work before capturing evidence' : `Cannot add evidence: work is ${w.status}`);
      }
      const kinds = ['gps', 'photo', 'measurement', 'checklist', 'signature', 'field'];
      if (!kinds.includes(input.kind)) throw new WorkflowError('BAD_INPUT', 400, `Unknown evidence kind ${input.kind}`);
      const now = this.now();
      const capturedAt = Number.isFinite(input.capturedAt) ? Number(input.capturedAt) : now;
      const id = this.childId(w.project_id, 'E');
      this.db.prepare(`INSERT INTO evidence (id, work_item_id, project_id, kind, label, data, captured_at, lat, lng, submitted_by, idempotency_key, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, itemId, w.project_id, input.kind, input.label ?? null, JSON.stringify(input.data ?? null), capturedAt,
        input.lat ?? null, input.lng ?? null, actor.id, input.idempotencyKey ?? null, now,
      );
      if (w.status === 'ACCEPTED' || w.status === 'REJECTED') {
        this.db.prepare("UPDATE work_items SET status = 'IN_PROGRESS', started_at = COALESCE(started_at, ?), version = version + 1 WHERE id = ?").run(now, itemId);
      }
      this.record({ projectId: w.project_id, workItemId: itemId, actor, action: 'EVIDENCE_ADDED', kind: 'info', detail: `${input.kind}${input.label ? ` (${input.label})` : ''} captured` });
      return { id, duplicate: false };
    });
  }

  /**
   * Submit for completion. Missing evidence → refused, task stays open
   * (no retry consumed). Present-but-invalid → REJECTED, retry counted,
   * reassigned after the retry limit. Out-of-tolerance → FLAGGED for Admin.
   */
  submitTask(actor: Actor, itemId: string, expectedVersion?: number):
    { outcome: 'INCOMPLETE' | 'PASS' | 'FAIL' | 'FLAG'; missing?: string[]; validation?: ValidationResult; item: WorkItemRow } {
    return this.tx(() => {
      const w = this.item(itemId);
      this.requireOwner(actor, w);
      this.requireVersion(w, expectedVersion);
      const def = this.def(w.type);
      if (def.completion !== 'evidence') throw new WorkflowError('BAD_STATE', 409, `${def.label} is not completed by evidence`);
      if (!['OPEN', 'ACCEPTED', 'IN_PROGRESS', 'REJECTED'].includes(w.status)) throw new WorkflowError('BAD_STATE', 409, `Cannot submit: work is ${w.status}`);
      const evidence = this.evidenceFor(itemId);
      const missing = precheck(def.evidence, evidence);
      if (missing.length) {
        this.record({ projectId: w.project_id, workItemId: itemId, actor, action: 'SUBMIT_BLOCKED', kind: 'info', detail: `Submission refused — missing: ${missing.join('; ')}` });
        return { outcome: 'INCOMPLETE' as const, missing, item: this.item(itemId) };
      }
      const p = this.project(w.project_id);
      const now = this.now();
      const validation = validateEvidence(def.evidence, evidence, {
        site: { lat: p.lat, lng: p.lng }, windowStart: w.accepted_at ?? w.assigned_at ?? w.created_at, now, analyzer: this.analyzer,
      });
      this.db.prepare('UPDATE work_items SET submitted_at = ?, validation_status = ?, validation = ?, version = version + 1 WHERE id = ?')
        .run(now, validation.outcome, JSON.stringify(validation), itemId);
      this.record({ projectId: w.project_id, workItemId: itemId, actor, action: 'WORK_SUBMITTED', kind: 'transition', detail: `${def.label} submitted with ${evidence.length} evidence item(s)` });

      if (validation.outcome === 'PASS') {
        this.record({ projectId: w.project_id, workItemId: itemId, actor: SYSTEM, action: 'EVIDENCE_PASSED', kind: 'transition', detail: `Evidence passed ${validation.checks.length} checks (${validation.cv.analyzer})` });
        this.completeWork(itemId, SYSTEM, this.resultFromEvidence(w, evidence));
      } else if (validation.outcome === 'FLAG') {
        this.db.prepare("UPDATE work_items SET status = 'FLAGGED', admin_required = 1, escalation_level = 2, exception_cause = 'EVIDENCE_REVIEW', last_system_action = ?, last_system_action_at = ?, version = version + 1 WHERE id = ?")
          .run('Flagged for Admin review', now, itemId);
        this.record({ projectId: w.project_id, workItemId: itemId, actor: SYSTEM, action: 'EVIDENCE_FLAGGED', kind: 'transition', detail: `Needs review: ${validation.reasons.join('; ')}` });
        this.notifyAdmins('Evidence needs review', `${p.id} ${def.label}: ${validation.reasons.join('; ')}`, p.id, itemId);
        this.notify(w.assigned_user_id!, 'Submitted — under review', 'Some values are outside tolerance. Admin will review.', p.id, itemId);
      } else {
        this.rejectEvidence(itemId, SYSTEM, validation.reasons);
      }
      return { outcome: validation.outcome, validation, item: this.item(itemId) };
    });
  }

  private rejectEvidence(itemId: string, actor: Actor, reasons: string[], interventionCause?: ExceptionCause): void {
    const w = this.item(itemId);
    const def = this.def(w.type);
    const now = this.now();
    const retries = w.retry_count + 1;
    this.db.prepare(`UPDATE work_items SET status = 'REJECTED', retry_count = ?, failure_reason = ?, admin_required = 0, exception_cause = NULL,
      last_system_action = ?, last_system_action_at = ?, version = version + 1 WHERE id = ?`)
      .run(retries, reasons.join('; '), `Evidence rejected (${retries}/${def.retry?.maxEvidenceRetries ?? 0})`, now, itemId);
    this.db.prepare('UPDATE evidence SET superseded = 1 WHERE work_item_id = ?').run(itemId);
    this.record({ projectId: w.project_id, workItemId: itemId, actor, action: 'EVIDENCE_REJECTED', kind: 'transition', detail: `Rejected (${retries}): ${reasons.join('; ')}`, interventionCause });
    if (w.assigned_user_id) this.notify(w.assigned_user_id, `Resubmit: ${def.label}`, `Rejected: ${reasons.join('; ')}. Capture fresh evidence and submit again.`, w.project_id, itemId);
    const max = def.retry?.maxEvidenceRetries ?? 0;
    if (retries >= max && 'maxReassignments' in (def.reassignment ?? {})) {
      this.reassign(itemId, SYSTEM, `evidence rejected ${retries} times`);
      this.notifyAdmins('FYI: work reassigned', `${w.project_id} ${def.label} reassigned after ${retries} evidence rejections. No action required.`, w.project_id, itemId);
    }
  }

  private resultFromEvidence(w: WorkItemRow, evidence: EvidenceRecord[]): Record<string, unknown> {
    const fields: Record<string, string> = {};
    for (const e of evidence.filter(e => e.kind === 'field')) Object.assign(fields, e.data);
    const prior = w.result ? JSON.parse(w.result) : {};
    if (w.type === 'QC_INSPECTION') {
      const pass = String(fields.qcResult ?? '').toLowerCase() === 'pass';
      return { ...prior, qcResult: pass ? 'pass' : 'fail', snags: pass ? [] : String(fields.snags ?? 'Unspecified snag').split(/[;\n]/).map(s => s.trim()).filter(Boolean), fields };
    }
    return { ...prior, fields };
  }

  /** Close a work item and move the project on — the heart of "the system creates the next task". */
  private completeWork(itemId: string, actor: Actor, result: Record<string, unknown>): void {
    const w = this.item(itemId);
    const def = this.def(w.type);
    const now = this.now();
    const payout = w.earning > 0 ? 'ELIGIBLE' : 'NOT_APPLICABLE';
    this.db.prepare(`UPDATE work_items SET status = 'COMPLETED', completed_at = ?, result = ?, admin_required = 0, exception_cause = NULL, payout_status = ?,
      last_system_action = 'Completed', last_system_action_at = ?, version = version + 1 WHERE id = ?`).run(now, JSON.stringify(result), payout, now, itemId);
    this.record({ projectId: w.project_id, workItemId: itemId, actor, action: 'WORK_COMPLETED', kind: 'transition', detail: `${def.label} completed` });
    if (payout === 'ELIGIBLE' && w.assigned_user_id) {
      this.record({ projectId: w.project_id, workItemId: itemId, actor: SYSTEM, action: 'PAYOUT_ELIGIBLE', kind: 'info', detail: `${inr(w.earning)} earning eligible for ${this.user(w.assigned_user_id)?.name} (evidence-gated)` });
      this.notify(w.assigned_user_id, `✓ Completed — ${inr(w.earning)} earned`, `${def.label} passed validation.`, w.project_id, itemId);
    }

    if (w.type === 'QC_INSPECTION' && result.qcResult === 'fail') {
      this.transition(w.project_id, def.onFailure!.projectState!, SYSTEM, `QC failed: ${(result.snags as string[]).join('; ')}`);
      return;
    }
    if (w.type === 'CUSTOMER_QUOTE_DECISION' && result.decision === 'rejected') {
      this.transition(w.project_id, 'CLOSED_LOST', actor.role === 'system' ? SYSTEM : actor, `customer declined: ${result.reason ?? ''}`);
      return;
    }
    if (!def.onSuccess) {
      this.record({ projectId: w.project_id, workItemId: itemId, actor: SYSTEM, action: 'NO_SUCCESS_TRANSITION', kind: 'info', detail: `${def.label} has no success transition` });
      return;
    }
    this.transition(w.project_id, def.onSuccess.projectState, SYSTEM, `${def.label} done`);
  }

  decideQuote(actor: Actor, itemId: string, accept: boolean, reason = ''): WorkItemRow {
    return this.tx(() => {
      const w = this.item(itemId);
      this.requireOwner(actor, w);
      if (w.type !== 'CUSTOMER_QUOTE_DECISION') throw new WorkflowError('BAD_STATE', 409, 'Not a quote decision');
      if (w.status !== 'OPEN') throw new WorkflowError('BAD_STATE', 409, `Quote decision already ${w.status}`);
      this.record({ projectId: w.project_id, workItemId: itemId, actor, action: accept ? 'QUOTE_ACCEPTED' : 'QUOTE_DECLINED', kind: 'transition', detail: accept ? 'Customer accepted the quotation' : `Customer declined: ${reason}` });
      this.completeWork(itemId, actor, { decision: accept ? 'accepted' : 'rejected', reason });
      return this.item(itemId);
    });
  }

  /**
   * Customer pays a milestone. Two-phase so a real async gateway is safe:
   * tx1 claims the payment (REQUIRED|FAILED → PROCESSING) — a second
   * concurrent call is refused here — then the gateway is called outside
   * the transaction, then tx2 records the outcome.
   */
  async pay(actor: Actor, itemId: string, opts: { method?: string; cardNumber?: string } = {}): Promise<{ ok: boolean; payment: PaymentRow; reason?: string }> {
    const claim = this.tx(() => {
      const w = this.item(itemId);
      this.requireOwner(actor, w);
      const def = this.def(w.type);
      if (!def.paymentMilestone) throw new WorkflowError('BAD_STATE', 409, 'This work item is not a payment');
      if (w.status !== 'OPEN') throw new WorkflowError('BAD_STATE', 409, `Payment work is ${w.status}`);
      const p = this.project(w.project_id);
      if (p.state !== def.trigger) throw new WorkflowError('PAYMENT_GATE', 409, `Payment not allowed in state ${p.state}`);
      const pay = this.payment(p.id, def.paymentMilestone);
      if (!pay) throw new WorkflowError('PAYMENT_GATE', 409, 'No payment is due');
      if (pay.status === 'PROCESSING') throw new WorkflowError('PAYMENT_IN_PROGRESS', 409, 'A payment attempt is already in progress');
      if (pay.status === 'PAID') throw new WorkflowError('ALREADY_PAID', 409, 'Already paid');
      this.db.prepare("UPDATE payments SET status = 'PROCESSING', attempts = attempts + 1, method = ?, version = version + 1 WHERE id = ?").run(opts.method ?? 'card', pay.id);
      const flags = this.flags(p);
      const forceFail = !!flags.failNextPayment;
      if (forceFail) this.db.prepare('UPDATE projects SET flags = ? WHERE id = ?').run(JSON.stringify({ ...flags, failNextPayment: false }), p.id);
      this.record({ projectId: p.id, workItemId: itemId, actor, action: 'PAYMENT_PROCESSING', kind: 'info', detail: `${pay.milestone} payment ${inr(pay.amount)} sent to gateway` });
      return { payId: pay.id, amount: pay.amount, milestone: pay.milestone, projectId: p.id, forceFail };
    });

    let res: Awaited<ReturnType<PaymentGateway['charge']>>;
    try {
      res = await this.gateway.charge({ reference: claim.payId, amount: claim.amount, method: opts.method ?? 'card', cardNumber: opts.cardNumber, forceFail: claim.forceFail });
    } catch (e) {
      res = { ok: false, reason: `Gateway error: ${e instanceof Error ? e.message : String(e)}` };
    }

    return this.tx(() => {
      const w = this.item(itemId);
      const def = this.def(w.type);
      const now = this.now();
      if (res.ok) {
        this.db.prepare("UPDATE payments SET status = 'PAID', gateway_ref = ?, paid_at = ?, failure_reason = NULL, version = version + 1 WHERE id = ?").run(res.gatewayRef ?? null, now, claim.payId);
        this.record({ projectId: claim.projectId, workItemId: itemId, actor: SYSTEM, action: 'PAYMENT_SUCCEEDED', kind: 'transition', detail: `${claim.milestone} ${inr(claim.amount)} confirmed by gateway (${res.gatewayRef})` });
        this.completeWork(itemId, SYSTEM, { gatewayRef: res.gatewayRef });
        return { ok: true, payment: this.payment(claim.projectId, claim.milestone)! };
      }
      const reason = res.reason ?? 'Payment failed';
      this.db.prepare("UPDATE payments SET status = 'FAILED', failure_reason = ?, version = version + 1 WHERE id = ?").run(reason, claim.payId);
      const attempts = this.payment(claim.projectId, claim.milestone)!.attempts;
      this.db.prepare('UPDATE work_items SET failure_reason = ?, retry_count = ?, last_system_action = ?, last_system_action_at = ?, version = version + 1 WHERE id = ?')
        .run(reason, attempts, `Payment failed (${attempts})`, now, itemId);
      this.record({ projectId: claim.projectId, workItemId: itemId, actor: SYSTEM, action: 'PAYMENT_FAILED', kind: 'transition', detail: `${claim.milestone} payment failed: ${reason}. Workflow held at ${this.project(claim.projectId).state}.` });
      this.notify(w.assigned_user_id!, 'Payment failed', `${reason}. Please try again.`, claim.projectId, itemId);
      if (attempts >= (def.retry?.maxEvidenceRetries ?? 3)) {
        this.db.prepare("UPDATE work_items SET admin_required = 1, escalation_level = 2, exception_cause = 'PAYMENT_BLOCKED', version = version + 1 WHERE id = ?").run(itemId);
        this.record({ projectId: claim.projectId, workItemId: itemId, actor: SYSTEM, action: 'ADMIN_REQUIRED', kind: 'routing', detail: `${attempts} failed payment attempts — payment blocked` });
        this.notifyAdmins('Payment blocked', `${claim.projectId}: ${attempts} failed ${claim.milestone} payment attempts`, claim.projectId, itemId);
      }
      return { ok: false, payment: this.payment(claim.projectId, claim.milestone)!, reason };
    });
  }

  // ---- Admin interventions (each one is counted) ----------------------------------------

  private requireAdmin(actor: Actor): void {
    if (actor.role !== 'admin') throw new WorkflowError('FORBIDDEN', 403, 'Admin only');
  }

  private causeFor(w: WorkItemRow, fallback: ExceptionCause): ExceptionCause {
    return w.exception_cause ?? fallback;
  }

  adminAssign(actor: Actor, itemId: string, userId: string, reason: string): WorkItemRow {
    this.requireAdmin(actor);
    return this.tx(() => {
      const w = this.item(itemId);
      if (!OPEN_STATUSES.includes(w.status) || w.status === 'FLAGGED') throw new WorkflowError('BAD_STATE', 409, `Cannot reassign ${w.status} work`);
      const cause = this.causeFor(w, 'MANUAL_REASSIGNMENT');
      if (w.assigned_user_id && w.assigned_user_id !== userId) {
        this.db.prepare('UPDATE evidence SET superseded = 1 WHERE work_item_id = ?').run(itemId);
        this.notify(w.assigned_user_id, `Work withdrawn: ${this.def(w.type).label}`, `Admin reassigned: ${reason}`, w.project_id, itemId);
      }
      this.assign(itemId, actor, userId);
      this.record({ projectId: w.project_id, workItemId: itemId, actor, action: 'ADMIN_OVERRIDE', kind: 'routing', detail: `Admin assigned to ${this.user(userId)?.name}: ${reason}`, interventionCause: cause });
      return this.item(itemId);
    });
  }

  adminReviewFlag(actor: Actor, itemId: string, approve: boolean, note: string): WorkItemRow {
    this.requireAdmin(actor);
    return this.tx(() => {
      const w = this.item(itemId);
      if (w.status !== 'FLAGGED') throw new WorkflowError('BAD_STATE', 409, 'Only FLAGGED work can be reviewed');
      if (approve) {
        this.record({ projectId: w.project_id, workItemId: itemId, actor, action: 'ADMIN_APPROVED_FLAG', kind: 'transition', detail: `Admin approved flagged evidence: ${note}`, interventionCause: 'EVIDENCE_REVIEW' });
        this.completeWork(itemId, actor, { ...(w.result ? JSON.parse(w.result) : {}), fields: this.resultFromEvidence(w, this.evidenceFor(itemId)).fields, adminNote: note });
      } else {
        this.rejectEvidence(itemId, actor, [`Admin: ${note}`], 'EVIDENCE_REVIEW');
      }
      return this.item(itemId);
    });
  }

  /** "Customer contacted — give them more time." Resets the SLA ladder. */
  adminExtend(actor: Actor, itemId: string, minutes: number, reason: string): WorkItemRow {
    this.requireAdmin(actor);
    if (!(minutes > 0)) throw new WorkflowError('BAD_INPUT', 400, 'minutes must be > 0');
    return this.tx(() => {
      const w = this.item(itemId);
      if (!['ASSIGNED', 'OPEN', 'ACCEPTED', 'IN_PROGRESS', 'REJECTED'].includes(w.status)) throw new WorkflowError('BAD_STATE', 409, `Cannot extend ${w.status} work`);
      const now = this.now();
      const until = now + minutes * MIN;
      const cause = this.causeFor(w, 'OTHER');
      if (w.status === 'ASSIGNED') {
        this.db.prepare('UPDATE work_items SET accept_by = ?, phase_started_at = ?, ladder_step = 0, escalation_level = 0, admin_required = 0, exception_cause = NULL, version = version + 1 WHERE id = ?').run(until, now, itemId);
      } else {
        this.db.prepare('UPDATE work_items SET due_at = ?, phase_started_at = ?, ladder_step = 0, escalation_level = 0, admin_required = 0, exception_cause = NULL, version = version + 1 WHERE id = ?').run(until, now, itemId);
      }
      this.record({ projectId: w.project_id, workItemId: itemId, actor, action: 'ADMIN_OVERRIDE', kind: 'routing', detail: `Admin extended deadline to ${fmtTime(until)}: ${reason}`, interventionCause: cause });
      return this.item(itemId);
    });
  }

  /** Offline (NEFT/cheque) payment. Same gate as the gateway path. */
  adminRecordOfflinePayment(actor: Actor, itemId: string, reference: string): WorkItemRow {
    this.requireAdmin(actor);
    if (!reference?.trim()) throw new WorkflowError('BAD_INPUT', 400, 'A bank/cheque reference is required');
    return this.tx(() => {
      const w = this.item(itemId);
      const def = this.def(w.type);
      if (!def.paymentMilestone || w.status !== 'OPEN') throw new WorkflowError('BAD_STATE', 409, 'Not an open payment');
      const p = this.project(w.project_id);
      if (p.state !== def.trigger) throw new WorkflowError('PAYMENT_GATE', 409, `Payment not allowed in state ${p.state}`);
      const pay = this.payment(p.id, def.paymentMilestone)!;
      if (pay.status === 'PAID' || pay.status === 'PROCESSING') throw new WorkflowError('BAD_STATE', 409, `Payment is ${pay.status}`);
      const cause = this.causeFor(w, 'PAYMENT_BLOCKED');
      this.db.prepare("UPDATE payments SET status = 'PAID', method = 'offline', gateway_ref = ?, paid_at = ?, version = version + 1 WHERE id = ?").run(`OFFLINE:${reference.trim()}`, this.now(), pay.id);
      this.record({ projectId: p.id, workItemId: itemId, actor, action: 'ADMIN_OVERRIDE', kind: 'transition', detail: `Admin recorded offline ${pay.milestone} payment ${inr(pay.amount)} ref ${reference}`, interventionCause: cause });
      this.completeWork(itemId, actor, { offlineRef: reference });
      return this.item(itemId);
    });
  }

  adminCompleteLead(actor: Actor, projectId: string, fields: { siteAddress?: string; lat?: number; lng?: number; floors?: number; customerPhone?: string }): ProjectRow {
    this.requireAdmin(actor);
    return this.tx(() => {
      const p = this.project(projectId);
      if (p.state !== 'LEAD') throw new WorkflowError('BAD_STATE', 409, 'Project is not a lead');
      this.db.prepare('UPDATE projects SET site_address = COALESCE(?, site_address), lat = COALESCE(?, lat), lng = COALESCE(?, lng), floors = COALESCE(?, floors), updated_at = ? WHERE id = ?')
        .run(fields.siteAddress ?? null, fields.lat ?? null, fields.lng ?? null, fields.floors ?? null, this.now(), projectId);
      if (fields.customerPhone && p.customer_id) this.db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(fields.customerPhone, p.customer_id);
      const missing = this.leadMissing(this.project(projectId));
      const w = this.currentItem(projectId);
      this.record({ projectId, workItemId: w?.id, actor, action: 'ADMIN_OVERRIDE', kind: 'info', detail: `Admin updated lead details${missing.length ? `; still missing ${missing.join(', ')}` : ''}`, interventionCause: 'INCOMPLETE_LEAD' });
      if (!missing.length && w?.type === 'QUALIFY_LEAD') this.completeWork(w.id, actor, { completedBy: actor.id });
      return this.project(projectId);
    });
  }

  /** Remove a user's access. Their open work is reassigned automatically. */
  setUserActive(actor: Actor, userId: string, active: boolean): UserRow {
    this.requireAdmin(actor);
    return this.tx(() => {
      const u = this.user(userId);
      if (!u) throw new WorkflowError('NOT_FOUND', 404, 'User not found');
      if (u.id === actor.id && !active) throw new WorkflowError('BAD_INPUT', 400, 'You cannot deactivate yourself');
      this.db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, userId);
      this.record({ actor, action: active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', kind: 'info', detail: `${u.name} ${active ? 'activated' : 'deactivated'}` });
      if (!active) {
        this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
        const open = this.db.prepare(`SELECT id FROM work_items WHERE assigned_user_id = ? AND status IN (${OPEN_SQL})`).all(userId) as { id: string }[];
        for (const { id } of open) this.reassign(id, SYSTEM, `${u.name} lost access`, { exclude: false });
      } else {
        // Anything waiting for "an eligible owner" may now have one.
        for (const w of this.openItems().filter(w => w.status === 'UNASSIGNED')) this.assign(w.id, SYSTEM);
      }
      return this.user(userId)!;
    });
  }

  // ---- scheduler -----------------------------------------------------------------------

  /** Which ladder applies right now, and its window. */
  ladderFor(w: WorkItemRow): { ladder: LadderStep[]; start: number; end: number; phase: 'accept' | 'complete' } | undefined {
    if (!['ASSIGNED', 'OPEN', 'ACCEPTED', 'IN_PROGRESS', 'REJECTED'].includes(w.status) || w.admin_required) return undefined;
    const def = this.def(w.type);
    if (w.status === 'ASSIGNED') {
      if (!def.acceptLadder || w.accept_by == null) return undefined;
      return { ladder: def.acceptLadder, start: w.phase_started_at, end: w.accept_by, phase: 'accept' };
    }
    if (!def.completeLadder || w.due_at == null) return undefined;
    return { ladder: def.completeLadder, start: w.phase_started_at, end: w.due_at, phase: 'complete' };
  }

  /** The next thing the system will do on its own, and when. */
  nextSystemAction(w: WorkItemRow): { action: LadderStep['action']; at: number; phase: 'accept' | 'complete' } | undefined {
    const l = this.ladderFor(w);
    if (!l) return undefined;
    const step = l.ladder[w.ladder_step];
    if (!step) return undefined;
    return { action: step.action, at: l.start + step.atPct * (l.end - l.start), phase: l.phase };
  }

  /**
   * One scheduler pass. Stateless: derives everything from persisted rows,
   * so it resumes correctly after a restart. Safe to call as often as you like.
   */
  tick(): string[] {
    const done: string[] = [];
    for (const snapshot of this.openItems()) {
      // Bound the loop per item; each step advances ladder_step or clears the ladder.
      for (let guard = 0; guard < 10; guard++) {
        const acted = this.tx(() => {
          const w = this.item(snapshot.id);
          const next = this.nextSystemAction(w);
          if (!next || this.now() < next.at) return undefined;
          return this.runLadderStep(w, next.action, next.phase);
        });
        if (!acted) break;
        done.push(acted);
      }
    }
    return done;
  }

  private runLadderStep(w: WorkItemRow, action: LadderStep['action'], phase: 'accept' | 'complete'): string {
    const def = this.def(w.type);
    const p = this.project(w.project_id);
    const owner = w.assigned_user_id ? this.user(w.assigned_user_id) : undefined;
    const now = this.now();
    const what = phase === 'accept' ? 'accept' : 'complete';
    const deadline = phase === 'accept' ? w.accept_by! : w.due_at!;
    const set = (sql: string, ...args: any[]) => this.db.prepare(`UPDATE work_items SET ${sql}, ladder_step = ladder_step + 1, last_system_action_at = ?, version = version + 1 WHERE id = ?`).run(...args, now, w.id);

    switch (action) {
      case 'REMIND': {
        set('last_system_action = ?', `Reminder sent to ${owner?.name}`);
        if (owner) this.notify(owner.id, `Reminder: ${what} ${def.label}`, `${p.title} — ${phase === 'accept' ? 'accept by' : 'due'} ${fmtTime(deadline)}`, p.id, w.id);
        this.record({ projectId: p.id, workItemId: w.id, actor: SYSTEM, action: 'REMINDER_SENT', kind: 'routing', detail: `Reminder to ${owner?.name} to ${what} ${def.label}` });
        return `${w.id}: reminder`;
      }
      case 'ESCALATE': {
        set('escalation_level = 1, last_system_action = ?', `Escalated — ${owner?.name} overdue to ${what}`);
        const after = this.nextSystemAction({ ...w, ladder_step: w.ladder_step + 1 });
        const plan = after ? `System will ${after.action === 'REASSIGN' ? 'reassign' : 'require Admin'} at ${fmtTime(after.at)}` : 'No further automatic step';
        if (owner) this.notify(owner.id, `OVERDUE: ${def.label}`, `You are late to ${what} this work. ${plan}.`, p.id, w.id);
        this.notifyAdmins(`Escalation: ${def.label}`, `${p.id}: ${owner?.name} has not ${phase === 'accept' ? 'accepted' : 'completed'}. ${plan}. ${after?.action === 'REASSIGN' ? 'No action required.' : ''}`, p.id, w.id);
        this.record({ projectId: p.id, workItemId: w.id, actor: SYSTEM, action: 'ESCALATED', kind: 'routing', detail: `${owner?.name} overdue to ${what} ${def.label}. ${plan}` });
        return `${w.id}: escalated`;
      }
      case 'REASSIGN': {
        const max = def.reassignment && 'maxReassignments' in def.reassignment ? def.reassignment.maxReassignments : 0;
        if (w.reassign_count >= max) {
          return this.requireAdminStep(w, def, owner, `Reassignment limit (${max}) reached`, phase);
        }
        this.reassign(w.id, SYSTEM, `no ${phase === 'accept' ? 'acceptance' : 'completion'} by ${fmtTime(deadline)}`);
        const after = this.item(w.id);
        return `${w.id}: reassigned → ${after.assigned_user_id ?? 'ADMIN'}`;
      }
      case 'ADMIN_REQUIRED':
        return this.requireAdminStep(w, def, owner, `${owner?.name ?? 'Owner'} has not responded after reminders and escalation`, phase);
    }
  }

  private requireAdminStep(w: WorkItemRow, def: TaskTypeDef, owner: UserRow | undefined, why: string, phase: 'accept' | 'complete'): string {
    const cause: ExceptionCause = def.ownerRole === 'customer' ? 'CUSTOMER_NO_RESPONSE'
      : def.ownerRole === 'supplier' ? 'SUPPLIER_DELAY'
        : phase === 'accept' ? 'TECHNICIAN_NO_RESPONSE' : 'TECHNICIAN_OVERDUE';
    this.db.prepare(`UPDATE work_items SET admin_required = 1, escalation_level = 2, exception_cause = ?, ladder_step = ladder_step + 1,
      last_system_action = ?, last_system_action_at = ?, version = version + 1 WHERE id = ?`).run(cause, `Admin required: ${why}`, this.now(), w.id);
    this.record({ projectId: w.project_id, workItemId: w.id, actor: SYSTEM, action: 'ADMIN_REQUIRED', kind: 'routing', detail: `${def.label}: ${why}` });
    this.notifyAdmins('Admin action required', `${w.project_id} ${def.label}: ${why}${def.ownerRole === 'customer' ? ` — please call ${owner?.name} (${owner?.phone ?? 'no phone'})` : ''}`, w.project_id, w.id);
    return `${w.id}: admin required`;
  }
}

// ---------------------------------------------------------------------------
// formatting helpers (shared with read models)
// ---------------------------------------------------------------------------

export function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
}

export function fmtDuration(ms: number): string {
  const neg = ms < 0;
  let m = Math.round(Math.abs(ms) / MIN);
  const d = Math.floor(m / (24 * 60)); m -= d * 24 * 60;
  const h = Math.floor(m / 60); m -= h * 60;
  const s = [d ? `${d}d` : '', h ? `${h}h` : '', `${m}m`].filter(Boolean).slice(0, 2).join(' ');
  return neg ? `-${s}` : s;
}

export function progressOf(state: ProjectState): number {
  const i = HAPPY_PATH.indexOf(state === 'REWORK' ? 'QC' : state);
  return i < 0 ? 0 : Math.round((i / (HAPPY_PATH.length - 1)) * 100);
}
