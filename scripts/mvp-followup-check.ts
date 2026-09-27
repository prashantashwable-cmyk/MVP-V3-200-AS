/**
 * MVP follow-up ladder check (Step 12, D-32): every rung fires at the right hour, reaches the
 * right people, fires once a day, and stops when the work is done. Pure rules first, then the
 * real scan + chase list on the demo repository through S1.
 * Run with: npx tsx scripts/mvp-followup-check.ts
 */
import { check, done, Clock, demoCtx, USERS } from './mvp/fixtures';
import { runS1 } from './mvp/scenario';
import type { Blocker, Task } from '../src/domain/entities';
import { chaseList, digestCounts, followUpsFor, notificationsFor, type FollowUpOrder } from '../src/mvp/followUp';
import { listChases, listMyNotifications, markChased, scanMyFollowUps, scanTaskNotifications } from '../src/mvp/services/notify';
import { completeTask, listOrderTasks, promiseTask, raiseBlocker } from '../src/mvp/services/orderService';
import { dayGroupOf, promiseOf } from '../src/mvp/followUp';
import { buildMyDay } from '../src/mvp/services/readModels';
import { stageFlow } from '../src/mvp/services/reports';
import { notificationRepository } from '../src/repository/entities';
import type { MvpLead } from '../src/mvp/leadModel';
import { setPersonPhone, usersRepository } from '../src/mvp/services/people';

const HOUR = 3_600_000;
const NOW = new Date('2026-10-05T04:30:00.000Z'); // 10:00 IST

function task(p: Omit<Partial<Task>, 'id'> & { id: string; dueInHours: number }): Task {
  return {
    orderId: 'o1', type: 'INSTALLATION', title: 'Install the lift', stage: 'INSTALLATION', assigneeId: 'u_tech', assigneeRole: 'technician',
    status: 'TODO', primary: true, createdBy: 'system', createdAt: new Date(NOW.getTime() - 5 * 24 * HOUR).toISOString(),
    updatedAt: NOW.toISOString(), version: 1, ...p, dueDate: new Date(NOW.getTime() + p.dueInHours * HOUR).toISOString(),
  } as unknown as Task;
}
const order = (id: string, status: FollowUpOrder['status'] = 'ACTIVE'): FollowUpOrder => ({ id, stage: 'installation', status, displayCode: `AE-${id}` });
const run = (tasks: Task[], extra: Partial<Parameters<typeof followUpsFor>[0]> = {}) =>
  followUpsFor({ orders: [order('o1')], tasks, openBlockers: [], leads: [], now: NOW, ...extra });
const audiences = (tasks: Task[]) => run(tasks).filter(f => f.kind !== 'NO_NEXT_ACTION').flatMap(f => notificationsFor(f, NOW)).map(n => `${n.audience}:${n.templateId}`).sort();

