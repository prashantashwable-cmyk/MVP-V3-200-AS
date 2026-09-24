/**
 * MVP configuration — the single place for defaults (D-09, D-14, D-15, D-26, D-28, D-30).
 * Change a value here, not in a screen. Legal/tax values are marked ⚖ VERIFY.
 */

import type { TaskType } from '../domain/entities';

const env: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' ? ((import.meta as any).env ?? {}) : {};

/** Days (or minutes where noted) from the triggering event to the task's due date (D-08/D-09). */
export const DUE_DAYS: Record<TaskType, number> = {
  QUALIFY_LEAD: 2,
  ASSIGN_SURVEYOR: 1,
  COLLECT_SURVEY_FEE: 2,
  SURVEY: 3, // default when no survey date is picked
  SITE_CORRECTION: 14,
  REVIEW_NOT_FEASIBLE: 1,
  PREPARE_QUOTE: 2,
  APPROVE_MARGIN: 1,
  QUOTE_DECISION: 7,
  COLLECT_BOOKING_TOKEN: 3,
  SITE_READINESS: 14, // the "2-week rule"
  RAISE_PO: 2,
  VERIFY_SITE_READY: 1,
  TRACK_DELIVERY: 14, // fallback when the PO has no expected date
  COLLECT_DELIVERY_PAYMENT: 2, // after the delivery date
  INSTALLATION: 21,
  QC_INSPECTION: 2,
  REWORK: 3,
  HANDOVER: 3,
  COLLECT_FINAL_PAYMENT: 3,
  STATUTORY_LICENCE: 30, // ⚖ VERIFY the usual timeline with the lift inspector (D-29)
  AMC_FOLLOW_UP: 0, // computed: warranty end − AMC_REMINDER_DAYS
  REVIEW_HOLD: 7, // fallback when no review date is given
  EMERGENCY_RESPONSE: 0, // minutes-based, see EMERGENCY_RESPONSE_MINUTES
  REVIEW_ORDER: 1,
};

/** Extra time the customer gets when the Admin returns the site-readiness photos. */
export const READINESS_RETURN_DAYS = 7;
/** Review due date for an order put on hold by a QC FAIL. */
export const QC_FAIL_REVIEW_DAYS = 1;
/** D-11: a TODO current task due within this many hours makes the order AT_RISK. */
export const AT_RISK_WINDOW_HOURS = 24;

export const EMERGENCY_RESPONSE_MINUTES = 45; // ⚖ VERIFY the right response target (D-28)
export const BLOCKER_DUE_DAYS = 2; // D-07

/** D-15: minimum markup % before Admin approval is required (Owner's "minimum 20% margin"). */
export const MIN_MARKUP_PCT = 20;

/**
 * D-15 ⚖ VERIFY: the GST rate must be confirmed by the Owner's CA. Never hard-code it in a screen.
 * `null` = not configured: the quote builder asks the Admin for a rate and shows a warning.
 */
export const GST_RATE_PCT: number | null =
  env.VITE_GST_RATE_PCT !== undefined && env.VITE_GST_RATE_PCT !== '' ? Number(env.VITE_GST_RATE_PCT) : null;
export const GST_RATE_CONFIRMED = env.VITE_GST_RATE_CONFIRMED === 'true';

/** D-14 default milestones. */
export const BOOKING_TOKEN_INR = 10_000;
export const DELIVERY_PAYMENT_PCT = 90; // of the selling price incl. tax, minus the token
export const FINAL_PAYMENT_PCT = 10;

/** D-30: 0 = survey fee off. */
export const SURVEY_FEE_INR = 0;

/** D-26 ⚖ VERIFY against the customer agreement. */
export const WARRANTY_MONTHS = 12;
export const AMC_REMINDER_DAYS = 90;

/** D-28: the company's emergency number (Owner to provide; empty = not configured). */
export const EMERGENCY_PHONE = env.VITE_EMERGENCY_PHONE ?? '';
export const EMERGENCY_112_LINE = 'If someone is trapped and unwell, call 112 now.'; // ⚖ VERIFY wording

/** D-16 as changed: evidence is stored inline, so each file must stay under this size. */
export const MAX_EVIDENCE_BYTES = 900 * 1024;

export const TIME_ZONE = 'Asia/Kolkata';

/** Number of installation checklist items (spec §18). */
export const CHECKLIST_ITEM_COUNT = 11;
