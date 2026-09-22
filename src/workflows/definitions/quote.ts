import type { WorkflowDefinition } from '../types';

/**
 * Quote workflow — exact stages from Phase 03:
 *   Requirements -> Configuration -> Pricing/Margin -> Internal Approval ->
 *   Preview -> Send -> Negotiation -> Counter Approval -> Customer
 *   Acceptance -> Contract -> E-sign -> Closure
 */
export type QuoteState =
  | 'requirements'
  | 'configuration'
  | 'pricing_margin'
  | 'internal_approval'
  | 'preview'
  | 'sent'
  | 'negotiation'
  | 'counter_approval'
  | 'customer_acceptance'
  | 'contract'
  | 'e_sign'
  | 'closure'
  | 'rejected';

export const quoteWorkflow: WorkflowDefinition<QuoteState> = {
  key: 'quote',
  label: 'Quote — Requirements to Closure',
  initialState: 'requirements',
  states: [
    { key: 'requirements', label: 'Requirements' },
    { key: 'configuration', label: 'Configuration' },
    { key: 'pricing_margin', label: 'Pricing/Margin' },
    { key: 'internal_approval', label: 'Internal Approval' },
    { key: 'preview', label: 'Preview' },
    { key: 'sent', label: 'Send' },
    { key: 'negotiation', label: 'Negotiation' },
    { key: 'counter_approval', label: 'Counter Approval' },
    { key: 'customer_acceptance', label: 'Customer Acceptance' },
    { key: 'contract', label: 'Contract' },
    { key: 'e_sign', label: 'E-sign' },
    { key: 'closure', label: 'Closure', isTerminal: true },
    { key: 'rejected', label: 'Rejected', isFailureTerminal: true },
  ],
  transitions: [
    { from: 'requirements', to: 'configuration', allowedRoles: ['admin', 'surveyor'], event: 'QUOTE_REQUIREMENTS_CAPTURED' },
    { from: 'configuration', to: 'pricing_margin', allowedRoles: ['admin', 'surveyor'], event: 'QUOTE_CONFIGURED' },
    { from: 'pricing_margin', to: 'internal_approval', allowedRoles: ['admin', 'surveyor'], event: 'QUOTE_PRICED', entryCondition: 'quote.discount permission required if discount applied' },
    { from: 'internal_approval', to: 'preview', allowedRoles: ['admin'], event: 'QUOTE_APPROVED', entryCondition: 'quote.approve permission' },
    { from: 'preview', to: 'sent', allowedRoles: ['admin', 'surveyor'], event: 'QUOTE_SENT' },
    { from: 'sent', to: 'negotiation', allowedRoles: ['customer', 'admin', 'surveyor'], event: 'QUOTE_COUNTERED' },
    { from: 'sent', to: 'customer_acceptance', allowedRoles: ['customer'], event: 'QUOTE_ACCEPTED' },
    { from: 'negotiation', to: 'counter_approval', allowedRoles: ['admin', 'surveyor'], event: 'COUNTER_OFFER_SUBMITTED' },
    { from: 'counter_approval', to: 'sent', allowedRoles: ['admin'], event: 'COUNTER_OFFER_APPROVED', entryCondition: 'quote.approve permission; creates new QuoteVersion' },
    { from: 'counter_approval', to: 'negotiation', allowedRoles: ['admin'], event: 'COUNTER_OFFER_REJECTED', isException: true },
    { from: 'customer_acceptance', to: 'contract', allowedRoles: ['system'], event: 'QUOTE_ACCEPTED', entryCondition: 'automation creates Contract (Phase 07)' },
    { from: 'contract', to: 'e_sign', allowedRoles: ['admin', 'customer'], event: 'CONTRACT_SENT_FOR_SIGNATURE' },
    { from: 'e_sign', to: 'closure', allowedRoles: ['system'], event: 'CONTRACT_SIGNED' },
    // Exception/loop paths.
    { from: 'sent', to: 'rejected', allowedRoles: ['customer'], event: 'QUOTE_REJECTED', isException: true },
    { from: 'negotiation', to: 'rejected', allowedRoles: ['customer', 'admin'], event: 'QUOTE_REJECTED', isException: true },
    { from: 'negotiation', to: 'negotiation', allowedRoles: ['customer', 'admin', 'surveyor'], event: 'QUOTE_COUNTERED_AGAIN', isException: true },
  ],
};
