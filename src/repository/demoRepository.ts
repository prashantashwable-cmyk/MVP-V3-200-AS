/**
 * Isolated demo repository — Phase 04.
 *
 * Backs `AppEnvironment === 'demo'` only. Explicitly separate module from
 * `firestoreRepository.ts` so there is no code path by which a demo
 * session's writes could reach real Firestore (mirrors the existing,
 * already-correct pattern in src/lib/firestoreUsers.ts /
 * firestoreLeads.ts, generalized to every entity on this layer).
 *
 * Storage: a module-scoped in-memory Map, NOT localStorage. Per Phase 04
 * ("never silently pretend localStorage is production persistence") and
 * Phase 11 ("do not use localStorage as the primary offline database for
 * field workloads"), demo data resetting on reload is a deliberate,
 * honest signal that this is a throwaway sandbox — it must not be made
 * to feel durable, or a demo user could mistake it for real persistence.
 */

import type { Repository } from './types';
import { makeNotFoundError, makeStaleWriteError } from './types';

export function createDemoRepository<T extends { id: string; version?: number }>(
  collectionName: string,
  seed: T[] = [],
): Repository<T> {
  const store = new Map<string, T>(seed.map(r => [r.id, r]));
  const listeners = new Set<(records: T[]) => void>();

  function notify() {
    const all = Array.from(store.values());
    for (const l of listeners) l(all);
  }

  return {
    async get(id) {
      return store.get(id) ?? null;
    },

    async list() {
      return Array.from(store.values());
    },

    async query(predicate) {
      return Array.from(store.values()).filter(r =>
        Object.entries(predicate).every(([k, v]) => (r as any)[k] === v),
      );
    },

    async create(record) {
      store.set(record.id, record);
      notify();
      return record;
    },

    async update(id, patch, expectedVersion) {
      const current = store.get(id);
      if (!current) throw makeNotFoundError(collectionName, id);
      if (expectedVersion !== undefined) {
        const currentVersion = current.version ?? 0;
        if (currentVersion !== expectedVersion) {
          throw makeStaleWriteError(currentVersion, expectedVersion);
        }
      }
      const updated = { ...current, ...patch } as T;
      store.set(id, updated);
      notify();
      return updated;
    },

    subscribe(onChange) {
      listeners.add(onChange);
      onChange(Array.from(store.values()));
      return () => listeners.delete(onChange);
    },
  };
}
