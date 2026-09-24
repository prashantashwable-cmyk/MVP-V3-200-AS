/**
 * Project lifecycle state machine for the MVP.
 *
 * Expressed with V3's own `WorkflowDefinition` primitives
 * (`src/workflows/types.ts`) — the same data-not-code shape and the same
 * `validateWorkflowDefinition` dead-end check V3 already uses — rather than
 * a second, parallel state-machine format.
 *
 * States in UPPER_CASE match the milestone vocabulary of prompt §12.
 * "Transient" states are passed through automatically by a SYSTEM step
 * (e.g. TOKEN_PAID → TECHNICAL_CLEARANCE), so the audit trail records
 * each milestone while no human has to push the project onward.
 */
import type { WorkflowDefinition } from '../../../src/workflows/types';
import { canTransition, validateWorkflowDefinition } from '../../../src/workflows/types';

export type ProjectState =
  | 'LEAD'
  | 'QUALIFIED'
  | 'QUOTE_SENT'
  | 'TOKEN_REQUIRED'
  | 'TOKEN_PAID'
  | 'TECHNICAL_CLEARANCE'
  | 'CLEARANCE_APPROVED'
  | 'MATERIAL_DISPATCH'
  | 'MATERIAL_DISPATCHED'
  | 'MATERIAL_RECEIVED'
  | 'MATERIAL_PAYMENT_REQUIRED'
  | 'MATERIAL_PAYMENT_RECEIVED'
  | 'INSTALLATION'
  | 'QC'
  | 'REWORK'
  | 'QC_PASSED'
  | 'HANDOVER'
  | 'FINAL_PAYMENT_REQUIRED'
  | 'FINAL_PAYMENT_RECEIVED'
  | 'COMPLETED'
  | 'CLOSED_LOST';

/** Ordered happy path — used for progress bars and "next milestone". */
export const HAPPY_PATH: ProjectState[] = [
  'LEAD', 'QUALIFIED', 'QUOTE_SENT', 'TOKEN_REQUIRED', 'TOKEN_PAID', 'TECHNICAL_CLEARANCE',
  'CLEARANCE_APPROVED', 'MATERIAL_DISPATCH', 'MATERIAL_DISPATCHED', 'MATERIAL_RECEIVED',
  'MATERIAL_PAYMENT_REQUIRED', 'MATERIAL_PAYMENT_RECEIVED', 'INSTALLATION', 'QC', 'QC_PASSED',
  'HANDOVER', 'FINAL_PAYMENT_REQUIRED', 'FINAL_PAYMENT_RECEIVED', 'COMPLETED',
];

export const STATE_LABEL: Record<ProjectState, string> = {
  LEAD: 'Lead',
  QUALIFIED: 'Qualified',
  QUOTE_SENT: 'Quote sent',
  TOKEN_REQUIRED: 'Token payment due',
  TOKEN_PAID: 'Token paid',
  TECHNICAL_CLEARANCE: 'Technical clearance',
  CLEARANCE_APPROVED: 'Clearance approved',
  MATERIAL_DISPATCH: 'Material dispatch',
  MATERIAL_DISPATCHED: 'Material in transit',
  MATERIAL_RECEIVED: 'Material received',
  MATERIAL_PAYMENT_REQUIRED: 'Material payment due (90%)',
  MATERIAL_PAYMENT_RECEIVED: 'Material payment received',
  INSTALLATION: 'Installation',
  QC: 'Quality check',
  REWORK: 'Rework',
  QC_PASSED: 'QC passed',
  HANDOVER: 'Handover',
  FINAL_PAYMENT_REQUIRED: 'Final payment due (10%)',
  FINAL_PAYMENT_RECEIVED: 'Final payment received',
  COMPLETED: 'Completed',
  CLOSED_LOST: 'Closed — lost',
};

/** Momentary states: the engine advances out of these immediately as SYSTEM. */
export const TRANSIENT_NEXT: Partial<Record<ProjectState, ProjectState>> = {
  TOKEN_PAID: 'TECHNICAL_CLEARANCE',
  CLEARANCE_APPROVED: 'MATERIAL_DISPATCH',
  MATERIAL_RECEIVED: 'MATERIAL_PAYMENT_REQUIRED',
  MATERIAL_PAYMENT_RECEIVED: 'INSTALLATION',
  QC_PASSED: 'HANDOVER',
  FINAL_PAYMENT_RECEIVED: 'COMPLETED',
};

export const TERMINAL_STATES: ReadonlySet<ProjectState> = new Set(['COMPLETED', 'CLOSED_LOST']);

