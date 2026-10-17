/** Deterministic health (D-11) and the current-task rule (D-06). */
import { OPEN_TASK_STATUSES, type Health, type MvpMilestone, type MvpStage, type MvpTask, type OrderStatus } from './types';

const HOUR = 60 * 60 * 1000;

export function isOpenTask(t: Pick<MvpTask, 'status'>): boolean {
  return OPEN_TASK_STATUSES.includes(t.status);
}

/**
 * The current task: an open task in the order's current stage, chosen by
 * the rule row's primary task first (priority 0), then earliest due date.
 * Priority keeps e.g. SITE_READINESS (customer) ahead of the secondary
 * RAISE_PO (admin) that the same event creates (ACCEPTANCE S1 step 7).
 */
export function pickCurrentTask(tasks: MvpTask[], stage: MvpStage): MvpTask | null {
  const open = tasks.filter(t => isOpenTask(t) && t.stage === stage);
  open.sort((a, b) => (a.priority - b.priority) || (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0) || (a.createdAt < b.createdAt ? -1 : 1));
  return open[0] ?? null;
}

export function isMilestoneOverdue(m: MvpMilestone, now: Date): boolean {
  if (!m.dueDate) return false;
  if (m.status === 'PAID' || m.status === 'WAIVED' || m.status === 'REFUNDED') return false;
  return new Date(m.dueDate).getTime() < now.getTime();
}

export interface HealthInput {
  status: OrderStatus;
  hasOpenBlocker: boolean;
  currentTask: Pick<MvpTask, 'dueDate' | 'status'> | null;
  milestones: MvpMilestone[];
  now: Date;
}

/** First matching rule wins (D-11). A missing current task means NO NEXT ACTION. */
export function computeHealth({ status, hasOpenBlocker, currentTask, milestones, now }: HealthInput): Health {
  if (status === 'ON_HOLD') return 'ON_HOLD';
  if (hasOpenBlocker) return 'BLOCKED';
  if (status === 'ACTIVE' && !currentTask) return 'OVERDUE';
  if (currentTask) {
    const due = new Date(currentTask.dueDate).getTime();
    if (due < now.getTime()) return 'OVERDUE';
    if (currentTask.status === 'TODO' && due - now.getTime() <= 24 * HOUR) return 'AT_RISK';
  }
  if (milestones.some(m => isMilestoneOverdue(m, now))) return 'AT_RISK';
  return 'ON_TRACK';
}
