/**
 * MVP order service — the ONLY place an order's stage, status or tasks change
 * (docs/mvp/MVP_REFACTOR_PLAN.md §4). Every function:
 *   1. checks the actor's role (UI hiding is convenience; firestore.rules enforce it server-side),
 *   2. asks the pure rules module (src/mvp/rules.ts) what happens next,
 *   3. writes through the canonical repositories,
 *   4. writes AuditEvents (src/lib/audit.ts) for every I-3 change,
 *   5. is idempotent: deterministic ids + createIfAbsent, and runIdempotent for conversions.
 */

import type {
  Blocker, BlockerReason, CanonicalUserRole, Customer, MvpStage, OrderStatus, PaymentMilestone, Project, Site, SiteSurvey,
  SurveyResult, Task, TaskType,
} from '../../domain/entities';
import type { AuthMethod } from '../../types';
import type { RepositoryContext } from '../../repository/types';
import { getRepository } from '../../repository';
import {
  blockerRepository, customerRepository, installationJobRepository, paymentMilestoneRepository, projectRepository, siteRepository, siteSurveyRepository, taskRepository,
} from '../../repository/entities';
import { createIfAbsent, nextSequence } from '../../repository/transactions';
import { recordAuditEvent, newCorrelationId } from '../../lib/audit';
import { runIdempotent } from '../../lib/idempotency';
import { outcomeFor, dedupe, TASK_TITLES, type MvpEvent, type OrderSnapshot, type TaskSpec, type Assignee } from '../rules';
import { toMvpStage, TO_PROJECT_STAGE, isForward, stageIndex } from '../stage';
import { isOpenTask } from '../health';
import { BLOCKER_DUE_DAYS, DUE_DAYS, SURVEY_FEE_INR } from '../config';
import { addDays } from '../format';
import { notify } from './notify';
import { leadOwner, leadStatus, LEGACY_STAGE_FOR, type MvpLead, type MvpLeadStatus } from '../leadModel';
import { MvpError, requireText } from '../validate';

export { MvpError };

// ---------------------------------------------------------------------------
// Context, actor, errors
// ---------------------------------------------------------------------------

export type MvpCtx = RepositoryContext & { now?: () => Date };

export interface MvpActor {
  userId: string;
  role: CanonicalUserRole;
  isDemo?: boolean;
  authMethod?: AuthMethod;
  /** Customers only: their Customer id (from the invite, D-13). */
  customerId?: string;
  name?: string;
}

export function nowOf(ctx: MvpCtx): Date {
  return ctx.now ? ctx.now() : new Date();
}

export function customerToken(customerId: string): string {
  return `customer:${customerId}`;
}

/** Every assignee id this actor answers to: their uid, their customer token, their role token. */
export function actorTokens(actor: MvpActor): string[] {
  const tokens = [actor.userId, `role:${actor.role}`];
  if (actor.role === 'customer' && actor.customerId) tokens.push(customerToken(actor.customerId));
  return tokens;
}

export function isAssignee(task: Pick<Task, 'assigneeId'>, actor: MvpActor): boolean {
  return actorTokens(actor).includes(task.assigneeId);
}

function requireRole(actor: MvpActor, roles: CanonicalUserRole[], action: string): void {
  if (!roles.includes(actor.role)) throw new MvpError('forbidden', `Role "${actor.role}" cannot ${action}.`);
}

export const leadRepository = (ctx: RepositoryContext) => getRepository<MvpLead>('leads', ctx);

type OrderRecord = Project & { version?: number };

async function audit(
  ctx: MvpCtx, actor: MvpActor, action: string, entityType: string, entityId: string,
  orderId: string | undefined, before: unknown, after: unknown, reason?: string,
): Promise<void> {
  await recordAuditEvent(ctx, {
    actorId: actor.userId, actorRole: actor.role, action, entityType, entityId, projectId: orderId,
    before, after, reason, source: 'ui', correlationId: newCorrelationId(),
  });
}

async function loadOrder(ctx: MvpCtx, orderId: string): Promise<OrderRecord> {
  const order = await projectRepository(ctx).get(orderId);
  if (!order) throw new MvpError('not_found', `Order ${orderId} not found.`);
  return order as OrderRecord;
}

export async function listOrderTasks(ctx: MvpCtx, orderId: string): Promise<Task[]> {
  return taskRepository(ctx).query({ orderId } as Partial<Task>);
}

export function snapshotOf(order: OrderRecord): OrderSnapshot {
  return {
    stage: toMvpStage(order.stage),
    status: order.status ?? 'ACTIVE',
    customerToken: customerToken(order.customerId),
    ownerUserId: order.ownerUserId,
  };
}

/** D-12 participant model: sales owner + customer token + every open-task assignee uid. */
export function computeParticipants(order: Pick<Project, 'ownerUserId' | 'customerId'>, tasks: Pick<Task, 'status' | 'assigneeId'>[]): string[] {
  const ids = new Set<string>([order.ownerUserId, customerToken(order.customerId)]);
  for (const t of tasks) if (isOpenTask(t) && !t.assigneeId.startsWith('role:')) ids.add(t.assigneeId);
  return [...ids].filter(Boolean).sort();
}

async function nextTaskNumber(ctx: MvpCtx, scopeTasks: Task[], type: TaskType): Promise<number> {
  return scopeTasks.filter(t => t.type === type).length + 1;
}

