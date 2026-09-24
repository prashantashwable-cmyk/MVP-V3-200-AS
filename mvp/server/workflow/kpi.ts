/**
 * Automation KPIs (prompt §28–§30), computed only from the immutable
 * event log and current work items. Nothing here is hand-entered.
 *
 * Definition (stated once, used everywhere):
 *   A "workflow transition" is any event of kind `transition` (a state
 *   or work-status change) or `routing` (create/assign/remind/escalate/
 *   reassign). It is AUTOMATIC when no Admin performed it: the system
 *   did it, or the assigned owner did their own task through the engine.
 *   It is MANUAL when an Admin performed it.
 *
 *   Automation rate = automatic transitions / all transitions × 100
 *
 *   An ADMIN INTERVENTION is an Admin action that resolved something the
 *   machine could not (assign, extend, approve a flag, offline payment,
 *   complete a lead). Each carries a cause, which drives the improvement loop.
 */
import type { Engine, ExceptionCause } from './engine';
import { checkInvariants } from './gaps';

interface EventRow {
  id: string; project_id: string | null; work_item_id: string | null; at: number; actor_type: 'SYSTEM' | 'USER' | 'ADMIN';
  action: string; kind: string; intervention: number; intervention_cause: string | null; detail: string;
}

export const RECOMMENDATIONS: Record<ExceptionCause, { label: string; automation: string }> = {
  TECHNICIAN_NO_RESPONSE: { label: 'Technician did not accept task', automation: 'Shorten technician acceptance SLA and allow one more automatic reassignment before Admin' },
  TECHNICIAN_OVERDUE: { label: 'Technician missed deadline', automation: 'Add mid-task progress check-ins and reassign overdue field work earlier' },
  CUSTOMER_NO_RESPONSE: { label: 'Customer did not respond', automation: 'Add automated WhatsApp/voice reminders to customers before Admin escalation' },
  SUPPLIER_DELAY: { label: 'Supplier dispatch delay', automation: 'Onboard a backup supplier and enforce a supplier dispatch SLA' },
  EVIDENCE_REVIEW: { label: 'Evidence needed human review', automation: 'Improve on-device evidence pre-check so out-of-tolerance values are caught before submission' },
  PAYMENT_BLOCKED: { label: 'Payment reconciliation', automation: 'Offer UPI/NEFT/EMI alternatives automatically after the first failed payment' },
  NO_ELIGIBLE_OWNER: { label: 'Nobody eligible to assign', automation: 'Grow the partner pool in this area or allow cross-area assignment' },
  INCOMPLETE_LEAD: { label: 'Incomplete lead data', automation: 'Enforce GPS, floors and phone at lead capture' },
  MANUAL_REASSIGNMENT: { label: 'Admin overrode automatic assignment', automation: 'Encode the Admin’s assignment preference as a rule' },
  OTHER: { label: 'Other', automation: 'Classify these interventions to find the missing rule' },
};

