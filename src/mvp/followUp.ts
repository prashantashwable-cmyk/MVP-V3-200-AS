/**
 * D-32 follow-up ladder: the app chases open work until it is done, by fixed rules.
 * Pure; `now` is injected (like health.ts). No AI, no learning, no scoring of people.
 *
 * `followUpsFor` lists what needs chasing and how far it has escalated:
 *   L0 due soon → the assignee
 *   L1 overdue → the assignee
 *   L2 escalated → + Admin (overdue > ESCALATE_ADMIN_HOURS, a role task nobody picked up,
 *      an aging blocker, a customer who is late, an order with no next action)
 *   L3 escalated → + Owner (overdue > ESCALATE_OWNER_HOURS, a late emergency, a blocker
 *      open twice its due time)
 * `notificationsFor` turns one item into bell notifications, one per audience, keyed per day,
 * so running the scan many times a day never repeats a reminder.
 */

import type { Blocker, OrderStatus, Task } from '../domain/entities';
import { currentTask, isOpenTask } from './health';
import { toMvpStage } from './stage';
import { leadOwner, leadStatus, type MvpLead } from './leadModel';
import {
  AT_RISK_WINDOW_HOURS, BLOCKER_DUE_DAYS, CHASE_SNOOZE_HOURS, ESCALATE_ADMIN_HOURS, ESCALATE_OWNER_HOURS, TIME_ZONE, UNASSIGNED_ALERT_HOURS,
} from './config';

const HOUR = 60 * 60 * 1000;

export type FollowUpKind =
  | 'DUE_SOON' | 'OVERDUE' | 'EMERGENCY_LATE' | 'UNASSIGNED' | 'BLOCKER_AGING'
  | 'CUSTOMER_WAITING' | 'NO_NEXT_ACTION' | 'LEAD_FOLLOW_UP';
export type FollowUpLevel = 0 | 1 | 2 | 3;

export interface FollowUp {
  /** Stable per item (not per day): `${kind}:${id}`. */
  key: string;
  kind: FollowUpKind;
  level: FollowUpLevel;
  /** Who has to act: a uid, `role:<role>` or `customer:<id>`. */
  personId: string;
  orderId?: string;
  leadId?: string;
  taskId?: string;
  blockerId?: string;
  /** What is late (task title, blocker reason, lead name). */
  what: string;
  dueDate?: string;
  /** Hours past due (0 when not yet due). */
  hoursLate: number;
  /** When the Admin last chased it from the chase list. */
  lastChasedAt?: string;
}

export interface FollowUpOrder {
  id: string;
  stage: string;
  status?: OrderStatus;
  displayCode?: string;
}

export interface FollowUpInput {
  orders: FollowUpOrder[];
  tasks: Task[];
  openBlockers: Blocker[];
  leads: MvpLead[];
  now: Date;
}

const hoursPast = (iso: string | undefined, now: Date): number =>
  iso ? (now.getTime() - new Date(iso).getTime()) / HOUR : 0;

/** Which orders' tasks are still worth chasing. Emergencies always are (D-28). */
function chaseable(task: Task, status: OrderStatus): boolean {
  if (task.type === 'EMERGENCY_RESPONSE') return true;
  if (status === 'CANCELLED') return false;
  if (status === 'ON_HOLD') return task.type === 'REVIEW_HOLD';
  return true;
}