async function pureRules() {
  // The ladder for one task, hour by hour.
  check(audiences([task({ id: 't', dueInHours: 30 })]).length === 0, 'not due for 30 h: nobody is chased');
  check(audiences([task({ id: 't', dueInHours: 10 })]).join() === 'u_tech:mvp_task_due', 'due within 24 h: L0 reminder to the assignee only');
  check(audiences([task({ id: 't', dueInHours: 10, status: 'IN_PROGRESS' })]).length === 0, 'already started: no "due soon" nag');
  check(audiences([task({ id: 't', dueInHours: -2 })]).join() === 'u_tech:mvp_task_overdue', '2 h overdue: L1 to the assignee only');
  check(audiences([task({ id: 't', dueInHours: -25 })]).join() === 'role:admin:mvp_escalated,u_tech:mvp_task_overdue', '25 h overdue: L2 adds the Admin');
  check(audiences([task({ id: 't', dueInHours: -73 })]).join() === 'role:admin:mvp_escalated,role:owner:mvp_escalated,u_tech:mvp_task_overdue', '73 h overdue: L3 adds the Owner');
  check(audiences([task({ id: 't', dueInHours: -100, status: 'COMPLETED' })]).length === 0, 'a completed task is never chased');
  check(audiences([task({ id: 't', dueInHours: -100, status: 'BLOCKED' })]).length === 0, 'a BLOCKED task: the person is waiting, the blocker is chased instead');

  // Order status.
  const late = [task({ id: 't', dueInHours: -100 })];
  check(followUpsFor({ orders: [order('o1', 'CANCELLED')], tasks: late, openBlockers: [], leads: [], now: NOW }).length === 0, 'cancelled order: nothing chased');
  check(followUpsFor({ orders: [order('o1', 'ON_HOLD')], tasks: late, openBlockers: [], leads: [], now: NOW }).length === 0, 'on-hold order: its work tasks are not chased');
  const hold = followUpsFor({ orders: [order('o1', 'ON_HOLD')], tasks: [task({ id: 'r', type: 'REVIEW_HOLD', assigneeId: 'role:admin', dueInHours: -30 })], openBlockers: [], leads: [], now: NOW });
  check(hold.length === 1 && hold[0].kind === 'OVERDUE' && hold[0].level === 2, 'on-hold order: a late review task escalates');
  const emergencyOnCancelled = followUpsFor({ orders: [order('o1', 'CANCELLED')], tasks: [task({ id: 'e', type: 'EMERGENCY_RESPONSE', dueInHours: -0.5 })], openBlockers: [], leads: [], now: NOW });
  check(emergencyOnCancelled.length === 1 && emergencyOnCancelled[0].level === 3, 'a late emergency always goes to L3, even on a cancelled order');
  const eAud = notificationsFor(emergencyOnCancelled[0], NOW).map(n => n.audience).sort().join();
  check(eAud === 'role:admin,role:owner,u_tech', `late emergency reaches technician, Admin and Owner (got ${eAud})`);

  // Customer, role-only and no-next-action.
  const cust = run([task({ id: 'c', type: 'SITE_READINESS', assigneeId: 'customer:c1', assigneeRole: 'customer', dueInHours: -3 })]);
  check(cust[0]?.kind === 'CUSTOMER_WAITING' && cust[0].level === 2, 'customer late: straight to L2 (the Admin calls them)');
  check(notificationsFor(cust[0], NOW).map(n => n.audience).sort().join() === 'customer:c1,role:admin', 'customer late: customer bell + Admin');
  const roleTask = run([task({ id: 'q', type: 'QC_INSPECTION', assigneeId: 'role:qc', assigneeRole: 'qc', dueInHours: 20 })]);
  check(roleTask[0]?.kind === 'UNASSIGNED' && notificationsFor(roleTask[0], NOW).map(n => n.audience).join() === 'role:admin', 'task left on a role for > 4 h: Admin told, not every QC person');
  const fresh = run([task({ id: 'q', assigneeId: 'role:qc', dueInHours: 20, createdAt: new Date(NOW.getTime() - HOUR).toISOString() })]);
  check(!fresh.some(f => f.kind === 'UNASSIGNED'), 'role task only 1 h old: not flagged yet');
  const nna = followUpsFor({ orders: [order('o1'), order('o2')], tasks: [task({ id: 't', dueInHours: 50 })], openBlockers: [], leads: [], now: NOW });
  check(nna.length === 1 && nna[0].kind === 'NO_NEXT_ACTION' && nna[0].orderId === 'o2', 'ACTIVE order with no open task: NO NEXT ACTION to the Admin');

  // Blockers age: Admin at 2 days, Owner at 4 days.
  const blocker = (ageDays: number): Blocker => (({
    id: `b${ageDays}`, orderId: 'o1', taskId: 't', reason: 'POWER_UNAVAILABLE', description: 'no 3-phase', evidence: [], ownerUserId: 'u_admin',
    status: 'OPEN', dueDate: new Date(NOW.getTime() - (ageDays - 2) * 24 * HOUR).toISOString(),
    createdAt: new Date(NOW.getTime() - ageDays * 24 * HOUR).toISOString(), createdBy: 'u_tech', version: 1,
  }) as unknown) as Blocker;
  const bl = (d: number) => run([task({ id: 't', status: 'BLOCKED', dueInHours: -1 })], { openBlockers: [blocker(d)] }).filter(f => f.kind === 'BLOCKER_AGING');
  check(bl(1).length === 0, 'blocker 1 day old: not chased yet');
  check(bl(3)[0]?.level === 2, 'blocker 3 days old: L2 (Admin)');
  check(bl(5)[0]?.level === 3 && notificationsFor(bl(5)[0], NOW).some(n => n.audience === 'role:owner'), 'blocker 5 days old: L3 (Owner)');

  // Leads.
  const lead = (h: number, status: MvpLead['mvpStatus'] = 'CONTACTED') =>
    ({ id: 'l1', contactInfo: { name: 'Mrs Joshi', phone: '9800000000' }, stage: 'contacted', mvpStatus: status, ownerUserId: 'u_sales', nextFollowUp: new Date(NOW.getTime() - h * HOUR).toISOString() }) as unknown as MvpLead;
  const ld = (h: number, s?: MvpLead['mvpStatus']) => followUpsFor({ orders: [], tasks: [], openBlockers: [], leads: [lead(h, s)], now: NOW });
  check(ld(-5).length === 0, 'lead follow-up in the future: nothing');
  check(ld(2)[0]?.kind === 'LEAD_FOLLOW_UP' && ld(2)[0].personId === 'u_sales' && ld(2)[0].level === 1, 'lead follow-up 2 h late: its sales owner');
  check(ld(30)[0]?.level === 2, 'lead follow-up 30 h late: Admin too');
  check(ld(30, 'LOST').length === 0, 'a lost lead is not chased');

  // Once a day: the dedupe key carries the IST day.
  const n1 = notificationsFor(run(late)[0], NOW)[0].dedupeKey;
  const n2 = notificationsFor(run(late)[0], new Date(NOW.getTime() + 3 * HOUR))[0].dedupeKey;
  const n3 = notificationsFor(run(late)[0], new Date(NOW.getTime() + 24 * HOUR))[0].dedupeKey;
  check(n1 === n2 && n1 !== n3, 'same key all day, a new key tomorrow');

  // Chase list and digest.
  const items = run([task({ id: 'a', dueInHours: -30 }), task({ id: 'b', dueInHours: 5 }), task({ id: 'c', dueInHours: -80, lastChasedAt: new Date(NOW.getTime() - 2 * HOUR).toISOString() })]);
  const chase = chaseList(items, NOW);
  check(chase.length === 1 && chase[0].taskId === 'a', 'chase list: late items only, minus ones chased in the last 20 h');
  check(items[0].level === 3, 'worst first');
  const d = digestCounts(items);
  check(d.overdue === 2 && d.escalated === 2, `digest counts overdue and escalated (got ${JSON.stringify(d)})`);
}

