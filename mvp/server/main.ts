/**
 * AIEC Work Manager MVP — server entry.
 *
 *   npm run mvp:dev   → http://localhost:3100
 *
 * One process: API + scheduler + demo bot + client bundle (esbuild, already
 * a V3 dev dependency). Data lives in mvp/data/aiec-mvp.sqlite (override
 * with MVP_DB). Restarting resumes every workflow from that file.
 */
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { openDb } from './db';
import { seedIfEmpty } from './seed';
import { Engine } from './workflow/engine';
import { createApi } from './api';
import { DemoDirector } from './demo';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PORT = Number(process.env.MVP_PORT ?? 3100);
const DB_PATH = process.env.MVP_DB ?? path.join(root, 'data', 'aiec-mvp.sqlite');
const PROD = process.env.NODE_ENV === 'production';
const SCHEDULER_MS = Number(process.env.MVP_TICK_MS ?? 5000);
const DEMO_STEP_MS = Number(process.env.MVP_DEMO_STEP_MS ?? 2500);

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = openDb(DB_PATH);
if (seedIfEmpty(db)) console.log('Seeded demo users (PIN 1234).');
const engine = new Engine(db);
const director = new DemoDirector(engine);

let bundle: string | undefined;
async function clientBundle(): Promise<string> {
  if (bundle && PROD) return bundle;
  const out = await build({
    entryPoints: [path.join(root, 'client', 'main.tsx')],
    bundle: true, write: false, format: 'esm', target: 'es2020', jsx: 'automatic',
    minify: PROD, sourcemap: PROD ? false : 'inline', logLevel: 'error',
    define: { 'process.env.NODE_ENV': JSON.stringify(PROD ? 'production' : 'development') },
  });
  bundle = out.outputFiles[0].text;
  return bundle;
}

const app = express();
app.use('/api', createApi(engine, director));
app.get('/app.js', async (_req, res) => {
  try {
    res.type('application/javascript').send(await clientBundle());
  } catch (e) {
    res.status(500).type('text/plain').send(String(e));
  }
});
app.get('/icon.png', (_req, res) => res.sendFile(path.resolve(root, '..', 'public', 'icon-192.png')));
app.get('*', (_req, res) => res.sendFile(path.join(root, 'client', 'index.html')));

// The scheduler is stateless: every pass re-derives what is due from the DB.
const resumed = engine.tick();
if (resumed.length) console.log(`Resumed after restart: ${resumed.length} overdue SLA action(s) executed.`);
setInterval(() => {
  try { engine.tick(); } catch (e) { console.error('scheduler', e); }
}, SCHEDULER_MS);
setInterval(() => { director.stepAll().catch(e => console.error('demo', e)); }, DEMO_STEP_MS);

clientBundle().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AIEC Work Manager MVP running at http://localhost:${PORT}  (db: ${path.relative(process.cwd(), DB_PATH)})`);
  });
}).catch(e => {
  console.error('Client build failed:', e);
  process.exit(1);
});
