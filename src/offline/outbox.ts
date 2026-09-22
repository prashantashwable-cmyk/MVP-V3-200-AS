/**
 * Outbox queue and sync engine — Phase 11.
 *
 * UI -> `enqueue()` (always succeeds, always local-first, work is never
 * lost even with zero network) -> `syncAll()` (attempts delivery,
 * retries on transient failure, surfaces conflicts without discarding
 * the field data, marks success only when the server actually
 * confirms).
 *
 * Reuses Phase 04's `StaleWriteError`/`isStaleWriteError` and Phase 06's
 * idempotency-by-construction (the outbox item's own `id` IS its
 * idempotency key) rather than inventing a second concurrency/dedup
 * model — an outbox `sync()` call is just a delayed, retried call to
 * the same repository/service functions built in earlier phases.
 */

import type { DurableStore, OutboxItem, OutboxItemStatus } from './types';
import { isStaleWriteError } from '../repository/types';

export type SyncFn<TPayload> = (payload: TPayload, idempotencyKey: string) => Promise<void>;

const MAX_SYNC_ATTEMPTS = 5;

export class Outbox<TPayload = unknown> {
  constructor(private store: DurableStore<OutboxItem<TPayload>>) {}

  /** Local-first: always succeeds immediately, regardless of network
   * state. This is the "work is never lost" guarantee — the field
   * screen calling this never blocks on or depends on connectivity. */
  async enqueue(kind: string, payload: TPayload, idempotencyKey: string): Promise<OutboxItem<TPayload>> {
    const existing = await this.store.get(idempotencyKey);
    if (existing) {
      // Re-enqueueing the same logical action (e.g. the technician hit
      // "save" twice while offline) is a no-op, not a duplicate — same
      // idempotency-by-construction the rest of this pack relies on.
      return existing;
    }
    const item: OutboxItem<TPayload> = {
      id: idempotencyKey,
      kind,
      payload,
      idempotencyKey,
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
    };
    await this.store.put(item);
    return item;
  }

  async listByStatus(status?: OutboxItemStatus): Promise<OutboxItem<TPayload>[]> {
    const all = await this.store.list();
    return status ? all.filter(i => i.status === status) : all;
  }

  /** Attempts to sync every pending/failed (not yet exhausted, not
   * conflicted) item via `syncFn`. Never throws — a failure updates the
   * item's status/attempts and moves on, so one bad item can't block the
   * rest of the queue (a real field-reliability requirement: a
   * technician's 5 evidence photos shouldn't all get stuck because one
   * of them hit a transient error). */
  async syncAll(syncFn: SyncFn<TPayload>): Promise<{ synced: number; failed: number; conflicted: number }> {
    const items = await this.store.list();
    let synced = 0, failed = 0, conflicted = 0;

    for (const item of items) {
      if (item.status === 'synced' || item.status === 'conflict') continue;
      if (item.attempts >= MAX_SYNC_ATTEMPTS) continue;

      await this.store.put({ ...item, status: 'syncing' });
      try {
        await syncFn(item.payload, item.idempotencyKey);
        await this.store.put({ ...item, status: 'synced', attempts: item.attempts + 1, lastAttemptAt: new Date().toISOString() });
        synced++;
      } catch (e) {
        if (isStaleWriteError(e)) {
          // Conflict: the field data is PRESERVED, not discarded or
          // silently overwritten — surfaced for manual/UI resolution.
          await this.store.put({
            ...item, status: 'conflict', attempts: item.attempts + 1, lastAttemptAt: new Date().toISOString(),
            lastError: e.message, conflictInfo: { currentVersion: e.currentVersion, attemptedVersion: e.attemptedVersion },
          });
          conflicted++;
        } else {
          const attempts = item.attempts + 1;
          await this.store.put({
            ...item, status: 'failed', attempts, lastAttemptAt: new Date().toISOString(),
            lastError: e instanceof Error ? e.message : String(e),
          });
          failed++;
        }
      }
    }
    return { synced, failed, conflicted };
  }

  /** Pending + failed-but-not-exhausted + syncing items — "work still
   * waiting to reach the server," the count a field UI shows as a
   * pending-sync badge. */
  async pendingCount(): Promise<number> {
    const all = await this.store.list();
    return all.filter(i => i.status !== 'synced' && i.status !== 'conflict' && i.attempts < MAX_SYNC_ATTEMPTS).length;
  }
}
