/**
 * S1 driver for MVP checks (demo repository). Each later step replaces the `applyEvent`
 * shortcuts below with the real service call it builds (quote, payment, supply, install…).
 */
import type { MvpCtx } from '../../src/mvp/services/orderService';
import { applyEvent, assignSurveyor, createLead, qualifyLead, submitSurvey } from '../../src/mvp/services/orderService';
import { projectRepository } from '../../src/repository/entities';
import { saveQuote, sendQuote, decideQuote } from '../../src/mvp/services/quoteService';
import { submitPaymentProof, verifyPayment, milestoneId } from '../../src/mvp/services/paymentService';
import { Clock, FIXTURE_LEAD, FIXTURE_SURVEY, FIXTURE_QUOTE, USERS, customerActor } from './fixtures';

export interface S1State { orderId: string; customerId: string; leadId: string }

let phoneSeq = 0;

/** Runs S1 up to and including `step` (1–13a expressed as 13.5). */
export async function runS1(ctx: MvpCtx, clock: Clock, step: number): Promise<S1State> {
  const phone = `98${String(76500000 + ++phoneSeq).padStart(8, '0')}`;
  const lead = await createLead(ctx, USERS.sales, { ...FIXTURE_LEAD, phone });
  const state: S1State = { orderId: '', customerId: '', leadId: lead.id };
  if (step < 2) return state;
  const order = await qualifyLead(ctx, USERS.sales, lead.id);
  state.orderId = order.id; state.customerId = order.customerId;
  const ev = (e: any) => applyEvent(ctx, USERS.admin, order.id, e);
  const at = (days: number) => new Date(clock.now().getTime() + days * 86_400_000).toISOString();
  if (step >= 3) await assignSurveyor(ctx, USERS.admin, order.id, USERS.surveyor.userId, at(2));
  if (step >= 4) await submitSurvey(ctx, USERS.surveyor, order.id, FIXTURE_SURVEY);
  const cust = customerActor(order.customerId);
  if (step >= 5) { await saveQuote(ctx, USERS.admin, order.id, FIXTURE_QUOTE); await sendQuote(ctx, USERS.admin, order.id); }
  if (step >= 6) await decideQuote(ctx, cust, order.id, 'accept');
  if (step >= 7) {
    await submitPaymentProof(ctx, cust, milestoneId(order.id, 'BOOKING_TOKEN'), 'TEST123');
    await verifyPayment(ctx, USERS.admin, milestoneId(order.id, 'BOOKING_TOKEN'), { status: 'PAID', method: 'UPI', reference: 'TEST123' });
  }
  if (step >= 8) await ev({ type: 'PO_RAISED' });
  if (step >= 9) await ev({ type: 'READINESS_SUBMITTED' });
  if (step >= 10) await ev({ type: 'SITE_READY_CONFIRMED', poExpectedDate: at(10) });
  if (step >= 11) await verifyPayment(ctx, USERS.admin, milestoneId(order.id, 'DELIVERY'), { status: 'PAID', method: 'NEFT', reference: 'DEL-TEST' });
  if (step >= 12) await ev({ type: 'MATERIAL_RECEIVED', technicianId: USERS.tech1.userId });
  if (step >= 13.5) {
    const p = await projectRepository(ctx).get(order.id);
    await projectRepository(ctx).update(order.id, { checklistDone: 6 } as any, (p as any).version);
  }
  return state;
}
