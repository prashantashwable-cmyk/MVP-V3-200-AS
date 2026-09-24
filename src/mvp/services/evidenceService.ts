/**
 * Evidence (D-16 as changed in Step 02): photos and small documents are stored as
 * DocumentRecords in Firestore `documents` with the (already compressed) data inline,
 * ≤ MAX_EVIDENCE_BYTES, guarded by the order's participant rules. Images only, plus PDF
 * for compliance files. Compression happens in the browser (screens/PhotoInput.tsx).
 */

import type { DocumentRecord } from '../../domain/entities';
import { documentRepository } from '../../repository/entities';
import { recordAuditEvent, newCorrelationId } from '../../lib/audit';
import { MAX_EVIDENCE_BYTES } from '../config';
import { MvpError, nowOf, type MvpActor, type MvpCtx } from './orderService';

export interface EvidenceInput {
  dataUrl: string;
  contentType: string;
  orderId?: string;
  leadId?: string;
  taskId?: string;
  caption?: string;
  ownerEntityType?: string;
  ownerEntityId?: string;
}

const ALLOWED = /^(image\/(jpeg|png|webp)|application\/pdf)$/;

/** Bytes represented by a base64 data URL. */
export function dataUrlBytes(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

export function validateEvidence(input: Pick<EvidenceInput, 'dataUrl' | 'contentType'>): string | null {
  if (!ALLOWED.test(input.contentType)) return 'Only photos (JPEG, PNG, WebP) or PDF files can be attached.';
  if (!input.dataUrl.startsWith(`data:${input.contentType};base64,`)) return 'The file could not be read. Please try again.';
  if (dataUrlBytes(input.dataUrl) > MAX_EVIDENCE_BYTES) {
    return `The file is too large (max ${Math.round(MAX_EVIDENCE_BYTES / 1024)} KB after compression).`;
  }
  return null;
}

export async function saveEvidence(ctx: MvpCtx, actor: MvpActor, input: EvidenceInput): Promise<DocumentRecord> {
  const problem = validateEvidence(input);
  if (problem) throw new MvpError('invalid', problem);
  const now = nowOf(ctx);
  const id = `doc_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const record: DocumentRecord = {
    id: id as DocumentRecord['id'],
    projectId: input.orderId as DocumentRecord['projectId'],
    ownerEntityType: input.ownerEntityType ?? (input.taskId ? 'Task' : input.orderId ? 'Project' : 'Lead'),
    ownerEntityId: input.ownerEntityId ?? input.taskId ?? input.orderId ?? input.leadId ?? '',
    storagePath: `firestore:documents/${id}`,
    contentType: input.contentType,
    sizeBytes: dataUrlBytes(input.dataUrl),
    uploadedBy: actor.userId as DocumentRecord['uploadedBy'],
    uploadedAt: now.toISOString(),
    version: 1,
    dataUrl: input.dataUrl,
    caption: input.caption,
    taskId: input.taskId,
    kind: input.contentType.startsWith('image/') ? 'photo' : 'document',
  };
  const saved = await documentRepository(ctx).create(JSON.parse(JSON.stringify(record)));
  await recordAuditEvent(ctx, {
    actorId: actor.userId, actorRole: actor.role, action: 'EVIDENCE_ADDED', entityType: 'Document', entityId: id,
    projectId: input.orderId, after: { ownerEntityType: record.ownerEntityType, ownerEntityId: record.ownerEntityId, sizeBytes: record.sizeBytes },
    source: 'ui', correlationId: newCorrelationId(),
  });
  return saved;
}

export async function getEvidence(ctx: MvpCtx, ids: string[]): Promise<DocumentRecord[]> {
  const repo = documentRepository(ctx);
  const list = await Promise.all(ids.map(id => repo.get(id).catch(() => null)));
  return list.filter((d): d is DocumentRecord => !!d);
}