async function createTaskFromSpec(
  ctx: MvpCtx, actor: MvpActor, scope: { orderId?: string; leadId?: string }, spec: TaskSpec, existing: Task[],
): Promise<Task | null> {
  const now = nowOf(ctx).toISOString();
  const scopeId = scope.orderId ?? `lead_${scope.leadId}`;
  // Deterministic id: concurrent creators of the same (order, type, n) converge on one document.
  for (let attempt = 0; attempt < 3; attempt++) {
    const n = (await nextTaskNumber(ctx, existing, spec.type)) + attempt;
    const task: Task = {
      id: `${scopeId}__${spec.type}__${n}` as Task['id'],
      orderId: scope.orderId as Task['orderId'],
      leadId: scope.leadId as Task['leadId'],
      type: spec.type,
      title: spec.title,
      stage: spec.stage,
      assigneeId: spec.assignee.id,
      assigneeRole: spec.assignee.role,
      status: 'TODO',
      primary: spec.primary,
      dueDate: spec.dueDate,
      evidenceIds: [],
      ...(spec.notes ? { notes: spec.notes } : {}),
      createdBy: actor.userId,
      createdAt: now,
      updatedAt: now,
      version: 0,
    };
    if (await createIfAbsent(ctx, 'tasks', task)) {
      await notify(ctx, task.assigneeId, 'mvp_task_assigned', scope.orderId, task.id);
      return task;
    }
    const clash = await taskRepository(ctx).get(task.id);
    if (clash && isOpenTask(clash)) return null; // someone else created the same open task: converge (I-2)
  }
  throw new MvpError('invalid', `Could not allocate a task id for ${spec.type}.`);
}

async function setTaskStatus(ctx: MvpCtx, task: Task, status: Task['status'], extra: Partial<Task> = {}): Promise<Task> {
  const now = nowOf(ctx).toISOString();
  const patch: Partial<Task> = { status, updatedAt: now, ...extra };
  if (status === 'COMPLETED') patch.completedAt = now;
  return taskRepository(ctx).update(task.id, patch, task.version ?? 0);
}

async function updateOrder(ctx: MvpCtx, actor: MvpActor, orderId: string, patch: Partial<OrderRecord>): Promise<OrderRecord> {
  const repo = projectRepository(ctx);
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await loadOrder(ctx, orderId);
    try {
      return (await repo.update(orderId, { ...patch, updatedAt: nowOf(ctx).toISOString(), updatedBy: actor.userId } as any, current.version ?? 0)) as OrderRecord;
    } catch (err: any) {
      if (err?.code !== 'stale_write' || attempt === 2) throw err;
    }
  }
  throw new Error('unreachable');
}

async function refreshParticipants(ctx: MvpCtx, actor: MvpActor, orderId: string): Promise<void> {
  const order = await loadOrder(ctx, orderId);
  const participants = computeParticipants(order, await listOrderTasks(ctx, orderId));
  if (JSON.stringify(participants) !== JSON.stringify(order.participantIds ?? [])) {
    await updateOrder(ctx, actor, orderId, { participantIds: participants });
  }
}

async function syncLeadStatus(ctx: MvpCtx, order: OrderRecord, status: MvpLeadStatus): Promise<void> {
  if (!order.sourceLeadId) return;
  const repo = leadRepository(ctx);
  const lead = await repo.get(order.sourceLeadId);
  if (!lead || leadStatus(lead) === status) return;
  if (leadStatus(lead) === 'WON' && status === 'LOST') return; // a won lead stays won
  await repo.update(lead.id, { mvpStatus: status, stage: LEGACY_STAGE_FOR[status], updatedAt: nowOf(ctx).toISOString() });
}

export interface ApplyResult {
  order: OrderRecord;
  created: Task[];
  completed: Task[];
}

/**
 * Applies one D-08 event to an order: completes/cancels tasks, creates the next tasks
 * (deduplicated, I-2), moves stage (forward only, I-4) and status, recomputes participants,
 * audits every change (I-3) and mirrors the lead status (D-04).
 */
