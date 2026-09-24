/**
 * Repository layer contracts — Phase 04.
 *
 * Target architecture (per RUN_ALL.md Phase 04):
 *
 *   UI -> Domain Service -> Repository -> Firestore/server
 *
 * A `Repository<T>` is the only thing allowed to know whether records
 * live in Firestore or in the isolated demo store. Domain services
 * (src/services/*, introduced alongside the concrete repositories below)
 * and UI code depend only on this interface, never on `DbManager` or
 * `firebase/firestore` directly, for any entity migrated onto this layer.
 */

import type { AppEnvironment } from '../lib/environment';

export interface RepositoryContext {
  environment: AppEnvironment;
  actorUserId: string;
}

export interface NotFoundError extends Error {
  code: 'not_found';
}

export interface StaleWriteError extends Error {
  code: 'stale_write';
  currentVersion: number;
  attemptedVersion: number;
}

export function isStaleWriteError(e: unknown): e is StaleWriteError {
  return !!e && typeof e === 'object' && (e as any).code === 'stale_write';
}

export function makeNotFoundError(entity: string, id: string): NotFoundError {
  const err = new Error(`${entity} ${id} not found`) as NotFoundError;
  err.code = 'not_found';
  return err;
}

export function makeStaleWriteError(currentVersion: number, attemptedVersion: number): StaleWriteError {
  const err = new Error(
    `Stale write: record is at version ${currentVersion}, attempted update assumed version ${attemptedVersion}. Reload and retry.`,
  ) as StaleWriteError;
  err.code = 'stale_write';
  err.currentVersion = currentVersion;
  err.attemptedVersion = attemptedVersion;
  return err;
}

/**
 * `T` must carry `id: string`. Entities that participate in optimistic
 * concurrency (Phase 06 formalizes this repo-wide) should also carry
 * `version: number` — when present, `update()` enforces it.
 */
export interface Repository<T extends { id: string }> {
  get(id: string): Promise<T | null>;
  list(): Promise<T[]>;
  query(predicate: Partial<T>): Promise<T[]>;
  /** MVP: records whose array field `field` contains `value` (Firestore `array-contains`). */
  queryContains(field: keyof T & string, value: string): Promise<T[]>;
  create(record: T): Promise<T>;
  /** Full replace of a record. If `expectedVersion` is passed and the
   * stored record's `version` differs, rejects with a `StaleWriteError`
   * instead of silently overwriting a concurrent change. */
  update(id: string, patch: Partial<T>, expectedVersion?: number): Promise<T>;
  /** Live subscription. Returns an unsubscribe function. Demo repositories
   * implement this by re-invoking `onChange` on every local mutation. */
  subscribe(onChange: (records: T[]) => void): () => void;
}
