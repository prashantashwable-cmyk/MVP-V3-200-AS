/**
 * Step 07 check (demo repository): S1 steps 8–12 through the real services, S2 (customer
 * delay → OVERDUE → hold → resume + extend, all audited), S5 up to material received, a
 * delayed PO in the supplier-delay bucket, and readiness validation / return.
 * Run with: npx tsx scripts/mvp-supply-check.ts
 */
import { check, done, Clock, demoCtx, USERS, customerActor, assertInvariants } from './mvp/fixtures';
import { runS1, TINY_JPEG } from './mvp/scenario';
import {
  submitReadiness, returnReadiness, confirmSiteReady, raisePo, updatePo, createSupplier, markMaterialReceived, listOrderPos, READINESS_ITEMS,
  getInstallationJob, getReceipt,
} from '../src/mvp/services/supplyService';
import { saveEvidence } from '../src/mvp/services/evidenceService';
import { verifyPayment, milestoneId, listMilestones } from '../src/mvp/services/paymentService';
import { changeDueDate, listOrderTasks, putOnHold, resumeOrder, MvpError } from '../src/mvp/services/orderService';
import { buildOrderView, bucketsFor } from '../src/mvp/services/readModels';
import { projectRepository, purchaseOrderRepository } from '../src/repository/entities';
import { listAuditEventsForEntity } from '../src/lib/audit';
import { isOpenTask } from '../src/mvp/health';

async function expectError(p: Promise<unknown>, code: MvpError['code'], msg: string) {
  try { await p; check(false, msg); } catch (e: any) { check(e instanceof MvpError && e.code === code, `${msg} (${e.message})`); }
}

