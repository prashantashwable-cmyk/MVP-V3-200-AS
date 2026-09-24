/** The 10 MVP stages and their mapping from the legacy `ProjectStage` (D-03). Pure. */

import type { MvpStage, ProjectStage } from '../domain/entities';

export const MVP_STAGES: MvpStage[] = [
  'LEAD', 'QUALIFIED', 'SURVEY', 'QUOTE', 'BOOKED', 'SITE_READY', 'DELIVERY', 'INSTALLATION', 'QC_HANDOVER', 'AMC',
];

export const MVP_STAGE_LABELS: Record<MvpStage, string> = {
  LEAD: 'Lead', QUALIFIED: 'Qualified', SURVEY: 'Survey', QUOTE: 'Quote', BOOKED: 'Booked',
  SITE_READY: 'Site ready', DELIVERY: 'Delivery', INSTALLATION: 'Installation', QC_HANDOVER: 'QC & handover', AMC: 'AMC',
};

const FROM_PROJECT_STAGE: Record<ProjectStage, MvpStage> = {
  lead: 'LEAD',
  customer_site_confirmed: 'QUALIFIED',
  survey: 'SURVEY',
  quoting: 'QUOTE',
  negotiation: 'QUOTE',
  contract: 'BOOKED',
  payment: 'BOOKED',
  site_ready: 'SITE_READY',
  procurement: 'DELIVERY',
  production: 'DELIVERY',
  delivery: 'DELIVERY',
  installation: 'INSTALLATION',
  qc: 'QC_HANDOVER',
  handover: 'QC_HANDOVER',
  warranty_amc: 'AMC',
  service: 'AMC',
  // A lost project has no MVP stage of its own; it shows where it stopped via status instead.
  closed_lost: 'LEAD',
};

/** The legacy value the MVP writes for each MVP stage. */
export const TO_PROJECT_STAGE: Record<MvpStage, ProjectStage> = {
  LEAD: 'lead',
  QUALIFIED: 'customer_site_confirmed',
  SURVEY: 'survey',
  QUOTE: 'quoting',
  BOOKED: 'contract',
  SITE_READY: 'site_ready',
  DELIVERY: 'delivery',
  INSTALLATION: 'installation',
  QC_HANDOVER: 'qc',
  AMC: 'warranty_amc',
};

export function toMvpStage(stage: ProjectStage): MvpStage {
  return FROM_PROJECT_STAGE[stage] ?? 'LEAD';
}

export function stageIndex(stage: MvpStage): number {
  return MVP_STAGES.indexOf(stage);
}

/** Stages only move forward (D-03); going back needs an audited Admin override. */
export function isForward(from: MvpStage, to: MvpStage): boolean {
  return stageIndex(to) >= stageIndex(from);
}
