/**
 * Control Tower — Phase 12.
 *
 * "Build a role-aware intervention dashboard focused on: Critical, At
 * Risk, Waiting, On Track... Its job is: What requires human attention
 * now? Each item should lead directly to the resolution context/action."
 *
 * This queries REAL data across every collection earlier phases
 * actually write to — dead-lettered automation (Phase 07),
 * reconciliation exceptions (Phase 11), failed payments, blocked
 * handovers (Phase 09), unsigned contracts (Phase 08), open snags — not
 * a chart gallery over synthetic numbers. On a fresh/empty store this
 * correctly returns zero items; the acceptance check seeds real records
 * through the same repository/service functions earlier phases use and
 * confirms the tower surfaces exactly the ones that should count as
 * exceptions.
 */

import { getRepository } from '../repository';
import type { RepositoryContext } from '../repository/types';
import {
  paymentRepository, contractRepository, handoverRepository, snagRepository,
  purchaseOrderRepository,
} from '../repository/entities';
import type { WorkflowExecution, ReconciliationRecord } from '../domain/entities';

export type ControlTowerCategory = 'critical' | 'at_risk' | 'waiting' | 'on_track';

export interface ControlTowerItem {
  id: string;
  category: ControlTowerCategory;
  kind: string;
  projectId?: string;
  title: string;
  detail: string;
  /** A real, navigable tab id (src/App.tsx's getTabsByRole vocabulary,
   * Phase 10) — clicking through leads directly to the resolution
   * screen, per the pack's explicit requirement, rather than a dead
   * link or a generic dashboard. */
  actionTabId: string;
  createdAt: string;
}

const CATEGORY_RANK: Record<ControlTowerCategory, number> = { critical: 0, at_risk: 1, waiting: 2, on_track: 3 };

export async function getControlTowerItems(ctx: RepositoryContext): Promise<ControlTowerItem[]> {
  const items: ControlTowerItem[] = [];

  // Automation failed (Phase 07 dead letters) -> Critical.
  const executions = await getRepository<WorkflowExecution>('workflow_executions', ctx).list();
  for (const e of executions.filter(x => x.status === 'dead_letter')) {
    items.push({
      id: `ct_automation_${e.id}`, category: 'critical', kind: 'automation_failed',
      title: `Automation failed: ${e.stepKey}`, detail: e.error ?? 'Handler exhausted retries.',
      actionTabId: 'AutomationHealth', createdAt: e.executedAt,
    });
  }

  // Payment failed -> Critical.
  const payments = await paymentRepository(ctx).list();
  for (const p of payments.filter(x => x.status === 'failed')) {
    items.push({
      id: `ct_payment_${p.id}`, category: 'critical', kind: 'payment_failed', projectId: p.projectId,
      title: `Payment failed: ${p.installmentLabel}`, detail: `Amount ₹${p.amount.toLocaleString('en-IN')}`,
      actionTabId: 'RefundDisputeManagement', createdAt: p.createdAt,
    });
  }

  // Reconciliation exceptions (Phase 11) -> At Risk.
  const reconRecords = await getRepository<ReconciliationRecord>('reconciliation_records', ctx).list();
  for (const r of reconRecords.filter(x => x.status === 'pending' || x.status === 'manual_resolution')) {
    items.push({
      id: `ct_recon_${r.id}`, category: 'at_risk', kind: 'reconciliation_exception',
      title: `Reconciliation exception (${r.domain})`, detail: `Internal: ${r.internalRecordId ?? '—'} / External: ${r.externalRecordId ?? '—'}`,
      actionTabId: 'AutoReconciliation', createdAt: r.reconciledAt,
    });
  }

  // Open snags (QC failed, rework outstanding) -> At Risk.
  const snags = await snagRepository(ctx).list();
  for (const s of snags.filter(x => x.status === 'assigned' || x.status === 'reinspection_pending')) {
    items.push({
      id: `ct_snag_${s.id}`, category: 'at_risk', kind: 'qc_rework_outstanding', projectId: s.projectId,
      title: 'QC rework outstanding', detail: s.description,
      // 'AlertsExceptions' is a confirmed-real admin tab id (Phase 10's
      // transcribed fixture); there is no dedicated snag-list tab in the
      // current navigation, so this routes to the closest real
      // resolution surface rather than a guessed, possibly-nonexistent id.
      actionTabId: 'AlertsExceptions', createdAt: '',
    });
  }

  // Handover blocked on QC -> Waiting (customer waiting).
  const handovers = await handoverRepository(ctx).list();
  for (const h of handovers.filter(x => x.status === 'blocked_qc_not_passed')) {
    items.push({
      id: `ct_handover_${h.id}`, category: 'waiting', kind: 'customer_waiting_handover', projectId: h.projectId,
      title: 'Customer waiting — handover blocked on QC', detail: 'QC has not passed for this project yet.',
      actionTabId: 'AlertsExceptions', createdAt: '',
    });
  }

  // Contract unsigned -> Waiting.
  const contracts = await contractRepository(ctx).list();
  for (const c of contracts.filter(x => x.status === 'draft' || x.status === 'sent_for_signature')) {
    items.push({
      id: `ct_contract_${c.id}`, category: 'waiting', kind: 'contract_unsigned', projectId: c.projectId,
      title: 'Contract awaiting signature', detail: `Status: ${c.status}`,
      actionTabId: 'QuoteDigitalContract', createdAt: c.createdAt,
    });
  }

  // Supplier overdue / delivery delayed -> Waiting (PO sent, not yet accepted/dispatched).
  const pos = await purchaseOrderRepository(ctx).list();
  for (const po of pos.filter(x => x.status === 'sent_to_supplier' || x.status === 'pending_approval')) {
    items.push({
      id: `ct_po_${po.id}`, category: 'waiting', kind: po.status === 'pending_approval' ? 'po_approval_pending' : 'supplier_acceptance_pending',
      projectId: po.projectId, title: po.status === 'pending_approval' ? 'PO awaiting approval' : 'Awaiting supplier acceptance',
      detail: `Amount ₹${po.amount.toLocaleString('en-IN')}`, actionTabId: 'PurchaseOrderGenerator', createdAt: po.createdAt,
    });
  }

  return items.sort((a, b) => CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] || (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export function summarizeByCategory(items: ControlTowerItem[]): Record<ControlTowerCategory, number> {
  const summary: Record<ControlTowerCategory, number> = { critical: 0, at_risk: 0, waiting: 0, on_track: 0 };
  for (const i of items) summary[i.category]++;
  return summary;
}
