/**
 * D-14 soft gates: one helper reused by Steps 07–09. A gate returns {allowed, reason}; the
 * Admin can override it with a reason (stored on the order and audited). Same shape as the
 * existing hard gate in services/commercialWorkflow.ts, but overridable (D-14).
 */

import type { ComplianceItem, PaymentMilestone, Project } from '../domain/entities';
import { complianceItemRepository, paymentMilestoneRepository, projectRepository } from '../repository/entities';
import { recordAuditEvent, newCorrelationId } from '../lib/audit';
import { MvpError, nowOf, type MvpActor, type MvpCtx } from './services/orderService';

export type GateKind = 'SITE_READY_ENTRY' | 'INSTALLATION_START' | 'HANDOVER_FINAL_PAYMENT' | 'HANDOVER_LICENCE';

export interface GateResult { allowed: boolean; reason: string; overridden?: boolean }

export const GATE_MESSAGES: Record<GateKind, string> = {
  SITE_READY_ENTRY: 'Waiting for the booking token',
  INSTALLATION_START: 'Waiting for delivery payment',
  HANDOVER_FINAL_PAYMENT: 'Final payment not received',
  HANDOVER_LICENCE: 'Statutory licence not done',
};

type OrderWithOverrides = Project & { version?: number };

const paid = (m?: PaymentMilestone | null) => !!m && (m.status === 'PAID' || !!m.waived);

export async function checkGate(ctx: MvpCtx, orderId: string, gate: GateKind): Promise<GateResult> {
  const order = (await projectRepository(ctx).get(orderId)) as OrderWithOverrides | null;
  if (!order) return { allowed: false, reason: 'Order not found' };
  const override = order.gateOverrides?.[gate];
  let ok: boolean;
  if (gate === 'HANDOVER_LICENCE') {
    const lic = (await complianceItemRepository(ctx).get(`${orderId}_LIFT_LICENSE`)) as ComplianceItem | null;
    ok = !!lic && lic.status === 'DONE' && !!lic.documentId;
  } else {
    const kind = gate === 'SITE_READY_ENTRY' ? 'BOOKING_TOKEN' : gate === 'INSTALLATION_START' ? 'DELIVERY' : 'FINAL';
    ok = paid(await paymentMilestoneRepository(ctx).get(`ms_${orderId}_${kind}`));
  }
  if (ok) return { allowed: true, reason: 'OK' };
  if (override) return { allowed: true, reason: `Admin override: ${override.reason}`, overridden: true };
  return { allowed: false, reason: GATE_MESSAGES[gate] };
}

/** Admin override with a reason; stored on the order and audited. */
export async function overrideGate(ctx: MvpCtx, actor: MvpActor, orderId: string, gate: GateKind, reason: string): Promise<void> {
  if (actor.role !== 'admin') throw new MvpError('forbidden', 'Only the Admin can override a gate.');
  if (!reason?.trim()) throw new MvpError('invalid', 'A reason is required to override a gate.');
  const order = (await projectRepository(ctx).get(orderId)) as OrderWithOverrides | null;
  if (!order) throw new MvpError('not_found', 'Order not found.');
  const entry = { by: actor.userId, at: nowOf(ctx).toISOString(), reason: reason.trim() };
  await projectRepository(ctx).update(orderId, { gateOverrides: { ...(order.gateOverrides ?? {}), [gate]: entry } } as any, order.version ?? 0);
  await recordAuditEvent(ctx, {
    actorId: actor.userId, actorRole: actor.role, action: 'GATE_OVERRIDDEN', entityType: 'Project', entityId: orderId, projectId: orderId,
    before: { gate, allowed: false }, after: { gate, allowed: true }, reason: entry.reason, source: 'ui', correlationId: newCorrelationId(),
  });
}

/** Throws a `gate` error with the user-facing message unless the gate is open. */
export async function assertGate(ctx: MvpCtx, orderId: string, gate: GateKind): Promise<void> {
  const r = await checkGate(ctx, orderId, gate);
  if (!r.allowed) throw new MvpError('gate', r.reason);
}
