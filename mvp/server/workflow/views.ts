/**
 * Read models: what each role sees. Every function takes the VIEWER and
 * returns only what that viewer may see. Scoping happens here, on the
 * server, never by hiding things in the UI (prompt §20).
 */
import type { Engine, ProjectRow, UserRow, WorkItemRow } from './engine';
import { fmtDuration, fmtTime, OPEN_STATUSES, progressOf } from './engine';
import { HAPPY_PATH, STATE_LABEL, TERMINAL_STATES, TRANSIENT_NEXT } from './lifecycle';
import type { ProjectState } from './lifecycle';
import { checkInvariants } from './gaps';
import { milestoneAmounts, TOKEN_AMOUNT } from './money';
import type { LadderStep } from './catalog';

export type Health = 'on_track' | 'at_risk' | 'critical' | 'done';

const ACTION_TEXT: Record<LadderStep['action'], string> = {
  REMIND: 'Send reminder',
  ESCALATE: 'Escalate (notify owner + Admin)',
  REASSIGN: 'Reassign to next eligible person',
  ADMIN_REQUIRED: 'Hand to Admin',
};

function ownerName(e: Engine, w?: WorkItemRow): string {
  if (!w) return '—';
  if (!w.assigned_user_id) return 'ADMIN (unassigned)';
  return e.user(w.assigned_user_id)?.name ?? w.assigned_user_id;
}

function expectedAction(e: Engine, w: WorkItemRow): string {
  const def = e.def(w.type);
  switch (w.status) {
    case 'ASSIGNED': return `Accept “${def.label}”`;
    case 'REJECTED': return `Resubmit evidence (${w.failure_reason ?? 'rejected'})`;
    case 'FLAGGED': return 'Admin: review flagged evidence';
    case 'UNASSIGNED': return 'Admin: assign an owner';
    default: return def.nextAction ?? def.label;
  }
}

export function projectHealth(e: Engine, p: ProjectRow, violations = checkInvariants(e)): Health {
  if (TERMINAL_STATES.has(p.state)) return 'done';
  if (violations.some(v => v.projectId === p.id)) return 'critical';
  const w = e.currentItem(p.id);
  if (!w || w.admin_required || w.status === 'FLAGGED' || w.status === 'UNASSIGNED' || e.def(w.type).ownerRole === 'admin') return 'critical';
  const now = e.now();
  const overdue = (w.status === 'ASSIGNED' && w.accept_by != null && now > w.accept_by) || (w.due_at != null && now > w.due_at);
  if (w.escalation_level >= 1 || overdue || w.status === 'REJECTED' || (w.failure_reason && e.def(w.type).paymentMilestone)) return 'at_risk';
  return 'on_track';
}

