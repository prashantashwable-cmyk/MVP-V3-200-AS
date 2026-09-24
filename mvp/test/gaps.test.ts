/**
 * Workflow gap test (prompt §27): remove owner, SLA, next action, failure
 * policy and evidence from a rule and prove the detector notices, both
 * statically (config) and at runtime (a live project with no next work).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../server/workflow/catalog';
import type { TaskType, TaskTypeDef } from '../server/workflow/catalog';
import { analyzeCatalog, analyzeTaskType, checkInvariants } from '../server/workflow/gaps';
import { controlTower } from '../server/workflow/views';
import { setup, newProject, runUntil, events } from './helpers';

test('shipped catalog has no MISSING automation rules and no orphan states', () => {
  const a = analyzeCatalog(CATALOG);
  assert.deepEqual(a.topGaps.filter(g => g.status === 'missing'), []);
  assert.deepEqual(a.stateProblems, []);
  assert.ok(a.overall >= 90, `overall readiness ${a.overall}`);
  // Honest partials remain visible (customer non-response ends with a human).
  assert.ok(a.topGaps.some(g => g.type === 'CUSTOMER_QUOTE_DECISION' && g.check === 'Recovery path'));
});

test('detector flags each deliberately removed rule', () => {
  const broken: Partial<TaskTypeDef> & { type: string } = { ...CATALOG.TECHNICAL_CLEARANCE };
  delete broken.ownerRole; delete broken.assignment;
  delete broken.sla;
  delete broken.nextAction;
  delete broken.onFailure;
  delete broken.evidence;
  delete broken.completeLadder; delete broken.acceptLadder;
  const r = analyzeTaskType(broken);
  const status = Object.fromEntries(r.checks.map(c => [c.check, c.status]));
  assert.equal(status['Owner'], 'missing');
  assert.equal(status['SLA'], 'missing');
  assert.equal(status['Next action'], 'missing');
  assert.equal(status['Failure transition'], 'missing');
  assert.equal(status['Evidence requirement'], 'missing');
  assert.equal(status['Escalation policy'], 'missing');
  assert.equal(status['Reassignment policy'], 'partial', 'policy exists but nothing triggers it');
  assert.ok(r.pct < analyzeTaskType(CATALOG.TECHNICAL_CLEARANCE).pct - 30);
});

test('runtime: a state with no work rule produces an AUTOMATION EXCEPTION, not silence', async () => {
  const catalog = structuredClone(CATALOG) as Record<TaskType, TaskTypeDef>;
  delete (catalog.SUPPLIER_DISPATCH as Partial<TaskTypeDef>).trigger; // nobody creates dispatch work any more
  assert.ok(analyzeCatalog(catalog).stateProblems.some(s => s.includes('MATERIAL_DISPATCH')));

  const { engine } = setup({ catalog });
  const p = newProject(engine);
  await runUntil(engine, p.id, 'MATERIAL_DISPATCH');
  assert.equal(engine.currentItem(p.id), undefined);
  const v = checkInvariants(engine);
  assert.equal(v.length, 1);
  assert.match(v[0].detail, /AUTOMATION EXCEPTION/);
  assert.ok(v[0].missing.includes('owner') && v[0].missing.includes('next action') && v[0].missing.includes('deadline'));
  assert.ok(events(engine, p.id).some(e => e.action === 'NO_RULE_FOR_STATE'));
  const tower = controlTower(engine);
  assert.equal(tower.counts.exceptions, 1);
  assert.equal(tower.violations.length, 1);
});

test('runtime: work that loses its owner or deadline is detected', async () => {
  const { engine } = setup();
  const p = newProject(engine);
  await runUntil(engine, p.id, 'TECHNICAL_CLEARANCE');
  const w = engine.currentItem(p.id)!;
  engine.db.prepare('UPDATE work_items SET assigned_user_id = NULL, due_at = NULL, accept_by = NULL WHERE id = ?').run(w.id);
  const v = checkInvariants(engine);
  assert.deepEqual(v[0].missing, ['owner', 'deadline']);
});
