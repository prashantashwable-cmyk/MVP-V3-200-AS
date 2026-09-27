/**
 * MVP notifications (spec §25, D-17): in-app only, through the existing
 * `notificationService.sendNotification` (priority `low` = in-app channel only),
 * idempotent via its dedupe key. The audience is a uid, `customer:<id>` or `role:<role>`.
 * A notification failure never blocks the business action that triggered it.
 *
 * Step 12 (D-32) turns the scan into the follow-up ladder (src/mvp/followUp.ts) and adds a
 * self-scan every signed-in person's app runs for their own work.
 *
 * Step 10 adds the bell's reads (`listMyNotifications`, `markNotificationRead`) and the
 * due/overdue scan + daily digest (`scanTaskNotifications`), called once per dashboard load
 * (Admin/Owner). Both rely on `sendNotification`'s own idempotent dedupe key, so calling the
 * scan on every load is safe — it's a no-op once a task's due/overdue notice already went out
 * for the day.
 */

import type { Blocker, NotificationRecord, Task } from '../../domain/entities';
import { blockerRepository, notificationRepository, paymentMilestoneRepository, projectRepository, taskRepository } from '../../repository/entities';
import { getRepository } from '../../repository';
import { sendNotification } from '../../services/notificationService';
import type { RepositoryContext } from '../../repository/types';
import { isOpenTask } from '../health';
import type { MvpLead } from '../leadModel';
import { recordAuditEvent, newCorrelationId } from '../../lib/audit';
import type { Person } from './people';
import {
  chaseList, dayKeyOf, digestCounts, followUpsFor, notificationsFor, type DigestCounts, type FollowUp, type FollowUpNotice, type FollowUpOrder,
} from '../followUp';
// Type-only import: erased at compile time, so this never creates a runtime cycle with
// orderService.ts (which imports `notify` from this file).
import type { MvpActor, MvpCtx } from './orderService';

const customerToken = (customerId: string): string => `customer:${customerId}`;
const nowOf = (ctx: MvpCtx): Date => (ctx.now ? ctx.now() : new Date());
// Local copies (not imported from orderService.ts) to keep this file free of runtime cycles.
const leadRepository = (ctx: RepositoryContext) => getRepository<MvpLead>('leads', ctx);
const actorTokens = (actor: MvpActor): string[] =>
  [actor.userId, `role:${actor.role}`, ...(actor.role === 'customer' && actor.customerId ? [customerToken(actor.customerId)] : [])];

export type MvpNotification =
  | 'mvp_task_assigned' | 'mvp_task_due' | 'mvp_task_overdue' | 'mvp_survey_scheduled' | 'mvp_quote_ready'
  | 'mvp_payment_due' | 'mvp_installation_scheduled' | 'mvp_qc_required' | 'mvp_handover_ready' | 'mvp_amc_reminder'
  | 'mvp_blocker_raised' | 'mvp_emergency' | 'mvp_daily_digest'
  | 'mvp_escalated' | 'mvp_unassigned' | 'mvp_blocker_aging' | 'mvp_lead_followup'
  | 'mvp_promise_made' | 'mvp_promise_broken' | 'mvp_gate_risk';

export async function notify(
  ctx: RepositoryContext,
  audienceId: string,
  templateId: MvpNotification,
  orderId: string | undefined,
  dedupeKey: string,
  data?: Record<string, number>,
): Promise<void> {
  try {
    await sendNotification(ctx, { audienceUserId: audienceId, templateId, priority: 'low', projectId: orderId, dedupeKey: `${audienceId}:${dedupeKey}`, data });
  } catch (err) {
    console.error(`MVP notification ${templateId} to ${audienceId} failed:`, err);
  }
}

