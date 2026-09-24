/**
 * Demo data for "Try as Role" training (D-20). DEMO ONLY: it refuses any environment other
 * than the in-memory demo repository, so it can never write to Firestore. It uses the real
 * MVP services, so the demo shows exactly what real users will see.
 */

import type { CanonicalUserRole } from '../domain/entities';
import type { MvpActor, MvpCtx } from './services/orderService';
import { applyEvent, assignSurveyor, createLead, qualifyLead, raiseBlocker, submitSurvey } from './services/orderService';
import { usersRepository } from './services/people';
import { addDays } from './format';

export interface DemoPerson { userId: string; role: CanonicalUserRole; name: string; customerId?: string }

export const DEMO_PEOPLE: Record<CanonicalUserRole, DemoPerson> = {
  admin: { userId: 'demo_admin', role: 'admin', name: 'Admin One' },
  owner: { userId: 'demo_owner', role: 'owner', name: 'Owner Test' },
  sales: { userId: 'demo_sales', role: 'sales', name: 'Sales Sameer' },
  surveyor: { userId: 'demo_surveyor', role: 'surveyor', name: 'Surveyor Suresh' },
  technician: { userId: 'demo_tech1', role: 'technician', name: 'Technician Rahul' },
  qc: { userId: 'demo_qc', role: 'qc', name: 'QC Meera' },
  customer: { userId: 'demo_customer', role: 'customer', name: 'ABC Builders' },
  supplier: { userId: 'demo_supplier', role: 'supplier', name: 'Sahyadri Lift Components' },
};

let seeded: Promise<{ customerId: string }> | null = null;

/** Idempotent per page load. Returns the customer id the demo customer login is linked to. */
export function ensureDemoSeed(ctx: MvpCtx): Promise<{ customerId: string }> {
  if (ctx.environment !== 'demo') throw new Error('Demo seed runs only in demo mode.');
  seeded ??= seed(ctx);
  return seeded;
}

async function seed(ctx: MvpCtx): Promise<{ customerId: string }> {
  const people = Object.values(DEMO_PEOPLE);
  for (const p of people) await usersRepository(ctx).create({ id: p.userId, name: p.name, role: p.role, status: 'active' });
  await usersRepository(ctx).create({ id: 'demo_tech2', name: 'Technician Vikas', role: 'technician', status: 'active' });

  const admin: MvpActor = { userId: DEMO_PEOPLE.admin.userId, role: 'admin' };
  const sales: MvpActor = { userId: DEMO_PEOPLE.sales.userId, role: 'sales' };
  const surveyor: MvpActor = { userId: DEMO_PEOPLE.surveyor.userId, role: 'surveyor' };
  const photos = ['demo_photo_1', 'demo_photo_2'];
  const survey = {
    floors: 8, stops: 8, capacityPersons: 8, shaftWidthMm: 1800, shaftDepthMm: 1900, pitMm: 1500, headroomMm: 4200,
    power: '3-phase available', access: 'Truck access', siteReadiness: 'Structure complete', remarks: 'Standard shaft',
    photoIds: photos, result: 'FEASIBLE' as const,
  };
  const lead = (name: string, phone: string, location: string) => createLead(ctx, sales, {
    name, phone, location, source: 'Referral', siteType: 'residential', floors: 8,
    liftRequirement: 'G+7 passenger lift, 8 persons', constructionStage: 'structure-up', consent: true,
  });

  // A fresh lead, not yet qualified.
  await lead('Mrs. Deshpande', '9822000001', 'Kothrud, Pune');

  // Order at SURVEY.
  const l1 = await lead('Joshi Residency', '9822000002', 'Aundh, Pune');
  const o1 = await qualifyLead(ctx, sales, l1.id);
  await assignSurveyor(ctx, admin, o1.id, surveyor.userId, addDays(new Date(), 1).toISOString());

  // Order at QUOTE with a customer blocker.
  const l2 = await lead('Patil Heights', '9822000003', 'Wakad, Pune');
  const o2 = await qualifyLead(ctx, sales, l2.id);
  await assignSurveyor(ctx, admin, o2.id, surveyor.userId);
  await submitSurvey(ctx, surveyor, o2.id, survey);
  await raiseBlocker(ctx, admin, { orderId: o2.id, reason: 'CUSTOMER_NOT_READY', description: 'Customer travelling until next week' });

  // Order at INSTALLATION for Technician Rahul (the demo customer's lift).
  const l3 = await lead('ABC Builders (Mr. Kulkarni)', '9876543210', 'Baner, Pune');
  const o3 = await qualifyLead(ctx, sales, l3.id);
  await assignSurveyor(ctx, admin, o3.id, surveyor.userId);
  await submitSurvey(ctx, surveyor, o3.id, survey);
  for (const e of [
    { type: 'QUOTE_SENT' }, { type: 'QUOTE_ACCEPTED' }, { type: 'PAYMENT_PAID', kind: 'BOOKING_TOKEN' }, { type: 'PO_RAISED' },
    { type: 'READINESS_SUBMITTED' }, { type: 'SITE_READY_CONFIRMED' },
    { type: 'MATERIAL_RECEIVED', technicianId: DEMO_PEOPLE.technician.userId },
  ] as const) {
    await applyEvent(ctx, admin, o3.id, e as any);
  }
  return { customerId: o3.customerId };
}
