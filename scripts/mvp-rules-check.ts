/**
 * MVP rules-table check (Step 03): every D-08 row produces the right tasks, owners, due
 * dates, stage and status; dedupe() never lets an event create a second open task (I-2).
 * Run with: npx tsx scripts/mvp-rules-check.ts
 */
import { check, done } from './mvp/fixtures';
import { outcomeFor, dedupe, type MvpEvent, type OrderSnapshot } from '../src/mvp/rules';
import type { MvpStage } from '../src/domain/entities';

const now = new Date('2026-10-01T04:30:00Z');
const days = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();
const order = (stage: MvpStage): OrderSnapshot => ({ stage, status: 'ACTIVE', customerToken: 'customer:c1', ownerUserId: 'u_sales' });

type Row = { event: MvpEvent; stage: MvpStage; nextStage?: MvpStage; nextStatus?: string; tasks: [string, string, string][]; completes?: string[]; cancels?: boolean };
const rows: Row[] = [
  { event: { type: 'LEAD_CREATED', salesUserId: 'u_sales' }, stage: 'LEAD', tasks: [['QUALIFY_LEAD', 'u_sales', days(2)]] },
  { event: { type: 'LEAD_QUALIFIED', surveyFeeInr: 0 }, stage: 'LEAD', nextStage: 'QUALIFIED', tasks: [['ASSIGN_SURVEYOR', 'role:admin', days(1)]], completes: ['QUALIFY_LEAD'] },
  { event: { type: 'LEAD_QUALIFIED', surveyFeeInr: 500 }, stage: 'LEAD', nextStage: 'QUALIFIED', tasks: [['ASSIGN_SURVEYOR', 'role:admin', days(1)], ['COLLECT_SURVEY_FEE', 'role:admin', days(2)]] },
  { event: { type: 'SURVEYOR_ASSIGNED', surveyorId: 'u_surveyor', date: days(2) }, stage: 'QUALIFIED', nextStage: 'SURVEY', tasks: [['SURVEY', 'u_surveyor', days(2)]] },
  { event: { type: 'SURVEYOR_ASSIGNED', surveyorId: 'u_surveyor' }, stage: 'QUALIFIED', nextStage: 'SURVEY', tasks: [['SURVEY', 'u_surveyor', days(3)]] },
  { event: { type: 'SURVEY_RESULT', result: 'FEASIBLE' }, stage: 'SURVEY', nextStage: 'QUOTE', tasks: [['PREPARE_QUOTE', 'role:admin', days(2)]] },
  { event: { type: 'SURVEY_RESULT', result: 'REQUIRES_CORRECTION' }, stage: 'SURVEY', tasks: [['SITE_CORRECTION', 'customer:c1', days(14)]] },
  { event: { type: 'SURVEY_RESULT', result: 'NOT_FEASIBLE' }, stage: 'SURVEY', tasks: [['REVIEW_NOT_FEASIBLE', 'role:admin', days(1)]] },
  { event: { type: 'CORRECTION_COMPLETED', surveyorId: 'u_surveyor' }, stage: 'SURVEY', tasks: [['SURVEY', 'u_surveyor', days(3)]], completes: ['SITE_CORRECTION'] },
  { event: { type: 'QUOTE_PREPARED', belowMinimum: true }, stage: 'QUOTE', tasks: [['APPROVE_MARGIN', 'role:admin', days(1)]] },
  { event: { type: 'QUOTE_PREPARED', belowMinimum: false }, stage: 'QUOTE', tasks: [] },
  { event: { type: 'QUOTE_SENT' }, stage: 'QUOTE', tasks: [['QUOTE_DECISION', 'customer:c1', days(7)]], completes: ['PREPARE_QUOTE', 'APPROVE_MARGIN'] },
  { event: { type: 'QUOTE_ACCEPTED' }, stage: 'QUOTE', nextStage: 'BOOKED', tasks: [['COLLECT_BOOKING_TOKEN', 'role:admin', days(3)]] },
  { event: { type: 'PAYMENT_PAID', kind: 'BOOKING_TOKEN' }, stage: 'BOOKED', nextStage: 'SITE_READY', tasks: [['SITE_READINESS', 'customer:c1', days(14)], ['RAISE_PO', 'role:admin', days(2)]] },
  { event: { type: 'READINESS_SUBMITTED' }, stage: 'SITE_READY', tasks: [['VERIFY_SITE_READY', 'role:admin', days(1)]] },
  { event: { type: 'SITE_READY_CONFIRMED', poExpectedDate: days(10) }, stage: 'SITE_READY', nextStage: 'DELIVERY', tasks: [['TRACK_DELIVERY', 'role:admin', days(10)], ['COLLECT_DELIVERY_PAYMENT', 'role:admin', days(12)]] },
  { event: { type: 'MATERIAL_RECEIVED', technicianId: 'u_tech1' }, stage: 'DELIVERY', nextStage: 'INSTALLATION', tasks: [['INSTALLATION', 'u_tech1', days(21)]] },
  { event: { type: 'MATERIAL_RECEIVED' }, stage: 'DELIVERY', nextStage: 'INSTALLATION', tasks: [['INSTALLATION', 'role:admin', days(21)]] },
  { event: { type: 'INSTALLATION_COMPLETED', qcUserId: 'u_qc' }, stage: 'INSTALLATION', nextStage: 'QC_HANDOVER', tasks: [['QC_INSPECTION', 'u_qc', days(2)]] },
  { event: { type: 'QC_DECISION', decision: 'PASS' }, stage: 'QC_HANDOVER', tasks: [['HANDOVER', 'role:admin', days(3)], ['COLLECT_FINAL_PAYMENT', 'role:admin', days(3)], ['STATUTORY_LICENCE', 'role:admin', days(30)]] },
  { event: { type: 'QC_DECISION', decision: 'REWORK', technicianId: 'u_tech1' }, stage: 'QC_HANDOVER', tasks: [['REWORK', 'u_tech1', days(3)]] },
  { event: { type: 'QC_DECISION', decision: 'FAIL' }, stage: 'QC_HANDOVER', nextStatus: 'ON_HOLD', tasks: [['REVIEW_HOLD', 'role:admin', days(1)]] },
  { event: { type: 'REWORK_COMPLETED', qcUserId: 'u_qc' }, stage: 'QC_HANDOVER', tasks: [['QC_INSPECTION', 'u_qc', days(2)]], completes: ['REWORK'] },
  { event: { type: 'HANDOVER_COMPLETED', warrantyEnd: days(365) }, stage: 'QC_HANDOVER', nextStage: 'AMC', nextStatus: 'COMPLETED', tasks: [['AMC_FOLLOW_UP', 'role:admin', days(275)]] },
  { event: { type: 'ORDER_ON_HOLD', reviewDate: days(7) }, stage: 'SITE_READY', nextStatus: 'ON_HOLD', tasks: [['REVIEW_HOLD', 'role:admin', days(7)]] },
  { event: { type: 'ORDER_CANCELLED' }, stage: 'QUOTE', nextStatus: 'CANCELLED', tasks: [], cancels: true },
  { event: { type: 'EMERGENCY_RAISED', onCallTechId: 'u_tech2' }, stage: 'AMC', tasks: [['EMERGENCY_RESPONSE', 'u_tech2', new Date(now.getTime() + 45 * 60_000).toISOString()]] },
  { event: { type: 'EMERGENCY_RAISED' }, stage: 'AMC', tasks: [['EMERGENCY_RESPONSE', 'role:admin', new Date(now.getTime() + 45 * 60_000).toISOString()]] },
];

