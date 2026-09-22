/**
 * Next Best Action + Work Queue — Phase 22.
 *
 * "Use the workflow state machine to generate human work... Do not
 * create static dashboard cards. Generate work from actual workflow
 * state." Every actionable canonical Project becomes one real work item
 * — current state, required action, owner, priority, an SLA-derived
 * due signal, blockers, and whether it's a genuine exception — computed
 * from the exact same real records Phase 21's project operating view
 * reads, never a hard-coded card.
 *
 * Deliberately reuses Phase 12's `ControlTowerCategory` vocabulary
 * (`critical`/`at_risk`/`waiting`/`on_track`) for priority rather than
 * inventing a second one — the Control Tower answers "what needs
 * intervention, across every entity type" (payments, POs, snags,
 * automation failures, ...); this work queue answers the complementary
 * "for MY projects, what's the next thing I personally need to do,"
 * one item per actionable project, always with a concrete next action
 * attached — not a duplicate of Control Tower's job, a different cut of
 * the same underlying truth.
 */

import type { RepositoryContext } from '../repository/types';
import { projectRepository } from '../repository/entities';
import { computeBlockers, NEXT_ACTION_BY_STAGE } from './projectOperatingView';
import type { ControlTowerCategory } from './controlTower';
import type { Project, ProjectStage } from '../domain/entities';

/** Stages a project can sit in indefinitely without it meaning anything
 * is wrong — no work item is generated for these. */
const NON_ACTIONABLE_STAGES: ReadonlySet<ProjectStage> = new Set(['closed_lost']);

export interface WorkQueueItem {
  id: string;
  projectId: string;
  projectTitle: string;
  currentStage: ProjectStage;
  requiredAction: string;
  owner: string;
  priority: ControlTowerCategory;
  daysInStage: number;
  slaText: string;
  blockers: string[];
  isException: boolean;
}

const PRIORITY_RANK: Record<ControlTowerCategory, number> = { critical: 0, at_risk: 1, waiting: 2, on_track: 3 };

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)));
}

function derivePriority(blockers: string[], daysInStage: number): ControlTowerCategory {
  if (blockers.some(b => b.toLowerCase().includes('hard gate'))) return 'critical';
  if (blockers.length > 0) return 'at_risk';
  if (daysInStage > 7) return 'waiting';
  return 'on_track';
}

function deriveSlaText(priority: ControlTowerCategory, daysInStage: number): string {
  if (priority === 'critical') return 'Blocked — needs immediate resolution';
  if (priority === 'at_risk') return `At risk — ${daysInStage} day(s) in stage with open issues`;
  if (priority === 'waiting') return `Stalled — ${daysInStage} day(s) with no stage change`;
  return `On track — ${daysInStage} day(s) in stage`;
}

/** One real work item per actionable canonical Project — the "Next Best
 * Action" list. Sorted most-urgent first (same rank order as Phase 12's
 * Control Tower, for a consistent mental model across both surfaces). */
export async function getWorkQueueItems(ctx: RepositoryContext): Promise<WorkQueueItem[]> {
  const projects = (await projectRepository(ctx).list()) as unknown as Project[];
  const actionable = projects.filter(p => !NON_ACTIONABLE_STAGES.has(p.stage));

  const items = await Promise.all(actionable.map(async (project): Promise<WorkQueueItem> => {
    const blockers = await computeBlockers(ctx, project.id);
    const daysInStage = daysSince(project.updatedAt);
    const priority = derivePriority(blockers, daysInStage);
    return {
      id: `wq_${project.id}`,
      projectId: project.id,
      projectTitle: project.title,
      currentStage: project.stage,
      requiredAction: NEXT_ACTION_BY_STAGE[project.stage],
      owner: project.ownerUserId,
      priority,
      daysInStage,
      slaText: deriveSlaText(priority, daysInStage),
      blockers,
      isException: blockers.length > 0,
    };
  }));

  return items.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.daysInStage - a.daysInStage);
}