export function followUpsFor(input: FollowUpInput): FollowUp[] {
  const { now } = input;
  const out: FollowUp[] = [];
  const orderById = new Map(input.orders.map(o => [o.id, o]));
  const openByOrder = new Map<string, Task[]>();

  for (const t of input.tasks) {
    if (!isOpenTask(t) || !t.orderId) continue;
    const order = orderById.get(t.orderId);
    if (!order) continue;
    (openByOrder.get(order.id) ?? openByOrder.set(order.id, []).get(order.id)!).push(t);
    if (!chaseable(t, order.status ?? 'ACTIVE')) continue;
    // A BLOCKED task is waiting on someone else: chase the blocker (below), not the person.
    if (t.status === 'BLOCKED') continue;

    const base = { orderId: order.id, taskId: t.id, what: t.title, dueDate: t.dueDate, lastChasedAt: t.lastChasedAt };
    const late = hoursPast(t.dueDate, now);
    const roleOnly = t.assigneeId.startsWith('role:') && t.assigneeId !== 'role:admin' && t.assigneeId !== 'role:owner';

    if (roleOnly) {
      if (hoursPast(t.createdAt, now) >= UNASSIGNED_ALERT_HOURS) {
        out.push({ key: `UNASSIGNED:${t.id}`, kind: 'UNASSIGNED', level: late >= ESCALATE_OWNER_HOURS ? 3 : 2, personId: t.assigneeId, hoursLate: Math.max(0, late), ...base });
      }
      continue;
    }
    if (t.type === 'EMERGENCY_RESPONSE' && late > 0) {
      out.push({ key: `EMERGENCY_LATE:${t.id}`, kind: 'EMERGENCY_LATE', level: 3, personId: t.assigneeId, hoursLate: late, ...base });
      continue;
    }
    if (late > 0) {
      const customer = t.assigneeId.startsWith('customer:');
      const level: FollowUpLevel = late >= ESCALATE_OWNER_HOURS ? 3 : late >= ESCALATE_ADMIN_HOURS || customer ? 2 : 1;
      out.push({ key: `${customer ? 'CUSTOMER_WAITING' : 'OVERDUE'}:${t.id}`, kind: customer ? 'CUSTOMER_WAITING' : 'OVERDUE', level, personId: t.assigneeId, hoursLate: late, ...base });
    } else if (late > -AT_RISK_WINDOW_HOURS && t.status === 'TODO') {
      out.push({ key: `DUE_SOON:${t.id}`, kind: 'DUE_SOON', level: 0, personId: t.assigneeId, hoursLate: 0, ...base });
    }
  }

  for (const b of input.openBlockers) {
    const order = orderById.get(b.orderId);
    if (!order || order.status === 'CANCELLED' || b.status !== 'OPEN') continue;
    const age = hoursPast(b.createdAt, now);
    const limit = BLOCKER_DUE_DAYS * 24;
    if (age < limit) continue;
    out.push({
      key: `BLOCKER_AGING:${b.id}`, kind: 'BLOCKER_AGING', level: age >= 2 * limit ? 3 : 2, personId: b.ownerUserId,
      orderId: order.id, blockerId: b.id, taskId: b.taskId, what: b.reason, dueDate: b.dueDate,
      hoursLate: Math.max(0, hoursPast(b.dueDate, now)), lastChasedAt: b.lastChasedAt,
    });
  }

  for (const o of input.orders) {
    if ((o.status ?? 'ACTIVE') !== 'ACTIVE') continue;
    if (currentTask(openByOrder.get(o.id) ?? [], toMvpStage(o.stage as never))) continue;
    out.push({ key: `NO_NEXT_ACTION:${o.id}`, kind: 'NO_NEXT_ACTION', level: 2, personId: 'role:admin', orderId: o.id, what: 'No next action', hoursLate: 0 });
  }

  for (const l of input.leads) {
    const status = leadStatus(l);
    if (!l.nextFollowUp || (status !== 'NEW' && status !== 'CONTACTED')) continue;
    const late = hoursPast(l.nextFollowUp, now);
    if (late <= 0) continue;
    out.push({
      key: `LEAD_FOLLOW_UP:${l.id}`, kind: 'LEAD_FOLLOW_UP', level: late >= ESCALATE_ADMIN_HOURS ? 2 : 1,
      personId: leadOwner(l) ?? 'role:admin', leadId: l.id, what: l.contactInfo?.name ?? 'Lead', dueDate: l.nextFollowUp,
      hoursLate: late, lastChasedAt: l.lastChasedAt,
    });
  }

  return out.sort((a, b) => b.level - a.level || b.hoursLate - a.hoursLate);
}

