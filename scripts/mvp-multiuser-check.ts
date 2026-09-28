/**
 * Multi-user check (Phase 1 of the multi-user test plan) against the Firebase EMULATOR only.
 * Every person is a separate process (scripts/mvp/mu-worker.ts) with its own signed-in Firebase
 * client, so the real Firestore rules, transactions and races decide — like separate phones.
 *
 *   A  Relay race     — one order, lead → AMC, each step by the right person; every hand-off
 *                       must reach the next person's own view.
 *   B  Ten at once    — 10 orders through the whole lifecycle in parallel.
 *   C  Collisions     — same record saved by two people at the same moment; never a silent loss.
 *   D  Privacy        — other customers / unassigned staff / cost fields stay hidden.
 *   E  Usage          — document reads per screen, projected to a working day.
 *   F  Double taps    — the same action twice at once, from one account on two phones.
 *
 * Run with:  npm run mvp:multiuser
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';

const PROJECT = 'demo-aie-mvp';
const FS = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FS || !AUTH) {
  console.error('Refusing to run: needs FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST (run via `npm run mvp:multiuser`).');
  process.exit(1);
}

let failures = 0;
const results: { area: string; ok: boolean; msg: string }[] = [];
let area = '';
function ok(cond: unknown, msg: string): boolean {
  results.push({ area, ok: !!cond, msg });
  if (cond) console.log(`OK: [${area}] ${msg}`);
  else { failures++; console.error(`FAIL: [${area}] ${msg}`); }
  return !!cond;
}
function info(msg: string) { console.log(`INFO: [${area}] ${msg}`); }

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------
const PASSWORD = 'password123';
async function authAccount(email: string): Promise<void> {
  const base = `http://${AUTH}/identitytoolkit.googleapis.com/v1`;
  const r = await fetch(`${base}/accounts:signUp?key=fake-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  const { localId } = await r.json() as { localId: string };
  await fetch(`${base}/projects/${PROJECT}/accounts:update`, {
    method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId, emailVerified: true }),
  });
}

class Person {
  private proc!: ChildProcess;
  private seq = 0;
  private waiting = new Map<number, (m: any) => void>();
  actor: any;
  constructor(readonly label: string, readonly email: string) {}

  start(): Promise<void> {
    this.proc = spawn('npx', ['tsx', 'scripts/mvp/mu-worker.ts', this.email, PASSWORD], {
      env: { ...process.env, VITE_FIREBASE_PROJECT_ID: PROJECT }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.proc.stderr!.on('data', d => { const s = String(d); if (/error|fail/i.test(s) && !/Could not fetch dynamic Google Maps/.test(s)) process.stderr.write(`[${this.label}] ${s}`); });
    const rl = createInterface({ input: this.proc.stdout! });
    rl.on('line', line => {
      if (!line.startsWith('@@MU ')) return;
      const m = JSON.parse(line.slice(5));
      this.waiting.get(m.id)?.(m);
      this.waiting.delete(m.id);
    });
    return new Promise((resolve, reject) => {
      this.waiting.set(0, m => (m.ok ? (this.actor = m.result, resolve()) : reject(new Error(`${this.label} sign-in: ${m.error.message}`))));
    });
  }

  /** Calls a service as this person. `$ctx` / `$actor` are filled in by the worker. */
  async call<T = any>(fn: string, ...args: unknown[]): Promise<T> {
    const r = await this.try(fn, ...args);
    if (!r.ok) throw new Error(`${this.label} ${fn}: [${r.error.code}] ${r.error.message}`);
    return r.result as T;
  }

  /** Like call, but returns {ok, result | error} instead of throwing. */
  try(fn: string, ...args: unknown[]): Promise<{ ok: boolean; result?: any; error?: { code: string; message: string } }> {
    const id = ++this.seq;
    return new Promise(resolve => {
      this.waiting.set(id, resolve);
      this.proc.stdin!.write(JSON.stringify({ id, fn, args }) + '\n');
    });
  }

  stop() { this.proc.stdin!.end(); this.proc.kill(); }
}

// Realistic sizes: a compressed phone photo (~250 KB) and its list preview (~12 KB).
const PHOTO_JPEG = 'data:image/jpeg;base64,' + Buffer.alloc(250 * 1024, 7).toString('base64');
const THUMB_JPEG = 'data:image/jpeg;base64,' + Buffer.alloc(12 * 1024, 3).toString('base64');
const FIXTURE_SURVEY = {
  floors: 8, stops: 8, capacityPersons: 8, shaftWidthMm: 1800, shaftDepthMm: 1900, pitMm: 1500, headroomMm: 4200,
  power: '3-phase available', access: 'Truck access', siteReadiness: 'Structure complete', remarks: 'Standard shaft', result: 'FEASIBLE',
};
const FIXTURE_QUOTE = { lines: { base: 780000, installation: 140000, freight: 50000, other: 30000 }, taxRatePct: 18, estimatedCost: 800000 };
const READINESS_KEYS = ['shaftComplete', 'pitDry', 'powerAvailable', 'accessForMaterial', 'storageSpace'];
const CHECKLIST_KEYS = [
  'materialReceived', 'siteChecked', 'railsInstalled', 'bracketsInstalled', 'machineInstalled', 'controllerInstalled',
  'doorsInstalled', 'wiringCompleted', 'safetyComponents', 'testingCompleted', 'siteCleaned',
];

const people: Record<string, Person> = {};
const ADMIN_EMAIL = 'prashantashwable@gmail.com'; // the owner email: auto-admin on first sign-in (emulator identity only)
let phoneSeq = 0;
const at = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

