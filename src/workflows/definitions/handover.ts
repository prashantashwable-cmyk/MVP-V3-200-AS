import type { WorkflowDefinition } from '../types';

/**
 * Handover workflow — exact stages from Phase 03:
 *   QC Pass -> Compliance -> Final Checklist -> Customer Walkthrough ->
 *   Customer Acceptance -> Handover Certificate -> Warranty/AMC
 *
 * Phase 09 hard requirement: "A failed QC cannot accidentally reach
 * handover" / "customer acceptance is recorded before final handover
 * completion." The initial state itself is named `qc_pass_confirmed` and
 * every transition into this workflow's states must be gated on
 * `Handover.qcPassed === true` (src/domain/entities.ts) at the call site
 * — there is deliberately no transition here that can be reached without
 * that precondition.
 */
export type HandoverState =
  | 'qc_pass_confirmed'
  | 'compliance'
  | 'final_checklist'
  | 'customer_walkthrough'
  | 'customer_acceptance'
  | 'certificate_issued'
  | 'warranty_amc_active';

export const handoverWorkflow: WorkflowDefinition<HandoverState> = {
  key: 'handover',
  label: 'Handover — QC Pass to Warranty/AMC',
  initialState: 'qc_pass_confirmed',
  states: [
    { key: 'qc_pass_confirmed', label: 'QC Pass' },
    { key: 'compliance', label: 'Compliance' },
    { key: 'final_checklist', label: 'Final Checklist' },
    { key: 'customer_walkthrough', label: 'Customer Walkthrough' },
    { key: 'customer_acceptance', label: 'Customer Acceptance' },
    { key: 'certificate_issued', label: 'Handover Certificate' },
    { key: 'warranty_amc_active', label: 'Warranty/AMC', isTerminal: true },
  ],
  transitions: [
    { from: 'qc_pass_confirmed', to: 'compliance', allowedRoles: ['admin'], event: 'COMPLIANCE_CHECK_STARTED', entryCondition: 'qcPassed === true (hard gate)' },
    { from: 'compliance', to: 'final_checklist', allowedRoles: ['admin'], event: 'COMPLIANCE_CONFIRMED' },
    { from: 'final_checklist', to: 'customer_walkthrough', allowedRoles: ['admin', 'technician'], event: 'FINAL_CHECKLIST_COMPLETED' },
    { from: 'customer_walkthrough', to: 'customer_acceptance', allowedRoles: ['customer'], event: 'CUSTOMER_WALKTHROUGH_COMPLETED' },
    { from: 'customer_acceptance', to: 'certificate_issued', allowedRoles: ['admin', 'system'], event: 'HANDOVER_COMPLETED', entryCondition: 'customer acceptance recorded (Handover.customerAcceptedAt set) before certificate issuance' },
    { from: 'certificate_issued', to: 'warranty_amc_active', allowedRoles: ['system'], event: 'WARRANTY_STARTED' },
  ],
};