async function demoScan() {
  const clock = new Clock();
  const ctx = demoCtx(clock, USERS.admin);
  const s = await runS1(ctx, clock, 12); // installation assigned to Technician Rahul, due in 21 days
  const install = (await listOrderTasks(ctx, s.orderId)).find(t => t.type === 'INSTALLATION' && t.status === 'TODO')!;
  check(!!install, 'S1.12: an open INSTALLATION task');
  const due = new Date(install.dueDate).getTime();
  const count = async () => (await notificationRepository(ctx).list()).length;

  // 26 h past the due date: technician reminded, Admin escalated.
  clock.advanceMinutes((due - clock.now().getTime()) / 60_000 + 26 * 60);
  const r1 = await scanTaskNotifications(ctx);
  check(r1.items > 0 && r1.sent > 0, `scan found follow-ups (${r1.items}) and sent reminders (${r1.sent})`);
  const tech = await listMyNotifications(ctx, USERS.tech1);
  check(tech.some(n => n.templateId === 'mvp_task_overdue' && n.projectId === s.orderId), 'technician: "task overdue" in their bell');
  const admin = await listMyNotifications(ctx, USERS.admin);
  check(admin.some(n => n.templateId === 'mvp_escalated' && n.projectId === s.orderId), 'Admin: escalation in their bell');
  const digest = admin.find(n => n.templateId === 'mvp_daily_digest');
  check(!!digest?.data && (digest.data.overdue ?? 0) >= 1, 'Admin digest carries the counts');
  check(!(await listMyNotifications(ctx, USERS.owner)).some(n => n.templateId === 'mvp_escalated'), 'Owner not bothered yet at 26 h');

  // Run again the same day: nothing new.
  const before = await count();
  await scanTaskNotifications(ctx);
  await scanMyFollowUps(ctx, USERS.tech1);
  check((await count()) === before, 'a second scan (and the technician\'s own) the same day sends nothing new');

  // 3 days later: the Owner is told.
  clock.advanceDays(2);
  await scanTaskNotifications(ctx);
  check((await listMyNotifications(ctx, USERS.owner)).some(n => n.templateId === 'mvp_escalated' && n.projectId === s.orderId), '74 h late: Owner escalated');

  // Chase list: row, phone-less fallback, "Chased" hides it; only the Admin may mark.
  await usersRepository(ctx).create({ id: USERS.tech1.userId, name: 'Technician Rahul', role: 'technician', status: 'active' });
  const noPhone = await listChases(ctx);
  check(noPhone.find(r => r.taskId === install.id)?.phone === undefined, 'no mobile on file: no WhatsApp/call button (Open order instead)');
  let phoneRefused = false;
  try { await setPersonPhone(ctx, USERS.tech1, USERS.tech1.userId, '9812345678'); } catch { phoneRefused = true; }
  check(phoneRefused, 'only the Admin can set a mobile');
  let badPhone = false;
  try { await setPersonPhone(ctx, USERS.admin, USERS.tech1.userId, '12345'); } catch { badPhone = true; }
  check(badPhone, 'an invalid mobile is refused');
  await setPersonPhone(ctx, USERS.admin, USERS.tech1.userId, '+91 98123 45678');
  let rows = await listChases(ctx);
  check(rows.find(r => r.taskId === install.id)?.phone === '9812345678' && rows.find(r => r.taskId === install.id)?.personName === 'Technician Rahul', 'Admin adds the mobile: the chase row can WhatsApp/call the technician');
  const row = rows.find(r => r.taskId === install.id);
  check(!!row && row.level === 3 && /^AE-\d{4}$/.test(row.orderCode ?? '') && row.personName.length > 0, `chase list shows the late installation at L3 with its order code (got L${row?.level} ${row?.orderCode} ${row?.personName})`);
  let refused = false;
  try { await markChased(ctx, USERS.owner, row!, 'call'); } catch { refused = true; }
  check(refused, 'the Owner (read-only) cannot mark chased');
  await markChased(ctx, USERS.admin, row!, 'whatsapp');
  rows = await listChases(ctx);
  check(!rows.some(r => r.taskId === install.id), '"Chased" hides the row');
  clock.advanceDays(1);
  rows = await listChases(ctx);
  check(rows.some(r => r.taskId === install.id), 'back on the list the next day if still late');

  // The technician's own app reminds them on a new day even if the Admin never opens it.
  const techBefore = (await listMyNotifications(ctx, USERS.tech1, 500)).length;
  const sentSelf = await scanMyFollowUps(ctx, USERS.tech1);
  check(sentSelf === 1 && (await listMyNotifications(ctx, USERS.tech1, 500)).length === techBefore + 1, 'self-scan: the technician\'s own app sends today\'s reminder (once)');
  check((await scanMyFollowUps(ctx, USERS.tech1)) === 0, 'self-scan again: nothing new');

  // Done means done.
  await completeTask(ctx, USERS.tech1, install.id, 'Installed');
  clock.advanceDays(1);
  const r2 = await scanTaskNotifications(ctx);
  const after = await listChases(ctx);
  check(!after.some(r => r.taskId === install.id) && r2.items >= 0, 'finished task: off the chase list and no more reminders');
}

