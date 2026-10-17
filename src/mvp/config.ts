/**
 * Every MVP default in one place (D-09). Due dates shown in the UI always
 * come from a task, and every task's due date comes from this table.
 */
import type { TaskType } from './types';

/** Days from the triggering event to the task's due date (D-08). */
export const DUE_DAYS: Partial<Record<TaskType, number>> = {
  QUALIFY_LEAD: 2,
  ASSIGN_SURVEYOR: 1,
  COLLECT_SURVEY_FEE: 2,
  SURVEY: 3,
  SITE_CORRECTION: 14,
  REVIEW_NOT_FEASIBLE: 1,
  PREPARE_QUOTE: 2,
  APPROVE_MARGIN: 1,
  QUOTE_DECISION: 7,
  COLLECT_BOOKING_TOKEN: 3,
  SITE_READINESS: 14,
  RAISE_PO: 2,
  VERIFY_SITE_READY: 1,
  TRACK_DELIVERY: 7, // used only when no PO expected-delivery date exists
  COLLECT_DELIVERY_PAYMENT: 2,
  INSTALLATION: 21,
  QC_INSPECTION: 2,
  REWORK: 3,
  HANDOVER: 3,
  COLLECT_FINAL_PAYMENT: 3,
  STATUTORY_LICENCE: 30,
  REVIEW_HOLD: 1,
  SET_NEXT_TASK: 1,
};

export const MVP_CONFIG = {
  /** Default blocker due date (D-07). */
  BLOCKER_DUE_DAYS: 2,
  /** D-28 ⚖ VERIFY the right target. */
  EMERGENCY_RESPONSE_MINUTES: 45,
  /** D-15: minimum markup %. */
  MIN_MARKUP_PCT: 20,
  /**
   * D-15 ⚖ VERIFY with a CA. Deliberately unset: quotes show "tax rate not
   * confirmed" until the Owner sets it here or in Settings. Never hard-code.
   */
  GST_RATE_PCT: null as number | null,
  /** D-14 default milestones. */
  BOOKING_TOKEN_INR: 10_000,
  DELIVERY_PCT_OF_TOTAL: 90,
  /** D-26 ⚖ VERIFY against the customer agreement. */
  WARRANTY_MONTHS: 12,
  AMC_DUE_DAYS_BEFORE_WARRANTY_END: 90,
  /** D-30: 0 means off. */
  SURVEY_FEE_INR: 0,
  /** D-16 */
  MAX_EVIDENCE_BYTES: 10 * 1024 * 1024,
  TIME_ZONE: 'Asia/Kolkata',
  /** D-28 ⚖ VERIFY the wording. */
  EMERGENCY_TRAPPED_MESSAGE: 'If someone is trapped and unwell, call 112 now.',
  /** Shown until the Owner sets a real number in Settings. */
  EMERGENCY_PHONE_FALLBACK: '112',
};

/** D-22: MVP navigation is on unless the build sets VITE_MVP_MODE=false or an admin turns it off in this browser. */
export function isMvpModeOn(): boolean {
  const env = typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_MVP_MODE : undefined;
  if (env === 'false') return false;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('aiec_mvp_mode') === 'off') return false;
  } catch { /* storage unavailable: keep the default */ }
  return true;
}
