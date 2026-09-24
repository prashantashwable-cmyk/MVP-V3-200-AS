/** Deterministic progress % (D-10). Pure. */

import type { MvpStage } from '../domain/entities';
import { CHECKLIST_ITEM_COUNT } from './config';

const BASE: Record<MvpStage, number> = {
  LEAD: 0, QUALIFIED: 5, SURVEY: 10, QUOTE: 20, BOOKED: 30, SITE_READY: 40, DELIVERY: 50,
  INSTALLATION: 55, QC_HANDOVER: 90, AMC: 100,
};

export function computeProgress(input: { stage: MvpStage; checklistDone?: number; qcPassed?: boolean }): number {
  if (input.stage === 'INSTALLATION') {
    const done = Math.max(0, Math.min(CHECKLIST_ITEM_COUNT, input.checklistDone ?? 0));
    return Math.round(55 + (30 * done) / CHECKLIST_ITEM_COUNT);
  }
  if (input.stage === 'QC_HANDOVER') return input.qcPassed ? 95 : 90;
  return BASE[input.stage];
}
