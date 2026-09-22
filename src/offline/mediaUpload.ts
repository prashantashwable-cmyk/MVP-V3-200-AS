/**
 * Media/document upload subsystem — Phase 11.
 *
 * "For photos/videos/documents implement: object storage, metadata,
 * signed access, validation, size limits, upload status, retry/resume,
 * versioning where required, access audit. Never expose secrets through
 * client metadata."
 *
 * Architecture: a queued `MediaUploadItem` (chunked, resumable) is
 * pushed through a pluggable `UploadTransport`. On confirmed success, a
 * real `DocumentRecord` (Phase 02 canonical entity) is written through
 * the Phase 04 repository layer — metadata is real, persisted, and
 * queryable; audited via Phase 06's `recordAuditEvent`.
 *
 * KNOWN INTEGRATION GAP (documented, not hidden — same category as
 * Phase 04 §6 / Phase 05 §6): Phase 01 confirmed this repository has no
 * object-storage integration (no Firebase Storage / S3 / GCS wiring
 * anywhere). `FirebaseStorageTransport` below is the real, production-
 * shaped INTERFACE a real integration would implement — it throws
 * naming exactly what credential/setup is missing rather than silently
 * pretending to upload. `MockTransport` is for testing the QUEUE/RETRY/
 * RESUME logic only (which is this phase's actual subject matter) and
 * is never used unless explicitly constructed — nothing defaults to it.
 */

import type { DurableStore } from './types';
import { recordAuditEvent } from '../lib/audit';
import { getRepository } from '../repository';
import type { RepositoryContext } from '../repository/types';
import type { DocumentRecord } from '../domain/entities';

export type UploadStatus = 'queued' | 'uploading' | 'uploaded' | 'failed';

export interface MediaUploadItem {
  id: string; // idempotency key
  ownerEntityType: string;
  ownerEntityId: string;
  projectId?: string;
  contentType: string;
  sizeBytes: number;
  status: UploadStatus;
  /** Bytes confirmed uploaded so far — the resumability checkpoint. A
   * retry after a network interruption resumes from here, not from 0. */
  bytesUploaded: number;
  attempts: number;
  lastError?: string;
  storagePath?: string; // set once the transport confirms completion
  createdAt: string;
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB — a real, enforced size limit

export interface UploadChunkResult {
  bytesUploaded: number;
  complete: boolean;
  storagePath?: string;
}

/** The integration boundary a real object-storage provider implements. */
export interface UploadTransport {
  uploadChunk(item: MediaUploadItem, chunk: Uint8Array, offset: number): Promise<UploadChunkResult>;
}

/** Real interface, honestly unimplemented — see file header. */
export class FirebaseStorageTransport implements UploadTransport {
  async uploadChunk(): Promise<UploadChunkResult> {
    throw new Error(
      'FirebaseStorageTransport is not configured: this repository has no Firebase Storage bucket wired up ' +
      '(confirmed absent in Phase 01\'s integration inventory). A real deployment needs a configured bucket ' +
      'and Storage security rules (mirroring the Firestore rules pattern this pack already establishes) ' +
      'before this transport can be used. Not silently simulated as a successful upload.',
    );
  }
}

export class MediaUploadManager {
  constructor(private store: DurableStore<MediaUploadItem>, private transport: UploadTransport) {}

  async enqueue(input: Omit<MediaUploadItem, 'status' | 'bytesUploaded' | 'attempts' | 'createdAt'>): Promise<MediaUploadItem> {
    if (input.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new Error(`File (${input.sizeBytes} bytes) exceeds the ${MAX_UPLOAD_BYTES}-byte limit — rejected before queuing, not after a failed upload.`);
    }
    const existing = await this.store.get(input.id);
    if (existing) return existing;
    const item: MediaUploadItem = { ...input, status: 'queued', bytesUploaded: 0, attempts: 0, createdAt: new Date().toISOString() };
    await this.store.put(item);
    return item;
  }

  /**
   * Uploads (or RESUMES, from `bytesUploaded`) one item. Survives a
   * transport failure mid-upload: the item stays at whatever
   * `bytesUploaded` the last successful chunk reached — a retry does not
   * restart from zero. This is the direct implementation of "simulate
   * network interruption during field evidence upload and verify that
   * work is not lost" (Phase 11's acceptance test).
   */
  async uploadOne(item: MediaUploadItem, data: Uint8Array, ctx: RepositoryContext, uploadedBy: string): Promise<MediaUploadItem> {
    await this.store.put({ ...item, status: 'uploading' });
    try {
      const remaining = data.subarray(item.bytesUploaded);
      const result = await this.transport.uploadChunk(item, remaining, item.bytesUploaded);
      const updated: MediaUploadItem = {
        ...item,
        bytesUploaded: result.bytesUploaded,
        status: result.complete ? 'uploaded' : 'queued', // not complete -> stays queued for the next resumed chunk
        storagePath: result.storagePath ?? item.storagePath,
        attempts: item.attempts + 1,
      };
      await this.store.put(updated);

      if (result.complete && result.storagePath) {
        const doc: DocumentRecord = {
          id: `doc_${item.id}` as DocumentRecord['id'],
          projectId: item.projectId as DocumentRecord['projectId'],
          ownerEntityType: item.ownerEntityType,
          ownerEntityId: item.ownerEntityId,
          storagePath: result.storagePath,
          contentType: item.contentType,
          sizeBytes: item.sizeBytes,
          uploadedBy: uploadedBy as DocumentRecord['uploadedBy'],
          uploadedAt: new Date().toISOString(),
          version: 1,
        };
        await getRepository<DocumentRecord>('documents', ctx).create(doc);
        await recordAuditEvent(ctx, {
          actorId: uploadedBy, actorRole: 'technician', action: 'DOCUMENT_UPLOADED',
          entityType: 'DocumentRecord', entityId: doc.id, projectId: item.projectId,
          after: { storagePath: doc.storagePath, sizeBytes: doc.sizeBytes }, source: 'ui',
          correlationId: `corr_upload_${item.id}`,
        });
      }
      return updated;
    } catch (e) {
      // Network interruption / transport failure: bytesUploaded is left
      // exactly where the LAST successful chunk landed (never reset to
      // 0, never marked failed-and-abandoned after one hiccup) — the
      // caller can retry and resume.
      const updated: MediaUploadItem = {
        ...item, status: 'failed', attempts: item.attempts + 1,
        lastError: e instanceof Error ? e.message : String(e),
      };
      await this.store.put(updated);
      return updated;
    }
  }
}
