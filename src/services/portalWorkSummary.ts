/**
 * Portal work summaries — Phase 19.
 *
 * "Replace module-oriented navigation with role-oriented work... All
 * portals must use the canonical project/work-item data." The Customer/
 * Supplier/Technician routers (`src/routers/{Customer,Supplier,
 * Technician}Router.tsx`) and their `getTabsByRole()` tab lists
 * (`src/App.tsx`) were investigated directly this phase and found
 * already role-scoped, not module-oriented like the 100+-tab admin list
 * — see `docs/architecture/19-portals.md` §1 for the full comparison
 * against the pack's named target categories. What none of the three
 * portals had until this phase is a REAL canonical-data view: their
 * screens read/write `DbManager` shapes only (Lead/Deal/Job/
 * PurchaseOrder as legacy types). This module is that missing piece —
 * a read-only, repository-backed summary per portal, built from the
 * exact canonical Project/Quote/Contract/Payment/PurchaseOrder/Shipment/
 * InstallationJob/Handover/Warranty records the Phase 15-18 dual-write
 * bridges have been populating.
 *
 * Deliberately NOT wired into the 189 screens' rendering this phase —
 * per this pack's own repeated principle (Phases 08-18), a change this
 * sandbox cannot visually re-verify (no browser) is built, tested via a
 * real acceptance script, and left ready for a follow-up wiring pass,
 * documented as such rather than risked blind.
 */

import type { RepositoryContext } from '../repository/types';
import {
  projectRepository, quoteRepository, contractRepository, paymentRepository, paymentScheduleRepository,
  purchaseOrderRepository, shipmentRepository, deliveryReceiptRepository, installationJobRepository,
  qcInspectionRepository, handoverRepository, warrantyRepository,
} from '../repository/entities';
import type { ProjectId, SupplierId, UserId } from '../domain/ids';
import type { Project } from '../domain/entities';

// ---------------------------------------------------------------------------
// CUSTOMER: My Projects, Project Timeline, Quote, Contract, Payments,
// Production, Delivery, Installation, QC, Handover, Warranty, AMC, Service
// ---------------------------------------------------------------------------

export interface CustomerPortalSummary {
  project: Project | null;
  quote: { status: string; totalAmountKnown: boolean } | null;
  contract: { status: string; signedAt?: string } | null;
  payments: { paidCount: number; totalPaid: number; scheduleActive: boolean };
  procurement: { poCount: number; latestStatus: string | null };
  delivery: { shipmentStatus: string | null; receiptStatus: string | null };
  installation: { status: string | null };
  qc: { result: string | null };
  handover: { status: string | null; certificateIssued: boolean };
  warranty: { active: boolean; endDate?: string };
}

/** Everything one customer needs to see about THEIR project, from real
 * canonical records — the "My Projects → Project Timeline" experience
 * the pack's target CUSTOMER portal category list names, built from data
 * that actually exists rather than a screen-local mock. */
