/**
 * Offline field evidence — reuses V3's Outbox + IndexedDB store
 * (src/offline/*) unchanged. Capture never waits for the network:
 * evidence goes to IndexedDB first, then syncs with an idempotency key
 * so a retried upload can never create a duplicate on the server.
 *
 * Status per item: SYNCED · PENDING SYNC · SYNC FAILED.
 */
import { useEffect, useState } from 'react';
import { Outbox } from '../../src/offline/outbox';
import { createIndexedDbStore } from '../../src/offline/indexedDbStore';
import { createMemoryStore } from '../../src/offline/memoryStore';
import type { DurableStore, OutboxItem } from '../../src/offline/types';
import { apiRaw } from './api';

export interface EvidencePayload {
  workId: string; kind: string; label?: string; data: unknown; capturedAt: number; lat?: number | null; lng?: number | null;
}
type Item = OutboxItem<EvidencePayload>;

let store: DurableStore<Item>;
try {
  store = typeof indexedDB !== 'undefined' ? createIndexedDbStore<Item>('aiec-mvp-evidence') : createMemoryStore<Item>();
} catch {
  store = createMemoryStore<Item>();
}
const outbox = new Outbox<EvidencePayload>(store);
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(l => l());

let counter = 0;
export async function queueEvidence(p: EvidencePayload): Promise<void> {
  // Time-ordered key so evidence syncs in capture order; unique per capture.
  const key = `${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await outbox.enqueue(`evidence:${p.kind}`, p, key);
  changed();
  void syncNow();
}

const NETWORK = 'NETWORK: ';

async function send(p: EvidencePayload, idempotencyKey: string): Promise<void> {
  let r;
  try {
    r = await apiRaw(`/work/${encodeURIComponent(p.workId)}/evidence`, 'POST', { ...p, idempotencyKey });
  } catch (e) {
    throw new Error(NETWORK + (e instanceof Error ? e.message : String(e)));
  }
  if (r.status >= 500) throw new Error(NETWORK + `server HTTP ${r.status}`);
  if (r.status >= 400) throw new Error((r.body as any)?.message ?? `HTTP ${r.status}`);
}

let syncing = false;
export async function syncNow(): Promise<void> {
  // No network → don't even try, so being offline never burns retry attempts.
  if (syncing || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  syncing = true;
  try {
    await outbox.syncAll(send);
    // Only a real server REJECTION counts toward the 5-attempt limit. A
    // flaky network is retried forever: field evidence is never given up on.
    for (const i of await store.list()) {
      if (i.status === 'failed' && i.lastError?.startsWith(NETWORK)) await store.put({ ...i, attempts: Math.max(0, i.attempts - 1) });
    }
  } catch { /* never throws by design; belt and braces */ } finally {
    syncing = false;
    changed();
  }
}

/** SYNC FAILED items stop retrying after 5 attempts; the user can retry by hand. */
export async function retryFailed(): Promise<void> {
  for (const i of await store.list()) {
    if (i.status === 'failed') await store.put({ ...i, attempts: 0, status: 'pending' });
  }
  await syncNow();
}

export type SyncLabel = 'SYNCED' | 'PENDING SYNC' | 'SYNC FAILED';
export function labelOf(i: Item): SyncLabel {
  if (i.status === 'synced') return 'SYNCED';
  if (i.status === 'conflict' || (i.status === 'failed' && i.attempts >= 5)) return 'SYNC FAILED';
  return 'PENDING SYNC';
}

export function useOutbox(workId: string): { items: Item[]; pending: number; failed: number } {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const all = (await store.list()).filter(i => i.payload.workId === workId).sort((a, b) => a.id.localeCompare(b.id));
      if (alive) setItems(all);
    };
    load();
    listeners.add(load);
    return () => { alive = false; listeners.delete(load); };
  }, [workId]);
  return {
    items,
    pending: items.filter(i => labelOf(i) === 'PENDING SYNC').length,
    failed: items.filter(i => labelOf(i) === 'SYNC FAILED').length,
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void syncNow());
  setInterval(() => void syncNow(), 4000);
}
