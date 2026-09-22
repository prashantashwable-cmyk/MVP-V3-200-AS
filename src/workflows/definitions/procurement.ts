import type { WorkflowDefinition } from '../types';

/**
 * Procurement workflow — exact stages from Phase 03:
 *   Need -> Supplier -> RFQ/Price -> PO -> Approval -> Supplier
 *   Acceptance -> Production -> Dispatch -> Delivery -> Receipt ->
 *   Reconciliation/Payable
 */
export type ProcurementState =
  | 'need_identified'
  | 'supplier_selected'
  | 'rfq_priced'
  | 'po_drafted'
  | 'po_approval'
  | 'supplier_acceptance'
  | 'production'
  | 'dispatch'
  | 'delivery'
  | 'receipt'
  | 'reconciliation_payable'
  | 'po_rejected'
  | 'incident';

export const procurementWorkflow: WorkflowDefinition<ProcurementState> = {
  key: 'procurement',
  label: 'Procurement — Need to Payable',
  initialState: 'need_identified',
  states: [
    { key: 'need_identified', label: 'Need' },
    { key: 'supplier_selected', label: 'Supplier' },
    { key: 'rfq_priced', label: 'RFQ/Price' },
    { key: 'po_drafted', label: 'PO' },
    { key: 'po_approval', label: 'Approval' },
    { key: 'supplier_acceptance', label: 'Supplier Acceptance' },
    { key: 'production', label: 'Production' },
    { key: 'dispatch', label: 'Dispatch' },
    { key: 'delivery', label: 'Delivery' },
    { key: 'receipt', label: 'Receipt' },
    { key: 'reconciliation_payable', label: 'Reconciliation/Payable', isTerminal: true },
    { key: 'po_rejected', label: 'PO Rejected', isFailureTerminal: true },
    { key: 'incident', label: 'Incident (damaged/missing)' },
  ],
  transitions: [
    { from: 'need_identified', to: 'supplier_selected', allowedRoles: ['admin'], event: 'SUPPLIER_SELECTED' },
    { from: 'supplier_selected', to: 'rfq_priced', allowedRoles: ['admin', 'supplier'], event: 'RFQ_PRICED' },
    { from: 'rfq_priced', to: 'po_drafted', allowedRoles: ['admin'], event: 'PO_CREATED', entryCondition: 'idempotencyKey required (Phase 06)' },
    { from: 'po_drafted', to: 'po_approval', allowedRoles: ['admin'], event: 'PO_SUBMITTED_FOR_APPROVAL' },
    { from: 'po_approval', to: 'supplier_acceptance', allowedRoles: ['admin'], event: 'PO_APPROVED', entryCondition: 'po.approve permission' },
    { from: 'po_approval', to: 'po_rejected', allowedRoles: ['admin'], event: 'PO_REJECTED', isException: true },
    { from: 'supplier_acceptance', to: 'production', allowedRoles: ['supplier'], event: 'PO_ACCEPTED_BY_SUPPLIER' },
    { from: 'production', to: 'dispatch', allowedRoles: ['supplier'], event: 'MATERIAL_DISPATCHED' },
    { from: 'dispatch', to: 'delivery', allowedRoles: ['supplier', 'system'], event: 'SHIPMENT_ARRIVED' },
    { from: 'delivery', to: 'receipt', allowedRoles: ['technician', 'admin'], event: 'MATERIAL_RECEIVED' },
    { from: 'receipt', to: 'reconciliation_payable', allowedRoles: ['admin'], event: 'PAYABLE_RECONCILED' },
    // Exception path: damaged/missing goes to Incident -> Supplier Resolution, per Phase 09.
    { from: 'receipt', to: 'incident', allowedRoles: ['technician', 'admin'], event: 'DAMAGED_OR_MISSING_REPORTED', isException: true },
    { from: 'incident', to: 'supplier_selected', allowedRoles: ['admin'], event: 'SUPPLIER_RESOLUTION_REQUESTED', isException: true },
    { from: 'incident', to: 'receipt', allowedRoles: ['admin'], event: 'SUPPLIER_RESOLUTION_ACCEPTED', isException: true },
  ],
};
