/**
 * Step 10 check (demo repository): the Owner View totals, the four Reports sections, the
 * invite list, and the notification bell (list/read/scan/daily digest).
 * Run with: npx tsx scripts/mvp-reports-check.ts
 */
import { check, done, Clock, demoCtx, USERS, assertInvariants } from './mvp/fixtures';
import { runS1 } from './mvp/scenario';
import { buildOwnerSummary, buildReports } from '../src/mvp/services/reports';
import { createInvite, listCustomersForInvite, listInvites } from '../src/mvp/services/invites';
import { listMyNotifications, markNotificationRead, scanTaskNotifications } from '../src/mvp/services/notify';
import { MvpError } from '../src/mvp/services/orderService';
import { getRepository } from '../src/repository';

async function expectError(p: Promise<unknown>, code: MvpError['code'], msg: string) {
  try { await p; check(false, msg); } catch (e: any) { check(e instanceof MvpError && e.code === code, `${msg} (${e.message})`); }
}

async function main() {
  const clock = new Clock();
  const ctx = demoCtx(clock, USERS.admin);

  // Owner totals after S1 to completion: collected ₹11,80,000, 1 completed lift.
  const s = await runS1(ctx, clock, 16);
  const owner = await buildOwnerSummary(ctx);
  check(owner.revenueCollected === 1180000, `owner totals: collected ₹11,80,000 (got ${owner.revenueCollected})`);
  check(owner.completedLifts === 1, `owner totals: 1 completed lift (got ${owner.completedLifts})`);
  check(owner.amc.warranty === 1, 'owner totals: 1 order under warranty');
  check(owner.ordersCount === 1 && owner.outstanding === 0, 'owner totals: 1 order, nothing outstanding');

  // A second order, mid-installation, shows up as an active installation and adds to booked value.
  const mid = await runS1(ctx, clock, 12);
  const owner2 = await buildOwnerSummary(ctx);
  check(owner2.activeInstallations === 1, `owner totals: 1 active installation (got ${owner2.activeInstallations})`);
  check(owner2.ordersCount === 2 && owner2.bookedValue === 2 * 1180000, 'owner totals: booked value covers both orders');
  check(owner2.estimatedMarginPct !== null && owner2.estimatedMarginPct >= 0, 'owner totals: an estimated margin % is computed');

  // Reports: sales, operations, money, quality.
  const reports = await buildReports(ctx);
  check(reports.sales.orders >= 2 && reports.sales.conversionPct > 0, 'reports.sales: orders and conversion');
  check(reports.money.collected === owner2.revenueCollected && reports.money.booked === owner2.bookedValue, 'reports.money matches the owner totals');
  check(reports.operations.activeOrders === 1, 'reports.operations: 1 ACTIVE order (the completed one is not active)');
  check(reports.quality.qcPass === 1, 'reports.quality: 1 QC pass so far');

  // Quality report rework count (S4): a REWORK cycle adds one to reports.quality.rework.
  const before = (await buildReports(ctx)).quality.rework;
  const { submitQcDecision } = await import('../src/mvp/services/qcHandoverService');
  const s4 = await runS1(ctx, clock, 13.9);
  await submitQcDecision(ctx, USERS.qc, s4.orderId, { decision: 'REWORK', remarks: 'Door gap uneven, floor 4' });
  const after = (await buildReports(ctx)).quality.rework;
  check(after === before + 1, `reports.quality.rework increases by 1 after a REWORK decision (got ${before} → ${after})`);

  // Invites (D-13): Admin only; a customer invite needs a customer.
  await expectError(createInvite(ctx, USERS.sales, { email: 'x@example.com', name: 'X', role: 'sales' }), 'forbidden', 'only the Admin invites people');
  await expectError(createInvite(ctx, USERS.admin, { email: 'not-an-email', name: 'X', role: 'sales' }), 'invalid', 'a bad email is rejected');
  await expectError(createInvite(ctx, USERS.admin, { email: 'cust@example.com', name: 'X', role: 'customer' }), 'invalid', 'a customer invite needs a customer');
  const customers = await listCustomersForInvite(ctx);
  check(customers.length >= 1, 'at least one customer exists to invite (from S1)');
  const inv = await createInvite(ctx, USERS.admin, { email: 'New.Surveyor@Example.com', name: 'New Surveyor', role: 'surveyor' });
  check(inv.id === 'new.surveyor@example.com' && inv.email === 'new.surveyor@example.com', 'the invite id/email are lower-cased');
  const custInvite = await createInvite(ctx, USERS.admin, { email: 'cust@example.com', name: 'Cust', role: 'customer', customerId: customers[0].id });
  check(custInvite.customerId === customers[0].id, 'a customer invite carries the chosen customerId');
  await createInvite(ctx, USERS.admin, { email: 'New.Surveyor@Example.com', name: 'New Surveyor (renamed)', role: 'surveyor' });
  const invites = await listInvites(ctx);
  check(invites.filter(i => i.id === 'new.surveyor@example.com').length === 1, 'inviting the same email twice updates it, not duplicates it');

  // Notification bell: the technician sees their own + role:technician (none) notifications; reading marks it read.
  const techNotes = await listMyNotifications(ctx, USERS.tech1);
  check(techNotes.every(n => n.audienceUserId === USERS.tech1.userId || n.audienceUserId === 'role:technician'), 'tech1 only sees notifications addressed to them or their role');
  const first = techNotes.find(n => !n.readAt);
  if (first) {
    await markNotificationRead(ctx, first.id);
    const reread = (await listMyNotifications(ctx, USERS.tech1)).find(n => n.id === first.id)!;
    check(!!reread.readAt, 'marking a notification read persists');
  }

  // Overdue scan + daily digest, both idempotent (safe to call every dashboard load).
  const overdueOrder = await runS1(ctx, clock, 3); // an open SURVEY task, due in the future initially
  clock.advanceDays(30); // now well overdue
  await scanTaskNotifications(ctx);
  const notesRepo = getRepository<any>('notifications', ctx);
  const overdueCount1 = (await notesRepo.list()).filter((n: any) => n.templateId === 'mvp_task_overdue').length;
  await scanTaskNotifications(ctx); // second call, same day: must not duplicate
  const overdueCount2 = (await notesRepo.list()).filter((n: any) => n.templateId === 'mvp_task_overdue').length;
  check(overdueCount1 > 0 && overdueCount1 === overdueCount2, `the overdue scan is idempotent within the same day (${overdueCount1} → ${overdueCount2})`);
  const digestCount1 = (await notesRepo.list()).filter((n: any) => n.templateId === 'mvp_daily_digest').length;
  await scanTaskNotifications(ctx);
  const digestCount2 = (await notesRepo.list()).filter((n: any) => n.templateId === 'mvp_daily_digest').length;
  check(digestCount1 === 1 && digestCount2 === 1, `the daily digest fires exactly once per day (got ${digestCount1} then ${digestCount2})`);

  await assertInvariants(ctx, overdueOrder.orderId, 'reports-check');

  done('mvp-reports-check');
}

main().catch(err => { console.error(err); process.exitCode = 1; });
