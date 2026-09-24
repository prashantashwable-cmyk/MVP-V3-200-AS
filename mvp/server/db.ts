/**
 * MVP persistence — one SQLite file via Node's built-in `node:sqlite`
 * (no new dependency). Every workflow mutation runs inside
 * `BEGIN IMMEDIATE … COMMIT`, so two concurrent requests cannot both
 * perform the same transition, and a restart resumes from exactly the
 * persisted state (the scheduler is stateless — it re-derives what is due
 * from these rows).
 *
 * Compact core, per prompt §31: users, sessions, projects, work_items,
 * evidence, payments, events, notifications, meta, idempotency.
 * Workflow *rules* live in code (`workflow/catalog.ts`) so they are
 * versioned with the engine that interprets them.
 */
import { DatabaseSync } from 'node:sqlite';

export type DB = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','technician','customer','supplier')),
  phone TEXT,
  pin TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  home_lat REAL, home_lng REAL,
  org TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  customer_id TEXT REFERENCES users(id),
  site_address TEXT,
  area TEXT,
  lat REAL, lng REAL,
  floors INTEGER,
  door_type TEXT,
  finish TEXT,
  state TEXT NOT NULL,
  quote_total INTEGER,
  quote_cost INTEGER,
  installer_id TEXT,
  counters TEXT NOT NULL DEFAULT '{"W":0,"E":0,"P":0,"EVT":0}',
  flags TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  state_entered_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS work_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  assigned_user_id TEXT,
  assigned_role TEXT,
  created_at INTEGER NOT NULL,
  assigned_at INTEGER,
  accepted_at INTEGER,
  started_at INTEGER,
  phase_started_at INTEGER NOT NULL,
  accept_by INTEGER,
  due_at INTEGER,
  submitted_at INTEGER,
  completed_at INTEGER,
  validation_status TEXT,
  validation TEXT,
  failure_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  reassign_count INTEGER NOT NULL DEFAULT 0,
  ladder_step INTEGER NOT NULL DEFAULT 0,
  escalation_level INTEGER NOT NULL DEFAULT 0,
  admin_required INTEGER NOT NULL DEFAULT 0,
  exception_cause TEXT,
  last_system_action TEXT,
  last_system_action_at INTEGER,
  excluded_users TEXT NOT NULL DEFAULT '[]',
  result TEXT,
  earning INTEGER NOT NULL DEFAULT 0,
  payout_status TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS work_items_project ON work_items(project_id);
CREATE INDEX IF NOT EXISTS work_items_assignee ON work_items(assigned_user_id, status);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL REFERENCES work_items(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL,
  label TEXT,
  data TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  lat REAL, lng REAL,
  submitted_by TEXT NOT NULL,
  superseded INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS evidence_work ON evidence(work_item_id);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  milestone TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,
  work_item_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  gateway_ref TEXT,
  failure_reason TEXT,
  method TEXT,
  paid_at INTEGER,
  created_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (project_id, milestone)
);

CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  project_id TEXT,
  work_item_id TEXT,
  at INTEGER NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('SYSTEM','USER','ADMIN')),
  actor_id TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('transition','routing','info')),
  intervention INTEGER NOT NULL DEFAULT 0,
  intervention_cause TEXT,
  detail TEXT NOT NULL,
  data TEXT
);
CREATE INDEX IF NOT EXISTS events_project ON events(project_id);

-- Audit trail is immutable: no UPDATE, no DELETE, ever.
CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
BEGIN SELECT RAISE(ABORT, 'events are immutable'); END;
CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
BEGIN SELECT RAISE(ABORT, 'events are immutable'); END;

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  project_id TEXT,
  work_item_id TEXT,
  at INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'in_app',
  read INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, read);

CREATE TABLE IF NOT EXISTS idempotency (
  key TEXT PRIMARY KEY,
  response TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

export function openDb(path: string): DB {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return db;
}

export function getMeta(db: DB, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function setMeta(db: DB, key: string, value: string): void {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