/** "WHY IS THIS STUCK?" — prompt §17. */
export function whyStuck(e: Engine, projectId: string) {
  const p = e.project(projectId);
  const now = e.now();
  const w = e.currentItem(projectId);
  const violation = checkInvariants(e).find(v => v.projectId === projectId);
  if (!w) {
    return {
      projectId, title: p.title, state: p.state, stateLabel: STATE_LABEL[p.state], health: projectHealth(e, p),
      workItem: null, owner: null, expectedAction: TERMINAL_STATES.has(p.state) ? 'Nothing — project closed' : 'NONE — no work item exists',
      waiting: fmtDuration(now - p.state_entered_at), waitingMs: now - p.state_entered_at,
      lastSystemAction: null, nextAutomaticAction: null, escalationCondition: null, adminRequired: !TERMINAL_STATES.has(p.state),
      reason: violation?.detail ?? (TERMINAL_STATES.has(p.state) ? 'Project is closed' : 'No work item'),
      adminOptions: [] as string[],
    };
  }
  const def = e.def(w.type);
  const owner = w.assigned_user_id ? e.user(w.assigned_user_id) : undefined;
  const next = e.nextSystemAction(w);
  const lastSys = e.db.prepare("SELECT action, detail, at FROM events WHERE work_item_id = ? AND actor_type = 'SYSTEM' ORDER BY seq DESC LIMIT 1").get(w.id) as { action: string; detail: string; at: number } | undefined;
  const deadline = w.status === 'ASSIGNED' ? w.accept_by : w.due_at;
  const overdue = deadline != null && now > deadline;
  const pay = def.paymentMilestone ? e.payment(p.id, def.paymentMilestone) : undefined;

  let reason: string;
  if (w.status === 'UNASSIGNED') reason = `No eligible ${def.ownerRole} is available for ${def.label}`;
  else if (w.status === 'FLAGGED') reason = `Evidence needs a human decision: ${(w.validation ? JSON.parse(w.validation).reasons : []).join('; ')}`;
  else if (w.admin_required) reason = w.last_system_action ?? 'Automatic recovery exhausted';
  else if (pay?.status === 'FAILED') reason = `Payment failed: ${pay.failure_reason}. Waiting for ${owner?.name} to retry (${pay.attempts}/${def.retry?.maxEvidenceRetries ?? 3})`;
  else if (w.status === 'ASSIGNED') reason = `${owner?.name} has not accepted ${def.label}${overdue ? ' — acceptance deadline passed' : ''}`;
  else if (w.status === 'REJECTED') reason = `Evidence rejected (${w.retry_count}/${def.retry?.maxEvidenceRetries}); waiting for resubmission`;
  else if (overdue) reason = `${owner?.name} is ${fmtDuration(now - deadline!)} past the deadline`;
  else reason = `Normal progress — waiting for ${owner?.name} to ${def.label.toLowerCase()}`;

  const ladders = [
    def.acceptLadder?.length ? `Acceptance: ${def.acceptLadder.map(s => `${ACTION_TEXT[s.action].toLowerCase()} at ${Math.round(s.atPct * 100)}%`).join(', ')} of ${def.sla?.acceptMins! / 60}h` : '',
    def.completeLadder?.length ? `Completion: ${def.completeLadder.map(s => `${ACTION_TEXT[s.action].toLowerCase()} at ${Math.round(s.atPct * 100)}%`).join(', ')} of ${def.sla?.completeMins! / 60}h` : '',
    def.reassignment && 'maxReassignments' in def.reassignment ? `Max ${def.reassignment.maxReassignments} automatic reassignments, then Admin` : def.reassignment && 'notApplicable' in def.reassignment ? `No reassignment: ${def.reassignment.notApplicable}` : '',
  ].filter(Boolean).join('. ');

  const adminOptions: string[] = [];
  if (w.status === 'FLAGGED') adminOptions.push('approve_flag', 'reject_flag');
  if (def.ownerRole && def.ownerRole !== 'customer' && def.ownerRole !== 'admin' && w.status !== 'FLAGGED') adminOptions.push('assign');
  if (['ASSIGNED', 'OPEN', 'ACCEPTED', 'IN_PROGRESS', 'REJECTED'].includes(w.status)) adminOptions.push('extend');
  if (def.paymentMilestone && w.status === 'OPEN') adminOptions.push('offline_payment');
  if (w.type === 'QUALIFY_LEAD') adminOptions.push('complete_lead');

  const adminRequired = projectHealth(e, p) === 'critical';
  return {
    projectId, title: p.title, state: p.state, stateLabel: STATE_LABEL[p.state], health: projectHealth(e, p),
    workItem: { id: w.id, type: w.type, label: def.label, status: w.status, version: w.version, retryCount: w.retry_count, reassignCount: w.reassign_count },
    owner: owner ? { id: owner.id, name: owner.name, role: owner.role, phone: owner.phone } : null,
    expectedAction: expectedAction(e, w),
    deadline: deadline ? fmtTime(deadline) : null,
    overdue,
    waiting: fmtDuration(now - w.phase_started_at), waitingMs: now - w.phase_started_at,
    lastSystemAction: lastSys ? { text: lastSys.detail, at: fmtTime(lastSys.at), ago: fmtDuration(now - lastSys.at) } : null,
    nextAutomaticAction: next ? { action: next.action, text: ACTION_TEXT[next.action], at: fmtTime(next.at), in: fmtDuration(next.at - now), inMs: next.at - now } : null,
    escalationCondition: ladders,
    adminRequired,
    adminVerdict: adminRequired ? 'ADMIN ACTION REQUIRED' : 'No action required — the system is handling this',
    reason,
    violation: violation?.detail ?? null,
    adminOptions,
    candidates: adminOptions.includes('assign') ? e.users(def.ownerRole as any).filter(u => u.active).map(u => ({ id: u.id, name: u.name })) : [],
  };
}

