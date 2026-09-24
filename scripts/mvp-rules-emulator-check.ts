/**
 * MVP Firestore-rules check against the Firebase EMULATOR (D-19): S8 access control plus the
 * Step 03 rules (participant model, F-1 self-role fix, cost hiding, forward-only stages).
 *
 * Run with:  npm run mvp:rules
 * (wraps `firebase emulators:exec` with project `demo-aie-mvp`; refuses to run without
 *  FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST, so it can never reach a real project.)
 *
 * Seeding uses the emulator's `Bearer owner` rules bypass; every assertion uses a real signed-in
 * client (Auth emulator) so the rules are what decide.
 */
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where,
  type Firestore,
} from 'firebase/firestore';

const PROJECT = 'demo-aie-mvp';
const FS = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FS || !AUTH || !PROJECT.startsWith('demo-')) {
  console.error('Refusing to run: FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST must be set (run via `npm run mvp:rules`).');
  process.exit(1);
}

let failures = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`OK: ${msg}`);
  else { failures++; console.error(`FAIL: ${msg}`); }
}

// ---- Seeding through the emulator REST API (rules bypass) ----
function toValue(v: any): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
  return { stringValue: String(v) };
}

async function seed(path: string, data: Record<string, unknown>) {
  const res = await fetch(`http://${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toValue(v)])) }),
  });
  if (!res.ok) throw new Error(`seed ${path} failed: ${res.status} ${await res.text()}`);
}

async function authUser(email: string): Promise<string> {
  const base = `http://${AUTH}/identitytoolkit.googleapis.com/v1`;
  const signUp = await fetch(`${base}/accounts:signUp?key=fake-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123', returnSecureToken: true }),
  });
  const { localId } = await signUp.json() as { localId: string };
  await fetch(`${base}/projects/${PROJECT}/accounts:update`, {
    method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId, emailVerified: true }),
  });
  return localId;
}

const apps: FirebaseApp[] = [];
async function clientFor(email: string | null): Promise<Firestore> {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key' }, `app-${email ?? 'anon'}-${apps.length}`);
  apps.push(app);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, FS!.split(':')[0], Number(FS!.split(':')[1]));
  if (email) {
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${AUTH}`, { disableWarnings: true });
    await signInWithEmailAndPassword(auth, email, 'password123');
  }
  return db;
}

async function allowed(p: Promise<unknown>): Promise<boolean> {
  try { await p; return true; } catch (e: any) {
    if (e?.code === 'permission-denied') return false;
    throw e;
  }
}

