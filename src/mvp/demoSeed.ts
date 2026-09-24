/**
 * Demo data for "Try as Role" training (D-20). DEMO ONLY: it refuses any environment other
 * than the in-memory demo repository, so it can never write to Firestore. It uses the real
 * MVP services, so the demo shows exactly what real users will see.
 */

import type { CanonicalUserRole } from '../domain/entities';
import type { MvpActor, MvpCtx } from './services/orderService';
import { assignSurveyor, createLead, listOrderTasks, qualifyLead, raiseBlocker, submitSurvey } from './services/orderService';
import { usersRepository } from './services/people';
import { decideQuote, saveQuote, sendQuote } from './services/quoteService';
import { milestoneId, verifyPayment } from './services/paymentService';
import { confirmSiteReady, createSupplier, markMaterialReceived, raisePo, READINESS_ITEMS, submitReadiness } from './services/supplyService';
import { saveEvidence } from './services/evidenceService';
import { assignQcInspector, checkInAtSite, CHECKLIST_ITEMS, completeWork, setChecklistItem, startWork } from './services/installationService';
import { submitQcDecision } from './services/qcHandoverService';

/** A 1×1 PNG so demo evidence renders; demo data only. */
const DEMO_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
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
  // Demo values only; the tax rate here is a sample, not the company's rate (⚖ VERIFY with the CA).
  const demoQuote = { lines: { base: 780000, installation: 140000, freight: 50000, other: 30000 }, taxRatePct: 18, estimatedCost: 800000 };
  const customer: MvpActor = { userId: DEMO_PEOPLE.customer.userId, role: 'customer', customerId: o3.customerId };
  await saveQuote(ctx, admin, o3.id, demoQuote);
  await sendQuote(ctx, admin, o3.id);
  await decideQuote(ctx, customer, o3.id, 'accept');
  await verifyPayment(ctx, admin, milestoneId(o3.id, 'BOOKING_TOKEN'), { status: 'PAID', method: 'UPI', reference: 'DEMO-UTR-1' });
  const sup = await createSupplier(ctx, admin, { name: 'Sahyadri Lift Components', contactName: 'Mr. Joshi', phone: '9822012345' });
  await raisePo(ctx, admin, o3.id, { supplierId: sup.id, items: 'G+7 lift kit, 8 stops', amount: 700000, expectedDeliveryDate: addDays(new Date(), 5).toISOString() });
  const pic = async (who: MvpActor, caption: string) => (await saveEvidence(ctx, who, { dataUrl: DEMO_PNG, contentType: 'image/png', orderId: o3.id, caption })).id;
  const items: any = {};
  for (const i of READINESS_ITEMS) items[i.key] = { ok: true, photoId: await pic(customer, i.label) };
  await submitReadiness(ctx, customer, o3.id, { items, note: 'Site is ready' });
  await confirmSiteReady(ctx, admin, o3.id);
  await verifyPayment(ctx, admin, milestoneId(o3.id, 'DELIVERY'), { status: 'PAID', method: 'NEFT', reference: 'DEMO-UTR-2' });
  await markMaterialReceived(ctx, admin, o3.id, { note: 'All 14 boxes received', photoIds: [await pic(admin, 'Material at site')], technicianId: DEMO_PEOPLE.technician.userId });
  // The technician has started: checked in and 6 of 11 checklist items done (S1 step 13a).
  const tech: MvpActor = { userId: DEMO_PEOPLE.technician.userId, role: 'technician' };
  await assignQcInspector(ctx, admin, o3.id, DEMO_PEOPLE.qc.userId);
  const install = (await listOrderTasks(ctx, o3.id)).find(t => t.type === 'INSTALLATION')!;
  await startWork(ctx, tech, install.id);
  await checkInAtSite(ctx, tech, install.id);
  for (const item of CHECKLIST_ITEMS.slice(0, 6)) await setChecklistItem(ctx, tech, install.id, item.key, { done: true, documentId: await pic(tech, item.label) });

  // Order waiting for the customer's quote decision.
  const l4 = await lead('Kale Towers', '9822000004', 'Hinjewadi, Pune');
  const o4 = await qualifyLead(ctx, sales, l4.id);
  await assignSurveyor(ctx, admin, o4.id, surveyor.userId);
  await submitSurvey(ctx, surveyor, o4.id, survey);
  await saveQuote(ctx, admin, o4.id, { ...demoQuote, estimatedCost: 850000 });

  // Runs a fresh order through to a completed 11-item installation (S1 steps 1–13b), for
  // the Step 09 QC/handover demo orders below. Its own technician avoids clashing with
  // tech1's in-progress checklist on o3.
  const tech2: MvpActor = { userId: 'demo_tech2', role: 'technician' };
  async function runToInstalled(name: string, phone: string, location: string) {
    const l = await lead(name, phone, location);
    const o = await qualifyLead(ctx, sales, l.id);
    await assignSurveyor(ctx, admin, o.id, surveyor.userId);
    await submitSurvey(ctx, surveyor, o.id, survey);
    const cust: MvpActor = { userId: DEMO_PEOPLE.customer.userId, role: 'customer', customerId: o.customerId };
    await saveQuote(ctx, admin, o.id, demoQuote);
    await sendQuote(ctx, admin, o.id);
    await decideQuote(ctx, cust, o.id, 'accept');
    await verifyPayment(ctx, admin, milestoneId(o.id, 'BOOKING_TOKEN'), { status: 'PAID', method: 'UPI', reference: `DEMO-${o.id}-1` });
    await raisePo(ctx, admin, o.id, { supplierId: sup.id, items: 'G+7 lift kit, 8 stops', amount: 700000, expectedDeliveryDate: addDays(new Date(), 5).toISOString() });
    const its: any = {};
    for (const i of READINESS_ITEMS) its[i.key] = { ok: true, photoId: await pic(cust, i.label) };
    await submitReadiness(ctx, cust, o.id, { items: its, note: 'Site is ready' });
    await confirmSiteReady(ctx, admin, o.id);
    await verifyPayment(ctx, admin, milestoneId(o.id, 'DELIVERY'), { status: 'PAID', method: 'NEFT', reference: `DEMO-${o.id}-2` });
    await markMaterialReceived(ctx, admin, o.id, { note: 'All 14 boxes received', photoIds: [await pic(admin, 'Material at site')], technicianId: tech2.userId });
    await assignQcInspector(ctx, admin, o.id, DEMO_PEOPLE.qc.userId);
    const install = (await listOrderTasks(ctx, o.id)).find(t => t.type === 'INSTALLATION')!;
    await startWork(ctx, tech2, install.id);
    await checkInAtSite(ctx, tech2, install.id);
    for (const item of CHECKLIST_ITEMS) await setChecklistItem(ctx, tech2, install.id, item.key, { done: true, documentId: await pic(tech2, item.label) });
    await completeWork(ctx, tech2, install.id, { note: 'Ready for QC' });
    return o;
  }

  // Order at QC_HANDOVER, QC_INSPECTION open for QC Meera (the QC decision panel).
  await runToInstalled('Deshmukh Enclave', '9822000005', 'Viman Nagar, Pune');

  // Order just past a QC PASS: HANDOVER + COLLECT_FINAL_PAYMENT + STATUTORY_LICENCE open,
  // both handover gates still closed (the Admin's override affordance).
  const o6 = await runToInstalled('Sane Guruji Society', '9822000006', 'Kothrud, Pune');
  const qc: MvpActor = { userId: DEMO_PEOPLE.qc.userId, role: 'qc' };
  await submitQcDecision(ctx, qc, o6.id, {
    decision: 'PASS', tests: { mechanical: true, electrical: true, safety: true, testRun: true }, remarks: 'All systems tested OK.',
  });

  return { customerId: o3.customerId };
}
