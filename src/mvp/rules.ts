/**
 * Simple rule automation (D-08) — ONE pure module: event → next stage/status + tasks.
 * No I/O, no workflow engine. `now` is injected so checks control the clock.
 * Idempotency: `dedupe()` drops any task whose type already has an open task (invariant I-2);
 * the order service also uses deterministic task ids so concurrent writers converge.
 */

import type { CanonicalUserRole, MilestoneKind, MvpStage, OrderStatus, SurveyResult, TaskType } from '../domain/entities';
import { AMC_REMINDER_DAYS, DUE_DAYS, EMERGENCY_RESPONSE_MINUTES, QC_FAIL_REVIEW_DAYS, READINESS_RETURN_DAYS } from './config';
import { addDays, addMinutes } from './format';

export type QcDecision = 'PASS' | 'REWORK' | 'FAIL';

export type MvpEvent =
  | { type: 'LEAD_CREATED'; salesUserId: string }
  | { type: 'LEAD_QUALIFIED'; surveyFeeInr: number }
  | { type: 'SURVEYOR_ASSIGNED'; surveyorId: string; date?: string }
  | { type: 'SURVEY_RESULT'; result: SurveyResult }
  | { type: 'CORRECTION_COMPLETED' }
  | { type: 'QUOTE_PREPARED'; belowMinimum: boolean }
  | { type: 'MARGIN_APPROVED' }
  | { type: 'QUOTE_SENT' }
  | { type: 'QUOTE_CHANGES_REQUESTED' }
  | { type: 'QUOTE_ACCEPTED' }
  | { type: 'PAYMENT_PAID'; kind: MilestoneKind }
  | { type: 'PO_RAISED' }
  | { type: 'READINESS_SUBMITTED' }
  | { type: 'READINESS_RETURNED' }
  | { type: 'SITE_READY_CONFIRMED'; poExpectedDate?: string }
  | { type: 'MATERIAL_RECEIVED'; technicianId?: string }
  | { type: 'INSTALLATION_COMPLETED'; qcUserId?: string }
  | { type: 'QC_DECISION'; decision: QcDecision; technicianId?: string; remarks?: string }
  | { type: 'REWORK_COMPLETED'; qcUserId?: string }
  | { type: 'LICENCE_DONE' }
  | { type: 'HANDOVER_COMPLETED'; warrantyEnd: string }
  | { type: 'ORDER_ON_HOLD'; reviewDate?: string }
  | { type: 'ORDER_RESUMED' }
  | { type: 'ORDER_CANCELLED' }
  | { type: 'EMERGENCY_RAISED'; onCallTechId?: string };

/** What the rules need to know about the order. */
export interface OrderSnapshot {
  stage: MvpStage;
  status?: OrderStatus;
  /** `customer:<customerId>` — the customer's assignee token. */
  customerToken: string;
  /** Sales owner uid. */
  ownerUserId: string;
}

export interface Assignee {
  id: string; // uid, customer:<id>, or role:<role>
  role: CanonicalUserRole;
}

export interface TaskSpec {
  type: TaskType;
  title: string;
  assignee: Assignee;
  dueDate: string;
  stage: MvpStage;
  primary: boolean;
  /** Carried onto the created task's own `notes` (e.g. the QC remarks on a REWORK task). */
  notes?: string;
}

export interface RuleOutcome {
  nextStage?: MvpStage;
  nextStatus?: OrderStatus;
  create: TaskSpec[];
  /** Open tasks of these types are marked COMPLETED by this event. */
  completeTypes: TaskType[];
  /** All open tasks become CANCELLED (D-25). */
  cancelOpenTasks?: boolean;
}

