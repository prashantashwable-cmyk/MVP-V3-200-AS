/**
 * ACCEPTANCE S8 + MVP collection rules, against the Firebase EMULATOR only
 * (D-19). Uses the existing `firebase` client package; no new dependency.
 * Every user is an Auth-emulator account; the Admin is the owner email the
 * rules already treat as admin, and seeds the data through the same rules.
 *
 * Run (never against a real project):
 *   npx -y firebase-tools@15.31.0 emulators:exec --config firebase.emulator.json \
 *     --project demo-aie-mvp --only firestore,auth "npx tsx scripts/mvp/rules-emulator-check.ts"
 */
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, getDocs, collection, query, where, type Firestore,
} from 'firebase/firestore';
import { check, summary } from './assert';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-aie-mvp';
if (!PROJECT.startsWith('demo-')) {
  console.error(`Refusing to run against "${PROJECT}": only demo-* emulator projects are allowed (D-19).`);
  process.exit(1);
}
const host = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

const apps: FirebaseApp[] = [];
async function client(name: string, email?: string): Promise<{ db: Firestore; uid: string }> {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-key', authDomain: 'localhost' }, name);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, host[0], Number(host[1]));
  if (!email) return { db, uid: '' };
  // The emulator keeps accounts for the whole run, so an earlier check may already have created this one.
  const cred = await createUserWithEmailAndPassword(auth, email, 'password-123').catch(() => signInWithEmailAndPassword(auth, email, 'password-123'));
  return { db, uid: cred.user.uid };
}

async function allowed(p: Promise<unknown>, msg: string) {
  try { await p; check(true, msg); } catch (e) { check(false, `${msg} — denied: ${(e as Error).message}`); }
}
async function denied(p: Promise<unknown>, msg: string) {
  try { await p; check(false, `${msg} — was ALLOWED`); } catch (e) { check(String((e as any).code ?? e).includes('permission-denied'), msg); }
}