// V3's WorkflowDefinition speaks V3 role names; 'system' = automation only.
export const projectLifecycle: WorkflowDefinition<ProjectState> = {
  key: 'mvp_project',
  label: 'AIEC MVP — Lead to Final Payment',
  initialState: 'LEAD',
  states: [
    ...HAPPY_PATH.map(key => ({ key, label: STATE_LABEL[key], isTerminal: key === 'COMPLETED' })),
    { key: 'REWORK', label: STATE_LABEL.REWORK },
    { key: 'CLOSED_LOST', label: STATE_LABEL.CLOSED_LOST, isFailureTerminal: true },
  ],
  transitions: [
    { from: 'LEAD', to: 'QUALIFIED', allowedRoles: ['system', 'admin'], event: 'LEAD_QUALIFIED', entryCondition: 'address, GPS, floors, phone present' },
    { from: 'QUALIFIED', to: 'QUOTE_SENT', allowedRoles: ['system'], event: 'QUOTE_SENT', entryCondition: 'quote ≥ 20% margin floor' },
    { from: 'QUOTE_SENT', to: 'TOKEN_REQUIRED', allowedRoles: ['customer'], event: 'QUOTE_ACCEPTED' },
    { from: 'QUOTE_SENT', to: 'CLOSED_LOST', allowedRoles: ['customer', 'admin'], event: 'QUOTE_REJECTED', isException: true },
    { from: 'TOKEN_REQUIRED', to: 'TOKEN_PAID', allowedRoles: ['system'], event: 'PAYMENT_RECEIVED', entryCondition: 'gateway confirmed token' },
    { from: 'TOKEN_PAID', to: 'TECHNICAL_CLEARANCE', allowedRoles: ['system'], event: 'CLEARANCE_REQUESTED' },
    { from: 'TECHNICAL_CLEARANCE', to: 'CLEARANCE_APPROVED', allowedRoles: ['system', 'admin'], event: 'CLEARANCE_APPROVED', entryCondition: 'clearance evidence PASS (or Admin approves a FLAG)' },
    { from: 'CLEARANCE_APPROVED', to: 'MATERIAL_DISPATCH', allowedRoles: ['system'], event: 'PO_CREATED' },
    { from: 'MATERIAL_DISPATCH', to: 'MATERIAL_DISPATCHED', allowedRoles: ['system'], event: 'MATERIAL_DISPATCHED', entryCondition: 'dispatch proof PASS' },
    { from: 'MATERIAL_DISPATCHED', to: 'MATERIAL_RECEIVED', allowedRoles: ['system'], event: 'MATERIAL_RECEIVED', entryCondition: 'site receipt evidence PASS' },
    { from: 'MATERIAL_RECEIVED', to: 'MATERIAL_PAYMENT_REQUIRED', allowedRoles: ['system'], event: 'PAYMENT_DUE' },
    { from: 'MATERIAL_PAYMENT_REQUIRED', to: 'MATERIAL_PAYMENT_RECEIVED', allowedRoles: ['system'], event: 'PAYMENT_RECEIVED' },
    { from: 'MATERIAL_PAYMENT_RECEIVED', to: 'INSTALLATION', allowedRoles: ['system'], event: 'INSTALLATION_STARTED', entryCondition: 'material payment PAID — money gate' },
    { from: 'INSTALLATION', to: 'QC', allowedRoles: ['system'], event: 'INSTALLATION_COMPLETED', entryCondition: 'SOP evidence PASS' },
    { from: 'QC', to: 'QC_PASSED', allowedRoles: ['system'], event: 'QC_PASSED' },
    { from: 'QC', to: 'REWORK', allowedRoles: ['system'], event: 'QC_FAILED', isException: true },
    { from: 'REWORK', to: 'QC', allowedRoles: ['system'], event: 'REWORK_COMPLETED', isException: true },
    { from: 'QC_PASSED', to: 'HANDOVER', allowedRoles: ['system'], event: 'HANDOVER_READY', entryCondition: 'QC PASS — hard gate' },
    { from: 'HANDOVER', to: 'FINAL_PAYMENT_REQUIRED', allowedRoles: ['system'], event: 'HANDOVER_COMPLETED', entryCondition: 'customer signature + trial runs' },
    { from: 'FINAL_PAYMENT_REQUIRED', to: 'FINAL_PAYMENT_RECEIVED', allowedRoles: ['system'], event: 'PAYMENT_RECEIVED' },
    { from: 'FINAL_PAYMENT_RECEIVED', to: 'COMPLETED', allowedRoles: ['system'], event: 'PROJECT_COMPLETED' },
  ],
};

export function isLegalTransition(from: ProjectState, to: ProjectState): boolean {
  return canTransition(projectLifecycle, from, to, 'system')
    || canTransition(projectLifecycle, from, to, 'customer')
    || canTransition(projectLifecycle, from, to, 'admin');
}

export function lifecycleProblems(): string[] {
  return validateWorkflowDefinition(projectLifecycle);
}
