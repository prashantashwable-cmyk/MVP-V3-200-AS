/**
 * Step 11 check (demo repository): I-3 ("Every change to stage, status, payment, task
 * owner, due date, quote approval, QC decision or cancellation writes an AuditEvent
 * recording who, when, what, and the before and after values" — ACCEPTANCE_SCENARIOS.md)
 * actually happens, for every one of those 8 categories, not just the ones the happy path
 * (S1) exercises. Run with: npx tsx scripts/mvp-audit-coverage-check.ts
 */
import { check, done, Clock, demoCtx, USERS } from './mvp/fixtures';
import { runS1 } from './mvp/scenario';
import { cancelOrder, changeDueDate, listOrderTasks, reassignTask } from '../src/mvp/services/orderService';
import { approveMargin, saveQuote } from '../src/mvp/services/quoteService';
import { getRepository } from '../src/repository';
import type { AuditEvent } from '../src/domain/entities';

type Category = 'stage' | 'status' | 'payment' | 'task owner' | 'due date' | 'quote approval' | 'QC decision' | 'cancellation';

const ACTIONS_FOR: Record<Category, string[]> = {
  stage: ['ORDER_STAGE_CHANGED'],
  status: ['ORDER_STATUS_CHANGED'],
  payment: ['PAYMENT_STATUS_CHANGED'],
  'task owner': ['TASK_REASSIGNED'],
  'due date': ['TASK_DUE_CHANGED'],
  'quote approval': ['QUOTE_MARGIN_APPROVED'],
  'QC decision': ['QC_DECISION_RECORDED'],
  cancellation: ['ORDER_STATUS_CHANGED'],
};

function assertAudited(events: AuditEvent[], category: Category, orderId: string, extra?: (e: AuditEvent) => boolean) {
  const actions = ACTIONS_FOR[category];
  const matches = events.filter(e => e.projectId === orderId && actions.includes(e.action) && (!extra || extra(e)));
  check(matches.length > 0, `I-3 ${category}: an AuditEvent was written (${actions.join('/')})`);
  const e = matches[0];
  if (!e) return;
  check(!!e.actorId && !!e.actorRole, `I-3 ${category}: the event records who (actorId "${e.actorId}", actorRole "${e.actorRole}")`);
  check(!Number.isNaN(new Date(e.timestamp).getTime()), `I-3 ${category}: the event records when (a valid timestamp)`);
  check(e.after !== undefined && JSON.stringify(e.before) !== JSON.stringify(e.after), `I-3 ${category}: the event records a before/after that actually differ`);
}

async function main() {
  const clock = new Clock();
  const ctx = demoCtx(clock, USERS.admin);
  const auditRepo = getRepository<AuditEvent>('audit_logs', ctx);

  // Order 1: the S1 happy path to completion — covers stage, status (ACTIVE -> COMPLETED),
  // payment and QC decision for free.
  const s1 = await runS1(ctx, clock, 16);
  const events1 = await auditRepo.list();
  assertAudited(events1, 'stage', s1.orderId);
  assertAudited(events1, 'status', s1.orderId, e => (e.after as any)?.status === 'COMPLETED');
  assertAudited(events1, 'payment', s1.orderId);
  assertAudited(events1, 'QC decision', s1.orderId);

  // Order 2: stopped at QUOTE (an open PREPARE_QUOTE task, admin-assigned) — the happy path
  // never reassigns a task, changes a due date, needs margin approval, or cancels an order,
  // so those 4 categories need their own exercise.
  const s2 = await runS1(ctx, clock, 4);
  const prepareQuoteTask = (await listOrderTasks(ctx, s2.orderId)).find(t => t.type === 'PREPARE_QUOTE')!;
  check(!!prepareQuoteTask, 'order 2 has an open PREPARE_QUOTE task to reassign');

  await reassignTask(ctx, USERS.admin, prepareQuoteTask.id, { id: USERS.admin.userId, role: 'admin' }, 'audit-coverage check');
  await changeDueDate(ctx, USERS.admin, prepareQuoteTask.id, new Date(clock.now().getTime() + 5 * 86_400_000).toISOString(), 'audit-coverage check');

  // A below-MIN_MARKUP_PCT(20%) quote: cost 8,00,000, selling 9,20,000 -> 15% markup.
  await saveQuote(ctx, USERS.admin, s2.orderId, {
    lines: { base: 700000, installation: 150000, freight: 40000, other: 30000 }, taxRatePct: 18, estimatedCost: 800000,
  });
  await approveMargin(ctx, USERS.admin, s2.orderId, 'Accepted a thin margin to win the order');

  await cancelOrder(ctx, USERS.admin, s2.orderId, 'Customer withdrew before booking');

  const events2 = await auditRepo.list();
  assertAudited(events2, 'task owner', s2.orderId);
  assertAudited(events2, 'due date', s2.orderId);
  assertAudited(events2, 'quote approval', s2.orderId);
  assertAudited(events2, 'cancellation', s2.orderId, e => (e.after as any)?.status === 'CANCELLED');

  done('mvp-audit-coverage-check');
}

main().catch(err => { console.error(err); process.exitCode = 1; });
