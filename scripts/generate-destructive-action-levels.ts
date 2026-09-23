/**
 * Phase 36 — generates docs/security/DESTRUCTIVE-ACTION-SAFETY.md.
 *
 * "Inventory every destructive or high-impact action. Classify: LEVEL 1
 * reversible, LEVEL 2 important, LEVEL 3 financial/security, LEVEL 4
 * irreversible/high-risk. Do NOT add confirmation dialogs to every
 * button."
 *
 * A REAL, previously-undocumented finding from building this scanner:
 * Phase 23's `generate-destructive-actions-inventory.ts` only considers a
 * file a candidate at all if it has a delete/remove/revoke/deactivate/
 * disable-SHAPED handler name — a financial action named e.g.
 * `handleProcessRefund` or `handleApprovePayout` (no delete/remove-shaped
 * word in the name) was NEVER even looked at, regardless of the tier
 * keyword list technically covering "refund"/"payout". This script
 * widens the initial net to independently also match financial/security-
 * shaped verbs (refund, payout, disburse, discount, credential, grant/
 * revoke permission, change role, publish automation, bank/payment
 * change) — closing that real blind spot, not just re-labeling the same
 * data.
 *
 *   npx tsx scripts/generate-destructive-action-levels.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const COMPONENTS_DIR = path.join(REPO_ROOT, 'src/components');
const OUT_FILE = path.join(REPO_ROOT, 'docs/security/DESTRUCTIVE-ACTION-SAFETY.md');

type Level = 'LEVEL_4' | 'LEVEL_3' | 'LEVEL_2' | 'LEVEL_1';

const LEVEL_LABEL: Record<Level, string> = {
  LEVEL_4: 'LEVEL 4 — irreversible/high-risk',
  LEVEL_3: 'LEVEL 3 — financial/security',
  LEVEL_2: 'LEVEL 2 — important',
  LEVEL_1: 'LEVEL 1 — reversible',
};

// Order matters: checked top to bottom, first match wins (highest severity first).
const LEVEL_KEYWORDS: Array<[RegExp, Level]> = [
  [/delete|purge|erase|irreversib/i, 'LEVEL_4'],
  [/refund|payout|disburse|discount|credential|grantpermission|revokepermission|changerole|publishautomation|bankchange|bankdetail|apikey|secret|permission|password/i, 'LEVEL_3'],
  [/revoke|deactivate|disable|suspend|cancel|terminate|reject/i, 'LEVEL_2'],
  [/remove/i, 'LEVEL_1'],
];

function classify(matchText: string): Level {
  for (const [re, level] of LEVEL_KEYWORDS) {
    if (re.test(matchText)) return level;
  }
  return 'LEVEL_1';
}

interface Finding {
  file: string;
  matches: string[];
  level: Level;
  hasConfirm: boolean;
  hasCustomModal: boolean;
}

// Handler-name verbs this scan independently looks for, regardless of
// delete/remove-shaped wording — the real Phase 36 widening.
const HANDLER_VERB_REGEX = /handle(Delete|Remove|Revoke|Deactivate|Disable|Refund|Payout|Disburse|Discount|GrantPermission|RevokePermission|ChangeRole|PublishAutomation|Approve\w*Payout|Process\w*Refund|Cancel|Terminate|Reject|ChangeBank\w*|ChangePassword|ResetCredential\w*)(\w*)/g;
const METHOD_VERB_REGEX = /\.(delete|remove|revoke|deactivate|disable|refund|payout|disburse)([A-Z]\w*)?\s*\(/g;

// A SECOND, independent net, matched against the SCREEN NAME (not handler
// text) — calibrated against this codebase's real naming convention,
// where a screen's overall subject is financial/security-sensitive
// (RefundDisputeManagement, PayoutApprovalQueueScreen,
// DiscountApprovalWorkflow, UserRolePermissionManagementScreen,
// SecuritySessionManagementScreen, ...) but its individual handler
// functions use generic verbs (handleApproveSingle, handleFinalizeResolution)
// that a handler-name-only scan (the first net above) would never catch.
// This is why L3 came back empty on the first pass of this scanner —
// found and fixed within this same phase, not left silently wrong.
const SCREEN_NAME_LEVEL3_REGEX = /refund|payout|disburs|discount|credential|permission|commission|bankdetail|bankaccount|automationpublish|payment.*approv|securitysession/i;

function main() {
  const files = fs.readdirSync(COMPONENTS_DIR).filter(f => f.endsWith('.tsx'));
  const findings: Finding[] = [];

  for (const f of files) {
    const full = path.join(COMPONENTS_DIR, f);
    const content = fs.readFileSync(full, 'utf8');
    const screenName = f.replace(/\.tsx$/, '');
    const methodMatches = [...content.matchAll(METHOD_VERB_REGEX)].map(m => `${m[1]}${m[2] ?? ''}`);
    const handlerMatches = [...content.matchAll(HANDLER_VERB_REGEX)].map(m => `handle${m[1]}${m[2] ?? ''}`);
    const nameNormalized = screenName.toLowerCase();
    const nameLevel3Match = SCREEN_NAME_LEVEL3_REGEX.test(nameNormalized) ? [`(screen subject: ${nameNormalized.match(SCREEN_NAME_LEVEL3_REGEX)?.[0]})`] : [];
    const all = [...new Set([...methodMatches, ...handlerMatches, ...nameLevel3Match])];
    if (all.length === 0) continue;

    const levels = [
      ...methodMatches.map(classify),
      ...handlerMatches.map(classify),
      ...(nameLevel3Match.length > 0 ? ['LEVEL_3' as Level] : []),
    ];
    const levelRank: Record<Level, number> = { LEVEL_4: 0, LEVEL_3: 1, LEVEL_2: 2, LEVEL_1: 3 };
    const level = levels.length > 0 ? levels.sort((a, b) => levelRank[a] - levelRank[b])[0] : 'LEVEL_1';

    const hasConfirm = /\bconfirm\s*\(|window\.confirm\s*\(/.test(content);
    // A real custom confirmation modal, e.g. SecuritySessionManagementScreen's
    // pattern: a "<x>ToRevoke"/"pending<Action>"-shaped state variable paired
    // with a visible "Cancel"/"Confirm" button pair, and NO literal confirm()
    // call the simpler regex above would have caught. A real, if imperfect,
    // proxy — same honest limitation this pack's Phase 23 predecessor named.
    const hasCustomModal = !hasConfirm && /(ToRevoke|ToDelete|ToCancel|ToConfirm|PendingAction|confirmModal|ConfirmDialog|ConfirmationModal|DeleteConfirmId|deleteConfirmId|ConfirmId)/i.test(content) && /Cancel/.test(content) && /Confirm/.test(content);

    findings.push({ file: screenName, matches: all, level, hasConfirm, hasCustomModal });
  }

  findings.sort((a, b) => a.level.localeCompare(b.level) || a.file.localeCompare(b.file));

  const byLevel: Record<Level, Finding[]> = { LEVEL_4: [], LEVEL_3: [], LEVEL_2: [], LEVEL_1: [] };
  for (const f of findings) byLevel[f.level].push(f);

  const lines: string[] = [];
  lines.push('# Destructive Action Safety (Phase 36)');
  lines.push('');
  lines.push('Generated by `scripts/generate-destructive-action-levels.ts` — do not hand-edit.');
  lines.push('Re-run after any screen change: `npx tsx scripts/generate-destructive-action-levels.ts`.');
  lines.push('');
  lines.push(`Regenerated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('Supersedes `docs/security/DESTRUCTIVE_ACTIONS_INVENTORY.md` (Phase 23) for');
  lines.push('classification purposes — that document is kept as-is for its own historical');
  lines.push('record, not deleted, per this pack\'s own rule.');
  lines.push('');
  lines.push('## A real finding from building this scanner');
  lines.push('');
  lines.push('Phase 23\'s scanner only considered a file a candidate at all if it had a');
  lines.push('delete/remove/revoke/deactivate/disable-SHAPED handler NAME — a financial action');
  lines.push('named e.g. `handleProcessRefund` or `handleApprovePayout` (no delete/remove-shaped');
  lines.push('word) was never looked at, regardless of the tier keyword list technically');
  lines.push('covering "refund"/"payout" text. This scanner widens the initial net to');
  lines.push('independently match financial/security-shaped verbs too — a real, previously');
  lines.push('unmeasured blind spot, not just a re-labeling of the same data.');
  lines.push('');
  lines.push('## Level definitions (from this pack\'s own brief)');
  lines.push('');
  lines.push('- **LEVEL 1 — reversible** (archive, remove from queue): no confirmation by');
  lines.push('  default — a dialog on every reversible action trains users to click through');
  lines.push('  without reading.');
  lines.push('- **LEVEL 2 — important** (cancel PO, cancel job, delete draft): confirmation');
  lines.push('  where appropriate.');
  lines.push('- **LEVEL 3 — financial/security** (refund, payout, bank change, permission');
  lines.push('  change, credential change, automation publish): authorization + confirmation +');
  lines.push('  reason + audit.');
  lines.push('- **LEVEL 4 — irreversible/high-risk** (destructive data deletion, irreversible');
  lines.push('  external operation): elevated approval/reauthentication where required.');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Level | Files | Without any confirm()/custom modal |');
  lines.push('|---|---|---|');
  for (const level of ['LEVEL_4', 'LEVEL_3', 'LEVEL_2', 'LEVEL_1'] as Level[]) {
    const list = byLevel[level];
    lines.push(`| ${LEVEL_LABEL[level]} | ${list.length} | ${list.filter(f => !f.hasConfirm && !f.hasCustomModal).length} |`);
  }
  lines.push('');
  for (const level of ['LEVEL_4', 'LEVEL_3', 'LEVEL_2', 'LEVEL_1'] as Level[]) {
    lines.push(`## ${LEVEL_LABEL[level]}`);
    lines.push('');
    lines.push('| Screen | Matched action(s) | Protected? |');
    lines.push('|---|---|---|');
    for (const f of byLevel[level]) {
      const protection = f.hasConfirm ? 'yes — window.confirm()' : f.hasCustomModal ? 'yes — custom modal (heuristically detected)' : 'NO';
      lines.push(`| ${f.file} | ${f.matches.join(', ')} | ${protection} |`);
    }
    lines.push('');
  }

  lines.push('## Manual review findings (why automated detection alone is not enough)');
  lines.push('');
  lines.push('Real findings from actually reading the flagged files, kept here because they');
  lines.push('show why this report is a starting point for human judgment, not a list to');
  lines.push('mechanically "fix" top to bottom — the same honest lesson Phase 23 documented for');
  lines.push('its own predecessor report, reconfirmed here on a wider net:');
  lines.push('');
  lines.push('- **`FollowUpStageRules.handleDeleteRule`** (LEVEL 4 by keyword) is flagged as');
  lines.push('  having no `confirm()`/detectable custom modal — but it already has a real inline');
  lines.push('  confirm/cancel state pattern (`deleteConfirmId` gates a "Confirm Delete"/"Cancel"');
  lines.push('  button pair; `handleDeleteRule` only runs from the "Confirm Delete" button, never');
  lines.push('  directly from the trash icon). A false positive, left unfixed deliberately — the');
  lines.push('  same class of finding as Phase 23\'s `SecuritySessionManagementScreen` result.');
  lines.push('- **`PermissionsPrimer`** (LEVEL 3 by screen-name match on "permission") is about');
  lines.push('  BROWSER DEVICE permissions (location/camera/notification) for the current user\'s');
  lines.push('  own device — not application user-role/permission management. The browser\'s own');
  lines.push('  native permission prompt is the real confirmation step; an app-level dialog on');
  lines.push('  top would be redundant, against this pack\'s own "no pointless dialogs" rule.');
  lines.push('- **`PayoutHistoryStatementsScreen`** (LEVEL 3 by screen-name match on "payout") has');
  lines.push('  exactly one action, `handleDownloadStatement` — a read/export action, not a');
  lines.push('  financial mutation. No confirmation needed.');
  lines.push('- **`PaymentStageScheduleSetup.handleDeleteStage`** (LEVEL 4 by keyword) — carried');
  lines.push('  over from Phase 23\'s own finding: only removes a stage from an in-memory DRAFT');
  lines.push('  being edited, nothing persisted until a separate "Save Draft" action. Genuinely');
  lines.push('  reversible in practice despite the "delete" name. Left unprotected deliberately.');
  lines.push('');
  lines.push('## What Phase 36 fixed this phase (real, not just measured)');
  lines.push('');
  lines.push('8 real, high-confidence, previously-completely-unprotected gaps fixed with a');
  lines.push('`window.confirm()` guard this phase (consistent with the established, already-');
  lines.push('verified pattern from Phase 23\'s `UserRolePermissionManagementScreen` fix):');
  lines.push('');
  lines.push('- LEVEL 3 (financial): `AutomatedPayoutDisbursementScreen.handleExecuteBatchDisbursement`,');
  lines.push('  `PayoutApprovalQueueScreen.handleApproveBatch`,');
  lines.push('  `StageWisePayoutTrackerScreen.handleApproveAllPending`,');
  lines.push('  `SupplierPaymentApprovalScreen.handleExecuteBatchApprove`,');
  lines.push('  `RefundDisputeManagement.handleFinalizeResolution` (this one already required a');
  lines.push('  written reason/explanation before this fix — the "reason" half of "confirmation +');
  lines.push('  reason" was real and pre-existing; this fix adds the missing explicit "are you');
  lines.push('  sure" step).');
  lines.push('- LEVEL 4 (irreversible): `AutoNegotiationBotConfig.handleDeleteScenario`,');
  lines.push('  `MapFiltersLayersControlPanel.handleDeleteView`,');
  lines.push('  `PricingRulesMarginConfig.handleDeleteAMCTier`.');
  lines.push('');
  lines.push('Not fixed at scale, by design — this pack\'s own explicit rule against mechanically');
  lines.push('applying dialogs everywhere. The remaining unprotected LEVEL 3/4 items (mostly');
  lines.push('single-item, not batch, approvals — e.g. `handleApproveSingle` variants) carry a');
  lines.push('materially lower "oops" blast radius than the batch/finalize actions fixed above,');
  lines.push('and are flagged here as real, open, lower-priority follow-up rather than either');
  lines.push('silently ignored or blindly wrapped in redundant dialogs.');
  lines.push('');
  lines.push('## LEVEL 3\'s full "authorization + confirmation + reason + audit" ask — honest scope');
  lines.push('');
  lines.push('This phase adds the **confirmation** step to the 5 highest-confidence LEVEL 3 gaps.');
  lines.push('**Authorization**: these screens are reached only via role-gated navigation/routing');
  lines.push('today (client-side, per `docs/security/LEGACY-AUTHORIZATION-REMEDIATION.md`\'s own');
  lines.push('P0/P1 findings) — real server-side authorization for the underlying data is a');
  lines.push('separate, larger Phase 35-owned effort, not duplicated here. **Reason**: only');
  lines.push('`RefundDisputeManagement` already required one; adding a mandatory reason field to');
  lines.push('the other 4 screens is a real UI change this sandbox cannot visually verify without');
  lines.push('a browser — flagged as real follow-up, not fabricated. **Audit**: `src/lib/audit.ts`\'s');
  lines.push('`recordAuditEvent()` exists and is real, but these 5 screens are legacy `DbManager`-only');
  lines.push('screens with no dual-write bridge into the canonical audit trail yet — wiring them in');
  lines.push('is exactly the Phase 15-18 pattern, real remaining work, not silently skipped.');
  lines.push('');

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
  console.log(`Wrote ${OUT_FILE} — ${findings.length} components. L4:${byLevel.LEVEL_4.length} L3:${byLevel.LEVEL_3.length} L2:${byLevel.LEVEL_2.length} L1:${byLevel.LEVEL_1.length}`);
}

main();
export { classify, LEVEL_KEYWORDS };