export function controlTower(e: Engine) {
  const violations = checkInvariants(e);
  const projects = e.projects();
  const rows = projects.map(p => {
    const w = e.currentItem(p.id);
    const health = projectHealth(e, p, violations);
    const deadline = w ? (w.status === 'ASSIGNED' ? w.accept_by : w.due_at) : null;
    return {
      id: p.id, title: p.title, state: p.state, stateLabel: STATE_LABEL[p.state], progress: progressOf(p.state), health,
      current: w ? { id: w.id, label: e.def(w.type).label, status: w.status, owner: ownerName(e, w), expectedAction: expectedAction(e, w) } : null,
      deadline: deadline ? fmtTime(deadline) : null,
      deadlineIn: deadline ? fmtDuration(deadline - e.now()) : null,
      lastSystemAction: w?.last_system_action ?? null,
      next: w ? (() => { const n = e.nextSystemAction(w); return n ? `${ACTION_TEXT[n.action]} in ${fmtDuration(n.at - e.now())}` : null; })() : null,
    };
  });
  const active = rows.filter(r => r.health !== 'done');
  const exceptions = active.filter(r => r.health === 'critical' || r.health === 'at_risk')
    .sort((a, b) => (a.health === b.health ? 0 : a.health === 'critical' ? -1 : 1))
    .map(r => ({ ...r, why: whyStuck(e, r.id) }));
  return {
    now: fmtTime(e.now()),
    clockOffset: fmtDuration(e.clockOffsetMs()),
    counts: {
      projects: projects.length,
      active: active.length,
      autoRunning: active.filter(r => r.health === 'on_track').length,
      waitingForUser: active.filter(r => r.health === 'at_risk').length,
      exceptions: active.filter(r => r.health === 'critical').length,
      completed: projects.filter(p => p.state === 'COMPLETED').length,
      adminActionsRequired: active.filter(r => r.health === 'critical').length,
    },
    violations,
    exceptions,
    projects: rows,
  };
}

function evidenceSummary(e: Engine, w: WorkItemRow) {
  return e.evidenceFor(w.id).map(ev => ({
    id: ev.id, kind: ev.kind, label: ev.label, capturedAt: fmtTime(ev.captured_at),
    value: ev.kind === 'photo' || ev.kind === 'signature' ? undefined : ev.data,
    lat: ev.lat, lng: ev.lng,
  }));
}

function nextMilestone(state: ProjectState): string | null {
  if (TERMINAL_STATES.has(state)) return null;
  const from = state === 'REWORK' ? 'QC' : state;
  const i = HAPPY_PATH.indexOf(from);
  const next = HAPPY_PATH.slice(i + 1).find(s => !(s in TRANSIENT_NEXT) && s !== 'QUALIFIED');
  return next ? STATE_LABEL[next] : null;
}

