/**
 * Data quality view — Phase 12.
 *
 * "Create a data-quality view for: duplicate customers, invalid
 * identifiers, stale records, missing required relationships, orphaned
 * payments, orphaned POs, inconsistent statuses, expired documents."
 *
 * Every check here is a real query against the repository layer,
 * returning concrete record IDs — not a placeholder count. Run against
 * an empty demo store, every check correctly returns zero issues; the
 * acceptance script seeds real problem records (via the same
 * repository/service functions other phases use) and confirms each
 * check actually finds them.
 */

import { getRepository } from '../repository';
import type { RepositoryContext } from '../repository/types';
import { customerRepository, projectRepository, paymentRepository, purchaseOrderRepository } from '../repository/entities';
import type { DocumentRecord } from '../domain/entities';

export interface DataQualityIssue {
  id: string;
  check: string;
  entityType: string;
  entityId: string;
  detail: string;
}

export async function findDuplicateCustomers(ctx: RepositoryContext): Promise<DataQualityIssue[]> {
  const customers = await customerRepository(ctx).list();
  const byPhone = new Map<string, string[]>();
  for (const c of customers) {
    if (!c.phone) continue;
    byPhone.set(c.phone, [...(byPhone.get(c.phone) ?? []), c.id]);
  }
  const issues: DataQualityIssue[] = [];
  for (const [phone, ids] of byPhone) {
    if (ids.length > 1) {
      issues.push({ id: `dup_cust_${phone}`, check: 'duplicate_customers', entityType: 'Customer', entityId: ids.join(','), detail: `${ids.length} customer records share phone number "${phone}"` });
    }
  }
  return issues;
}

export async function findOrphanedPayments(ctx: RepositoryContext): Promise<DataQualityIssue[]> {
  const payments = await paymentRepository(ctx).list();
  const projects = await projectRepository(ctx).list();
  const projectIds = new Set(projects.map(p => p.id));
  return payments
    .filter(p => !projectIds.has(p.projectId))
    .map(p => ({ id: `orphan_pay_${p.id}`, check: 'orphaned_payments', entityType: 'Payment', entityId: p.id, detail: `references non-existent project "${p.projectId}"` }));
}

export async function findOrphanedPurchaseOrders(ctx: RepositoryContext): Promise<DataQualityIssue[]> {
  const pos = await purchaseOrderRepository(ctx).list();
  const projects = await projectRepository(ctx).list();
  const projectIds = new Set(projects.map(p => p.id));
  return pos
    .filter(po => !projectIds.has(po.projectId))
    .map(po => ({ id: `orphan_po_${po.id}`, check: 'orphaned_purchase_orders', entityType: 'PurchaseOrder', entityId: po.id, detail: `references non-existent project "${po.projectId}"` }));
}

export async function findInconsistentProjectStatuses(ctx: RepositoryContext): Promise<DataQualityIssue[]> {
  const projects = await projectRepository(ctx).list();
  const payments = await paymentRepository(ctx).list();
  const issues: DataQualityIssue[] = [];
  for (const p of projects) {
    // A project past the payment stage should have at least one payment record.
    const laterStages = ['procurement', 'production', 'delivery', 'installation', 'qc', 'handover', 'warranty_amc'];
    if (laterStages.includes(p.stage)) {
      const hasPayment = payments.some(pay => pay.projectId === p.id);
      if (!hasPayment) {
        issues.push({ id: `inconsistent_${p.id}`, check: 'inconsistent_statuses', entityType: 'Project', entityId: p.id, detail: `stage is "${p.stage}" but no Payment record exists for this project` });
      }
    }
  }
  return issues;
}

export async function findExpiredDocuments(ctx: RepositoryContext, maxAgeDays = 365): Promise<DataQualityIssue[]> {
  const docs = await getRepository<DocumentRecord>('documents', ctx).list();
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  return docs
    .filter(d => new Date(d.uploadedAt).getTime() < cutoff)
    .map(d => ({ id: `expired_doc_${d.id}`, check: 'expired_documents', entityType: 'DocumentRecord', entityId: d.id, detail: `uploaded ${d.uploadedAt}, older than ${maxAgeDays} days` }));
}

export async function findStaleRecords(ctx: RepositoryContext, staleAfterDays = 30): Promise<DataQualityIssue[]> {
  const projects = await projectRepository(ctx).list();
  const cutoff = Date.now() - staleAfterDays * 24 * 60 * 60 * 1000;
  const activeStages = new Set(['lead', 'customer_site_confirmed', 'quoting', 'negotiation', 'contract']);
  return projects
    .filter(p => activeStages.has(p.stage) && new Date(p.updatedAt).getTime() < cutoff)
    .map(p => ({ id: `stale_${p.id}`, check: 'stale_records', entityType: 'Project', entityId: p.id, detail: `still in "${p.stage}" stage, not updated in over ${staleAfterDays} days` }));
}

export async function runAllDataQualityChecks(ctx: RepositoryContext): Promise<DataQualityIssue[]> {
  const [dupCustomers, orphanPayments, orphanPOs, inconsistent, expired, stale] = await Promise.all([
    findDuplicateCustomers(ctx),
    findOrphanedPayments(ctx),
    findOrphanedPurchaseOrders(ctx),
    findInconsistentProjectStatuses(ctx),
    findExpiredDocuments(ctx),
    findStaleRecords(ctx),
  ]);
  return [...dupCustomers, ...orphanPayments, ...orphanPOs, ...inconsistent, ...expired, ...stale];
}