async function assistantPure() {
  // D-33 promise: the ladder waits for the person's own date, then escalates a missed one.
  const promised = (atInHours: number, count = 1) => ({ promise: { at: new Date(NOW.getTime() + atInHours * HOUR).toISOString(), count, reason: 'waiting for crane', by: 'u_tech' } });
  const kept = run([task({ id: 'p', dueInHours: -30, data: promised(24) })]).filter(f => f.taskId === 'p');
  check(kept.length === 0, 'promise not yet due: no reminders, no escalation, even though the task is 30 h late');
  const broken = run([task({ id: 'p', dueInHours: -30, data: promised(-2) })]).filter(f => f.taskId === 'p');
  check(broken[0]?.kind === 'BROKEN_PROMISE' && broken[0].level === 2, 'promise missed by 2 h: straight to L2');
  check(notificationsFor(broken[0], NOW).map(n => `${n.audience}:${n.templateId}`).sort().join() === 'role:admin:mvp_promise_broken,u_tech:mvp_task_overdue', 'missed promise: the person and the Admin are told');
  const again = run([task({ id: 'p', dueInHours: -30, data: promised(24, 2) })]).filter(f => f.taskId === 'p');
  check(again[0]?.kind === 'PROMISED_AGAIN' && again[0].level === 2 && notificationsFor(again[0], NOW).length === 0, 'second "more time": on the Admin\'s chase list (no extra bell)');
  check(!promiseOf({ data: { promise: { at: 'not a date' } } } as any), 'a malformed promise is ignored');

  // D-33 look-ahead: installation open, delivery payment not in → collect before the visit.
  const inst = [task({ id: 'i', type: 'INSTALLATION', dueInHours: 200 })];
  const ms = (status: string, waived = false) => [{ orderId: 'o1', kind: 'DELIVERY', status, waived }] as any;
  const risk = (m: any, o = order('o1')) => followUpsFor({ orders: [o], tasks: inst, openBlockers: [], leads: [], milestones: m, now: NOW }).filter(f => f.kind === 'GATE_RISK');
  check(risk(ms('PENDING')).length === 1 && risk(ms('PENDING'))[0].level === 2, 'installation waiting for delivery payment: flagged to the Admin before the visit');
  check(notificationsFor(risk(ms('PENDING'))[0], NOW)[0]?.templateId === 'mvp_gate_risk', 'look-ahead notice: "Installation cannot start yet"');
  check(risk(ms('PAID')).length === 0 && risk(ms('PENDING', true)).length === 0, 'paid or waived: no warning');
  check(risk(ms('PENDING'), { ...order('o1'), gateOverrides: { INSTALLATION_START: { reason: 'x' } } }).length === 0, 'Admin override of the gate: no warning');
  check(followUpsFor({ orders: [order('o1')], tasks: [task({ id: 'i', type: 'INSTALLATION', status: 'IN_PROGRESS', dueInHours: 200 })], openBlockers: [], leads: [], milestones: ms('PENDING'), now: NOW }).every(f => f.kind !== 'GATE_RISK'), 'already started: no warning');

  // D-33 customer reminder before the due date.
  const ct = (h: number) => run([task({ id: 'c', type: 'SITE_READINESS', assigneeId: 'customer:c1', assigneeRole: 'customer', dueInHours: h })]).filter(f => f.kind === 'CUSTOMER_REMINDER');
  check(ct(48).length === 1 && ct(48)[0].level === 1, 'customer task due in 48 h: on the chase list to remind them');
  check(ct(100).length === 0 && ct(-5).length === 0, 'not yet (100 h) or already late (handled as "customer waiting")');
  check(notificationsFor(ct(48)[0], NOW).length === 0, 'the reminder is sent by the Admin (WhatsApp), not the bell');

  // D-33 My day groups.
  const g = (p: Partial<Task> & { dueInHours: number }) => dayGroupOf(task({ id: 'g', ...p }) as Task, NOW);
  check(g({ type: 'EMERGENCY_RESPONSE', dueInHours: 1 }) === 'EMERGENCY' && g({ dueInHours: -1 }) === 'LATE' && g({ dueInHours: 5 }) === 'TODAY', 'My day: emergency, late, today');
  check(g({ dueInHours: 40 }) === 'SOON' && g({ dueInHours: 200 }) === 'LATER' && g({ status: 'BLOCKED', dueInHours: -5 }) === 'WAITING', 'My day: next 3 days, later, waiting on someone');
  check(g({ dueInHours: -10, data: promised(30) }) === 'SOON', 'My day: a promise moves the task to its promised day');

  // D-33 where work is slow: per stage, slowest first.
  const doneTask = (stage: string, tookDays: number, planDays: number) => ({
    orderId: 'o1', stage, status: 'COMPLETED', createdAt: new Date(NOW.getTime() - 20 * 24 * HOUR).toISOString(),
    completedAt: new Date(NOW.getTime() - (20 - tookDays) * 24 * HOUR).toISOString(), dueDate: new Date(NOW.getTime() - (20 - planDays) * 24 * HOUR).toISOString(),
  }) as any;
  const flow = stageFlow([doneTask('SITE_READY', 19, 14), doneTask('SITE_READY', 12, 14), doneTask('QUOTE', 1, 2), { ...doneTask('QUOTE', 1, 2), status: 'CANCELLED' }], NOW);
  check(flow[0].stage === 'SITE_READY' && flow[0].onTimePct === 50 && flow[0].avgDays === 15.5 && flow[0].plannedDays === 14, `slowest stage first: site ready 50% on time, 15.5 of 14 days (got ${JSON.stringify(flow[0])})`);
  check(flow[1].stage === 'QUOTE' && flow[1].done === 1 && flow[1].onTimePct === 100, 'cancelled tasks are not counted');
}

