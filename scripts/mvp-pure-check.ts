/**
 * MVP pure-function check (Step 03): stage mapping (D-03), progress (D-10) including the
 * 71% example, health (D-11, all five rules) and the current-task rule (D-06).
 * Run with: npx tsx scripts/mvp-pure-check.ts
 */
import { check, done } from './mvp/fixtures';
import { toMvpStage, TO_PROJECT_STAGE, MVP_STAGES, isForward } from '../src/mvp/stage';
import { computeProgress } from '../src/mvp/progress';
import { computeHealth, currentTask } from '../src/mvp/health';
import { formatInr } from '../src/mvp/format';
import { GST_RATE_PCT, MIN_MARKUP_PCT, SURVEY_FEE_INR, DUE_DAYS } from '../src/mvp/config';
import type { ProjectStage, MvpStage } from '../src/domain/entities';

// --- D-03 stage mapping ---
const expected: Record<ProjectStage, MvpStage> = {
  lead: 'LEAD', customer_site_confirmed: 'QUALIFIED', survey: 'SURVEY', quoting: 'QUOTE', negotiation: 'QUOTE',
  contract: 'BOOKED', payment: 'BOOKED', site_ready: 'SITE_READY', procurement: 'DELIVERY', production: 'DELIVERY',
  delivery: 'DELIVERY', installation: 'INSTALLATION', qc: 'QC_HANDOVER', handover: 'QC_HANDOVER',
  warranty_amc: 'AMC', service: 'AMC', closed_lost: 'LEAD',
};
for (const [legacy, mvp] of Object.entries(expected)) check(toMvpStage(legacy as ProjectStage) === mvp, `toMvpStage(${legacy}) = ${mvp}`);
for (const s of MVP_STAGES) check(toMvpStage(TO_PROJECT_STAGE[s]) === s, `round trip ${s}`);
check(isForward('QUOTE', 'BOOKED') && !isForward('BOOKED', 'QUOTE'), 'stages only move forward');

// --- D-10 progress ---
const base: [MvpStage, number][] = [['LEAD', 0], ['QUALIFIED', 5], ['SURVEY', 10], ['QUOTE', 20], ['BOOKED', 30], ['SITE_READY', 40], ['DELIVERY', 50], ['AMC', 100]];
for (const [s, p] of base) check(computeProgress({ stage: s }) === p, `progress ${s} = ${p}`);
check(computeProgress({ stage: 'INSTALLATION', checklistDone: 0 }) === 55, 'progress INSTALLATION 0/11 = 55');
check(computeProgress({ stage: 'INSTALLATION', checklistDone: 6 }) === 71, 'progress INSTALLATION 6/11 = 71 (S1 step 13a)');
check(computeProgress({ stage: 'INSTALLATION', checklistDone: 11 }) === 85, 'progress INSTALLATION 11/11 = 85');
check(computeProgress({ stage: 'QC_HANDOVER' }) === 90 && computeProgress({ stage: 'QC_HANDOVER', qcPassed: true }) === 95, 'progress QC 90 / 95 after pass');

// --- D-06 current task + D-11 health ---
const now = new Date('2026-10-01T04:30:00Z');
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();
const t = (type: string, stage: MvpStage, dueDays: number, status = 'TODO', primary = false) =>
  ({ type, stage, dueDate: inDays(dueDays), status, primary } as any);

const siteReadyTasks = [t('RAISE_PO', 'SITE_READY', 2), t('SITE_READINESS', 'SITE_READY', 14, 'TODO', true)];
check(currentTask(siteReadyTasks, 'SITE_READY')?.type === 'SITE_READINESS', 'current task prefers the primary task (S1 step 7)');
check(currentTask([t('X', 'QUOTE', 1)], 'BOOKED')?.type === 'X', 'current task falls back to any open task');
check(currentTask([t('X', 'QUOTE', 1, 'COMPLETED')], 'QUOTE') === undefined, 'no open task = NO NEXT ACTION');

const h = (over: Partial<Parameters<typeof computeHealth>[0]>) => computeHealth({
  status: 'ACTIVE', stage: 'SITE_READY', tasks: siteReadyTasks, openBlockerCount: 0, milestones: [], now, ...over,
});
check(h({}) === 'ON_TRACK', 'health ON_TRACK');
check(h({ status: 'ON_HOLD', openBlockerCount: 1 }) === 'ON_HOLD', 'health rule 1: ON_HOLD wins');
check(h({ openBlockerCount: 1 }) === 'BLOCKED', 'health rule 2: open blocker → BLOCKED');
check(h({ now: new Date(now.getTime() + 15 * 86_400_000) }) === 'OVERDUE', 'health rule 3: current task past due → OVERDUE (S2)');
check(h({ tasks: [] }) === 'OVERDUE', 'health rule 3: NO NEXT ACTION → OVERDUE');
check(h({ tasks: [t('SITE_READINESS', 'SITE_READY', 0.5, 'TODO', true)] }) === 'AT_RISK', 'health rule 4: due within 24h and TODO → AT_RISK');
check(h({ tasks: [t('SITE_READINESS', 'SITE_READY', 0.5, 'IN_PROGRESS', true)] }) === 'ON_TRACK', 'due within 24h but IN_PROGRESS → ON_TRACK');
check(h({ tasks: [t('ASSIGN_SURVEYOR', 'SITE_READY', 1, 'TODO', true)] }) === 'ON_TRACK', 'a TODO task due in exactly 24h is not yet at risk (strict window)');
check(h({ milestones: [{ status: 'PENDING', dueDate: inDays(-1) }] }) === 'AT_RISK', 'health rule 4: payment past due → AT_RISK (S5)');
check(h({ milestones: [{ status: 'PAID', dueDate: inDays(-1) }] }) === 'ON_TRACK', 'paid milestone is never at risk');

// --- config and format sanity ---
check(GST_RATE_PCT === null, 'GST rate is not hard-coded (⚖ VERIFY, D-15)');
check(MIN_MARKUP_PCT === 20 && SURVEY_FEE_INR === 0, 'MIN_MARKUP_PCT 20, survey fee off');
check(DUE_DAYS.SITE_READINESS === 14 && DUE_DAYS.STATUTORY_LICENCE === 30, 'due-date defaults per D-08');
check(formatInr(1180000) === '₹11,80,000', 'en-IN rupee format');

done('mvp-pure-check');
