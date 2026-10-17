/**
 * ACCEPTANCE_SCENARIOS S1–S7, S9, S10 through the real order service,
 * against the in-memory demo repository only (D-19). The clock is
 * injected, so "move 15 days" never depends on real time. After every
 * step the invariants I-1..I-6 are asserted.
 * Run: npx tsx scripts/mvp/scenarios-check.ts
 */
import { check, eq, rejects, summary } from './assert';
import * as svc from '../../src/mvp/service';
import { loadOrderBundle, summarize, buildDashboard, myTasks, attentionBuckets, buildReports } from '../../src/mvp/views';
import { mvpRepos } from '../../src/mvp/repo';
import { isOpenTask } from '../../src/mvp/health';
import { stageIndex } from '../../src/mvp/stage';
import type { RepositoryContext } from '../../src/repository/types';
import type { Evidence, MvpActor, MvpRole, MvpStage, QuoteLines } from '../../src/mvp/types';

const repo: RepositoryContext = { environment: 'demo', actorUserId: 'scenario' };
const r = mvpRepos(repo);
const clock = { now: new Date('2026-10-01T04:30:00.000Z') };
const advanceDays = (d: number) => { clock.now = new Date(clock.now.getTime() + d * 86400e3); };
const advanceMinutes = (m: number) => { clock.now = new Date(clock.now.getTime() + m * 60e3); };
const plusDays = (d: number) => new Date(clock.now.getTime() + d * 86400e3).toISOString();

const actor = (id: string, role: MvpRole, customerId?: string): svc.ServiceCtx => ({
  repo, actor: { id, role, customerId, isDemo: true, authMethod: 'demo' } as MvpActor, now: () => clock.now,
});
const admin = actor('admin1', 'admin');
const owner = actor('owner1', 'owner');
const sales = actor('sales1', 'sales');
const surveyor = actor('surveyor1', 'surveyor');
const tech1 = actor('tech1', 'technician');
const tech2 = actor('tech2', 'technician');
const qc = actor('qc1', 'qc');
const customerOf = (customerId: string) => actor(`custuser_${customerId}`, 'customer', customerId);

const photo = (name: string, by = 'x'): Evidence => ({ path: `demo/${name}.jpg`, contentType: 'image/jpeg', sizeBytes: 1000, uploadedBy: by, uploadedAt: clock.now.toISOString(), name });
const LINES: QuoteLines = { baseLift: 780000, installation: 140000, freight: 50000, other: 30000 };

// --- invariants -----------------------------------------------------------
const lastStage = new Map<string, MvpStage>();
async function invariants(orderId: string, label: string) {
  const b = (await loadOrderBundle(repo, admin.actor, orderId))!;
  const s = summarize(b, clock.now);
  if (s.status === 'ACTIVE') {
    check(!!s.currentTask && !!s.currentTask.assigneeId && !!s.currentTask.dueDate, `${label}: I-1 current task with owner and due date`);
  }
  const open = b.tasks.filter(isOpenTask).map(t => t.type);
  check(open.length === new Set(open).size, `${label}: I-2 no duplicate open task types (${open.join(',')})`);
  const prev = lastStage.get(orderId);
  if (prev && prev !== s.stage) {
    check(stageIndex(s.stage) > stageIndex(prev), `${label}: I-4 stage moved forward ${prev}→${s.stage}`);
    const audits = await r.audit.query({ entityType: 'Project', entityId: orderId } as any);
    check(audits.some(a => a.action === 'ORDER_STAGE_CHANGED' && (a.after as any)?.stage === s.stage), `${label}: I-3 stage change audited`);
  }
  lastStage.set(orderId, s.stage);
  return { b, s };
}

async function expectStep(orderId: string, label: string, stage: MvpStage, taskType: string, ownerId: string, progress: number) {
  const { s } = await invariants(orderId, label);
  eq([s.stage, s.currentTask?.type, s.currentTask?.assigneeId, s.progress], [stage, taskType, ownerId, progress], `${label}: stage/task/owner/progress`);
  return s;
}

// --- S1 happy path, reusable up to a given step -----------------------------
interface Run { orderId: string; leadId: string; customerId: string; cust: svc.ServiceCtx }

