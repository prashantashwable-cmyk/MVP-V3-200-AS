/**
 * The MVP lead (D-04 as changed in Step 02, audit R-1): the existing Firestore `leads`
 * document shape (legacy `Lead`) extended additively with the spec §13 fields.
 */

import type { Lead, LeadStage } from '../types';

export type MvpLeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'SURVEY' | 'QUOTE' | 'WON' | 'LOST';

export interface MvpLead extends Lead {
  ownerUserId?: string;
  source?: string;
  liftRequirement?: string;
  notes?: string;
  nextFollowUp?: string;
  mvpStatus?: MvpLeadStatus;
  projectId?: string;
  consentAt?: string;
  lostReasonText?: string;
  /** 10-digit mobile, for the duplicate warning (spec §23). */
  phoneNormalized?: string;
  /** Site photos as DocumentRecord ids (D-16 as changed: inline in `documents`). */
  photoIds?: string[];
  version?: number;
}

/** D-04 mapping from spec lead statuses to the legacy `stage`. */
export const LEGACY_STAGE_FOR: Record<MvpLeadStatus, LeadStage> = {
  NEW: 'captured', CONTACTED: 'contacted', QUALIFIED: 'assigned', SURVEY: 'survey_done',
  QUOTE: 'quoted', WON: 'closed_won', LOST: 'closed_lost',
};

const MVP_STATUS_FOR: Record<LeadStage, MvpLeadStatus> = {
  captured: 'NEW', assigned: 'QUALIFIED', contacted: 'CONTACTED', survey_done: 'SURVEY',
  quoted: 'QUOTE', negotiating: 'QUOTE', closed_won: 'WON', closed_lost: 'LOST',
};

/** Old lead documents have no `mvpStatus`; derive it from the legacy stage. */
export function leadStatus(lead: Pick<MvpLead, 'mvpStatus' | 'stage'>): MvpLeadStatus {
  return lead.mvpStatus ?? MVP_STATUS_FOR[lead.stage] ?? 'NEW';
}

export function leadOwner(lead: Pick<MvpLead, 'ownerUserId' | 'surveyorId'>): string | undefined {
  return lead.ownerUserId ?? lead.surveyorId;
}
