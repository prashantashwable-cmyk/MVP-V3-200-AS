import type { WorkflowDefinition } from '../types';

/**
 * Payment workflow — exact stages from Phase 03:
 *   Payment Schedule -> Installment Due -> Payment/Loan Path ->
 *   Payment Confirmation -> Receipt -> Ledger -> Reconciliation
 *
 * Payment/loan is modelled as two parallel paths converging back into
 * Payment Confirmation, per Phase 08's "support loan/EMI as an
 * alternative payment path" and Phase 03's "must be alternative paths,
 * not accidental screen jumps".
 */
export type PaymentState =
  | 'schedule_created'
  | 'installment_due'
  | 'direct_payment_initiated'
  | 'loan_application_in_progress'
  | 'payment_confirmed'
  | 'receipt_issued'
  | 'ledger_posted'
  | 'reconciled'
  | 'payment_failed'
  | 'disputed';

export const paymentWorkflow: WorkflowDefinition<PaymentState> = {
  key: 'payment',
  label: 'Payment — Schedule to Reconciliation',
  initialState: 'schedule_created',
  states: [
    { key: 'schedule_created', label: 'Payment Schedule' },
    { key: 'installment_due', label: 'Installment Due' },
    { key: 'direct_payment_initiated', label: 'Payment Path (direct)' },
    { key: 'loan_application_in_progress', label: 'Payment Path (loan/EMI)' },
    { key: 'payment_confirmed', label: 'Payment Confirmation' },
    { key: 'receipt_issued', label: 'Receipt' },
    { key: 'ledger_posted', label: 'Ledger' },
    { key: 'reconciled', label: 'Reconciliation', isTerminal: true },
    { key: 'payment_failed', label: 'Payment Failed', isFailureTerminal: true },
    { key: 'disputed', label: 'Disputed' },
  ],
  transitions: [
    { from: 'schedule_created', to: 'installment_due', allowedRoles: ['system'], event: 'PAYMENT_DUE' },
    { from: 'installment_due', to: 'direct_payment_initiated', allowedRoles: ['customer', 'admin'], event: 'PAYMENT_INITIATED' },
    { from: 'installment_due', to: 'loan_application_in_progress', allowedRoles: ['customer', 'admin'], event: 'LOAN_APPLICATION_STARTED' },
    { from: 'direct_payment_initiated', to: 'payment_confirmed', allowedRoles: ['system'], event: 'PAYMENT_RECEIVED', entryCondition: 'idempotencyKey required (Phase 06)' },
    { from: 'loan_application_in_progress', to: 'payment_confirmed', allowedRoles: ['system'], event: 'PAYMENT_RECEIVED', entryCondition: 'loan disbursed; idempotencyKey required' },
    { from: 'payment_confirmed', to: 'receipt_issued', allowedRoles: ['system'], event: 'RECEIPT_ISSUED' },
    { from: 'receipt_issued', to: 'ledger_posted', allowedRoles: ['system'], event: 'LEDGER_POSTED' },
    { from: 'ledger_posted', to: 'reconciled', allowedRoles: ['admin', 'system'], event: 'PAYMENT_RECONCILED' },
    // Exception/loop paths.
    { from: 'direct_payment_initiated', to: 'payment_failed', allowedRoles: ['system'], event: 'PAYMENT_FAILED', isException: true },
    { from: 'loan_application_in_progress', to: 'payment_failed', allowedRoles: ['system'], event: 'LOAN_REJECTED', isException: true },
    { from: 'payment_failed', to: 'installment_due', allowedRoles: ['customer', 'admin'], event: 'PAYMENT_RETRIED', isException: true },
    { from: 'payment_confirmed', to: 'disputed', allowedRoles: ['customer', 'admin'], event: 'PAYMENT_DISPUTED', isException: true },
    { from: 'disputed', to: 'payment_confirmed', allowedRoles: ['admin'], event: 'DISPUTE_RESOLVED', isException: true },
    { from: 'ledger_posted', to: 'disputed', allowedRoles: ['admin'], event: 'RECONCILIATION_MISMATCH', isException: true },
    { from: 'installment_due', to: 'installment_due', allowedRoles: ['system'], event: 'PAYMENT_OVERDUE', isException: true },
  ],
};
