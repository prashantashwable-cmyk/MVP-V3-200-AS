/**
 * Failure tests (prompt §26). These matter more than the happy path: the
 * system must react by itself when people do nothing, do it wrong, or
 * when infrastructure fails.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setup, newProject, current, doCurrent, runUntil, ownerOf, actorFor, events, ADMIN, HOUR, MIN, ManualClock } from './helpers';
import { demoEvidence } from '../server/demo';
import { whyStuck, controlTower } from '../server/workflow/views';
import { computeKpis } from '../server/workflow/kpi';
import { checkInvariants } from '../server/workflow/gaps';
import type { PaymentGateway } from '../server/workflow/money';
import { Outbox } from '../../src/offline/outbox';
import { createMemoryStore } from '../../src/offline/memoryStore';
import type { OutboxItem } from '../../src/offline/types';
import type { EvidenceInput } from '../server/workflow/engine';

const actions = (engine: any, workId: string) => events(engine).filter(e => e.work_item_id === workId).map(e => e.action);

test('F1: technician does not accept → reminder → escalation → automatic reassignment', async () => {
  const { engine, clock } = setup();
  const p = newProject(engine);
  await runUntil(engine, p.id, 'TECHNICAL_CLEARANCE');
  const w = current(engine, p.id);
  const first = w.assigned_user_id!;
  assert.equal(w.status, 'ASSIGNED');

  clock.advance(61 * MIN); engine.tick();
  assert.ok(actions(engine, w.id).includes('REMINDER_SENT'));
  assert.equal(engine.item(w.id).assigned_user_id, first);

  clock.advance(60 * MIN); engine.tick();
  assert.equal(engine.item(w.id).escalation_level, 1);
  assert.ok(actions(engine, w.id).includes('ESCALATED'));
  const why = whyStuck(engine, p.id);
  assert.equal(why.nextAutomaticAction?.action, 'REASSIGN');
  assert.equal(why.adminRequired, false, 'Admin is informed but not required');
  assert.ok(engine.db.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id='admin' AND title LIKE 'Escalation%'").get()!.n as number >= 1);

  clock.advance(60 * MIN); engine.tick();
  const after = engine.item(w.id);
  assert.notEqual(after.assigned_user_id, first, 'reassigned to someone else');
  assert.equal(after.status, 'ASSIGNED');
  assert.equal(after.reassign_count, 1);
  assert.ok(JSON.parse(after.excluded_users).includes(first));
  assert.throws(() => engine.acceptTask(actorFor(engine, first), w.id), /not assigned to you/);
  assert.equal(computeKpis(engine).adminInterventions, 0);
  assert.equal(computeKpis(engine).automaticReassignmentRate, 100);

  // New owner completes; the flow continues.
  await doCurrent(engine, p.id);
  assert.equal(engine.project(p.id).state, 'MATERIAL_DISPATCH');
});

test('F2: technician accepts but misses the deadline → overdue → escalation → reassignment', async () => {
  const { engine, clock } = setup();
  const p = newProject(engine);
  await runUntil(engine, p.id, 'TECHNICAL_CLEARANCE');
  const w = current(engine, p.id);
  const tech = ownerOf(engine, w);
  engine.acceptTask(tech, w.id);
  engine.addEvidence(tech, w.id, { kind: 'gps', data: {}, lat: 18.5078, lng: 73.8113 });

  clock.advance(19 * HOUR); engine.tick();
  assert.ok(actions(engine, w.id).includes('REMINDER_SENT'));

  clock.advance(6 * HOUR); engine.tick();
  assert.equal(engine.item(w.id).escalation_level, 1);
  assert.equal(computeKpis(engine).overdueWorkItems, 1);
  assert.equal(controlTower(engine).projects[0].health, 'at_risk');

  clock.advance(12 * HOUR); engine.tick();
  const after = engine.item(w.id);
  assert.notEqual(after.assigned_user_id, tech.id);
  assert.equal(engine.evidenceFor(w.id).length, 0, "previous owner's evidence does not count for the new owner");
  assert.equal(computeKpis(engine).adminInterventions, 0);
});

test('F3: evidence missing → submission refused, task stays incomplete, no retry consumed', async () => {
  const { engine } = setup();
  const p = newProject(engine);
  await runUntil(engine, p.id, 'TECHNICAL_CLEARANCE');
  const w = current(engine, p.id);
  const tech = ownerOf(engine, w);
  engine.acceptTask(tech, w.id);
  engine.addEvidence(tech, w.id, { kind: 'gps', data: {}, lat: 18.5078, lng: 73.8113 });
  const r = engine.submitTask(tech, w.id);
  assert.equal(r.outcome, 'INCOMPLETE');
  assert.ok(r.missing!.some(m => m.includes('photo')));
  assert.ok(r.missing!.some(m => m.includes('Measurement')));
  assert.equal(engine.item(w.id).status, 'IN_PROGRESS');
  assert.equal(engine.item(w.id).retry_count, 0);
  assert.equal(engine.project(p.id).state, 'TECHNICAL_CLEARANCE');
  assert.equal(engine.item(w.id).payout_status, 'PENDING_EVIDENCE', 'no payout without evidence');
});

test('F4: invalid evidence → rejected → retry; repeated rejection → reassigned', async () => {
  const { engine } = setup();
  const p = newProject(engine);
  await runUntil(engine, p.id, 'TECHNICAL_CLEARANCE');
  const w = current(engine, p.id);
  const tech = ownerOf(engine, w);
  engine.acceptTask(tech, w.id);
  const def = engine.def(w.type);

  for (const ev of demoEvidence(def, engine.project(p.id), engine.now(), { offSite: true })) engine.addEvidence(tech, w.id, ev);
  let r = engine.submitTask(tech, w.id);
  assert.equal(r.outcome, 'FAIL');
  assert.ok(r.validation!.reasons.some(x => x.includes('GPS')));
  assert.equal(engine.item(w.id).status, 'REJECTED');
  assert.equal(engine.item(w.id).retry_count, 1);
  assert.equal(engine.evidenceFor(w.id).length, 0, 'rejected evidence is superseded');
  assert.equal(engine.project(p.id).state, 'TECHNICAL_CLEARANCE');

  // Stale evidence (captured before the task was accepted) is also rejected.
  for (const ev of demoEvidence(def, engine.project(p.id), engine.now() - 48 * HOUR)) engine.addEvidence(tech, w.id, ev);
  r = engine.submitTask(tech, w.id);
  assert.equal(r.outcome, 'FAIL');
  assert.ok(r.validation!.reasons.some(x => x.includes('Timestamps')));
  // Two rejections → the V3 rule "fails validation twice → reassign".
  const after = engine.item(w.id);
  assert.notEqual(after.assigned_user_id, tech.id);
  assert.equal(after.reassign_count, 1);

  // New owner does it right → project moves on.
  await doCurrent(engine, p.id);
  assert.equal(engine.project(p.id).state, 'MATERIAL_DISPATCH');
  const k = computeKpis(engine);
  assert.ok(k.evidenceRejectionRate > 0);
  assert.equal(k.adminInterventions, 0);
});

test('F4b: out-of-tolerance evidence is FLAGGED for Admin, never auto-approved', async () => {
  const { engine } = setup();
  const p = newProject(engine);
  await runUntil(engine, p.id, 'TECHNICAL_CLEARANCE');
  const w = current(engine, p.id);
  const tech = ownerOf(engine, w);
  engine.acceptTask(tech, w.id);
  for (const ev of demoEvidence(engine.def(w.type), engine.project(p.id), engine.now(), { badMeasurement: true })) engine.addEvidence(tech, w.id, ev);
  assert.equal(engine.submitTask(tech, w.id).outcome, 'FLAG');
  assert.equal(whyStuck(engine, p.id).adminRequired, true);
  engine.adminReviewFlag(ADMIN, w.id, true, 'Narrow shaft OK for 4-person car');
  assert.equal(engine.project(p.id).state, 'MATERIAL_DISPATCH');
  assert.equal(computeKpis(engine).improvement.causes[0].cause, 'EVIDENCE_REVIEW');
});

test('F5: customer does not approve → reminder → escalation → Admin; Admin intervention is counted with its cause', async () => {
  const { engine, clock } = setup();
  const p = newProject(engine);
  const w = current(engine, p.id);
  assert.equal(w.type, 'CUSTOMER_QUOTE_DECISION');

  clock.advance(25 * HOUR); engine.tick();
  assert.ok(actions(engine, w.id).includes('REMINDER_SENT'));
  clock.advance(24 * HOUR); engine.tick();
  assert.ok(actions(engine, w.id).includes('ESCALATED'));
  assert.equal(whyStuck(engine, p.id).adminRequired, false);
  clock.advance(24 * HOUR); engine.tick();
  const stuck = engine.item(w.id);
  assert.equal(stuck.admin_required, 1);
  assert.equal(stuck.exception_cause, 'CUSTOMER_NO_RESPONSE');
  const why = whyStuck(engine, p.id);
  assert.equal(why.adminRequired, true);
  assert.ok(why.adminOptions.includes('extend'));
  assert.equal(controlTower(engine).counts.exceptions, 1);

  engine.adminExtend(ADMIN, w.id, 24 * 60, 'Called customer — decision tomorrow');
  assert.equal(engine.item(w.id).admin_required, 0);
  engine.decideQuote(actorFor(engine, 'cust-rohan'), w.id, true);
  assert.equal(engine.project(p.id).state, 'TOKEN_REQUIRED');
  const k = computeKpis(engine);
  assert.equal(k.adminInterventions, 1);
  assert.equal(k.improvement.causes[0].cause, 'CUSTOMER_NO_RESPONSE');
  assert.ok(k.automationRate < 100 && k.automationRate > 90);
});

test('F6: payment fails → workflow stops safely; retry works; 3 failures block and escalate', async () => {
  const { engine } = setup();
  const p = newProject(engine);
  await runUntil(engine, p.id, 'TOKEN_REQUIRED');
  const w = current(engine, p.id);
  const cust = ownerOf(engine, w);

  let r = await engine.pay(cust, w.id, { cardNumber: '4000 0000 0000 0002' });
  assert.equal(r.ok, false);
  assert.equal(engine.project(p.id).state, 'TOKEN_REQUIRED', 'no progress without money');
  assert.equal(engine.payment(p.id, 'TOKEN')!.status, 'FAILED');
  assert.equal(engine.itemsForProject(p.id).filter(x => x.type === 'TECHNICAL_CLEARANCE').length, 0, 'no clearance work before token is paid');

  r = await engine.pay(cust, w.id, { cardNumber: '4111 1111 1111 1111' });
  assert.equal(r.ok, true);
  assert.equal(engine.project(p.id).state, 'TECHNICAL_CLEARANCE');

  // A second project where payment keeps failing.
  const p2 = newProject(engine, 1);
  await runUntil(engine, p2.id, 'TOKEN_REQUIRED');
  const w2 = current(engine, p2.id);
  const c2 = ownerOf(engine, w2);
  engine.setFlag(ADMIN, p2.id, 'failNextPayment', true);
  await engine.pay(c2, w2.id);
  await engine.pay(c2, w2.id, { cardNumber: '4000000000000002' });
  await engine.pay(c2, w2.id, { cardNumber: '4000000000000002' });
  assert.equal(engine.item(w2.id).exception_cause, 'PAYMENT_BLOCKED');
  assert.equal(computeKpis(engine).paymentBlocks, 1);
  assert.equal(engine.project(p2.id).state, 'TOKEN_REQUIRED');
  engine.adminRecordOfflinePayment(ADMIN, w2.id, 'NEFT UTR 998877');
  assert.equal(engine.project(p2.id).state, 'TECHNICAL_CLEARANCE');
  assert.equal(engine.payment(p2.id, 'TOKEN')!.status, 'PAID');

  // Paying again, or paying for a milestone that isn't due, is refused.
  await assert.rejects(engine.pay(c2, w2.id), /COMPLETED|not/i);
});

test('F7: two users attempt the same transition → exactly one wins, no duplicate state', async () => {
  let calls = 0;
  const slowGateway: PaymentGateway = {
    name: 'slow test gateway',
    charge: async () => { calls++; await new Promise(r => setTimeout(r, 30)); return { ok: true, gatewayRef: `G${calls}` }; },
  };
  const { engine } = setup({ gateway: slowGateway });
  const p = newProject(engine);
  await runUntil(engine, p.id, 'TOKEN_REQUIRED');
  const w = current(engine, p.id);
  const cust = ownerOf(engine, w);

  const results = await Promise.allSettled([engine.pay(cust, w.id), engine.pay(cust, w.id)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  assert.equal(calls, 1, 'gateway charged once');
  assert.equal(engine.paymentsFor(p.id).filter(x => x.milestone === 'TOKEN').length, 1);
  assert.equal(engine.itemsForProject(p.id).filter(x => x.type === 'TECHNICAL_CLEARANCE').length, 1, 'next work created once');

  // Same for a stale-version accept (two tabs).
  const cw = current(engine, p.id);
  const tech = ownerOf(engine, cw);
  const v = cw.version;
  engine.acceptTask(tech, cw.id, v);
  assert.throws(() => engine.acceptTask(tech, cw.id, v), /changed|Cannot accept/);
  assert.equal(events(engine).filter(e => e.work_item_id === cw.id && e.action === 'WORK_ACCEPTED').length, 1);
});

test('F8: network disappears → field evidence stays safe in the V3 outbox and syncs once, exactly once', async () => {
  const { engine } = setup();
  const p = newProject(engine);
  await runUntil(engine, p.id, 'TECHNICAL_CLEARANCE');
  const w = current(engine, p.id);
  const tech = ownerOf(engine, w);
  engine.acceptTask(tech, w.id);

  const outbox = new Outbox<EvidenceInput & { workId: string }>(createMemoryStore<OutboxItem<EvidenceInput & { workId: string }>>());
  let online = false;
  let dropAck = false;
  const sync = async (payload: EvidenceInput & { workId: string }, key: string) => {
    if (!online) throw new Error('Network unreachable');
    engine.addEvidence(tech, payload.workId, { ...payload, idempotencyKey: key });
    if (dropAck) { dropAck = false; throw new Error('Connection reset before response'); }
  };

  const evs = demoEvidence(engine.def(w.type), engine.project(p.id), engine.now());
  for (const [i, ev] of evs.entries()) await outbox.enqueue('evidence', { ...ev, workId: w.id }, `${w.id}:ev${i}`);
  assert.equal(await outbox.pendingCount(), evs.length);

  let res = await outbox.syncAll(sync);
  assert.equal(res.failed, evs.length);
  assert.equal(engine.evidenceFor(w.id).length, 0);
  assert.equal(await outbox.pendingCount(), evs.length, 'still pending — nothing lost');

  online = true;
  dropAck = true; // first item reaches the server but the reply is lost
  res = await outbox.syncAll(sync);
  assert.equal(res.synced, evs.length - 1);
  res = await outbox.syncAll(sync);
  assert.equal(res.synced, 1);
  assert.equal(await outbox.pendingCount(), 0);
  assert.equal(engine.evidenceFor(w.id).length, evs.length, 'no duplicates despite the retried request');

  assert.equal(engine.submitTask(tech, w.id).outcome, 'PASS');
});

test('F9: user loses access → their work is reassigned automatically; no eligible owner → Admin', async () => {
  const { engine } = setup();
  const p = newProject(engine);
  await runUntil(engine, p.id, 'TECHNICAL_CLEARANCE');
  const w = current(engine, p.id);
  const tech = ownerOf(engine, w);
  engine.acceptTask(tech, w.id);
  engine.db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES ('tok', ?, 0)").run(tech.id);

  engine.setUserActive(ADMIN, tech.id, false);
  const after = engine.item(w.id);
  assert.notEqual(after.assigned_user_id, tech.id);
  assert.equal(after.status, 'ASSIGNED');
  assert.equal(engine.db.prepare("SELECT COUNT(*) n FROM sessions WHERE user_id = ?").get(tech.id)!.n, 0, 'sessions revoked');
  assert.throws(() => engine.addEvidence(tech, w.id, { kind: 'gps', data: {} }), /not assigned/);

  // Remove every technician → nobody eligible → explicit Admin exception (not silent).
  for (const t of engine.users('technician').filter(u => u.active)) engine.setUserActive(ADMIN, t.id, false);
  const orphanish = engine.item(w.id);
  assert.equal(orphanish.status, 'UNASSIGNED');
  assert.equal(orphanish.exception_cause, 'NO_ELIGIBLE_OWNER');
  assert.equal(whyStuck(engine, p.id).adminRequired, true);
  assert.deepEqual(checkInvariants(engine), [], 'Admin-owned exception is still owned');

  // Restoring access auto-assigns the waiting work.
  engine.setUserActive(ADMIN, 'tech-amol', true);
  assert.equal(engine.item(w.id).assigned_user_id, 'tech-amol');
});

test('F10: system restarts → workflow resumes from persisted state, including overdue SLA actions', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiec-mvp-'));
  const file = path.join(dir, 'restart.sqlite');
  const clock = new ManualClock();

  let s = setup({ path: file, clock });
  const p = newProject(s.engine);
  await runUntil(s.engine, p.id, 'TECHNICAL_CLEARANCE');
  const w = current(s.engine, p.id);
  const first = w.assigned_user_id;
  s.db.close();

  // Server is down for 4 hours.
  clock.advance(4 * HOUR);
  s = setup({ path: file, clock });
  assert.equal(s.engine.project(p.id).state, 'TECHNICAL_CLEARANCE');
  const caughtUp = s.engine.tick();
  assert.deepEqual(caughtUp.map(a => a.split(': ')[1].split(' ')[0]), ['reminder', 'escalated', 'reassigned']);
  assert.notEqual(s.engine.item(w.id).assigned_user_id, first);

  await runUntil(s.engine, p.id, 'COMPLETED');
  s.db.close();
  s = setup({ path: file, clock });
  assert.equal(s.engine.project(p.id).state, 'COMPLETED');
  assert.throws(() => s.db.prepare("UPDATE events SET detail = 'tampered'").run(), /immutable/);
  assert.throws(() => s.db.prepare('DELETE FROM events').run(), /immutable/);
  s.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('QC failure loop: QC fail → rework to installer → fresh QC by a different technician → pass', async () => {
  const { engine } = setup();
  const p = newProject(engine);
  await runUntil(engine, p.id, 'QC');
  await doCurrent(engine, p.id, { qcFail: true });
  assert.equal(engine.project(p.id).state, 'REWORK');
  const rw = current(engine, p.id);
  const installer = engine.project(p.id).installer_id;
  assert.equal(rw.assigned_user_id, installer);
  assert.ok(JSON.parse(rw.result!).snags.length >= 1);
  await doCurrent(engine, p.id);
  assert.equal(engine.project(p.id).state, 'QC');
  assert.notEqual(current(engine, p.id).assigned_user_id, installer);
  await runUntil(engine, p.id, 'COMPLETED');
  assert.equal(computeKpis(engine).adminInterventions, 0);
});