function weekStart(ms: number): string {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export function computeKpis(engine: Engine, sinceMs = 0) {
  const now = engine.now();
  const events = engine.db.prepare('SELECT * FROM events WHERE at >= ? ORDER BY seq').all(sinceMs) as unknown as EventRow[];
  const projects = engine.projects();

  const transitions = events.filter(e => e.kind === 'transition' || e.kind === 'routing');
  const manual = transitions.filter(e => e.actor_type === 'ADMIN');
  const system = transitions.filter(e => e.actor_type === 'SYSTEM');
  const interventions = events.filter(e => e.intervention === 1);

  const items = engine.db.prepare('SELECT * FROM work_items').all() as any[];
  const open = items.filter(w => !['COMPLETED', 'CANCELLED'].includes(w.status));
  const completed = items.filter(w => w.status === 'COMPLETED' && w.completed_at);

  const firstEscalation = new Map<string, number>();
  for (const e of events.filter(e => e.action === 'ESCALATED' && e.work_item_id)) {
    if (!firstEscalation.has(e.work_item_id!)) firstEscalation.set(e.work_item_id!, e.at);
  }
  const escalationTimes = [...firstEscalation.entries()].map(([id, at]) => {
    const w = items.find(x => x.id === id);
    return w ? at - w.created_at : 0;
  });

  const reassigned = events.filter(e => e.action === 'REASSIGNED');
  const adminAssigns = events.filter(e => e.action === 'ADMIN_OVERRIDE' && e.detail.startsWith('Admin assigned'));
  const validations = events.filter(e => ['EVIDENCE_PASSED', 'EVIDENCE_REJECTED', 'EVIDENCE_FLAGGED'].includes(e.action));
  const rejections = events.filter(e => e.action === 'EVIDENCE_REJECTED');

  // Weekly Admin interventions per project (the most important KPI).
  const weeks = new Map<string, { interventions: number; projects: Set<string> }>();
  for (const p of projects) {
    const k = weekStart(p.created_at);
    if (!weeks.has(k)) weeks.set(k, { interventions: 0, projects: new Set() });
    weeks.get(k)!.projects.add(p.id);
  }
  for (const e of interventions) {
    const k = weekStart(e.at);
    if (!weeks.has(k)) weeks.set(k, { interventions: 0, projects: new Set() });
    weeks.get(k)!.interventions++;
    if (e.project_id) weeks.get(k)!.projects.add(e.project_id);
  }
  const weekly = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, v]) => ({
    week, interventions: v.interventions, projects: v.projects.size,
    perProject: v.projects.size ? Math.round((v.interventions / v.projects.size) * 10) / 10 : 0,
  }));

  const byCause = new Map<string, number>();
  for (const e of interventions) byCause.set(e.intervention_cause ?? 'OTHER', (byCause.get(e.intervention_cause ?? 'OTHER') ?? 0) + 1);
  const causes = [...byCause.entries()].sort((a, b) => b[1] - a[1]).map(([cause, count]) => ({
    cause, count, label: RECOMMENDATIONS[cause as ExceptionCause]?.label ?? cause,
    recommendation: RECOMMENDATIONS[cause as ExceptionCause]?.automation ?? RECOMMENDATIONS.OTHER.automation,
  }));

  const perProject = new Map<string, number>();
  for (const e of interventions) if (e.project_id) perProject.set(e.project_id, (perProject.get(e.project_id) ?? 0) + 1);

  return {
    automationRate: pct(transitions.length - manual.length, transitions.length),
    transitions: { total: transitions.length, automatic: transitions.length - manual.length, systemDriven: system.length, manual: manual.length },
    adminInterventions: interventions.length,
    adminInterventionsPerProject: projects.length ? Math.round((interventions.length / projects.length) * 100) / 100 : 0,
    interventionsByProject: Object.fromEntries(perProject),
    weekly,
    orphanWorkItems: checkInvariants(engine).length,
    overdueWorkItems: open.filter(w => w.due_at != null && w.due_at < now && w.status !== 'FLAGGED').length,
    avgTaskCompletionMins: Math.round(avg(completed.map(w => w.completed_at - w.created_at)) / 60000),
    avgEscalationMins: Math.round(avg(escalationTimes) / 60000),
    reassignments: { total: reassigned.length + adminAssigns.length, automatic: reassigned.filter(e => e.actor_type === 'SYSTEM').length },
    automaticReassignmentRate: pct(reassigned.filter(e => e.actor_type === 'SYSTEM').length, reassigned.length + adminAssigns.length),
    evidenceValidations: validations.length,
    evidenceRejectionRate: pct(rejections.length, validations.length),
    paymentFailures: events.filter(e => e.action === 'PAYMENT_FAILED').length,
    paymentBlocks: open.filter(w => w.exception_cause === 'PAYMENT_BLOCKED').length,
    workflowFailures: events.filter(e => e.action === 'NO_RULE_FOR_STATE' || e.action === 'NO_SUCCESS_TRANSITION').length,
    manualOverrides: events.filter(e => e.action === 'ADMIN_OVERRIDE').length,
    improvement: { interventions: interventions.length, causes },
  };
}