/** The bell (D-17): every audience the viewer matches, newest first. */
export async function listMyNotifications(ctx: MvpCtx, actor: MvpActor, limit = 30): Promise<NotificationRecord[]> {
  const repo = notificationRepository(ctx);
  const audiences = [actor.userId, `role:${actor.role}`, ...(actor.role === 'customer' && actor.customerId ? [customerToken(actor.customerId)] : [])];
  const lists = await Promise.all(audiences.map(a => repo.query({ audienceUserId: a } as Partial<NotificationRecord>)));
  const byId = new Map(lists.flat().map(n => [n.id, n]));
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export async function markNotificationRead(ctx: MvpCtx, notificationId: string): Promise<void> {
  const repo = notificationRepository(ctx);
  const n = await repo.get(notificationId);
  if (!n || n.readAt) return;
  await repo.update(notificationId, { readAt: nowOf(ctx).toISOString() });
}

/** Everything the follow-up ladder (D-32) is chasing right now. Admin/Owner (or the robot) only. */
export async function loadFollowUps(ctx: MvpCtx): Promise<FollowUp[]> {
  const [projects, tasks, openBlockers, leads, milestones] = await Promise.all([
    projectRepository(ctx).list(),
    taskRepository(ctx).list(),
    blockerRepository(ctx).query({ status: 'OPEN' } as Partial<Blocker>),
    leadRepository(ctx).list() as Promise<MvpLead[]>,
    paymentMilestoneRepository(ctx).list(),
  ]);
  const orders = projects.filter(p => !!p.displayCode || !!p.status) as FollowUpOrder[];
  return followUpsFor({ orders, tasks, openBlockers, leads, milestones, now: nowOf(ctx) });
}

export interface ScanResult { items: number; sent: number; digest: DigestCounts }

async function sendAll(ctx: MvpCtx, notices: FollowUpNotice[]): Promise<number> {
  // Small batches: fast enough on a phone, gentle on Firestore's per-document write rate.
  for (let i = 0; i < notices.length; i += 5) {
    await Promise.all(notices.slice(i, i + 5).map(n => notify(ctx, n.audience, n.templateId, n.orderId, n.dedupeKey)));
  }
  return notices.length;
}

/**
 * D-08 + D-32: the full follow-up scan — every rung of the ladder for every open task,
 * aging blocker, late customer, order without a next action and overdue lead, plus one
 * daily digest (with the counts) for the Admin and the Owner. Run by the Admin/Owner app
 * (on load, then hourly) and by the 9:00/17:00 robot (scripts/mvp-followup-run.ts).
 * Idempotent: every notice is keyed per audience, item, rung and day.
 */
export async function scanTaskNotifications(ctx: MvpCtx): Promise<ScanResult> {
  const now = nowOf(ctx);
  const items = await loadFollowUps(ctx);
  const notices = items.flatMap(f => notificationsFor(f, now));
  const sent = await sendAll(ctx, notices);
  const digest = digestCounts(items);
  const data = { ...digest } as Record<string, number>;
  const day = dayKeyOf(now);
  await notify(ctx, 'role:admin', 'mvp_daily_digest', undefined, `digest:${day}`, data);
  await notify(ctx, 'role:owner', 'mvp_daily_digest', undefined, `digest:${day}`, data);
  return { items: items.length, sent, digest };
}

/**
 * D-32 self-scan: any staff member's (or customer's) own app reminds them of their own due
 * and overdue work, so reminders don't wait for the Admin to open the app. Only notices
 * addressed to the viewer themself; ones already in their bell are skipped up front (a
 * non-admin may not read another person's idempotency claim, see firestore.rules).
 */
export async function scanMyFollowUps(ctx: MvpCtx, actor: MvpActor): Promise<number> {
  const now = nowOf(ctx);
  const tokens = actorTokens(actor).filter(t => !t.startsWith('role:'));
  const tasks = (await Promise.all(tokens.map(t => taskRepository(ctx).query({ assigneeId: t } as Partial<Task>)))).flat().filter(isOpenTask);
  if (!tasks.length) return 0;
  const orderIds = [...new Set(tasks.map(t => t.orderId).filter(Boolean) as string[])];
  const orders = (await Promise.all(orderIds.map(id => projectRepository(ctx).get(id).catch(() => null)))).filter(Boolean) as FollowUpOrder[];
  const items = followUpsFor({ orders, tasks, openBlockers: [], leads: [], now }).filter(f => f.kind !== 'NO_NEXT_ACTION');
  const repo = notificationRepository(ctx);
  const have = new Set<string>((await Promise.all(tokens.map(a => repo.query({ audienceUserId: a } as Partial<NotificationRecord>)))).flat().map(n => n.id as string));
  const mine = items.flatMap(f => notificationsFor(f, now))
    .filter(n => tokens.includes(n.audience) && !have.has(`notif_${n.templateId}_${n.audience}:${n.dedupeKey}_in_app`));
  return sendAll(ctx, mine);
}

/** One row of the Admin's chase list (D-32): who to chase, about what, and how to reach them. */
export interface ChaseRow extends FollowUp {
  personName: string;
  /** 10-digit Indian mobile, when known. */
  phone?: string;
  orderCode?: string;
}

// Same rule as orderService.normalizeIndianMobile, copied to keep this file free of runtime cycles.
const tenDigits = (phone: string | undefined): string | undefined => {
  const d = (phone ?? '').replace(/[\s-]/g, '').replace(/^(\+91|0091|91(?=\d{10}$)|0)/, '');
  return /^[6-9]\d{9}$/.test(d) ? d : undefined;
};

/** Today's chase list: L1+ items not chased in the last CHASE_SNOOZE_HOURS, worst first. Admin/Owner. */
export async function listChases(ctx: MvpCtx): Promise<ChaseRow[]> {
  const now = nowOf(ctx);
  const [items, projects, people, leads] = await Promise.all([
    loadFollowUps(ctx),
    projectRepository(ctx).list(),
    getRepository<Person>('users', ctx).list(),
    leadRepository(ctx).list() as Promise<MvpLead[]>,
  ]);
  const orderById = new Map(projects.map(p => [p.id as string, p]));
  const personById = new Map(people.map(p => [p.id, p]));
  const leadById = new Map(leads.map(l => [l.id, l]));
  const ROLE_NAMES: Record<string, string> = { 'role:admin': 'Admin', 'role:owner': 'Owner' };
  return chaseList(items, now).map(f => {
    const order = f.orderId ? orderById.get(f.orderId) : undefined;
    const lead = f.leadId ? leadById.get(f.leadId) : undefined;
    let personName = ROLE_NAMES[f.personId] ?? (f.personId.startsWith('role:') ? `Any ${f.personId.slice(5)}` : 'Unknown person');
    let phone: string | undefined;
    if (f.kind === 'GATE_RISK') {
      // The Admin collects the delivery payment from the customer before the technician goes.
      personName = order?.displaySummary?.customerName ? `Customer: ${order.displaySummary.customerName}` : 'Customer';
      phone = tenDigits(order?.displaySummary?.customerPhone);
    } else if (f.personId.startsWith('customer:')) {
      personName = order?.displaySummary?.customerName ? `Customer: ${order.displaySummary.customerName}` : 'Customer';
      phone = tenDigits(order?.displaySummary?.customerPhone);
    } else if (f.kind === 'LEAD_FOLLOW_UP' && lead) {
      const owner = personById.get(f.personId);
      personName = owner?.name ?? personName;
      phone = tenDigits(owner?.phone);
    } else {
      const person = personById.get(f.personId);
      if (person) { personName = person.name; phone = tenDigits(person.phone); }
    }
    return { ...f, personName, phone, orderCode: order?.displayCode };
  });
}

/** "Chased": the Admin reached the person outside the app. Audited; hides the row for a while. */
export async function markChased(ctx: MvpCtx, actor: MvpActor, row: Pick<FollowUp, 'key' | 'kind' | 'taskId' | 'blockerId' | 'leadId' | 'orderId'>, how: 'whatsapp' | 'call' | 'other'): Promise<void> {
  if (actor.role !== 'admin') throw new Error('Only the Admin can mark a follow-up as chased.');
  const at = nowOf(ctx).toISOString();
  if (row.kind === 'BLOCKER_AGING' && row.blockerId) await blockerRepository(ctx).update(row.blockerId, { lastChasedAt: at });
  else if (row.kind === 'LEAD_FOLLOW_UP' && row.leadId) await leadRepository(ctx).update(row.leadId, { lastChasedAt: at } as Partial<MvpLead>);
  else if (row.taskId) await taskRepository(ctx).update(row.taskId, { lastChasedAt: at, updatedAt: at });
  else throw new Error('This item cannot be marked as chased; open the order instead.');
  await recordAuditEvent(ctx, {
    actorId: actor.userId, actorRole: actor.role, action: 'FOLLOW_UP_CHASED', entityType: 'FollowUp', entityId: row.key,
    projectId: row.orderId, after: { how, at }, source: 'ui', correlationId: newCorrelationId(),
  });
}
