/**
 * Minimal browser-global polyfill so Node-run acceptance scripts (`tsx`,
 * no browser — see Phase 01 baseline) can exercise legacy code that
 * assumes `localStorage`/`window` exist (`src/lib/db.ts`'s `DbManager`).
 *
 * Import this FIRST in any script that transitively imports
 * `src/lib/db.ts` (directly, or via `src/services/legacyCommercialBridge.ts`)
 * — ES module execution order runs each import statement's module body
 * in the order it is written, so this file's top-level code runs and
 * sets these globals before `db.ts`'s own top-level code (which reads
 * `localStorage` at module scope for its seed/state helpers) executes.
 */

const store = new Map<string, string>();

if (typeof (globalThis as any).localStorage === 'undefined') {
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
}

if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

export {};