/** "MY NEXT WORK" — one list, most urgent first, for any non-admin role. */
export function myWork(e: Engine, user: UserRow) {
  const now = e.now();
  const items = (e.db.prepare(`SELECT * FROM work_items WHERE assigned_user_id = ? AND status IN (${OPEN_STATUSES.map(s => `'${s}'`).join(',')})`).all(user.id) as unknown as WorkItemRow[])
    .sort((a, b) => ((a.status === 'ASSIGNED' ? a.accept_by : a.due_at) ?? Infinity) - ((b.status === 'ASSIGNED' ? b.accept_by : b.due_at) ?? Infinity));
  const work = items.map(w => {
    const def = e.def(w.type);
    const p = e.project(w.project_id);
    const customer = p.customer_id ? e.user(p.customer_id) : undefined;
    const pay = def.paymentMilestone ? e.payment(p.id, def.paymentMilestone) : undefined;
    const next = e.nextSystemAction(w);
    const deadline = w.status === 'ASSIGNED' ? w.accept_by : w.due_at;
    return {
      id: w.id, version: w.version, type: w.type, label: def.label, status: w.status, nextAction: expectedAction(e, w),
      requiresAcceptance: def.requiresAcceptance, completion: def.completion,
      deadline: deadline ? fmtTime(deadline) : null, deadlineIn: deadline ? fmtDuration(deadline - now) : null, overdue: deadline != null && now > deadline,
      project: {
        id: p.id, title: p.title, address: p.site_address, lat: p.lat, lng: p.lng, floors: p.floors,
        // Field staff need to reach the customer at site; suppliers get no customer contact.
        customer: user.role === 'supplier' ? undefined : customer ? { name: customer.name, phone: user.role === 'technician' ? customer.phone : undefined } : undefined,
        quote: user.role === 'customer' && p.quote_total ? { total: p.quote_total, ...milestoneAmounts(p.quote_total) } : undefined,
      },
      evidenceSpec: def.evidence ?? null,
      evidence: evidenceSummary(e, w),
      lastValidation: w.validation ? JSON.parse(w.validation) : null,
      failureReason: w.failure_reason,
      retryCount: w.retry_count,
      maxRetries: def.retry?.maxEvidenceRetries ?? 0,
      earning: user.role === 'technician' ? w.earning : undefined,
      payment: pay && user.role === 'customer' ? { id: pay.id, milestone: pay.milestone, amount: pay.amount, status: pay.status, attempts: pay.attempts, failureReason: pay.failure_reason } : undefined,
      snags: w.type === 'REWORK' && w.result ? JSON.parse(w.result).snags ?? [] : undefined,
      systemWill: next ? `${ACTION_TEXT[next.action].toLowerCase()} at ${fmtTime(next.at)}` : null,
      offlineCapable: !!def.offlineCapable,
    };
  });
  const completed = (e.db.prepare("SELECT * FROM work_items WHERE assigned_user_id = ? AND status = 'COMPLETED' ORDER BY completed_at DESC LIMIT 10").all(user.id) as unknown as WorkItemRow[])
    .map(w => ({ id: w.id, label: e.def(w.type).label, projectId: w.project_id, completedAt: fmtTime(w.completed_at!), earning: user.role === 'technician' ? w.earning : undefined, payout: w.payout_status }));
  const earnings = user.role === 'technician'
    ? (e.db.prepare("SELECT COALESCE(SUM(earning),0) AS s FROM work_items WHERE assigned_user_id = ? AND payout_status = 'ELIGIBLE'").get(user.id) as { s: number }).s
    : undefined;
  return { user: { id: user.id, name: user.name, role: user.role }, now: fmtTime(now), work, completed, earnings, notifications: notifications(e, user.id) };
}