export type FollowUpTemplate =
  | 'mvp_task_due' | 'mvp_task_overdue' | 'mvp_escalated' | 'mvp_unassigned' | 'mvp_blocker_aging'
  | 'mvp_lead_followup' | 'mvp_emergency';

export interface FollowUpNotice {
  audience: string;
  templateId: FollowUpTemplate;
  orderId?: string;
  /** Unique per audience, item, rung and day: sent at most once a day. */
  dedupeKey: string;
}

export function dayKeyOf(now: Date): string {
  return now.toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
}

/** The bell notifications one follow-up item produces (who hears about it, at which rung). */
export function notificationsFor(f: FollowUp, now: Date): FollowUpNotice[] {
  const day = dayKeyOf(now);
  const key = (rung: string) => `${rung}:${f.key}:${day}`;
  const person = f.personId;
  // A role token other than admin/owner is "everyone with that role": don't nag them all.
  const personReachable = !person.startsWith('role:') || person === 'role:admin' || person === 'role:owner';
  const list: FollowUpNotice[] = [];
  const add = (audience: string, templateId: FollowUpTemplate, rung: string) => {
    if (!list.some(n => n.audience === audience)) list.push({ audience, templateId, orderId: f.orderId, dedupeKey: key(rung) });
  };

  switch (f.kind) {
    case 'DUE_SOON':
      if (personReachable) add(person, 'mvp_task_due', 'due');
      break;
    case 'OVERDUE':
    case 'CUSTOMER_WAITING':
      if (personReachable) add(person, 'mvp_task_overdue', 'overdue');
      if (f.level >= 2) add('role:admin', 'mvp_escalated', 'l2');
      if (f.level >= 3) add('role:owner', 'mvp_escalated', 'l3');
      break;
    case 'EMERGENCY_LATE':
      if (personReachable) add(person, 'mvp_emergency', 'late');
      add('role:admin', 'mvp_escalated', 'l2');
      add('role:owner', 'mvp_escalated', 'l3');
      break;
    case 'UNASSIGNED':
      add('role:admin', 'mvp_unassigned', 'l2');
      if (f.level >= 3) add('role:owner', 'mvp_unassigned', 'l3');
      break;
    case 'BLOCKER_AGING':
      if (personReachable) add(person, 'mvp_blocker_aging', 'owner');
      add('role:admin', 'mvp_blocker_aging', 'l2');
      if (f.level >= 3) add('role:owner', 'mvp_blocker_aging', 'l3');
      break;
    case 'NO_NEXT_ACTION':
      add('role:admin', 'mvp_escalated', 'l2');
      break;
    case 'LEAD_FOLLOW_UP':
      if (personReachable) add(person, 'mvp_lead_followup', 'lead');
      if (f.level >= 2) add('role:admin', 'mvp_lead_followup', 'l2');
      break;
  }
  return list;
}

/** Items the Admin should chase by hand today (L1+), minus the ones already chased recently. */
export function chaseList(items: FollowUp[], now: Date): FollowUp[] {
  return items.filter(f => f.level >= 1 && hoursPast(f.lastChasedAt, now) >= (f.lastChasedAt ? CHASE_SNOOZE_HOURS : 0));
}

export interface DigestCounts {
  overdue: number;
  escalated: number;
  blockers: number;
  customers: number;
  noNextAction: number;
  leads: number;
}

export function digestCounts(items: FollowUp[]): DigestCounts {
  const n = (p: (f: FollowUp) => boolean) => items.filter(p).length;
  return {
    overdue: n(f => f.kind === 'OVERDUE' || f.kind === 'EMERGENCY_LATE'),
    escalated: n(f => f.level >= 2 && f.kind !== 'NO_NEXT_ACTION'),
    blockers: n(f => f.kind === 'BLOCKER_AGING'),
    customers: n(f => f.kind === 'CUSTOMER_WAITING'),
    noNextAction: n(f => f.kind === 'NO_NEXT_ACTION'),
    leads: n(f => f.kind === 'LEAD_FOLLOW_UP'),
  };
}
