/**
 * End-to-end company simulation (prompt §35 phases 15–16).
 *
 *   npm run mvp:simulate
 *
 * Runs three projects at the same time against an in-memory database with
 * a simulated clock (20 business minutes pass between rounds, and the
 * scheduler ticks every round):
 *   A — happy path
 *   B — "failures" scenario: technician ignores work, card declined,
 *       off-site GPS, QC fail
 *   C — customer never answers the quote → the system reminds and
 *       escalates, then Admin makes one phone call (one counted intervention)
 *
 * Prints the audit trail for B, then the automation KPIs.
 */
import { openDb } from '../server/db';
import { seedIfEmpty, DEMO_SITES } from '../server/seed';
import { Engine } from '../server/workflow/engine';
import { DemoDirector } from '../server/demo';
import { computeKpis } from '../server/workflow/kpi';
import { controlTower } from '../server/workflow/views';
import { analyzeCatalog } from '../server/workflow/gaps';

let t = Date.UTC(2026, 8, 1, 4, 30);
const db = openDb(':memory:');
seedIfEmpty(db, t);
const engine = new Engine(db, { baseNow: () => t });
const director = new DemoDirector(engine);
const admin = { id: 'admin', role: 'admin' as const, name: 'Prashant Wable' };

const A = engine.createLead(admin, { ...DEMO_SITES[0] });
const B = engine.createLead(admin, { ...DEMO_SITES[1] });
const C = engine.createLead(admin, { ...DEMO_SITES[2] });
director.start(A.id, 'happy');
director.start(B.id, 'failures');

let adminCalledC = false;
for (let round = 0; round < 600; round++) {
  await director.stepAll();
  t += 20 * 60_000;
  engine.tick();

  const c = engine.currentItem(C.id);
  if (c?.admin_required && !adminCalledC) {
    // The only human coordination in the whole simulation.
    engine.adminExtend(admin, c.id, 24 * 60, 'Phoned customer — will decide today');
    director.start(C.id, 'happy');
    adminCalledC = true;
  }
  const states = [A, B, C].map(p => engine.project(p.id).state);
  if (states.every(s => s === 'COMPLETED')) {
    console.log(`All three projects COMPLETED after ${round + 1} rounds (${Math.round(((round + 1) * 20) / 60)} business hours).\n`);
    break;
  }
}

const trail = engine.db.prepare('SELECT * FROM events WHERE project_id = ? ORDER BY seq').all(B.id) as any[];
console.log(`AUDIT TRAIL — ${B.id} (failure scenario), ${trail.length} events:`);
for (const e of trail) {
  const who = e.actor_type === 'SYSTEM' ? 'SYSTEM' : `${e.actor_type}:${e.actor_id}`;
  console.log(`  ${new Date(e.at).toISOString().slice(5, 16).replace('T', ' ')}  ${who.padEnd(22)} ${e.detail}`);
}

const k = computeKpis(engine);
const tower = controlTower(engine);
console.log('\nPROJECTS');
for (const p of tower.projects) console.log(`  ${p.id.padEnd(22)} ${p.stateLabel.padEnd(14)} interventions: ${k.interventionsByProject[p.id] ?? 0}`);
console.log('\nAUTOMATION KPIs');
console.log(`  Automation rate                 ${k.automationRate}%  (${k.transitions.automatic}/${k.transitions.total} transitions, ${k.transitions.systemDriven} by SYSTEM)`);
console.log(`  Admin interventions / project   ${k.adminInterventionsPerProject}  (${k.adminInterventions} total)`);
console.log(`  Orphan work items               ${k.orphanWorkItems}`);
console.log(`  Overdue work items              ${k.overdueWorkItems}`);
console.log(`  Avg task completion             ${k.avgTaskCompletionMins} min`);
console.log(`  Avg time to escalation          ${k.avgEscalationMins} min`);
console.log(`  Automatic reassignment rate     ${k.automaticReassignmentRate}%`);
console.log(`  Evidence rejection rate         ${k.evidenceRejectionRate}%`);
console.log(`  Payment failures / blocks       ${k.paymentFailures} / ${k.paymentBlocks}`);
console.log(`  Workflow failures               ${k.workflowFailures}`);
console.log(`  Manual overrides                ${k.manualOverrides}`);
console.log('\nWHY ADMIN STEPPED IN');
for (const c of k.improvement.causes) console.log(`  ${c.count} × ${c.label} → recommend: ${c.recommendation}`);
const health = analyzeCatalog(engine.catalog);
console.log(`\nWORKFLOW HEALTH  overall ${health.overall}%`);
for (const g of health.byGroup) console.log(`  ${g.group.padEnd(22)} ${g.pct}%`);
console.log('  Top gaps:');
for (const g of health.topGaps.slice(0, 5)) console.log(`   - [${g.status}] ${g.task}: ${g.check} — ${g.detail}`);

const ok = [A, B, C].every(p => engine.project(p.id).state === 'COMPLETED') && k.adminInterventions === 1 && k.orphanWorkItems === 0;
console.log(`\n${ok ? 'PASS' : 'FAIL'}: 3 projects completed with ${k.adminInterventions} Admin intervention(s) and ${k.orphanWorkItems} orphan work item(s).`);
process.exit(ok ? 0 : 1);