async function main() {
  // ---- Users ----
  const emails = ['admin', 'owner', 'sales', 'surveyor', 'tech1', 'tech2', 'qc', 'cust', 'cust2', 'newbie', 'invited', 'invadmin'].map(k => `${k}@test.example`);
  const uid: Record<string, string> = {};
  for (const e of emails) uid[e.split('@')[0]] = await authUser(e);
  const roles: Record<string, [string, string?]> = {
    admin: ['admin'], owner: ['owner'], sales: ['sales'], surveyor: ['surveyor'], tech1: ['technician'], tech2: ['technician'],
    qc: ['qc'], cust: ['customer', 'C1'], cust2: ['customer', 'C2'],
  };
  for (const [k, [role, customerId]] of Object.entries(roles)) {
    await seed(`users/${uid[k]}`, { id: uid[k], role, status: 'active', name: k, ...(customerId ? { customerId } : {}) });
  }

  // ---- Data: one order for customer C1, tech1 on an open task ----
  const participants = [uid.sales, 'customer:C1', uid.tech1].sort();
  await seed('projects/ord1', { id: 'ord1', customerId: 'C1', siteId: 'S1', stage: 'installation', status: 'ACTIVE', ownerUserId: uid.sales, title: 'ABC', participantIds: participants, version: 3 });
  await seed('projects/ord2', { id: 'ord2', customerId: 'C2', siteId: 'S2', stage: 'quoting', status: 'ACTIVE', ownerUserId: uid.sales, title: 'XYZ', participantIds: [uid.sales, 'customer:C2'], version: 1 });
  await seed('customers/C1', { id: 'C1', name: 'ABC', phone: '9876543210', sourceLeadId: 'lead1' });
  await seed('leads/lead1', { id: 'lead1', stage: 'assigned', ownerUserId: uid.sales, contactInfo: { name: 'ABC', phone: '9876543210', email: '' }, buildingInfo: { address: 'Baner', floors: 8, type: 'commercial' } });
  await seed('tasks/ord1__INSTALLATION__1', { id: 'ord1__INSTALLATION__1', orderId: 'ord1', type: 'INSTALLATION', stage: 'INSTALLATION', assigneeId: uid.tech1, assigneeRole: 'technician', status: 'TODO', dueDate: '2026-10-22', version: 0 });
  await seed('tasks/ord1__QUOTE_DECISION__1', { id: 'ord1__QUOTE_DECISION__1', orderId: 'ord1', type: 'QUOTE_DECISION', stage: 'QUOTE', assigneeId: 'customer:C1', assigneeRole: 'customer', status: 'COMPLETED', dueDate: '2026-10-08', version: 1 });
  await seed('quotes/q1', { id: 'q1', projectId: 'ord1', status: 'sent', createdBy: uid.admin });
  await seed('quote_versions/qv1', { id: 'qv1', quoteId: 'q1', projectId: 'ord1', totalAmount: 1180000, createdBy: uid.admin });
  await seed('quote_costs/qv1', { id: 'qv1', orderId: 'ord1', estimatedCost: 800000, markupPct: 25 });
  await seed('purchase_orders/po1', { id: 'po1', projectId: 'ord1', amount: 700000, createdBy: uid.admin });
  await seed('payment_milestones/m1', { id: 'm1', orderId: 'ord1', kind: 'BOOKING_TOKEN', amount: 10000, status: 'PENDING', version: 0 });
  await seed('notifications/n1', { id: 'n1', audienceUserId: uid.tech1, templateId: 'mvp_task_assigned', status: 'delivered' });
  await seed('notifications/n2', { id: 'n2', audienceUserId: 'role:admin', templateId: 'mvp_blocker_raised', status: 'delivered' });
  await seed('invites/invited@test.example', { id: 'invited@test.example', email: 'invited@test.example', role: 'technician', name: 'Invited' });
  await seed('invites/invadmin@test.example', { id: 'invadmin@test.example', email: 'invadmin@test.example', role: 'admin', name: 'Inv Admin' });
  await seed('counters/orders', { id: 'orders', value: 5 });
  await seed('idempotency_keys/k_sales', { id: 'k_sales', opType: 'x', idempotencyKey: 'k', status: 'completed', ownerUid: uid.sales });

  const db: Record<string, Firestore> = {};
  for (const k of [...Object.keys(roles), 'newbie', 'invited', 'invadmin']) db[k] = await clientFor(`${k}@test.example`);
  const anon = await clientFor(null);

  // ---- S8 ----
  ok(!(await allowed(getDoc(doc(anon, 'projects/ord1')))), 'S8: a signed-out user reads nothing');
  ok(await allowed(getDoc(doc(db.cust, 'projects/ord1'))), 'customer reads their own order');
  ok(!(await allowed(getDoc(doc(db.cust2, 'projects/ord1')))), "S8: cust2 cannot read cust's order");
  ok(!(await allowed(getDoc(doc(db.cust2, 'tasks/ord1__INSTALLATION__1')))), "S8: cust2 cannot read cust's tasks");
  ok(await allowed(getDocs(query(collection(db.cust, 'projects'), where('participantIds', 'array-contains', 'customer:C1')))), 'customer can list their orders by participant token');
  ok(!(await allowed(getDocs(query(collection(db.cust2, 'projects'), where('participantIds', 'array-contains', 'customer:C1'))))), 'cust2 cannot list by another customer token');
  ok(!(await allowed(getDoc(doc(db.tech2, 'projects/ord1')))), 'S8: tech2 cannot read an order where they have no task');
  ok(await allowed(getDoc(doc(db.tech1, 'projects/ord1'))), 'tech1 reads the order they have a task on');
  ok(await allowed(getDocs(query(collection(db.tech1, 'tasks'), where('assigneeId', '==', uid.tech1)))), 'tech1 lists their own tasks');
  ok(await allowed(getDocs(query(collection(db.tech1, 'tasks'), where('orderId', '==', 'ord1')))), 'a participant lists the tasks of their order');
  ok(!(await allowed(getDocs(query(collection(db.tech2, 'tasks'), where('orderId', '==', 'ord1'))))), 'a non-participant cannot list an order\'s tasks');
  ok(!(await allowed(updateDoc(doc(db.tech1, `users/${uid.tech1}`), { role: 'admin' }))), 'S8: a non-admin cannot change a role');
  ok(!(await allowed(updateDoc(doc(db.cust, 'payment_milestones/m1'), { status: 'PAID' }))), 'S8: a customer cannot change a payment status');
  ok(await allowed(updateDoc(doc(db.cust, 'payment_milestones/m1'), { proof: { reference: 'UTR TEST123' } })), 'a customer can attach payment proof');
  ok(!(await allowed(setDoc(doc(db.cust, 'quote_versions/qv2'), { id: 'qv2', quoteId: 'q1', projectId: 'ord1', totalAmount: 1 }))), 'S8: a customer cannot write a quote price');
  ok(!(await allowed(updateDoc(doc(db.cust, 'quotes/q1'), { status: 'accepted', totalAmount: 1 }))), 'a customer cannot change quote fields beyond the decision');
  ok(await allowed(updateDoc(doc(db.cust, 'quotes/q1'), { status: 'accepted', decidedAt: '2026-10-01' })), 'the customer can accept their sent quote');
  ok(!(await allowed(getDoc(doc(db.cust, 'quote_costs/qv1')))), 'S8/I-5: the customer cannot read estimatedCost');
  ok(!(await allowed(getDoc(doc(db.tech1, 'quote_costs/qv1')))), 'S8/I-5: a technician cannot read estimatedCost');
  ok(await allowed(getDoc(doc(db.owner, 'quote_costs/qv1'))) && await allowed(getDoc(doc(db.admin, 'quote_costs/qv1'))), 'admin and owner read cost');
  ok(!(await allowed(getDoc(doc(db.cust, 'purchase_orders/po1')))), 'a customer cannot read PO amounts');
  ok(await allowed(getDoc(doc(db.cust, 'quote_versions/qv1'))), 'the customer reads their customer-facing quote');
  ok(await allowed(getDocs(query(collection(db.cust, 'quote_versions'), where('projectId', '==', 'ord1')))), 'the customer lists their quote versions by order');
  ok(!(await allowed(getDocs(query(collection(db.cust2, 'quote_versions'), where('projectId', '==', 'ord1'))))), 'another customer cannot list them');
  ok(await allowed(getDocs(query(collection(db.cust, 'payment_milestones'), where('orderId', '==', 'ord1')))), 'the customer lists their payment milestones');

  // ---- F-1: self-created roles ----
  ok(!(await allowed(setDoc(doc(db.newbie, `users/${uid.newbie}`), { id: uid.newbie, role: 'surveyor', status: 'active' }))), 'F-1: an uninvited user cannot self-create an active surveyor');
  ok(await allowed(setDoc(doc(db.newbie, `users/${uid.newbie}`), { id: uid.newbie, role: 'pending_selection', status: 'pending' })), 'an uninvited user can create the pending placeholder');
  ok(!(await allowed(updateDoc(doc(db.newbie, `users/${uid.newbie}`), { role: 'technician', status: 'active' }))), 'a pending user cannot promote themself without an invite');
  ok(!(await allowed(setDoc(doc(db.invited, `users/${uid.invited}`), { id: uid.invited, role: 'qc', status: 'active' }))), 'an invited user cannot claim a different role than invited');
  ok(await allowed(setDoc(doc(db.invited, `users/${uid.invited}`), { id: uid.invited, role: 'technician', status: 'active' })), 'an invited user gets exactly the invited role');
  ok(!(await allowed(setDoc(doc(db.invadmin, `users/${uid.invadmin}`), { id: uid.invadmin, role: 'admin', status: 'active' }))), 'an invite can never self-create an admin');
  ok(!(await allowed(getDoc(doc(db.cust, 'invites/invited@test.example')))), 'a user cannot read someone else\'s invite');
  ok(!(await allowed(getDoc(doc(db.surveyor, 'customers/C1')))), 'F-1: a surveyor with no relation cannot read a customer');
  ok(await allowed(getDoc(doc(db.sales, 'customers/C1'))), 'the lead owner reads the customer created from their lead');

  // ---- Order writes ----
  ok(await allowed(updateDoc(doc(db.tech1, 'projects/ord1'), { stage: 'qc', version: 4 })), 'a participant moves the stage forward');
  ok(!(await allowed(updateDoc(doc(db.tech1, 'projects/ord1'), { stage: 'survey' }))), 'I-4: a participant cannot move the stage backwards');
  ok(!(await allowed(updateDoc(doc(db.tech1, 'projects/ord1'), { status: 'COMPLETED' }))), 'a participant cannot complete or cancel an order');
  ok(!(await allowed(updateDoc(doc(db.tech1, 'projects/ord1'), { customerId: 'C9' }))), 'a participant cannot change the customer');
  ok(!(await allowed(setDoc(doc(db.tech2, 'tasks/ord1__REWORK__1'), { id: 'ord1__REWORK__1', orderId: 'ord1', type: 'REWORK', assigneeId: uid.tech2, status: 'TODO' }))), 'a non-participant cannot create tasks on the order');
  ok(!(await allowed(updateDoc(doc(db.tech1, 'tasks/ord1__INSTALLATION__1'), { assigneeId: uid.tech2 }))), 'only the Admin can reassign a task');
  ok(await allowed(updateDoc(doc(db.tech1, 'tasks/ord1__INSTALLATION__1'), { status: 'IN_PROGRESS', version: 1 })), 'the assignee can progress their task');

  // Customer writes are limited to their own decisions (scope-guard fix, Step 03).
  ok(!(await allowed(updateDoc(doc(db.cust, 'projects/ord1'), { sellingPrice: 1 }))), 'a customer cannot set sellingPrice');
  ok(!(await allowed(updateDoc(doc(db.cust, 'projects/ord1'), { qcPassedAt: '2026-10-01' }))), 'a customer cannot set qcPassedAt');
  ok(!(await allowed(updateDoc(doc(db.cust, 'projects/ord1'), { stage: 'warranty_amc' }))), 'a customer cannot jump the stage');
  ok(!(await allowed(updateDoc(doc(db.cust, 'projects/ord1'), { status: 'ON_HOLD' }))), 'a customer cannot put the order on hold');
  ok(!(await allowed(updateDoc(doc(db.cust, 'projects/ord1'), { participantIds: [uid.sales, 'customer:C1', uid.tech1, uid.cust2] }))), 'a customer cannot add participants');
  ok(!(await allowed(updateDoc(doc(db.cust, 'tasks/ord1__INSTALLATION__1'), { status: 'COMPLETED' }))), "a customer cannot complete a technician's task");
  await seed('tasks/ord1__SITE_READINESS__1', { id: 'ord1__SITE_READINESS__1', orderId: 'ord1', type: 'SITE_READINESS', stage: 'SITE_READY', assigneeId: 'customer:C1', assigneeRole: 'customer', status: 'TODO', dueDate: '2026-10-15', version: 0 });
  ok(await allowed(updateDoc(doc(db.cust, 'tasks/ord1__SITE_READINESS__1'), { data: { readiness: { pitDry: { ok: true } } }, evidenceIds: ['d1'], version: 1 })), 'the customer records their readiness checklist on their own task');
  ok(!(await allowed(updateDoc(doc(db.cust2, 'tasks/ord1__SITE_READINESS__1'), { data: {} }))), 'another customer cannot');
  ok(!(await allowed(setDoc(doc(db.cust, 'tasks/ord1__REWORK__9'), { id: 'ord1__REWORK__9', orderId: 'ord1', type: 'REWORK', assigneeId: uid.tech1, status: 'TODO' }))), 'a customer cannot create tasks for staff');
  ok(await allowed(setDoc(doc(db.cust, 'tasks/ord1__VERIFY_SITE_READY__1'), { id: 'ord1__VERIFY_SITE_READY__1', orderId: 'ord1', type: 'VERIFY_SITE_READY', assigneeId: 'role:admin', status: 'TODO' })), 'a customer event can create an Admin task');
  ok(!(await allowed(updateDoc(doc(db.tech1, 'projects/ord1'), { status: 'ON_HOLD' }))), 'a technician cannot put the order on hold');
  ok(!(await allowed(updateDoc(doc(db.tech1, 'projects/ord1'), { qcPassedAt: '2026-10-01' }))), 'a technician cannot mark QC passed');
  ok(!(await allowed(setDoc(doc(db.tech1, 'surveys/sv1'), { id: 'sv1', orderId: 'ord1', surveyorId: uid.tech1 }))), 'only a surveyor can create a survey');

  // Step 05: surveys and leads are scoped.
  await seed('surveys/sv_ord2', { id: 'sv_ord2', orderId: 'ord2', surveyorId: 'someone', result: 'FEASIBLE' });
  ok(!(await allowed(getDoc(doc(db.surveyor, 'surveys/sv_ord2')))), 'a surveyor cannot open a survey on an order they are not part of');
  await seed('leads/lead_other', { id: 'lead_other', stage: 'captured', ownerUserId: 'another_sales', contactInfo: { name: 'X', phone: '9', email: '' }, buildingInfo: { address: 'Y', floors: 1, type: 'residential' } });
  ok(await allowed(getDocs(query(collection(db.sales, 'leads'), where('ownerUserId', '==', uid.sales)))), 'sales lists their own leads');
  ok(!(await allowed(getDoc(doc(db.sales, 'leads/lead_other')))), "sales cannot read another salesperson's lead");
  ok(!(await allowed(setDoc(doc(db.sales, 'leads/lead_spoof'), { id: 'lead_spoof', stage: 'captured', ownerUserId: 'another_sales' }))), 'sales cannot create a lead owned by someone else');

  // S7: reassign removes tech1 from participants → tech1 loses access.
  await seed('projects/ord1', { id: 'ord1', customerId: 'C1', siteId: 'S1', stage: 'installation', status: 'ACTIVE', ownerUserId: uid.sales, title: 'ABC', participantIds: [uid.sales, 'customer:C1', uid.tech2].sort(), version: 5 });
  await seed('tasks/ord1__INSTALLATION__1', { id: 'ord1__INSTALLATION__1', orderId: 'ord1', type: 'INSTALLATION', stage: 'INSTALLATION', assigneeId: uid.tech2, assigneeRole: 'technician', status: 'TODO', dueDate: '2026-10-19', version: 2 });
  ok(!(await allowed(getDoc(doc(db.tech1, 'projects/ord1')))), 'S7: tech1 loses access after reassignment');
  ok(await allowed(getDoc(doc(db.tech2, 'projects/ord1'))), 'S7: tech2 gains access after reassignment');

  // ---- Notifications, counters, idempotency ----
  ok(await allowed(getDoc(doc(db.tech1, 'notifications/n1'))), 'the audience reads their notification');
  ok(!(await allowed(getDoc(doc(db.tech2, 'notifications/n1')))), 'another user cannot read it');
  ok(await allowed(getDoc(doc(db.admin, 'notifications/n2'))), 'role:admin notifications reach the admin');
  ok(await allowed(updateDoc(doc(db.tech1, 'notifications/n1'), { readAt: '2026-10-01' })), 'the audience can mark it read');
  ok(!(await allowed(updateDoc(doc(db.tech1, 'notifications/n1'), { templateId: 'x' }))), 'the audience cannot edit it');
  ok(await allowed(updateDoc(doc(db.sales, 'counters/orders'), { value: 6 })), 'the order counter moves by +1');
  ok(!(await allowed(updateDoc(doc(db.sales, 'counters/orders'), { value: 9 }))), 'the order counter cannot jump');
  ok(!(await allowed(updateDoc(doc(db.tech1, 'counters/orders'), { value: 7 }))), 'a technician cannot touch the counter');
  ok(await allowed(getDoc(doc(db.sales, 'idempotency_keys/k_sales'))), 'a user reads back their own idempotency claim');
  ok(!(await allowed(getDoc(doc(db.cust, 'idempotency_keys/k_sales')))), 'another user cannot read that claim');
  ok(await allowed(getDoc(doc(db.cust, 'idempotency_keys/does-not-exist'))), 'an unclaimed key can be checked (transactional claim)');

  for (const a of apps) await deleteApp(a).catch(() => undefined);
  if (failures) { console.error(`\n${failures} rules assertion(s) FAILED`); process.exit(1); }
  console.log('\nPASS: mvp-rules-emulator-check');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
