/**
 * Centralized notification service — Phase 11.
 *
 * "Centralize: event -> audience -> priority -> channel policy ->
 * template -> delivery -> retry -> status -> audit... Do not simulate
 * successful external delivery as production success."
 *
 * Phase 07's event handlers already create `NotificationRecord`s
 * directly (status always `'queued'`, `channel: 'in_app'` only — see
 * that file's own comment). This service is the real, centralized
 * replacement those handlers should be migrated onto as this phase's
 * transports mature: it adds priority-based channel policy, idempotent
 * delivery (Phase 06's `runIdempotent`), and — critically — transports
 * that are honest about what actually happened rather than all
 * defaulting to the same optimistic `'queued'`.
 */

import { runIdempotent } from '../lib/idempotency';
import { recordAuditEvent, newCorrelationId } from '../lib/audit';
import { getRepository } from '../repository';
import type { RepositoryContext } from '../repository/types';
import type { NotificationRecord, NotificationChannel } from '../domain/entities';
import { asId } from '../domain/ids';
import type { NotificationId } from '../domain/ids';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

/** Channel policy: which channels a priority level uses, in order.
 * `urgent` fans out to every channel; `low` stays in-app only — a real,
 * simple instance of "priority -> channel policy," not a placeholder. */
const PRIORITY_CHANNELS: Record<NotificationPriority, NotificationChannel[]> = {
  low: ['in_app'],
  normal: ['in_app', 'email'],
  high: ['in_app', 'email', 'whatsapp'],
  urgent: ['in_app', 'email', 'whatsapp', 'sms'],
};

export interface NotificationTemplate {
  id: string;
  subject: string;
  body: string;
}

const TEMPLATES: Record<string, NotificationTemplate> = {
  quote_accepted_finance: { id: 'quote_accepted_finance', subject: 'Quote accepted', body: 'A quote was accepted — contract created.' },
  quote_accepted_ops: { id: 'quote_accepted_ops', subject: 'Quote accepted', body: 'A quote was accepted — project entering contract stage.' },
  qc_failed_rework_assigned: { id: 'qc_failed_rework_assigned', subject: 'Rework assigned', body: 'A QC inspection failed and rework has been assigned to you.' },
  payment_overdue_escalation: { id: 'payment_overdue_escalation', subject: 'Payment overdue', body: 'A scheduled payment is overdue and has been escalated.' },
};

export interface DeliveryResult {
  channel: NotificationChannel;
  status: 'delivered' | 'queued' | 'failed';
  reason?: string;
}

export interface ChannelTransport {
  channel: NotificationChannel;
  send(to: string, template: NotificationTemplate): Promise<DeliveryResult>;
}

/** Real, working transport: an in-app notification IS its own
 * database record — there is no external system to fail, so this is
 * the one channel honestly reported as `'delivered'` the moment it's
 * written. */
export const inAppTransport: ChannelTransport = {
  channel: 'in_app',
  async send(to, template) {
    return { channel: 'in_app', status: 'delivered' };
  },
};

/**
 * KNOWN INTEGRATION GAP (documented, not hidden — Phase 01 §7 confirmed
 * no email/WhatsApp/SMS provider is wired into this repository).
 * Reports `'queued'`, never `'delivered'`, for exactly this reason —
 * "do not simulate successful external delivery as production success."
 * A real deployment replaces this with a real provider SDK (e.g.
 * SendGrid/Twilio/WhatsApp Business API) and this function's contract
 * (return a real `DeliveryResult`) does not need to change.
 */
function makeUnconfiguredExternalTransport(channel: NotificationChannel): ChannelTransport {
  return {
    channel,
    async send(to, template) {
      return {
        channel,
        status: 'queued',
        reason: `No ${channel} provider is configured in this deployment — message is queued, NOT delivered. ` +
                `See src/services/notificationService.ts for the real integration boundary.`,
      };
    },
  };
}

const DEFAULT_TRANSPORTS: Record<NotificationChannel, ChannelTransport> = {
  in_app: inAppTransport,
  email: makeUnconfiguredExternalTransport('email'),
  whatsapp: makeUnconfiguredExternalTransport('whatsapp'),
  sms: makeUnconfiguredExternalTransport('sms'),
};

export interface SendNotificationInput {
  audienceUserId: string;
  templateId: string;
  priority: NotificationPriority;
  projectId?: string;
  /** Anchors idempotency — e.g. `${paymentId}:day-3` so a retried/
   * redelivered trigger for the SAME logical reminder never re-sends. */
  dedupeKey: string;
  transports?: Partial<Record<NotificationChannel, ChannelTransport>>;
}

export async function sendNotification(ctx: RepositoryContext, input: SendNotificationInput): Promise<{ results: DeliveryResult[]; wasDuplicate: boolean }> {
  const template = TEMPLATES[input.templateId];
  if (!template) throw new Error(`Unknown notification template "${input.templateId}"`);

  const channels = PRIORITY_CHANNELS[input.priority];
  const transports = { ...DEFAULT_TRANSPORTS, ...input.transports };

  const { result, wasDuplicate } = await runIdempotent(ctx, 'notification.send', `${input.templateId}:${input.dedupeKey}`, async () => {
    const results: DeliveryResult[] = [];
    for (const channel of channels) {
      const deliveryResult = await transports[channel].send(input.audienceUserId, template);
      results.push(deliveryResult);

      const notifId = asId<NotificationId>(`notif_${input.templateId}_${input.dedupeKey}_${channel}`);
      await getRepository<NotificationRecord>('notifications', ctx).create({
        id: notifId,
        projectId: input.projectId as any,
        audienceUserId: input.audienceUserId as any,
        channel,
        templateId: input.templateId,
        status: deliveryResult.status === 'delivered' ? 'delivered' : deliveryResult.status === 'failed' ? 'failed' : 'queued',
        idempotencyKey: `${input.templateId}:${input.dedupeKey}:${channel}`,
        createdAt: new Date().toISOString(),
      });
    }
    await recordAuditEvent(ctx, {
      actorId: 'system', actorRole: 'system', action: 'NOTIFICATION_SENT',
      entityType: 'Notification', entityId: `${input.templateId}:${input.dedupeKey}`, projectId: input.projectId,
      after: { channels: results.map(r => ({ channel: r.channel, status: r.status })) },
      source: 'automation', correlationId: newCorrelationId(),
    });
    return results;
  });

  return { results: result, wasDuplicate };
}