async function runS1(upTo: string, tag: string): Promise<Run> {
  const steps = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13a', '13b', '14', '15', '15b', '16'];
  const stop = steps.indexOf(upTo);
  const at = (s: string) => steps.indexOf(s) <= stop;
  const L = (s: string) => `${tag} S1.${s}`;

  // 1. sales creates a lead
  const lead = await svc.createLead(sales, {
    name: `ABC Builders ${tag}`, phone: '9800000001', location: 'Baner, Pune', source: 'Walk-in', siteType: 'Residential',
    floors: 8, liftRequirement: 'Passenger lift', constructionStage: 'structure complete', notes: '', consent: true, sitePhotos: [photo('lead')],
  });
  const leadTasks = await r.tasks.query({ leadId: lead.id } as any);
  eq([lead.mvpStatus, leadTasks.map(t => [t.type, t.assigneeId])], ['NEW', [['QUALIFY_LEAD', 'sales1']]], `${L('1')}: lead NEW with QUALIFY_LEAD → sales`);
  if (!at('2')) return { orderId: '', leadId: lead.id, customerId: '', cust: sales };

  // 2. sales qualifies
  const order = await svc.qualifyLead(sales, lead.id, { stops: 8, capacity: '8 persons', type: 'Passenger lift' });
  check(/^AE-\d{4,}$/.test(order.displayCode ?? ''), `${L('2')}: order has an AE-#### code (${order.displayCode})`);
  eq((await r.leads.get(lead.id))?.mvpStatus, 'QUALIFIED', `${L('2')}: lead QUALIFIED`);
  const run: Run = { orderId: order.id, leadId: lead.id, customerId: order.customerId, cust: customerOf(order.customerId) };
  await expectStep(order.id, L('2'), 'QUALIFIED', 'ASSIGN_SURVEYOR', 'role:admin', 5);
  if (!at('3')) return run;

  // 3. admin assigns the surveyor, date = today + 2
  await svc.assignSurveyor(admin, order.id, 'surveyor1', plusDays(2));
  await expectStep(order.id, L('3'), 'SURVEY', 'SURVEY', 'surveyor1', 10);
  eq((await r.leads.get(lead.id))?.mvpStatus, 'SURVEY', `${L('3')}: lead SURVEY`);
  check((await r.notifications.query({ audienceUserId: 'surveyor1', templateId: 'survey_scheduled' } as any)).length > 0, `${L('3')}: survey scheduled notification`);
  if (!at('4')) return run;

  // 4. surveyor submits FEASIBLE with 2 photos
  await svc.submitSurvey(surveyor, order.id, {
    floors: 8, stops: 8, capacity: '8 persons', shaftWidthMm: 1800, shaftDepthMm: 1700, pitMm: 1500, headroomMm: 4200,
    power: '3-phase available', access: 'Good', siteReadiness: 'Shaft ready', remarks: 'OK', feasibility: 'Standard MRL', result: 'FEASIBLE',
    photos: [photo('s1'), photo('s2')],
  });
  await expectStep(order.id, L('4'), 'QUOTE', 'PREPARE_QUOTE', 'role:admin', 20);
  eq((await r.leads.get(lead.id))?.mvpStatus, 'QUOTE', `${L('4')}: lead QUOTE`);
  if (!at('5')) return run;

  // 5. admin prepares (fixture lines, cost 8,00,000) and sends
  const quote = await svc.prepareQuote(admin, order.id, LINES, 18, 800000);
  eq([quote.sellingPrice, quote.status, quote.approvalRequired], [1180000, 'APPROVED', false], `${L('5')}: quote ₹11,80,000, no approval needed`);
  check(!('estimatedCost' in quote), `${L('5')}: I-5 the quote record holds no cost`);
  await svc.sendQuote(admin, quote.id);
  await expectStep(order.id, L('5'), 'QUOTE', 'QUOTE_DECISION', `customer:${order.customerId}`, 20);
  check((await r.notifications.query({ audienceUserId: `customer:${order.customerId}`, templateId: 'quote_ready' } as any)).length > 0, `${L('5')}: quote ready notification`);
  if (!at('6')) return run;

  // 6. customer accepts
  await svc.decideQuote(run.cust, quote.id, true);
  const ms = await r.milestones.query({ orderId: order.id } as any);
  eq(ms.map(m => [m.kind, m.amount, m.status]).sort(), [['BOOKING_TOKEN', 10000, 'PENDING'], ['DELIVERY', 1052000, 'PENDING'], ['FINAL', 118000, 'PENDING']], `${L('6')}: 3 milestones PENDING`);
  await expectStep(order.id, L('6'), 'BOOKED', 'COLLECT_BOOKING_TOKEN', 'role:admin', 30);
  if (!at('7')) return run;

  // 7. customer submits UTR, admin marks token PAID
  await svc.submitPaymentProof(run.cust, `ms_${order.id}_BOOKING_TOKEN`, 'TEST123', 'UPI');
  await svc.markPaymentPaid(admin, `ms_${order.id}_BOOKING_TOKEN`);
  const s7 = await expectStep(order.id, L('7'), 'SITE_READY', 'SITE_READINESS', `customer:${order.customerId}`, 40);
  check(Math.round((new Date(s7.dueDate!).getTime() - clock.now.getTime()) / 86400e3) === 14, `${L('7')}: SITE_READINESS due +14 days`);
  const b7 = (await loadOrderBundle(repo, admin.actor, order.id))!;
  check(b7.tasks.some(t => t.type === 'RAISE_PO' && isOpenTask(t) && t.assigneeId === 'role:admin'), `${L('7')}: RAISE_PO → admin also open`);
  eq([s7.paid, s7.total], [10000, 1180000], `${L('7')}: payment ₹10,000 / ₹11,80,000`);
  eq((await r.leads.get(lead.id))?.mvpStatus, 'WON', `${L('7')}: lead WON`);
  if (!at('8')) return run;

  // 8. admin raises the PO, expected delivery = today + 10
  await svc.raisePurchaseOrder(admin, order.id, { supplierId: 'sup1', supplierName: 'Sahyadri Lift Components', amount: 600000, expectedDeliveryDate: plusDays(10) });
  await expectStep(order.id, L('8'), 'SITE_READY', 'SITE_READINESS', `customer:${order.customerId}`, 40);
  check(!(await r.tasks.query({ orderId: order.id } as any)).some(t => t.type === 'RAISE_PO' && isOpenTask(t)), `${L('8')}: RAISE_PO completed`);
  if (!at('9')) return run;

  // 9. customer uploads 2 photos and confirms ready
  await svc.submitSiteReadiness(run.cust, order.id, [photo('r1'), photo('r2')]);
  await expectStep(order.id, L('9'), 'SITE_READY', 'VERIFY_SITE_READY', 'role:admin', 40);
  if (!at('10')) return run;

  // 10. admin confirms the site
  await svc.confirmSiteReady(admin, order.id);
  const s10 = await expectStep(order.id, L('10'), 'DELIVERY', 'TRACK_DELIVERY', 'role:admin', 50);
  check(Math.round((new Date(s10.dueDate!).getTime() - clock.now.getTime()) / 86400e3) === 10, `${L('10')}: TRACK_DELIVERY due = PO date`);
  check((await r.tasks.query({ orderId: order.id } as any)).some(t => t.type === 'COLLECT_DELIVERY_PAYMENT' && isOpenTask(t)), `${L('10')}: COLLECT_DELIVERY_PAYMENT open`);
  if (!at('11')) return run;

  // 11. admin records the delivery payment
  await svc.markPaymentPaid(admin, `ms_${order.id}_DELIVERY`);
  const s11 = await expectStep(order.id, L('11'), 'DELIVERY', 'TRACK_DELIVERY', 'role:admin', 50);
  eq([s11.paid, s11.total], [1062000, 1180000], `${L('11')}: payment ₹10,62,000 / ₹11,80,000`);
  if (!at('12')) return run;

  // 12. admin marks material received, installer tech1
  await svc.markMaterialReceived(admin, order.id, 'tech1', [photo('material')]);
  await expectStep(order.id, L('12'), 'INSTALLATION', 'INSTALLATION', 'tech1', 55);
  check((await r.notifications.query({ audienceUserId: 'tech1', templateId: 'installation_scheduled' } as any)).length > 0, `${L('12')}: installation scheduled notification`);
  if (!at('13a')) return run;

  // 13a. START, CHECK IN, 6 of 11 items with photos
  const inst = (await r.tasks.query({ orderId: order.id } as any)).find(t => t.type === 'INSTALLATION' && isOpenTask(t))!;
  await svc.startTask(tech1, inst.id);
  await svc.checkIn(tech1, inst.id);
  const keys = ['MATERIAL_RECEIVED', 'SITE_CHECKED', 'RAILS', 'BRACKETS', 'MACHINE', 'CONTROLLER', 'DOORS', 'WIRING', 'SAFETY', 'TESTING', 'CLEANED'] as const;
  for (const k of keys.slice(0, 6)) await svc.updateChecklistItem(tech1, order.id, k, true, photo(k));
  const s13 = await expectStep(order.id, L('13a'), 'INSTALLATION', 'INSTALLATION', 'tech1', 71);
  eq(s13.currentTask?.status, 'IN_PROGRESS', `${L('13a')}: installation IN_PROGRESS`);
  if (!at('13b')) return run;

  // 13b. remaining 5 items, COMPLETE
  for (const k of keys.slice(6)) await svc.updateChecklistItem(tech1, order.id, k, true, photo(k));
  await svc.completeInstallation(tech1, order.id);
  await expectStep(order.id, L('13b'), 'QC_HANDOVER', 'QC_INSPECTION', 'role:qc', 90);
  check((await r.notifications.query({ audienceUserId: 'role:qc', templateId: 'qc_required' } as any)).length > 0, `${L('13b')}: QC required notification`);
  if (!at('14')) return run;

  // 14. QC PASS
  await svc.recordQcDecision(qc, order.id, { decision: 'PASS', testResults: 'Load test OK', remarks: 'Good', evidence: [photo('qc')] });
  await expectStep(order.id, L('14'), 'QC_HANDOVER', 'HANDOVER', 'role:admin', 95);
  const t14 = (await r.tasks.query({ orderId: order.id } as any)).filter(isOpenTask);
  check(t14.some(t => t.type === 'COLLECT_FINAL_PAYMENT') && t14.some(t => t.type === 'STATUTORY_LICENCE'), `${L('14')}: final payment and licence tasks open`);
  const lic = t14.find(t => t.type === 'STATUTORY_LICENCE')!;
  check(Math.round((new Date(lic.dueDate).getTime() - clock.now.getTime()) / 86400e3) === 30, `${L('14')}: licence due +30 days`);
  check((await r.notifications.query({ templateId: 'handover_ready' } as any)).length > 0, `${L('14')}: handover ready notification`);
  if (!at('15')) return run;

  // 15. final payment
  await svc.markPaymentPaid(admin, `ms_${order.id}_FINAL`);
  const s15 = await expectStep(order.id, L('15'), 'QC_HANDOVER', 'HANDOVER', 'role:admin', 95);
  eq([s15.paid, s15.total], [1180000, 1180000], `${L('15')}: payment ₹11,80,000 / ₹11,80,000`);
  if (!at('15b')) return run;

  // 15b. licence DONE with a file
  await svc.setComplianceDoc(admin, order.id, 'LIFT_LICENCE', 'DONE', { ...photo('licence'), contentType: 'application/pdf' });
  check(!(await r.tasks.query({ orderId: order.id } as any)).some(t => t.type === 'STATUTORY_LICENCE' && isOpenTask(t)), `${L('15b')}: STATUTORY_LICENCE completed`);
  if (!at('16')) return run;

  // 16. customer approves, admin completes
  await svc.approveHandoverAsCustomer(run.cust, order.id);
  await svc.completeHandover(admin, order.id, { finalTest: 'All OK', photos: [photo('handover')] });
  const s16 = await expectStep(order.id, L('16'), 'AMC', 'AMC_FOLLOW_UP', 'role:admin', 100);
  eq(s16.status, 'COMPLETED', `${L('16')}: order COMPLETED`);
  const amc = await r.amcs.get(order.id);
  check(!!amc && amc.mvpAmcStatus === 'WARRANTY' && amc.warrantyEnd.slice(0, 7) === '2027-10', `${L('16')}: AMC WARRANTY, warranty ends 12 months later`);
  check(Math.round((new Date(amc!.warrantyEnd).getTime() - new Date(s16.dueDate!).getTime()) / 86400e3) === 90, `${L('16')}: AMC follow-up due = warranty end − 90 days`);
  return run;
}

