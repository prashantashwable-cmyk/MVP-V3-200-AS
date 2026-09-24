/**
 * Backfill existing projects for the MVP (plan §2.3): status, displayCode, participantIds,
 * version, and a REVIEW_ORDER task where an active order has no open task.
 *
 * SAFETY (D-19): dry-run by default. It runs ONLY against the in-memory demo repository
 * (`--demo`, seeded with sample legacy projects) or the Firebase EMULATOR (`--emulator`,
 * requires FIRESTORE_EMULATOR_HOST and uses a demo-* project id). It has no code path to a
 * real project. Running it on real data is an Owner go-live action (a separate, reviewed run).
 *
 *   npx tsx scripts/mvp-backfill-projects.ts --demo            # dry-run on demo data
 *   npx tsx scripts/mvp-backfill-projects.ts --demo --apply    # apply on demo data, then re-plan (must be empty)
 */
import './polyfillBrowserGlobals';
import { planBackfill } from '../src/mvp/backfill';
import { projectRepository, taskRepository } from '../src/repository/entities';
import { createAdminTask } from '../src/mvp/services/orderService';
import type { Project, Task } from '../src/domain/entities';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');

async function runDemo() {
  const ctx = { environment: 'demo' as const, actorUserId: 'backfill' };
  const now = '2026-01-01T00:00:00Z';
  // Sample legacy projects, shaped like the Phase 15 bridge's output (no MVP fields).
  for (const id of ['proj_legacy_1', 'proj_legacy_2']) {
    await projectRepository(ctx).create({ id, customerId: `cust_${id}`, siteId: `site_${id}`, stage: 'quoting', ownerUserId: 'u_sales', title: id, createdAt: now, updatedAt: now } as any);
  }
  const plan = async () => {
    const projects = (await projectRepository(ctx).list()) as (Project & { version?: number })[];
    const tasks = await taskRepository(ctx).list();
    const byProject: Record<string, Task[]> = {};
    for (const t of tasks) if (t.orderId) (byProject[t.orderId] ??= []).push(t);
    return planBackfill(projects, byProject, 0);
  };
  const first = await plan();
  console.log(`${apply ? 'APPLY' : 'DRY-RUN'}: ${first.changes.length} project(s) need backfill`);
  for (const c of first.changes) console.log(`  ${c.projectId}: set ${JSON.stringify(c.set)}${c.createReviewTask ? ' + REVIEW_ORDER task' : ''}`);
  if (!apply) return;
  for (const c of first.changes) {
    const p = await projectRepository(ctx).get(c.projectId);
    if (Object.keys(c.set).length) await projectRepository(ctx).update(c.projectId, c.set as any, (p as any)?.version);
    if (c.createReviewTask) await createAdminTask({ ...ctx }, { userId: 'backfill', role: 'admin' }, c.projectId, {});
  }
  const second = await plan();
  console.log(`Re-plan after apply: ${second.changes.length} change(s) (must be 0 — idempotent)`);
  if (second.changes.length !== 0) process.exitCode = 1;
}

async function main() {
  if (args.has('--demo')) return runDemo();
  if (args.has('--emulator')) {
    if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('--emulator needs FIRESTORE_EMULATOR_HOST (run under firebase emulators:exec with a demo-* project).');
    throw new Error('--emulator mode is reserved for the go-live rehearsal (Step 14); use --demo in this session.');
  }
  console.error('Choose --demo (in-memory) — there is intentionally no mode that targets a real project.');
  process.exitCode = 1;
}

main().catch(err => { console.error(err); process.exitCode = 1; });
