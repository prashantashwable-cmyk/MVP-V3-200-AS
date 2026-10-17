/** Deterministic progress % (D-10). */
import type { MvpStage } from './types';

const FIXED: Partial<Record<MvpStage, number>> = {
  LEAD: 0, QUALIFIED: 5, SURVEY: 10, QUOTE: 20, BOOKED: 30, SITE_READY: 40, DELIVERY: 50, AMC: 100,
};

export interface ProgressInput {
  stage: MvpStage;
  checklistDone?: number;
  checklistTotal?: number;
  qcPassed?: boolean;
}

export function computeProgress({ stage, checklistDone = 0, checklistTotal = 11, qcPassed = false }: ProgressInput): number {
  if (stage === 'INSTALLATION') {
    const ratio = checklistTotal > 0 ? Math.min(checklistDone, checklistTotal) / checklistTotal : 0;
    return Math.round(55 + 30 * ratio);
  }
  if (stage === 'QC_HANDOVER') return qcPassed ? 95 : 90;
  return FIXED[stage] ?? 0;
}
