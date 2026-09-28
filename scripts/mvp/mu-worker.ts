/**
 * One simulated person for the multi-user check (scripts/mvp-multiuser-check.ts). Each worker is
 * its own process with its own Firebase client, signed in to the Auth EMULATOR as a different
 * user, so the Firestore rules, transactions and races are exactly what separate phones see.
 *
 * Protocol: the coordinator writes one JSON command per stdin line
 *   {"id":1,"fn":"qualifyLead","args":["$ctx","$actor","lead_x"]}
 * and the worker answers on stdout with "@@MU {id, ok, result | error}".
 * "$ctx" / "$actor" are replaced by this worker's context and signed-in actor.
 *
 * Emulator only: refuses to start unless the project is `demo-*` and the emulator hosts are set.
 */
import '../polyfillBrowserGlobals';
import { createInterface } from 'node:readline';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../src/lib/firebase';
import { getOrCreateFirestoreUser } from '../../src/lib/firestoreUsers';
import { firestoreReadStats } from '../../src/repository/firestoreRepository';
import { getRepository } from '../../src/repository';
import type { MvpActor, MvpCtx } from '../../src/mvp/services/orderService';
import * as orderService from '../../src/mvp/services/orderService';
import * as installationService from '../../src/mvp/services/installationService';
import * as quoteService from '../../src/mvp/services/quoteService';
import * as paymentService from '../../src/mvp/services/paymentService';
import * as supplyService from '../../src/mvp/services/supplyService';
import * as evidenceService from '../../src/mvp/services/evidenceService';
import * as qcHandoverService from '../../src/mvp/services/qcHandoverService';
import * as readModels from '../../src/mvp/services/readModels';
import * as reports from '../../src/mvp/services/reports';
import * as notify from '../../src/mvp/services/notify';
import * as emergencyService from '../../src/mvp/services/emergencyService';
import * as invites from '../../src/mvp/services/invites';
import * as leadService from '../../src/mvp/services/leadService';
import * as workQueue from '../../src/services/workQueue';
import * as scoutService from '../../src/mvp/services/scoutService';
import * as riderService from '../../src/mvp/services/riderService';

const project = process.env.VITE_FIREBASE_PROJECT_ID ?? '';
if (!project.startsWith('demo-') || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('mu-worker refuses to run outside the Firebase emulator (demo-* project).');
  process.exit(1);
}

const [email, password] = process.argv.slice(2);
let actor: MvpActor;
let ctx: MvpCtx;

const services: Record<string, any> = {
  ...orderService, ...installationService, ...quoteService, ...paymentService, ...supplyService, ...evidenceService,
  ...qcHandoverService, ...readModels, ...reports, ...notify, ...emergencyService, ...invites, ...leadService, ...workQueue, ...scoutService, ...riderService,
};

const helpers: Record<string, (...a: any[]) => Promise<unknown>> = {
  async whoami() { return actor; },
  /** Re-read the signed-in profile (e.g. after the Admin's invite changed it). */
  async refreshProfile() { await signIn(); return actor; },
  async readStats() { return JSON.parse(JSON.stringify(firestoreReadStats)); },
  async resetReadStats() { firestoreReadStats.total = 0; firestoreReadStats.byCollection = {}; return true; },
  /** The repository's versioned update (the code under test for silent overwrites). */
  async repoUpdate(collection: string, id: string, patch: Record<string, unknown>, expectedVersion: number) {
    return getRepository<any>(collection, ctx).update(id, patch, expectedVersion);
  },
  /** The OLD non-transactional check-then-write, kept only to prove the race test can see a lost update. */
  async legacyUpdate(collection: string, id: string, patch: Record<string, unknown>, expectedVersion: number) {
    const ref = doc(db, collection, id);
    const current = await getDoc(ref);
    const v = (current.data() as any)?.version ?? 0;
    if (v !== expectedVersion) throw Object.assign(new Error('stale'), { code: 'stale_write' });
    await new Promise(r => setTimeout(r, 20)); // the natural gap between read and write, made visible
    await updateDoc(ref, { ...patch, version: expectedVersion + 1 });
    return true;
  },
  async rawGet(collection: string, id: string) {
    const s = await getDoc(doc(db, collection, id));
    return s.exists() ? s.data() : null;
  },
};

async function signIn(): Promise<void> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const user = await getOrCreateFirestoreUser(cred.user);
  actor = { userId: user.id, role: user.role as MvpActor['role'], name: user.name, customerId: user.customerId, authMethod: 'firebase_auth' };
  ctx = { environment: 'sandbox', actorUserId: user.id };
}

function send(msg: unknown): void {
  process.stdout.write(`@@MU ${JSON.stringify(msg)}\n`);
}

async function handle(line: string): Promise<void> {
  let cmd: { id: number; fn: string; args?: unknown[] };
  try { cmd = JSON.parse(line); } catch { return; }
  try {
    const fn = helpers[cmd.fn] ?? services[cmd.fn];
    if (typeof fn !== 'function') throw new Error(`Unknown function ${cmd.fn}`);
    const args = (cmd.args ?? []).map(a => (a === '$ctx' ? ctx : a === '$actor' ? actor : a));
    const result = await fn(...args);
    send({ id: cmd.id, ok: true, result: result === undefined ? null : JSON.parse(JSON.stringify(result)) });
  } catch (e: any) {
    send({ id: cmd.id, ok: false, error: { code: e?.code ?? e?.name ?? 'error', message: String(e?.message || e?.stack || JSON.stringify(e)) } });
  }
}

signIn()
  .then(() => {
    send({ id: 0, ok: true, result: actor });
    const rl = createInterface({ input: process.stdin });
    rl.on('line', line => { void handle(line); });
    rl.on('close', () => process.exit(0));
  })
  .catch(e => { send({ id: 0, ok: false, error: { code: e?.code ?? 'error', message: String(e?.message ?? e) } }); process.exit(1); });
