/**
 * MVP backfill for pre-MVP canonical projects (plan §2): set a missing
 * `status` to ACTIVE, assign a missing `AE-####` code, and give an active
 * order with no open task a SET_NEXT_TASK for the Admin (so I-1 holds).
 *
 * Safe by construction:
 *  - DRY RUN unless `--apply` is passed;
 *  - idempotent: a second run finds nothing to do;
 *  - refuses to run unless the target is the demo store (`--demo`, the
 *    default) or the Firestore EMULATOR (FIRESTORE_EMULATOR_HOST set). It
 *    can never reach the real project from this session (D-19).
 *
 *   npx tsx scripts/mvp/backfill.ts --demo [--apply]
 *   (emulator) firebase emulators:exec ... "npx tsx scripts/mvp/backfill.ts --emulator --apply"
 */
import { mvpRepos, nextSequence, type Order } from '../../src/mvp/repo';
import { isOpenTask } from '../../src/mvp/health';
import { createManualTask } from '../../src/mvp/service';
import { addDays } from '../../src/mvp/money';
import type { RepositoryContext } from '../../src/repository/types';

const apply = process.argv.includes('--apply');
const emulator = process.argv.includes('--emulator');
if (emulator && !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Refusing: --emulator needs FIRESTORE_EMULATOR_HOST (run inside emulators:exec).');
  process.exit(1);
}
const repo: RepositoryContext = { environment: emulator ? 'sandbox' : 'demo', actorUserId: 'backfill' };

export async function backfill(ctx: RepositoryContext, doApply: boolean) {
  const r = mvpRepos(ctx);
  const plan: string[] = [];
  for (const o of (await r.orders.list()) as Order[]) {
    const patch: Partial<Order> = {};
    if (!o.status) patch.status = o.stage === 'closed_lost' ? 'CANCELLED' : 'ACTIVE';
    if (!o.displayCode) patch.displayCode = doApply ? `AE-${await nextSequence(ctx, 'orders')}` : 'AE-(next)';
    const status = patch.status ?? o.status;
    const tasks = await r.tasks.query({ orderId: o.id } as any);
    const needsTask = status === 'ACTIVE' && !tasks.some(isOpenTask);
    if (!Object.keys(patch).length && !needsTask) continue;
    plan.push(`${o.id}: ${JSON.stringify(patch)}${needsTask ? ' + SET_NEXT_TASK → admin' : ''}`);
    if (!doApply) continue;
    if (Object.keys(patch).length) await r.orders.update(o.id, { ...patch, updatedAt: new Date().toISOString() }, o.version ?? 0);
    if (needsTask) {
      await createManualTask({ repo: ctx, actor: { id: 'backfill', role: 'admin' } }, o.id, {
        type: 'SET_NEXT_TASK', assigneeId: 'role:admin', assigneeRole: 'admin', dueDate: addDays(new Date(), 1),
      });
    }
  }
  return plan;
}

async function main() {
  if (!emulator) {
    // Demo: seed one pre-MVP project so the dry run has something to show.
    const r = mvpRepos(repo);
    await r.orders.create({ id: 'legacy_proj_1', customerId: 'c', siteId: 's', stage: 'quoting', ownerUserId: 'u', title: 'Legacy', createdAt: '', updatedAt: '', version: 0 } as any);
  }
  const plan = await backfill(repo, apply);
  console.log(`${apply ? 'APPLIED' : 'DRY RUN'} (${emulator ? 'emulator' : 'demo'}): ${plan.length} change(s)`);
  plan.forEach(p => console.log(`  ${p}`));
  if (apply) {
    const again = await backfill(repo, false);
    console.log(`Re-run finds ${again.length} change(s) (idempotent: expect 0).`);
    if (again.length) process.exitCode = 1;
  }
}

main().catch(err => { console.error(err); process.exitCode = 1; });
