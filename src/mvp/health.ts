/** Deterministic order health (D-11) and the current-task rule (D-06). Pure; `now` is injected. */

import type { MvpStage, OrderStatus, PaymentMilestone, Task } from '../domain/entities';
import { AT_RISK_WINDOW_HOURS } from './config';

export type Health = 'ON_TRACK' | 'AT_RISK' | 'OVERDUE' | 'BLOCKED' | 'ON_HOLD';

const OPEN: ReadonlySet<Task['status']> = new Set(['TODO', 'IN_PROGRESS', 'BLOCKED']);
const HOUR = 60 * 60 * 1000;

export function isOpenTask(t: Pick<Task, 'status'>): boolean {
  return OPEN.has(t.status);
}

/** The open task in the order's current stage, primary first, then earliest due.
 * Falls back to the earliest open task in any stage. `undefined` = NO NEXT ACTION. */
export function currentTask<T extends Pick<Task, 'status' | 'stage' | 'dueDate' | 'primary'>>(tasks: T[], stage: MvpStage): T | undefined {
  const open = tasks.filter(isOpenTask);
  const byPriority = (a: T, b: T) =>
    Number(!!b.primary) - Number(!!a.primary) || (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0);
  const inStage = open.filter(t => t.stage === stage).sort(byPriority);
  if (inStage.length) return inStage[0];
  return open.sort(byPriority)[0];
}

export interface HealthInput {
  status?: OrderStatus;
  stage: MvpStage;
  tasks: Pick<Task, 'status' | 'stage' | 'dueDate' | 'primary' | 'type'>[];
  openBlockerCount: number;
  milestones: Pick<PaymentMilestone, 'status' | 'dueDate' | 'waived'>[];
  now: Date;
}

export function hasOverdueMilestone(milestones: HealthInput['milestones'], now: Date): boolean {
  return milestones.some(m =>
    !!m.dueDate && !m.waived && m.status !== 'PAID' && m.status !== 'REFUNDED' && new Date(m.dueDate).getTime() < now.getTime());
}

export function computeHealth(input: HealthInput): Health {
  const status = input.status ?? 'ACTIVE';
  if (status === 'ON_HOLD') return 'ON_HOLD';
  if (input.openBlockerCount > 0) return 'BLOCKED';
  // COMPLETED / CANCELLED are not "at risk" — except a life-safety emergency (D-28), which
  // can be raised on an already-completed, installed lift and must still escalate visibly.
  const hasOpenEmergency = input.tasks.some(t => t.type === 'EMERGENCY_RESPONSE' && isOpenTask(t));
  if (status !== 'ACTIVE' && !hasOpenEmergency) return 'ON_TRACK';
  const task = currentTask(input.tasks, input.stage);
  if (!task) return 'OVERDUE'; // NO NEXT ACTION
  const due = new Date(task.dueDate).getTime();
  const now = input.now.getTime();
  if (due < now) return 'OVERDUE';
  if ((due - now < AT_RISK_WINDOW_HOURS * HOUR && task.status === 'TODO') || hasOverdueMilestone(input.milestones, input.now)) return 'AT_RISK';
  return 'ON_TRACK';
}
