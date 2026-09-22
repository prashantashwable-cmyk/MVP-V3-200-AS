/**
 * Repository factory — Phase 04.
 *
 * Picks the Firestore-backed or demo-isolated implementation based on
 * the EXPLICIT `AppEnvironment` (src/lib/environment.ts), never on an
 * implicit/ambient guess. Callers pass a `RepositoryContext` they got
 * from `resolveEnvironment(currentUser)`, so the decision is made once,
 * visibly, at the point session state is known — not re-derived deep
 * inside a repository call.
 */

import { createFirestoreRepository } from './firestoreRepository';
import { createDemoRepository } from './demoRepository';
import type { Repository, RepositoryContext } from './types';

const demoSingletons = new Map<string, Repository<any>>();

export function getRepository<T extends { id: string; version?: number }>(
  collectionName: string,
  ctx: RepositoryContext,
  demoSeed: T[] = [],
): Repository<T> {
  if (ctx.environment === 'demo') {
    // One demo store per collection per session (module lifetime), so
    // multiple screens in the same demo session see each other's writes
    // without needing Firestore — but it never survives a reload and
    // never touches another session.
    if (!demoSingletons.has(collectionName)) {
      demoSingletons.set(collectionName, createDemoRepository<T>(collectionName, demoSeed));
    }
    return demoSingletons.get(collectionName)! as Repository<T>;
  }
  // sandbox and production both use the real Firestore project today —
  // see src/lib/environment.ts doc comment for why there is currently
  // only one real project.
  return createFirestoreRepository<T>(collectionName);
}

export type { Repository, RepositoryContext } from './types';
export { isStaleWriteError, makeNotFoundError, makeStaleWriteError } from './types';
