/**
 * Payment milestones (spec §17, D-14). Manual recording: the customer submits proof (UTR /
 * reference / screenshot), the Admin verifies and marks PAID (or PARTIAL), or rejects with a
 * reason. No gateway (audit R-4); the software moves no money ⚖ VERIFY refund terms.
 * Every status or amount change is audited (I-3) and idempotent.
 */

import type { MilestoneKind, MvpPaymentStatus, PaymentMilestone } from '../../domain/entities';
import { paymentMilestoneRepository, projectRepository } from '../../repository/entities';
import { createIfAbsent } from '../../repository/transactions';
import { recordAuditEvent, newCorrelationId } from '../../lib/audit';
import { runIdempotent } from '../../lib/idempotency';
import { defaultMilestoneAmounts } from '../quoteMath';
import { notify } from './notify';
import { applyEvent, customerToken, MvpError, nowOf, type MvpActor, type MvpCtx } from './orderService';

export const MILESTONE_LABELS: Record<MilestoneKind, string> = {
  SURVEY_FEE: 'Survey fee', BOOKING_TOKEN: 'Booking token', DELIVERY: 'Delivery payment', FINAL: 'Final handover payment',
};

export const milestoneId = (orderId: string, kind: MilestoneKind) => `ms_${orderId}_${kind}`;

function requireAdmin(actor: MvpActor, what: string) {
  if (actor.role !== 'admin') throw new MvpError('forbidden', `Only the Admin can ${what}.`);
}

async function audit(ctx: MvpCtx, actor: MvpActor, action: string, m: Pick<PaymentMilestone, 'id' | 'orderId'>, before: unknown, after: unknown, reason?: string) {
  await recordAuditEvent(ctx, {
    actorId: actor.userId, actorRole: actor.role, action, entityType: 'PaymentMilestone', entityId: m.id,
    projectId: m.orderId, before, after, reason, source: 'ui', correlationId: newCorrelationId(),
  });
}