async function bucketsOf(orderId: string) {
  const b = (await loadOrderBundle(repo, admin.actor, orderId))!;
  return attentionBuckets(summarize(b, clock.now), b, clock.now);
}

async function main() {
  const start = new Date(clock.now);

  // ---- S1
  const s1 = await runS1('16', 'A');
  // I-5 for the customer and field roles
  for (const who of [s1.cust, tech1, qc, surveyor]) {
    const b = await loadOrderBundle(repo, who.actor, s1.orderId);
    check(!!b && b.quoteCosts.length === 0, `I-5: ${who.actor.role} never receives quote cost records`);
  }
  const rep = await buildReports(repo, owner.actor, clock.now);
  check(rep.operations.completedLifts >= 1 && rep.money.collected >= 1180000, 'owner reports count the completed lift and money');
  const cust = await buildReports(repo, s1.cust.actor, clock.now);
  eq(cust.money.estimatedMarginInr, null, 'I-5: margin is not computed for a customer');

  // ---- S2 customer delay
  clock.now = new Date(start);
  const s2 = await runS1('7', 'B');
  advanceDays(15);
  let { s } = await invariants(s2.orderId, 'S2.3');
  eq(s.health, 'OVERDUE', 'S2.3: health OVERDUE after 15 days');
  const b2 = await bucketsOf(s2.orderId);
  check(b2.includes('OVERDUE') && b2.includes('CUSTOMER_WAITING'), `S2.3: Needs Attention → Overdue / Customer waiting (${b2})`);
  await svc.putOnHold(admin, s2.orderId, 'CUSTOMER_NOT_READY', plusDays(7));
  ({ s } = await invariants(s2.orderId, 'S2.5'));
  eq([s.health, s.stage, s.currentTask?.type], ['ON_HOLD', 'SITE_READY', 'REVIEW_HOLD'], 'S2.5: ON_HOLD, still SITE_READY, REVIEW_HOLD created');
  await svc.resumeOrder(admin, s2.orderId);
  const readiness = (await r.tasks.query({ orderId: s2.orderId } as any)).find(t => t.type === 'SITE_READINESS' && isOpenTask(t))!;
  await svc.changeDueDate(admin, readiness.id, new Date(new Date(readiness.dueDate).getTime() + 7 * 86400e3).toISOString(), 'Customer needs a week more');
  ({ s } = await invariants(s2.orderId, 'S2.7'));
  eq([s.status, s.health], ['ACTIVE', 'ON_TRACK'], 'S2.7: ACTIVE and ON_TRACK');
  const a2 = await r.audit.query({ projectId: s2.orderId } as any);
  check(a2.some(a => a.action === 'TASK_DUE_DATE_CHANGED') && a2.some(a => a.action === 'ORDER_STATUS_CHANGED' && (a.after as any)?.status === 'ACTIVE'), 'S2.7: due-date change and resume audited');

  // ---- S3 technician blocker
  clock.now = new Date(start);
  const s3 = await runS1('13a', 'C');
  const inst3 = (await r.tasks.query({ orderId: s3.orderId } as any)).find(t => t.type === 'INSTALLATION' && isOpenTask(t))!;
  const blk = await svc.raiseBlocker(tech1, s3.orderId, { taskId: inst3.id, reason: 'MATERIAL_MISSING', description: 'Brackets short', evidence: [photo('blk')] });
  ({ s } = await invariants(s3.orderId, 'S3.3'));
  eq([s.currentTask?.status, blk.status, blk.ownerUserId, s.health], ['BLOCKED', 'OPEN', 'role:admin', 'BLOCKED'], 'S3.3: task BLOCKED, blocker OPEN owned by admin, health BLOCKED');
  check((await r.notifications.query({ audienceUserId: 'role:admin', templateId: 'blocker_raised' } as any)).length > 0, 'S3.3: admin notified');
  const b3 = await bucketsOf(s3.orderId);
  check(b3.includes('BLOCKED') && b3.includes('TECHNICIAN_WAITING'), `S3.3: Needs Attention → Blocked / Technician waiting (${b3})`);
  await rejects(() => svc.updateChecklistItem(tech1, s3.orderId, 'DOORS', true), 'blocked', 'S3: a blocked task cannot progress');
  await svc.resolveBlocker(admin, blk.id, 'brackets dispatched');
  ({ s } = await invariants(s3.orderId, 'S3.5'));
  const blk2 = await r.blockers.get(blk.id);
  eq([s.currentTask?.status, s.health, blk2?.status, !!blk2?.resolvedAt], ['IN_PROGRESS', 'ON_TRACK', 'RESOLVED', true], 'S3.5: task IN_PROGRESS, ON_TRACK, blocker RESOLVED with time');

  // ---- S4 QC rework
  clock.now = new Date(start);
  const s4 = await runS1('13b', 'D');
  await svc.recordQcDecision(qc, s4.orderId, { decision: 'REWORK', testResults: '', remarks: 'Door gap uneven, floor 4', evidence: [] });
  ({ s } = await invariants(s4.orderId, 'S4.3'));
  eq([s.currentTask?.type, s.currentTask?.assigneeId, s.progress], ['REWORK', 'tech1', 90], 'S4.3: REWORK → tech1 is current, progress 90');
  check((await r.snags.query({ orderId: s4.orderId } as any)).length === 1, 'S4.3: a snag is created');
  await svc.completeRework(tech1, s.currentTask!.id, [photo('fix')], 'Re-aligned');
  ({ s } = await invariants(s4.orderId, 'S4.5'));
  eq([s.currentTask?.type, s.currentTask?.assigneeId], ['QC_INSPECTION', 'role:qc'], 'S4.5: new QC_INSPECTION → qc');
  await svc.recordQcDecision(qc, s4.orderId, { decision: 'PASS', testResults: 'OK', remarks: '', evidence: [] });
  ({ s } = await invariants(s4.orderId, 'S4.7'));
  eq([s.currentTask?.type, s.progress], ['HANDOVER', 95], 'S4.7: continues from S1 step 14');
  // Variant FAIL
  clock.now = new Date(start);
  const s4f = await runS1('13b', 'D2');
  await svc.recordQcDecision(qc, s4f.orderId, { decision: 'FAIL', testResults: '', remarks: 'Machine noise', evidence: [] });
  ({ s } = await invariants(s4f.orderId, 'S4.FAIL'));
  eq([s.status, s.currentTask?.type], ['ON_HOLD', 'REVIEW_HOLD'], 'S4 FAIL: ON_HOLD with REVIEW_HOLD → admin');
  check((await bucketsOf(s4f.orderId)).includes('QC_FAILURE'), 'S4 FAIL: Needs Attention → QC failure');

  // ---- S5 payment pending
  clock.now = new Date(start);
  const s5 = await runS1('10', 'E');
  advanceDays(3);
  ({ s } = await invariants(s5.orderId, 'S5.3'));
  eq(s.health, 'AT_RISK', 'S5.3: health AT_RISK with the delivery payment past due');
  check((await bucketsOf(s5.orderId)).includes('PAYMENT_PENDING'), 'S5.3: Needs Attention → Payment pending');
  await svc.markMaterialReceived(admin, s5.orderId, 'tech1', []);
  ({ s } = await invariants(s5.orderId, 'S5.5'));
  eq([s.stage, s.currentTask?.type], ['INSTALLATION', 'INSTALLATION'], 'S5.5: INSTALLATION task exists');
  await rejects(() => svc.startTask(tech1, s.currentTask!.id), 'Waiting for delivery payment', 'S5.7: START refused');
  await svc.overrideGate(admin, s.currentTask!.id, svc.GATE_DELIVERY_PAYMENT, 'Customer paying on Monday; owner approved');
  await svc.startTask(tech1, s.currentTask!.id);
  check((await r.audit.query({ action: 'GATE_OVERRIDE' } as any)).some(a => a.entityId === s.currentTask!.id), 'S5.9: override audited and START works');

  // ---- S6 cancelled order
  clock.now = new Date(start);
  const s6 = await runS1('5', 'F');
  await svc.cancelOrder(admin, s6.orderId, 'Customer chose another vendor');
  const b6 = (await loadOrderBundle(repo, admin.actor, s6.orderId))!;
  eq([b6.order.status, b6.tasks.filter(isOpenTask).length, (await r.leads.get(s6.leadId))?.mvpStatus], ['CANCELLED', 0, 'LOST'], 'S6: CANCELLED, no open tasks, lead LOST');
  check(b6.tasks.length > 0 && b6.quotes.length > 0, 'S6: nothing deleted (tasks and quote still present)');
  const dash6 = await buildDashboard(repo, admin.actor, clock.now);
  check(!dash6.attention.some(a => a.orders.some(o => o.id === s6.orderId)), 'S6: not in active Needs Attention lists');

  // ---- S7 admin intervention
  clock.now = new Date(start);
  const s7 = await runS1('12', 'G');
  const inst7 = (await r.tasks.query({ orderId: s7.orderId } as any)).find(t => t.type === 'INSTALLATION' && isOpenTask(t))!;
  const before = (await r.audit.query({ entityId: inst7.id } as any)).length;
  await svc.reassignTask(admin, inst7.id, 'tech2', 'technician');
  await svc.changeDueDate(admin, inst7.id, new Date(new Date(inst7.dueDate).getTime() - 3 * 86400e3).toISOString());
  const after = await r.audit.query({ entityId: inst7.id } as any);
  check(after.length - before === 2 && after.every(a => a.before !== undefined || a.action === 'TASK_CREATED'), 'S7: 2 audit events with before/after');
  check((await r.notifications.query({ audienceUserId: 'tech2', templateId: 'task_assigned' } as any)).length > 0, 'S7: tech2 notified');
  check(!(await myTasks(repo, tech1.actor)).some(t => t.id === inst7.id) && (await myTasks(repo, tech2.actor)).some(t => t.id === inst7.id), 'S7: tech1 no longer sees it, tech2 does');
  const o7 = await r.orders.get(s7.orderId);
  check(!o7!.participantIds!.includes('tech1') && o7!.participantIds!.includes('tech2'), 'S7: tech1 removed from the order\'s readers');
  ({ s } = await invariants(s7.orderId, 'S7'));
  eq([s.ownerId, s.dueDate], ['tech2', new Date(new Date(inst7.dueDate).getTime() - 3 * 86400e3).toISOString()], 'S7: Order View shows the new owner and due date');
  await rejects(() => svc.startTask(tech1, inst7.id), 'assigned to someone else', 'S7: tech1 can no longer act on it');

  // ---- S9 emergency
  clock.now = new Date(start);
  const s9 = await runS1('16', 'H');
  await svc.setOnCall(admin, 'tech2', svc.istDate(clock.now));
  const sc = await svc.raiseEmergency(s9.cust, s9.orderId, 'Lift stuck between floors');
  const et = await r.tasks.get(sc.taskId);
  eq([sc.priority, et?.type, et?.assigneeId, (new Date(et!.dueDate).getTime() - clock.now.getTime()) / 60000], ['P0', 'EMERGENCY_RESPONSE', 'tech2', 45], 'S9.3: P0 case, task → tech2, due +45 minutes');
  for (const who of ['role:admin', 'role:owner', 'tech2']) {
    check((await r.notifications.query({ audienceUserId: who, templateId: 'emergency' } as any)).length > 0, `S9.3: ${who} alerted`);
  }
  const dash9 = await buildDashboard(repo, admin.actor, clock.now);
  eq(dash9.attention[0]?.bucket, 'EMERGENCY', 'S9.3: emergency at the top of Needs Attention');
  advanceMinutes(46);
  check(new Date(et!.dueDate).getTime() < clock.now.getTime(), 'S9.5: case shows as overdue after 46 minutes');
  await svc.acknowledgeEmergency(tech2, sc.id);
  await svc.resolveEmergency(tech2, sc.id, 'Released passengers; door sensor reset', photo('fixed'));
  const sc2 = await r.serviceCases.get(sc.id);
  check(sc2?.status === 'RESOLVED' && !!sc2.acknowledgedAt && !!sc2.resolvedAt, 'S9.7: resolved with acknowledge and resolve times');
  check((await r.audit.query({ entityId: sc.id } as any)).length >= 3, 'S9.7: raise, acknowledge and resolve audited');
  // Variant: no on-call technician set → Admin
  await svc.saveSettings(admin, { onCall: undefined });
  const sc3 = await svc.raiseEmergency(s9.cust, s9.orderId, 'Strange noise');
  eq((await r.tasks.get(sc3.taskId))?.assigneeId, 'role:admin', 'S9 variant: no on-call → Admin');

  // ---- S10 licence pending at handover
  clock.now = new Date(start);
  const s10 = await runS1('15', 'I');
  await svc.approveHandoverAsCustomer(s10.cust, s10.orderId);
  await rejects(() => svc.completeHandover(admin, s10.orderId, { finalTest: 'OK', photos: [] }), 'Statutory licence not done', 'S10.3: handover refused');
  await svc.completeHandover(admin, s10.orderId, { finalTest: 'OK', photos: [], overrides: { LICENCE: 'Technical handover accepted; licence pending' } });
  ({ s } = await invariants(s10.orderId, 'S10.5'));
  const t10 = await r.tasks.query({ orderId: s10.orderId } as any);
  eq([s.status, s.stage, t10.some(t => t.type === 'STATUTORY_LICENCE' && isOpenTask(t))], ['COMPLETED', 'AMC', true], 'S10.5: COMPLETED, AMC, licence task still open');
  check((await bucketsOf(s10.orderId)).includes('LICENCE_PENDING'), 'S10.5: Needs Attention → Licence pending');
  check((await r.audit.query({ entityId: s10.orderId, action: 'GATE_OVERRIDE' } as any)).length === 1, 'S10.5: override audited');
  await svc.setComplianceDoc(admin, s10.orderId, 'LIFT_LICENCE', 'DONE', photo('lic'));
  check(!(await bucketsOf(s10.orderId)).includes('LICENCE_PENDING'), 'S10.7: leaves Licence pending once DONE');

  // ---- Extra service guards
  await rejects(() => svc.cancelOrder(tech1, s3.orderId, 'x'), 'Only admin', 'a technician cannot cancel an order');
  await rejects(() => svc.markPaymentPaid(s1.cust, `ms_${s1.orderId}_FINAL`), 'Only admin', 'a customer cannot mark a payment PAID');
  await rejects(() => svc.decideQuote(customerOf('someone_else'), 'nope', true), 'not found', 'quote access is checked');
  const lowLead = await svc.createLead(sales, { name: 'Low margin', phone: '9', location: 'Pune', source: 'x', siteType: 'x', floors: 4, liftRequirement: 'x', constructionStage: 'x', notes: '', consent: true, sitePhotos: [] });
  const lowOrder = await svc.qualifyLead(sales, lowLead.id);
  await svc.assignSurveyor(admin, lowOrder.id, 'surveyor1', plusDays(1));
  await svc.submitSurvey(surveyor, lowOrder.id, { floors: 4, stops: 4, capacity: '6', shaftWidthMm: 1, shaftDepthMm: 1, pitMm: 1, headroomMm: 1, power: '', access: '', siteReadiness: '', remarks: '', feasibility: '', result: 'FEASIBLE', photos: [photo('x')] });
  const lowQuote = await svc.prepareQuote(admin, lowOrder.id, LINES, 18, 850000);
  check(lowQuote.status === 'PENDING_APPROVAL' && lowQuote.approvalRequired, 'low margin (17.6%) needs approval');
  await rejects(() => svc.sendQuote(admin, lowQuote.id), 'approve', 'a below-minimum quote cannot be sent before approval');
  await svc.approveMargin(admin, lowQuote.id, 'Strategic first order');
  await svc.sendQuote(admin, lowQuote.id);
  check((await r.approvals.get(`apr_${lowQuote.id}`))?.status === 'approved', 'ApprovalRequest recorded as approved');
  const again = await svc.qualifyLead(sales, lowLead.id);
  eq(again.id, lowOrder.id, 'qualifying the same lead twice returns the same order (idempotent)');

  summary('mvp scenarios check');
}

main().catch(err => { console.error(err); process.exitCode = 1; });
