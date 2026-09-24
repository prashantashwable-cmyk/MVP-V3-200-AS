/**
 * MVP order-service check (Step 03), demo repository only (D-19).
 * Walks S1 steps 1–4 asserting stage, current task/owner, progress and invariants I-1..I-4
 * after every step, then exercises hold/resume/cancel/override, blockers, reassignment,
 * the duplicate-event guard (I-2) and role checks.
 * Run with: npx tsx scripts/mvp-order-service-check.ts
 */
import { check, done, Clock, demoCtx, USERS, FIXTURE_LEAD, FIXTURE_SURVEY, assertInvariants, customerActor } from './mvp/fixtures';
import {
  createLead, qualifyLead, assignSurveyor, submitSurvey, listOrderTasks, listLeadTasks, leadRepository,
  putOnHold, resumeOrder, cancelOrder, overrideStage, raiseBlocker, resolveBlocker, reassignTask, changeDueDate,
  applyEvent, MvpError, completeTask, createAdminTask, listOpenBlockers,
} from '../src/mvp/services/orderService';
import { projectRepository, customerRepository, taskRepository } from '../src/repository/entities';
import { listAuditEventsForEntity } from '../src/lib/audit';
import { currentTask, computeHealth, isOpenTask } from '../src/mvp/health';
import { computeProgress } from '../src/mvp/progress';
import { toMvpStage } from '../src/mvp/stage';
import { leadStatus } from '../src/mvp/leadModel';
import type { MvpCtx } from '../src/mvp/services/orderService';

async function expectError(p: Promise<unknown>, code: MvpError['code'], msg: string) {
  try { await p; check(false, msg); } catch (e: any) { check(e instanceof MvpError && e.code === code, `${msg} (${e.message})`); }
}

async function state(ctx: MvpCtx, orderId: string) {
  const order = (await projectRepository(ctx).get(orderId))!;
  const tasks = await listOrderTasks(ctx, orderId);
  const stage = toMvpStage(order.stage);
  const cur = currentTask(tasks, stage);
  return { order, tasks, stage, cur, progress: computeProgress({ stage, checklistDone: order.checklistDone, qcPassed: !!order.qcPassedAt }) };
}

