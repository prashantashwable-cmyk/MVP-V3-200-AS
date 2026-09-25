/**
 * MVP notifications (spec §25, D-17): in-app only, through the existing
 * `notificationService.sendNotification` (priority `low` = in-app channel only),
 * idempotent via its dedupe key. The audience is a uid, `customer:<id>` or `role:<role>`.
 * A notification failure never blocks the business action that triggered it.
 *
 * Step 10 adds the bell's reads (`listMyNotifications`, `markNotificationRead`) and the
 * due/overdue scan + daily digest (`scanTaskNotifications`), called once per dashboard load
 * (Admin/Owner). Both rely on `sendNotification`'s own idempotent dedupe key, so calling the
 * scan on every load is safe — it's a no-op once a task's due/overdue notice already went out
 * for the day.
 */

import type { NotificationRecord } from '../../domain/entities';
import { notificationRepository, taskRepository } from '../../repository/entities';
import { sendNotification } from '../../services/notificationService';
import type { RepositoryContext } from '../../repository/types';
import { isOpenTask } from '../health';
import { TIME_ZONE } from '../config';
// Type-only import: erased at compile time, so this never creates a runtime cycle with
// orderService.ts (which imports `notify` from this file).
import type { MvpActor, MvpCtx } from './orderService';

const customerToken = (customerId: string): string => `customer:${customerId}`;
const nowOf = (ctx: MvpCtx): Date => (ctx.now ? ctx.now() : new Date());

export type MvpNotification =
  | 'mvp_task_assigned' | 'mvp_task_due' | 'mvp_task_overdue' | 'mvp_survey_scheduled' | 'mvp_quote_ready'
  | 'mvp_payment_due' | 'mvp_installation_scheduled' | 'mvp_qc_required' | 'mvp_handover_ready' | 'mvp_amc_reminder'
  | 'mvp_blocker_raised' | 'mvp_emergency' | 'mvp_daily_digest';

export async function notify(
  ctx: RepositoryContext,
  audienceId: string,
  templateId: MvpNotification,
  orderId: string | undefined,
  dedupeKey: string,
): Promise<void> {
  try {
    await sendNotification(ctx, { audienceUserId: audienceId, templateId, priority: 'low', projectId: orderId, dedupeKey: `${audienceId}:${dedupeKey}` });
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

/**
 * D-08/spec §25: a task due within 24h or already overdue notifies its assignee, once per day
 * (the dedupe key includes the day). Also sends the Admin one daily digest, once per day.
 * Called from the Admin/Owner dashboards on load — never awaited by the render path.
 */
export async function scanTaskNotifications(ctx: MvpCtx): Promise<void> {
  const now = nowOf(ctx);
  const dayKey = now.toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
  const tasks = (await taskRepository(ctx).list()).filter(t => isOpenTask(t) && !!t.orderId && !t.assigneeId.startsWith('role:'));
  for (const t of tasks) {
    const due = new Date(t.dueDate).getTime();
    if (due < now.getTime()) {
      await notify(ctx, t.assigneeId, 'mvp_task_overdue', t.orderId, `overdue:${t.id}:${dayKey}`);
    } else if (due - now.getTime() < 24 * 60 * 60 * 1000) {
      await notify(ctx, t.assigneeId, 'mvp_task_due', t.orderId, `due:${t.id}:${dayKey}`);
    }
  }
  await notify(ctx, 'role:admin', 'mvp_daily_digest', undefined, `digest:${dayKey}`);
}
