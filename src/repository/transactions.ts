/**
 * Minimal transactional helpers — MVP Step 03 (audit R-7).
 *
 * The repository interface has no transaction API, and the MVP needs two
 * things that must be atomic: a create that never overwrites (deterministic
 * task ids, D-08 idempotency) and a counter (the `AE-####` display code,
 * D-02). Firestore sessions use a real `runTransaction`; the demo store is
 * single-process, so an in-memory single-flight lock gives the same
 * guarantee there (same approach as src/lib/idempotency.ts).
 */

import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getRepository } from './index';
import type { RepositoryContext } from './types';

const stripUndefined = <T extends object>(obj: T): T => JSON.parse(JSON.stringify(obj));

const demoLocks = new Map<string, Promise<unknown>>();

async function withDemoLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = demoLocks.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(fn);
  demoLocks.set(key, next);
  try {
    return await next;
  } finally {
    if (demoLocks.get(key) === next) demoLocks.delete(key);
  }
}

function requireDb() {
  if (!db) throw new Error('Firestore is not initialized — cannot run a transaction.');
  return db;
}

/** Creates `record` only if no document with its id exists. Returns true if it created it. */
export async function createIfAbsent<T extends { id: string }>(
  ctx: RepositoryContext,
  collectionName: string,
  record: T,
): Promise<boolean> {
  if (ctx.environment === 'demo') {
    return withDemoLock(`${collectionName}/${record.id}`, async () => {
      const repo = getRepository<T & { version?: number }>(collectionName, ctx);
      if (await repo.get(record.id)) return false;
      await repo.create(record as T & { version?: number });
      return true;
    });
  }
  const database = requireDb();
  return runTransaction(database, async tx => {
    const ref = doc(database, collectionName, record.id);
    const snap = await tx.get(ref);
    if (snap.exists()) return false;
    tx.set(ref, stripUndefined(record));
    return true;
  });
}

/** Atomically increments `counters/{name}` and returns the new value (first call returns 1). */
export async function nextSequence(ctx: RepositoryContext, name: string): Promise<number> {
  if (ctx.environment === 'demo') {
    return withDemoLock(`counters/${name}`, async () => {
      const repo = getRepository<{ id: string; value: number; version?: number }>('counters', ctx);
      const current = await repo.get(name);
      const value = (current?.value ?? 0) + 1;
      if (current) await repo.update(name, { value });
      else await repo.create({ id: name, value });
      return value;
    });
  }
  const database = requireDb();
  return runTransaction(database, async tx => {
    const ref = doc(database, 'counters', name);
    const snap = await tx.get(ref);
    const value = ((snap.exists() ? (snap.data() as { value?: number }).value : 0) ?? 0) + 1;
    tx.set(ref, { id: name, value });
    return value;
  });
}