export async function applyEvent(
  ctx: MvpCtx, actor: MvpActor, orderId: string, event: MvpEvent,
  opts: { reason?: string; orderPatch?: Partial<OrderRecord> } = {},
): Promise<ApplyResult> {
  const order = await loadOrder(ctx, orderId);
  const now = nowOf(ctx);
  const before = snapshotOf(order);
  const outcome = outcomeFor(event, before, now);
  // Validate before any write, so a rejected event leaves no partial changes.
  if (outcome.nextStage && !isForward(before.stage, outcome.nextStage)) {
    throw new MvpError('invalid', `Stage cannot move back from ${before.stage} to ${outcome.nextStage} without an Admin override.`);
  }
  let tasks = await listOrderTasks(ctx, orderId);

  const completed: Task[] = [];
  for (const t of tasks) {
    if (!isOpenTask(t)) continue;
    if (outcome.cancelOpenTasks) {
      completed.push(await setTaskStatus(ctx, t, 'CANCELLED'));
    } else if (outcome.completeTypes.includes(t.type)) {
      completed.push(await setTaskStatus(ctx, t, 'COMPLETED'));
    }
  }
  tasks = await listOrderTasks(ctx, orderId);

  const openTypes = tasks.filter(isOpenTask).map(t => t.type);
  const created: Task[] = [];
  for (const s of dedupe(outcome.create, openTypes)) {
    const task = await createTaskFromSpec(ctx, actor, { orderId }, s, [...tasks, ...created]);
    if (task) created.push(task);
  }

  const patch: Partial<OrderRecord> = { ...opts.orderPatch };
  if (outcome.nextStage && outcome.nextStage !== before.stage) {
    patch.stage = TO_PROJECT_STAGE[outcome.nextStage];
  }
  if (outcome.nextStatus && outcome.nextStatus !== before.status) patch.status = outcome.nextStatus;
  // Customers may not change participantIds (firestore.rules); staff/Admin refresh them.
  // The only customer event that assigns a uid is EMERGENCY_RAISED, whose technician works
  // from the task and the service case (both readable by the assignee) instead.
  const participants = computeParticipants(order, await listOrderTasks(ctx, orderId));
  if (actor.role !== 'customer' && JSON.stringify(participants) !== JSON.stringify(order.participantIds ?? [])) {
    patch.participantIds = participants;
  }

  const updated = await updateOrder(ctx, actor, orderId, patch);

  if (patch.stage) {
    await audit(ctx, actor, 'ORDER_STAGE_CHANGED', 'Project', orderId, orderId,
      { stage: before.stage }, { stage: outcome.nextStage, event: event.type }, opts.reason);
  }
  if (patch.status) {
    await audit(ctx, actor, 'ORDER_STATUS_CHANGED', 'Project', orderId, orderId,
      { status: before.status }, { status: patch.status, event: event.type }, opts.reason);
  }
  for (const t of completed) {
    await audit(ctx, actor, t.status === 'CANCELLED' ? 'TASK_CANCELLED' : 'TASK_COMPLETED', 'Task', t.id, orderId,
      { status: 'OPEN' }, { status: t.status, event: event.type }, opts.reason);
  }

  // D-04 lead mirroring.
  const newStage = outcome.nextStage;
  if (newStage === 'SURVEY') await syncLeadStatus(ctx, updated, 'SURVEY');
  if (newStage === 'QUOTE') await syncLeadStatus(ctx, updated, 'QUOTE');
  if (event.type === 'PAYMENT_PAID' && event.kind === 'BOOKING_TOKEN') await syncLeadStatus(ctx, updated, 'WON');
  if (event.type === 'ORDER_CANCELLED') await syncLeadStatus(ctx, updated, 'LOST');

  return { order: updated, created, completed };
}

// ---------------------------------------------------------------------------
// Leads and qualification (D-04)
// ---------------------------------------------------------------------------

export interface NewLeadInput {
  name: string;
  phone: string;
  location: string;
  source?: string;
  siteType?: 'residential' | 'commercial' | 'industrial' | 'institutional' | 'mixed-use';
  floors?: number;
  liftRequirement?: string;
  constructionStage?: 'foundation' | 'structure-up' | 'finishing' | 'ready';
  notes?: string;
  nextFollowUp?: string;
  consent: boolean;
  latitude?: number;
  longitude?: number;
  photoIds?: string[];
}

