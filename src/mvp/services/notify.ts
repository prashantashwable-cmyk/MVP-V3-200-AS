/**
 * MVP notifications (spec §25, D-17): in-app only, through the existing
 * `notificationService.sendNotification` (priority `low` = in-app channel only),
 * idempotent via its dedupe key. The audience is a uid, `customer:<id>` or `role:<role>`.
 * A notification failure never blocks the business action that triggered it.
 */

import { sendNotification } from '../../services/notificationService';
import type { RepositoryContext } from '../../repository/types';

export type MvpNotification =
  | 'mvp_task_assigned' | 'mvp_task_due' | 'mvp_task_overdue' | 'mvp_survey_scheduled' | 'mvp_quote_ready'
  | 'mvp_payment_due' | 'mvp_installation_scheduled' | 'mvp_qc_required' | 'mvp_handover_ready' | 'mvp_amc_reminder'
  | 'mvp_blocker_raised' | 'mvp_emergency';

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