export function notifications(e: Engine, userId: string) {
  return (e.db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 25').all(userId) as any[])
    .map(n => ({ id: n.id, at: fmtTime(n.at), title: n.title, body: n.body, read: !!n.read, projectId: n.project_id, workItemId: n.work_item_id }));
}

const CUSTOMER_SAFE_ACTIONS = new Set([
  'LEAD_CREATED', 'STATE_CHANGED', 'QUOTE_GENERATED', 'WORK_ASSIGNED', 'WORK_ACCEPTED', 'WORK_COMPLETED', 'EVIDENCE_PASSED',
  'PAYMENT_REQUIRED', 'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED', 'QUOTE_ACCEPTED', 'QUOTE_DECLINED',
]);

/** Customer portal: only their own projects, only customer-relevant facts. */
export function customerHome(e: Engine, user: UserRow) {
  const projects = e.projects().filter(p => p.customer_id === user.id).map(p => {
    const w = e.currentItem(p.id);
    const def = w ? e.def(w.type) : undefined;
    const photos = e.db.prepare(`SELECT ev.id, ev.label, ev.captured_at, wi.type FROM evidence ev JOIN work_items wi ON wi.id = ev.work_item_id
      WHERE ev.project_id = ? AND ev.kind = 'photo' AND ev.superseded = 0 AND wi.status = 'COMPLETED' ORDER BY ev.created_at`).all(p.id) as any[];
    const events = e.db.prepare('SELECT * FROM events WHERE project_id = ? ORDER BY seq').all(p.id) as any[];
    return {
      id: p.id, title: p.title, address: p.site_address, state: p.state, stateLabel: STATE_LABEL[p.state], progress: progressOf(p.state),
      nextMilestone: nextMilestone(p.state),
      currentStep: w && def ? { label: def.label, by: def.ownerRole === 'customer' ? 'You' : `${ownerName(e, w)} (${def.ownerRole})`, deadline: w.due_at ? fmtTime(w.due_at) : null } : null,
      quote: p.quote_total ? { total: p.quote_total, token: TOKEN_AMOUNT, ...milestoneAmounts(p.quote_total) } : null,
      payments: e.paymentsFor(p.id).map(x => ({ id: x.id, milestone: x.milestone, amount: x.amount, status: x.status, paidAt: x.paid_at ? fmtTime(x.paid_at) : null, failureReason: x.failure_reason })),
      evidence: photos.map(ph => ({ id: ph.id, label: ph.label, stage: e.def(ph.type).label, capturedAt: fmtTime(ph.captured_at) })),
      timeline: events.filter(ev => CUSTOMER_SAFE_ACTIONS.has(ev.action)).map(ev => ({ at: fmtTime(ev.at), who: ev.actor_type === 'SYSTEM' ? 'AIEC' : ev.actor_type === 'ADMIN' ? 'AIEC team' : ev.actor_id === user.id ? 'You' : 'AIEC partner', text: ev.detail })),
    };
  });
  return { projects };
}

/** Full project dossier — Admin only. */
export function projectDetail(e: Engine, projectId: string) {
  const p = e.project(projectId);
  const customer = p.customer_id ? e.user(p.customer_id) : undefined;
  const items = e.itemsForProject(projectId).map(w => ({
    id: w.id, type: w.type, label: e.def(w.type).label, status: w.status, owner: ownerName(e, w), createdAt: fmtTime(w.created_at),
    completedAt: w.completed_at ? fmtTime(w.completed_at) : null, retryCount: w.retry_count, reassignCount: w.reassign_count,
    validation: w.validation ? JSON.parse(w.validation) : null, earning: w.earning, payout: w.payout_status,
    evidence: e.evidenceFor(w.id, true).map(ev => ({ id: ev.id, kind: ev.kind, label: ev.label, superseded: !!ev.superseded, capturedAt: fmtTime(ev.captured_at), value: ev.kind === 'photo' || ev.kind === 'signature' ? undefined : ev.data, by: ev.submitted_by })),
  }));
  const events = (e.db.prepare('SELECT * FROM events WHERE project_id = ? ORDER BY seq').all(projectId) as any[]).map(ev => ({
    id: ev.id, at: fmtTime(ev.at), actorType: ev.actor_type, actor: ev.actor_type === 'SYSTEM' ? 'SYSTEM' : e.user(ev.actor_id)?.name ?? ev.actor_id,
    action: ev.action, detail: ev.detail, intervention: !!ev.intervention, cause: ev.intervention_cause,
  }));
  return {
    project: {
      id: p.id, title: p.title, state: p.state, stateLabel: STATE_LABEL[p.state], progress: progressOf(p.state), address: p.site_address,
      lat: p.lat, lng: p.lng, floors: p.floors, doorType: p.door_type, finish: p.finish, quoteTotal: p.quote_total,
      customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone } : null,
      installer: p.installer_id ? e.user(p.installer_id)?.name : null, flags: e.flags(p),
    },
    why: whyStuck(e, projectId),
    items,
    payments: e.paymentsFor(projectId),
    events,
  };
}