/** Indian mobile: 10 digits starting 6–9, optional +91/0 prefix. */
export function normalizeIndianMobile(phone: string): string | null {
  const digits = phone.replace(/[\s-]/g, '').replace(/^(\+91|0091|91(?=\d{10}$)|0)/, '');
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export async function createLead(ctx: MvpCtx, actor: MvpActor, input: NewLeadInput): Promise<MvpLead> {
  requireRole(actor, ['admin', 'sales'], 'create leads');
  const name = requireText(input.name, 'Customer name');
  const phone = normalizeIndianMobile(input.phone ?? '');
  if (!phone) throw new MvpError('invalid', 'Enter a valid 10-digit Indian mobile number.');
  const location = requireText(input.location, 'Location');
  if (!input.consent) throw new MvpError('invalid', 'The customer must give consent to be contacted.');
  if (input.floors !== undefined && (!Number.isFinite(input.floors) || input.floors < 1 || input.floors > 200)) {
    throw new MvpError('invalid', 'Floors must be a number between 1 and 200.');
  }

  const now = nowOf(ctx).toISOString();
  const id = `lead_${nowOf(ctx).getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const lead: MvpLead = {
    id,
    stage: 'captured',
    contactInfo: { name, phone, email: '', consentGiven: true },
    buildingInfo: {
      address: location,
      floors: input.floors ?? 0,
      type: input.siteType ?? 'residential',
      construction_stage: input.constructionStage,
      latitude: input.latitude,
      longitude: input.longitude,
    },
    createdAt: now,
    updatedAt: now,
    ownerUserId: actor.userId,
    source: input.source,
    liftRequirement: input.liftRequirement,
    notes: input.notes,
    nextFollowUp: input.nextFollowUp,
    mvpStatus: 'NEW',
    consentAt: now,
    phoneNormalized: phone,
    photoIds: input.photoIds ?? [],
    version: 0,
  };
  const saved = await leadRepository(ctx).create(JSON.parse(JSON.stringify(lead)));

  const outcome = outcomeFor({ type: 'LEAD_CREATED', salesUserId: actor.userId }, {
    stage: 'LEAD', customerToken: '', ownerUserId: actor.userId,
  }, nowOf(ctx));
  for (const s of outcome.create) await createTaskFromSpec(ctx, actor, { leadId: id }, s, []);
  await audit(ctx, actor, 'LEAD_CREATED', 'Lead', id, undefined, undefined, { name, phone, source: input.source });
  return saved;
}

export async function listLeadTasks(ctx: MvpCtx, leadId: string): Promise<Task[]> {
  return taskRepository(ctx).query({ leadId } as Partial<Task>);
}

export async function updateLeadStatus(ctx: MvpCtx, actor: MvpActor, leadId: string, status: 'CONTACTED' | 'LOST', note?: string): Promise<MvpLead> {
  requireRole(actor, ['admin', 'sales'], 'update leads');
  const repo = leadRepository(ctx);
  const lead = await repo.get(leadId);
  if (!lead) throw new MvpError('not_found', `Lead ${leadId} not found.`);
  if (actor.role === 'sales' && leadOwner(lead) !== actor.userId) throw new MvpError('forbidden', 'This is not your lead.');
  if (status === 'LOST') requireText(note, 'A reason for losing the lead');
  const updated = await repo.update(leadId, {
    mvpStatus: status, stage: LEGACY_STAGE_FOR[status], updatedAt: nowOf(ctx).toISOString(),
    ...(status === 'LOST' ? { lostReasonText: note, lostAt: nowOf(ctx).toISOString(), marked_lost_by: actor.userId } : {}),
  });
  if (status === 'LOST') {
    for (const t of (await listLeadTasks(ctx, leadId)).filter(isOpenTask)) await setTaskStatus(ctx, t, 'CANCELLED');
  }
  await audit(ctx, actor, 'LEAD_STATUS_CHANGED', 'Lead', leadId, undefined, { status: leadStatus(lead) }, { status }, note);
  return updated;
}

function orderCode(n: number): string {
  return `AE-${String(1000 + n)}`;
}

/**
 * Lead QUALIFIED → Customer + Site + Order (with `AE-####`) + ASSIGN_SURVEYOR task (D-04, D-08).
 * Convergent rather than one transaction: every record has a deterministic id derived from
 * the lead and is written with createIfAbsent, and the whole call is idempotent per lead, so
 * a retry after a partial failure completes the same records instead of duplicating them.
 */
export async function qualifyLead(ctx: MvpCtx, actor: MvpActor, leadId: string, opts: { liftSummary?: string; surveyFeeInr?: number } = {}): Promise<OrderRecord> {
  requireRole(actor, ['admin', 'sales'], 'qualify leads');
  const lead = await leadRepository(ctx).get(leadId);
  if (!lead) throw new MvpError('not_found', `Lead ${leadId} not found.`);
  if (actor.role === 'sales' && leadOwner(lead) !== actor.userId) throw new MvpError('forbidden', 'This is not your lead.');
  if (lead.projectId) return loadOrder(ctx, lead.projectId);
  if (leadStatus(lead) === 'LOST') throw new MvpError('invalid', 'A lost lead cannot be qualified.');

  const { result } = await runIdempotent(ctx, 'mvp.qualifyLead', leadId, async () => {
    const now = nowOf(ctx).toISOString();
    const customerId = `cust_${leadId}`;
    const siteId = `site_${leadId}`;
    const orderId = `ord_${leadId}`;
    const customer: Customer = {
      id: customerId as Customer['id'], name: lead.contactInfo.name, phone: lead.contactInfo.phone,
      email: lead.contactInfo.email || undefined, sourceLeadId: leadId as Customer['sourceLeadId'], createdAt: now, updatedAt: now,
    };
    const site: Site = {
      id: siteId as Site['id'], customerId: customerId as Site['customerId'], address: lead.buildingInfo.address,
      latitude: lead.buildingInfo.latitude, longitude: lead.buildingInfo.longitude,
      buildingType: lead.buildingInfo.type, floors: lead.buildingInfo.floors || undefined, createdAt: now, updatedAt: now,
    };
    await createIfAbsent(ctx, 'customers', JSON.parse(JSON.stringify(customer)));
    await createIfAbsent(ctx, 'sites', JSON.parse(JSON.stringify(site)));

    if (!(await projectRepository(ctx).get(orderId))) {
      const code = orderCode(await nextSequence(ctx, 'orders'));
      const owner = leadOwner(lead) ?? actor.userId;
      const order: OrderRecord = {
        id: orderId as Project['id'], customerId: customer.id, siteId: site.id, sourceLeadId: leadId as Project['sourceLeadId'],
        stage: 'lead', ownerUserId: owner as Project['ownerUserId'], title: `${lead.contactInfo.name} — ${lead.buildingInfo.address}`,
        createdAt: now, updatedAt: now, displaySummary: { customerName: lead.contactInfo.name, siteAddress: lead.buildingInfo.address, customerPhone: lead.contactInfo.phone },
        displayCode: code, status: 'ACTIVE', participantIds: computeParticipants({ ownerUserId: owner as any, customerId: customer.id }, []),
        checklistDone: 0, liftSummary: opts.liftSummary ?? lead.liftRequirement, version: 0, updatedBy: actor.userId,
      };
      if (await createIfAbsent(ctx, 'projects', JSON.parse(JSON.stringify(order)))) {
        await audit(ctx, actor, 'ORDER_CREATED', 'Project', orderId, orderId, undefined, { displayCode: code, fromLead: leadId });
      }
    }

    for (const t of (await listLeadTasks(ctx, leadId)).filter(isOpenTask)) await setTaskStatus(ctx, t, 'COMPLETED');
    await leadRepository(ctx).update(leadId, { mvpStatus: 'QUALIFIED', stage: LEGACY_STAGE_FOR.QUALIFIED, projectId: orderId, updatedAt: now });
    await audit(ctx, actor, 'LEAD_QUALIFIED', 'Lead', leadId, orderId, { status: leadStatus(lead) }, { status: 'QUALIFIED', orderId });

    // The per-call override exists only for demo-repository checks; real orders always use config (D-30).
    const fee = ctx.environment === 'demo' && opts.surveyFeeInr !== undefined ? opts.surveyFeeInr : SURVEY_FEE_INR;
    if (fee > 0) {
      // D-30: the survey fee is a payment milestone collected (or waived) before the survey.
      await createIfAbsent(ctx, 'payment_milestones', {
        id: `ms_${orderId}_SURVEY_FEE` as PaymentMilestone['id'], orderId: orderId as PaymentMilestone['orderId'], kind: 'SURVEY_FEE', label: 'Survey fee', amount: fee,
        dueDate: addDays(nowOf(ctx), DUE_DAYS.COLLECT_SURVEY_FEE).toISOString(), status: 'PENDING', amountReceived: 0,
        createdAt: now, updatedAt: now, version: 0,
      } satisfies PaymentMilestone);
    }
    await applyEvent(ctx, actor, orderId, { type: 'LEAD_QUALIFIED', surveyFeeInr: fee });
    return orderId;
  });
  return loadOrder(ctx, result ?? `ord_${leadId}`);
}

// ---------------------------------------------------------------------------
// Survey (spec §15)
// ---------------------------------------------------------------------------

/** D-30: the Admin waives the survey fee with a reason (audited); the surveyor can then be assigned. */
export async function waiveSurveyFee(ctx: MvpCtx, actor: MvpActor, orderId: string, reason: string): Promise<void> {
  requireRole(actor, ['admin'], 'waive the survey fee');
  requireText(reason, 'A reason');
  const repo = paymentMilestoneRepository(ctx);
  const fee = await repo.get(`ms_${orderId}_SURVEY_FEE`);
  if (!fee || fee.status === 'PAID' || fee.waived) throw new MvpError('invalid', 'There is no unpaid survey fee on this order.');
  await repo.update(fee.id, { waived: true, notes: reason, updatedAt: nowOf(ctx).toISOString() }, fee.version ?? 0);
  await applyEvent(ctx, actor, orderId, { type: 'PAYMENT_PAID', kind: 'SURVEY_FEE' }, { reason });
  await audit(ctx, actor, 'SURVEY_FEE_WAIVED', 'PaymentMilestone', `ms_${orderId}_SURVEY_FEE`, orderId, { waived: false }, { waived: true }, reason);
}

export async function assignSurveyor(ctx: MvpCtx, actor: MvpActor, orderId: string, surveyorId: string, date?: string): Promise<ApplyResult> {
  requireRole(actor, ['admin'], 'assign surveyors');
  requireText(surveyorId, 'Surveyor');
  const order = await loadOrder(ctx, orderId);
  const tasks = await listOrderTasks(ctx, orderId);
  const feeOpen = tasks.find(t => t.type === 'COLLECT_SURVEY_FEE' && isOpenTask(t));
  if (feeOpen) throw new MvpError('gate', 'Collect or waive the survey fee before assigning a surveyor (D-30).');
  const result = await applyEvent(ctx, actor, orderId, { type: 'SURVEYOR_ASSIGNED', surveyorId, date });
  await notify(ctx, surveyorId, 'mvp_survey_scheduled', orderId, `survey:${orderId}:${surveyorId}`);
  await notify(ctx, customerToken(order.customerId), 'mvp_survey_scheduled', orderId, `survey:${orderId}`);
  return result;
}

export interface SurveyInput {
  floors: number; stops: number; capacityPersons: number;
  shaftWidthMm: number; shaftDepthMm: number; pitMm: number; headroomMm: number;
  power: string; access: string; siteReadiness: string; remarks: string;
  photoIds: string[]; result: SurveyResult;
}

export function validateSurvey(input: SurveyInput): string[] {
  const errors: string[] = [];
  const positive = (v: number, what: string, max: number) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > max) errors.push(`${what} must be a number between 1 and ${max}.`);
  };
  positive(input.floors, 'Floors', 200);
  positive(input.stops, 'Stops', 200);
  positive(input.capacityPersons, 'Capacity (persons)', 50);
  positive(input.shaftWidthMm, 'Shaft width (mm)', 10000);
  positive(input.shaftDepthMm, 'Shaft depth (mm)', 10000);
  positive(input.pitMm, 'Pit (mm)', 10000);
  positive(input.headroomMm, 'Headroom (mm)', 10000);
  if ((input.photoIds ?? []).length < 2) errors.push('At least 2 photos are required.');
  if (!['FEASIBLE', 'REQUIRES_CORRECTION', 'NOT_FEASIBLE'].includes(input.result)) errors.push('Choose a survey result.');
  return errors;
}

