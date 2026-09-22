/**
 * Concrete repository accessors for the Phase 04 vertical slice:
 *   Lead -> Customer/Site -> Project -> Quote -> Contract -> Payment
 *
 * These are the "Domain Service" layer named in RUN_ALL.md's target
 * architecture (UI -> Domain Service -> Repository -> Firestore/server).
 * Each function here is what a screen should call; none of them expose
 * `DbManager`, `firebase/firestore`, or `localStorage` directly.
 *
 * Firestore collection names chosen to match src/firestore.rules
 * (updated alongside this file) and to sit next to the existing real
 * collections (`users`, `leads`, `contracts`) without colliding.
 */

import { getRepository } from './index';
import type { RepositoryContext } from './types';
import type { Customer, Site, Project, Quote, QuoteVersion, Contract, PaymentSchedule, Payment } from '../domain/entities';
import type { PurchaseOrder } from '../domain/entities';
import { recordAuditEvent, newCorrelationId } from '../lib/audit';
import { runIdempotent } from '../lib/idempotency';

export const customerRepository = (ctx: RepositoryContext) => getRepository<Customer>('customers', ctx);
export const siteRepository = (ctx: RepositoryContext) => getRepository<Site>('sites', ctx);
export const projectRepository = (ctx: RepositoryContext) => getRepository<Project & { id: string; version?: number }>('projects', ctx);
export const quoteRepository = (ctx: RepositoryContext) => getRepository<Quote>('quotes', ctx);
export const quoteVersionRepository = (ctx: RepositoryContext) => getRepository<QuoteVersion>('quote_versions', ctx);
export const contractRepository = (ctx: RepositoryContext) => getRepository<Contract>('contracts_v2', ctx);
export const paymentScheduleRepository = (ctx: RepositoryContext) => getRepository<PaymentSchedule>('payment_schedules', ctx);
export const paymentRepository = (ctx: RepositoryContext) => getRepository<Payment>('payments', ctx);
export const purchaseOrderRepository = (ctx: RepositoryContext) => getRepository<PurchaseOrder>('purchase_orders', ctx);

/**
 * `contracts_v2` (not `contracts`): the repo already has a real `contracts`
 * Firestore collection with its own shape and rules (Phase 01 §5 — used
 * for elevator/AMC contract documents, keyed by customer). Reusing that
 * name for the new canonical `Contract` entity would silently collide
 * two different shapes under one collection. Phase 08+ should decide
 * whether to consolidate them; until then, keeping them distinct avoids
 * a data-corruption risk that would violate non-negotiable principle #7
 * ("never weaken security rules") by making rules ambiguous about which
 * shape they're guarding.
 */

// ---------------------------------------------------------------------------
// End-to-end vertical-slice service functions.
// ---------------------------------------------------------------------------

/** Creates the Customer + Site + Project spine from a converted Lead, in
 * the target Firestore/demo store (not merely deriving read-time
 * adapter values — this actually persists them via the repository). */
export async function createProjectFromLead(
  ctx: RepositoryContext,
  customer: Customer,
  site: Site,
  project: Project,
): Promise<{ customer: Customer; site: Site; project: Project }> {
  const [savedCustomer, savedSite, savedProject] = await Promise.all([
    customerRepository(ctx).create(customer),
    siteRepository(ctx).create(site),
    projectRepository(ctx).create({ ...project, version: 0, updatedAt: new Date().toISOString(), updatedBy: ctx.actorUserId } as any),
  ]);
  return { customer: savedCustomer, site: savedSite, project: savedProject as Project };
}

export async function advanceProjectStage(
  ctx: RepositoryContext,
  projectId: string,
  nextStage: Project['stage'],
  expectedVersion: number,
  actorRole: import('../domain/entities').CanonicalUserRole | 'system' = 'system',
): Promise<Project> {
  const repo = projectRepository(ctx);
  const before = await repo.get(projectId);
  const updated = await repo.update(
    projectId,
    { stage: nextStage, updatedAt: new Date().toISOString(), updatedBy: ctx.actorUserId, version: expectedVersion + 1 } as any,
    expectedVersion,
  );
  // Phase 06: every project stage transition is audited — this is the
  // record management reconstructs project history from (RUN_ALL.md's
  // "management should be able to reconstruct... project history...
  // without asking people to assemble the answer manually").
  await recordAuditEvent(ctx, {
    actorId: ctx.actorUserId,
    actorRole,
    action: 'PROJECT_STAGE_ADVANCED',
    entityType: 'Project',
    entityId: projectId,
    projectId,
    before: before ? { stage: before.stage, version: before.version } : undefined,
    after: { stage: nextStage, version: expectedVersion + 1 },
    source: 'api',
    correlationId: newCorrelationId(),
  });
  return updated as Project;
}

/**
 * Idempotent payment recording — Phase 06. Wraps `paymentRepository.create`
 * with the shared idempotency guard: calling this twice with the same
 * `payment.idempotencyKey` (e.g. a double-tapped "Pay Now" button, or a
 * payment-gateway webhook redelivering the same event) performs the
 * side effect once and returns the original result both times.
 */
export async function createPaymentIdempotent(
  ctx: RepositoryContext,
  payment: Payment,
): Promise<{ payment: Payment; wasDuplicate: boolean }> {
  const { result, wasDuplicate } = await runIdempotent(ctx, 'payment.create', payment.idempotencyKey, async () => {
    const saved = await paymentRepository(ctx).create(payment);
    await recordAuditEvent(ctx, {
      actorId: ctx.actorUserId,
      actorRole: 'system',
      action: 'PAYMENT_RECORDED',
      entityType: 'Payment',
      entityId: payment.id,
      projectId: payment.projectId,
      after: { amount: payment.amount, status: payment.status, method: payment.method },
      source: 'api',
      correlationId: newCorrelationId(),
    });
    return saved;
  });
  return { payment: result, wasDuplicate };
}

/** Idempotent PO creation — Phase 06, mirrors createPaymentIdempotent. */
export async function createPurchaseOrderIdempotent(
  ctx: RepositoryContext,
  po: PurchaseOrder,
): Promise<{ purchaseOrder: PurchaseOrder; wasDuplicate: boolean }> {
  const { result, wasDuplicate } = await runIdempotent(ctx, 'po.create', po.idempotencyKey, async () => {
    const saved = await purchaseOrderRepository(ctx).create(po);
    await recordAuditEvent(ctx, {
      actorId: ctx.actorUserId,
      actorRole: 'system',
      action: 'PO_CREATED',
      entityType: 'PurchaseOrder',
      entityId: po.id,
      projectId: po.projectId,
      after: { amount: po.amount, supplierId: po.supplierId, status: po.status },
      source: 'api',
      correlationId: newCorrelationId(),
    });
    return saved;
  });
  return { purchaseOrder: result, wasDuplicate };
}
