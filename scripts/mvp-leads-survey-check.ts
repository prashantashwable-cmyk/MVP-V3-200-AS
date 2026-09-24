/**
 * Step 05 check (demo repository): lead lists/follow-ups/duplicates/lost, validation,
 * the optional survey fee (D-30), survey branches and evidence validation.
 * Run with: npx tsx scripts/mvp-leads-survey-check.ts
 */
import { check, done, Clock, demoCtx, USERS, FIXTURE_LEAD, FIXTURE_SURVEY } from './mvp/fixtures';
import {
  createLead, qualifyLead, assignSurveyor, updateLeadStatus, listLeadTasks, leadRepository, listOrderTasks, waiveSurveyFee, MvpError, submitSurvey,
} from '../src/mvp/services/orderService';
import { filterLeads, findDuplicateLeads, listLeadsFor, setFollowUp } from '../src/mvp/services/leadService';
import { saveEvidence, validateEvidence } from '../src/mvp/services/evidenceService';
import { paymentMilestoneRepository } from '../src/repository/entities';
import { listAuditEventsForEntity } from '../src/lib/audit';
import { leadStatus } from '../src/mvp/leadModel';
import { isOpenTask } from '../src/mvp/health';

async function expectError(p: Promise<unknown>, code: MvpError['code'], msg: string) {
  try { await p; check(false, msg); } catch (e: any) { check(e instanceof MvpError && e.code === code, `${msg} (${e.message})`); }
}

