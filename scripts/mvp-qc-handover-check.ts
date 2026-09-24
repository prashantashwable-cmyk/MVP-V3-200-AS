/**
 * Step 09 check (demo repository): S1 steps 14–16 through the real services (QC PASS, final
 * payment, licence, handover → warranty/AMC), S4 (rework, then FAIL variant), S9 (emergency,
 * then the no-on-call variant) and S10 (licence pending at handover, then completed).
 * Run with: npx tsx scripts/mvp-qc-handover-check.ts
 */
import { check, done, Clock, demoCtx, USERS, customerActor, assertInvariants } from './mvp/fixtures';
import { runS1, TINY_JPEG } from './mvp/scenario';
import {
  acknowledgeEmergency, dateKey, getOnCallTechnician, raiseEmergency, resolveEmergency, setOnCallTechnician,
} from '../src/mvp/services/emergencyService';
import {
  amcDisplayStatus, completeHandover, getAmc, getHandover, getWarranty, setComplianceItem, submitQcDecision,
} from '../src/mvp/services/qcHandoverService';
import { assignQcInspector, checkInAtSite, CHECKLIST_ITEMS, completeWork, setChecklistItem, startWork } from '../src/mvp/services/installationService';
import { overrideGate } from '../src/mvp/gates';
import { saveEvidence } from '../src/mvp/services/evidenceService';
import { customerToken, listOrderTasks, MvpError } from '../src/mvp/services/orderService';
import { buildOrderView, bucketsFor } from '../src/mvp/services/readModels';
import { AMC_REMINDER_DAYS, WARRANTY_MONTHS } from '../src/mvp/config';
import { projectRepository, serviceCaseRepository, snagRepository } from '../src/repository/entities';
import { getRepository } from '../src/repository';
import { listAuditEventsForEntity } from '../src/lib/audit';
import { isOpenTask } from '../src/mvp/health';

async function expectError(p: Promise<unknown>, code: MvpError['code'], msg: string, text?: string) {
  try { await p; check(false, msg); } catch (e: any) {
    check(e instanceof MvpError && e.code === code && (!text || e.message.includes(text)), `${msg} (${e.message})`);
  }
}

