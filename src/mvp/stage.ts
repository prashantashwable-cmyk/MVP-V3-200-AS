/** The 10 MVP stages and their mapping onto the canonical `ProjectStage` (D-03). */
import type { ProjectStage } from '../domain/entities';
import { MVP_STAGES, type MvpStage } from './types';

const TO_MVP: Record<ProjectStage, MvpStage> = {
  lead: 'LEAD',
  closed_lost: 'LEAD',
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
};

/** The canonical value written when an order enters an MVP stage. */
const FROM_MVP: Record<MvpStage, ProjectStage> = {
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

export const STAGE_LABELS: Record<MvpStage, string> = {
  LEAD: 'Lead', QUALIFIED: 'Qualified', SURVEY: 'Survey', QUOTE: 'Quote', BOOKED: 'Booked',
  SITE_READY: 'Site ready', DELIVERY: 'Delivery', INSTALLATION: 'Installation', QC_HANDOVER: 'QC & Handover', AMC: 'AMC',
};

export function toMvpStage(stage: ProjectStage): MvpStage {
  return TO_MVP[stage] ?? 'LEAD';
}

export function fromMvpStage(stage: MvpStage): ProjectStage {
  return FROM_MVP[stage];
}

export function stageIndex(stage: MvpStage): number {
  return MVP_STAGES.indexOf(stage);
}

/** Stages only move forward (D-03); going back needs an audited Admin override. */
export function isForwardMove(from: MvpStage, to: MvpStage): boolean {
  return stageIndex(to) >= stageIndex(from);
}
