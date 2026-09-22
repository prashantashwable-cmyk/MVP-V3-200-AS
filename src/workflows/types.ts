/**
 * Reusable workflow state-machine primitives — Phase 03.
 *
 * A `WorkflowDefinition<State>` is data, not code: every concrete
 * workflow in `src/workflows/definitions/*.ts` is a plain object built
 * from these types. Screens and (from Phase 07 onward) the event bus
 * read transitions from here instead of encoding "what happens next"
 * locally, per the Phase 03 mission ("no screen should need to invent
 * its own next-step logic").
 */

import type { CanonicalUserRole } from '../domain/entities';

export type WorkflowRole = CanonicalUserRole | 'system';

/** A single allowed move from one state to another (or a set of others). */
export interface WorkflowTransition<State extends string> {
  from: State;
  to: State;
  /** Roles allowed to perform this transition. 'system' = automation/event-bus only (Phase 07). */
  allowedRoles: WorkflowRole[];
  /** The canonical event (Phase 07 vocabulary) that performing this transition emits or requires. */
  event: string;
  /** Human-readable guard description; enforced in code where the transition is wired (Phase 08/09). */
  entryCondition?: string;
  /** True if this transition represents an exception/loop path rather than the happy path. */
  isException?: boolean;
}

export interface WorkflowStateDef<State extends string> {
  key: State;
  label: string;
  /** True for terminal/success states (e.g. closed_won, certificate_issued). */
  isTerminal?: boolean;
  /** True for terminal/failure or parked states (e.g. closed_lost). */
  isFailureTerminal?: boolean;
}

export interface WorkflowDefinition<State extends string> {
  key: string; // e.g. 'sales', 'quote', 'payment', 'procurement', 'installation', 'qc', 'handover'
  label: string;
  states: WorkflowStateDef<State>[];
  transitions: WorkflowTransition<State>[];
  initialState: State;
}

/** Look up every transition allowed out of a state, optionally filtered by role. */
export function transitionsFrom<State extends string>(
  def: WorkflowDefinition<State>,
  state: State,
  role?: WorkflowRole,
): WorkflowTransition<State>[] {
  return def.transitions.filter(
    t => t.from === state && (role === undefined || t.allowedRoles.includes(role)),
  );
}

/** Whether `role` may move `def` from `from` to `to` at all (happy path or exception). */
export function canTransition<State extends string>(
  def: WorkflowDefinition<State>,
  from: State,
  to: State,
  role: WorkflowRole,
): boolean {
  return def.transitions.some(t => t.from === from && t.to === to && t.allowedRoles.includes(role));
}

/** All exception/loop transitions defined for a workflow (for the Phase 09 "controlled loops" rule). */
export function exceptionTransitions<State extends string>(
  def: WorkflowDefinition<State>,
): WorkflowTransition<State>[] {
  return def.transitions.filter(t => t.isException);
}

export function validateWorkflowDefinition<State extends string>(def: WorkflowDefinition<State>): string[] {
  const problems: string[] = [];
  const stateKeys = new Set(def.states.map(s => s.key));
  if (!stateKeys.has(def.initialState)) {
    problems.push(`${def.key}: initialState "${def.initialState}" is not in states[]`);
  }
  for (const t of def.transitions) {
    if (!stateKeys.has(t.from)) problems.push(`${def.key}: transition.from "${t.from}" unknown`);
    if (!stateKeys.has(t.to)) problems.push(`${def.key}: transition.to "${t.to}" unknown`);
    if (t.allowedRoles.length === 0) problems.push(`${def.key}: transition ${t.from}->${t.to} has no allowedRoles`);
  }
  // Every non-terminal state should have at least one outgoing transition,
  // or it's a dead end a project could get permanently stuck in.
  for (const s of def.states) {
    if (s.isTerminal || s.isFailureTerminal) continue;
    const hasOut = def.transitions.some(t => t.from === s.key);
    if (!hasOut) problems.push(`${def.key}: state "${s.key}" is a non-terminal dead end (no outgoing transitions)`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Screen registry
// ---------------------------------------------------------------------------

export type ScreenKind =
  | 'workflow_step'
  | 'supporting_tool'
  | 'configuration'
  | 'dashboard_control'
  | 'report'
  | 'exception_handling'
  | 'document_detail';

export type Surface = 'WORK' | 'CUSTOMERS' | 'OPERATIONS' | 'FINANCE' | 'CONTROL';

export interface ScreenDefinition {
  screenId: string; // component file basename, e.g. 'DealTermsFinalization'
  file: string; // relative path from repo root
  surface: Surface;
  kind: ScreenKind;
  /** Workflow key from src/workflows/definitions, or undefined for non-workflow-step screens. */
  workflow?: string;
  /** Workflow state key this screen represents, if kind === 'workflow_step'. */
  stage?: string;
  roles: WorkflowRole[];
  purpose: string;
  entryCondition?: string;
  primaryAction?: string;
  completionEvent?: string;
  nextStages?: string[];
  exceptionStages?: string[];
  dataSource: string; // carried over from Phase 01 inventory
}
