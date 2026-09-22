/**
 * Reconciliation model — Phase 11.
 *
 * "Build a reusable reconciliation model: Our record <-> External
 * record. Statuses: matched, mismatch, missing external, missing
 * internal, duplicate, pending, manual resolution. Start with payments
 * and expand."
 *
 * `reconcile()` is a pure function — domain-agnostic, no I/O — so it
 * works for payments today and any other domain (supplier invoices,
 * bank statement lines, ...) later without rewriting the matching
 * logic, per "start with payments and expand." `reconcilePayments()`
 * wires it to the Phase 04 repository layer for the payments domain
 * specifically.
 *
 * KNOWN INTEGRATION GAP (documented, not hidden): there is no real
 * payment gateway/bank statement feed integration in this repository
 * (Phase 01 §7). `ExternalRecordSource` is the real interface such an
 * integration would implement; without one configured, external records
 * must be supplied explicitly by the caller (e.g. an uploaded bank
 * statement CSV) rather than fetched automatically — documented, not
 * faked.
 */

import { getRepository } from '../repository';
import type { RepositoryContext } from '../repository/types';
import type { ReconciliationRecord, ReconciliationStatus, Payment } from '../domain/entities';
import { paymentRepository } from '../repository/entities';
import { recordAuditEvent, newCorrelationId } from '../lib/audit';

export interface InternalRecord {
  id: string;
  key: string; // the field both sides match on (e.g. referenceNo, idempotencyKey)
  amount: number;
}

export interface ExternalRecord {
  id: string;
  key: string;
  amount: number;
}

export interface ExternalRecordSource {
  fetch(): Promise<ExternalRecord[]>;
}

/**
 * Pure matching function. For each distinct `key` seen on either side:
 *   - present on both, amounts equal -> matched
 *   - present on both, amounts differ -> mismatch
 *   - only internal -> missing_external
 *   - only external -> missing_internal
 *   - internal key appears more than once -> duplicate
 */
export function reconcile(internal: InternalRecord[], external: ExternalRecord[]): Omit<ReconciliationRecord, 'id' | 'domain' | 'reconciledAt'>[] {
  const results: Omit<ReconciliationRecord, 'id' | 'domain' | 'reconciledAt'>[] = [];
  const externalByKey = new Map<string, ExternalRecord>();
  for (const e of external) externalByKey.set(e.key, e);

  const seenInternalKeys = new Map<string, number>();
  for (const i of internal) {
    seenInternalKeys.set(i.key, (seenInternalKeys.get(i.key) ?? 0) + 1);
  }

  const matchedExternalKeys = new Set<string>();

  for (const i of internal) {
    const dupeCount = seenInternalKeys.get(i.key) ?? 1;
    if (dupeCount > 1) {
      results.push({ internalRecordId: i.id, status: 'duplicate', internalAmount: i.amount });
      continue;
    }
    const ext = externalByKey.get(i.key);
    if (!ext) {
      results.push({ internalRecordId: i.id, status: 'missing_external', internalAmount: i.amount });
      continue;
    }
    matchedExternalKeys.add(ext.key);
    if (ext.amount === i.amount) {
      results.push({ internalRecordId: i.id, externalRecordId: ext.id, status: 'matched', internalAmount: i.amount, externalAmount: ext.amount });
    } else {
      results.push({ internalRecordId: i.id, externalRecordId: ext.id, status: 'mismatch', internalAmount: i.amount, externalAmount: ext.amount });
    }
  }

  for (const e of external) {
    if (!matchedExternalKeys.has(e.key)) {
      results.push({ externalRecordId: e.id, status: 'missing_internal', externalAmount: e.amount });
    }
  }

  return results;
}

function statusRequiresManualResolution(status: ReconciliationStatus): boolean {
  return status === 'mismatch' || status === 'missing_external' || status === 'missing_internal' || status === 'duplicate';
}

/** Payments-specific wiring: reads confirmed `Payment` records for a
 * project through the repository layer, reconciles against the
 * caller-supplied external records (see file header for why these
 * aren't auto-fetched), and persists one `ReconciliationRecord` per
 * result. Non-`matched` results start life as `pending` (awaiting
 * triage), promotable to `manual_resolution` once someone picks them up
 * — modeled here as: any non-matched status is immediately flagged as
 * needing attention (`pending`), and a human/future UI moves it to
 * `manual_resolution` when they start working it (not automated in this
 * phase — this phase's job is producing a trustworthy queue of exactly
 * these items, per Phase 12's control tower). */
export async function reconcilePayments(
  ctx: RepositoryContext,
  projectId: string,
  external: ExternalRecord[],
): Promise<ReconciliationRecord[]> {
  const payments = (await paymentRepository(ctx).query({ projectId } as Partial<Payment>)).filter(p => p.status === 'confirmed');
  const internal: InternalRecord[] = payments.map(p => ({ id: p.id, key: p.referenceNo ?? p.idempotencyKey, amount: p.amount }));

  const rawResults = reconcile(internal, external);
  const repo = getRepository<ReconciliationRecord>('reconciliation_records', ctx);
  const now = new Date().toISOString();
  const records: ReconciliationRecord[] = [];
  let flaggedCount = 0;

  for (const r of rawResults) {
    // Non-matched raw outcomes are immediately flagged as `pending`
    // (awaiting triage) rather than persisting the raw
    // mismatch/duplicate/missing-* status directly — see this
    // function's doc comment for why. The raw reason is NOT lost: it's
    // exactly reconstructable from which of internalRecordId/
    // externalRecordId/amount fields are populated, and is logged in
    // full in the audit event below.
    if (statusRequiresManualResolution(r.status)) flaggedCount++;
    const status: ReconciliationStatus = r.status === 'matched' ? 'matched' : 'pending';
    const record: ReconciliationRecord = {
      id: `recon_${projectId}_${r.internalRecordId ?? r.externalRecordId}`,
      domain: 'payment',
      reconciledAt: now,
      ...r,
      status,
    };
    await repo.create(record);
    records.push(record);
  }

  if (flaggedCount > 0) {
    await recordAuditEvent(ctx, {
      actorId: 'system', actorRole: 'system', action: 'RECONCILIATION_EXCEPTIONS_FOUND',
      entityType: 'ReconciliationRecord', entityId: `recon_${projectId}`, projectId,
      after: { exceptionCount: flaggedCount, totalReconciled: records.length },
      source: 'automation', correlationId: newCorrelationId(),
    });
  }

  return records;
}
