import type { DurableStore } from './types';

/** In-memory `DurableStore` — Node-safe (used directly by acceptance
 * scripts), and the automatic fallback if `indexedDB` is unavailable in
 * a given browser context (e.g. private-browsing modes that disable it).
 * Never used silently in place of real IndexedDB when IndexedDB IS
 * available — see `storeFactory.ts`. */
export function createMemoryStore<T extends { id: string }>(): DurableStore<T> {
  const map = new Map<string, T>();
  return {
    async put(item) { map.set(item.id, item); },
    async get(id) { return map.get(id) ?? null; },
    async list() { return Array.from(map.values()); },
    async delete(id) { map.delete(id); },
  };
}