async function assistantDemo() {
  const clock = new Clock();
  const ctx = demoCtx(clock, USERS.admin);
  const s = await runS1(ctx, clock, 12);
  const install = (await listOrderTasks(ctx, s.orderId)).find(t => t.type === 'INSTALLATION' && t.status === 'TODO')!;
  clock.advanceMinutes((new Date(install.dueDate).getTime() - clock.now().getTime()) / 60_000 + 120); // 2 h late
  const refuse = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };
  const inDays = (d: number) => new Date(clock.now().getTime() + d * 24 * HOUR).toISOString();
  check(await refuse(() => promiseTask(ctx, USERS.tech2, install.id, inDays(2), 'x')), 'someone else cannot promise for this task');
  check(await refuse(() => promiseTask(ctx, USERS.tech1, install.id, inDays(-1), 'x')), 'a promised date must be in the future');
  check(await refuse(() => promiseTask(ctx, USERS.tech1, install.id, inDays(20), 'x')), 'more than 14 days needs the Admin to re-plan');
  {
    // Not late yet: "more time" is measured from the due date, not from today.
    const c2 = new Clock();
    const ctx2 = demoCtx(c2, USERS.admin);
    const s2 = await runS1(ctx2, c2, 12);
    const t2 = (await listOrderTasks(ctx2, s2.orderId)).find(t => t.type === 'INSTALLATION' && t.status === 'TODO')!;
    const afterDue = (d: number) => new Date(new Date(t2.dueDate).getTime() + d * 24 * HOUR).toISOString();
    check(await refuse(() => promiseTask(ctx2, USERS.tech1, t2.id, new Date(new Date(t2.dueDate).getTime() - HOUR).toISOString(), 'x')), 'a "new" date before the current due date is refused');
    const p2 = await promiseTask(ctx2, USERS.tech1, t2.id, afterDue(3), 'Crane only after the 20th');
    check(promiseOf(p2)?.count === 1, 'a task due in 3 weeks can still get 3 more days (cap counts from the due date)');
    check(await refuse(() => promiseTask(ctx2, USERS.tech1, t2.id, afterDue(15), 'x')), 'but not more than 14 days past the due date');
  }
  check(await refuse(() => promiseTask(ctx, USERS.tech1, install.id, inDays(2), '  ')), 'a reason is required');
  await promiseTask(ctx, USERS.tech1, install.id, inDays(2), 'Crane only available Thursday');
  check((await listMyNotifications(ctx, USERS.admin)).some(n => n.templateId === 'mvp_promise_made' && n.projectId === s.orderId), 'the Admin is told at once that more time was asked');
  await scanTaskNotifications(ctx);
  check(!(await listMyNotifications(ctx, USERS.tech1, 500)).some(n => n.templateId === 'mvp_task_overdue' && n.projectId === s.orderId), 'while the promise holds, the technician is not nagged');
  let mine = await buildMyDay(ctx, USERS.tech1);
  const row = mine.find(r => r.task.id === install.id);
  check(row?.group === 'SOON' && !!row.promisedAt && /^AE-\d{4}$/.test(row.orderCode ?? ''), `My day shows the promised date with the order code (${row?.group} ${row?.orderCode})`);

  clock.advanceDays(3); // promise missed
  await scanTaskNotifications(ctx);
  check((await listMyNotifications(ctx, USERS.admin)).some(n => n.templateId === 'mvp_promise_broken' && n.projectId === s.orderId), 'missed promise: the Admin is told');
  check((await listChases(ctx)).some(r => r.taskId === install.id && r.kind === 'BROKEN_PROMISE'), 'missed promise: on the chase list');
  mine = await buildMyDay(ctx, USERS.tech1);
  check(mine.find(r => r.task.id === install.id)?.group === 'LATE', 'My day: late again');

  await promiseTask(ctx, USERS.tech1, install.id, inDays(1), 'Crane broke down');
  check((await listChases(ctx)).some(r => r.taskId === install.id && r.kind === 'PROMISED_AGAIN'), 'second request for more time: the Admin sees it');

  await raiseBlocker(ctx, USERS.tech1, { orderId: s.orderId, taskId: install.id, reason: 'POWER_UNAVAILABLE', description: 'No 3-phase at site' });
  mine = await buildMyDay(ctx, USERS.tech1);
  check(mine.find(r => r.task.id === install.id)?.group === 'WAITING', '"I\'m stuck": the task moves to "Waiting on someone"');
}

async function main() {
  await pureRules();
  await demoScan();
  await assistantPure();
  await assistantDemo();
  done('mvp-followup-check');
}

main().catch(err => { console.error(err); process.exit(1); });
