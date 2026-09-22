import type { WorkflowDefinition } from '../types';

/**
 * QC workflow — exact stages from Phase 03:
 *   Assigned -> Inspection -> Pass OR Snag -> Rework -> Re-inspection ->
 *   Pass -> Compliance -> Handover
 *
 * Phase 09: "Do not hard-wire every defect to one QC discipline" — the
 * `QCInspection.discipline` field (mechanical/electrical/safety/general,
 * see src/domain/entities.ts) carries that distinction; the workflow
 * itself is discipline-agnostic so it does not need one state machine per
 * discipline. Phase 09 also requires re-inspection to be a genuinely
 * controlled loop, not a fixed number of retries — modelled by the
 * `snag -> rework -> reinspection -> snag` cycle staying legal indefinitely.
 */
export type QCState =
  | 'assigned'
  | 'inspection'
  | 'passed'
  | 'snag_raised'
  | 'rework'
  | 'reinspection'
  | 'compliance'
  | 'handover_ready';

export const qcWorkflow: WorkflowDefinition<QCState> = {
  key: 'qc',
  label: 'QC — Assigned to Handover-ready',
  initialState: 'assigned',
  states: [
    { key: 'assigned', label: 'Assigned' },
    { key: 'inspection', label: 'Inspection' },
    { key: 'passed', label: 'Pass' },
    { key: 'snag_raised', label: 'Snag' },
    { key: 'rework', label: 'Rework' },
    { key: 'reinspection', label: 'Re-inspection' },
    { key: 'compliance', label: 'Compliance' },
    { key: 'handover_ready', label: 'Handover', isTerminal: true },
  ],
  transitions: [
    { from: 'assigned', to: 'inspection', allowedRoles: ['technician'], event: 'QC_INSPECTION_STARTED' },
    { from: 'inspection', to: 'passed', allowedRoles: ['technician'], event: 'QC_PASSED' },
    { from: 'inspection', to: 'snag_raised', allowedRoles: ['technician'], event: 'QC_FAILED', isException: true },
    { from: 'snag_raised', to: 'rework', allowedRoles: ['admin', 'technician'], event: 'REWORK_ASSIGNED' },
    { from: 'rework', to: 'reinspection', allowedRoles: ['technician'], event: 'REWORK_COMPLETED' },
    { from: 'reinspection', to: 'passed', allowedRoles: ['technician'], event: 'QC_PASSED' },
    // Controlled loop: re-inspection can fail again and re-enter rework
    // indefinitely — never silently promoted to pass after N attempts.
    { from: 'reinspection', to: 'snag_raised', allowedRoles: ['technician'], event: 'QC_FAILED', isException: true },
    { from: 'passed', to: 'compliance', allowedRoles: ['admin', 'technician'], event: 'COMPLIANCE_CHECK_STARTED' },
    { from: 'compliance', to: 'handover_ready', allowedRoles: ['admin'], event: 'QC_PASSED', entryCondition: 'compliance checklist complete; this is the sole gate Handover reads (Phase 09)' },
  ],
};