async function main() {
  const clock = new Clock();
  const ctx = demoCtx(clock, USERS.admin);

  // S1 step 1 — sales creates a lead.
  const lead = await createLead(ctx, USERS.sales, FIXTURE_LEAD);
  check(leadStatus(lead) === 'NEW' && lead.contactInfo.phone === '9876543210', 'S1.1 lead is NEW with a normalised phone');
  const leadTasks = await listLeadTasks(ctx, lead.id);
  check(leadTasks.length === 1 && leadTasks[0].type === 'QUALIFY_LEAD' && leadTasks[0].assigneeId === USERS.sales.userId, 'S1.1 QUALIFY_LEAD → sales');
  check(computeProgress({ stage: 'LEAD' }) === 0, 'S1.1 progress 0');
  await expectError(createLead(ctx, USERS.sales, { ...FIXTURE_LEAD, phone: '12345' }), 'invalid', 'bad phone is rejected');
  await expectError(createLead(ctx, USERS.sales, { ...FIXTURE_LEAD, consent: false }), 'invalid', 'missing consent is rejected');
  await expectError(createLead(ctx, USERS.tech1, FIXTURE_LEAD), 'forbidden', 'a technician cannot create leads');
  await expectError(qualifyLead(ctx, { ...USERS.sales, userId: 'u_other_sales' }, lead.id), 'forbidden', 'another sales user cannot qualify this lead');

  // S1 step 2 — sales qualifies.
  const order = await qualifyLead(ctx, USERS.sales, lead.id);
  const orderId = order.id;
  let s = await state(ctx, orderId);
  check(/^AE-\d{4}$/.test(order.displayCode ?? ''), `S1.2 order code ${order.displayCode}`);
  check(s.stage === 'QUALIFIED' && s.cur?.type === 'ASSIGN_SURVEYOR' && s.cur.assigneeId === 'role:admin' && s.progress === 5, 'S1.2 QUALIFIED, ASSIGN_SURVEYOR → admin, 5%');
  check(!!(await customerRepository(ctx).get(order.customerId)), 'S1.2 customer created');
  check(leadStatus((await leadRepository(ctx).get(lead.id))!) === 'QUALIFIED', 'S1.2 lead is QUALIFIED');
  check((await listLeadTasks(ctx, lead.id)).every(t => t.status === 'COMPLETED'), 'S1.2 QUALIFY_LEAD completed');
  check((s.order.participantIds ?? []).includes(`customer:${order.customerId}`) && (s.order.participantIds ?? []).includes(USERS.sales.userId), 'S1.2 participants = sales owner + customer');
  await assertInvariants(ctx, orderId, 'S1.2');
  const again = await qualifyLead(ctx, USERS.sales, lead.id);
  check(again.id === orderId && again.displayCode === order.displayCode, 'qualifying twice returns the same order and code');

  // S1 step 3 — admin assigns the surveyor (date = today + 2).
  const surveyDate = new Date(clock.now().getTime() + 2 * 86_400_000).toISOString();
  await expectError(assignSurveyor(ctx, USERS.sales, orderId, USERS.surveyor.userId), 'forbidden', 'sales cannot assign a surveyor');
  await assignSurveyor(ctx, USERS.admin, orderId, USERS.surveyor.userId, surveyDate);
  s = await state(ctx, orderId);
  check(s.stage === 'SURVEY' && s.cur?.type === 'SURVEY' && s.cur.assigneeId === USERS.surveyor.userId && s.cur.dueDate === surveyDate && s.progress === 10, 'S1.3 SURVEY → surveyor, due today+2, 10%');
  check(leadStatus((await leadRepository(ctx).get(lead.id))!) === 'SURVEY', 'S1.3 lead is SURVEY');
  check((s.order.participantIds ?? []).includes(USERS.surveyor.userId), 'S1.3 surveyor becomes a participant');
  await assertInvariants(ctx, orderId, 'S1.3');

  // S1 step 4 — surveyor submits FEASIBLE.
  await expectError(submitSurvey(ctx, USERS.tech1, orderId, FIXTURE_SURVEY), 'forbidden', 'another user cannot submit this survey');
  await expectError(submitSurvey(ctx, USERS.surveyor, orderId, { ...FIXTURE_SURVEY, photoIds: ['one'] }), 'invalid', 'a survey needs at least 2 photos');
  await expectError(submitSurvey(ctx, USERS.surveyor, orderId, { ...FIXTURE_SURVEY, pitMm: Number('abc') }), 'invalid', 'non-numeric shaft sizes are rejected');
  await submitSurvey(ctx, USERS.surveyor, orderId, FIXTURE_SURVEY);
  s = await state(ctx, orderId);
  check(s.stage === 'QUOTE' && s.cur?.type === 'PREPARE_QUOTE' && s.cur.assigneeId === 'role:admin' && s.progress === 20, 'S1.4 QUOTE, PREPARE_QUOTE → admin, 20%');
  check(leadStatus((await leadRepository(ctx).get(lead.id))!) === 'QUOTE', 'S1.4 lead is QUOTE');
  check(!(s.order.participantIds ?? []).includes(USERS.surveyor.userId), 'S1.4 surveyor leaves the participants once the survey task closes');
  await assertInvariants(ctx, orderId, 'S1.4');

  // I-2: replaying an event does not duplicate the open task.
  await applyEvent(ctx, USERS.admin, orderId, { type: 'SURVEY_RESULT', result: 'FEASIBLE' });
  s = await state(ctx, orderId);
  check(s.tasks.filter(t => t.type === 'PREPARE_QUOTE' && isOpenTask(t)).length === 1, 'I-2 replayed event creates no duplicate PREPARE_QUOTE');
  await assertInvariants(ctx, orderId, 'replay');

  // Admin intervention (S7 shape): reassign + change due date, both audited.
  const prep = s.cur!;
  await reassignTask(ctx, USERS.admin, prep.id, { id: USERS.tech2.userId, role: 'technician' }, 'test reassign');
  const newDue = new Date(clock.now().getTime() + 86_400_000).toISOString();
  await changeDueDate(ctx, USERS.admin, prep.id, newDue, 'test due');
  const taskAudit = await listAuditEventsForEntity(ctx, 'Task', prep.id);
  check(taskAudit.some(e => e.action === 'TASK_REASSIGNED' && (e.before as any).assigneeId === 'role:admin' && (e.after as any).assigneeId === USERS.tech2.userId), 'reassignment audited with before/after');
  check(taskAudit.some(e => e.action === 'TASK_DUE_CHANGED' && (e.after as any).dueDate === newDue), 'due-date change audited with before/after');
  check(((await projectRepository(ctx).get(orderId))!.participantIds ?? []).includes(USERS.tech2.userId), 'new assignee becomes a participant');
  await reassignTask(ctx, USERS.admin, prep.id, { id: 'role:admin', role: 'admin' });
  check(!((await projectRepository(ctx).get(orderId))!.participantIds ?? []).includes(USERS.tech2.userId), 'previous assignee loses participation (S7)');
  await expectError(reassignTask(ctx, USERS.sales, prep.id, { id: 'x', role: 'admin' }), 'forbidden', 'only the Admin can reassign');

  // Blocker (D-07): task → BLOCKED, health BLOCKED; resolve → previous status.
  const cust = customerActor(order.customerId);
  const custBlocker = await raiseBlocker(ctx, cust, { orderId, taskId: prep.id, reason: 'OTHER', description: 'Question about the quote' });
  check((await taskRepository(ctx).get(prep.id))!.status === 'TODO', "a customer's blocker does not change someone else's task");
  await resolveBlocker(ctx, USERS.admin, custBlocker.id, 'Answered');
  const blocker = await raiseBlocker(ctx, USERS.admin, { orderId, taskId: prep.id, reason: 'PAYMENT_PENDING', description: 'Waiting for funds' });
  check(blocker.ownerUserId === `customer:${order.customerId}`, 'PAYMENT_PENDING blocker is owned by the customer');
  check((await taskRepository(ctx).get(prep.id))!.status === 'BLOCKED', 'task becomes BLOCKED');
  s = await state(ctx, orderId);
  check(computeHealth({ status: s.order.status, stage: s.stage, tasks: s.tasks, openBlockerCount: (await listOpenBlockers(ctx, orderId)).length, milestones: [], now: clock.now() }) === 'BLOCKED', 'health is BLOCKED');
  await expectError(completeTask(ctx, USERS.admin, prep.id), 'gate', 'a blocked task cannot be completed');
  await expectError(resolveBlocker(ctx, USERS.tech1, blocker.id, 'x'), 'forbidden', 'a non-owner cannot resolve the blocker');
  await resolveBlocker(ctx, cust, blocker.id, 'Funds arranged');
  check((await taskRepository(ctx).get(prep.id))!.status === 'TODO', 'task returns to its previous status');
  await expectError(raiseBlocker(ctx, customerActor('someone_else'), { orderId, reason: 'OTHER', description: 'x' }), 'forbidden', 'a customer of another order cannot raise a blocker here');

  // Hold / resume (D-24).
  const review = new Date(clock.now().getTime() + 7 * 86_400_000).toISOString();
  await putOnHold(ctx, USERS.admin, orderId, 'CUSTOMER_NOT_READY', review);
  s = await state(ctx, orderId);
  check(s.order.status === 'ON_HOLD' && s.stage === 'QUOTE', 'hold keeps the stage');
  check(s.tasks.some(t => t.type === 'REVIEW_HOLD' && isOpenTask(t) && t.dueDate === review), 'REVIEW_HOLD due on the review date');
  check(computeHealth({ status: s.order.status, stage: s.stage, tasks: s.tasks, openBlockerCount: 0, milestones: [], now: clock.now() }) === 'ON_HOLD', 'health ON_HOLD');
  await resumeOrder(ctx, USERS.admin, orderId, 'customer ready');
  s = await state(ctx, orderId);
  check(s.order.status === 'ACTIVE' && !s.tasks.some(t => t.type === 'REVIEW_HOLD' && isOpenTask(t)), 'resume → ACTIVE, REVIEW_HOLD closed');
  const projAudit = await listAuditEventsForEntity(ctx, 'Project', orderId);
  check(projAudit.filter(e => e.action === 'ORDER_STATUS_CHANGED').length >= 2, 'hold and resume are audited');
  await assertInvariants(ctx, orderId, 'after resume');

  // Override (I-4): the only way back, audited with a reason.
  await expectError(applyEvent(ctx, USERS.admin, orderId, { type: 'LEAD_QUALIFIED', surveyFeeInr: 0 }), 'invalid', 'events cannot move the stage backwards');
  await overrideStage(ctx, USERS.admin, orderId, 'SURVEY', 'Re-survey requested');
  check((await listAuditEventsForEntity(ctx, 'Project', orderId)).some(e => e.action === 'ORDER_STAGE_OVERRIDE' && e.reason === 'Re-survey requested'), 'override audited with reason');
  await assertInvariants(ctx, orderId, 'after override', { allowStageBack: true });
  await overrideStage(ctx, USERS.admin, orderId, 'QUOTE', 'Back to quote');

  // NO NEXT ACTION → one-click next task.
  await completeTask(ctx, USERS.admin, (await state(ctx, orderId)).cur!.id);
  s = await state(ctx, orderId);
  check(!s.cur, 'completing the only open task leaves NO NEXT ACTION');
  check(computeHealth({ status: 'ACTIVE', stage: s.stage, tasks: s.tasks, openBlockerCount: 0, milestones: [], now: clock.now() }) === 'OVERDUE', 'NO NEXT ACTION → OVERDUE');
  await createAdminTask(ctx, USERS.admin, orderId, {});
  check(!!(await state(ctx, orderId)).cur, 'create-next-task restores a current task');

  // Cancel (D-25, S6 shape): open tasks cancelled, lead LOST, nothing deleted.
  await cancelOrder(ctx, USERS.admin, orderId, 'Customer chose another vendor');
  s = await state(ctx, orderId);
  check(s.order.status === 'CANCELLED' && s.tasks.every(t => !isOpenTask(t)), 'cancel → CANCELLED, all open tasks cancelled');
  check(leadStatus((await leadRepository(ctx).get(lead.id))!) === 'LOST', 'cancel → lead LOST');
  check(s.tasks.length > 0 && !!(await projectRepository(ctx).get(orderId)), 'nothing is deleted');

  // Survey branches.
  const lead2 = await createLead(ctx, USERS.sales, { ...FIXTURE_LEAD, phone: '9876500001' });
  const o2 = await qualifyLead(ctx, USERS.admin, lead2.id);
  await assignSurveyor(ctx, USERS.admin, o2.id, USERS.surveyor.userId);
  await submitSurvey(ctx, USERS.surveyor, o2.id, { ...FIXTURE_SURVEY, result: 'REQUIRES_CORRECTION' });
  s = await state(ctx, o2.id);
  check(s.stage === 'SURVEY' && s.cur?.type === 'SITE_CORRECTION' && s.cur.assigneeId === `customer:${o2.customerId}`, 'REQUIRES_CORRECTION → SITE_CORRECTION → customer');
  await completeTask(ctx, customerActor(o2.customerId), s.cur!.id, 'Pit cleaned');
  s = await state(ctx, o2.id);
  check(s.cur?.type === 'ASSIGN_SURVEYOR' && s.cur.assigneeId === 'role:admin', 'correction done → Admin re-assigns the survey');
  await assignSurveyor(ctx, USERS.admin, o2.id, USERS.surveyor.userId);
  s = await state(ctx, o2.id);
  check(s.cur?.type === 'SURVEY' && s.cur.assigneeId === USERS.surveyor.userId, 'survey re-assigned → SURVEY again');
  await submitSurvey(ctx, USERS.surveyor, o2.id, { ...FIXTURE_SURVEY, result: 'NOT_FEASIBLE' });
  s = await state(ctx, o2.id);
  check(s.stage === 'SURVEY' && s.cur?.type === 'REVIEW_NOT_FEASIBLE' && s.cur.assigneeId === 'role:admin', 'NOT_FEASIBLE → REVIEW_NOT_FEASIBLE → admin');
  await assertInvariants(ctx, o2.id, 'survey branches');

  done('mvp-order-service-check');
}

main().catch(err => { console.error(err); process.exitCode = 1; });
