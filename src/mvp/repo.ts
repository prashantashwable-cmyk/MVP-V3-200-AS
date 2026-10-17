/**
 * Typed repositories for the MVP collections (plan §2), on top of the
 * existing `src/repository` factory: Firestore for real sessions, the
 * in-memory demo repository for "Try as Role" and the checks (D-19).
 */
import { runTransaction, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getRepository, type Repository, type RepositoryContext } from '../repository';
import { customerRepository, projectRepository, siteRepository } from '../repository/entities';
import type { Customer, Project, Site, Snag, Warranty, ApprovalRequest, AuditEvent } from '../domain/entities';
import type {
  MvpAmc, MvpBlocker, MvpChecklist, MvpComplianceDoc, MvpHandover, MvpInvite, MvpLead, MvpMilestone,
  MvpNotification, MvpPurchaseOrder, MvpQcRecord, MvpQuote, MvpQuoteCost, MvpServiceCase, MvpSettings,
  MvpSupplier, MvpSurvey, MvpTask,
} from './types';

export type Order = Project & { id: string; version?: number };

type R<T> = Repository<T & { id: string; version?: number }>;

export function mvpRepos(ctx: RepositoryContext) {
  const r = <T>(name: string) => getRepository<T & { id: string; version?: number }>(name, ctx) as R<T>;
  return {
    orders: projectRepository(ctx) as unknown as R<Order>,
    customers: customerRepository(ctx) as unknown as R<Customer & { userId?: string }>,
    sites: siteRepository(ctx) as unknown as R<Site>,
    tasks: r<MvpTask>('tasks'),
    blockers: r<MvpBlocker>('blockers'),
    leads: r<MvpLead>('canonical_leads'),
    surveys: r<MvpSurvey>('surveys'),
    quotes: r<MvpQuote>('order_quotes'),
    quoteCosts: r<MvpQuoteCost>('quote_costs'),
    milestones: r<MvpMilestone>('payment_milestones'),
    purchaseOrders: r<MvpPurchaseOrder & Record<string, unknown>>('purchase_orders'),
    suppliers: r<MvpSupplier>('suppliers'),
    checklists: r<MvpChecklist>('install_checklists'),
    qcRecords: r<MvpQcRecord>('qc_records'),
    snags: r<Snag & { orderId: string }>('snags'),
    handovers: r<MvpHandover>('order_handovers'),
    warranties: r<Warranty>('warranties'),
    amcs: r<MvpAmc>('amcs'),
    compliance: r<MvpComplianceDoc>('compliance_docs'),
    serviceCases: r<MvpServiceCase>('service_cases'),
    approvals: r<ApprovalRequest>('approval_requests'),
    settings: r<MvpSettings>('mvp_settings'),
    invites: r<MvpInvite>('user_invites'),
    notifications: r<MvpNotification>('notifications'),
    audit: r<AuditEvent>('audit_logs'),
  };
}

export type MvpRepos = ReturnType<typeof mvpRepos>;

const demoCounters = new Map<string, number>();

/**
 * Next number of a named sequence, taken safely under concurrency: a
 * Firestore transaction on `counters/{name}` for real sessions (D-02),
 * an in-memory counter in demo mode.
 */
export async function nextSequence(ctx: RepositoryContext, name: string, start = 1001): Promise<number> {
  if (ctx.environment === 'demo') {
    const n = (demoCounters.get(name) ?? start - 1) + 1;
    demoCounters.set(name, n);
    return n;
  }
  if (!db) throw new Error('Firestore is not initialized — cannot allocate an order code.');
  const ref = doc(db, 'counters', name);
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const next = snap.exists() ? ((snap.data() as { next: number }).next) : start;
    tx.set(ref, { id: name, next: next + 1 });
    return next;
  });
}

let idSeq = 0;
export function newId(prefix: string): string {
  idSeq += 1;
  return `${prefix}_${Date.now().toString(36)}${idSeq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