export async function submitSurvey(ctx: MvpCtx, actor: MvpActor, orderId: string, input: SurveyInput): Promise<{ survey: SiteSurvey; applied: ApplyResult }> {
  const tasks = await listOrderTasks(ctx, orderId);
  const surveyTask = tasks.find(t => t.type === 'SURVEY' && isOpenTask(t));
  if (!surveyTask) throw new MvpError('invalid', 'There is no open survey task for this order.');
  if (actor.role !== 'admin' && !isAssignee(surveyTask, actor)) throw new MvpError('forbidden', 'This survey is assigned to someone else.');
  const errors = validateSurvey(input);
  if (errors.length) throw new MvpError('invalid', errors.join(' '));

  const n = tasks.filter(t => t.type === 'SURVEY').length;
  const survey: SiteSurvey = {
    id: `survey_${orderId}_${n}` as SiteSurvey['id'], orderId: orderId as SiteSurvey['orderId'], surveyorId: actor.userId,
    ...input, submittedAt: nowOf(ctx).toISOString(),
  };
  await createIfAbsent(ctx, 'surveys', survey);
  const applied = await applyEvent(ctx, actor, orderId, { type: 'SURVEY_RESULT', result: input.result });
  await audit(ctx, actor, 'SURVEY_SUBMITTED', 'SiteSurvey', survey.id, orderId, undefined, { result: input.result });
  return { survey, applied };
}