export const TASK_TITLES: Record<TaskType, string> = {
  QUALIFY_LEAD: 'Call the customer and qualify the lead',
  ASSIGN_SURVEYOR: 'Assign a surveyor and a survey date',
  COLLECT_SURVEY_FEE: 'Collect the survey fee (or waive it)',
  SURVEY: 'Complete the site survey',
  SITE_CORRECTION: 'Correct the site as noted in the survey',
  REVIEW_NOT_FEASIBLE: 'Review the not-feasible survey: cancel or re-survey',
  PREPARE_QUOTE: 'Prepare and send the quote',
  APPROVE_MARGIN: 'Approve the low-margin quote',
  QUOTE_DECISION: 'Review and accept the quote',
  COLLECT_BOOKING_TOKEN: 'Collect the booking token',
  SITE_READINESS: 'Get the site ready and upload photos',
  RAISE_PO: 'Raise the purchase order with the supplier',
  VERIFY_SITE_READY: 'Verify the site-readiness photos',
  TRACK_DELIVERY: 'Track the delivery and mark material received',
  COLLECT_DELIVERY_PAYMENT: 'Collect the delivery payment',
  INSTALLATION: 'Install the lift (11-item checklist)',
  QC_INSPECTION: 'Inspect the installation (QC)',
  REWORK: 'Fix the QC rework items',
  HANDOVER: 'Complete the handover with the customer',
  COLLECT_FINAL_PAYMENT: 'Collect the final handover payment',
  STATUTORY_LICENCE: 'Obtain the statutory lift licence',
  AMC_FOLLOW_UP: 'Offer the AMC before the warranty ends',
  REVIEW_HOLD: 'Review the order on hold',
  EMERGENCY_RESPONSE: 'EMERGENCY: respond to the lift breakdown',
  REVIEW_ORDER: 'Review this order and create its next task',
};

const ADMIN: Assignee = { id: 'role:admin', role: 'admin' };

function due(now: Date, days: number): string {
  return addDays(now, days).toISOString();
}

function spec(type: TaskType, assignee: Assignee, dueDate: string, stage: MvpStage, primary = false, title?: string, notes?: string): TaskSpec {
  return { type, title: title ?? TASK_TITLES[type], assignee, dueDate, stage, primary, notes };
}

const EMPTY: RuleOutcome = { create: [], completeTypes: [] };

