/**
 * D-08 rules table: every event row produces the right stage, status,
 * completions, task types, owners and due dates; planTaskCreation never
 * creates a duplicate open task (I-2).
 * Run: npx tsx scripts/mvp/rules-check.ts
 */
import { check, eq, summary } from './assert';
import { planTaskCreation, rulesFor, type MvpEvent } from '../../src/mvp/rules';

const now = new Date('2026-10-01T06:00:00.000Z');
const days = (iso: string) => Math.round((new Date(iso).getTime() - now.getTime()) / 86400e3);
const view = (e: MvpEvent) => {
  const r = rulesFor(e, now);
  return {
    stage: r.stageAfter ?? null,
    status: r.statusAfter ?? null,
    completes: r.completes,
    creates: r.creates.map(c => `${c.type}→${typeof c.assignee === 'string' ? c.assignee : c.assignee.role}+${days(c.dueDate)}`),
  };
};

const rows: [MvpEvent, ReturnType<typeof view>][] = [
  [{ type: 'LEAD_CREATED' }, { stage: null, status: null, completes: [], creates: ['QUALIFY_LEAD→sales+2'] }],
  [{ type: 'LEAD_QUALIFIED', surveyFeeInr: 0 }, { stage: 'QUALIFIED', status: null, completes: ['QUALIFY_LEAD'], creates: ['ASSIGN_SURVEYOR→admin+1'] }],
  [{ type: 'LEAD_QUALIFIED', surveyFeeInr: 500 }, { stage: 'QUALIFIED', status: null, completes: ['QUALIFY_LEAD'], creates: ['ASSIGN_SURVEYOR→admin+1', 'COLLECT_SURVEY_FEE→admin+2'] }],
  [{ type: 'SURVEYOR_ASSIGNED', surveyorId: 'u1' }, { stage: 'SURVEY', status: null, completes: ['ASSIGN_SURVEYOR'], creates: ['SURVEY→surveyor+3'] }],
  [{ type: 'SURVEY_SUBMITTED', result: 'FEASIBLE' }, { stage: 'QUOTE', status: null, completes: ['SURVEY'], creates: ['PREPARE_QUOTE→admin+2'] }],
  [{ type: 'SURVEY_SUBMITTED', result: 'REQUIRES_CORRECTION' }, { stage: null, status: null, completes: ['SURVEY'], creates: ['SITE_CORRECTION→customer+14'] }],
  [{ type: 'SURVEY_SUBMITTED', result: 'NOT_FEASIBLE' }, { stage: null, status: null, completes: ['SURVEY'], creates: ['REVIEW_NOT_FEASIBLE→admin+1'] }],
  [{ type: 'SITE_CORRECTION_DONE', surveyorId: 'u1' }, { stage: null, status: null, completes: ['SITE_CORRECTION'], creates: ['SURVEY→surveyor+3'] }],
  [{ type: 'QUOTE_PREPARED', belowMinimum: true }, { stage: null, status: null, completes: [], creates: ['APPROVE_MARGIN→admin+1'] }],
  [{ type: 'QUOTE_PREPARED', belowMinimum: false }, { stage: null, status: null, completes: [], creates: [] }],
  [{ type: 'QUOTE_SENT' }, { stage: null, status: null, completes: ['PREPARE_QUOTE', 'APPROVE_MARGIN'], creates: ['QUOTE_DECISION→customer+7'] }],
  [{ type: 'QUOTE_ACCEPTED' }, { stage: 'BOOKED', status: null, completes: ['QUOTE_DECISION'], creates: ['COLLECT_BOOKING_TOKEN→admin+3'] }],
  [{ type: 'PAYMENT_PAID', kind: 'BOOKING_TOKEN' }, { stage: 'SITE_READY', status: null, completes: ['COLLECT_BOOKING_TOKEN'], creates: ['SITE_READINESS→customer+14', 'RAISE_PO→admin+2'] }],
  [{ type: 'READINESS_SUBMITTED' }, { stage: null, status: null, completes: ['SITE_READINESS'], creates: ['VERIFY_SITE_READY→admin+1'] }],
  [{ type: 'SITE_CONFIRMED', expectedDeliveryDate: new Date(now.getTime() + 10 * 86400e3).toISOString() },
    { stage: 'DELIVERY', status: null, completes: ['VERIFY_SITE_READY', 'SITE_READINESS'], creates: ['TRACK_DELIVERY→admin+10', 'COLLECT_DELIVERY_PAYMENT→admin+2'] }],
  [{ type: 'MATERIAL_RECEIVED', technicianId: 't1' }, { stage: 'INSTALLATION', status: null, completes: ['TRACK_DELIVERY'], creates: ['INSTALLATION→technician+21'] }],
  [{ type: 'INSTALLATION_COMPLETED' }, { stage: 'QC_HANDOVER', status: null, completes: ['INSTALLATION'], creates: ['QC_INSPECTION→qc+2'] }],
  [{ type: 'QC_DECIDED', decision: 'PASS', technicianId: 't1' },
    { stage: null, status: null, completes: ['QC_INSPECTION'], creates: ['HANDOVER→admin+3', 'COLLECT_FINAL_PAYMENT→admin+3', 'STATUTORY_LICENCE→admin+30'] }],
  [{ type: 'QC_DECIDED', decision: 'REWORK', technicianId: 't1' }, { stage: null, status: null, completes: ['QC_INSPECTION'], creates: ['REWORK→technician+3'] }],
  [{ type: 'QC_DECIDED', decision: 'FAIL', technicianId: 't1' }, { stage: null, status: 'ON_HOLD', completes: ['QC_INSPECTION'], creates: ['REVIEW_HOLD→admin+1'] }],
  [{ type: 'REWORK_DONE' }, { stage: null, status: null, completes: ['REWORK'], creates: ['QC_INSPECTION→qc+2'] }],
  [{ type: 'ORDER_HELD', reviewDate: new Date(now.getTime() + 7 * 86400e3).toISOString() }, { stage: null, status: 'ON_HOLD', completes: [], creates: ['REVIEW_HOLD→admin+7'] }],
  [{ type: 'ORDER_RESUMED' }, { stage: null, status: 'ACTIVE', completes: ['REVIEW_HOLD'], creates: [] }],
];
for (const [event, expected] of rows) eq(view(event), expected, `D-08 row ${event.type}${'result' in event ? ' ' + event.result : ''}${'decision' in event ? ' ' + event.decision : ''}`);