async function main() {
  const clock = new Clock();
  const ctx = demoCtx(clock, USERS.admin);
  const names = { [USERS.tech1.userId]: 'Technician Rahul', [USERS.tech2.userId]: 'Technician Vikas', [USERS.qc.userId]: 'QC Meera' };
  const view = async (id: string) => (await buildOrderView(ctx, USERS.admin, id, names))!;
  const openTask = async (orderId: string, type: string) => (await listOrderTasks(ctx, orderId)).find(t => t.type === type && isOpenTask(t))!;
  const photo = async (orderId: string, who: any, c: string) => (await saveEvidence(ctx, who, { dataUrl: TINY_JPEG, contentType: 'image/jpeg', orderId, caption: c })).id;
  const notes = async (audience: string, orderId: string, templateId: string) =>
    (await getRepository<any>('notifications', ctx).query({ audienceUserId: audience } as any)).filter((n: any) => n.projectId === orderId && n.templateId === templateId);

  // Guards before the happy path.
  const g = await runS1(ctx, clock, 13.9);
  await expectError(submitQcDecision(ctx, USERS.tech1, g.orderId, { decision: 'PASS', remarks: 'x' }), 'forbidden', 'a technician cannot record the QC decision');
  await expectError(submitQcDecision(ctx, USERS.qc, g.orderId, { decision: 'PASS', remarks: '' }), 'invalid', 'remarks are required');
  await expectError(completeHandover(ctx, USERS.qc, g.orderId, { customerConfirmedName: 'x', finalTestConfirmed: true }), 'forbidden', 'only the Admin completes the handover');

  // S1.14: PASS with tests and remarks → HANDOVER + COLLECT_FINAL_PAYMENT + STATUTORY_LICENCE, 95%.
  const s = await runS1(ctx, clock, 13.9);
  await submitQcDecision(ctx, USERS.qc, s.orderId, {
    decision: 'PASS', tests: { mechanical: true, electrical: true, safety: true, testRun: true }, remarks: 'All systems tested OK.',
  });
  let v = await view(s.orderId);
  check(v.stage === 'QC_HANDOVER' && v.progress === 95, `S1.14 stays QC_HANDOVER at 95% (got ${v.stage} ${v.progress})`);
  check(v.openTasks.some(t => t.type === 'HANDOVER') && v.openTasks.some(t => t.type === 'COLLECT_FINAL_PAYMENT') && v.openTasks.some(t => t.type === 'STATUTORY_LICENCE'), 'S1.14 all three tasks open');
  const licence = await openTask(s.orderId, 'STATUTORY_LICENCE');
  check(licence.dueDate > (await openTask(s.orderId, 'HANDOVER')).dueDate, 'S1.14 STATUTORY_LICENCE is due later than HANDOVER (+30 vs +3 days)');
  check((await notes(customerToken(s.customerId), s.orderId, 'mvp_handover_ready')).length === 1, 'S1.14 the customer is notified "Handover ready"');
  await assertInvariants(ctx, s.orderId, 'S1.14');

  // completeHandover is refused before the final payment, then before the licence.
  await expectError(completeHandover(ctx, USERS.admin, s.orderId, { customerConfirmedName: 'Mr. Kulkarni', finalTestConfirmed: true }), 'gate', 'refused before the final payment', 'Final payment not received');
  const s15 = await runS1(ctx, clock, 15);
  await expectError(completeHandover(ctx, USERS.admin, s15.orderId, { customerConfirmedName: 'Mr. Kulkarni', finalTestConfirmed: true }), 'gate', 'S1.15 refused before the licence', 'Statutory licence not done');
  v = await view(s15.orderId);
  check(v.payments?.paid === 1180000 && v.payments.total === 1180000, 'S1.15 final payment ₹11,80,000 / ₹11,80,000');

  // S1.15b + S1.16: licence done → handover → AMC, 100%, Warranty 12 months, AMC WARRANTY.
  const s16src = await runS1(ctx, clock, 15);
  await setComplianceItem(ctx, USERS.admin, s16src.orderId, 'LIFT_LICENSE', { status: 'DONE', documentId: await photo(s16src.orderId, USERS.admin, 'Lift licence') });
  check(!(await listOrderTasks(ctx, s16src.orderId)).some(t => t.type === 'STATUTORY_LICENCE' && isOpenTask(t)), 'S1.15b the licence document completes STATUTORY_LICENCE');
  await completeHandover(ctx, USERS.admin, s16src.orderId, { customerConfirmedName: 'Mr. Kulkarni', finalTestConfirmed: true, documentIds: [await photo(s16src.orderId, USERS.admin, 'Handover')] });
  v = await view(s16src.orderId);
  check(v.stage === 'AMC' && v.status === 'COMPLETED' && v.progress === 100, `S1.16 AMC, COMPLETED, 100% (got ${v.stage} ${v.status} ${v.progress})`);
  const handover = (await getHandover(ctx, s16src.orderId))!;
  check(handover.qcPassed === true && handover.status === 'certificate_issued' && handover.customerConfirmedName === 'Mr. Kulkarni', 'S1.16 handover recorded');
  const warranty = (await getWarranty(ctx, s16src.orderId))!;
  const expectedEnd = new Date(handover.completedAt!); expectedEnd.setUTCMonth(expectedEnd.getUTCMonth() + WARRANTY_MONTHS);
  check(warranty.startDate === handover.completedAt && Math.abs(new Date(warranty.endDate).getTime() - expectedEnd.getTime()) < 1000, `S1.16 warranty ends 12 months after handover`);
  const amc = (await getAmc(ctx, s16src.orderId))!;
  check(amc.mvpAmcStatus === 'WARRANTY' && amc.warrantyEnd === warranty.endDate, 'S1.16 AMC status WARRANTY, warrantyEnd = the warranty end date');
  const followUp = (await listOrderTasks(ctx, s16src.orderId)).find(t => t.type === 'AMC_FOLLOW_UP')!;
  const expectedDue = new Date(warranty.endDate); expectedDue.setTime(expectedDue.getTime() - AMC_REMINDER_DAYS * 86_400_000);
  check(followUp.dueDate === expectedDue.toISOString(), 'S1.16 AMC_FOLLOW_UP due = warranty end − 90 days');
  check(amcDisplayStatus(amc, clock.now()) === 'WARRANTY', 'S1.16 amcDisplayStatus() shows WARRANTY today');
  check(amcDisplayStatus(amc, new Date(new Date(warranty.endDate).getTime() - AMC_REMINDER_DAYS * 86_400_000)) === 'AMC_DUE', 'S1.16 amcDisplayStatus() shows AMC_DUE at the reminder date');
  await assertInvariants(ctx, s16src.orderId, 'S1.16');

  // S4: QC rework, then PASS; rework count = 1 via the Snag record.
  const s4 = await runS1(ctx, clock, 13.9);
  await submitQcDecision(ctx, USERS.qc, s4.orderId, { decision: 'REWORK', remarks: 'Door gap uneven, floor 4' });
  v = await view(s4.orderId);
  const rework = (await listOrderTasks(ctx, s4.orderId)).find(t => t.type === 'REWORK' && isOpenTask(t))!;
  check(rework.assigneeId === USERS.tech1.userId && rework.notes === 'Door gap uneven, floor 4', 'S4 REWORK → tech1, with the QC remarks on its notes');
  check(new Date(rework.dueDate).getTime() - clock.now().getTime() === 3 * 86_400_000, 'S4 REWORK due +3 days');
  check(v.progress === 90, 'S4 progress stays 90 during rework');
  const snagsBefore = await snagRepository(ctx).query({ projectId: s4.orderId } as any);
  check(snagsBefore.length === 1, 'S4 a Snag was created');
  await startWork(ctx, USERS.tech1, rework.id);
  await expectError(completeWork(ctx, USERS.tech1, rework.id), 'invalid', 'S4 rework needs a photo of the fixed work', 'photo');
  await completeWork(ctx, USERS.tech1, rework.id, { documentId: await photo(s4.orderId, USERS.tech1, 'fixed'), note: 'Gap adjusted' });
  const qcAgain = (await listOrderTasks(ctx, s4.orderId)).find(t => t.type === 'QC_INSPECTION' && isOpenTask(t))!;
  check(qcAgain.assigneeId === USERS.qc.userId, 'S4 a new QC_INSPECTION → qc');
  await submitQcDecision(ctx, USERS.qc, s4.orderId, { decision: 'PASS', remarks: 'Fixed, all OK now.' });
  v = await view(s4.orderId);
  check(v.progress === 95, 'S4 PASS after rework continues from step 14 (95%)');
  const reworkCount = (await snagRepository(ctx).query({ projectId: s4.orderId } as any)).length;
  check(reworkCount === 1, `S4 the Quality report's rework count = 1 (got ${reworkCount})`);
  await assertInvariants(ctx, s4.orderId, 'S4');

  // S4 variant FAIL: order goes ON_HOLD, REVIEW_HOLD → admin.
  const s4f = await runS1(ctx, clock, 13.9);
  await submitQcDecision(ctx, USERS.qc, s4f.orderId, { decision: 'FAIL', remarks: 'Multiple safety failures.' });
  v = await view(s4f.orderId);
  check(v.status === 'ON_HOLD', 'S4 FAIL → order ON_HOLD');
  check((await openTask(s4f.orderId, 'REVIEW_HOLD')).assigneeId === 'role:admin', 'S4 FAIL → REVIEW_HOLD → admin');
  const b4f = bucketsFor((await projectRepository(ctx).get(s4f.orderId))!, await listOrderTasks(ctx, s4f.orderId), [], [], [], clock.now());
  check(b4f.buckets.includes('qc_failure') && b4f.buckets.includes('on_hold'), 'S4 FAIL → Needs Attention: QC failure / rework, On hold');

  // S9: emergency, with tech2 on-call.
  const today = dateKey(clock.now());
  await expectError(setOnCallTechnician(ctx, USERS.tech2, today, USERS.tech2.userId), 'forbidden', 'only the Admin sets the on-call technician');
  await setOnCallTechnician(ctx, USERS.admin, today, USERS.tech2.userId);
  check((await getOnCallTechnician(ctx, today)) === USERS.tech2.userId, 'S9 on-call technician set for today');
  const s9 = await runS1(ctx, clock, 16);
  const cust9 = customerActor(s9.customerId);
  await expectError(raiseEmergency(ctx, cust9, s9.orderId, { description: '' }), 'invalid', 'a description is required');
  const kase = await raiseEmergency(ctx, cust9, s9.orderId, { description: 'Lift stuck between floors' });
  check(kase.priority === 'P0' && kase.kind === 'EMERGENCY' && kase.assignedTo === USERS.tech2.userId, 'S9 ServiceCase P0, assigned to tech2');
  const respTask = await openTask(s9.orderId, 'EMERGENCY_RESPONSE');
  check(respTask.assigneeId === USERS.tech2.userId && new Date(respTask.dueDate).getTime() - clock.now().getTime() === 45 * 60_000, 'S9 EMERGENCY_RESPONSE → tech2, due +45 minutes');
  const b9 = bucketsFor((await projectRepository(ctx).get(s9.orderId))!, await listOrderTasks(ctx, s9.orderId), [], [], [], clock.now());
  check(b9.buckets[0] === 'emergency', 'S9 the case is at the top of Needs Attention');
  check((await notes('role:admin', s9.orderId, 'mvp_emergency')).length === 1 && (await notes('role:owner', s9.orderId, 'mvp_emergency')).length === 1 && (await notes(USERS.tech2.userId, s9.orderId, 'mvp_emergency')).length === 1, 'S9 the Admin, Owner and tech2 are all notified immediately');
  clock.advanceMinutes(46);
  const b9b = bucketsFor((await projectRepository(ctx).get(s9.orderId))!, await listOrderTasks(ctx, s9.orderId), [], [], [], clock.now());
  check(b9b.health === 'OVERDUE', 'S9 46 minutes on, unacknowledged → OVERDUE');
  await expectError(acknowledgeEmergency(ctx, USERS.tech1, kase.id), 'forbidden', 'another technician cannot acknowledge the case');
  await acknowledgeEmergency(ctx, USERS.tech2, kase.id);
  const acked = (await serviceCaseRepository(ctx).get(kase.id))!;
  check(!!acked.acknowledgedAt && (await openTask(s9.orderId, 'EMERGENCY_RESPONSE')).status === 'IN_PROGRESS', 'S9 acknowledged: task IN_PROGRESS, acknowledgedAt recorded');
  await resolveEmergency(ctx, USERS.tech2, kase.id, { note: 'Reset the controller; lift running normally.', documentId: await photo(s9.orderId, USERS.tech2, 'resolved') });
  const resolved = (await serviceCaseRepository(ctx).get(kase.id))!;
  check(resolved.status === 'resolved' && !!resolved.resolvedAt && !!resolved.resolutionNote, 'S9 resolved with a note; resolvedAt recorded');
  check(!(await listOrderTasks(ctx, s9.orderId)).some(t => t.type === 'EMERGENCY_RESPONSE' && isOpenTask(t)), 'S9 the response task is completed');
  check((await listAuditEventsForEntity(ctx, 'ServiceCase', kase.id)).some(e => e.action === 'EMERGENCY_ACKNOWLEDGED') &&
    (await listAuditEventsForEntity(ctx, 'ServiceCase', kase.id)).some(e => e.action === 'EMERGENCY_RESOLVED'), 'S9 both the acknowledge and the resolve are audited');

  // S9 variant: no on-call technician set for the day → the task goes to the Admin.
  clock.advanceDays(1); // a fresh day, with no on-call setting
  const s9v = await runS1(ctx, clock, 16);
  const noCall = await raiseEmergency(ctx, customerActor(s9v.customerId), s9v.orderId, { description: 'No response from the lift buttons' });
  check(!noCall.assignedTo, 'S9 variant: no on-call set for the fresh key → the case has no technician');
  check((await openTask(s9v.orderId, 'EMERGENCY_RESPONSE')).assigneeId === 'role:admin', 'S9 variant: EMERGENCY_RESPONSE → admin when no one is on call');

  // S10: licence pending at handover — override, then complete later.
  const s10 = await runS1(ctx, clock, 15); // step 14 + final payment; licence (15.5) skipped
  await expectError(overrideGate(ctx, USERS.qc, s10.orderId, 'HANDOVER_LICENCE', 'x'), 'forbidden', 'only the Admin overrides a gate');
  await expectError(completeHandover(ctx, USERS.admin, s10.orderId, { customerConfirmedName: 'Mr. Kulkarni', finalTestConfirmed: true }), 'gate', 'S10 refused', 'Statutory licence not done');
  await overrideGate(ctx, USERS.admin, s10.orderId, 'HANDOVER_LICENCE', 'Technical handover accepted; licence pending');
  await completeHandover(ctx, USERS.admin, s10.orderId, { customerConfirmedName: 'Mr. Kulkarni', finalTestConfirmed: true });
  v = await view(s10.orderId);
  check(v.status === 'COMPLETED' && v.stage === 'AMC', 'S10 the order completes despite the override');
  check(v.licencePending === true, 'S10 the STATUTORY_LICENCE task stays open (licencePending)');
  const b10 = bucketsFor((await projectRepository(ctx).get(s10.orderId))!, await listOrderTasks(ctx, s10.orderId), [], [], [], clock.now());
  check(b10.buckets.includes('licence_pending'), 'S10 Needs Attention → Licence pending');
  check((await listAuditEventsForEntity(ctx, 'Project', s10.orderId)).some(e => e.action === 'GATE_OVERRIDDEN' && e.reason?.includes('licence pending')), 'S10 the override is audited');
  await setComplianceItem(ctx, USERS.admin, s10.orderId, 'LIFT_LICENSE', { status: 'DONE', documentId: await photo(s10.orderId, USERS.admin, 'Lift licence, late') });
  v = await view(s10.orderId);
  check(v.licencePending === false, 'S10 marking the licence DONE clears "Licence pending"');
  const b10b = bucketsFor((await projectRepository(ctx).get(s10.orderId))!, await listOrderTasks(ctx, s10.orderId), [], [], [], clock.now());
  check(!b10b.buckets.includes('licence_pending'), 'S10 the order leaves Licence pending');

  done('mvp-qc-handover-check');
}

main().catch(err => { console.error(err); process.exitCode = 1; });