async function main() {
  const clock = new Clock();
  const ctx = demoCtx(clock, USERS.admin);
  const other = { ...USERS.sales, userId: 'u_sales_2' };

  const a = await createLead(ctx, USERS.sales, { ...FIXTURE_LEAD, phone: '9000000001', nextFollowUp: new Date(clock.now().getTime() + 2 * 86_400_000).toISOString() });
  const b = await createLead(ctx, USERS.sales, { ...FIXTURE_LEAD, phone: '9000000002', nextFollowUp: new Date(clock.now().getTime() + 1 * 86_400_000).toISOString() });
  await createLead(ctx, other, { ...FIXTURE_LEAD, phone: '9000000003' });

  // Lists are per owner (rules: sales see their own leads); admin sees all.
  const mine = await listLeadsFor(ctx, USERS.sales);
  check(mine.every(l => l.ownerUserId === USERS.sales.userId) && mine.length >= 2, 'sales lists only their own leads');
  check((await listLeadsFor(ctx, USERS.admin)).length >= 3, 'admin lists every lead');
  check((await listLeadsFor(ctx, USERS.tech1)).length === 0, 'a technician lists no leads');
  const follow = filterLeads(mine, 'FOLLOW_UPS');
  check(follow[0].id === b.id && follow[1].id === a.id, 'Follow-ups are sorted by next_followup');

  // Duplicate warning (exact phone, any format).
  check((await findDuplicateLeads(ctx, USERS.sales, '+91 90000-00001')).map(l => l.id).join() === a.id, 'duplicate warning finds the same number in another format');
  check((await findDuplicateLeads(ctx, USERS.sales, '9000000009')).length === 0, 'no false duplicate');

  // Follow-up + contacted + lost.
  await setFollowUp(ctx, USERS.sales, a.id, new Date(clock.now().getTime() + 5 * 86_400_000).toISOString(), 'Call after Diwali');
  check((await listAuditEventsForEntity(ctx, 'Lead', a.id)).some(e => e.action === 'LEAD_FOLLOW_UP_SET'), 'follow-up change is audited');
  await expectError(setFollowUp(ctx, other, a.id, clock.now().toISOString()), 'forbidden', "another salesperson cannot change this lead's follow-up");
  await updateLeadStatus(ctx, USERS.sales, a.id, 'CONTACTED');
  check(leadStatus((await leadRepository(ctx).get(a.id))!) === 'CONTACTED', 'lead marked CONTACTED');
  await expectError(updateLeadStatus(ctx, USERS.sales, b.id, 'LOST'), 'invalid', 'losing a lead needs a reason');
  await updateLeadStatus(ctx, USERS.sales, b.id, 'LOST', 'Chose a competitor');
  const lostLead = (await leadRepository(ctx).get(b.id))!;
  check(leadStatus(lostLead) === 'LOST' && lostLead.lostReasonText === 'Chose a competitor', 'lost lead keeps its reason');
  check((await listLeadTasks(ctx, b.id)).every(t => !isOpenTask(t)), "a lost lead's QUALIFY_LEAD task is cancelled");
  check(filterLeads(await listLeadsFor(ctx, USERS.sales), 'LOST').some(l => l.id === b.id), 'the Lost tab shows it');
  await expectError(qualifyLead(ctx, USERS.sales, b.id), 'invalid', 'a lost lead cannot be qualified');

  // Validation of numbers and consent.
  await expectError(createLead(ctx, USERS.sales, { ...FIXTURE_LEAD, phone: '5123456789' }), 'invalid', 'a number not starting 6–9 is rejected');
  await expectError(createLead(ctx, USERS.sales, { ...FIXTURE_LEAD, phone: '9000000010', floors: -2 }), 'invalid', 'negative floors are rejected');
  await expectError(createLead(ctx, USERS.sales, { ...FIXTURE_LEAD, phone: '9000000011', name: '  ' }), 'invalid', 'a blank name is rejected');

  // D-30 optional survey fee (config default 0; here 500 for the check).
  const c = await createLead(ctx, USERS.sales, { ...FIXTURE_LEAD, phone: '9000000012' });
  const order = await qualifyLead(ctx, USERS.sales, c.id, { surveyFeeInr: 500 });
  const tasks = await listOrderTasks(ctx, order.id);
  check(tasks.some(t => t.type === 'COLLECT_SURVEY_FEE' && isOpenTask(t)), 'fee > 0 → COLLECT_SURVEY_FEE task');
  const fee = await paymentMilestoneRepository(ctx).get(`ms_${order.id}_SURVEY_FEE`);
  check(fee?.amount === 500 && fee.status === 'PENDING', 'fee > 0 → SURVEY_FEE milestone, PENDING');
  await expectError(assignSurveyor(ctx, USERS.admin, order.id, USERS.surveyor.userId), 'gate', 'the surveyor cannot be assigned before the fee is paid or waived');
  await expectError(waiveSurveyFee(ctx, USERS.sales, order.id, 'x'), 'forbidden', 'only the Admin can waive the fee');
  await waiveSurveyFee(ctx, USERS.admin, order.id, 'Builder referral');
  check((await paymentMilestoneRepository(ctx).get(`ms_${order.id}_SURVEY_FEE`))?.waived === true, 'fee waived');
  check((await listAuditEventsForEntity(ctx, 'PaymentMilestone', `ms_${order.id}_SURVEY_FEE`)).some(e => e.action === 'SURVEY_FEE_WAIVED' && e.reason === 'Builder referral'), 'waiver audited with reason');
  await assignSurveyor(ctx, USERS.admin, order.id, USERS.surveyor.userId);
  check((await listOrderTasks(ctx, order.id)).some(t => t.type === 'SURVEY' && isOpenTask(t)), 'after the waiver the surveyor is assigned');
  const d = await createLead(ctx, USERS.sales, { ...FIXTURE_LEAD, phone: '9000000013' });
  const noFee = await qualifyLead(ctx, USERS.sales, d.id);
  check(!(await listOrderTasks(ctx, noFee.id)).some(t => t.type === 'COLLECT_SURVEY_FEE'), 'default fee 0 → no survey-fee task');

  // A surveyor cannot submit a survey assigned to another surveyor.
  await assignSurveyor(ctx, USERS.admin, noFee.id, 'u_surveyor_2');
  await expectError(submitSurvey(ctx, USERS.surveyor, noFee.id, FIXTURE_SURVEY), 'forbidden', "a surveyor cannot submit another surveyor's survey");

  // Evidence: images/PDF only, size-limited.
  const tiny = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg-bytes').toString('base64');
  check(validateEvidence({ dataUrl: tiny, contentType: 'image/jpeg' }) === null, 'a small JPEG is accepted');
  check(!!validateEvidence({ dataUrl: 'data:text/html;base64,PGh0bWw+', contentType: 'text/html' }), 'HTML is rejected');
  const big = 'data:image/jpeg;base64,' + Buffer.alloc(1_000_000).toString('base64');
  check(!!validateEvidence({ dataUrl: big, contentType: 'image/jpeg' }), 'files over the limit are rejected');
  const doc = await saveEvidence(ctx, USERS.surveyor, { dataUrl: tiny, contentType: 'image/jpeg', orderId: order.id, caption: 'Pit' });
  check(doc.projectId === order.id && doc.kind === 'photo' && (await listAuditEventsForEntity(ctx, 'Document', doc.id)).length === 1, 'evidence saved to the order and audited');

  done('mvp-leads-survey-check');
}

main().catch(err => { console.error(err); process.exitCode = 1; });