export async function getLatestSurvey(ctx: MvpCtx, orderId: string): Promise<SiteSurvey | null> {
  const list = await siteSurveyRepository(ctx).query({ orderId } as Partial<SiteSurvey>);
  return list.sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))[0] ?? null;
}

// ---------------------------------------------------------------------------
// Generic task operations (Admin intervention, S7)
// ---------------------------------------------------------------------------

/** Task types whose completion is itself a D-08 event. Others just complete. */
const COMPLETION_EVENTS: Partial<Record<TaskType, (order: OrderRecord, tasks: Task[]) => MvpEvent>> = {
  SITE_CORRECTION: () => ({ type: 'CORRECTION_COMPLETED' }),
};

export async function completeTask(ctx: MvpCtx, actor: MvpActor, taskId: string, note?: string, evidenceIds: string[] = []): Promise<Task> {
  const task = await taskRepository(ctx).get(taskId);
  if (!task) throw new MvpError('not_found', `Task ${taskId} not found.`);
  if (!isOpenTask(task)) return task;
  if (actor.role !== 'admin' && !isAssignee(task, actor)) throw new MvpError('forbidden', 'This task is assigned to someone else.');
  if (task.status === 'BLOCKED') throw new MvpError('gate', 'Resolve the open blocker before completing this task.');

  const eventFor = COMPLETION_EVENTS[task.type];
  if (task.orderId && eventFor) {
    const order = await loadOrder(ctx, task.orderId);
    await applyEvent(ctx, actor, task.orderId, eventFor(order, await listOrderTasks(ctx, task.orderId)), { reason: note });
    return (await taskRepository(ctx).get(taskId))!;
  }
  const done = await setTaskStatus(ctx, task, 'COMPLETED', {
    notes: note ?? task.notes, evidenceIds: [...(task.evidenceIds ?? []), ...evidenceIds],
  });
  await audit(ctx, actor, 'TASK_COMPLETED', 'Task', taskId, task.orderId, { status: task.status }, { status: 'COMPLETED' }, note);
  if (task.orderId) await refreshParticipants(ctx, actor, task.orderId);
  return done;
}

export async function setTaskInProgress(ctx: MvpCtx, actor: MvpActor, taskId: string): Promise<Task> {
  const task = await taskRepository(ctx).get(taskId);
  if (!task) throw new MvpError('not_found', `Task ${taskId} not found.`);
  if (actor.role !== 'admin' && !isAssignee(task, actor)) throw new MvpError('forbidden', 'This task is assigned to someone else.');
  if (task.status !== 'TODO') return task;
  const updated = await setTaskStatus(ctx, task, 'IN_PROGRESS');
  await audit(ctx, actor, 'TASK_STARTED', 'Task', taskId, task.orderId, { status: 'TODO' }, { status: 'IN_PROGRESS' });
  return updated;
}

export async function reassignTask(ctx: MvpCtx, actor: MvpActor, taskId: string, assignee: Assignee, reason?: string): Promise<Task> {
  requireRole(actor, ['admin'], 'reassign tasks');
  const task = await taskRepository(ctx).get(taskId);
  if (!task) throw new MvpError('not_found', `Task ${taskId} not found.`);
  if (!isOpenTask(task)) throw new MvpError('invalid', 'Only open tasks can be reassigned.');
  requireText(assignee.id, 'Assignee');
  const updated = await taskRepository(ctx).update(taskId, {
    assigneeId: assignee.id, assigneeRole: assignee.role, updatedAt: nowOf(ctx).toISOString(),
  }, task.version ?? 0);
  await audit(ctx, actor, 'TASK_REASSIGNED', 'Task', taskId, task.orderId, { assigneeId: task.assigneeId }, { assigneeId: assignee.id }, reason);
  if (task.orderId && task.type === 'INSTALLATION' && assignee.role === 'technician') {
    await syncInstallationJob(ctx, task.orderId, assignee.id);
  }
  await notify(ctx, assignee.id, 'mvp_task_assigned', task.orderId, `${taskId}:reassign:${assignee.id}`);
  if (task.orderId) await refreshParticipants(ctx, actor, task.orderId);
  return updated;
}

/** The InstallationJob follows the INSTALLATION task's technician (created on first assignment). */
export async function syncInstallationJob(ctx: MvpCtx, orderId: string, technicianId: string): Promise<void> {
  const repo = installationJobRepository(ctx);
  const id = `job_${orderId}`;
  const job = await repo.get(id);
  if (!job) {
    await createIfAbsent(ctx, 'installation_jobs', {
      id, projectId: orderId, technicianId, status: 'assigned', siteReadinessConfirmed: true, checklist: {}, version: 0,
    });
  } else if (job.technicianId !== technicianId) {
    await repo.update(id, { technicianId: technicianId as any }, job.version ?? 0);
  }
}