async function main() {
  const stamp = Date.now();
  const admin = await client('admin', 'prashantashwable@gmail.com');
  const mk = (n: string) => client(n, `${n}.${stamp}@example.test`);
  const [owner, sales, tech1, tech2, cust1, cust2, newbie, invited] = await Promise.all(
    ['owner', 'sales', 'tech1', 'tech2', 'cust1', 'cust2', 'newbie', 'invited'].map(mk),
  );
  const anon = await client('anon');

  // D-13: the Admin invites each person; on first sign-in they create their
  // own profile with exactly the invited role (the rules check the invite).
  const enrol = async (who: { db: Firestore; uid: string }, name: string, role: string, customerId?: string) => {
    const email = `${name}.${stamp}@example.test`;
    await setDoc(doc(admin.db, 'user_invites', email), { id: email, email, role, name, ...(customerId ? { customerId } : {}), createdBy: 'admin', createdAt: new Date().toISOString() });
    await setDoc(doc(who.db, 'users', who.uid), { id: who.uid, role, name, phone: '', status: 'active', ...(customerId ? { customerId } : {}) });
  };
  await enrol(owner, 'owner', 'owner');
  await enrol(sales, 'sales', 'sales');
  await enrol(tech1, 'tech1', 'technician');
  await enrol(tech2, 'tech2', 'technician');
  await enrol(cust1, 'cust1', 'customer', 'cust_A');
  await enrol(cust2, 'cust2', 'customer', 'cust_B');

  // Seed one order (customer A) where tech1 has an open task, plus its records.
  const now = new Date().toISOString();
  const ord = 'ord_rules_A';
  await setDoc(doc(admin.db, 'projects', ord), {
    id: ord, customerId: 'cust_A', siteId: 'site_A', stage: 'installation', ownerUserId: sales.uid, title: 'A', status: 'ACTIVE',
    participantIds: [sales.uid, tech1.uid], displayCode: 'AE-9001', createdAt: now, updatedAt: now, version: 0,
  });
  await setDoc(doc(admin.db, 'customers', 'cust_A'), { id: 'cust_A', name: 'ABC Builders', phone: '1', orderId: ord, createdAt: now, updatedAt: now });
  await setDoc(doc(admin.db, 'sites', 'site_A'), { id: 'site_A', customerId: 'cust_A', address: 'Baner, Pune', orderId: ord, createdAt: now, updatedAt: now });
  await setDoc(doc(admin.db, 'tasks', 't_A'), {
    id: 't_A', orderId: ord, customerId: 'cust_A', type: 'INSTALLATION', title: 'Install', stage: 'INSTALLATION', assigneeId: tech1.uid,
    assigneeRole: 'technician', status: 'TODO', priority: 0, dueDate: now, evidence: [], createdBy: 'x', createdAt: now, updatedAt: now, version: 0,
  });
  await setDoc(doc(admin.db, 'order_quotes', 'q_A'), {
    id: 'q_A', orderId: ord, customerId: 'cust_A', sellingPrice: 1180000, totalExclTax: 1000000, status: 'SENT', createdAt: now, updatedAt: now, version: 0,
  });
  await setDoc(doc(admin.db, 'quote_costs', 'q_A'), { id: 'q_A', quoteId: 'q_A', orderId: ord, customerId: 'cust_A', estimatedCost: 800000 });
  await setDoc(doc(admin.db, 'payment_milestones', 'm_A'), {
    id: 'm_A', orderId: ord, customerId: 'cust_A', kind: 'DELIVERY', amount: 1052000, amountPaid: 0, status: 'PENDING', createdAt: now, updatedAt: now, version: 0,
  });
  await setDoc(doc(admin.db, 'user_invites', `invited.${stamp}@example.test`), { id: 'x', email: 'x', role: 'surveyor', name: 'Inv', createdBy: 'admin', createdAt: now });
  await denied(setDoc(doc(cust2.db, 'user_invites', `evil.${stamp}@example.test`), { role: 'admin' }), 'only the Admin can write invites');

  // --- S8: signed-out user reads anything → denied
  await denied(getDoc(doc(anon.db, 'projects', ord)), 'signed-out user cannot read an order');
  await denied(getDoc(doc(anon.db, 'tasks', 't_A')), 'signed-out user cannot read a task');

  // --- S8: cust2 reads cust's order, tasks or evidence → denied; cust1 reads own → allowed
  await denied(getDoc(doc(cust2.db, 'projects', ord)), 'cust2 cannot read cust A\'s order');
  await denied(getDoc(doc(cust2.db, 'tasks', 't_A')), 'cust2 cannot read cust A\'s task');
  await denied(getDoc(doc(cust2.db, 'payment_milestones', 'm_A')), 'cust2 cannot read cust A\'s payments');
  await allowed(getDoc(doc(cust1.db, 'projects', ord)), 'cust1 reads their own order');
  await allowed(getDocs(query(collection(cust1.db, 'projects'), where('customerId', '==', 'cust_A'))), 'cust1 lists their orders by customerId');
  await allowed(getDocs(query(collection(cust1.db, 'tasks'), where('orderId', '==', ord))), 'cust1 lists the order\'s tasks (order-scoped list rule)');
  await allowed(getDoc(doc(cust1.db, 'sites', 'site_A')), 'cust1 reads their site');
  await denied(getDocs(query(collection(cust2.db, 'tasks'), where('orderId', '==', ord))), 'cust2 cannot list cust A\'s tasks');

  // --- S8: tech2 reads an order where they have no task → denied; tech1 allowed
  await denied(getDoc(doc(tech2.db, 'projects', ord)), 'tech2 (no task) cannot read the order');
  await denied(getDocs(query(collection(tech2.db, 'tasks'), where('orderId', '==', ord))), 'tech2 cannot list its tasks');
  await allowed(getDocs(query(collection(tech1.db, 'projects'), where('participantIds', 'array-contains', tech1.uid))), 'tech1 lists orders they work on');
  await allowed(getDocs(query(collection(tech1.db, 'tasks'), where('orderId', '==', ord))), 'tech1 lists the order\'s tasks');
  await allowed(getDoc(doc(tech1.db, 'sites', 'site_A')), 'tech1 reads the site address');

  // --- S8: non-admin changes a role, a payment status or a quote price → denied
  await denied(updateDoc(doc(tech1.db, 'users', tech1.uid), { role: 'admin' }), 'a technician cannot change their own role');
  await denied(updateDoc(doc(cust1.db, 'users', cust1.uid), { customerId: 'cust_B' }), 'a customer cannot relink to another customer');
  await denied(updateDoc(doc(cust1.db, 'payment_milestones', 'm_A'), { status: 'PAID', amountPaid: 1052000 }), 'a customer cannot mark a payment PAID');
  await allowed(updateDoc(doc(cust1.db, 'payment_milestones', 'm_A'), { reference: 'UTR1', method: 'UPI', submittedAt: now }), 'a customer can submit payment proof');
  await denied(updateDoc(doc(cust1.db, 'order_quotes', 'q_A'), { sellingPrice: 1 }), 'a customer cannot change a quote price');
  await denied(updateDoc(doc(sales.db, 'order_quotes', 'q_A'), { sellingPrice: 1 }), 'sales cannot change a quote price');

  // --- S8: cust or tech1 reads estimatedCost → not visible
  await denied(getDoc(doc(cust1.db, 'quote_costs', 'q_A')), 'the customer cannot read the quote cost');
  await denied(getDoc(doc(tech1.db, 'quote_costs', 'q_A')), 'a technician cannot read the quote cost');
  const quoteAsCustomer = await getDoc(doc(cust1.db, 'order_quotes', 'q_A'));
  check(quoteAsCustomer.exists() && !('estimatedCost' in (quoteAsCustomer.data() ?? {})), 'the customer-visible quote holds no cost');
  await allowed(getDoc(doc(owner.db, 'quote_costs', 'q_A')), 'the Owner can read the cost');
  await denied(setDoc(doc(owner.db, 'quote_costs', 'q_A'), { estimatedCost: 1 }), 'the Owner cannot write the cost (read-only)');

  // --- Order updates by participants are limited
  await denied(updateDoc(doc(tech1.db, 'projects', ord), { status: 'CANCELLED' }), 'a participant cannot cancel the order');
  await denied(updateDoc(doc(tech1.db, 'projects', ord), { title: 'hacked' }), 'a participant cannot edit other order fields');
  await allowed(updateDoc(doc(tech1.db, 'projects', ord), { stage: 'qc', updatedAt: now, version: 1 }), 'a participant can move the stage');
  await allowed(updateDoc(doc(cust1.db, 'order_quotes', 'q_A'), { status: 'ACCEPTED', decidedAt: now, decidedBy: cust1.uid }), 'the customer can accept a sent quote');

  // --- Self sign-up (audit F-2, narrowed)
  await denied(setDoc(doc(newbie.db, 'users', newbie.uid), { id: newbie.uid, role: 'surveyor', name: 'n', phone: '', status: 'active' }), 'a new user cannot self-claim the surveyor role');
  await allowed(setDoc(doc(newbie.db, 'users', newbie.uid), { id: newbie.uid, role: 'pending_selection', name: 'n', phone: '', status: 'pending' }), 'a new user may self-create as pending_selection');
  await allowed(setDoc(doc(invited.db, 'users', invited.uid), { id: invited.uid, role: 'surveyor', name: 'i', phone: '', status: 'active' }), 'an invited user gets exactly the invited role');

  // --- Leads and counters
  await denied(setDoc(doc(sales.db, 'canonical_leads', 'l1'), { id: 'l1', salesOwnerId: 'someone-else' }), 'sales cannot create a lead owned by someone else');
  await allowed(setDoc(doc(sales.db, 'canonical_leads', 'l2'), { id: 'l2', salesOwnerId: sales.uid }), 'sales creates their own lead');
  await denied(getDoc(doc(tech1.db, 'canonical_leads', 'l2')), 'a technician cannot read leads');
  await allowed(setDoc(doc(sales.db, 'counters', `c${stamp}`), { id: 'c', next: 1001 }), 'sales can start the order counter');
  await denied(updateDoc(doc(sales.db, 'counters', `c${stamp}`), { next: 5000 }), 'the counter can only move forward by one');

  for (const a of apps) { await signOut(getAuth(a)).catch(() => {}); await deleteApp(a); }
  summary('mvp rules emulator check');
}

main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 200));
