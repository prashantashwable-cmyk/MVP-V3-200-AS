/**
 * Adapters: legacy AIEC types (src/types.ts) → canonical domain model
 * (src/domain/entities.ts).
 *
 * Phase 02 principle: "Where existing types conflict, introduce canonical
 * types and adapters rather than mass-breaking changes." These functions
 * let Phase 04+ start writing/reading canonical shapes for the
 * Lead→Customer/Site→Project→Quote→Contract→Payment vertical slice
 * without requiring every one of the 189 existing screens to be rewritten
 * in this phase.
 *
 * They are pure, side-effect-free, and safe to call from either legacy
 * `DbManager`-backed code or new repository code.
 */

import type { Lead, Deal, Payment as LegacyPayment } from '../types';
import type {
  Customer,
  Site,
  Project,
  ProjectStage,
  Payment,
  PaymentSchedule,
} from './entities';
import { asId, type CustomerId, type SiteId, type ProjectId, type LeadId, type UserId, type PaymentScheduleId } from './ids';

/** Deterministic, collision-safe derived IDs — a real migration (Phase 04)
 * would instead mint IDs at write time and store the mapping, but for
 * read-time adaptation of already-seeded legacy data, deriving from the
 * legacy ID keeps the graph stable and idempotent across calls. */
const deriveId = (prefix: string, legacyId: string) => `${prefix}_${legacyId}`;

export function leadToCustomer(lead: Lead): Customer {
  const now = lead.updatedAt || lead.createdAt;
  return {
    id: asId<CustomerId>(deriveId('cust', lead.id)),
    name: lead.contactInfo?.name || 'Unknown Customer',
    phone: lead.contactInfo?.phone || '',
    email: lead.contactInfo?.email || undefined,
    companyName: lead.contactInfo?.companyName || undefined,
    sourceLeadId: asId<LeadId>(lead.id),
    createdAt: lead.createdAt,
    updatedAt: now,
  };
}

export function leadToSite(lead: Lead, customerId: CustomerId): Site {
  const now = lead.updatedAt || lead.createdAt;
  return {
    id: asId<SiteId>(deriveId('site', lead.id)),
    customerId,
    address: lead.buildingInfo?.address || '',
    latitude: lead.buildingInfo?.latitude,
    longitude: lead.buildingInfo?.longitude,
    buildingType: lead.buildingInfo?.type,
    floors: lead.buildingInfo?.floors,
    createdAt: lead.createdAt,
    updatedAt: now,
  };
}

const LEAD_STAGE_TO_PROJECT_STAGE: Record<Lead['stage'], ProjectStage> = {
  captured: 'lead',
  assigned: 'lead',
  contacted: 'lead',
  survey_done: 'customer_site_confirmed',
  quoted: 'quoting',
  negotiating: 'negotiation',
  closed_won: 'contract',
  closed_lost: 'closed_lost',
};

/**
 * Builds the Project spine record from a Lead + (optional) Deal.
 * A Lead that has not yet closed still gets a Project (stage reflects
 * that), matching the pack's target lifecycle where Lead is the entry
 * point into a single traceable spine rather than a dead end.
 */
export function leadAndDealToProject(
  lead: Lead,
  deal: Deal | undefined,
  customerId: CustomerId,
  siteId: SiteId,
  ownerUserId: UserId,
): Project {
  const stage: ProjectStage = deal
    ? deal.status === 'closed'
      ? 'payment'
      : deal.status === 'cancelled'
        ? 'closed_lost'
        : 'contract'
    : LEAD_STAGE_TO_PROJECT_STAGE[lead.stage];

  return {
    id: asId<ProjectId>(deriveId('proj', lead.id)),
    customerId,
    siteId,
    sourceLeadId: asId<LeadId>(lead.id),
    stage,
    ownerUserId,
    title: `${lead.contactInfo?.name || 'Project'} — ${lead.buildingInfo?.address || lead.id}`,
    createdAt: lead.createdAt,
    updatedAt: deal?.createdAt && deal.createdAt > lead.updatedAt ? deal.createdAt : lead.updatedAt,
    displaySummary: {
      customerName: lead.contactInfo?.name || 'Unknown',
      siteAddress: lead.buildingInfo?.address || '',
    },
  };
}

/** Legacy `Payment.dealId` → canonical `Payment.projectId`, preserving the
 * legacy record's own id so audit/history stays traceable both ways. */
export function legacyPaymentToCanonical(
  legacy: LegacyPayment,
  projectId: ProjectId,
  paymentScheduleId: PaymentScheduleId,
  createdBy: UserId,
): Payment {
  return {
    id: asId(deriveId('pay', legacy.id)),
    projectId,
    paymentScheduleId,
    installmentLabel: legacy.stage,
    amount: legacy.amount,
    path: 'direct',
    status:
      legacy.status === 'paid'
        ? 'confirmed'
        : legacy.status === 'disputed'
          ? 'failed'
          : 'initiated',
    // Legacy demo data predates idempotency keys; derive a stable one so
    // re-running this adapter never produces a duplicate-looking attempt.
    idempotencyKey: `legacy:${legacy.id}`,
    method: legacy.paymentMethod === 'Gateway' ? 'Gateway' : legacy.paymentMethod,
    referenceNo: legacy.referenceNo,
    confirmedAt: legacy.paidAt,
    createdAt: legacy.dueDate,
    createdBy,
  };
}

export function projectToDefaultPaymentSchedule(
  project: Project,
  contractId: import('./ids').ContractId,
  legacyPayments: LegacyPayment[],
): PaymentSchedule {
  const total = legacyPayments.reduce((sum, p) => sum + p.amount, 0) || 1;
  return {
    id: asId(deriveId('sched', project.id)),
    projectId: project.id,
    contractId,
    status: legacyPayments.every(p => p.status === 'paid') ? 'completed' : 'active',
    installments: legacyPayments.map(p => ({
      label: p.stage,
      percentOfTotal: Math.round((p.amount / total) * 100),
      amount: p.amount,
      dueDate: p.dueDate,
    })),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}
