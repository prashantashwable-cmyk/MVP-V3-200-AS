import type { DurableStore } from './types';
import { createIndexedDbStore } from './indexedDbStore';
import { createMemoryStore } from './memoryStore';

/** Picks real IndexedDB when it's actually available (real browsers),
 * falls back to the in-memory store otherwise (Node/test environments,
 * and browser contexts where IndexedDB is disabled) — an EXPLICIT
 * runtime check, not a silent assumption either way, matching the same
 * "never silently pretend X is production-durable" principle Phase 04's
 * `environment.ts` established for demo/sandbox/production. */
export function createDurableStore<T extends { id: string }>(dbName: string): DurableStore<T> {
  if (typeof indexedDB !== 'undefined') {
    return createIndexedDbStore<T>(dbName);
  }
  return createMemoryStore<T>();
}