export function outcomeFor(event: MvpEvent, order: OrderSnapshot, now: Date): RuleOutcome {
  const customer: Assignee = { id: order.customerToken, role: 'customer' };
  const at = (stage: MvpStage) => stage;
  switch (event.type) {
    case 'LEAD_CREATED':
      return { create: [spec('QUALIFY_LEAD', { id: event.salesUserId, role: 'sales' }, due(now, DUE_DAYS.QUALIFY_LEAD), 'LEAD', true)], completeTypes: [] };

    case 'LEAD_QUALIFIED': {
      const create = [spec('ASSIGN_SURVEYOR', ADMIN, due(now, DUE_DAYS.ASSIGN_SURVEYOR), 'QUALIFIED', true)];
      if (event.surveyFeeInr > 0) create.push(spec('COLLECT_SURVEY_FEE', ADMIN, due(now, DUE_DAYS.COLLECT_SURVEY_FEE), 'QUALIFIED'));
      return { nextStage: 'QUALIFIED', create, completeTypes: ['QUALIFY_LEAD'] };
    }

    case 'SURVEYOR_ASSIGNED':
      return {
        nextStage: 'SURVEY',
        create: [spec('SURVEY', { id: event.surveyorId, role: 'surveyor' }, event.date ?? due(now, DUE_DAYS.SURVEY), 'SURVEY', true)],
        completeTypes: ['ASSIGN_SURVEYOR'],
      };

    case 'SURVEY_RESULT':
      if (event.result === 'FEASIBLE') {
        return { nextStage: 'QUOTE', create: [spec('PREPARE_QUOTE', ADMIN, due(now, DUE_DAYS.PREPARE_QUOTE), 'QUOTE', true)], completeTypes: ['SURVEY'] };
      }
      if (event.result === 'REQUIRES_CORRECTION') {
        return { create: [spec('SITE_CORRECTION', customer, due(now, DUE_DAYS.SITE_CORRECTION), 'SURVEY', true)], completeTypes: ['SURVEY'] };
      }
      return { create: [spec('REVIEW_NOT_FEASIBLE', ADMIN, due(now, DUE_DAYS.REVIEW_NOT_FEASIBLE), 'SURVEY', true)], completeTypes: ['SURVEY'] };

    case 'CORRECTION_COMPLETED':
      // D-08 says "create SURVEY again". The customer triggers this event, and a customer may
      // not grant a surveyor access to the order (firestore.rules), so the Admin re-assigns
      // the survey with one click (ASSIGN_SURVEYOR → SURVEY). Plan deviation, Step 03.
      return {
        create: [spec('ASSIGN_SURVEYOR', ADMIN, due(now, DUE_DAYS.ASSIGN_SURVEYOR), 'SURVEY', true, 'Re-assign the survey (customer finished the corrections)')],
        completeTypes: ['SITE_CORRECTION'],
      };

    case 'QUOTE_PREPARED':
      return event.belowMinimum
        ? { create: [spec('APPROVE_MARGIN', ADMIN, due(now, DUE_DAYS.APPROVE_MARGIN), at(order.stage), true)], completeTypes: [] }
        : EMPTY;

    case 'MARGIN_APPROVED':
      return { create: [], completeTypes: ['APPROVE_MARGIN'] };

    case 'QUOTE_SENT':
      return {
        create: [spec('QUOTE_DECISION', customer, due(now, DUE_DAYS.QUOTE_DECISION), 'QUOTE', true)],
        completeTypes: ['PREPARE_QUOTE', 'APPROVE_MARGIN'],
      };

    case 'QUOTE_CHANGES_REQUESTED':
      return { create: [spec('PREPARE_QUOTE', ADMIN, due(now, DUE_DAYS.PREPARE_QUOTE), 'QUOTE', true)], completeTypes: ['QUOTE_DECISION'] };

    case 'QUOTE_ACCEPTED':
      return {
        nextStage: 'BOOKED',
        create: [spec('COLLECT_BOOKING_TOKEN', ADMIN, due(now, DUE_DAYS.COLLECT_BOOKING_TOKEN), 'BOOKED', true)],
        completeTypes: ['QUOTE_DECISION'],
      };

    case 'PAYMENT_PAID':
      switch (event.kind) {
        case 'BOOKING_TOKEN':
          return {
            nextStage: 'SITE_READY',
            create: [
              spec('SITE_READINESS', customer, due(now, DUE_DAYS.SITE_READINESS), 'SITE_READY', true),
              spec('RAISE_PO', ADMIN, due(now, DUE_DAYS.RAISE_PO), 'SITE_READY'),
            ],
            completeTypes: ['COLLECT_BOOKING_TOKEN'],
          };
        case 'DELIVERY': return { create: [], completeTypes: ['COLLECT_DELIVERY_PAYMENT'] };
        case 'FINAL': return { create: [], completeTypes: ['COLLECT_FINAL_PAYMENT'] };
        case 'SURVEY_FEE': return { create: [], completeTypes: ['COLLECT_SURVEY_FEE'] };
      }
      return EMPTY;

    case 'PO_RAISED':
      return { create: [], completeTypes: ['RAISE_PO'] };

    case 'READINESS_SUBMITTED':
      return { create: [spec('VERIFY_SITE_READY', ADMIN, due(now, DUE_DAYS.VERIFY_SITE_READY), 'SITE_READY', true)], completeTypes: ['SITE_READINESS'] };

    case 'READINESS_RETURNED':
      return { create: [spec('SITE_READINESS', customer, due(now, READINESS_RETURN_DAYS), 'SITE_READY', true)], completeTypes: ['VERIFY_SITE_READY'] };

    case 'SITE_READY_CONFIRMED': {
      const deliveryDue = event.poExpectedDate ?? due(now, DUE_DAYS.TRACK_DELIVERY);
      return {
        nextStage: 'DELIVERY',
        create: [
          spec('TRACK_DELIVERY', ADMIN, deliveryDue, 'DELIVERY', true),
          spec('COLLECT_DELIVERY_PAYMENT', ADMIN, addDays(new Date(deliveryDue), DUE_DAYS.COLLECT_DELIVERY_PAYMENT).toISOString(), 'DELIVERY'),
        ],
        completeTypes: ['VERIFY_SITE_READY', 'SITE_READINESS'],
      };
    }

    case 'MATERIAL_RECEIVED':
      return {
        nextStage: 'INSTALLATION',
        create: [event.technicianId
          ? spec('INSTALLATION', { id: event.technicianId, role: 'technician' }, due(now, DUE_DAYS.INSTALLATION), 'INSTALLATION', true)
          : spec('INSTALLATION', ADMIN, due(now, DUE_DAYS.INSTALLATION), 'INSTALLATION', true, 'Choose a technician for the installation')],
        completeTypes: ['TRACK_DELIVERY'],
      };

    case 'INSTALLATION_COMPLETED':
      return {
        nextStage: 'QC_HANDOVER',
        create: [event.qcUserId
          ? spec('QC_INSPECTION', { id: event.qcUserId, role: 'qc' }, due(now, DUE_DAYS.QC_INSPECTION), 'QC_HANDOVER', true)
          : spec('QC_INSPECTION', ADMIN, due(now, DUE_DAYS.QC_INSPECTION), 'QC_HANDOVER', true, 'Assign a QC inspector')],
        completeTypes: ['INSTALLATION'],
      };

    case 'QC_DECISION':
      if (event.decision === 'PASS') {
        return {
          create: [
            spec('HANDOVER', ADMIN, due(now, DUE_DAYS.HANDOVER), 'QC_HANDOVER', true),
            spec('COLLECT_FINAL_PAYMENT', ADMIN, due(now, DUE_DAYS.COLLECT_FINAL_PAYMENT), 'QC_HANDOVER'),
            spec('STATUTORY_LICENCE', ADMIN, due(now, DUE_DAYS.STATUTORY_LICENCE), 'QC_HANDOVER'),
          ],
          completeTypes: ['QC_INSPECTION'],
        };
      }
      if (event.decision === 'REWORK') {
        const tech: Assignee = event.technicianId ? { id: event.technicianId, role: 'technician' } : ADMIN;
        return {
          create: [spec('REWORK', tech, due(now, DUE_DAYS.REWORK), 'QC_HANDOVER', true, undefined, event.remarks)],
          completeTypes: ['QC_INSPECTION'],
        };
      }
      return {
        nextStatus: 'ON_HOLD',
        create: [spec('REVIEW_HOLD', ADMIN, due(now, QC_FAIL_REVIEW_DAYS), 'QC_HANDOVER', true, 'Review the QC failure (order on hold)')],
        completeTypes: ['QC_INSPECTION'],
      };

    case 'REWORK_COMPLETED':
      return {
        create: [event.qcUserId
          ? spec('QC_INSPECTION', { id: event.qcUserId, role: 'qc' }, due(now, DUE_DAYS.QC_INSPECTION), 'QC_HANDOVER', true)
          : spec('QC_INSPECTION', ADMIN, due(now, DUE_DAYS.QC_INSPECTION), 'QC_HANDOVER', true, 'Assign a QC inspector')],
        completeTypes: ['REWORK'],
      };

    case 'LICENCE_DONE':
      return { create: [], completeTypes: ['STATUTORY_LICENCE'] };

    case 'HANDOVER_COMPLETED':
      return {
        nextStage: 'AMC',
        nextStatus: 'COMPLETED',
        create: [spec('AMC_FOLLOW_UP', ADMIN, addDays(new Date(event.warrantyEnd), -AMC_REMINDER_DAYS).toISOString(), 'AMC', true)],
        completeTypes: ['HANDOVER'],
      };

    case 'ORDER_ON_HOLD':
      return {
        nextStatus: 'ON_HOLD',
        create: [spec('REVIEW_HOLD', ADMIN, event.reviewDate ?? due(now, DUE_DAYS.REVIEW_HOLD), order.stage, true)],
        completeTypes: [],
      };

    case 'ORDER_RESUMED':
      return { nextStatus: 'ACTIVE', create: [], completeTypes: ['REVIEW_HOLD'] };

    case 'ORDER_CANCELLED':
      return { nextStatus: 'CANCELLED', create: [], completeTypes: [], cancelOpenTasks: true };

    case 'EMERGENCY_RAISED':
      return {
        create: [spec('EMERGENCY_RESPONSE',
          event.onCallTechId ? { id: event.onCallTechId, role: 'technician' } : ADMIN,
          addMinutes(now, EMERGENCY_RESPONSE_MINUTES).toISOString(), order.stage, true)],
        completeTypes: [],
      };
  }
}

/** I-2: never create a second open task of the same type for the same order. */
export function dedupe(create: TaskSpec[], openTypes: TaskType[]): TaskSpec[] {
  const seen = new Set(openTypes);
  const out: TaskSpec[] = [];
  for (const s of create) {
    if (seen.has(s.type)) continue;
    seen.add(s.type);
    out.push(s);
  }
  return out;
}
