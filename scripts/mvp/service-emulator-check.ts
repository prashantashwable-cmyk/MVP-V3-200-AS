/**
 * S1 end to end through the REAL order service, the REAL Firestore
 * repository and the REAL security rules, on the Firebase emulator
 * (D-19). Each step signs in as the acting person, so a rule that blocks
 * a legitimate step (or a service that relies on admin rights) fails here.
 *
 * Run (emulator only; src/lib/firebase.ts switches to a demo-* project):
 *   npx -y firebase-tools@15.31.0 emulators:exec --config firebase.emulator.json \
 *     --project demo-aie-mvp --only firestore,auth "npx tsx scripts/mvp/service-emulator-check.ts"
 */
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db, firebaseConfig } from '../../src/lib/firebase';
import * as svc from '../../src/mvp/service';
import { loadOrderBundle, summarize, listOrdersFor, myTasks } from '../../src/mvp/views';
import { check, eq, summary } from './assert';
import type { Evidence, MvpActor, MvpRole } from '../../src/mvp/types';

if (!process.env.FIRESTORE_EMULATOR_HOST || !String((firebaseConfig as any)?.projectId).startsWith('demo-')) {
  console.error('Refusing to run: this check needs the Firestore emulator and a demo-* project (D-19).');
  process.exit(1);
}

const stamp = Date.now();
const uids: Record<string, string> = {};
const roles: Record<string, MvpRole> = {};
const customerIds: Record<string, string> = {};

async function signUp(name: string, role: MvpRole | 'admin-owner', customerId?: string) {
  const email = name === 'admin' ? 'prashantashwable@gmail.com' : `${name}.${stamp}@example.test`;
  if (name !== 'admin') {
    await as('admin');
    await svc.inviteUser(ctxOf('admin'), email, role as MvpRole, name, customerId);
  }
  await signOut(auth);
  const cred = await createUserWithEmailAndPassword(auth, email, 'password-123').catch(() => signInWithEmailAndPassword(auth, email, 'password-123'));
  uids[name] = cred.user.uid;
  roles[name] = role === 'admin-owner' ? 'admin' : role;
  if (customerId) customerIds[name] = customerId;
  if (name !== 'admin') {
    await setDoc(doc(db, 'users', cred.user.uid), { id: cred.user.uid, role, name, phone: '', status: 'active', ...(customerId ? { customerId } : {}) });
  }
}

async function as(name: string) {
  const email = name === 'admin' ? 'prashantashwable@gmail.com' : `${name}.${stamp}@example.test`;
  if (auth.currentUser?.email === email) return;
  await signOut(auth);
  await signInWithEmailAndPassword(auth, email, 'password-123');
}

function ctxOf(name: string): svc.ServiceCtx {
  const actor: MvpActor = { id: uids[name], role: roles[name], customerId: customerIds[name], authMethod: 'firebase_auth' };
  return { repo: { environment: 'sandbox', actorUserId: actor.id }, actor };
}
async function step<T>(name: string, label: string, fn: (ctx: svc.ServiceCtx) => Promise<T>): Promise<T | undefined> {
  await as(name);
  try {
    const out = await fn(ctxOf(name));
    check(true, label);
    return out;
  } catch (err) {
    check(false, `${label} — ${(err as any)?.code ?? ""} ${(err as Error)?.message} ${String((err as Error)?.stack ?? "").split("\n").slice(1, 4).join(" | ")}`);
    return undefined;
  }
}
const photo = (n: string): Evidence => ({ path: `orders/x/${n}.jpg`, contentType: 'image/jpeg', sizeBytes: 10, uploadedBy: 'x', uploadedAt: new Date().toISOString() });
const plusDays = (d: number) => new Date(Date.now() + d * 86400e3).toISOString();

