/**
 * Phase 04 acceptance check — "two users, one authoritative truth."
 *
 * The pack's acceptance test is: "Use two browser contexts/users. User A
 * creates or changes a project. User B sees the same authoritative
 * state. Refresh both. State remains correct."
 *
 * This sandbox has no way to run two real authenticated browser sessions
 * against live Firestore (see src/repository/firestoreRepository.ts doc
 * comment — network reachable, no auth credential available). What CAN
 * be verified here, and what this script actually verifies:
 *
 *   1. The repository abstraction itself is correct: two independent
 *      call sites ("User A" and "User B") that both resolve the SAME
 *      `RepositoryContext` reach the SAME underlying store and observe
 *      each other's writes — including via `subscribe()`, the exact
 *      mechanism the real Firestore implementation uses
 *      (`onSnapshot`) to give a second real browser tab live updates
 *      without a manual refresh.
 *   2. Optimistic concurrency: a stale `update()` (wrong expectedVersion)
 *      is rejected rather than silently overwriting a concurrent change
 *      — the same code path both the demo and Firestore repositories
 *      share (src/repository/types.ts).
 *
 * The Firestore-backed implementation is not re-tested here because it
 * is not a separate algorithm — `createFirestoreRepository` implements
 * the identical `Repository<T>` interface exercised below, using the
 * same Firestore SDK primitives (`onSnapshot`, `updateDoc`) already
 * proven live in src/lib/firestoreLeads.ts (Phase 01 confirmed that
 * module is a real, shipped integration). What remains genuinely
 * unverified in THIS environment is an end-to-end run with a real
 * signed-in Firebase Auth session — documented as a known gap, not
 * silently assumed to pass.
 *
 * Run with: npx tsx scripts/repository-two-user-check.ts
 */

import { getRepository } from '../src/repository';
import type { RepositoryContext } from '../src/repository/types';
import { isStaleWriteError } from '../src/repository/types';
import type { Project } from '../src/domain/entities';
import { asId } from '../src/domain/ids';
import type { ProjectId } from '../src/domain/ids';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`OK: ${msg}`);
}

const sharedCtx: RepositoryContext = { environment: 'demo', actorUserId: 'user-sales-1' };

// "User A" and "User B" each independently resolve a repository handle
// for the same collection/context — exactly as two different React
// components in two different browser tabs would.
const repoAsUserA = getRepository<Project & { id: string; version?: number }>('projects', sharedCtx);
const repoAsUserB = getRepository<Project & { id: string; version?: number }>('projects', sharedCtx);

async function main() {
  const project: Project & { version: number } = {
    id: asId<ProjectId>('proj_two_user_check'),
    customerId: 'cust_1' as any,
    siteId: 'site_1' as any,
    stage: 'quoting',
    ownerUserId: 'user-sales-1' as any,
    title: 'Two-user truth check',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 0,
  };

  // User A creates the project.
  await repoAsUserA.create(project);

  // User B (a different call site / "browser tab") reads it back.
  const seenByB = await repoAsUserB.get(project.id);
  assert(seenByB !== null, 'User B can read the project User A just created');
  assert(seenByB!.stage === 'quoting', 'User B sees the stage User A set');

  // Live subscription: User B is "watching" the project; User A changes it.
  let lastSeenByBSubscription: (Project & { version?: number })[] = [];
  const unsubscribe = repoAsUserB.subscribe(records => {
    lastSeenByBSubscription = records;
  });

  await repoAsUserA.update(project.id, { stage: 'negotiation', version: 1 }, 0);

  const updatedForB = lastSeenByBSubscription.find(p => p.id === project.id);
  assert(updatedForB?.stage === 'negotiation', "User B's live subscription reflects User A's change without a manual refetch");

  // "Refresh both": a fresh get() after the fact still agrees.
  const afterRefreshA = await repoAsUserA.get(project.id);
  const afterRefreshB = await repoAsUserB.get(project.id);
  assert(afterRefreshA?.stage === 'negotiation' && afterRefreshB?.stage === 'negotiation', 'Both users see identical state after "refresh" (fresh get())');
  assert(afterRefreshA?.version === afterRefreshB?.version, 'Both users see the identical version number after refresh');

  // Optimistic concurrency: User A tries to update again using a stale
  // expectedVersion (as if their tab had not seen User B's change).
  let staleRejected = false;
  try {
    await repoAsUserA.update(project.id, { stage: 'contract', version: 2 }, 0 /* stale — real version is 1 */);
  } catch (e) {
    staleRejected = isStaleWriteError(e);
  }
  assert(staleRejected, 'A stale-version update (wrong expectedVersion) is rejected, not silently applied');

  unsubscribe();
  console.log('\nPASS: repository layer gives two independent call sites one authoritative, live-synchronized truth.');
  console.log('NOTE: exercised against the demo repository (see script header) — the Firestore repository');
  console.log('shares the identical Repository<T> interface and SDK primitives already proven in');
  console.log('src/lib/firestoreLeads.ts, but this sandbox has no live authenticated Firebase session to');
  console.log('re-run this exact scenario end-to-end against production Firestore. Documented, not hidden.');
}

main();
