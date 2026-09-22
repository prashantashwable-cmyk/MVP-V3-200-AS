import type { WorkflowDefinition } from '../types';

/**
 * Installation workflow — exact stages from Phase 03:
 *   Assigned -> Job Brief -> Site Readiness -> Check-in -> Safety -> SOP ->
 *   Material Usage -> Evidence -> Completion -> QC Request
 *
 * Phase 09 requires: "Enforce that installation execution cannot be
 * marked complete without required check-in/readiness requirements" —
 * modelled here by making every step strictly sequential with no
 * skip-ahead transition into `completion`.
 */
export type InstallationState =
  | 'assigned'
  | 'job_brief'
  | 'site_readiness'
  | 'checked_in'
  | 'safety_confirmed'
  | 'sop_execution'
  | 'material_usage_logged'
  | 'evidence_captured'
  | 'completion'
  | 'qc_requested'
  | 'blocked_site_not_ready';

export const installationWorkflow: WorkflowDefinition<InstallationState> = {
  key: 'installation',
  label: 'Installation — Assigned to QC Request',
  initialState: 'assigned',
  states: [
    { key: 'assigned', label: 'Assigned' },
    { key: 'job_brief', label: 'Job Brief' },
    { key: 'site_readiness', label: 'Site Readiness' },
    { key: 'checked_in', label: 'Check-in' },
    { key: 'safety_confirmed', label: 'Safety' },
    { key: 'sop_execution', label: 'SOP Execution' },
    { key: 'material_usage_logged', label: 'Material Usage' },
    { key: 'evidence_captured', label: 'Evidence' },
    { key: 'completion', label: 'Completion' },
    { key: 'qc_requested', label: 'QC Request', isTerminal: true },
    { key: 'blocked_site_not_ready', label: 'Blocked — Site Not Ready', isFailureTerminal: false },
  ],
  transitions: [
    { from: 'assigned', to: 'job_brief', allowedRoles: ['technician'], event: 'JOB_BRIEF_VIEWED' },
    { from: 'job_brief', to: 'site_readiness', allowedRoles: ['technician'], event: 'SITE_READINESS_CHECK_STARTED' },
    { from: 'site_readiness', to: 'checked_in', allowedRoles: ['technician'], event: 'INSTALLATION_STARTED', entryCondition: 'siteReadinessConfirmed === true — hard gate, Phase 09' },
    { from: 'checked_in', to: 'safety_confirmed', allowedRoles: ['technician'], event: 'SAFETY_CONFIRMED' },
    { from: 'safety_confirmed', to: 'sop_execution', allowedRoles: ['technician'], event: 'SOP_STARTED' },
    { from: 'sop_execution', to: 'material_usage_logged', allowedRoles: ['technician'], event: 'MATERIAL_USAGE_LOGGED' },
    { from: 'material_usage_logged', to: 'evidence_captured', allowedRoles: ['technician'], event: 'EVIDENCE_CAPTURED' },
    { from: 'evidence_captured', to: 'completion', allowedRoles: ['technician'], event: 'INSTALLATION_COMPLETED', entryCondition: 'all SOP steps + evidence present — hard gate, Phase 09' },
    { from: 'completion', to: 'qc_requested', allowedRoles: ['technician', 'system'], event: 'QC_REQUESTED' },
    // Exception/loop path: site not ready blocks and returns to readiness re-check.
    { from: 'site_readiness', to: 'blocked_site_not_ready', allowedRoles: ['technician'], event: 'SITE_NOT_READY', isException: true },
    { from: 'blocked_site_not_ready', to: 'site_readiness', allowedRoles: ['technician', 'admin'], event: 'SITE_READINESS_RECHECKED', isException: true },
  ],
};
