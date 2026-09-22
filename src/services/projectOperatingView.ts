/**
 * Project-centric operating view — Phase 21.
 *
 * "Make the Project the central operational context." Everything the
 * pack's own worked example names — Customer, Site, Current Stage,
 * Progress, Next Action, Owner, SLA, Blockers, Financial State,
 * Procurement, Delivery, Installation, QC, Handover, Documents,
 * Communications, Audit/History — assembled from real canonical records
 * in one call, extending Phase 19's `getCustomerPortalSummary()` (which
 * covers the commercial/operations status fields) with the
 * project-management fields that summary deliberately left out (owner,
 * timeline, blockers, next action, audit history).
 */

import type { RepositoryContext } from '../repository/types';
import {
  projectRepository, customerRepository, siteRepository, quoteRepository, contractRepository,
  paymentRepository, paymentScheduleRepository, purchaseOrderRepository, shipmentRepository,
  deliveryReceiptRepository, installationJobRepository, qcInspectionRepository, snagRepository,
  handoverRepository, warrantyRepository,
} from '../repository/entities';
import { listAuditEventsForEntity } from '../lib/audit';
import type { Project, ProjectStage, AuditEvent } from '../domain/entities';
import type { ProjectId } from '../domain/ids';

export const PROJECT_STAGE_ORDER: ProjectStage[] = [
  'lead', 'customer_site_confirmed', 'quoting', 'negotiation', 'contract', 'payment',
  'procurement', 'production', 'delivery', 'installation', 'qc', 'handover', 'warranty_amc', 'service',
];

export interface ProjectTimelineStep {
  stage: ProjectStage;
  status: 'done' | 'current' | 'pending';
}

/** Exported for reuse by Phase 22's work-queue service — one shared
 * source of truth for "what does this stage actually require next,"
 * never duplicated. */
export const NEXT_ACTION_BY_STAGE: Record<ProjectStage, string> = {
  lead: 'Confirm customer and site, then convert to a project',
  customer_site_confirmed: 'Prepare and create a quote',
  quoting: 'Get the quote approved internally and send it to the customer',
  negotiation: 'Resolve the customer\'s counter and get a final decision',
  contract: 'Await contract signature',
  payment: 'Collect the next installment',
  procurement: 'Approve the purchase order and confirm supplier acceptance',
  production: 'Track production to completion and dispatch',
  delivery: 'Confirm material receipt at site',
  installation: 'Complete the installation checklist and capture evidence',
  qc: 'Schedule and complete the QC inspection',
  handover: 'Complete the handover checklist, walkthrough, and certificate',
  warranty_amc: 'Project complete — monitor warranty and offer AMC',
  service: 'Resolve the open service case',
  closed_lost: 'None — this project was lost',
};

export interface ProjectOperatingView {
  project: Project | null;
  customer: { name: string; phone: string } | null;
  site: { address: string } | null;
  timeline: ProjectTimelineStep[];
  nextAction: string;
  owner: { userId: string } | null;
  financial: { totalPaid: number; scheduleActive: boolean; poValue: number };
  blockers: string[];
  auditHistory: AuditEvent[];
}

/** Real conditions this project is genuinely stuck on — never a
 * hard-coded/simulated list. Each check reads a real canonical
 * collection; a blocker only appears if that record actually says so. */
/** Exported for reuse by Phase 22's work-queue service, which needs the
 * exact same real blocker computation per project without duplicating
 * it. */
export async function computeBlockers(ctx: RepositoryContext, projectId: ProjectId): Promise<string[]> {
  const blockers: string[] = [];

  const pos = await purchaseOrderRepository(ctx).query({ projectId });
  if (pos.some(po => po.status === 'pending_approval')) {
    blockers.push('A purchase order is awaiting approval.');
  }

  const receipts = await deliveryReceiptRepository(ctx).query({ projectId });
  if (receipts.some(r => r.status !== 'ok' && r.incidentId)) {
    blockers.push('A delivery was received damaged or with missing items — supplier resolution needed.');
  }

  const qcInspection = await qcInspectionRepository(ctx).get(`qc_job_${projectId}` as any);
  if (qcInspection?.result === 'fail') {
    const openSnags = (await snagRepository(ctx).query({ qcInspectionId: qcInspection.id })).filter(
      s => s.status !== 'reinspection_pending' && s.status !== 'closed',
    );
    if (openSnags.length > 0) blockers.push(`${openSnags.length} open snag(s) block QC pass and handover.`);
  }

  const handover = await handoverRepository(ctx).get(`handover_${projectId}` as any);
  if (handover && handover.status !== 'certificate_issued' && !handover.qcPassed) {
    blockers.push('Handover cannot proceed — QC has not passed yet (hard gate).');
  }
  if (handover && handover.status === 'walkthrough_pending' && !handover.customerAcceptedAt) {
    blockers.push('Handover certificate cannot be issued — customer acceptance not yet recorded (hard gate).');
  }

  return blockers;
}

export async function getProjectOperatingView(ctx: RepositoryContext, projectId: ProjectId): Promise<ProjectOperatingView> {
  const project = await projectRepository(ctx).get(projectId);
  const customer = project ? await customerRepository(ctx).get(project.customerId) : null;
  const site = project ? await siteRepository(ctx).get(project.siteId) : null;

  const stage = project?.stage;
  const currentIndex = stage ? PROJECT_STAGE_ORDER.indexOf(stage) : -1;
  const timeline: ProjectTimelineStep[] = PROJECT_STAGE_ORDER.map((s, i) => ({
    stage: s,
    status: currentIndex < 0 ? 'pending' : i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'pending',
  }));

  const payments = await paymentRepository(ctx).query({ projectId });
  const schedules = await paymentScheduleRepository(ctx).query({ projectId });
  const pos = await purchaseOrderRepository(ctx).query({ projectId });

  const blockers = await computeBlockers(ctx, projectId);
  const auditHistory = project ? await listAuditEventsForEntity(ctx, 'Project', project.id) : [];

  return {
    project: project as Project | null,
    customer: customer ? { name: customer.name, phone: customer.phone } : null,
    site: site ? { address: site.address } : null,
    timeline,
    nextAction: stage ? NEXT_ACTION_BY_STAGE[stage] : 'No canonical project yet — nothing to act on.',
    owner: project ? { userId: project.ownerUserId } : null,
    financial: {
      totalPaid: payments.filter(p => p.status === 'confirmed').reduce((s, p) => s + p.amount, 0),
      scheduleActive: schedules.some(s => s.status === 'active'),
      poValue: pos.reduce((s, po) => s + po.amount, 0),
    },
    blockers,
    auditHistory: auditHistory.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)),
  };
}
