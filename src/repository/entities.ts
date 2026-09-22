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

export const customerRepository = (ctx: RepositoryContext) => getRepository<Customer>('customers', ctx);
export const siteRepository = (ctx: RepositoryContext) => getRepository<Site>('sites', ctx);
export const projectRepository = (ctx: RepositoryContext) => getRepository<Project & { id: string; version?: number }>('projects', ctx);
export const quoteRepository = (ctx: RepositoryContext) => getRepository<Quote>('quotes', ctx);
export const quoteVersionRepository = (ctx: RepositoryContext) => getRepository<QuoteVersion>('quote_versions', ctx);
export const contractRepository = (ctx: RepositoryContext) => getRepository<Contract>('contracts_v2', ctx);
export const paymentScheduleRepository = (ctx: RepositoryContext) => getRepository<PaymentSchedule>('payment_schedules', ctx);
export const paymentRepository = (ctx: RepositoryContext) => getRepository<Payment>('payments', ctx);

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
): Promise<Project> {
  const repo = projectRepository(ctx);
  const updated = await repo.update(
    projectId,
    { stage: nextStage, updatedAt: new Date().toISOString(), updatedBy: ctx.actorUserId, version: expectedVersion + 1 } as any,
    expectedVersion,
  );
  return updated as Project;
}
