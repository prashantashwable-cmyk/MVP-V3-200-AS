/**
 * Step 06 check (demo repository): fixture quote maths, the margin guard, milestones and the
 * sum rule, S1 steps 5–7 through the real services, S6 (cancel at QUOTE), the S5 set-up
 * (payment overdue → AT_RISK), I-5 (no cost for customer/technician), audit on every
 * payment change, and the D-14 soft-gate helper.
 * Run with: npx tsx scripts/mvp-quote-payment-check.ts
 */
import { check, done, Clock, demoCtx, USERS, FIXTURE_QUOTE, customerActor, assertInvariants } from './mvp/fixtures';
import { runS1 } from './mvp/scenario';
import { computeQuote, defaultMilestoneAmounts, validateQuoteInput } from '../src/mvp/quoteMath';
import { saveQuote, sendQuote, approveMargin, decideQuote, getQuoteForViewer } from '../src/mvp/services/quoteService';
import {
  listMilestones, editMilestoneAmounts, submitPaymentProof, verifyPayment, rejectPaymentProof, milestoneId, setMilestoneDueDate,
} from '../src/mvp/services/paymentService';
import { checkGate, overrideGate } from '../src/mvp/gates';
import { cancelOrder, listOrderTasks, leadRepository, MvpError } from '../src/mvp/services/orderService';
import { buildOrderView } from '../src/mvp/services/readModels';
import { projectRepository } from '../src/repository/entities';
import { listAuditEventsForEntity } from '../src/lib/audit';
import { currentTask, isOpenTask, computeHealth } from '../src/mvp/health';
import { toMvpStage } from '../src/mvp/stage';
import { leadStatus } from '../src/mvp/leadModel';

async function expectError(p: Promise<unknown>, code: MvpError['code'], msg: string) {
  try { await p; check(false, msg); } catch (e: any) { check(e instanceof MvpError && e.code === code, `${msg} (${e.message})`); }
}

