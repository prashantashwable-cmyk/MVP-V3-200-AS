/**
 * Workflow Gap Detector (prompt §8, §27).
 *
 * Two halves:
 *  1. STATIC: reads the rule catalog (the same object the engine executes)
 *     and scores every work type against 15 automation-readiness checks.
 *  2. RUNTIME: checks the live invariant "every active project has ONE
 *     current state + ONE next action + ONE owner + ONE deadline + ONE
 *     completion condition". A violation is an AUTOMATION EXCEPTION.
 */
import type { TaskTypeDef, WorkflowGroup } from './catalog';
import { CATALOG } from './catalog';
import { lifecycleProblems, projectLifecycle, TERMINAL_STATES, TRANSIENT_NEXT } from './lifecycle';
import type { ProjectState } from './lifecycle';
import type { Engine } from './engine';

export const GAP_CHECKS = [
  'Trigger', 'Owner', 'Next action', 'SLA', 'Completion condition', 'Evidence requirement',
  'Evidence validation', 'Success transition', 'Failure transition', 'Retry policy',
  'Escalation policy', 'Reassignment policy', 'Notification', 'Audit trail', 'Recovery path',
] as const;
export type GapCheck = typeof GAP_CHECKS[number];
export type GapStatus = 'ok' | 'partial' | 'missing' | 'na';

export interface TaskReadiness {
  type: string;
  label: string;
  group: WorkflowGroup | string;
  checks: { check: GapCheck; status: GapStatus; detail: string }[];
  ok: number;
  partial: number;
  applicable: number;
  pct: number;
}

export function analyzeTaskType(def: Partial<TaskTypeDef> & { type: string }): TaskReadiness {
  const checks: TaskReadiness['checks'] = [];
  const add = (check: GapCheck, status: GapStatus, detail: string) => checks.push({ check, status, detail });

  add('Trigger', def.trigger ? 'ok' : 'missing', def.trigger ? `Created on entering ${def.trigger}` : 'Nothing creates this work');
  add('Owner', def.ownerRole && def.assignment ? 'ok' : def.ownerRole ? 'partial' : 'missing',
    def.ownerRole ? `${def.ownerRole}${def.assignment ? ` via ${def.assignment}` : ' — no assignment strategy'}` : 'No owner role');
  add('Next action', def.nextAction ? 'ok' : 'missing', def.nextAction ?? 'Owner is not told what to do');

  if (!def.sla?.completeMins) add('SLA', 'missing', 'No deadline — work can wait forever');
  else if (def.requiresAcceptance && !def.sla.acceptMins) add('SLA', 'partial', 'Completion SLA only; no acceptance deadline');
  else add('SLA', 'ok', `${def.sla.acceptMins ? `accept ≤ ${def.sla.acceptMins / 60}h, ` : ''}complete ≤ ${def.sla.completeMins / 60}h`);

  add('Completion condition', def.completion ? 'ok' : 'missing', def.completion ?? 'No definition of done');

  const ev = def.evidence;
  const evKeys = ev ? Object.keys(ev).filter(k => (ev as any)[k] !== undefined) : [];
  add('Evidence requirement', evKeys.length ? 'ok' : 'missing', evKeys.length ? evKeys.join(', ') : 'Completion cannot be proven');

  if (!def.validation) add('Evidence validation', 'missing', 'Nothing checks the proof');
  else if (def.validation === 'admin') add('Evidence validation', 'partial', 'Validated by a human (Admin)');
  else add('Evidence validation', 'ok', def.validation === 'rules' ? 'Rule-based validator (CV slot: MVP MOCK)' : def.validation);

  add('Success transition', def.onSuccess ? 'ok' : 'missing', def.onSuccess ? `→ ${def.onSuccess.projectState}` : 'Nothing happens after completion');
  add('Failure transition', def.onFailure ? 'ok' : 'missing', def.onFailure?.description ?? 'Undefined behaviour on failure');
  add('Retry policy', def.retry ? 'ok' : 'missing', def.retry ? `${def.retry.maxEvidenceRetries} retries` : 'No retry limit');

  const ladders = [...(def.acceptLadder ?? []), ...(def.completeLadder ?? [])];
  const escalates = def.completeLadder?.some(s => s.action === 'ESCALATE' || s.action === 'ADMIN_REQUIRED');
  if (!escalates) add('Escalation policy', 'missing', 'Silent failure: nobody is told when this is late');
  else if (def.requiresAcceptance && !def.acceptLadder?.length) add('Escalation policy', 'partial', 'No escalation if never accepted');
  else add('Escalation policy', 'ok', ladders.map(s => `${s.action}@${Math.round(s.atPct * 100)}%`).join(' → '));

  const r = def.reassignment;
  if (!r) add('Reassignment policy', 'missing', 'Stuck with one owner forever');
  else if ('notApplicable' in r) add('Reassignment policy', 'na', r.notApplicable);
  else if (!ladders.some(s => s.action === 'REASSIGN')) add('Reassignment policy', 'partial', `Up to ${r.maxReassignments}, but no timeout triggers it`);
  else add('Reassignment policy', 'ok', `Automatic, up to ${r.maxReassignments} times`);

  add('Notification', def.notify ? 'ok' : 'missing', def.notify ? 'In-app (SMS/WhatsApp: MVP MOCK, not sent)' : 'Owner never hears about it');
  add('Audit trail', def.audit ? 'ok' : 'missing', def.audit ? 'Immutable event log' : 'No audit');

  if (!def.recovery) add('Recovery path', 'missing', 'No recovery when all else fails');
  else add('Recovery path', def.recovery.automatic ? 'ok' : 'partial',
    `${def.recovery.path}${def.offlineCapable ? ' · offline evidence sync' : ''}${def.recovery.automatic ? '' : ' (ends with a human)'}`);

  const applicable = checks.filter(c => c.status !== 'na').length;
  const ok = checks.filter(c => c.status === 'ok').length;
  const partial = checks.filter(c => c.status === 'partial').length;
  return {
    type: def.type, label: def.label ?? def.type, group: def.group ?? 'Unknown', checks, ok, partial, applicable,
    pct: applicable ? Math.round(((ok + partial * 0.5) / applicable) * 1000) / 10 : 0,
  };
}

