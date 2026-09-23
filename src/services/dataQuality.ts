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
import {
  customerRepository, siteRepository, projectRepository, quoteRepository, contractRepository,
  paymentRepository, purchaseOrderRepository, installationJobRepository, qcInspectionRepository, handoverRepository,
} from '../repository/entities';
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

// ---------------------------------------------------------------------------
// Phase 26 — "complete the canonical graph" checks: every named
// relationship in the pack's own list ("Customer without Site, Site
// without Project, Project missing required Quote/Contract, ... Job
// without Project, QC without Installation, Handover without QC Pass,
// Orphan documents, duplicate ... projects") that Phase 12 did not yet
// cover.
// ---------------------------------------------------------------------------

export async function findCustomersWithoutSite(ctx: RepositoryContext): Promise<DataQualityIssue[]> {
  const [customers, sites] = await Promise.all([customerRepository(ctx).list(), siteRepository(ctx).list()]);
  const customerIdsWithSite = new Set(sites.map(s => s.customerId));
  return customers
    .filter(c => !customerIdsWithSite.has(c.id))
    .map(c => ({ id: `cust_no_site_${c.id}`, check: 'customer_without_site', entityType: 'Customer', entityId: c.id, detail: `customer "${c.name}" has no linked Site record` }));
}

export async function findSitesWithoutProject(ctx: RepositoryContext): Promise<DataQualityIssue[]> {
  const [sites, projects] = await Promise.all([siteRepository(ctx).list(), projectRepository(ctx).list()]);
  const siteIdsWithProject = new Set(projects.map(p => p.siteId));
  return sites
    .filter(s => !siteIdsWithProject.has(s.id))
    .map(s => ({ id: `site_no_project_${s.id}`, check: 'site_without_project', entityType: 'Site', entityId: s.id, detail: `site "${s.address}" has no linked Project record` }));
}

/** A project at 'contract' stage or later should have a real Quote; at
 * 'payment' stage or later should also have a real Contract. Separate
 * from Phase 12's `findInconsistentProjectStatuses` (which checks for a
 * missing Payment), extending the same "does the stage imply a record
 * that doesn't exist" pattern to the two earlier required documents. */
export async function findProjectsMissingQuoteOrContract(ctx: RepositoryContext): Promise<DataQualityIssue[]> {
  const [projects, quotes, contracts] = await Promise.all([projectRepository(ctx).list(), quoteRepository(ctx).list(), contractRepository(ctx).list()]);
  const projectIdsWithQuote = new Set(quotes.map(q => q.projectId));
  const projectIdsWithContract = new Set(contracts.map(c => c.projectId));
  const quoteRequiredStages = new Set(['contract', 'payment', 'procurement', 'production', 'delivery', 'installation', 'qc', 'handover', 'warranty_amc']);
  const contractRequiredStages = new Set(['payment', 'procurement', 'production', 'delivery', 'installation', 'qc', 'handover', 'warranty_amc']);
  const issues: DataQualityIssue[] = [];
  for (const p of projects) {
    if (quoteRequiredStages.has(p.stage) && !projectIdsWithQuote.has(p.id)) {
      issues.push({ id: `missing_quote_${p.id}`, check: 'project_missing_quote', entityType: 'Project', entityId: p.id, detail: `stage is "${p.stage}" but no Quote record exists for this project` });
    }
    if (contractRequiredStages.has(p.stage) && !projectIdsWithContract.has(p.id)) {
      issues.push({ id: `missing_contract_${p.id}`, check: 'project_missing_contract', entityType: 'Project', entityId: p.id, detail: `stage is "${p.stage}" but no Contract record exists for this project` });
    }
  }
  return issues;
}

export async function findOrphanedInstallationJobs(ctx: RepositoryContext): Promise<DataQualityIssue[]> {
  const [jobs, projects] = await Promise.all([installationJobRepository(ctx).list(), projectRepository(ctx).list()]);
  const projectIds = new Set(projects.map(p => p.id));
  return jobs
    .filter(j => !projectIds.has(j.projectId))
    .map(j => ({ id: `orphan_job_${j.id}`, check: 'orphaned_installation_jobs', entityType: 'InstallationJob', entityId: j.id, detail: `references non-existent project "${j.projectId}"` }));
}