async function main() {
  const clock = new Clock();
  const ctx = demoCtx(clock, USERS.admin);

  // Fixture maths (ACCEPTANCE_SCENARIOS): ₹10,00,000 + 18% (fixture only) = ₹11,80,000; markup 25%, margin 20%.
  const fig = computeQuote(FIXTURE_QUOTE.lines, 18, 800000);
  check(fig.subtotalExclTax === 1000000 && fig.sellingPrice === 1180000 && fig.markupPct === 25 && fig.grossMarginPct === 20 && !fig.belowMinimum, 'fixture quote = ₹11,80,000, markup 25%, margin 20%');
  const low = computeQuote(FIXTURE_QUOTE.lines, 18, 850000);
  check(low.markupPct === 17.65 && low.belowMinimum, 'low-margin variant: markup 17.65% < 20% → needs approval');
  const ms = defaultMilestoneAmounts(1180000);
  check(ms.BOOKING_TOKEN === 10000 && ms.DELIVERY === 1052000 && ms.FINAL === 118000, 'milestones 10,000 / 10,52,000 / 1,18,000');
  check(validateQuoteInput(FIXTURE_QUOTE.lines, null, 800000).some(e => e.includes('tax rate')), 'no tax rate → validation error (never a hidden default, ⚖)');

  // S1 step 5: prepare + send.
  const s = await runS1(ctx, clock, 4);
  const cust = customerActor(s.customerId);
  await expectError(saveQuote(ctx, USERS.sales, s.orderId, FIXTURE_QUOTE), 'forbidden', 'only the Admin prepares quotes');
  await saveQuote(ctx, USERS.admin, s.orderId, FIXTURE_QUOTE);
  let tasks = await listOrderTasks(ctx, s.orderId);
  check(!tasks.some(t => t.type === 'APPROVE_MARGIN'), 'S1.5 no approval needed at 25% markup');
  await sendQuote(ctx, USERS.admin, s.orderId);
  tasks = await listOrderTasks(ctx, s.orderId);
  const order5 = (await projectRepository(ctx).get(s.orderId))!;
  const cur5 = currentTask(tasks, toMvpStage(order5.stage));
  check(cur5?.type === 'QUOTE_DECISION' && cur5.assigneeId === `customer:${s.customerId}`, 'S1.5 QUOTE_DECISION → customer');
  check(order5.sellingPrice === 1180000, 'S1.5 order selling price = ₹11,80,000');
  const m5 = await listMilestones(ctx, s.orderId);
  check(m5.length === 3 && m5.every(m => m.status === 'PENDING') && m5.reduce((a, m) => a + m.amount, 0) === 1180000, 'three milestones, PENDING, summing to the selling price');
  await assertInvariants(ctx, s.orderId, 'S1.5');

  // I-5: cost only for admin/owner.
  const qc = await getQuoteForViewer(ctx, cust, s.orderId);
  const qt = await getQuoteForViewer(ctx, USERS.tech1, s.orderId);
  const qa = await getQuoteForViewer(ctx, USERS.admin, s.orderId);
  check(qc.cost === undefined && qt.cost === undefined && !JSON.stringify(qc).includes('estimatedCost'), 'I-5: customer and technician never receive estimatedCost');
  check(qa.cost?.estimatedCost === 800000 && qa.cost.markupPct === 25, 'admin sees cost and markup');
  check(qc.version?.sellingPrice === 1180000 && qc.version.taxRatePct === 18, 'customer sees the price build-up');

  // S1 step 6: customer accepts (double tap safe).
  await expectError(decideQuote(ctx, customerActor('someone_else'), s.orderId, 'accept'), 'forbidden', 'another customer cannot accept this quote');
  await decideQuote(ctx, cust, s.orderId, 'accept');
  await decideQuote(ctx, cust, s.orderId, 'accept');
  tasks = await listOrderTasks(ctx, s.orderId);
  let v = (await buildOrderView(ctx, USERS.admin, s.orderId))!;
  check(v.stage === 'BOOKED' && v.currentTask?.type === 'COLLECT_BOOKING_TOKEN' && v.progress === 30, 'S1.6 BOOKED, COLLECT_BOOKING_TOKEN → admin, 30%');
  check(tasks.filter(t => t.type === 'COLLECT_BOOKING_TOKEN').length === 1, 'a double accept creates no second task (I-2)');
  await assertInvariants(ctx, s.orderId, 'S1.6');

  // Milestone edits must add up (and are audited).
  await expectError(editMilestoneAmounts(ctx, USERS.admin, s.orderId, { BOOKING_TOKEN: 20000 }, 'bigger token'), 'invalid', 'edits that do not add up are rejected');
  await editMilestoneAmounts(ctx, USERS.admin, s.orderId, { BOOKING_TOKEN: 20000, DELIVERY: 1042000 }, 'Customer asked for a bigger token');
  check((await listAuditEventsForEntity(ctx, 'PaymentMilestone', milestoneId(s.orderId, 'BOOKING_TOKEN'))).some(e => e.action === 'PAYMENT_AMOUNT_CHANGED' && e.reason === 'Customer asked for a bigger token'), 'amount edit audited with before/after and reason');
  await editMilestoneAmounts(ctx, USERS.admin, s.orderId, { BOOKING_TOKEN: 10000, DELIVERY: 1052000 }, 'Back to default');

  // S1 step 7: proof → reject → proof → verify PAID.
  const tokenId = milestoneId(s.orderId, 'BOOKING_TOKEN');
  await expectError(verifyPayment(ctx, cust, tokenId, { status: 'PAID', method: 'UPI', reference: 'x' }), 'forbidden', 'a customer cannot mark a payment PAID');
  await submitPaymentProof(ctx, cust, tokenId, 'WRONG1');
  await rejectPaymentProof(ctx, USERS.admin, tokenId, 'UTR not found in bank statement');
  await submitPaymentProof(ctx, cust, tokenId, 'TEST123');
  await verifyPayment(ctx, USERS.admin, tokenId, { status: 'PAID', method: 'UPI', reference: 'TEST123' });
  await verifyPayment(ctx, USERS.admin, tokenId, { status: 'PAID', method: 'UPI', reference: 'TEST123' });
  v = (await buildOrderView(ctx, USERS.admin, s.orderId))!;
  check(v.stage === 'SITE_READY' && v.currentTask?.type === 'SITE_READINESS' && v.progress === 40, 'S1.7 SITE_READY, SITE_READINESS → customer, 40%');
  const readiness = v.openTasks.find(t => t.type === 'SITE_READINESS')!;
  check(Math.round((new Date(readiness.dueDate).getTime() - clock.now().getTime()) / 86_400_000) === 14, 'S1.7 SITE_READINESS due in 14 days (the 2-week rule)');
  check(v.openTasks.some(t => t.type === 'RAISE_PO'), 'S1.7 RAISE_PO is also open');
  check(v.payments?.paid === 10000 && v.payments.total === 1180000, 'S1.7 payment shows ₹10,000 / ₹11,80,000');
  const lead = await leadRepository(ctx).get(s.leadId);
  check(leadStatus(lead!) === 'WON', 'S1.7 lead is WON');
  const payAudit = await listAuditEventsForEntity(ctx, 'PaymentMilestone', tokenId);
  check(['PAYMENT_PROOF_SUBMITTED', 'PAYMENT_PROOF_REJECTED', 'PAYMENT_STATUS_CHANGED'].every(a => payAudit.some(e => e.action === a)), 'every payment change writes an audit event');
  check(payAudit.filter(e => e.action === 'PAYMENT_STATUS_CHANGED').length === 1, 'verifying twice records one status change (idempotent)');
  await assertInvariants(ctx, s.orderId, 'S1.7');
  await expectError(rejectPaymentProof(ctx, USERS.admin, tokenId, 'late'), 'invalid', 'a settled payment\'s proof cannot be rejected');

  // Soft gate helper (D-14).
  check((await checkGate(ctx, s.orderId, 'SITE_READY_ENTRY')).allowed, 'gate: token paid → SITE_READY entry allowed');
  const g = await checkGate(ctx, s.orderId, 'INSTALLATION_START');
  check(!g.allowed && g.reason === 'Waiting for delivery payment', 'gate: delivery unpaid → "Waiting for delivery payment"');
  await expectError(overrideGate(ctx, USERS.admin, s.orderId, 'INSTALLATION_START', ''), 'invalid', 'an override needs a reason');
  await overrideGate(ctx, USERS.admin, s.orderId, 'INSTALLATION_START', 'Customer paid in cash at site');
  const g2 = await checkGate(ctx, s.orderId, 'INSTALLATION_START');
  check(g2.allowed && g2.overridden === true, 'override opens the gate');
  check((await listAuditEventsForEntity(ctx, 'Project', s.orderId)).some(e => e.action === 'GATE_OVERRIDDEN' && e.reason === 'Customer paid in cash at site'), 'override audited');

  // Low-margin variant: blocked until approved.
  const lowOrder = await runS1(ctx, clock, 4);
  await saveQuote(ctx, USERS.admin, lowOrder.orderId, { ...FIXTURE_QUOTE, estimatedCost: 850000 });
  check((await listOrderTasks(ctx, lowOrder.orderId)).some(t => t.type === 'APPROVE_MARGIN' && isOpenTask(t)), 'low margin → APPROVE_MARGIN task');
  check((await getQuoteForViewer(ctx, USERS.admin, lowOrder.orderId)).approval?.status === 'pending', 'low margin → ApprovalRequest pending');
  await expectError(sendQuote(ctx, USERS.admin, lowOrder.orderId), 'gate', 'a low-margin quote cannot be sent before approval');
  await expectError(approveMargin(ctx, USERS.admin, lowOrder.orderId, ''), 'invalid', 'approval needs a reason');
  await approveMargin(ctx, USERS.admin, lowOrder.orderId, 'Strategic builder account');
  await sendQuote(ctx, USERS.admin, lowOrder.orderId);
  check((await listAuditEventsForEntity(ctx, 'Quote', `quote_${lowOrder.orderId}`)).some(e => e.action === 'QUOTE_MARGIN_APPROVED'), 'margin approval audited');
  // Customer asks for changes → PREPARE_QUOTE again; a new version is kept.
  await decideQuote(ctx, customerActor(lowOrder.customerId), lowOrder.orderId, 'changes', 'Please include the ARD');
  check((await listOrderTasks(ctx, lowOrder.orderId)).some(t => t.type === 'PREPARE_QUOTE' && isOpenTask(t)), 'changes requested → PREPARE_QUOTE for the Admin');
  await saveQuote(ctx, USERS.admin, lowOrder.orderId, { ...FIXTURE_QUOTE, lines: { ...FIXTURE_QUOTE.lines, other: 60000 } });
  check((await getQuoteForViewer(ctx, USERS.admin, lowOrder.orderId)).versions.length === 2, 'each edit keeps a new quote version');

  // S6: cancel at QUOTE.
  const s6 = await runS1(ctx, clock, 5);
  await cancelOrder(ctx, USERS.admin, s6.orderId, 'Customer chose another vendor');
  const o6 = (await projectRepository(ctx).get(s6.orderId))!;
  check(o6.status === 'CANCELLED' && (await listOrderTasks(ctx, s6.orderId)).every(t => !isOpenTask(t)), 'S6 cancelled, every open task cancelled');
  check(leadStatus((await leadRepository(ctx).get(s6.leadId))!) === 'LOST', 'S6 lead LOST');
  check((await listMilestones(ctx, s6.orderId)).length === 3, 'S6 payments are left untouched (nothing deleted)');

  // S5 set-up: the delivery payment overdue → AT_RISK.
  const s5 = await runS1(ctx, clock, 10);
  const dueSoon = new Date(clock.now().getTime() + 12 * 86_400_000).toISOString();
  await setMilestoneDueDate(ctx, USERS.admin, s5.orderId, 'DELIVERY', dueSoon);
  const o5 = (await projectRepository(ctx).get(s5.orderId))!;
  const t5 = (await listOrderTasks(ctx, s5.orderId)).map(t => ({ ...t, dueDate: new Date(clock.now().getTime() + 40 * 86_400_000).toISOString() }));
  const later = new Date(clock.now().getTime() + 13 * 86_400_000);
  check(computeHealth({ status: o5.status, stage: toMvpStage(o5.stage), tasks: t5, openBlockerCount: 0, milestones: await listMilestones(ctx, s5.orderId), now: later }) === 'AT_RISK', 'S5: unpaid delivery milestone past due → AT_RISK');

  done('mvp-quote-payment-check');
}

main().catch(err => { console.error(err); process.exitCode = 1; });
