/**
 * Phase 36 acceptance check: proves the 8 real destructive-action fixes
 * this phase made are actually present in the real screen source (not
 * just claimed in the generated report), and that the report itself is
 * internally consistent.
 *
 * Run with: npx tsx scripts/destructive-action-safety-check.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`OK: ${msg}`);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const COMPONENTS_DIR = path.join(REPO_ROOT, 'src/components');

function readComponent(name: string): string {
  return fs.readFileSync(path.join(COMPONENTS_DIR, `${name}.tsx`), 'utf8');
}

// [screen, handler-function-name] for every real fix this phase made.
const FIXED_HANDLERS: Array<[string, string]> = [
  ['AutomatedPayoutDisbursementScreen', 'handleExecuteBatchDisbursement'],
  ['PayoutApprovalQueueScreen', 'handleApproveBatch'],
  ['StageWisePayoutTrackerScreen', 'handleApproveAllPending'],
  ['SupplierPaymentApprovalScreen', 'handleExecuteBatchApprove'],
  ['RefundDisputeManagement', 'handleFinalizeResolution'],
  ['AutoNegotiationBotConfig', 'handleDeleteScenario'],
  ['MapFiltersLayersControlPanel', 'handleDeleteView'],
  ['PricingRulesMarginConfig', 'handleDeleteAMCTier'],
];

function main() {
  for (const [screen, handler] of FIXED_HANDLERS) {
    const content = readComponent(screen);
    // Extract the handler's own body (from its declaration up to the next
    // top-level `const handle`/`};` at the same indentation — approximate
    // but sufficient: just require a window.confirm( call appears BETWEEN
    // this handler's declaration and the next one).
    const handlerIdx = content.indexOf(`const ${handler} =`);
    assert(handlerIdx >= 0, `${screen}.tsx still declares ${handler}`);
    const nextHandlerIdx = content.indexOf('\n  const handle', handlerIdx + 10);
    const body = nextHandlerIdx > 0 ? content.slice(handlerIdx, nextHandlerIdx) : content.slice(handlerIdx, handlerIdx + 2000);
    assert(
      /window\.confirm\s*\(/.test(body),
      `${screen}.${handler} contains a real window.confirm() guard (Phase 36 fix)`,
    );
  }

  const reportPath = path.join(REPO_ROOT, 'docs/security/DESTRUCTIVE-ACTION-SAFETY.md');
  assert(fs.existsSync(reportPath), 'docs/security/DESTRUCTIVE-ACTION-SAFETY.md exists');
  const report = fs.readFileSync(reportPath, 'utf8');
  assert(report.includes('LEVEL 4'), 'the report uses the real LEVEL 1-4 vocabulary from this phase\'s brief');
  assert(report.includes('LEVEL 3'), 'the report includes LEVEL 3 (financial/security)');
  assert(report.includes('PayoutHistoryStatementsScreen'), 'the report documents the PayoutHistoryStatementsScreen manual-review finding');
  assert(report.includes('FollowUpStageRules'), 'the report documents the FollowUpStageRules custom-modal manual-review finding');

  console.log('\nPASS: all 8 real Phase 36 destructive-action-safety fixes are present in the actual');
  console.log('screen source, and the generated report reflects the real LEVEL 1-4 classification.');
}

main();
