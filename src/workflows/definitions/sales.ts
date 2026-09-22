import type { WorkflowDefinition } from '../types';

/**
 * Sales workflow — Phase 03 skeleton, exact stages from
 * 03_WORKFLOW_STATE_MACHINE_AND_SCREEN_REGISTRY.md:
 *   Lead Created -> Qualification -> Assignment -> Follow-up ->
 *   Site Survey -> Customer/Site -> Quote
 */
export type SalesState =
  | 'lead_created'
  | 'qualification'
  | 'assignment'
  | 'follow_up'
  | 'site_survey'
  | 'customer_site_confirmed'
  | 'quote_started'
  | 'lost';

export const salesWorkflow: WorkflowDefinition<SalesState> = {
  key: 'sales',
  label: 'Sales — Lead to Quote',
  initialState: 'lead_created',
  states: [
    { key: 'lead_created', label: 'Lead Created' },
    { key: 'qualification', label: 'Qualification' },
    { key: 'assignment', label: 'Assignment' },
    { key: 'follow_up', label: 'Follow-up' },
    { key: 'site_survey', label: 'Site Survey' },
    { key: 'customer_site_confirmed', label: 'Customer/Site' },
    { key: 'quote_started', label: 'Quote', isTerminal: true },
    { key: 'lost', label: 'Lost', isFailureTerminal: true },
  ],
  transitions: [
    { from: 'lead_created', to: 'qualification', allowedRoles: ['admin', 'surveyor'], event: 'LEAD_QUALIFIED' },
    { from: 'qualification', to: 'assignment', allowedRoles: ['admin'], event: 'LEAD_ASSIGNED' },
    { from: 'assignment', to: 'follow_up', allowedRoles: ['surveyor'], event: 'FOLLOW_UP_STARTED' },
    { from: 'follow_up', to: 'site_survey', allowedRoles: ['surveyor'], event: 'SITE_SURVEY_SCHEDULED', entryCondition: 'customer contact confirmed' },
    { from: 'site_survey', to: 'customer_site_confirmed', allowedRoles: ['surveyor'], event: 'SITE_SURVEY_COMPLETED' },
    { from: 'customer_site_confirmed', to: 'quote_started', allowedRoles: ['surveyor', 'admin'], event: 'QUOTE_CREATED', entryCondition: 'Customer and Site records exist' },
    // Exception/loop paths: a lead can be marked lost from any pre-quote stage.
    { from: 'lead_created', to: 'lost', allowedRoles: ['admin', 'surveyor'], event: 'LEAD_LOST', isException: true },
    { from: 'qualification', to: 'lost', allowedRoles: ['admin', 'surveyor'], event: 'LEAD_LOST', isException: true },
    { from: 'assignment', to: 'lost', allowedRoles: ['admin', 'surveyor'], event: 'LEAD_LOST', isException: true },
    { from: 'follow_up', to: 'lost', allowedRoles: ['admin', 'surveyor'], event: 'LEAD_LOST', isException: true },
    { from: 'site_survey', to: 'lost', allowedRoles: ['admin', 'surveyor'], event: 'LEAD_LOST', isException: true },
    // Follow-up can loop on itself (re-attempt) rather than being forced linear.
    { from: 'follow_up', to: 'follow_up', allowedRoles: ['surveyor'], event: 'FOLLOW_UP_REATTEMPTED', isException: true },
  ],
};