async function photo(p: Person, orderId: string, caption: string): Promise<string> {
  return (await p.call('saveEvidence', '$ctx', '$actor', { dataUrl: PHOTO_JPEG, thumbnailDataUrl: THUMB_JPEG, contentType: 'image/jpeg', orderId, caption })).id;
}
async function openTaskFor(p: Person, orderId: string, type: string): Promise<any | undefined> {
  const v = await p.call('buildOrderView', '$ctx', '$actor', orderId);
  return v?.openTasks.find((t: any) => t.type === type);
}
/** Can this person see the order, with an open task that is theirs? (a real hand-off) */
async function handedTo(p: Person, orderId: string, type: string): Promise<boolean> {
  const list = await p.call<any[]>('listOrdersFor', '$ctx', '$actor');
  if (!list.some(o => o.id === orderId)) return false;
  const t = await openTaskFor(p, orderId, type);
  if (!t) return false;
  const me = p.actor.role === 'customer' ? `customer:${p.actor.customerId}` : p.actor.userId;
  return t.assigneeId === me || (t.assigneeId === 'role:admin' && p.actor.role === 'admin');
}

async function ensureCustomer(key: string, name: string, customerId: string): Promise<Person> {
  if (people[key]) return people[key];
  const email = `${key}@test.example`;
  await authAccount(email);
  await people.admin.call('createInvite', '$ctx', '$actor', { email, name, role: 'customer', customerId });
  const p = new Person(key, email);
  await p.start();
  people[key] = p;
  return p;
}

/**
 * S1 end to end with the right person at every step. `checkHandoffs` asserts each hand-off
 * reaches the next person's own view (scenario A); scenario B runs it 10× in parallel.
 */
async function lifecycle(tag: string, opts: { checkHandoffs?: boolean; salesKey?: string; custKey?: string } = {}) {
  const { admin, surveyor, tech1, qc } = people;
  const sales = people[opts.salesKey ?? 'sales'];
  const H = opts.checkHandoffs ? ok : (() => true);
  const phone = `97${String(10000000 + ++phoneSeq).padStart(8, '0')}`;
  const lead = await sales.call('createLead', '$ctx', '$actor', {
    name: `${tag} Builders`, phone, location: 'Baner, Pune', source: 'Referral', siteType: 'residential', floors: 8,
    liftRequirement: 'G+7 passenger lift, 8 persons', constructionStage: 'structure-up', consent: true,
  });
  const order = await sales.call('qualifyLead', '$ctx', '$actor', lead.id);
  const id = order.id;
  H(await handedTo(admin, id, 'ASSIGN_SURVEYOR'), `${tag}: qualify (Sales) → Admin sees "assign surveyor"`);
  await admin.call('assignSurveyor', '$ctx', '$actor', id, surveyor.actor.userId, at(2));
  H(await handedTo(surveyor, id, 'SURVEY'), `${tag}: surveyor assigned → Surveyor sees the survey on his own phone`);
  const surveyPhotos = [await photo(surveyor, id, 'Shaft'), await photo(surveyor, id, 'Pit')];
  await surveyor.call('submitSurvey', '$ctx', '$actor', id, { ...FIXTURE_SURVEY, photoIds: surveyPhotos });
  H(await handedTo(admin, id, 'PREPARE_QUOTE'), `${tag}: survey submitted → Admin sees "prepare quote"`);
  await admin.call('saveQuote', '$ctx', '$actor', id, FIXTURE_QUOTE);
  await admin.call('sendQuote', '$ctx', '$actor', id);
  const cust = await ensureCustomer(opts.custKey ?? `cust_${tag.toLowerCase()}`, `${tag} Builders`, order.customerId);
  H(await handedTo(cust, id, 'QUOTE_DECISION'), `${tag}: quote sent → Customer sees it on their phone`);
  const custQuote = await cust.call('getQuoteForViewer', '$ctx', '$actor', id);
  H(!custQuote?.cost, `${tag}: the customer's quote has no cost or margin`);
  await cust.call('decideQuote', '$ctx', '$actor', id, 'accept');
  H(await handedTo(admin, id, 'COLLECT_BOOKING_TOKEN'), `${tag}: customer accepted → Admin sees "collect token"`);
  await cust.call('submitPaymentProof', '$ctx', '$actor', `ms_${id}_BOOKING_TOKEN`, 'TEST123');
  await admin.call('verifyPayment', '$ctx', '$actor', `ms_${id}_BOOKING_TOKEN`, { status: 'PAID', method: 'UPI', reference: 'TEST123' });
  const sup = await admin.call('createSupplier', '$ctx', '$actor', { name: `Sahyadri ${tag}`, contactName: 'Mr. Joshi', phone: '9822012345' });
  await admin.call('raisePo', '$ctx', '$actor', id, { supplierId: sup.id, items: 'G+7 lift kit', amount: 700000, expectedDeliveryDate: at(10) });
  H(await handedTo(cust, id, 'SITE_READINESS'), `${tag}: token paid → Customer sees "get the site ready"`);
  const items: any = {};
  for (const k of READINESS_KEYS) items[k] = { ok: true, photoId: await photo(cust, id, k) };
  await cust.call('submitReadiness', '$ctx', '$actor', id, { items, note: 'Site ready' });
  H(await handedTo(admin, id, 'VERIFY_SITE_READY'), `${tag}: readiness sent → Admin sees "verify site"`);
  await admin.call('confirmSiteReady', '$ctx', '$actor', id);
  await admin.call('verifyPayment', '$ctx', '$actor', `ms_${id}_DELIVERY`, { status: 'PAID', method: 'NEFT', reference: `DEL-${tag}` });
  await admin.call('markMaterialReceived', '$ctx', '$actor', id, { note: 'All boxes', photoIds: [await photo(admin, id, 'Material')], technicianId: tech1.actor.userId });
  H(await handedTo(tech1, id, 'INSTALLATION'), `${tag}: material received → Technician sees the job on his phone`);
  const techView = await tech1.call('getQuoteForViewer', '$ctx', '$actor', id).catch(() => null);
  H(!techView?.cost, `${tag}: the technician never gets cost or margin`);
  const t = await openTaskFor(tech1, id, 'INSTALLATION');
  await tech1.call('startWork', '$ctx', '$actor', t.id);
  await tech1.call('checkInAtSite', '$ctx', '$actor', t.id, { lat: 18.559, lng: 73.7868, accuracyM: 20 });
  for (const k of CHECKLIST_KEYS) await tech1.call('setChecklistItem', '$ctx', '$actor', t.id, k, { done: true, documentId: await photo(tech1, id, k) });
  const adminMid = await admin.call('buildOrderView', '$ctx', '$actor', id);
  H(adminMid.order.checklistDone === 11, `${tag}: Admin's view shows the technician's 11/11 (got ${adminMid.order.checklistDone})`);
  await admin.call('assignQcInspector', '$ctx', '$actor', id, qc.actor.userId);
  await tech1.call('completeWork', '$ctx', '$actor', t.id, { note: 'Ready for QC' });
  H(await handedTo(qc, id, 'QC_INSPECTION'), `${tag}: installation complete → QC sees the inspection on her phone`);
  await qc.call('submitQcDecision', '$ctx', '$actor', id, { decision: 'PASS', tests: { mechanical: true, electrical: true, safety: true, testRun: true }, remarks: 'OK' });
  H(await handedTo(admin, id, 'HANDOVER'), `${tag}: QC passed → Admin sees "handover"`);
  await admin.call('verifyPayment', '$ctx', '$actor', `ms_${id}_FINAL`, { status: 'PAID', method: 'NEFT', reference: `FIN-${tag}` });
  await admin.call('setComplianceItem', '$ctx', '$actor', id, 'LIFT_LICENSE', { status: 'DONE', documentId: await photo(admin, id, 'Licence') });
  await admin.call('completeHandover', '$ctx', '$actor', id, { customerConfirmedName: 'Mr. Kulkarni', finalTestConfirmed: true, documentIds: [await photo(admin, id, 'Handover')] });
  const final = await cust.call('buildOrderView', '$ctx', '$actor', id);
  return { id, code: final?.code as string, stage: final?.stage as string, status: final?.status as string, cust };
}

