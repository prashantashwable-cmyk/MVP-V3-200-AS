/**
 * Phase 03 acceptance check: every workflow definition is internally
 * consistent (no unknown states referenced, no transition with zero
 * allowed roles, no non-terminal dead-end state), and the screen
 * registry's workflow/stage references actually exist in those
 * definitions.
 *
 * Run with: npx tsx scripts/workflow-validate.ts
 */
import { workflowRegistry } from '../src/workflows/definitions';
import { validateWorkflowDefinition } from '../src/workflows/types';
import { screenRegistry } from '../src/workflows/screenRegistry';

let problems: string[] = [];

for (const def of Object.values(workflowRegistry)) {
  problems = problems.concat(validateWorkflowDefinition(def));
}

for (const screen of screenRegistry) {
  if (!screen.workflow) continue;
  const def = workflowRegistry[screen.workflow];
  if (!def) {
    problems.push(`screen ${screen.screenId}: unknown workflow "${screen.workflow}"`);
    continue;
  }
  if (screen.stage && !def.states.some(s => s.key === screen.stage)) {
    problems.push(`screen ${screen.screenId}: unknown stage "${screen.stage}" for workflow "${screen.workflow}"`);
  }
}

console.log(`Checked ${Object.keys(workflowRegistry).length} workflow definitions and ${screenRegistry.length} registry entries.`);

if (problems.length) {
  console.error(`\nFAIL: ${problems.length} problem(s):`);
  for (const p of problems) console.error(' -', p);
  process.exitCode = 1;
} else {
  console.log('PASS: all workflow definitions are internally consistent; every screen registry workflow/stage reference resolves.');
}

// Summarize registry coverage.
const kindCounts: Record<string, number> = {};
for (const s of screenRegistry) kindCounts[s.kind] = (kindCounts[s.kind] || 0) + 1;
console.log('Screen registry kind coverage:', kindCounts);
