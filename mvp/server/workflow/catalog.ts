/**
 * Work-item type catalog — the workflow RULES, as data.
 *
 * Every piece of work the system can create is declared here, with its
 * trigger, owner, SLA, evidence, validation, success/failure transitions,
 * retry, escalation ladder, reassignment policy, notification and
 * recovery path. The engine interprets these declarations; the gap
 * detector (`gaps.ts`) reads the SAME declarations. So the automation-
 * readiness score in the Control Tower reflects what the engine actually
 * does, not a hand-maintained checklist.
 */
import type { ProjectState } from './lifecycle';

export type Role = 'admin' | 'technician' | 'customer' | 'supplier';

export type TaskType =
  | 'QUALIFY_LEAD'
  | 'CUSTOMER_QUOTE_DECISION'
  | 'TOKEN_PAYMENT'
  | 'TECHNICAL_CLEARANCE'
  | 'SUPPLIER_DISPATCH'
  | 'MATERIAL_RECEIPT'
  | 'MATERIAL_PAYMENT'
  | 'INSTALLATION'
  | 'QC_INSPECTION'
  | 'REWORK'
  | 'HANDOVER_ACCEPTANCE'
  | 'FINAL_PAYMENT';

export type AssignmentStrategy =
  | 'project_customer'
  | 'nearest_least_loaded_technician'
  | 'project_installer'
  | 'qc_technician_not_installer'
  | 'least_loaded_supplier'
  | 'admin';

export type CompletionKind = 'evidence' | 'decision' | 'payment' | 'admin_resolution';

/** A step on the escalation ladder, at `atPct` of the phase window
 * (accept window or completion window). 1.0 = the deadline itself. */
export type LadderAction = 'REMIND' | 'ESCALATE' | 'REASSIGN' | 'ADMIN_REQUIRED';
export interface LadderStep { atPct: number; action: LadderAction }

export interface EvidenceSpec {
  gps?: { maxDistanceM: number };
  photos?: { min: number; hint: string };
  measurements?: { key: string; label: string; min: number; max: number; unit: string }[];
  checklist?: string[];
  signature?: boolean;
  fields?: { key: string; label: string }[];
  /** Evidence older than this (relative to submission) is stale. */
  maxAgeMinutes?: number;
  /** Payment tasks: completion proof is the gateway confirmation. */
  gatewayReceipt?: boolean;
  /** Decision tasks: the proof is the authenticated decision record. */
  authenticatedDecision?: boolean;
}

export type FailureAction = 'retry_same_owner' | 'rework' | 'close_lost' | 'payment_retry';

export type WorkflowGroup =
  | 'Lead generation' | 'Sales' | 'Payments' | 'Technical clearance'
  | 'Dispatch' | 'Installation' | 'QC' | 'Handover';

export interface TaskTypeDef {
  type: TaskType;
  label: string;
  group: WorkflowGroup;
  /** Project state whose entry creates this work item. */
  trigger?: ProjectState;
  ownerRole?: Role;
  assignment?: AssignmentStrategy;
  /** Human-facing instruction: what the owner must do. */
  nextAction?: string;
  requiresAcceptance: boolean;
  sla?: { acceptMins?: number; completeMins: number };
  completion?: CompletionKind;
  evidence?: EvidenceSpec;
  /** How submitted proof is checked. */
  validation?: 'rules' | 'gateway' | 'decision' | 'admin';
  onSuccess?: { projectState: ProjectState };
  onFailure?: { action: FailureAction; projectState?: ProjectState; description: string };
  retry?: { maxEvidenceRetries: number };
  acceptLadder?: LadderStep[];
  completeLadder?: LadderStep[];
  /** 'not_applicable' must carry a reason (e.g. a customer can't be swapped). */
  reassignment?: { maxReassignments: number } | { notApplicable: string };
  notify?: boolean;
  audit?: boolean;
  /** What brings the work back on track if everything above fails. */
  recovery?: { path: string; automatic: boolean };
  /** Field tasks: evidence survives offline and syncs later. */
  offlineCapable?: boolean;
  /** INR the owner earns when the work passes validation (technicians). */
  earning?: number;
  /** Which payment milestone this task collects. */
  paymentMilestone?: 'TOKEN' | 'MATERIAL' | 'FINAL';
}

