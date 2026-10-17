/**
 * storage.rules on the emulator (D-16, D-19): evidence uploads are
 * images/PDF under 10 MB, written only under the uploader's own uid,
 * readable by the Admin, the uploader, the order's participants and its
 * own customer by exact path (capability link), never listable by them. Uses only the existing `firebase` package.
 *
 *   npx -y firebase-tools@15.31.0 emulators:exec --config firebase.emulator.json \
 *     --project demo-aie-mvp --only firestore,auth,storage "npx tsx scripts/mvp/storage-emulator-check.ts"
 */
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, type Firestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, ref, uploadBytes, getBytes, deleteObject, listAll, type FirebaseStorage } from 'firebase/storage';
import { check, summary } from './assert';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-aie-mvp';
if (!PROJECT.startsWith('demo-') || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  console.error('Refusing: needs the Storage emulator and a demo-* project (D-19).');
  process.exit(1);
}
// The app's named database: storage.rules look orders and users up there.
const NAMED_DB = 'ai-studio-buildit-6201e806-4162-4565-b05c-8c48e796f933';
const [fh, fp] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const [sh, sp] = process.env.FIREBASE_STORAGE_EMULATOR_HOST!.split(':');
const apps: FirebaseApp[] = [];

async function client(name: string, email?: string): Promise<{ db: Firestore; st: FirebaseStorage; uid: string }> {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-key', authDomain: 'localhost', storageBucket: `${PROJECT}.appspot.com` }, name);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'}`, { disableWarnings: true });
  const db = getFirestore(app, NAMED_DB);
  connectFirestoreEmulator(db, fh, Number(fp));
  const st = getStorage(app);
  connectStorageEmulator(st, sh, Number(sp));
  if (!email) return { db, st, uid: '' };
  // The emulator keeps accounts for the whole run, so an earlier check may already have created this one.
  const cred = await createUserWithEmailAndPassword(auth, email, 'password-123').catch(() => signInWithEmailAndPassword(auth, email, 'password-123'));
  return { db, st, uid: cred.user.uid };
}
async function allowed(p: Promise<unknown>, msg: string) {
  try { await p; check(true, msg); } catch (e) { check(false, `${msg} — denied: ${(e as any).code ?? e}`); }
}
async function denied(p: Promise<unknown>, msg: string) {
  try { await p; check(false, `${msg} — was ALLOWED`); } catch (e) { check(/unauthorized|permission/i.test(String((e as any).code ?? e)), `${msg} (${(e as any).code})`); }
}
const jpg = (n = 2000) => new Uint8Array(n).fill(7);

async function main() {
  const stamp = Date.now();
  const admin = await client('admin', 'prashantashwable@gmail.com');
  const mk = (n: string) => client(n, `${n}.${stamp}@example.test`);
  const [tech1, tech2, cust1, cust2] = await Promise.all(['tech1', 'tech2', 'cust1', 'cust2'].map(mk));
  const anon = await client('anon');
  const enrol = async (who: { db: Firestore; uid: string }, name: string, role: string, customerId?: string) => {
    const email = `${name}.${stamp}@example.test`;
    await setDoc(doc(admin.db, 'user_invites', email), { id: email, email, role, name, ...(customerId ? { customerId } : {}) });
    await setDoc(doc(who.db, 'users', who.uid), { id: who.uid, role, name, phone: '', status: 'active', ...(customerId ? { customerId } : {}) });
  };
  await enrol(tech1, 'tech1', 'technician');
  await enrol(tech2, 'tech2', 'technician');
  await enrol(cust1, 'cust1', 'customer', 'cust_S');
  await enrol(cust2, 'cust2', 'customer', 'cust_T');
  const ord = 'ord_storage_S';
  await setDoc(doc(admin.db, 'projects', ord), { id: ord, customerId: 'cust_S', siteId: 's', stage: 'installation', ownerUserId: 'x', title: 'S', participantIds: [tech1.uid] });

  const path = `orders/${ord}/${tech1.uid}_photo1.jpg`;
  await allowed(uploadBytes(ref(tech1.st, path), jpg(), { contentType: 'image/jpeg' }), 'technician uploads a photo under their own uid');
  await denied(uploadBytes(ref(tech1.st, `orders/${ord}/${tech2.uid}_fake.jpg`), jpg(), { contentType: 'image/jpeg' }), 'nobody uploads under someone else\'s uid');
  await denied(uploadBytes(ref(tech1.st, `orders/${ord}/${tech1.uid}_big.jpg`), jpg(11 * 1024 * 1024), { contentType: 'image/jpeg' }), 'files over 10 MB are refused');
  await denied(uploadBytes(ref(tech1.st, `orders/${ord}/${tech1.uid}_x.txt`), jpg(), { contentType: 'text/plain' }), 'only images and PDFs are accepted');
  await denied(uploadBytes(ref(anon.st, `orders/${ord}/anon_x.jpg`), jpg(), { contentType: 'image/jpeg' }), 'signed-out users cannot upload');
  await denied(uploadBytes(ref(tech1.st, `elsewhere/${tech1.uid}_x.jpg`), jpg(), { contentType: 'image/jpeg' }), 'nothing outside orders/ is writable');

  await allowed(getBytes(ref(tech1.st, path)), 'the uploader reads their own photo');
  await allowed(getBytes(ref(admin.st, path)), 'the Admin reads it');
  await allowed(getBytes(ref(cust1.st, path)), 'the order\'s customer reads it through the stored path');
  await denied(listAll(ref(cust2.st, `orders/${ord}`)), 'another customer cannot list the order\'s files');
  await denied(listAll(ref(tech2.st, `orders/${ord}`)), 'a technician not on the order cannot list its files');
  await allowed(listAll(ref(admin.st, `orders/${ord}`)), 'the Admin can list an order\'s files');
  await denied(getBytes(ref(anon.st, path)), 'signed-out users cannot read it');
  await denied(deleteObject(ref(tech1.st, path)), 'evidence cannot be deleted');

  await allowed(uploadBytes(ref(tech1.st, `orders/lead_${tech1.uid}/${tech1.uid}_lead.jpg`), jpg(), { contentType: 'image/jpeg' }), 'a lead photo goes in the uploader\'s own lead folder');
  await denied(uploadBytes(ref(tech1.st, `orders/lead_${tech2.uid}/${tech1.uid}_lead.jpg`), jpg(), { contentType: 'image/jpeg' }), 'nobody writes into another person\'s lead folder');

  for (const a of apps) await deleteApp(a);
  summary('mvp storage emulator check');
}

main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 300));
