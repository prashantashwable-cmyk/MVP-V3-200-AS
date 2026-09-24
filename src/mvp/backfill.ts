/**
 * Backfill plan for projects created before the MVP (plan §2.3). Pure: it only decides what
 * to write; the script decides where. Idempotent by construction — a project that already
 * has the field is left alone, so running the plan twice changes nothing the second time.
 */

import type { Project, Task } from '../domain/entities';
import { isOpenTask } from './health';
import { computeParticipants } from './services/orderService';

export interface BackfillChange {
  projectId: string;
  set: Partial<Project>;
  createReviewTask: boolean;
}

export function planBackfill(
  projects: (Project & { version?: number })[],
  tasksByProject: Record<string, Pick<Task, 'status' | 'assigneeId'>[]>,
  counterValue: number,
): { changes: BackfillChange[]; counterValue: number } {
  let counter = counterValue;
  const changes: BackfillChange[] = [];
  for (const p of [...projects].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))) {
    const set: Partial<Project> = {};
    if (!p.status) set.status = p.stage === 'closed_lost' ? 'CANCELLED' : 'ACTIVE';
    if (!p.displayCode) set.displayCode = `AE-${String(1000 + ++counter)}`;
    const tasks = tasksByProject[p.id] ?? [];
    if (!p.participantIds) set.participantIds = computeParticipants(p, tasks);
    if (p.version === undefined) set.version = 0;
    const active = (set.status ?? p.status) === 'ACTIVE';
    const createReviewTask = active && !tasks.some(isOpenTask);
    if (Object.keys(set).length || createReviewTask) changes.push({ projectId: p.id, set, createReviewTask });
  }
  return { changes, counterValue: counter };
}
