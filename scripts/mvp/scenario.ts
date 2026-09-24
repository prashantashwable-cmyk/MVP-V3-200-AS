/**
 * S1 driver for MVP checks (demo repository). Each later step replaces the `applyEvent`
 * shortcuts below with the real service call it builds (quote, payment, supply, install…).
 */
import type { MvpCtx } from '../../src/mvp/services/orderService';
import { applyEvent, assignSurveyor, createLead, qualifyLead, submitSurvey } from '../../src/mvp/services/orderService';
import { projectRepository } from '../../src/repository/entities';
import { Clock, FIXTURE_LEAD, FIXTURE_SURVEY, USERS } from './fixtures';

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
  if (step >= 5) await ev({ type: 'QUOTE_SENT' });
  if (step >= 6) await ev({ type: 'QUOTE_ACCEPTED' });
  if (step >= 7) await ev({ type: 'PAYMENT_PAID', kind: 'BOOKING_TOKEN' });
  if (step >= 8) await ev({ type: 'PO_RAISED' });
  if (step >= 9) await ev({ type: 'READINESS_SUBMITTED' });
  if (step >= 10) await ev({ type: 'SITE_READY_CONFIRMED', poExpectedDate: at(10) });
  if (step >= 11) await ev({ type: 'PAYMENT_PAID', kind: 'DELIVERY' });
  if (step >= 12) await ev({ type: 'MATERIAL_RECEIVED', technicianId: USERS.tech1.userId });
  if (step >= 13.5) {
    const p = await projectRepository(ctx).get(order.id);
    await projectRepository(ctx).update(order.id, { checklistDone: 6 } as any, (p as any).version);
  }
  return state;
}