export async function changeDueDate(ctx: MvpCtx, actor: MvpActor, taskId: string, dueDate: string, reason?: string): Promise<Task> {
  requireRole(actor, ['admin'], 'change due dates');
  const task = await taskRepository(ctx).get(taskId);
  if (!task) throw new MvpError('not_found', `Task ${taskId} not found.`);
  if (Number.isNaN(new Date(dueDate).getTime())) throw new MvpError('invalid', 'Enter a valid due date.');
  const updated = await taskRepository(ctx).update(taskId, { dueDate, updatedAt: nowOf(ctx).toISOString() }, task.version ?? 0);
  await audit(ctx, actor, 'TASK_DUE_CHANGED', 'Task', taskId, task.orderId, { dueDate: task.dueDate }, { dueDate }, reason);
  return updated;
}

/** One-click "create next task" for a NO NEXT ACTION order (D-06). */
export async function createAdminTask(
  ctx: MvpCtx, actor: MvpActor, orderId: string, input: { type?: TaskType; title?: string; assignee?: Assignee; dueDate?: string },
): Promise<Task | null> {
  requireRole(actor, ['admin'], 'create tasks');
  const order = await loadOrder(ctx, orderId);
  const type = input.type ?? 'REVIEW_ORDER';
  const spec: TaskSpec = {
    type, title: input.title ?? TASK_TITLES[type],
    assignee: input.assignee ?? { id: 'role:admin', role: 'admin' },
    dueDate: input.dueDate ?? addDays(nowOf(ctx), DUE_DAYS.REVIEW_ORDER).toISOString(),
    stage: toMvpStage(order.stage), primary: true,
  };
  const tasks = await listOrderTasks(ctx, orderId);
  if (tasks.some(t => t.type === type && isOpenTask(t))) return null;
  const task = await createTaskFromSpec(ctx, actor, { orderId }, spec, tasks);
  if (task) await audit(ctx, actor, 'TASK_CREATED', 'Task', task.id, orderId, undefined, { type, assigneeId: task.assigneeId, dueDate: task.dueDate });
  await refreshParticipants(ctx, actor, orderId);
  return task;
}

// ---------------------------------------------------------------------------
// Order status: hold / resume / cancel / override (D-24, D-25, I-4)
// ---------------------------------------------------------------------------

export async function putOnHold(ctx: MvpCtx, actor: MvpActor, orderId: string, reason: string, reviewDate?: string): Promise<ApplyResult> {
  requireRole(actor, ['admin'], 'put orders on hold');
  requireText(reason, 'A reason');
  const order = await loadOrder(ctx, orderId);
  if ((order.status ?? 'ACTIVE') !== 'ACTIVE') throw new MvpError('invalid', 'Only an active order can be put on hold.');
  return applyEvent(ctx, actor, orderId, { type: 'ORDER_ON_HOLD', reviewDate }, {
    reason, orderPatch: { statusReason: reason, holdReviewDate: reviewDate },
  });
}

export async function resumeOrder(ctx: MvpCtx, actor: MvpActor, orderId: string, note?: string): Promise<ApplyResult> {
  requireRole(actor, ['admin'], 'resume orders');
  const order = await loadOrder(ctx, orderId);
  if (order.status !== 'ON_HOLD') throw new MvpError('invalid', 'The order is not on hold.');
  return applyEvent(ctx, actor, orderId, { type: 'ORDER_RESUMED' }, { reason: note, orderPatch: { statusReason: '', holdReviewDate: '' } });
}

export async function cancelOrder(ctx: MvpCtx, actor: MvpActor, orderId: string, reason: string): Promise<ApplyResult> {
  requireRole(actor, ['admin'], 'cancel orders');
  requireText(reason, 'A reason');
  const order = await loadOrder(ctx, orderId);
  if (order.status === 'CANCELLED' || order.status === 'COMPLETED') throw new MvpError('invalid', `The order is already ${order.status}.`);
  return applyEvent(ctx, actor, orderId, { type: 'ORDER_CANCELLED' }, { reason, orderPatch: { statusReason: reason } });
}

/** Admin-only stage override (I-4): the one way to move a stage backwards. Always audited with a reason. */
export async function overrideStage(ctx: MvpCtx, actor: MvpActor, orderId: string, stage: MvpStage, reason: string): Promise<OrderRecord> {
  requireRole(actor, ['admin'], 'override stages');
  requireText(reason, 'A reason');
  const order = await loadOrder(ctx, orderId);
  const before = toMvpStage(order.stage);
  if (stageIndex(stage) < 0) throw new MvpError('invalid', `Unknown stage ${stage}.`);
  const updated = await updateOrder(ctx, actor, orderId, { stage: TO_PROJECT_STAGE[stage] });
  await audit(ctx, actor, 'ORDER_STAGE_OVERRIDE', 'Project', orderId, orderId, { stage: before }, { stage }, reason);
  return updated;
}

// ---------------------------------------------------------------------------
// Blockers (D-07)
// ---------------------------------------------------------------------------

