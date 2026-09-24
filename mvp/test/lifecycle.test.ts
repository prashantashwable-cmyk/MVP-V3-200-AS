/**
 * MVP success test (prompt §25): one project from lead to COMPLETE with
 * zero Admin coordination. Every hand-off is created and assigned by the
 * system.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, newProject, current, doCurrent, events, ADMIN } from './helpers';
import { computeKpis } from '../server/workflow/kpi';
import { checkInvariants } from '../server/workflow/gaps';
import { milestoneAmounts, MARGIN_FLOOR, assertMarginFloor } from '../server/workflow/money';

test('happy path: lead → complete with no Admin intervention', async () => {
  const { engine } = setup();
  const p = newProject(engine);
  assert.match(p.id, /^MH-PUN-KOT-LIFT-\d{3}$/);
  // Complete lead data → auto-qualified and auto-quoted, customer already owns the next step.
  assert.equal(engine.project(p.id).state, 'QUOTE_SENT');

  const seen: string[] = [];
  const owners: string[] = [];
  for (let i = 0; i < 20 && engine.project(p.id).state !== 'COMPLETED'; i++) {
    const w = current(engine, p.id);
    seen.push(w.type);
    owners.push(`${w.type}:${w.assigned_user_id}`);
    // Invariant holds at every step: one current state/next action/owner/deadline.
    assert.deepEqual(checkInvariants(engine), []);
    await doCurrent(engine, p.id);
  }

  assert.equal(engine.project(p.id).state, 'COMPLETED');
  assert.deepEqual(seen, [
    'CUSTOMER_QUOTE_DECISION', 'TOKEN_PAYMENT', 'TECHNICAL_CLEARANCE', 'SUPPLIER_DISPATCH', 'MATERIAL_RECEIPT',
    'MATERIAL_PAYMENT', 'INSTALLATION', 'QC_INSPECTION', 'HANDOVER_ACCEPTANCE', 'FINAL_PAYMENT',
  ]);

  // Every milestone state was passed through and recorded.
  const states = events(engine, p.id).filter(e => e.action === 'STATE_CHANGED').map(e => JSON.parse(e.data).to);
  for (const s of ['QUALIFIED', 'QUOTE_SENT', 'TOKEN_REQUIRED', 'TOKEN_PAID', 'TECHNICAL_CLEARANCE', 'CLEARANCE_APPROVED',
    'MATERIAL_DISPATCH', 'MATERIAL_DISPATCHED', 'MATERIAL_RECEIVED', 'MATERIAL_PAYMENT_REQUIRED', 'MATERIAL_PAYMENT_RECEIVED',
    'INSTALLATION', 'QC', 'QC_PASSED', 'HANDOVER', 'FINAL_PAYMENT_REQUIRED', 'FINAL_PAYMENT_RECEIVED', 'COMPLETED']) {
    assert.ok(states.includes(s), `missing state ${s}`);
  }

  // QC inspector is never the installer (separation of duties).
  const inst = engine.itemsForProject(p.id).find(w => w.type === 'INSTALLATION')!;
  const qc = engine.itemsForProject(p.id).find(w => w.type === 'QC_INSPECTION')!;
  assert.notEqual(inst.assigned_user_id, qc.assigned_user_id);

  // Money: all three milestones paid, amounts computed server-side, total = quote.
  const pays = engine.paymentsFor(p.id);
  assert.deepEqual(pays.map(x => [x.milestone, x.status]), [['TOKEN', 'PAID'], ['MATERIAL', 'PAID'], ['FINAL', 'PAID']]);
  const total = engine.project(p.id).quote_total!;
  assert.equal(pays.reduce((a, x) => a + x.amount, 0), total);
  assert.deepEqual(pays.map(x => x.amount), Object.values(milestoneAmounts(total)));

  // Technician payouts only after evidence passed.
  const techItems = engine.itemsForProject(p.id).filter(w => w.earning > 0);
  assert.ok(techItems.length >= 3);
  assert.ok(techItems.every(w => w.payout_status === 'ELIGIBLE'));

  const k = computeKpis(engine);
  assert.equal(k.adminInterventions, 0, 'no Admin intervention needed');
  assert.equal(k.automationRate, 100);
  assert.ok(k.transitions.systemDriven > 20);
  assert.ok(events(engine, p.id).every(e => e.actor_type !== 'ADMIN' || e.action === 'LEAD_CREATED'));
});

test('quote respects the 20% margin floor', () => {
  const { engine } = setup();
  const p = newProject(engine);
  const row = engine.project(p.id);
  assert.ok((row.quote_total! - row.quote_cost!) / row.quote_cost! >= MARGIN_FLOOR);
  assert.throws(() => assertMarginFloor(110, 100), /margin floor/);
});

test('incomplete lead becomes an Admin work item, then flows automatically', async () => {
  const { engine } = setup();
  const p = newProject(engine, 0, { lat: null, lng: null, floors: null });
  const w = current(engine, p.id);
  assert.equal(w.type, 'QUALIFY_LEAD');
  assert.equal(w.assigned_user_id, 'admin');
  engine.adminCompleteLead(ADMIN, p.id, { lat: 18.5078, lng: 73.8113, floors: 4 });
  assert.equal(engine.project(p.id).state, 'QUOTE_SENT');
  assert.equal(computeKpis(engine).adminInterventions, 1);
});

test('customer declining the quote closes the project cleanly', () => {
  const { engine } = setup();
  const p = newProject(engine);
  const w = current(engine, p.id);
  engine.decideQuote({ id: 'cust-rohan', role: 'customer' }, w.id, false, 'budget');
  assert.equal(engine.project(p.id).state, 'CLOSED_LOST');
  assert.equal(engine.currentItem(p.id), undefined);
  assert.deepEqual(checkInvariants(engine), []);
});
