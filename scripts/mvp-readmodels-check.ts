/**
 * MVP read-model check (Step 04): the Universal Order View model through S1 steps 1–13a
 * (71% at 13a), role filtering (money/audit/cost), and the dashboard's Needs-Attention
 * buckets for S2, S3, S5 and NO NEXT ACTION. Demo repository only.
 * Run with: npx tsx scripts/mvp-readmodels-check.ts
 */
import { check, done, Clock, demoCtx, USERS, customerActor } from './mvp/fixtures';
import { runS1 } from './mvp/scenario';
import { buildOrderView, buildDashboard, bucketsFor, listOrdersFor } from '../src/mvp/services/readModels';
import { listOrderTasks, listOpenBlockers, raiseBlocker, completeTask } from '../src/mvp/services/orderService';
import { paymentMilestoneRepository, projectRepository, purchaseOrderRepository } from '../src/repository/entities';
import { isOpenTask } from '../src/mvp/health';

async function main() {
  const clock = new Clock();
  const ctx = demoCtx(clock, USERS.admin);

  // S1 steps 1–13a: stage, current task/owner and progress in the Order View model.
  const expected: [number, string, string, string, number][] = [
    [2, 'QUALIFIED', 'ASSIGN_SURVEYOR', 'Admin', 5],
    [3, 'SURVEY', 'SURVEY', 'Surveyor Suresh', 10],
    [4, 'QUOTE', 'PREPARE_QUOTE', 'Admin', 20],
    [5, 'QUOTE', 'QUOTE_DECISION', 'Customer', 20],
    [6, 'BOOKED', 'COLLECT_BOOKING_TOKEN', 'Admin', 30],
    [7, 'SITE_READY', 'SITE_READINESS', 'Customer', 40],
    [9, 'SITE_READY', 'VERIFY_SITE_READY', 'Admin', 40],
    [10, 'DELIVERY', 'TRACK_DELIVERY', 'Admin', 50],
    [12, 'INSTALLATION', 'INSTALLATION', 'Technician Rahul', 55],
    [13.5, 'INSTALLATION', 'INSTALLATION', 'Technician Rahul', 71],
  ];
  const names = { [USERS.surveyor.userId]: 'Surveyor Suresh', [USERS.tech1.userId]: 'Technician Rahul' };
  let s1: { orderId: string; customerId: string } | null = null;
  for (const [step, stage, task, owner, progress] of expected) {
    const s = await runS1(ctx, clock, step);
    const v = (await buildOrderView(ctx, USERS.admin, s.orderId, names))!;
    check(v.stage === stage && v.currentTask?.type === task && v.currentOwner === owner && v.progress === progress && v.health === 'ON_TRACK',
      `S1.${step === 13.5 ? '13a' : step}: ${stage} · ${task} → ${owner} · ${progress}% · ON_TRACK (got ${v.stage} · ${v.currentTask?.type} → ${v.currentOwner} · ${v.progress}% · ${v.health})`);
    check(/^AE-\d{4}$/.test(v.code) && !!v.currentTask?.dueDate, `S1.${step}: order code and due date shown`);
    if (step === 7) check(v.openTasks.some(t => t.type === 'RAISE_PO'), 'S1.7 RAISE_PO is also open');
    if (step === 10) check(v.openTasks.some(t => t.type === 'COLLECT_DELIVERY_PAYMENT'), 'S1.10 COLLECT_DELIVERY_PAYMENT is also open');
    if (step === 13.5) s1 = s;
  }

  // Role filtering: money for admin/owner/customer; audit for admin/owner; never cost.
  const id = s1!.orderId;
  const forAdmin = (await buildOrderView(ctx, USERS.admin, id))!;
  const forOwner = (await buildOrderView(ctx, USERS.owner, id))!;
  const forTech = (await buildOrderView(ctx, USERS.tech1, id))!;
  const forCust = (await buildOrderView(ctx, customerActor(s1!.customerId), id))!;
  check(!!forAdmin.payments && !!forAdmin.audit && forAdmin.audit.length > 0, 'admin sees payments and history');
  check(!!forOwner.payments && !!forOwner.audit, 'owner sees payments and history (read-only)');
  check(!forTech.payments && !forTech.audit, 'technician sees neither money nor history');
  check(!!forCust.payments && !forCust.audit, 'customer sees payments but not the audit log');
  check(forTech.currentOwner === 'You', 'the assignee sees "You" as the owner');
  check(!('estimatedCost' in (forAdmin as any)) && !JSON.stringify(forCust).includes('estimatedCost'), 'I-5: no cost fields in any Order View model');

  // Lists: customer sees only their own order; technician sees orders they have a task on.
  const custOrders = await listOrdersFor(ctx, customerActor(s1!.customerId));
  check(custOrders.length === 1 && custOrders[0].id === id, 'customer order list = their own order only');
  check((await listOrdersFor(ctx, USERS.tech1)).some(o => o.id === id), 'technician lists the order they are assigned to');
  check(!(await listOrdersFor(ctx, USERS.tech2)).some(o => o.id === id), 'another technician does not');

  // S2: customer delay → OVERDUE + customer waiting (clock +15 days, injected).
  const s2 = await runS1(ctx, clock, 7);
  const later = new Date(clock.now().getTime() + 15 * 86_400_000);
  const b2 = bucketsFor((await projectRepository(ctx).get(s2.orderId))!, await listOrderTasks(ctx, s2.orderId), [], [], [], later);
  check(b2.health === 'OVERDUE' && b2.buckets.includes('overdue') && b2.buckets.includes('customer_waiting'), 'S2: SITE_READINESS overdue → OVERDUE, Needs Attention → Overdue / Customer waiting');

  // S3: technician blocker → BLOCKED + technician waiting.
  const s3 = await runS1(ctx, clock, 13.5);
  const inst = (await listOrderTasks(ctx, s3.orderId)).find(t => t.type === 'INSTALLATION' && isOpenTask(t))!;
  await raiseBlocker(ctx, USERS.tech1, { orderId: s3.orderId, taskId: inst.id, reason: 'MATERIAL_MISSING', description: 'Brackets missing' });
  const b3 = bucketsFor((await projectRepository(ctx).get(s3.orderId))!, await listOrderTasks(ctx, s3.orderId), await listOpenBlockers(ctx, s3.orderId), [], [], clock.now());
  check(b3.health === 'BLOCKED' && b3.buckets.includes('blocked') && b3.buckets.includes('technician_waiting'), 'S3: MATERIAL_MISSING → BLOCKED, Needs Attention → Blocked / Technician waiting');

  // S5: delivery payment past due → AT_RISK + payment pending.
  const s5 = await runS1(ctx, clock, 10);
  await paymentMilestoneRepository(ctx).create({
    id: `ms_${s5.orderId}_DELIVERY` as any, orderId: s5.orderId as any, kind: 'DELIVERY', label: 'Delivery payment', amount: 1052000,
    dueDate: new Date(clock.now().getTime() + 12 * 86_400_000).toISOString(), status: 'PENDING', amountReceived: 0,
    createdAt: clock.now().toISOString(), updatedAt: clock.now().toISOString(), version: 0,
  });
  const at13 = new Date(clock.now().getTime() + 5 * 86_400_000);
  const pastDue = new Date(clock.now().getTime() + 13 * 86_400_000);
  const ms = await paymentMilestoneRepository(ctx).query({ orderId: s5.orderId } as any);
  const tasks5 = await listOrderTasks(ctx, s5.orderId);
  const order5 = (await projectRepository(ctx).get(s5.orderId))!;
  check(bucketsFor(order5, tasks5, [], ms, [], at13).health === 'ON_TRACK', 'S5: before the due date the order is ON_TRACK');
  // Keep the current task in the future so the milestone alone drives the result.
  const b5 = bucketsFor(order5, tasks5.map(t => ({ ...t, dueDate: new Date(pastDue.getTime() + 10 * 86_400_000).toISOString() })), [], ms, [], pastDue);
  check(b5.health === 'AT_RISK' && b5.buckets.includes('payment_pending'), 'S5: unpaid delivery milestone past due → AT_RISK, Needs Attention → Payment pending');

  // Supplier delay bucket from a DELAYED PO.
  await purchaseOrderRepository(ctx).create({ id: 'po_delay_test' as any, projectId: s5.orderId as any, supplierId: 'sup1' as any, status: 'sent_to_supplier', amount: 1, createdAt: clock.now().toISOString(), createdBy: 'u_admin' as any, idempotencyKey: 'po_delay_test', materialStatus: 'DELAYED', delayReason: 'Factory backlog' });
  const b5b = bucketsFor(order5, tasks5, [], [], await purchaseOrderRepository(ctx).query({ projectId: s5.orderId } as any), clock.now());
  check(b5b.buckets.includes('supplier_delay'), 'a DELAYED PO puts the order in Supplier delay');

  // NO NEXT ACTION.
  const s6 = await runS1(ctx, clock, 4);
  for (const t of (await listOrderTasks(ctx, s6.orderId)).filter(isOpenTask)) await completeTask(ctx, USERS.admin, t.id);
  const dash = await buildDashboard(ctx);
  const nna = dash.attention.find(g => g.bucket === 'no_next_action');
  check(!!nna && nna.orders.some(o => o.id === s6.orderId), 'NO NEXT ACTION order appears in Needs Attention');
  check(dash.pipeline.LEAD >= 0 && dash.pipeline.INSTALLATION >= 2 && dash.pipeline.QUOTE >= 1, `pipeline counts per stage (${JSON.stringify(dash.pipeline)})`);
  check(dash.attention.find(g => g.bucket === 'blocked')?.orders.some(o => o.id === s3.orderId) === true, 'dashboard groups the S3 order under Blocked');
  check(dash.today.length === 9, 'TODAY shows the 9 spec §9 counters');

  done('mvp-readmodels-check');
}

main().catch(err => { console.error(err); process.exitCode = 1; });
