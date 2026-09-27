/**
 * Real (non-demo) Firestore-backed repository — Phase 04.
 *
 * This is a genuine production integration boundary: it calls the
 * Firestore Web SDK against the project's actual named database
 * (see src/lib/firebase.ts), the same pattern already proven by
 * src/lib/firestoreUsers.ts and src/lib/firestoreLeads.ts (Phase 01
 * confirmed those are real, working integrations, not simulations).
 *
 * KNOWN INTEGRATION GAP (documented per pack instructions — "build the
 * production-safe interface... document the missing credential"):
 * this sandbox environment has outbound network access to
 * firestore.googleapis.com (verified: the API responds, including a
 * real 403 PERMISSION_DENIED for an unauthenticated request against a
 * rule that requires auth) but has NO Firebase Auth credential available
 * to it — no service account key, no OAuth browser flow, no signed-in
 * user session. That means this module's read/write calls are exercised
 * here only up to the point of "reaches Firestore and gets a real
 * permission decision back," not "round-trips as an authenticated user."
 * The code path is identical to the already-shipped
 * firestoreUsers.ts/firestoreLeads.ts pattern, so it inherits their
 * verified-working production behavior; end-to-end verification with a
 * real signed-in browser session is the one thing this environment
 * cannot do and is called out explicitly in the implementation log and
 * final acceptance report rather than being claimed as tested.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type QueryConstraint,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Repository } from './types';
import { makeNotFoundError, makeStaleWriteError } from './types';

const stripUndefined = <T extends object>(obj: T): T => JSON.parse(JSON.stringify(obj));

/**
 * Documents read through this repository since the page (or script) started, per collection —
 * Firestore bills per document read (an empty query still costs 1). Used by the multi-user
 * load test to measure what each screen and the auto-refresh really cost.
 */
export const firestoreReadStats: { total: number; byCollection: Record<string, number> } = { total: 0, byCollection: {} };
function countReads(collectionName: string, docs: number): void {
  const n = Math.max(1, docs);
  firestoreReadStats.total += n;
  firestoreReadStats.byCollection[collectionName] = (firestoreReadStats.byCollection[collectionName] ?? 0) + n;
}

export function createFirestoreRepository<T extends { id: string; version?: number }>(
  collectionName: string,
): Repository<T> {
  function requireDb() {
    if (!db) {
      throw new Error(
        `Firestore is not initialized — cannot access collection "${collectionName}". ` +
        `This means firebase config failed to load (see src/lib/firebase.ts); it is NOT ` +
        `the same as demo mode, which should never reach this code path at all.`,
      );
    }
    return db;
  }

  return {
    async get(id) {
      const snap = await getDoc(doc(requireDb(), collectionName, id));
      countReads(collectionName, 1);
      return snap.exists() ? (snap.data() as T) : null;
    },

    async list() {
      const snap = await getDocs(collection(requireDb(), collectionName));
      countReads(collectionName, snap.size);
      return snap.docs.map(d => d.data() as T);
    },

    async query(predicate) {
      const constraints: QueryConstraint[] = Object.entries(predicate).map(([k, v]) => where(k, '==', v));
      const snap = await getDocs(query(collection(requireDb(), collectionName), ...constraints));
      countReads(collectionName, snap.size);
      return snap.docs.map(d => d.data() as T);
    },

    async queryContains(field, value) {
      const snap = await getDocs(query(collection(requireDb(), collectionName), where(field, 'array-contains', value)));
      countReads(collectionName, snap.size);
      return snap.docs.map(d => d.data() as T);
    },

    async create(record) {
      await setDoc(doc(requireDb(), collectionName, record.id), stripUndefined(record));
      return record;
    },

    async update(id, patch, expectedVersion) {
      const database = requireDb();
      const ref = doc(database, collectionName, id);
      if (expectedVersion === undefined) {
        await updateDoc(ref, stripUndefined(patch) as any);
        const updated = await getDoc(ref);
        if (!updated.exists()) throw makeNotFoundError(collectionName, id);
        return updated.data() as T;
      }
      // Versioned update: check-and-write as ONE transaction, so two people saving the same
      // record at the same moment can never silently overwrite each other (multi-user test
      // finding). Firestore retries the transaction on contention; if the other save landed
      // first, the version no longer matches and the caller gets a stale-write error.
      return runTransaction(database, async tx => {
        const current = await tx.get(ref);
        if (!current.exists()) throw makeNotFoundError(collectionName, id);
        const data = current.data() as T;
        const currentVersion = data.version ?? 0;
        if (currentVersion !== expectedVersion) throw makeStaleWriteError(currentVersion, expectedVersion);
        // Auto-increment unless the caller explicitly set `version` in the patch — see the
        // matching comment in demoRepository.ts for why this must not be left to every caller.
        const effectivePatch = ('version' in patch ? patch : { ...patch, version: expectedVersion + 1 }) as Partial<T>;
        const clean = stripUndefined(effectivePatch);
        tx.update(ref, clean as any);
        return { ...data, ...clean } as T;
      });
    },

    subscribe(onChange) {
      if (!db) {
        console.error(`Firestore is not initialized — subscribe("${collectionName}") is a no-op.`);
        return () => {};
      }
      return onSnapshot(
        collection(db, collectionName),
        snap => onChange(snap.docs.map(d => d.data() as T)),
        err => console.error(`Firestore subscription failed for "${collectionName}":`, err),
      );
    },
  };
}
