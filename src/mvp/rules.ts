/**
 * Simple rule automation (D-08): one pure function from an event to the
 * stage/status change, the open tasks it completes, and the tasks it
 * creates. No engine, no event bus: the order service calls `rulesFor`
 * from exactly one command per event, then `planTaskCreation` drops any
 * spec whose type already has an open task (I-2).
 */
import { DUE_DAYS, MVP_CONFIG } from './config';
import { addDays, addMinutes } from './money';
import type { AssigneeKind, MilestoneKind, MvpStage, MvpTask, OrderStatus, QcDecision, SurveyResult, TaskType } from './types';

export type MvpEvent =
  | { type: 'LEAD_CREATED' }
  | { type: 'LEAD_QUALIFIED'; surveyFeeInr: number }
  | { type: 'SURVEYOR_ASSIGNED'; surveyorId: string; scheduledFor?: string }
  | { type: 'SURVEY_SUBMITTED'; result: SurveyResult }
  | { type: 'SITE_CORRECTION_DONE'; surveyorId: string }
  | { type: 'QUOTE_PREPARED'; belowMinimum: boolean }
  | { type: 'MARGIN_APPROVED' }
  | { type: 'QUOTE_SENT' }
  | { type: 'QUOTE_ACCEPTED' }
  | { type: 'QUOTE_REJECTED' }
  | { type: 'PAYMENT_PAID'; kind: MilestoneKind }
  | { type: 'PO_RAISED' }
  | { type: 'READINESS_SUBMITTED' }
  | { type: 'SITE_CONFIRMED'; expectedDeliveryDate?: string }
  | { type: 'MATERIAL_RECEIVED'; technicianId: string }
  | { type: 'INSTALLATION_COMPLETED' }
  | { type: 'QC_DECIDED'; decision: QcDecision; technicianId: string }
  | { type: 'REWORK_DONE' }
  | { type: 'LICENCE_DONE' }
  | { type: 'HANDOVER_COMPLETED'; warrantyEnd: string }
  | { type: 'ORDER_HELD'; reviewDate: string }
  | { type: 'ORDER_RESUMED' }
  | { type: 'ORDER_CANCELLED' }
  | { type: 'EMERGENCY_RAISED' };

export interface TaskSpec {
  type: TaskType;
  /** A role kind the service resolves, or a concrete user id. */
  assignee: AssigneeKind | { userId: string; role: 'surveyor' | 'technician' | 'qc' };
  dueDate: string;
  priority: number;
  /** Stage the task belongs to; defaults to the order's stage after the event. */
  stage?: MvpStage;
}

export interface RuleResult {
  stageAfter?: MvpStage;
  statusAfter?: OrderStatus;
  /** Open tasks of these types are completed by the event. */
  completes: TaskType[];
  /** Cancel every open task (order cancelled). */
  cancelAllOpen?: boolean;
  creates: TaskSpec[];
}

export const TASK_TITLES: Record<TaskType, string> = {
  QUALIFY_LEAD: 'Qualify the lead',
  ASSIGN_SURVEYOR: 'Assign a surveyor',
  COLLECT_SURVEY_FEE: 'Collect the survey fee',
  SURVEY: 'Do the site survey',
  SITE_CORRECTION: 'Correct the site and tell us when done',
  REVIEW_NOT_FEASIBLE: 'Review the not-feasible survey: cancel or re-survey',
  PREPARE_QUOTE: 'Prepare and send the quote',
  APPROVE_MARGIN: 'Approve the below-minimum margin',
  QUOTE_DECISION: 'Accept or reject the quote',
  COLLECT_BOOKING_TOKEN: 'Collect the booking token',
  SITE_READINESS: 'Get the site ready and upload photos',
  RAISE_PO: 'Raise the purchase order to the supplier',
  VERIFY_SITE_READY: 'Verify the site is ready',
  TRACK_DELIVERY: 'Track delivery and mark material received',
  COLLECT_DELIVERY_PAYMENT: 'Collect the delivery payment',
  INSTALLATION: 'Install the lift (11-item checklist)',
  QC_INSPECTION: 'Inspect the installation (QC)',
  REWORK: 'Fix the QC snag',
  HANDOVER: 'Complete the handover',
  COLLECT_FINAL_PAYMENT: 'Collect the final payment',
  STATUTORY_LICENCE: 'Get the statutory lift licence',
  AMC_FOLLOW_UP: 'Offer the AMC before warranty ends',
  REVIEW_HOLD: 'Review the order on hold',
  EMERGENCY_RESPONSE: 'EMERGENCY: respond now',
  SET_NEXT_TASK: 'Set the next task for this order',
};