/** States that must have a work rule: every non-terminal state the engine does not pass through automatically. */
export function statesNeedingRules(): ProjectState[] {
  return projectLifecycle.states
    .map(s => s.key)
    .filter(s => !TERMINAL_STATES.has(s) && !(s in TRANSIENT_NEXT) && s !== 'QUALIFIED');
}

export function analyzeCatalog(catalog: Record<string, Partial<TaskTypeDef> & { type: string }> = CATALOG) {
  const tasks = Object.values(catalog).map(analyzeTaskType);
  const groups = new Map<string, TaskReadiness[]>();
  for (const t of tasks) groups.set(String(t.group), [...(groups.get(String(t.group)) ?? []), t]);
  const byGroup = [...groups.entries()].map(([group, ts]) => ({
    group,
    pct: Math.round((ts.reduce((a, t) => a + t.pct, 0) / ts.length) * 10) / 10,
    tasks: ts.map(t => t.type),
  }));
  const overall = tasks.length ? Math.round((tasks.reduce((a, t) => a + t.pct, 0) / tasks.length) * 10) / 10 : 0;

  const topGaps = tasks
    .flatMap(t => t.checks.filter(c => c.status === 'missing' || c.status === 'partial').map(c => ({ task: t.label, type: t.type, ...c })))
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'missing' ? -1 : 1));

  const stateProblems: string[] = [...lifecycleProblems()];
  for (const s of statesNeedingRules()) {
    if (!Object.values(catalog).some(d => d.trigger === s)) stateProblems.push(`State ${s} has no work rule — projects entering it would be orphaned`);
  }
  return { overall, byGroup, tasks, topGaps, stateProblems };
}

export interface InvariantViolation { projectId: string; state: string; missing: string[]; detail: string }

/** Runtime: every active project needs one state, next action, owner, deadline and completion condition. */
export function checkInvariants(engine: Engine): InvariantViolation[] {
  const out: InvariantViolation[] = [];
  for (const p of engine.projects()) {
    if (TERMINAL_STATES.has(p.state)) continue;
    const w = engine.currentItem(p.id);
    const missing: string[] = [];
    if (!w) {
      missing.push('work item', 'next action', 'owner', 'deadline', 'completion condition');
    } else {
      const def = engine.catalog[w.type];
      if (!def) missing.push('workflow rule');
      if (!def?.nextAction) missing.push('next action');
      const ownerOk = !!w.assigned_user_id || w.admin_required === 1; // Admin-owned exception is still owned
      if (!ownerOk) missing.push('owner');
      if (w.due_at == null && w.accept_by == null && w.status !== 'FLAGGED' && w.status !== 'UNASSIGNED') missing.push('deadline');
      if (!def?.completion) missing.push('completion condition');
      const open = engine.itemsForProject(p.id).filter(x => ['UNASSIGNED', 'ASSIGNED', 'OPEN', 'ACCEPTED', 'IN_PROGRESS', 'REJECTED', 'FLAGGED'].includes(x.status));
      if (open.length > 1) missing.push(`single current step (found ${open.length} open items)`);
    }
    if (missing.length) {
      out.push({ projectId: p.id, state: p.state, missing, detail: `AUTOMATION EXCEPTION — ${p.id} in ${p.state} has no ${missing.join(', ')}` });
    }
  }
  return out;
}