export async function findQcWithoutInstallation(ctx: RepositoryContext): Promise<DataQualityIssue[]> {
  const [inspections, jobs] = await Promise.all([qcInspectionRepository(ctx).list(), installationJobRepository(ctx).list()]);
  const jobIds = new Set(jobs.map(j => j.id));
  return inspections
    .filter(q => !jobIds.has(q.installationJobId))
    .map(q => ({ id: `qc_no_install_${q.id}`, check: 'qc_without_installation', entityType: 'QCInspection', entityId: q.id, detail: `references non-existent InstallationJob "${q.installationJobId}"` }));
}

/** Defensive check, not expected to ever fire given Phase 09's hard
 * gate (`confirmCompliance()` throws unless `Handover.qcPassed ===
 * true`) — but a hard gate enforced in service-layer CODE is not the
 * same guarantee as a database CONSTRAINT; this check exists precisely
 * to catch the case where some future direct write bypasses the gate. */
export async function findHandoverWithoutQcPass(ctx: RepositoryContext): Promise<DataQualityIssue[]> {
  const handovers = await handoverRepository(ctx).list();
  const pastCompliance = new Set(['walkthrough_pending', 'customer_accepted', 'certificate_issued']);
  return handovers
    .filter(h => pastCompliance.has(h.status) && h.qcPassed !== true)
    .map(h => ({ id: `handover_no_qc_${h.id}`, check: 'handover_without_qc_pass', entityType: 'Handover', entityId: h.id, detail: `status is "${h.status}" but qcPassed is not true — the Phase 09 hard gate should have prevented this` }));
}

export async function findOrphanedDocuments(ctx: RepositoryContext): Promise<DataQualityIssue[]> {
  const [docs, projects] = await Promise.all([getRepository<DocumentRecord>('documents', ctx).list(), projectRepository(ctx).list()]);
  const projectIds = new Set(projects.map(p => p.id));
  return docs
    .filter(d => d.projectId && !projectIds.has(d.projectId))
    .map(d => ({ id: `orphan_doc_${d.id}`, check: 'orphaned_documents', entityType: 'DocumentRecord', entityId: d.id, detail: `references non-existent project "${d.projectId}"` }));
}

/** Two Projects for the same (customerId, siteId) pair — a real, useful
 * duplicate signal (the same building, same customer, quoted or sold
 * twice by mistake), distinct from a customer legitimately having
 * multiple DIFFERENT sites/projects. */
export async function findDuplicateProjects(ctx: RepositoryContext): Promise<DataQualityIssue[]> {
  const projects = await projectRepository(ctx).list();
  const byCustomerSite = new Map<string, string[]>();
  for (const p of projects) {
    const key = `${p.customerId}::${p.siteId}`;
    byCustomerSite.set(key, [...(byCustomerSite.get(key) ?? []), p.id]);
  }
  const issues: DataQualityIssue[] = [];
  for (const [key, ids] of byCustomerSite) {
    if (ids.length > 1) {
      issues.push({ id: `dup_project_${key}`, check: 'duplicate_projects', entityType: 'Project', entityId: ids.join(','), detail: `${ids.length} Project records share the same customer+site` });
    }
  }
  return issues;
}

export async function runAllDataQualityChecks(ctx: RepositoryContext): Promise<DataQualityIssue[]> {
  const results = await Promise.all([
    findDuplicateCustomers(ctx),
    findOrphanedPayments(ctx),
    findOrphanedPurchaseOrders(ctx),
    findInconsistentProjectStatuses(ctx),
    findExpiredDocuments(ctx),
    findStaleRecords(ctx),
    findCustomersWithoutSite(ctx),
    findSitesWithoutProject(ctx),
    findProjectsMissingQuoteOrContract(ctx),
    findOrphanedInstallationJobs(ctx),
    findQcWithoutInstallation(ctx),
    findHandoverWithoutQcPass(ctx),
    findOrphanedDocuments(ctx),
    findDuplicateProjects(ctx),
  ]);
  return results.flat();
}