for (const row of rows) {
  const o = outcomeFor(row.event, order(row.stage), now);
  const label = `${row.event.type}${'result' in row.event ? ':' + row.event.result : ''}${'decision' in row.event ? ':' + row.event.decision : ''}`;
  check(o.nextStage === row.nextStage, `${label}: next stage ${row.nextStage ?? '(unchanged)'}`);
  check(o.nextStatus === row.nextStatus, `${label}: next status ${row.nextStatus ?? '(unchanged)'}`);
  check(o.create.length === row.tasks.length, `${label}: creates ${row.tasks.length} task(s)`);
  row.tasks.forEach(([type, assignee, due], i) => {
    const s = o.create[i];
    check(s.type === type && s.assignee.id === assignee && s.dueDate === due, `${label}: ${type} → ${assignee}, due ${due.slice(0, 10)}`);
  });
  if (row.tasks.length) check(o.create[0].primary && o.create.slice(1).every(s => !s.primary), `${label}: first task is the primary next action`);
  for (const c of row.completes ?? []) check(o.completeTypes.includes(c as any), `${label}: completes ${c}`);
  if (row.cancels) check(o.cancelOpenTasks === true, `${label}: cancels all open tasks`);
}

// I-2: re-running an event whose tasks are already open creates nothing new.
const paid = outcomeFor({ type: 'PAYMENT_PAID', kind: 'BOOKING_TOKEN' }, order('BOOKED'), now);
check(dedupe(paid.create, ['SITE_READINESS', 'RAISE_PO']).length === 0, 'dedupe: duplicate event creates no duplicate tasks');
check(dedupe(paid.create, ['RAISE_PO']).map(s => s.type).join() === 'SITE_READINESS', 'dedupe: only the missing task is created');
check(dedupe([...paid.create, ...paid.create], []).length === 2, 'dedupe: duplicates inside one outcome collapse');

done('mvp-rules-check');