async function main() {
  // The admin is the owner email (rules: isAdmin), with a profile created on first sign-in.
  await createUserWithEmailAndPassword(auth, 'prashantashwable@gmail.com', 'password-123').catch(() => signInWithEmailAndPassword(auth, 'prashantashwable@gmail.com', 'password-123'));
  uids.admin = auth.currentUser!.uid; roles.admin = 'admin';
  await setDoc(doc(db, 'users', uids.admin), { id: uids.admin, role: 'admin', name: 'Admin', phone: '', status: 'active' });
  for (const [n, r] of [['sales', 'sales'], ['surveyor', 'surveyor'], ['tech1', 'technician'], ['qc', 'qc'], ['owner', 'owner']] as const) await signUp(n, r);

  const lead = await step('sales', 'S1.1 sales creates a lead', c => svc.createLead(c, {
    name: 'ABC Builders', phone: '9800000001', location: 'Baner, Pune', source: 'Walk-in', siteType: 'Residential', floors: 8,
    liftRequirement: 'Passenger lift', constructionStage: 'structure complete', notes: '', consent: true, sitePhotos: [photo('lead')],
  }));
  const order = await step('sales', 'S1.2 sales qualifies (order + AE code)', c => svc.qualifyLead(c, lead!.id));
  const orderId = order!.id;
  check(/^AE-\d+$/.test(order!.displayCode ?? ''), `S1.2 code ${order!.displayCode}`);
  await signUp('cust', 'customer', order!.customerId);

  await step('admin', 'S1.3 admin assigns the surveyor', c => svc.assignSurveyor(c, orderId, uids.surveyor, plusDays(2)));
  await step('surveyor', 'S1.4 surveyor submits FEASIBLE', c => svc.submitSurvey(c, orderId, {
    floors: 8, stops: 8, capacity: '8 persons', shaftWidthMm: 1800, shaftDepthMm: 1700, pitMm: 1500, headroomMm: 4200, power: '3-phase',
    access: 'Good', siteReadiness: 'Ready', remarks: '', feasibility: 'OK', result: 'FEASIBLE', photos: [photo('s1'), photo('s2')],
  }));
  const quote = await step('admin', 'S1.5 admin prepares the quote', c => svc.prepareQuote(c, orderId, { baseLift: 780000, installation: 140000, freight: 50000, other: 30000 }, 18, 800000));
  await step('admin', 'S1.5 admin sends the quote', c => svc.sendQuote(c, quote!.id));
  await step('cust', 'S1.6 customer accepts (creates milestones)', c => svc.decideQuote(c, quote!.id, true));
  await step('cust', 'S1.7 customer submits UTR', c => svc.submitPaymentProof(c, `ms_${orderId}_BOOKING_TOKEN`, 'TEST123', 'UPI'));
  await step('admin', 'S1.7 admin marks the token PAID', c => svc.markPaymentPaid(c, `ms_${orderId}_BOOKING_TOKEN`));
  await step('admin', 'S1.8 admin raises the PO', c => svc.raisePurchaseOrder(c, orderId, { supplierId: 's', supplierName: 'Sahyadri', amount: 600000, expectedDeliveryDate: plusDays(10) }));
  await step('cust', 'S1.9 customer submits readiness photos', c => svc.submitSiteReadiness(c, orderId, [photo('r1'), photo('r2')]));
  await step('admin', 'S1.10 admin confirms the site', c => svc.confirmSiteReady(c, orderId));
  await step('admin', 'S1.11 admin records the delivery payment', c => svc.markPaymentPaid(c, `ms_${orderId}_DELIVERY`));
  await step('admin', 'S1.12 admin marks material received', c => svc.markMaterialReceived(c, orderId, uids.tech1, [photo('m')]));
  const techTasks = await step('tech1', 'S1.13 technician lists their tasks', c => myTasks(c.repo, c.actor));
  const inst = techTasks?.find(t => t.type === 'INSTALLATION');
  check(!!inst, 'S1.13 the installation task is in the technician\'s list');
  await step('tech1', 'S1.13 START', c => svc.startTask(c, inst!.id));
  await step('tech1', 'S1.13 CHECK IN', c => svc.checkIn(c, inst!.id));
  for (const k of ['MATERIAL_RECEIVED', 'SITE_CHECKED', 'RAILS', 'BRACKETS', 'MACHINE', 'CONTROLLER', 'DOORS', 'WIRING', 'SAFETY', 'TESTING', 'CLEANED'] as const) {
    await step('tech1', `S1.13 checklist ${k}`, c => svc.updateChecklistItem(c, orderId, k, true, photo(k)));
  }
  await step('tech1', 'S1.13b technician completes installation', c => svc.completeInstallation(c, orderId));
  await step('qc', 'S1.14 QC PASS', c => svc.recordQcDecision(c, orderId, { decision: 'PASS', testResults: 'OK', remarks: '', evidence: [] }));
  await step('admin', 'S1.15 final payment', c => svc.markPaymentPaid(c, `ms_${orderId}_FINAL`));
  await step('admin', 'S1.15b licence DONE', c => svc.setComplianceDoc(c, orderId, 'LIFT_LICENCE', 'DONE', photo('lic')));
  await step('cust', 'S1.16 customer approves handover', c => svc.approveHandoverAsCustomer(c, orderId));
  await step('admin', 'S1.16 admin completes handover', c => svc.completeHandover(c, orderId, { finalTest: 'OK', photos: [] }));

  // Role-scoped reads through the real rules
  const custView = await step('cust', 'customer loads their Order View', async c => summarize((await loadOrderBundle(c.repo, c.actor, orderId))!, new Date()));
  eq([custView?.stage, custView?.status, custView?.progress, custView?.paid], ['AMC', 'COMPLETED', 100, 1180000], 'customer sees AMC / COMPLETED / 100% / ₹11,80,000');
  const custOrders = await step('cust', 'customer lists their orders', c => listOrdersFor(c.repo, c.actor));
  eq(custOrders?.map(o => o.id), [orderId], 'customer sees exactly their order');
  const ownerView = await step('owner', 'owner loads the Order View', c => loadOrderBundle(c.repo, c.actor, orderId));
  check((ownerView?.quoteCosts.length ?? 0) === 1, 'owner sees the cost');
  const techView = await step('tech1', 'technician no longer has an open task', c => myTasks(c.repo, c.actor));
  eq(techView?.length, 0, 'technician task list is empty after handover');

  await signOut(auth);
  summary('mvp service emulator check');
}

main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 300));