async function main() {
  const t0 = Date.now();
  // ---- People sign in (the Admin is the owner email; everyone else via the Admin's invite) ----
  area = 'setup';
  const staff: [string, string, string][] = [
    ['owner', 'owner', 'Owner Test'], ['sales', 'sales', 'Sales Sameer'], ['sales2', 'sales', 'Sales Two'], ['surveyor', 'surveyor', 'Surveyor Suresh'],
    ['tech1', 'technician', 'Technician Rahul'], ['tech2', 'technician', 'Technician Vikas'], ['qc', 'qc', 'QC Meera'],
  ];
  await authAccount(ADMIN_EMAIL);
  people.admin = new Person('admin', ADMIN_EMAIL);
  await people.admin.start();
  ok(people.admin.actor.role === 'admin', 'the owner email signs in as Admin');
  for (const [key, role, name] of staff) {
    const email = `${key}@test.example`;
    await authAccount(email);
    await people.admin.call('createInvite', '$ctx', '$actor', { email, name, role });
  }
  await Promise.all(staff.map(async ([key]) => { people[key] = new Person(key, `${key}@test.example`); await people[key].start(); }));
  for (const [key, role] of staff) ok(people[key].actor.role === role, `${key} signs in with the invited role "${role}"`);
  people.admin2 = new Person('admin-2nd-phone', ADMIN_EMAIL); // the same Admin account on a second phone
  await people.admin2.start();

  // ---- A. Relay race ----
  area = 'A relay';
  const a = await lifecycle('RELAY', { checkHandoffs: true });
  ok(a.stage === 'AMC' && a.status === 'COMPLETED', `the relay order ends COMPLETED at AMC as seen by the customer (${a.stage}/${a.status})`);
  const audit = (await people.admin.call('buildOrderView', '$ctx', '$actor', a.id)).audit ?? [];
  const actors = new Set(audit.map((e: any) => e.actorId));
  const expected = ['admin', 'sales', 'surveyor', 'tech1', 'qc'].map(k => people[k].actor.userId);
  ok(expected.every(u => actors.has(u)), 'the order history names each person who acted (Admin, Sales, Surveyor, Technician, QC)');

  // ---- B. Ten orders at once ----
  area = 'B ten at once';
  const tb = Date.now();
  const settled = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => lifecycle(`B${i + 1}`, { salesKey: i % 2 ? 'sales2' : 'sales' })));
  const done = settled.filter(s => s.status === 'fulfilled').map(s => (s as PromiseFulfilledResult<any>).value);
  settled.filter(s => s.status === 'rejected').forEach(s => info(`an order failed: ${(s as PromiseRejectedResult).reason?.message}`));
  ok(done.length === 10, `all 10 parallel orders finished (${done.length}/10) in ${Math.round((Date.now() - tb) / 1000)} s`);
  ok(new Set(done.map(d => d.code)).size === done.length && done.every(d => /^AE-\d{4}$/.test(d.code)), `10 different AE codes: ${done.map(d => d.code).join(', ')}`);
  ok(done.every(d => d.stage === 'AMC' && d.status === 'COMPLETED'), 'every parallel order ends COMPLETED at AMC');
  const owner = await people.owner.call('buildOwnerSummary', '$ctx');
  ok(owner.revenueCollected === 11 * 1180000 && owner.completedLifts === 11, `Owner totals add up: ₹${owner.revenueCollected.toLocaleString('en-IN')} collected, ${owner.completedLifts} lifts (expected 11 × ₹11,80,000)`);
  // Each customer sees only their own order.
  const leaks = [];
  for (const d of done) { const mine = await d.cust.call('listOrdersFor', '$ctx', '$actor'); if (mine.length !== 1 || mine[0].id !== d.id) leaks.push(d.code); }
  ok(leaks.length === 0, `each of the 10 customers sees only their own order${leaks.length ? ` (leaks: ${leaks.join(',')})` : ''}`);

  // ---- C. Collisions ----
  area = 'C collisions';
  const lead = await people.sales.call('createLead', '$ctx', '$actor', { name: 'Collision Co', phone: '9700000999', location: 'Wakad, Pune', source: 'Walk-in', siteType: 'residential', floors: 5, liftRequirement: 'G+4', constructionStage: 'structure-up', consent: true });
  const corder = await people.sales.call('qualifyLead', '$ctx', '$actor', lead.id);
  // C1: the repository race, 20 rounds, two phones saving the same order with the same version.
  const race = async (fn: 'repoUpdate' | 'legacyUpdate') => {
    let lost = 0, clean = 0;
    for (let i = 0; i < 20; i++) {
      const cur = await people.admin.call('rawGet', 'projects', corder.id);
      const v = cur.version ?? 0;
      const [r1, r2] = await Promise.all([
        people.admin.try(fn, 'projects', corder.id, { statusReason: `phone-1 round ${i}` }, v),
        people.admin2.try(fn, 'projects', corder.id, { statusReason: `phone-2 round ${i}` }, v),
      ]);
      const after = await people.admin.call('rawGet', 'projects', corder.id);
      const wins = [r1, r2].filter(r => r.ok).length;
      if (wins === 2) lost++; // both were told "saved" — one of them was silently overwritten
      else if (wins === 1 && after.version === v + 1) clean++;
    }
    return { lost, clean };
  };
  const legacy = await race('legacyUpdate');
  info(`old check-then-write: ${legacy.lost}/20 rounds silently lost a save (shows the test can see the bug)`);
  const fixed = await race('repoUpdate');
  ok(fixed.lost === 0 && fixed.clean === 20, `new transactional save: 0/20 silent losses — every round one save wins, the other is told "Someone else just changed this" (${fixed.clean}/20 clean)`);
  const stale = await Promise.all([
    people.admin.try('repoUpdate', 'projects', corder.id, { statusReason: 'x' }, 0),
  ]);
  ok(!stale[0].ok && /Someone else just changed this/.test(stale[0].error!.message), 'a stale save shows the plain-words message');

  // C2: two phones record the same payment at the same moment (same Admin account).
  const c2 = await lifecycleToBooked('C2');
  const mId = `ms_${c2}_BOOKING_TOKEN`;
  const pay = await Promise.all([
    people.admin.try('verifyPayment', '$ctx', '$actor', mId, { status: 'PAID', method: 'UPI', reference: 'SAME-1' }),
    people.admin2.try('verifyPayment', '$ctx', '$actor', mId, { status: 'PAID', method: 'UPI', reference: 'SAME-1' }),
  ]);
  const ms = await people.admin.call('listMilestones', '$ctx', c2);
  const token = ms.find((m: any) => m.kind === 'BOOKING_TOKEN');
  const payAudits = ((await people.admin.call('buildOrderView', '$ctx', '$actor', c2)).audit ?? []).filter((e: any) => e.eventType === 'PAYMENT_STATUS_CHANGED' || e.action === 'PAYMENT_STATUS_CHANGED');
  ok(token.status === 'PAID' && token.amount === 10000, `same payment from two phones: recorded once as PAID ₹10,000 (${pay.map(p => (p.ok ? 'ok' : p.error!.code)).join(' / ')})`);
  info(`payment audit entries for the token: ${payAudits.length}`);

  // C3: Admin reassigns the installation while the technician ticks a checklist item.
  const c3 = await lifecycleToInstall('C3');
  const it = await openTaskFor(people.tech1, c3, 'INSTALLATION');
  await people.tech1.call('startWork', '$ctx', '$actor', it.id);
  await people.tech1.call('checkInAtSite', '$ctx', '$actor', it.id, { lat: 18.5, lng: 73.8 });
  const photoId = await photo(people.tech1, c3, 'rails');
  const [tick, reassign] = await Promise.all([
    people.tech1.try('setChecklistItem', '$ctx', '$actor', it.id, 'materialReceived', { done: true, documentId: photoId }),
    people.admin.try('reassignTask', '$ctx', '$actor', it.id, { id: people.tech2.actor.userId, role: 'technician' }, 'Rahul needed elsewhere'),
  ]);
  const job = await people.admin.call('getJob', '$ctx', c3);
  const task = (await people.admin.call('listOrderTasks', '$ctx', c3)).find((x: any) => x.id === it.id);
  const tickLanded = !!job?.checklist?.materialReceived?.done;
  ok((!tick.ok || tickLanded) && (!reassign.ok || task.assigneeId === people.tech2.actor.userId),
    `reassign during a checklist tick: nothing reported "saved" was lost (tick ${tick.ok ? 'saved' : 'refused: ' + tick.error!.message.slice(0, 60)}, reassign ${reassign.ok ? 'saved' : 'refused'})`);

  // C4: QC passes while the Admin cancels the same order — 5 rounds, since races are timing-dependent.
  const c4 = await Promise.all([1, 2, 3, 4, 5].map(i => lifecycleToQc(`C4-${i}`)));
  const outcomes: string[] = [];
  let inconsistent = 0;
  const delays = [0, 80, 200, 400, 700]; // the cancel lands at different points of QC's save
  for (const [i, id] of c4.entries()) {
    const [pass, cancel] = await Promise.all([
      people.qc.try('submitQcDecision', '$ctx', '$actor', id, { decision: 'PASS', tests: { mechanical: true, electrical: true, safety: true, testRun: true }, remarks: 'OK' }),
      new Promise(r => setTimeout(r, delays[i])).then(() => people.admin.try('cancelOrder', '$ctx', '$actor', id, 'Customer withdrew')),
    ]) as [any, any];
    const v = await people.admin.call('buildOrderView', '$ctx', '$actor', id);
    if (v.status === 'CANCELLED' && v.openTasks.length > 0) inconsistent++;
    outcomes.push(`+${delays[c4.indexOf(id)]}ms ${v.status}/${v.openTasks.length} open (QC ${pass.ok ? 'saved' : 'refused'}, cancel ${cancel.ok ? 'saved' : 'refused'})`);
  }
  ok(inconsistent === 0, `QC pass vs cancel at the same moment, 5 rounds: always a consistent end state — ${outcomes.join('; ')}`);

  // C5: two salespeople qualify 10 leads each at the same instant → unique codes.
  const mk = (p: Person, i: number) => p.call('createLead', '$ctx', '$actor', { name: `Race ${p.label} ${i}`, phone: `96${String(20000000 + i + (p.label === 'sales' ? 0 : 500)).padStart(8, '0')}`, location: 'Pune', source: 'Walk-in', siteType: 'residential', floors: 4, liftRequirement: 'G+3', constructionStage: 'structure-up', consent: true });
  const leads = await Promise.all([...Array(10)].flatMap((_, i) => [mk(people.sales, i), mk(people.sales2, i)]));
  const qual = await Promise.all(leads.map((l, i) => (i % 2 ? people.sales2 : people.sales).try('qualifyLead', '$ctx', '$actor', l.id)));
  const codes = qual.filter(q => q.ok).map(q => q.result.displayCode);
  ok(qual.every(q => q.ok) && new Set(codes).size === 20, `20 leads qualified at the same instant by two salespeople → 20 different AE codes (${new Set(codes).size} unique, ${qual.filter(q => !q.ok).length} refused)`);

  // ---- D. Privacy with real services ----
  area = 'D privacy';
  const otherCust = done[0].cust, target = a.id;
  const peek = await otherCust.try('buildOrderView', '$ctx', '$actor', target);
  ok(!peek.ok || peek.result === null, `a customer cannot open another customer's order (${peek.ok ? 'null' : peek.error!.code})`);
  const relayView = await people.admin.call('buildOrderView', '$ctx', '$actor', target);
  const aPhoto = relayView.evidence[0];
  const own = await a.cust.try('getEvidenceFull', '$ctx', aPhoto);
  ok(own.ok && own.result?.length > 200_000, "the order's own customer opens a full photo on tap");
  const other = await otherCust.try('getEvidenceFull', '$ctx', aPhoto);
  ok(!other.ok || other.result === null, `another customer cannot open that full photo (${other.ok ? 'null' : other.error!.code})`);
  const tech2List = await people.tech2.call('listOrdersFor', '$ctx', '$actor');
  ok(!tech2List.some((o: any) => o.id === target), 'a technician who is not on an order does not see it');
  const survQuote = await people.surveyor.try('getQuoteForViewer', '$ctx', '$actor', target);
  ok(!survQuote.ok || !survQuote.result?.cost, 'the surveyor never gets cost or margin');
  const custDash = await otherCust.try('buildDashboard', '$ctx');
  ok(!custDash.ok, `a customer cannot load the company dashboard (${custDash.ok ? 'allowed!' : custDash.error!.code})`);
  const salesOwner = await people.sales.try('buildOwnerSummary', '$ctx');
  ok(!salesOwner.ok, `Sales cannot load the Owner's money summary (${salesOwner.ok ? 'allowed!' : salesOwner.error!.code})`);

  // ---- E. Usage (document reads per screen) ----
  area = 'E usage';
  const orders = await people.admin.call('listOrdersFor', '$ctx', '$actor');
  info(`database now holds ${orders.length} orders`);
  const breakdown: Record<string, string> = {};
  const measure = async (p: Person, fn: string, ...args: unknown[]) => {
    await p.call('resetReadStats');
    const out = await p.call(fn, ...args);
    const st = await p.call('readStats');
    breakdown[fn] = Object.entries(st.byCollection as Record<string, number>).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => `${k} ${v}`).join(', ');
    if (fn === 'buildOrderView') {
      const kb = Math.round(JSON.stringify(out).length / 1024);
      const photos = (out?.evidence ?? []).length;
      ok(kb < 600, `opening an order with ${photos} photos downloads ~${kb} KB (previews only; the full photos would be ~${Math.round(photos * 250 * 1.34)} KB)`);
    }
    return st.total as number;
  };
  const dash = await measure(people.admin, 'buildDashboard', '$ctx');
  const view = await measure(people.admin, 'buildOrderView', '$ctx', '$actor', a.id);
  const techList = await measure(people.tech1, 'listOrdersFor', '$ctx', '$actor');
  const bell = await measure(people.tech1, 'listMyNotifications', '$ctx', '$actor');
  const ownerR = await measure(people.owner, 'buildOwnerSummary', '$ctx');
  for (const [k, v] of Object.entries(breakdown)) info(`  ${k}: ${v}`);
  info(`reads per load — Admin dashboard ${dash}, order screen ${view}, technician job list ${techList}, bell ${bell}, owner summary ${ownerR}`);
  // A working day: 15 people, the app on screen ~2 h each (auto-refresh only runs while visible).
  // Admin: dashboard every 5 min, an order screen every 3 min, bell every minute. Owner: summary
  // every 5 min + bell. 13 others: their job list + bell every minute, an order screen every 3 min.
  // (The order-screen figure is the Admin's, which includes the history, so this is an upper bound.)
  const perDay = Math.round(
    24 * dash + 40 * view + 120 * bell +
    24 * ownerR + 120 * bell +
    13 * (120 * techList + 40 * view + 120 * bell),
  );
  // ⚖ VERIFY: Firestore read price for the project's region (about US$0.06 per 100,000 reads
  // beyond 50,000 free per day at the time of writing) and the rupee rate.
  const rupeesPerMonth = Math.round(Math.max(0, perDay - 50_000) / 100_000 * 0.06 * 30 * 84);
  info(`estimated reads per working day with ${orders.length} orders in the database: ~${perDay.toLocaleString('en-IN')} (free tier 50,000/day) → about ₹${rupeesPerMonth}/month in reads`);
  ok(rupeesPerMonth < 1000, `database reads for 15 people cost under ₹1,000/month (~₹${rupeesPerMonth}; order screen ${view} reads/load, mostly history and photos)`);

  // ---- F. Double taps from one account on two phones ----
  area = 'F double taps';
  const dl = await people.sales.call('createLead', '$ctx', '$actor', { name: 'Double Tap Ltd', phone: '9700000888', location: 'Aundh, Pune', source: 'Walk-in', siteType: 'residential', floors: 6, liftRequirement: 'G+5', constructionStage: 'structure-up', consent: true });
  const [q1, q2, q3] = await Promise.all([
    people.sales.try('qualifyLead', '$ctx', '$actor', dl.id), people.sales.try('qualifyLead', '$ctx', '$actor', dl.id), people.sales.try('qualifyLead', '$ctx', '$actor', dl.id),
  ]);
  const orderIds = new Set([q1, q2, q3].filter(q => q.ok).map(q => q.result.id));
  const all = await people.admin.call('listOrdersFor', '$ctx', '$actor');
  const forLead = all.filter((o: any) => o.leadId === dl.id || o.sourceLeadId === dl.id || o.id === [...orderIds][0]);
  ok(orderIds.size === 1 && forLead.length === 1, `triple-tap "Mark qualified" → exactly one order (${orderIds.size} id, ${forLead.length} order)`);
  const f2 = await lifecycleToInstall('F2');
  const ft = await openTaskFor(people.tech1, f2, 'INSTALLATION');
  await people.tech1.call('startWork', '$ctx', '$actor', ft.id);
  const both = await Promise.all([people.tech1.try('checkInAtSite', '$ctx', '$actor', ft.id, { lat: 1, lng: 1 }), people.tech1.try('checkInAtSite', '$ctx', '$actor', ft.id, { lat: 1, lng: 1 })]);
  const f2job = await people.admin.call('getJob', '$ctx', f2);
  ok(!!f2job.checkedInAt && both.some(b => b.ok), `double-tap CHECK IN → checked in once (${both.map(b => (b.ok ? 'ok' : b.error!.message.slice(0, 40))).join(' / ')})`);

  // ---- G. Follow-up ladder (D-32): three phones scan at the same moment ----
  area = 'G follow-ups';
  const ftNow = await people.admin.call('rawGet', 'tasks', ft.id);
  await people.admin.call('repoUpdate', 'tasks', ft.id, { dueDate: new Date(Date.now() - 30 * 3_600_000).toISOString() }, ftNow.version);
  const scans = await Promise.all([
    people.admin.try('scanTaskNotifications', '$ctx'),
    people.owner.try('scanTaskNotifications', '$ctx'),
    people.tech1.try('scanMyFollowUps', '$ctx', '$actor'),
    people.admin.try('scanTaskNotifications', '$ctx'),
  ]);
  ok(scans.every(x => x.ok), `Admin, Owner, technician and a second Admin phone scan at once without errors (${scans.map(x => (x.ok ? 'ok' : x.error!.message.slice(0, 50))).join(' / ')})`);
  const techBell = await people.tech1.call('listMyNotifications', '$ctx', '$actor', 1000);
  const adminBell = await people.admin.call('listMyNotifications', '$ctx', '$actor', 1000);
  const ownerBell = await people.owner.call('listMyNotifications', '$ctx', '$actor', 1000);
  const nOverdue = techBell.filter((n: any) => n.templateId === 'mvp_task_overdue' && n.projectId === f2).length;
  const nEsc = adminBell.filter((n: any) => n.templateId === 'mvp_escalated' && n.projectId === f2).length;
  ok(nOverdue === 1 && nEsc === 1, `30 h late installation: technician reminded once, Admin escalated once (${nOverdue} / ${nEsc})`);
  ok(!ownerBell.some((n: any) => n.templateId === 'mvp_escalated' && n.projectId === f2), 'Owner not told before 72 h');
  const digests = [...adminBell, ...ownerBell].filter((n: any) => n.templateId === 'mvp_daily_digest');
  ok(digests.length === 2 && digests.every((n: any) => (n.data?.overdue ?? 0) >= 1), `one digest each for Admin and Owner, with counts (${digests.length})`);
  const chases = await people.admin.call('listChases', '$ctx');
  const row = chases.find((r: any) => r.taskId === ft.id);
  ok(!!row && row.level === 2 && row.personName.length > 0, `the chase list shows it (L${row?.level}, ${row?.personName})`);
  const ownerMark = await people.owner.try('markChased', '$ctx', '$actor', row, 'call');
  ok(!ownerMark.ok, 'the Owner cannot mark it chased');
  await people.admin.call('markChased', '$ctx', '$actor', row, 'whatsapp');
  ok(!(await people.admin.call('listChases', '$ctx')).some((r: any) => r.taskId === ft.id), '"Chased" on the real database hides the row');

    // The 9:00/17:00 robot (scripts/mvp-followup-run.ts) against the same emulator.
  const robot = (args: string[], env: Record<string, string>) => new Promise<{ code: number; out: string }>(resolve => {
    const pr = spawn('npx', ['tsx', 'scripts/mvp-followup-run.ts', ...args], { env: { ...process.env, VITE_FIREBASE_PROJECT_ID: PROJECT, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    pr.stdout!.on('data', d => { out += d; });
    pr.stderr!.on('data', d => { out += d; });
    pr.on('close', code => resolve({ code: code ?? 1, out }));
  });
  const noSetup = await robot([], { FOLLOWUP_ROBOT_EMAIL: '', FOLLOWUP_ROBOT_PASSWORD: '' });
  ok(noSetup.code === 0 && /not set up yet/.test(noSetup.out), 'robot without its login: a notice, not a failure (schedule stays green)');
  const asTech = await robot(['--dry-run'], { FOLLOWUP_ROBOT_EMAIL: people.tech1.email, FOLLOWUP_ROBOT_PASSWORD: PASSWORD });
  ok(asTech.code === 1 && /must have the Admin role/.test(asTech.out), 'robot refuses to run as a non-Admin account');
  const bellBefore = (await people.admin.call('listMyNotifications', '$ctx', '$actor', 1000)).length;
  const dry = await robot(['--dry-run'], { FOLLOWUP_ROBOT_EMAIL: ADMIN_EMAIL, FOLLOWUP_ROBOT_PASSWORD: PASSWORD });
  const bellAfterDry = (await people.admin.call('listMyNotifications', '$ctx', '$actor', 1000)).length;
  ok(dry.code === 0 && /DRY RUN: \d+ follow-ups/.test(dry.out) && bellAfterDry === bellBefore, `robot --dry-run lists and sends nothing (${(dry.out.match(/DRY RUN: [^\n]*/) ?? [''])[0].slice(0, 70)})`);
  const real = await robot([], { FOLLOWUP_ROBOT_EMAIL: ADMIN_EMAIL, FOLLOWUP_ROBOT_PASSWORD: PASSWORD });
  const escAfter = (await people.admin.call('listMyNotifications', '$ctx', '$actor', 1000)).filter((n: any) => n.templateId === 'mvp_escalated' && n.projectId === f2).length;
  ok(real.code === 0 && /Follow-up run done/.test(real.out) && escAfter === 1, `robot real run: done, and still one escalation (already sent today) (${escAfter})`);

    // D-33 assistant, on the real rules: the technician asks for more time from their own phone.
  area = 'H assistant';
  const promised = await people.tech1.try('promiseTask', '$ctx', '$actor', ft.id, new Date(Date.now() + 2 * 86_400_000).toISOString(), 'Crane only on Thursday');
  ok(promised.ok, `technician's "Need more time" saves through the Firestore rules (${promised.ok ? 'ok' : promised.error!.message.slice(0, 80)})`);
  const otherPromise = await people.tech2.try('promiseTask', '$ctx', '$actor', ft.id, new Date(Date.now() + 86_400_000).toISOString(), 'x');
  ok(!otherPromise.ok, 'another technician cannot promise on their behalf');
  const adminSees = (await people.admin.call('listMyNotifications', '$ctx', '$actor', 1000)).some((n: any) => n.templateId === 'mvp_promise_made' && n.projectId === f2);
  ok(adminSees, 'the Admin is told that more time was asked');
  for (const who of ['tech1', 'surveyor', 'qc'] as const) {
    const q = await people[who].try('getMvpTaskQueue', '$ctx', '$actor');
    ok(q.ok, `${who}'s task list ("My tasks" / Today) loads on real Firestore (${q.ok ? q.result.length + ' tasks' : q.error!.message.slice(0, 60)})`);
  }
  const day = await people.tech1.try('buildMyDay', '$ctx', '$actor');
  const dayRow = day.ok ? day.result.find((r: any) => r.task.id === ft.id) : null;
  ok(!!dayRow && dayRow.group === 'SOON' && !!dayRow.orderCode, `the technician's "My day" loads on real Firestore and shows the promised date (${day.ok ? dayRow?.group : day.error!.message.slice(0, 60)})`);

    // ---- I. Field scouting (D-34) on the real rules: rider → Sales → lead, route, board, commission ----
  area = 'I scouting';
  const JPG = `data:image/jpeg;base64,${'A'.repeat(3000)}`;
  const sh = (kind: string) => ({ kind, dataUrl: JPG, contentType: 'image/jpeg', previewDataUrl: JPG });
  const sight = await people.sales.try('createSighting', '$ctx', '$actor', { lat: 18.5596, lng: 73.7799, accuracyM: 10, address: 'Baner Road, Pune', photo: sh('SITE') });
  ok(sight.ok, `rider records a sighting through the rules (${sight.ok ? 'ok' : sight.error!.message.slice(0, 70)})`);
  const withBoard = sight.ok ? await people.sales.try('addSightingPhoto', '$ctx', '$actor', sight.result.id, sh('BOARD')) : { ok: false } as any;
  ok(withBoard.ok, 'rider adds the board photo');
  const inbox = await people.sales2.try('listSightings', '$ctx', '$actor');
  ok(inbox.ok && inbox.result.some((x: any) => x.id === sight.result?.id), 'the other salesperson sees it in the inbox at once');
  const self = await people.sales.try('convertSightingToLead', '$ctx', '$actor', sight.result?.id, { name: 'X', phone: '9822099988', consent: true });
  ok(!self.ok, 'the rider cannot confirm their own sighting');
  const conv = await people.sales2.try('convertSightingToLead', '$ctx', '$actor', sight.result?.id, { name: 'Mr Gaikwad', phone: '9822099988', consent: true, floors: 10 });
  ok(conv.ok && conv.result.scoutedBy === people.sales.actor.userId, `the other salesperson makes it a lead, rider credited (${conv.ok ? 'ok' : conv.error!.message.slice(0, 70)})`);
  const duty = await people.sales.try('startDuty', '$ctx', '$actor');
  const now0 = Date.now();
  const route = Array.from({ length: 8 }, (_, i) => ({ lat: 18.5596 + i * 0.001, lng: 73.7799, t: new Date(now0 + i * 60_000).toISOString() }));
  const saved = duty.ok ? await people.sales.try('saveRoutePoints', '$ctx', '$actor', route) : duty;
  ok(duty.ok && saved.ok && saved.result.stats.km > 0.6, `On duty: route and daily stats save through the rules (${saved.ok ? saved.result.stats.km + ' km' : saved.error!.message.slice(0, 70)})`);
  const board = await people.sales.try('buildRiderBoard', '$ctx', '$actor');
  ok(board.ok && board.result.earnings.confirmed >= 1 && board.result.week.length >= 1, `the rider's earnings and leaderboard load on real Firestore (${board.ok ? '₹' + board.result.earnings.amount : board.error!.message.slice(0, 70)})`);
  const routePeek = await people.sales2.try('getMyRouteToday', '$ctx', { ...people.sales.actor });
  ok(!routePeek.ok || routePeek.result === null, 'another salesperson cannot read the rider\'s route');
  const sheet = await people.owner.try('riderCommissionTable', '$ctx', '$actor');
  ok(sheet.ok && sheet.result.rows.some((r: any) => r.riderId === people.sales.actor.userId), 'the Owner sees the rider in the commission sheet');

    // ---- J. Planned projects (D-36) on the real rules: Admin imports, the rider's board shows them ----
  area = 'J planned projects';
  const soon = new Date(Date.now() + 8 * 30.44 * 86_400_000).toISOString().slice(0, 10);
  const prjRows = [{ line: 2, name: 'MU Sky Towers', regNo: 'MU0001', address: 'Tathawade', lat: 18.6186, lng: 73.7446, completion: soon, floors: 14 }];
  const salesImport = await people.sales.try('importProspects', '$ctx', '$actor', prjRows, { source: 'test', dryRun: false });
  ok(!salesImport.ok, 'Sales cannot import planned projects');
  const imp = await people.admin.try('importProspects', '$ctx', '$actor', prjRows, { source: 'test', dryRun: false });
  ok(imp.ok && imp.result.added.length === 1, `the Admin imports a planned project through the rules (${imp.ok ? 'ok' : imp.error!.message.slice(0, 70)})`);
  const again = await people.admin.try('importProspects', '$ctx', '$actor', prjRows, { source: 'test', dryRun: false });
  ok(again.ok && again.result.added.length === 0 && again.result.unchanged === 1, 'importing the same list again adds nothing');
  const board2 = await people.sales.try('buildRiderBoard', '$ctx', '$actor');
  ok(board2.ok && board2.result.planned.some((p: any) => p.name === 'MU Sky Towers' && p.phase === 'WINDOW'), `the rider's board loads with the planned project in its lift window (${board2.ok ? board2.result.planned.length : board2.error!.message.slice(0, 70)})`);
  const techPrj = await people.tech1.try('listProspects', '$ctx', '$actor');
  ok(!techPrj.ok, 'a technician cannot list planned projects');

    // ---- Summary ----
  area = 'summary';
  const byArea: Record<string, { ok: number; fail: number }> = {};
  for (const r of results) { byArea[r.area] ??= { ok: 0, fail: 0 }; byArea[r.area][r.ok ? 'ok' : 'fail']++; }
  console.log('\nSUMMARY');
  for (const [k, v] of Object.entries(byArea)) console.log(`  ${k.padEnd(14)} ${v.ok} ok, ${v.fail} fail`);
  console.log(`  total time ${Math.round((Date.now() - t0) / 1000)} s`);
  console.log(failures ? `\nFAIL: mvp-multiuser-check (${failures})` : '\nPASS: mvp-multiuser-check');
}

/** Quick paths to a given stage for the collision tests (same steps as the relay, no hand-off checks). */
async function lifecycleToBooked(tag: string): Promise<string> {
  const { admin, sales, surveyor } = people;
  const lead = await sales.call('createLead', '$ctx', '$actor', { name: `${tag} Co`, phone: `95${String(30000000 + ++phoneSeq).padStart(8, '0')}`, location: 'Pune', source: 'Walk-in', siteType: 'residential', floors: 8, liftRequirement: 'G+7', constructionStage: 'structure-up', consent: true });
  const o = await sales.call('qualifyLead', '$ctx', '$actor', lead.id);
  await admin.call('assignSurveyor', '$ctx', '$actor', o.id, surveyor.actor.userId, at(2));
  await surveyor.call('submitSurvey', '$ctx', '$actor', o.id, { ...FIXTURE_SURVEY, photoIds: [await photo(surveyor, o.id, 'a'), await photo(surveyor, o.id, 'b')] });
  await admin.call('saveQuote', '$ctx', '$actor', o.id, FIXTURE_QUOTE);
  await admin.call('sendQuote', '$ctx', '$actor', o.id);
  await admin.call('decideQuote', '$ctx', '$actor', o.id, 'accept', 'Accepted on phone');
  return o.id;
}
async function lifecycleToInstall(tag: string): Promise<string> {
  const { admin } = people;
  const id = await lifecycleToBooked(tag);
  await admin.call('verifyPayment', '$ctx', '$actor', `ms_${id}_BOOKING_TOKEN`, { status: 'PAID', method: 'UPI', reference: `T-${tag}` });
  const sup = await admin.call('createSupplier', '$ctx', '$actor', { name: `Sup ${tag}`, contactName: 'X', phone: '9822000000' });
  await admin.call('raisePo', '$ctx', '$actor', id, { supplierId: sup.id, items: 'kit', amount: 700000, expectedDeliveryDate: at(10) });
  const items: any = {};
  for (const k of READINESS_KEYS) items[k] = { ok: true, photoId: await photo(admin, id, k) };
  await admin.call('submitReadiness', '$ctx', '$actor', id, { items, note: 'Recorded by Admin' });
  await admin.call('confirmSiteReady', '$ctx', '$actor', id);
  await admin.call('verifyPayment', '$ctx', '$actor', `ms_${id}_DELIVERY`, { status: 'PAID', method: 'NEFT', reference: `D-${tag}` });
  await admin.call('markMaterialReceived', '$ctx', '$actor', id, { note: 'ok', photoIds: [await photo(admin, id, 'm')], technicianId: people.tech1.actor.userId });
  return id;
}
async function lifecycleToQc(tag: string): Promise<string> {
  const { admin, tech1, qc } = people;
  const id = await lifecycleToInstall(tag);
  const t = await openTaskFor(tech1, id, 'INSTALLATION');
  await tech1.call('startWork', '$ctx', '$actor', t.id);
  await tech1.call('checkInAtSite', '$ctx', '$actor', t.id, { lat: 1, lng: 1 });
  for (const k of CHECKLIST_KEYS) await tech1.call('setChecklistItem', '$ctx', '$actor', t.id, k, { done: true, documentId: await photo(tech1, id, k) });
  await admin.call('assignQcInspector', '$ctx', '$actor', id, qc.actor.userId);
  await tech1.call('completeWork', '$ctx', '$actor', t.id, { note: 'done' });
  return id;
}

main()
  .catch(err => { failures++; console.error('FAIL: crashed —', err?.message ?? err); })
  .finally(() => { for (const p of Object.values(people)) p.stop(); process.exitCode = failures ? 1 : 0; setTimeout(() => process.exit(process.exitCode), 500); });
