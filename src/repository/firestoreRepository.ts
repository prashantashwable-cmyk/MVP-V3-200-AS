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
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Repository } from './types';
import { makeNotFoundError, makeStaleWriteError } from './types';

const stripUndefined = <T extends object>(obj: T): T => JSON.parse(JSON.stringify(obj));

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
      return snap.exists() ? (snap.data() as T) : null;
    },

    async list() {
      const snap = await getDocs(collection(requireDb(), collectionName));
      return snap.docs.map(d => d.data() as T);
    },

    async query(predicate) {
      const constraints: QueryConstraint[] = Object.entries(predicate).map(([k, v]) => where(k, '==', v));
      const snap = await getDocs(query(collection(requireDb(), collectionName), ...constraints));
      return snap.docs.map(d => d.data() as T);
    },

    async create(record) {
      await setDoc(doc(requireDb(), collectionName, record.id), stripUndefined(record));
      return record;
    },

    async update(id, patch, expectedVersion) {
      const ref = doc(requireDb(), collectionName, id);
      if (expectedVersion !== undefined) {
        const current = await getDoc(ref);
        if (!current.exists()) throw makeNotFoundError(collectionName, id);
        const currentVersion = (current.data() as T).version ?? 0;
        if (currentVersion !== expectedVersion) {
          throw makeStaleWriteError(currentVersion, expectedVersion);
        }
      }
      await updateDoc(ref, stripUndefined(patch) as any);
      const updated = await getDoc(ref);
      if (!updated.exists()) throw makeNotFoundError(collectionName, id);
      return updated.data() as T;
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