async function main() {
  const clock = new Clock();
  const ctx = demoCtx(clock, USERS.admin);
  const days = (d: number) => new Date(clock.now().getTime() + d * 86_400_000).toISOString();
  const view = async (id: string) => (await buildOrderView(ctx, USERS.admin, id, { [USERS.tech1.userId]: 'Technician Rahul' }))!;

  // S1 step 8: PO raised, RAISE_PO completes, SITE_READINESS still current.
  const s = await runS1(ctx, clock, 7);
  const cust = customerActor(s.customerId);
  const sup = await createSupplier(ctx, USERS.admin, { name: 'Sahyadri Lift Components', contactName: 'Mr. Joshi', phone: '9822012345' });
  await expectError(raisePo(ctx, USERS.admin, s.orderId, { supplierId: sup.id, items: 'kit', amount: 0, expectedDeliveryDate: days(10) }), 'invalid', 'a PO needs an amount');
  await expectError(raisePo(ctx, cust, s.orderId, { supplierId: sup.id, items: 'kit', amount: 1, expectedDeliveryDate: days(10) }), 'forbidden', 'a customer cannot raise a PO');
  const po = await raisePo(ctx, USERS.admin, s.orderId, { supplierId: sup.id, items: 'G+7 lift kit', amount: 700000, expectedDeliveryDate: days(10) });
  let v = await view(s.orderId);
  check(v.stage === 'SITE_READY' && v.currentTask?.type === 'SITE_READINESS' && !v.openTasks.some(t => t.type === 'RAISE_PO'), 'S1.8 RAISE_PO completes; SITE_READINESS → customer still current');
  check(po.materialStatus === 'ORDERED' && po.expectedDeliveryDate === days(10), 'S1.8 PO ORDERED with the expected date');
  await assertInvariants(ctx, s.orderId, 'S1.8');

  // S1 step 9: readiness with photos (validation first).
  const photo = async (who: any, c: string) => (await saveEvidence(ctx, who, { dataUrl: TINY_JPEG, contentType: 'image/jpeg', orderId: s.orderId, caption: c })).id;
  const items: any = {};
  for (const i of READINESS_ITEMS) items[i.key] = { ok: true, photoId: await photo(cust, i.label) };
  await expectError(submitReadiness(ctx, cust, s.orderId, { items: { ...items, pitDry: { ok: true } } }), 'invalid', 'every readiness item needs a photo');
  await expectError(submitReadiness(ctx, customerActor('other'), s.orderId, { items }), 'forbidden', 'another customer cannot submit readiness');
  await submitReadiness(ctx, cust, s.orderId, { items, note: 'Ready' });
  v = await view(s.orderId);
  check(v.currentTask?.type === 'VERIFY_SITE_READY' && v.currentTask.assigneeId === 'role:admin' && v.progress === 40, 'S1.9 VERIFY_SITE_READY → admin');
  const doneReadiness = (await listOrderTasks(ctx, s.orderId)).find(t => t.type === 'SITE_READINESS')!;
  check((doneReadiness.evidenceIds ?? []).length === READINESS_ITEMS.length && !!(doneReadiness.data as any)?.readiness, 'the checklist and its photos are recorded on the task');
  // Return once, then resubmit.
  await returnReadiness(ctx, USERS.admin, s.orderId, 'Pit photo shows water');
  v = await view(s.orderId);
  check(v.currentTask?.type === 'SITE_READINESS' && v.currentTask.assigneeId === `customer:${s.customerId}`, 'returned → the customer task reopens');
  await submitReadiness(ctx, cust, s.orderId, { items, note: 'Pit pumped dry' });
  await assertInvariants(ctx, s.orderId, 'S1.9');

  // S1 step 10: Admin confirms → DELIVERY; TRACK_DELIVERY due = PO date; delivery payment due +2.
  await confirmSiteReady(ctx, USERS.admin, s.orderId);
  v = await view(s.orderId);
  check(v.stage === 'DELIVERY' && v.currentTask?.type === 'TRACK_DELIVERY' && v.currentTask.dueDate === days(10) && v.progress === 50, 'S1.10 DELIVERY, TRACK_DELIVERY due = PO date');
  check(v.openTasks.some(t => t.type === 'COLLECT_DELIVERY_PAYMENT'), 'S1.10 COLLECT_DELIVERY_PAYMENT open');
  check((await listMilestones(ctx, s.orderId)).find(m => m.kind === 'DELIVERY')?.dueDate === days(12), 'delivery payment due = delivery date + 2');
  await assertInvariants(ctx, s.orderId, 'S1.10');

  // Supplier delay: date change moves TRACK_DELIVERY (audited); DELAYED → supplier-delay bucket.
  await expectError(updatePo(ctx, USERS.admin, po.id, { materialStatus: 'DELAYED' }), 'invalid', 'DELAYED needs a reason');
  await updatePo(ctx, USERS.admin, po.id, { materialStatus: 'DELAYED', delayReason: 'Factory backlog', expectedDeliveryDate: days(15) });
  const track = (await listOrderTasks(ctx, s.orderId)).find(t => t.type === 'TRACK_DELIVERY' && isOpenTask(t))!;
  check(track.dueDate === days(15), 'TRACK_DELIVERY follows the new expected date');
  check((await listAuditEventsForEntity(ctx, 'Task', track.id)).some(e => e.action === 'TASK_DUE_CHANGED'), 'the due-date change is audited');
  const order = (await projectRepository(ctx).get(s.orderId))!;
  const b = bucketsFor(order, await listOrderTasks(ctx, s.orderId), [], [], await listOrderPos(ctx, s.orderId), clock.now());
  check(b.buckets.includes('supplier_delay'), 'a DELAYED PO puts the order in Supplier delay');
  await updatePo(ctx, USERS.admin, po.id, { materialStatus: 'DISPATCHED', delayReason: '' });

  // S1 step 11: delivery payment PAID → ₹10,62,000 / ₹11,80,000.
  await verifyPayment(ctx, USERS.admin, milestoneId(s.orderId, 'DELIVERY'), { status: 'PAID', method: 'NEFT', reference: 'DEL-1' });
  v = await view(s.orderId);
  check(v.payments?.paid === 1062000 && v.payments.total === 1180000 && v.currentTask?.type === 'TRACK_DELIVERY', 'S1.11 payment ₹10,62,000 / ₹11,80,000');

  // S1 step 12: material received → INSTALLATION → tech1.
  await expectError(markMaterialReceived(ctx, USERS.admin, s.orderId, { note: 'ok', photoIds: [] }), 'invalid', 'material received needs a photo');
  await markMaterialReceived(ctx, USERS.admin, s.orderId, { note: 'All 14 boxes received', photoIds: [await photo(USERS.admin, 'material')], technicianId: USERS.tech1.userId });
  v = await view(s.orderId);
  check(v.stage === 'INSTALLATION' && v.currentTask?.type === 'INSTALLATION' && v.currentOwner === 'Technician Rahul' && v.progress === 55, 'S1.12 INSTALLATION → tech1, 55%');
  check((await getReceipt(ctx, s.orderId))?.status === 'ok' && (await purchaseOrderRepository(ctx).get(po.id))?.materialStatus === 'DELIVERED', 'receipt recorded, PO DELIVERED');
  check((await getInstallationJob(ctx, s.orderId))?.technicianId === USERS.tech1.userId, 'installation job created for tech1');
  await assertInvariants(ctx, s.orderId, 'S1.12');

  // S2: customer delay.
  const s2 = await runS1(ctx, clock, 7);
  clock.advanceDays(15);
  let v2 = await view(s2.orderId);
  check(v2.health === 'OVERDUE', 'S2 SITE_READINESS overdue → OVERDUE');
  const b2 = bucketsFor((await projectRepository(ctx).get(s2.orderId))!, await listOrderTasks(ctx, s2.orderId), [], [], [], clock.now());
  check(b2.buckets.includes('overdue') && b2.buckets.includes('customer_waiting'), 'S2 Needs Attention → Overdue / Customer waiting');
  await putOnHold(ctx, USERS.admin, s2.orderId, 'CUSTOMER_NOT_READY', days(7));
  v2 = await view(s2.orderId);
  check(v2.health === 'ON_HOLD' && v2.stage === 'SITE_READY' && v2.openTasks.some(t => t.type === 'REVIEW_HOLD'), 'S2 hold → ON_HOLD, stage still SITE_READY, REVIEW_HOLD created');
  await resumeOrder(ctx, USERS.admin, s2.orderId, 'Customer back');
  const sr = (await listOrderTasks(ctx, s2.orderId)).find(t => t.type === 'SITE_READINESS' && isOpenTask(t))!;
  await changeDueDate(ctx, USERS.admin, sr.id, days(7), 'Extended by 7 days after the hold');
  v2 = await view(s2.orderId);
  check(v2.status === 'ACTIVE' && v2.health === 'ON_TRACK', 'S2 resume + extend → ACTIVE, ON_TRACK');
  const a2 = await listAuditEventsForEntity(ctx, 'Project', s2.orderId);
  check(a2.filter(e => e.action === 'ORDER_STATUS_CHANGED').length >= 2 && (await listAuditEventsForEntity(ctx, 'Task', sr.id)).some(e => e.action === 'TASK_DUE_CHANGED'), 'S2 the resume and the due-date change are both audited');

  // S5 up to material received: delivery payment not paid, material can still be received.
  const s5 = await runS1(ctx, clock, 10);
  await markMaterialReceived(ctx, USERS.admin, s5.orderId, { note: 'All boxes', photoIds: [await photo(USERS.admin, 'm')], technicianId: USERS.tech1.userId });
  const v5 = await view(s5.orderId);
  check(v5.stage === 'INSTALLATION' && v5.openTasks.some(t => t.type === 'INSTALLATION') && v5.openTasks.some(t => t.type === 'COLLECT_DELIVERY_PAYMENT'), 'S5 material received without the delivery payment → INSTALLATION task exists');

  // Customer never sees PO amounts (the Order View model carries none).
  const custView = (await buildOrderView(ctx, customerActor(s.customerId), s.orderId))!;
  check(!JSON.stringify(custView).includes('700000'), 'the customer Order View has no PO amount');

  done('mvp-supply-check');
}

main().catch(err => { console.error(err); process.exitCode = 1; });
