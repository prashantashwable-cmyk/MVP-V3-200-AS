/**
 * Phase 11 acceptance check — offline outbox + resumable media upload.
 * "Simulate network interruption during field evidence upload and
 * verify that work is not lost."
 *
 * Run with: npx tsx scripts/offline-sync-check.ts
 */
import { createMemoryStore } from '../src/offline/memoryStore';
import { Outbox } from '../src/offline/outbox';
import type { OutboxItem } from '../src/offline/types';
import { MediaUploadManager, MAX_UPLOAD_BYTES, type MediaUploadItem, type UploadTransport } from '../src/offline/mediaUpload';
import { makeStaleWriteError } from '../src/repository/types';
import { getRepository } from '../src/repository';
import type { RepositoryContext } from '../src/repository/types';
import type { DocumentRecord } from '../src/domain/entities';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`OK: ${msg}`);
}

const ctx: RepositoryContext = { environment: 'demo', actorUserId: 'user-tech-1' };

async function outboxScenario() {
  const store = createMemoryStore<OutboxItem<Record<string, unknown>>>();
  const outbox = new Outbox(store);

  // Field screen enqueues while offline — must succeed with zero network.
  const item = await outbox.enqueue('installation.evidenceNote', { jobId: 'job_1', note: 'Door aligned' }, 'idem-note-1');
  assert(item.status === 'pending', 'enqueue succeeds immediately with no network dependency');
  assert(await outbox.pendingCount() === 1, 'pending count reflects the queued item');

  // Re-enqueueing the same logical action (e.g. double-tap while offline) is a no-op.
  await outbox.enqueue('installation.evidenceNote', { jobId: 'job_1', note: 'Door aligned' }, 'idem-note-1');
  assert((await store.list()).length === 1, 're-enqueueing the same idempotency key does not duplicate the outbox item');

  // Simulate network interruption: first sync attempt fails transiently.
  let callCount = 0;
  const flakySyncFn = async () => {
    callCount++;
    if (callCount === 1) throw new Error('Simulated network interruption (fetch failed)');
    // second call (retry) succeeds
  };
  const round1 = await outbox.syncAll(flakySyncFn);
  assert(round1.failed === 1 && round1.synced === 0, 'first sync attempt fails (simulated network interruption)');
  const afterFail = await store.get('idem-note-1');
  assert(afterFail?.status === 'failed' && afterFail.attempts === 1, 'the item is marked failed but STILL PRESENT — work is not lost');
  assert(JSON.stringify(afterFail?.payload) === JSON.stringify({ jobId: 'job_1', note: 'Door aligned' }), 'the original field payload is intact after the failed attempt');

  const round2 = await outbox.syncAll(flakySyncFn);
  assert(round2.synced === 1, 'retrying after connectivity returns succeeds — same data, no re-entry required from the technician');
  const afterSync = await store.get('idem-note-1');
  assert(afterSync?.status === 'synced', 'the item is now marked synced');

  // Conflict handling: a stale write must preserve the field data, not discard it.
  await outbox.enqueue('project.advanceStage', { to: 'contract' }, 'idem-conflict-1');
  const conflictSyncFn = async () => { throw makeStaleWriteError(2, 1); };
  const round3 = await outbox.syncAll(conflictSyncFn);
  assert(round3.conflicted === 1, 'a stale-write sync failure is classified as a conflict, not a generic failure');
  const conflictItem = await store.get('idem-conflict-1');
  assert(conflictItem?.status === 'conflict' && conflictItem.conflictInfo?.currentVersion === 2, 'conflict info (server version) is preserved for manual/UI resolution');
  assert(JSON.stringify(conflictItem?.payload) === JSON.stringify({ to: 'contract' }), 'the field data itself is preserved, not discarded, on conflict');
}

async function mediaUploadScenario() {
  const store = createMemoryStore<MediaUploadItem>();

  let interruptOnce = true;
  const flakyTransport: UploadTransport = {
    async uploadChunk(item, chunk, offset) {
      if (interruptOnce) {
        interruptOnce = false;
        // Simulate: first half of the chunk "uploaded" before the connection drops.
        return { bytesUploaded: offset + Math.floor(chunk.length / 2), complete: false };
      }
      return { bytesUploaded: item.sizeBytes, complete: true, storagePath: `evidence/${item.id}.jpg` };
    },
  };

  const manager = new MediaUploadManager(store, flakyTransport);
  const data = new Uint8Array(1000).fill(1);
  const item = await manager.enqueue({ id: 'upload_1', ownerEntityType: 'InstallationJob', ownerEntityId: 'job_1', projectId: 'proj_1', contentType: 'image/jpeg', sizeBytes: data.length });
  assert(item.status === 'queued', 'evidence photo queued for upload');

  const afterFirst = await manager.uploadOne(item, data, ctx, 'user-tech-1');
  assert(afterFirst.status === 'queued' && afterFirst.bytesUploaded === 500, 'partial upload (network interruption mid-chunk) leaves bytesUploaded at the checkpoint, not reset to 0');

  const afterResume = await manager.uploadOne(afterFirst, data, ctx, 'user-tech-1');
  assert(afterResume.status === 'uploaded' && afterResume.bytesUploaded === 1000, 'resuming from the checkpoint (not restarting) completes the upload');
  assert(!!afterResume.storagePath, 'a storage path is recorded once the transport confirms completion');

  const doc = await getRepository<DocumentRecord>('documents', ctx).get(`doc_${item.id}`);
  assert(!!doc && doc!.sizeBytes === 1000, 'a real DocumentRecord is persisted through the repository layer only on confirmed completion');

  // Size-limit enforcement, before anything is queued.
  let oversizedRejected = false;
  try {
    await manager.enqueue({ id: 'upload_huge', ownerEntityType: 'InstallationJob', ownerEntityId: 'job_1', contentType: 'video/mp4', sizeBytes: MAX_UPLOAD_BYTES + 1 });
  } catch {
    oversizedRejected = true;
  }
  assert(oversizedRejected, 'an oversized file is rejected before queuing, not after a failed upload attempt');
}

async function main() {
  await outboxScenario();
  await mediaUploadScenario();
  console.log('\nPASS: offline outbox survives network interruption without losing field data, resumes correctly after retry,');
  console.log('preserves data on conflict for manual resolution, and media uploads resume from their last checkpoint rather than restarting.');
}

main();