export async function getCustomerPortalSummary(ctx: RepositoryContext, projectId: ProjectId): Promise<CustomerPortalSummary> {
  const project = await projectRepository(ctx).get(projectId);
  const quotes = await quoteRepository(ctx).query({ projectId });
  const quote = quotes[0] ?? null;
  const contracts = await contractRepository(ctx).query({ projectId });
  const contract = contracts[0] ?? null;
  const payments = await paymentRepository(ctx).query({ projectId });
  const schedules = await paymentScheduleRepository(ctx).query({ projectId });
  const pos = await purchaseOrderRepository(ctx).query({ projectId });
  const shipments = await shipmentRepository(ctx).query({ projectId });
  const receipts = await deliveryReceiptRepository(ctx).query({ projectId });
  const jobId = `job_${projectId}`;
  const installationJob = await installationJobRepository(ctx).get(jobId as any);
  const qcInspection = await qcInspectionRepository(ctx).get(`qc_${jobId}` as any);
  const handover = await handoverRepository(ctx).get(`handover_${projectId}` as any);
  const warranties = await warrantyRepository(ctx).query({ projectId });
  const warranty = warranties[0] ?? null;

  return {
    project: project as Project | null,
    quote: quote ? { status: quote.status, totalAmountKnown: !!quote.currentVersionId } : null,
    contract: contract ? { status: contract.status, signedAt: contract.signedAt } : null,
    payments: {
      paidCount: payments.filter(p => p.status === 'confirmed').length,
      totalPaid: payments.filter(p => p.status === 'confirmed').reduce((s, p) => s + p.amount, 0),
      scheduleActive: schedules.some(s => s.status === 'active'),
    },
    procurement: {
      poCount: pos.length,
      latestStatus: pos.length ? pos[pos.length - 1].status : null,
    },
    delivery: {
      shipmentStatus: shipments[0]?.status ?? null,
      receiptStatus: receipts[0]?.status ?? null,
    },
    installation: { status: installationJob?.status ?? null },
    qc: { result: qcInspection?.result ?? null },
    handover: { status: handover?.status ?? null, certificateIssued: handover?.status === 'certificate_issued' },
    warranty: { active: !!warranty, endDate: warranty?.endDate },
  };
}

// ---------------------------------------------------------------------------
// SUPPLIER: My Orders, Production, Deliveries, Documents, Payments, Issues
// ---------------------------------------------------------------------------

export interface SupplierPortalSummary {
  supplierId: SupplierId;
  openOrders: number;
  inProduction: number;
  awaitingApproval: number;
  dispatched: number;
  totalOrderValue: number;
  activeDeliveries: number;
}

/** "My Orders" for one supplier, aggregated from every real canonical
 * PurchaseOrder that names them — across every project, not scoped to
 * one project like the customer summary above (a supplier legitimately
 * works several projects at once). */
export async function getSupplierPortalSummary(ctx: RepositoryContext, supplierId: SupplierId): Promise<SupplierPortalSummary> {
  const pos = await purchaseOrderRepository(ctx).query({ supplierId });
  const shipmentsAll = await Promise.all(pos.map(po => shipmentRepository(ctx).query({ purchaseOrderId: po.id })));
  const activeDeliveries = shipmentsAll.flat().filter(s => s.status === 'scheduled' || s.status === 'dispatched' || s.status === 'arrived').length;

  return {
    supplierId,
    openOrders: pos.filter(p => p.status !== 'dispatched' && p.status !== 'delivered' && p.status !== 'cancelled').length,
    inProduction: pos.filter(p => p.status === 'in_production').length,
    awaitingApproval: pos.filter(p => p.status === 'pending_approval').length,
    dispatched: pos.filter(p => p.status === 'dispatched' || p.status === 'delivered').length,
    totalOrderValue: pos.reduce((s, p) => s + p.amount, 0),
    activeDeliveries,
  };
}

// ---------------------------------------------------------------------------
// TECHNICIAN: My Jobs, Today, Job Brief, Check-in, SOP, Evidence,
// Materials, Issues, Completion
// ---------------------------------------------------------------------------

export interface TechnicianPortalSummary {
  technicianId: UserId;
  assignedJobs: number;
  awaitingCheckIn: number;
  inProgress: number;
  awaitingQc: number;
  completed: number;
}

/** "My Jobs" for one technician, aggregated from every real canonical
 * InstallationJob assigned to them. */
export async function getTechnicianPortalSummary(ctx: RepositoryContext, technicianId: UserId): Promise<TechnicianPortalSummary> {
  const jobs = await installationJobRepository(ctx).query({ technicianId });
  return {
    technicianId,
    assignedJobs: jobs.length,
    awaitingCheckIn: jobs.filter(j => j.status === 'assigned' || j.status === 'site_readiness_pending').length,
    inProgress: jobs.filter(j => j.status === 'checked_in' || j.status === 'in_progress' || j.status === 'evidence_pending').length,
    awaitingQc: jobs.filter(j => j.status === 'completed' || j.status === 'qc_requested').length,
    completed: jobs.filter(j => j.status === 'qc_requested').length,
  };
}
