/**
 * MVP pure functions: stage mapping (D-03), progress (D-10), health (D-11),
 * money (D-14, D-15). No repository, no clock: every input is explicit.
 * Run: npx tsx scripts/mvp/pure-check.ts
 */
import { check, eq, summary } from './assert';
import { fromMvpStage, isForwardMove, toMvpStage } from '../../src/mvp/stage';
import { computeProgress } from '../../src/mvp/progress';
import { computeHealth, pickCurrentTask } from '../../src/mvp/health';
import { defaultMilestoneAmounts, formatInr, isBelowMinimum, marginMeasures, quotePricing } from '../../src/mvp/money';
import { MVP_STAGES, type MvpMilestone, type MvpTask } from '../../src/mvp/types';
import type { ProjectStage } from '../../src/domain/entities';

// --- Stage mapping (D-03): every legacy value maps, and every MVP stage round-trips.
const legacy: [ProjectStage, string][] = [
  ['lead', 'LEAD'], ['customer_site_confirmed', 'QUALIFIED'], ['survey', 'SURVEY'], ['quoting', 'QUOTE'], ['negotiation', 'QUOTE'],
  ['contract', 'BOOKED'], ['payment', 'BOOKED'], ['site_ready', 'SITE_READY'], ['procurement', 'DELIVERY'], ['production', 'DELIVERY'],
  ['delivery', 'DELIVERY'], ['installation', 'INSTALLATION'], ['qc', 'QC_HANDOVER'], ['handover', 'QC_HANDOVER'],
  ['warranty_amc', 'AMC'], ['service', 'AMC'],
];
for (const [from, to] of legacy) eq(toMvpStage(from), to, `toMvpStage(${from}) = ${to}`);
for (const s of MVP_STAGES) eq(toMvpStage(fromMvpStage(s)), s, `${s} round-trips through ProjectStage`);
check(isForwardMove('QUOTE', 'BOOKED') && !isForwardMove('BOOKED', 'QUOTE'), 'stages only move forward (I-4)');

// --- Progress (D-10)
const p = (stage: any, extra = {}) => computeProgress({ stage, ...extra });
eq([p('LEAD'), p('QUALIFIED'), p('SURVEY'), p('QUOTE'), p('BOOKED'), p('SITE_READY'), p('DELIVERY')], [0, 5, 10, 20, 30, 40, 50], 'fixed stage progress');
eq(p('INSTALLATION', { checklistDone: 0 }), 55, 'installation with 0 of 11 = 55');
eq(p('INSTALLATION', { checklistDone: 6 }), 71, 'installation with 6 of 11 = 71 (S1 step 13a)');
eq(p('INSTALLATION', { checklistDone: 11 }), 85, 'installation with 11 of 11 = 85');
eq(p('QC_HANDOVER'), 90, 'QC_HANDOVER before pass = 90');
eq(p('QC_HANDOVER', { qcPassed: true }), 95, 'QC_HANDOVER after pass = 95');
eq(p('AMC'), 100, 'AMC = 100');

// --- Health (D-11), first matching rule wins
const now = new Date('2026-10-01T06:00:00.000Z');
const inH = (h: number) => new Date(now.getTime() + h * 3600e3).toISOString();
const task = (dueHours: number, status: MvpTask['status'] = 'TODO') => ({ dueDate: inH(dueHours), status });
const ms = (dueHours: number | null, status: MvpMilestone['status'] = 'PENDING') => ({ dueDate: dueHours === null ? undefined : inH(dueHours), status }) as MvpMilestone;
const h = (o: Partial<Parameters<typeof computeHealth>[0]>) => computeHealth({ status: 'ACTIVE', hasOpenBlocker: false, currentTask: task(72), milestones: [], now, ...o });
eq(h({ status: 'ON_HOLD', hasOpenBlocker: true }), 'ON_HOLD', 'ON_HOLD wins over everything');
eq(h({ hasOpenBlocker: true, currentTask: task(-5) }), 'BLOCKED', 'an open blocker beats overdue');
eq(h({ currentTask: task(-1) }), 'OVERDUE', 'current task past due = OVERDUE');
eq(h({ currentTask: null }), 'OVERDUE', 'NO NEXT ACTION = OVERDUE');
eq(h({ currentTask: task(10) }), 'AT_RISK', 'TODO due within 24 h = AT_RISK');
eq(h({ currentTask: task(10, 'IN_PROGRESS') }), 'ON_TRACK', 'in-progress task due within 24 h is not at risk');
eq(h({ milestones: [ms(-2)] }), 'AT_RISK', 'a past-due payment milestone = AT_RISK');
eq(h({ milestones: [ms(-2, 'PAID'), ms(null)] }), 'ON_TRACK', 'paid or undated milestones do not count');
eq(h({}), 'ON_TRACK', 'otherwise ON_TRACK');

// --- Current task: primary task first, then earliest due (D-06 + S1 step 7)
const mk = (id: string, type: string, priority: number, dueHours: number, stage = 'SITE_READY', status = 'TODO') =>
  ({ id, type, priority, dueDate: inH(dueHours), stage, status, createdAt: inH(0) }) as unknown as MvpTask;
const current = pickCurrentTask([mk('a', 'RAISE_PO', 1, 48), mk('b', 'SITE_READINESS', 0, 14 * 24), mk('c', 'X', 0, 1, 'BOOKED')], 'SITE_READY');
eq(current?.id, 'b', 'SITE_READINESS (primary) is current even though RAISE_PO is due sooner');
eq(pickCurrentTask([mk('a', 'X', 0, 1, 'SITE_READY', 'COMPLETED')], 'SITE_READY'), null, 'no open task in stage = none');

// --- Money (fixture order, ACCEPTANCE_SCENARIOS)
const lines = { baseLift: 780000, installation: 140000, freight: 50000, other: 30000 };
const price = quotePricing(lines, 18); // 18 is a FIXTURE value only ⚖ VERIFY
eq(price, { totalExclTax: 1000000, taxAmount: 180000, sellingPrice: 1180000 }, 'fixture quote = ₹11,80,000');
eq(marginMeasures(1000000, 800000), { grossMarginPct: 20, markupPct: 25 }, 'cost ₹8,00,000 → margin 20%, markup 25%');
check(!isBelowMinimum(25), 'markup 25% passes the 20% floor');
const low = marginMeasures(1000000, 850000);
eq(low.markupPct, 17.6, 'cost ₹8,50,000 → markup 17.6%');
check(isBelowMinimum(low.markupPct), 'markup 17.6% needs Admin approval');
eq(defaultMilestoneAmounts(1180000), { BOOKING_TOKEN: 10000, DELIVERY: 1052000, FINAL: 118000 }, 'milestones 10,000 / 10,52,000 / 1,18,000');
eq(formatInr(1180000), '₹11,80,000', 'en-IN rupee format');

summary('mvp pure check');