function spec(type: TaskType, assignee: TaskSpec['assignee'], now: Date, priority = 0, dueDate?: string): TaskSpec {
  return { type, assignee, priority, dueDate: dueDate ?? addDays(now, DUE_DAYS[type] ?? 1) };
}

export function rulesFor(event: MvpEvent, now: Date): RuleResult {
  switch (event.type) {
    case 'LEAD_CREATED':
      return { completes: [], creates: [spec('QUALIFY_LEAD', 'sales', now)] };
    case 'LEAD_QUALIFIED':
      return {
        stageAfter: 'QUALIFIED',
        completes: ['QUALIFY_LEAD'],
        creates: [
          spec('ASSIGN_SURVEYOR', 'admin', now),
          ...(event.surveyFeeInr > 0 ? [spec('COLLECT_SURVEY_FEE', 'admin', now, 1)] : []),
        ],
      };
    case 'SURVEYOR_ASSIGNED':
      return {
        stageAfter: 'SURVEY',
        completes: ['ASSIGN_SURVEYOR'],
        creates: [spec('SURVEY', { userId: event.surveyorId, role: 'surveyor' }, now, 0, event.scheduledFor)],
      };
    case 'SURVEY_SUBMITTED':
      if (event.result === 'FEASIBLE') return { stageAfter: 'QUOTE', completes: ['SURVEY'], creates: [spec('PREPARE_QUOTE', 'admin', now)] };
      if (event.result === 'REQUIRES_CORRECTION') return { completes: ['SURVEY'], creates: [spec('SITE_CORRECTION', 'customer', now)] };
      return { completes: ['SURVEY'], creates: [spec('REVIEW_NOT_FEASIBLE', 'admin', now)] };
    case 'SITE_CORRECTION_DONE':
      return { completes: ['SITE_CORRECTION'], creates: [spec('SURVEY', { userId: event.surveyorId, role: 'surveyor' }, now)] };
    case 'QUOTE_PREPARED':
      return { completes: [], creates: event.belowMinimum ? [spec('APPROVE_MARGIN', 'admin', now, 1)] : [] };
    case 'MARGIN_APPROVED':
      return { completes: ['APPROVE_MARGIN'], creates: [] };
    case 'QUOTE_SENT':
      return { completes: ['PREPARE_QUOTE', 'APPROVE_MARGIN'], creates: [spec('QUOTE_DECISION', 'customer', now)] };
    case 'QUOTE_ACCEPTED':
      return { stageAfter: 'BOOKED', completes: ['QUOTE_DECISION'], creates: [spec('COLLECT_BOOKING_TOKEN', 'admin', now)] };
    case 'QUOTE_REJECTED':
      return { completes: ['QUOTE_DECISION'], creates: [spec('PREPARE_QUOTE', 'admin', now)] };
    case 'PAYMENT_PAID':
      switch (event.kind) {
        case 'BOOKING_TOKEN':
          return {
            stageAfter: 'SITE_READY',
            completes: ['COLLECT_BOOKING_TOKEN'],
            creates: [spec('SITE_READINESS', 'customer', now, 0), spec('RAISE_PO', 'admin', now, 1)],
          };
        case 'SURVEY_FEE': return { completes: ['COLLECT_SURVEY_FEE'], creates: [] };
        case 'DELIVERY': return { completes: ['COLLECT_DELIVERY_PAYMENT'], creates: [] };
        case 'FINAL': return { completes: ['COLLECT_FINAL_PAYMENT'], creates: [] };
      }
      return { completes: [], creates: [] };
    case 'PO_RAISED':
      return { completes: ['RAISE_PO'], creates: [] };
    case 'READINESS_SUBMITTED':
      return { completes: ['SITE_READINESS'], creates: [spec('VERIFY_SITE_READY', 'admin', now)] };
    case 'SITE_CONFIRMED':
      return {
        stageAfter: 'DELIVERY',
        completes: ['VERIFY_SITE_READY', 'SITE_READINESS'],
        creates: [
          spec('TRACK_DELIVERY', 'admin', now, 0, event.expectedDeliveryDate),
          // Interpretation (PROGRESS): due 2 days after the site is confirmed for delivery, which is what S5 expects.
          spec('COLLECT_DELIVERY_PAYMENT', 'admin', now, 1),
        ],
      };
    case 'MATERIAL_RECEIVED':
      return {
        stageAfter: 'INSTALLATION',
        completes: ['TRACK_DELIVERY'],
        creates: [spec('INSTALLATION', { userId: event.technicianId, role: 'technician' }, now)],
      };
    case 'INSTALLATION_COMPLETED':
      return { stageAfter: 'QC_HANDOVER', completes: ['INSTALLATION'], creates: [spec('QC_INSPECTION', 'qc', now)] };
    case 'QC_DECIDED':
      if (event.decision === 'PASS') {
        return {
          completes: ['QC_INSPECTION'],
          creates: [spec('HANDOVER', 'admin', now, 0), spec('COLLECT_FINAL_PAYMENT', 'admin', now, 1), spec('STATUTORY_LICENCE', 'admin', now, 2)],
        };
      }
      if (event.decision === 'REWORK') {
        return { completes: ['QC_INSPECTION'], creates: [spec('REWORK', { userId: event.technicianId, role: 'technician' }, now)] };
      }
      return { statusAfter: 'ON_HOLD', completes: ['QC_INSPECTION'], creates: [spec('REVIEW_HOLD', 'admin', now)] };
    case 'REWORK_DONE':
      return { completes: ['REWORK'], creates: [spec('QC_INSPECTION', 'qc', now)] };
    case 'LICENCE_DONE':
      return { completes: ['STATUTORY_LICENCE'], creates: [] };
    case 'HANDOVER_COMPLETED':
      return {
        stageAfter: 'AMC',
        statusAfter: 'COMPLETED',
        completes: ['HANDOVER'],
        creates: [{ ...spec('AMC_FOLLOW_UP', 'admin', now, 0, addDays(event.warrantyEnd, -MVP_CONFIG.AMC_DUE_DAYS_BEFORE_WARRANTY_END)), stage: 'AMC' }],
      };
    case 'ORDER_HELD':
      return { statusAfter: 'ON_HOLD', completes: [], creates: [spec('REVIEW_HOLD', 'admin', now, -1, event.reviewDate)] };
    case 'ORDER_RESUMED':
      return { statusAfter: 'ACTIVE', completes: ['REVIEW_HOLD'], creates: [] };
    case 'ORDER_CANCELLED':
      return { statusAfter: 'CANCELLED', completes: [], cancelAllOpen: true, creates: [] };
    case 'EMERGENCY_RAISED':
      return {
        completes: [],
        creates: [{ ...spec('EMERGENCY_RESPONSE', 'oncall', now, -2, addMinutes(now, MVP_CONFIG.EMERGENCY_RESPONSE_MINUTES)), stage: 'AMC' }],
      };
  }
}

/** Idempotency (I-2): never create a second open task of the same type on an order. */
export function planTaskCreation(specs: TaskSpec[], openTasks: Pick<MvpTask, 'type'>[], completing: TaskType[]): TaskSpec[] {
  const stillOpen = new Set(openTasks.map(t => t.type).filter(t => !completing.includes(t)));
  const out: TaskSpec[] = [];
  for (const s of specs) {
    if (stillOpen.has(s.type)) continue;
    stillOpen.add(s.type);
    out.push(s);
  }
  return out;
}