const CUSTOMER_OWNED: ReadonlySet<BlockerReason> = new Set(['CUSTOMER_NOT_READY', 'POWER_UNAVAILABLE', 'PAYMENT_PENDING']);
export const BLOCKER_REASONS: BlockerReason[] = [
  'CUSTOMER_NOT_READY', 'MATERIAL_MISSING', 'POWER_UNAVAILABLE', 'SITE_UNSAFE',
  'WRONG_MEASUREMENT', 'PAYMENT_PENDING', 'SUPPLIER_DELAY', 'OTHER',
];

export async function raiseBlocker(
  ctx: MvpCtx, actor: MvpActor,
  input: { orderId: string; taskId?: string; reason: BlockerReason; description: string; evidence?: string[] },
): Promise<Blocker> {
  requireRole(actor, ['admin', 'surveyor', 'technician', 'qc', 'customer', 'sales'], 'raise blockers');
  if (!BLOCKER_REASONS.includes(input.reason)) throw new MvpError('invalid', 'Choose one of the 8 blocker reasons.');
  const description = requireText(input.description, 'A description');
  const order = await loadOrder(ctx, input.orderId);
  if (actor.role !== 'admin' && !(order.participantIds ?? []).some(p => actorTokens(actor).includes(p))) {
    throw new MvpError('forbidden', 'You are not part of this order.');
  }
  const now = nowOf(ctx);
  const blocker: Blocker = {
    id: `blk_${input.orderId}_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 6)}` as Blocker['id'],
    orderId: input.orderId as Blocker['orderId'],
    taskId: input.taskId as Blocker['taskId'],
    reason: input.reason,
    description,
    evidence: input.evidence ?? [],
    ownerUserId: CUSTOMER_OWNED.has(input.reason) ? customerToken(order.customerId) : 'role:admin',
    status: 'OPEN',
    dueDate: addDays(now, BLOCKER_DUE_DAYS).toISOString(),
    createdAt: now.toISOString(),
    createdBy: actor.userId,
    version: 0,
  };
  await blockerRepository(ctx).create(JSON.parse(JSON.stringify(blocker)));
  if (input.taskId) {
    const task = await taskRepository(ctx).get(input.taskId);
    // Only the task's assignee (or the Admin) changes its status; anyone else's blocker still
    // turns the order's health BLOCKED through the open blocker itself (D-11).
    if (task && isOpenTask(task) && task.status !== 'BLOCKED' && (actor.role === 'admin' || isAssignee(task, actor))) {
      await setTaskStatus(ctx, task, 'BLOCKED', { previousStatus: task.status });
    }
  }
  await audit(ctx, actor, 'BLOCKER_RAISED', 'Blocker', blocker.id, input.orderId, undefined, { reason: input.reason, taskId: input.taskId, ownerUserId: blocker.ownerUserId });
  await notify(ctx, 'role:admin', 'mvp_blocker_raised', input.orderId, blocker.id);
  if (blocker.ownerUserId !== 'role:admin') await notify(ctx, blocker.ownerUserId, 'mvp_blocker_raised', input.orderId, blocker.id);
  return blocker;
}

export async function resolveBlocker(ctx: MvpCtx, actor: MvpActor, blockerId: string, note: string): Promise<Blocker> {
  const repo = blockerRepository(ctx);
  const blocker = await repo.get(blockerId);
  if (!blocker) throw new MvpError('not_found', `Blocker ${blockerId} not found.`);
  if (blocker.status === 'RESOLVED') return blocker;
  if (actor.role !== 'admin' && !actorTokens(actor).includes(blocker.ownerUserId)) {
    throw new MvpError('forbidden', 'Only the Admin or the blocker owner can resolve it.');
  }
  const resolutionNote = requireText(note, 'A resolution note');
  const now = nowOf(ctx).toISOString();
  const resolved = await repo.update(blockerId, { status: 'RESOLVED', resolutionNote, resolvedAt: now, resolvedBy: actor.userId }, blocker.version ?? 0);
  if (blocker.taskId) {
    const stillOpen = (await repo.query({ taskId: blocker.taskId, status: 'OPEN' } as Partial<Blocker>)).length > 0;
    const task = await taskRepository(ctx).get(blocker.taskId);
    if (task && task.status === 'BLOCKED' && !stillOpen) {
      await setTaskStatus(ctx, task, task.previousStatus ?? 'TODO', { previousStatus: undefined as any });
    }
  }
  await audit(ctx, actor, 'BLOCKER_RESOLVED', 'Blocker', blockerId, blocker.orderId, { status: 'OPEN' }, { status: 'RESOLVED' }, resolutionNote);
  return resolved;
}

export async function reassignBlocker(ctx: MvpCtx, actor: MvpActor, blockerId: string, ownerId: string, reason?: string): Promise<Blocker> {
  requireRole(actor, ['admin'], 'reassign blockers');
  const repo = blockerRepository(ctx);
  const blocker = await repo.get(blockerId);
  if (!blocker) throw new MvpError('not_found', `Blocker ${blockerId} not found.`);
  const updated = await repo.update(blockerId, { ownerUserId: requireText(ownerId, 'Owner') }, blocker.version ?? 0);
  await audit(ctx, actor, 'BLOCKER_REASSIGNED', 'Blocker', blockerId, blocker.orderId, { ownerUserId: blocker.ownerUserId }, { ownerUserId: ownerId }, reason);
  return updated;
}

export async function listOpenBlockers(ctx: MvpCtx, orderId: string): Promise<Blocker[]> {
  return blockerRepository(ctx).query({ orderId, status: 'OPEN' } as Partial<Blocker>);
}

export type { OrderRecord, OrderStatus };
