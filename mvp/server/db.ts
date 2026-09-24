/**
 * MVP persistence — one SQLite file via Node's built-in `node:sqlite`
 * (no new dependency). Every workflow mutation runs inside
 * `BEGIN IMMEDIATE … COMMIT`, so two concurrent requests cannot both
 * perform the same transition, and a restart resumes from exactly the
 * persisted state (the scheduler is stateless — it re-derives what is due
 * from these rows).
 *
 * Schema: see db-core.ts (shared with the in-browser demo build).
 */
import { DatabaseSync } from 'node:sqlite';
import { initSchema } from './db-core';
import type { DB } from './db-core';

export type { DB } from './db-core';
export { getMeta, setMeta } from './db-core';

export function openDb(path: string): DB {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  initSchema(db as unknown as DB);
  return db as unknown as DB;
}
