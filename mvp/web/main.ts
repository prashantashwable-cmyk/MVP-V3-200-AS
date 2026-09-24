/**
 * Browser demo build — the WHOLE MVP in one page, for phones.
 *
 * The same engine, routes (with the same authorization checks), scheduler
 * and demo bot as the Node server run inside the page. SQLite is sql.js
 * (WebAssembly). `/api/*` fetches from the React client are answered
 * in-page by the same route code. Data is saved to this browser's
 * IndexedDB, so it survives reloads on this device.
 *
 * Difference from the server build: every "user" lives on this one
 * device (switch users from the header). For several phones sharing one
 * live system, run the Node server (`npm run mvp:dev`).
 */
import initSqlJs from 'sql.js/dist/sql-wasm.js';
import wasmBinary from 'sql.js/dist/sql-wasm.wasm';
import type { DB } from '../server/db-core';
import { initSchema } from '../server/db-core';
import { seedIfEmpty } from '../server/seed';
import { Engine } from '../server/workflow/engine';
import { DemoDirector } from '../server/demo';
import { registerRoutes } from '../server/routes';
import type { Handler, MiniRouter } from '../server/routes';

const IDB_NAME = 'aiec-work-manager-demo';

// ---- tiny IndexedDB key/value (wrapped: storage can be blocked) --------------
function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return new Promise(resolve => {
    try {
      const open = indexedDB.open(IDB_NAME, 1);
      open.onupgradeneeded = () => open.result.createObjectStore('kv');
      open.onerror = () => resolve(undefined);
      open.onsuccess = () => {
        try {
          const tx = open.result.transaction('kv', mode);
          const req = fn(tx.objectStore('kv'));
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => resolve(undefined);
        } catch { resolve(undefined); }
      };
    } catch { resolve(undefined); }
  });
}
const loadSaved = () => idb<Uint8Array>('readonly', s => s.get('db'));
const save = (bytes: Uint8Array) => idb('readwrite', s => s.put(bytes, 'db'));
const wipe = () => idb('readwrite', s => s.delete('db'));

// ---- sql.js → the engine's DB contract ---------------------------------------
function wrap(sdb: any): DB {
  const norm = (ps: any[]) => ps.map(p => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));
  const withStmt = <R>(sql: string, ps: any[], fn: (st: any) => R): R => {
    const st = sdb.prepare(sql);
    try { st.bind(norm(ps)); return fn(st); } finally { st.free(); }
  };
  return {
    prepare: (sql: string) => ({
      get: (...ps: any[]) => withStmt(sql, ps, st => (st.step() ? st.getAsObject() : undefined)),
      all: (...ps: any[]) => withStmt(sql, ps, st => { const out: any[] = []; while (st.step()) out.push(st.getAsObject()); return out; }),
      run: (...ps: any[]) => { sdb.run(sql, norm(ps)); return {}; },
    }),
    exec: (sql: string) => { sdb.exec(sql); },
    close: () => sdb.close(),
  };
}

// ---- in-page router with Express-like semantics ---------------------------------
interface Route { method: string; re: RegExp; keys: string[]; handlers: Handler[] }
function makeRouter(): { router: MiniRouter; routes: Route[] } {
  const routes: Route[] = [];
  const add = (method: string, path: string, handlers: Handler[]) => {
    const keys: string[] = [];
    const re = new RegExp('^' + path.replace(/:([A-Za-z]+)/g, (_m, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, handlers });
  };
  return {
    routes,
    router: {
      get: (p, ...h) => add('GET', p, h),
      post: (p, ...h) => add('POST', p, h),
      use: h => routes.push({ method: '*', re: /.*/, keys: [], handlers: [h] }),
    },
  };
}

class FakeRes {
  code = 200;
  headers: Record<string, string> = {};
  body: BodyInit | null = null;
  headersSent = false;
  status(c: number) { this.code = c; return this; }
  json(b: unknown) { this.headers['Content-Type'] = 'application/json'; this.body = JSON.stringify(b); this.headersSent = true; return this; }
  setHeader(k: string, v: string) { this.headers[k] = v; return this; }
  end(b?: any) { this.body = b ?? null; this.headersSent = true; return this; }
}

function runChain(handlers: Handler[], req: any, res: FakeRes): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const step = (i: number) => {
      if (i >= handlers.length) return resolve(true); // fell through: try next route
      try {
        Promise.resolve(handlers[i](req, res, () => step(i + 1))).then(() => { if (res.headersSent) resolve(false); }, reject);
      } catch (e) { reject(e); }
    };
    step(0);
  });
}

async function boot() {
  const SQL = await initSqlJs({ wasmBinary });
  const saved = await loadSaved();
  const sdb = saved ? new SQL.Database(saved) : new SQL.Database();
  const db = wrap(sdb);
  initSchema(db);
  seedIfEmpty(db);
  const engine = new Engine(db);
  const director = new DemoDirector(engine);
  const { router, routes } = makeRouter();
  registerRoutes(router, engine, director);

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith('/api/')) return realFetch(input as any, init);
    const [path] = url.slice(4).split('?');
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers: Record<string, any> = {};
    for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) headers[k.toLowerCase()] = v;
    let body: any = {};
    try { body = init?.body ? JSON.parse(String(init.body)) : {}; } catch { body = {}; }
    const res = new FakeRes();
    try {
      for (const rt of routes) {
        if (rt.method !== '*' && rt.method !== method) continue;
        const m = rt.re.exec(path);
        if (!m) continue;
        const params = Object.fromEntries(rt.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        const passed = await runChain(rt.handlers, { headers, params, body }, res);
        if (!passed) break;
      }
    } catch (e) {
      res.status(500).json({ error: 'INTERNAL', message: e instanceof Error ? e.message : String(e) });
    }
    return new Response(res.body, { status: res.code, headers: res.headers });
  };

  // Scheduler + demo bot, exactly as on the server.
  engine.tick();
  setInterval(() => { try { engine.tick(); } catch (e) { console.error(e); } }, 5000);
  setInterval(() => { director.stepAll().catch(e => console.error(e)); }, 2500);

  // Save to this browser whenever something changed.
  let savedSeq = engine.changeSeq();
  setInterval(() => {
    const seq = engine.changeSeq();
    if (seq === savedSeq) return;
    savedSeq = seq;
    try {
      const bytes = sdb.export();
      sdb.exec('PRAGMA foreign_keys = ON;'); // export() resets pragmas
      void save(bytes);
    } catch (e) { console.error('save failed', e); }
  }, 2000);

  (window as any).__AIEC_BROWSER_DEMO__ = {
    async reset() { await wipe(); try { sessionStorage.clear(); } catch { /* ignore */ } location.reload(); },
  };

  await import('../client/main');
}

boot().catch(e => {
  const root = document.getElementById('root');
  if (root) root.textContent = `Could not start the demo: ${e instanceof Error ? e.message : String(e)}`;
});