const FIELD_ACCEPT: LadderStep[] = [
  { atPct: 0.5, action: 'REMIND' },
  { atPct: 1.0, action: 'ESCALATE' },
  { atPct: 1.5, action: 'REASSIGN' },
];
const FIELD_COMPLETE: LadderStep[] = [
  { atPct: 0.75, action: 'REMIND' },
  { atPct: 1.0, action: 'ESCALATE' },
  { atPct: 1.5, action: 'REASSIGN' },
];
const CUSTOMER_LADDER: LadderStep[] = [
  { atPct: 0.5, action: 'REMIND' },
  { atPct: 1.0, action: 'ESCALATE' },
  { atPct: 1.5, action: 'ADMIN_REQUIRED' },
];

const H = 60;

export const CATALOG: Record<TaskType, TaskTypeDef> = {
  QUALIFY_LEAD: {
    type: 'QUALIFY_LEAD', label: 'Complete lead details', group: 'Lead generation',
    trigger: 'LEAD', ownerRole: 'admin', assignment: 'admin',
    nextAction: 'Fill in the missing lead details so the system can qualify and quote automatically',
    requiresAcceptance: false, sla: { completeMins: 8 * H }, completion: 'admin_resolution',
    evidence: { fields: [{ key: 'missing', label: 'Missing lead fields' }] }, validation: 'admin',
    onSuccess: { projectState: 'QUALIFIED' },
    onFailure: { action: 'close_lost', projectState: 'CLOSED_LOST', description: 'Unqualifiable lead is closed as lost' },
    retry: { maxEvidenceRetries: 0 },
    completeLadder: [{ atPct: 0.5, action: 'REMIND' }, { atPct: 1.0, action: 'ESCALATE' }],
    reassignment: { notApplicable: 'Admin-owned by design — only Admin can complete missing lead data' },
    notify: true, audit: true,
    recovery: { path: 'Admin completes the lead; the system then qualifies and quotes automatically', automatic: false },
  },

  CUSTOMER_QUOTE_DECISION: {
    type: 'CUSTOMER_QUOTE_DECISION', label: 'Review & accept quotation', group: 'Sales',
    trigger: 'QUOTE_SENT', ownerRole: 'customer', assignment: 'project_customer',
    nextAction: 'Review the quotation and accept or decline it',
    requiresAcceptance: false, sla: { completeMins: 48 * H }, completion: 'decision',
    evidence: { authenticatedDecision: true }, validation: 'decision',
    onSuccess: { projectState: 'TOKEN_REQUIRED' },
    onFailure: { action: 'close_lost', projectState: 'CLOSED_LOST', description: 'Declined quote closes the project as lost' },
    retry: { maxEvidenceRetries: 0 },
    completeLadder: CUSTOMER_LADDER,
    reassignment: { notApplicable: 'The customer is the only person who can accept their own quote' },
    notify: true, audit: true,
    recovery: { path: 'Reminder → escalation → Admin calls the customer', automatic: false },
  },

  TOKEN_PAYMENT: {
    type: 'TOKEN_PAYMENT', label: 'Pay ₹10,000 booking token', group: 'Payments',
    trigger: 'TOKEN_REQUIRED', ownerRole: 'customer', assignment: 'project_customer',
    nextAction: 'Pay the booking token to lock your order',
    requiresAcceptance: false, sla: { completeMins: 24 * H }, completion: 'payment',
    evidence: { gatewayReceipt: true }, validation: 'gateway',
    onSuccess: { projectState: 'TOKEN_PAID' },
    onFailure: { action: 'payment_retry', description: 'Workflow halts at TOKEN_REQUIRED; customer retries; 3 failures escalate' },
    retry: { maxEvidenceRetries: 3 },
    completeLadder: CUSTOMER_LADDER,
    reassignment: { notApplicable: 'Only the contracted customer can pay' },
    notify: true, audit: true, paymentMilestone: 'TOKEN',
    recovery: { path: 'Retry payment; after 3 failures Admin records an offline (NEFT/cheque) payment', automatic: false },
  },

  TECHNICAL_CLEARANCE: {
    type: 'TECHNICAL_CLEARANCE', label: 'Technical clearance site visit', group: 'Technical clearance',
    trigger: 'TECHNICAL_CLEARANCE', ownerRole: 'technician', assignment: 'nearest_least_loaded_technician',
    nextAction: 'Visit the site, check in with GPS, inspect the shaft, photograph it, record measurements, and submit',
    requiresAcceptance: true, sla: { acceptMins: 2 * H, completeMins: 24 * H }, completion: 'evidence',
    evidence: {
      gps: { maxDistanceM: 500 },
      photos: { min: 2, hint: 'Shaft from pit and from top landing' },
      measurements: [
        { key: 'shaftWidth', label: 'Shaft width', min: 1100, max: 3000, unit: 'mm' },
        { key: 'shaftDepth', label: 'Shaft depth', min: 1100, max: 3000, unit: 'mm' },
        { key: 'pitDepth', label: 'Pit depth', min: 1000, max: 2500, unit: 'mm' },
        { key: 'overhead', label: 'Overhead clearance', min: 3400, max: 6000, unit: 'mm' },
      ],
      checklist: ['Shaft walls plumb', 'Pit dry and clean', 'Machine room / top access available', 'Power supply point available'],
      maxAgeMinutes: 24 * H,
    },
    validation: 'rules',
    onSuccess: { projectState: 'CLEARANCE_APPROVED' },
    onFailure: { action: 'retry_same_owner', description: 'Evidence rejected → technician resubmits; after 2 rejections → reassigned' },
    retry: { maxEvidenceRetries: 2 },
    acceptLadder: FIELD_ACCEPT, completeLadder: FIELD_COMPLETE,
    reassignment: { maxReassignments: 3 },
    notify: true, audit: true, offlineCapable: true, earning: 1500,
    recovery: { path: 'Auto-reassign to next nearest technician; Admin only if nobody is eligible', automatic: true },
  },

  SUPPLIER_DISPATCH: {
    type: 'SUPPLIER_DISPATCH', label: 'Prepare & dispatch lift material', group: 'Dispatch',
    trigger: 'MATERIAL_DISPATCH', ownerRole: 'supplier', assignment: 'least_loaded_supplier',
    nextAction: 'Accept the order, prepare the kit, dispatch it and upload loading proof with the LR number',
    requiresAcceptance: true, sla: { acceptMins: 4 * H, completeMins: 72 * H }, completion: 'evidence',
    evidence: {
      photos: { min: 1, hint: 'Loaded vehicle with material visible' },
      fields: [{ key: 'lrNumber', label: 'Lorry receipt (LR) number' }, { key: 'vehicleNumber', label: 'Vehicle number' }],
      checklist: ['All BOM items packed', 'Packages labelled with project ID', 'Invoice attached'],
      maxAgeMinutes: 72 * H,
    },
    validation: 'rules',
    onSuccess: { projectState: 'MATERIAL_DISPATCHED' },
    onFailure: { action: 'retry_same_owner', description: 'Dispatch proof rejected → supplier resubmits; after 2 → reassigned' },
    retry: { maxEvidenceRetries: 2 },
    acceptLadder: FIELD_ACCEPT, completeLadder: FIELD_COMPLETE,
    reassignment: { maxReassignments: 2 },
    notify: true, audit: true,
    recovery: { path: 'Auto-reassign to the next supplier; Admin only if no supplier is eligible', automatic: true },
  },

  MATERIAL_RECEIPT: {
    type: 'MATERIAL_RECEIPT', label: 'Verify material received at site', group: 'Dispatch',
    trigger: 'MATERIAL_DISPATCHED', ownerRole: 'technician', assignment: 'nearest_least_loaded_technician',
    nextAction: 'Meet the delivery at site, count packages against the BOM, photograph and confirm',
    requiresAcceptance: true, sla: { acceptMins: 4 * H, completeMins: 72 * H }, completion: 'evidence',
    evidence: {
      gps: { maxDistanceM: 500 },
      photos: { min: 1, hint: 'Material stacked at site' },
      checklist: ['Package count matches BOM', 'No visible damage', 'Material stored securely'],
      maxAgeMinutes: 24 * H,
    },
    validation: 'rules',
    onSuccess: { projectState: 'MATERIAL_RECEIVED' },
    onFailure: { action: 'retry_same_owner', description: 'Receipt evidence rejected → resubmit; after 2 → reassigned' },
    retry: { maxEvidenceRetries: 2 },
    acceptLadder: FIELD_ACCEPT, completeLadder: FIELD_COMPLETE,
    reassignment: { maxReassignments: 3 },
    notify: true, audit: true, offlineCapable: true, earning: 500,
    recovery: { path: 'Auto-reassign to next nearest technician', automatic: true },
  },

  MATERIAL_PAYMENT: {
    type: 'MATERIAL_PAYMENT', label: 'Pay material milestone (90%)', group: 'Payments',
    trigger: 'MATERIAL_PAYMENT_REQUIRED', ownerRole: 'customer', assignment: 'project_customer',
    nextAction: 'Material is at your site. Pay the 90% milestone so installation can start',
    requiresAcceptance: false, sla: { completeMins: 72 * H }, completion: 'payment',
    evidence: { gatewayReceipt: true }, validation: 'gateway',
    onSuccess: { projectState: 'MATERIAL_PAYMENT_RECEIVED' },
    onFailure: { action: 'payment_retry', description: 'Installation blocked until paid; 3 failures escalate' },
    retry: { maxEvidenceRetries: 3 },
    completeLadder: CUSTOMER_LADDER,
    reassignment: { notApplicable: 'Only the contracted customer can pay' },
    notify: true, audit: true, paymentMilestone: 'MATERIAL',
    recovery: { path: 'Retry payment; Admin records offline payment after 3 failures', automatic: false },
  },

  INSTALLATION: {
    type: 'INSTALLATION', label: 'Install lift per SOP', group: 'Installation',
    trigger: 'INSTALLATION', ownerRole: 'technician', assignment: 'project_installer',
    nextAction: 'Check in at site, execute every SOP step, photograph each, and submit',
    requiresAcceptance: true, sla: { acceptMins: 4 * H, completeMins: 14 * 24 * H }, completion: 'evidence',
    evidence: {
      gps: { maxDistanceM: 500 },
      photos: { min: 3, hint: 'Guide rails, machine/controller, car & landing doors' },
      checklist: ['Guide rails aligned & bracketed', 'Machine and controller mounted', 'Car assembled', 'Landing doors installed', 'Wiring & earthing complete', 'Safety gear tested'],
      maxAgeMinutes: 24 * H,
    },
    validation: 'rules',
    onSuccess: { projectState: 'QC' },
    onFailure: { action: 'retry_same_owner', description: 'SOP evidence rejected → resubmit; after 2 → reassigned' },
    retry: { maxEvidenceRetries: 2 },
    acceptLadder: FIELD_ACCEPT, completeLadder: FIELD_COMPLETE,
    reassignment: { maxReassignments: 2 },
    notify: true, audit: true, offlineCapable: true, earning: 12000,
    recovery: { path: 'Auto-reassign to another technician', automatic: true },
  },

  QC_INSPECTION: {
    type: 'QC_INSPECTION', label: 'Surprise QC inspection', group: 'QC',
    trigger: 'QC', ownerRole: 'technician', assignment: 'qc_technician_not_installer',
    nextAction: 'Inspect the installation, run 10 trial runs, record PASS or FAIL with photos',
    requiresAcceptance: true, sla: { acceptMins: 4 * H, completeMins: 48 * H }, completion: 'evidence',
    evidence: {
      gps: { maxDistanceM: 500 },
      photos: { min: 2, hint: 'Car interior & controller panel' },
      fields: [{ key: 'trialRuns', label: 'Trial runs completed (≥10)' }, { key: 'qcResult', label: 'Result (pass/fail)' }],
      checklist: ['Levelling accuracy within ±5mm', 'Door operation smooth', 'Emergency alarm works', 'Overload device works'],
      maxAgeMinutes: 24 * H,
    },
    validation: 'rules',
    onSuccess: { projectState: 'QC_PASSED' },
    onFailure: { action: 'rework', projectState: 'REWORK', description: 'QC FAIL → rework task to installer → fresh QC' },
    retry: { maxEvidenceRetries: 2 },
    acceptLadder: FIELD_ACCEPT, completeLadder: FIELD_COMPLETE,
    reassignment: { maxReassignments: 2 },
    notify: true, audit: true, offlineCapable: true, earning: 1500,
    recovery: { path: 'Auto-reassign to another QC-eligible technician (never the installer)', automatic: true },
  },

  REWORK: {
    type: 'REWORK', label: 'Fix QC snags', group: 'QC',
    trigger: 'REWORK', ownerRole: 'technician', assignment: 'project_installer',
    nextAction: 'Fix every snag QC reported, photograph the fixes, and submit for re-inspection',
    requiresAcceptance: true, sla: { acceptMins: 4 * H, completeMins: 72 * H }, completion: 'evidence',
    evidence: {
      gps: { maxDistanceM: 500 },
      photos: { min: 1, hint: 'Each snag after fixing' },
      checklist: ['All reported snags fixed'],
      maxAgeMinutes: 24 * H,
    },
    validation: 'rules',
    onSuccess: { projectState: 'QC' },
    onFailure: { action: 'retry_same_owner', description: 'Rework evidence rejected → resubmit; after 2 → reassigned' },
    retry: { maxEvidenceRetries: 2 },
    acceptLadder: FIELD_ACCEPT, completeLadder: FIELD_COMPLETE,
    reassignment: { maxReassignments: 2 },
    notify: true, audit: true, offlineCapable: true, earning: 0,
    recovery: { path: 'Auto-reassign to another technician', automatic: true },
  },

  HANDOVER_ACCEPTANCE: {
    type: 'HANDOVER_ACCEPTANCE', label: 'Accept lift handover', group: 'Handover',
    trigger: 'HANDOVER', ownerRole: 'customer', assignment: 'project_customer',
    nextAction: 'Watch the trial runs, rate the work and sign the handover',
    requiresAcceptance: false, sla: { completeMins: 72 * H }, completion: 'evidence',
    evidence: {
      signature: true,
      fields: [{ key: 'rating', label: 'Rating (1-5)' }],
      checklist: ['Trial runs witnessed', 'Operating instructions received', 'Keys & documents received'],
    },
    validation: 'rules',
    onSuccess: { projectState: 'FINAL_PAYMENT_REQUIRED' },
    onFailure: { action: 'retry_same_owner', description: 'Incomplete handover sign-off must be redone' },
    retry: { maxEvidenceRetries: 3 },
    completeLadder: CUSTOMER_LADDER,
    reassignment: { notApplicable: 'Only the customer can accept their own lift' },
    notify: true, audit: true,
    recovery: { path: 'Reminder → escalation → Admin calls the customer', automatic: false },
  },

  FINAL_PAYMENT: {
    type: 'FINAL_PAYMENT', label: 'Pay final 10%', group: 'Payments',
    trigger: 'FINAL_PAYMENT_REQUIRED', ownerRole: 'customer', assignment: 'project_customer',
    nextAction: 'Your lift is handed over. Pay the final 10% to close the project',
    requiresAcceptance: false, sla: { completeMins: 7 * 24 * H }, completion: 'payment',
    evidence: { gatewayReceipt: true }, validation: 'gateway',
    onSuccess: { projectState: 'FINAL_PAYMENT_RECEIVED' },
    onFailure: { action: 'payment_retry', description: 'Project stays open until paid; 3 failures escalate' },
    retry: { maxEvidenceRetries: 3 },
    completeLadder: CUSTOMER_LADDER,
    reassignment: { notApplicable: 'Only the contracted customer can pay' },
    notify: true, audit: true, paymentMilestone: 'FINAL',
    recovery: { path: 'Retry payment; Admin records offline payment after 3 failures', automatic: false },
  },
};

export function taskForState(state: ProjectState, catalog: Record<string, TaskTypeDef> = CATALOG): TaskTypeDef | undefined {
  return Object.values(catalog).find(d => d.trigger === state);
}