const warrantyEnd = '2027-10-01T06:00:00.000Z';
const ho = rulesFor({ type: 'HANDOVER_COMPLETED', warrantyEnd }, now);
check(ho.stageAfter === 'AMC' && ho.statusAfter === 'COMPLETED', 'handover → stage AMC, status COMPLETED');
eq(ho.creates.map(c => [c.type, c.dueDate.slice(0, 10)]), [['AMC_FOLLOW_UP', '2027-07-03']], 'AMC_FOLLOW_UP due = warranty end − 90 days');
const cancel = rulesFor({ type: 'ORDER_CANCELLED' }, now);
check(cancel.statusAfter === 'CANCELLED' && cancel.cancelAllOpen === true && cancel.creates.length === 0, 'cancel → CANCELLED, all open tasks cancelled');
const em = rulesFor({ type: 'EMERGENCY_RAISED' }, now);
eq([em.creates[0].type, em.creates[0].assignee, (new Date(em.creates[0].dueDate).getTime() - now.getTime()) / 60000], ['EMERGENCY_RESPONSE', 'oncall', 45], 'emergency → on-call, due +45 minutes');

// --- Idempotency (I-2)
const specs = rulesFor({ type: 'PAYMENT_PAID', kind: 'BOOKING_TOKEN' }, now).creates;
eq(planTaskCreation(specs, [{ type: 'SITE_READINESS' }], []).map(s => s.type), ['RAISE_PO'], 'an open SITE_READINESS is not duplicated');
eq(planTaskCreation(specs, [{ type: 'SITE_READINESS' }, { type: 'RAISE_PO' }], []).length, 0, 'running the event twice creates nothing new');
eq(planTaskCreation(rulesFor({ type: 'REWORK_DONE' }, now).creates, [{ type: 'QC_INSPECTION' }], ['QC_INSPECTION']).length, 1, 'a task being completed by the same event can be recreated');

summary('mvp rules check');