export async function listMilestones(ctx: MvpCtx, orderId: string): Promise<PaymentMilestone[]> {
  const list = await paymentMilestoneRepository(ctx).query({ orderId } as Partial<PaymentMilestone>);
  const order: MilestoneKind[] = ['SURVEY_FEE', 'BOOKING_TOKEN', 'DELIVERY', 'FINAL'];
  return list.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

export function isSettled(m: Pick<PaymentMilestone, 'status' | 'waived'>): boolean {
  return m.status === 'PAID' || m.status === 'REFUNDED' || !!m.waived;
}

/** Survey fee actually paid (not waived) is credited against the booking token (D-30). */
async function surveyFeeCredit(ctx: MvpCtx, orderId: string): Promise<number> {
  const fee = await paymentMilestoneRepository(ctx).get(milestoneId(orderId, 'SURVEY_FEE'));
  return fee && fee.status === 'PAID' && !fee.waived ? fee.amount : 0;
}

/**
 * Creates (or, before any is paid, re-prices) the three D-14 milestones for an order's
 * selling price. Called by the Admin's "send quote", so the customer's acceptance does not
 * need write access to payment records (firestore.rules: milestones are Admin-created).
 */
export async function prepareMilestones(ctx: MvpCtx, actor: MvpActor, orderId: string, sellingPrice: number): Promise<PaymentMilestone[]> {
  requireAdmin(actor, 'set up payment milestones');
  const amounts = defaultMilestoneAmounts(sellingPrice, await surveyFeeCredit(ctx, orderId));
  const now = nowOf(ctx).toISOString();
  const repo = paymentMilestoneRepository(ctx);
  for (const kind of ['BOOKING_TOKEN', 'DELIVERY', 'FINAL'] as const) {
    const id = milestoneId(orderId, kind);
    const existing = await repo.get(id);
    if (!existing) {
      const m: PaymentMilestone = {
        id: id as PaymentMilestone['id'], orderId: orderId as PaymentMilestone['orderId'], kind, label: MILESTONE_LABELS[kind],
        amount: amounts[kind], status: 'PENDING', amountReceived: 0, createdAt: now, updatedAt: now, version: 0,
      };
      if (await createIfAbsent(ctx, 'payment_milestones', m)) await audit(ctx, actor, 'PAYMENT_MILESTONE_CREATED', m, undefined, { kind, amount: m.amount });
    } else if (existing.status === 'PENDING' && existing.amountReceived === 0 && existing.amount !== amounts[kind]) {
      await repo.update(id, { amount: amounts[kind], updatedAt: now }, existing.version ?? 0);
      await audit(ctx, actor, 'PAYMENT_AMOUNT_CHANGED', existing, { amount: existing.amount }, { amount: amounts[kind] }, 'Quote re-priced');
    }
  }
  return listMilestones(ctx, orderId);
}

/** Admin edits amounts; the three milestones (+ any credited survey fee) must equal the selling price. */
export async function editMilestoneAmounts(
  ctx: MvpCtx, actor: MvpActor, orderId: string, amounts: Partial<Record<'BOOKING_TOKEN' | 'DELIVERY' | 'FINAL', number>>, reason: string,
): Promise<PaymentMilestone[]> {
  requireAdmin(actor, 'change payment amounts');
  if (!reason?.trim()) throw new MvpError('invalid', 'A reason is required.');
  const order = await projectRepository(ctx).get(orderId);
  if (!order?.sellingPrice) throw new MvpError('invalid', 'Send the quote first; the selling price is not set.');
  const list = await listMilestones(ctx, orderId);
  const next = Object.fromEntries(list.filter(m => m.kind !== 'SURVEY_FEE').map(m => [m.kind, amounts[m.kind as keyof typeof amounts] ?? m.amount]));
  for (const v of Object.values(next)) if (!Number.isFinite(v) || v < 0) throw new MvpError('invalid', 'Amounts must be 0 or more.');
  const sum = Object.values(next).reduce((s, v) => s + v, 0) + (await surveyFeeCredit(ctx, orderId));
  if (sum !== order.sellingPrice) {
    throw new MvpError('invalid', `The milestones must add up to the selling price ₹${order.sellingPrice.toLocaleString('en-IN')} (now ₹${sum.toLocaleString('en-IN')}).`);
  }
  for (const m of list) {
    const amount = next[m.kind];
    if (amount === undefined || amount === m.amount) continue;
    if (m.status === 'PAID') throw new MvpError('invalid', `${m.label} is already paid; its amount cannot change.`);
    await paymentMilestoneRepository(ctx).update(m.id, { amount, updatedAt: nowOf(ctx).toISOString() }, m.version ?? 0);
    await audit(ctx, actor, 'PAYMENT_AMOUNT_CHANGED', m, { amount: m.amount }, { amount }, reason);
  }
  return listMilestones(ctx, orderId);
}

export async function setMilestoneDueDate(ctx: MvpCtx, actor: MvpActor, orderId: string, kind: MilestoneKind, dueDate: string): Promise<void> {
  requireAdmin(actor, 'set payment due dates');
  const m = await paymentMilestoneRepository(ctx).get(milestoneId(orderId, kind));
  if (!m || m.dueDate === dueDate) return;
  await paymentMilestoneRepository(ctx).update(m.id, { dueDate, updatedAt: nowOf(ctx).toISOString() }, m.version ?? 0);
  await audit(ctx, actor, 'PAYMENT_DUE_CHANGED', m, { dueDate: m.dueDate }, { dueDate });
}

/** Customer: "I have paid" with a UTR/reference and optional screenshot (D-16). */
export async function submitPaymentProof(ctx: MvpCtx, actor: MvpActor, milestoneIdValue: string, reference: string, documentId?: string): Promise<PaymentMilestone> {
  const repo = paymentMilestoneRepository(ctx);
  const m = await repo.get(milestoneIdValue);
  if (!m) throw new MvpError('not_found', 'Payment milestone not found.');
  const order = await projectRepository(ctx).get(m.orderId);
  const isCustomer = actor.role === 'customer' && !!order && actor.customerId === order.customerId;
  if (!isCustomer && actor.role !== 'admin') throw new MvpError('forbidden', 'Only the customer of this order can submit payment proof.');
  if (!reference?.trim()) throw new MvpError('invalid', 'Enter the UTR / transaction reference.');
  if (isSettled(m)) throw new MvpError('invalid', 'This payment is already settled.');
  const proof = { reference: reference.trim(), documentId, submittedAt: nowOf(ctx).toISOString(), submittedBy: actor.userId };
  const updated = await repo.update(m.id, { proof, updatedAt: proof.submittedAt } as Partial<PaymentMilestone>, m.version ?? 0);
  await audit(ctx, actor, 'PAYMENT_PROOF_SUBMITTED', m, undefined, { reference: proof.reference, documentId });
  await notify(ctx, 'role:admin', 'mvp_payment_due', m.orderId, `${m.id}:proof:${proof.reference}`);
  return updated;
}

/**
 * Admin verifies a payment: PAID (full), PARTIAL (amount received so far), or REFUNDED.
 * A PAID booking token moves the order to SITE_READY and marks the lead WON (D-08, D-04).
 */
export async function verifyPayment(
  ctx: MvpCtx, actor: MvpActor, milestoneIdValue: string,
  input: { status: Extract<MvpPaymentStatus, 'PAID' | 'PARTIAL' | 'REFUNDED'>; amountReceived?: number; method: string; reference: string; notes?: string },
): Promise<PaymentMilestone> {
  requireAdmin(actor, 'verify payments');
  const repo = paymentMilestoneRepository(ctx);
  const m = await repo.get(milestoneIdValue);
  if (!m) throw new MvpError('not_found', 'Payment milestone not found.');
  if (!input.method?.trim() || !input.reference?.trim()) throw new MvpError('invalid', 'Method and reference are required.');
  const received = input.status === 'PAID' ? m.amount : input.status === 'PARTIAL' ? Number(input.amountReceived) : m.amountReceived;
  if (input.status === 'PARTIAL' && !(received > 0 && received < m.amount)) throw new MvpError('invalid', 'A partial amount must be more than 0 and less than the milestone amount.');
  if (input.status === 'REFUNDED' && m.status !== 'PAID' && m.status !== 'PARTIAL') throw new MvpError('invalid', 'Only a paid amount can be refunded.');

  const { result } = await runIdempotent(ctx, 'mvp.payment.verify', `${m.id}:${input.status}:${received}:${input.reference}`, async () => {
    const now = nowOf(ctx).toISOString();
    const updated = await repo.update(m.id, {
      status: input.status, amountReceived: received, method: input.method, reference: input.reference, notes: input.notes,
      verifiedBy: actor.userId, verifiedAt: now, rejectedReason: '', updatedAt: now,
    }, m.version ?? 0);
    await audit(ctx, actor, 'PAYMENT_STATUS_CHANGED', m, { status: m.status, amountReceived: m.amountReceived },
      { status: input.status, amountReceived: received, method: input.method, reference: input.reference }, input.notes);
    if (input.status === 'PAID') {
      await applyEvent(ctx, actor, m.orderId, { type: 'PAYMENT_PAID', kind: m.kind });
      if (m.kind === 'BOOKING_TOKEN') {
        const order = await projectRepository(ctx).get(m.orderId);
        if (order) await notify(ctx, customerToken(order.customerId), 'mvp_payment_due', m.orderId, `${m.id}:received`);
      }
    }
    return updated;
  });
  return result ?? (await repo.get(m.id))!;
}

/** Admin rejects submitted proof with a reason; the milestone stays open for a new proof. */
export async function rejectPaymentProof(ctx: MvpCtx, actor: MvpActor, milestoneIdValue: string, reason: string): Promise<PaymentMilestone> {
  requireAdmin(actor, 'reject payment proof');
  if (!reason?.trim()) throw new MvpError('invalid', 'A reason is required.');
  const repo = paymentMilestoneRepository(ctx);
  const m = await repo.get(milestoneIdValue);
  if (!m) throw new MvpError('not_found', 'Payment milestone not found.');
  if (isSettled(m)) throw new MvpError('invalid', 'This payment is already settled; its proof cannot be rejected.');
  const updated = await repo.update(m.id, { rejectedReason: reason, proof: null as any, updatedAt: nowOf(ctx).toISOString() }, m.version ?? 0);
  await audit(ctx, actor, 'PAYMENT_PROOF_REJECTED', m, { proof: m.proof?.reference }, { proof: null }, reason);
  const order = await projectRepository(ctx).get(m.orderId);
  if (order) await notify(ctx, customerToken(order.customerId), 'mvp_payment_due', m.orderId, `${m.id}:rejected:${nowOf(ctx).getTime()}`);
  return updated;
}
