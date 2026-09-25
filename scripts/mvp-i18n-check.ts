/**
 * Step 10 check: every MVP i18n lookup returns a real string for en/mr/hi — a partial
 * translation in mr/hi always falls back to English rather than showing a blank or the raw
 * key (D-18). Pure; no repository, no clock.
 * Run with: npx tsx scripts/mvp-i18n-check.ts
 */
import { check, done } from './mvp/fixtures';
import { translateAttention, translateHealth, translateNav, translateNotification, translateStage, type Lang } from '../src/mvp/i18n';
import { MVP_STAGES } from '../src/mvp/stage';
import type { Health } from '../src/mvp/health';
import type { AttentionBucket } from '../src/mvp/services/readModels';
import type { MvpNotification } from '../src/mvp/services/notify';

const LANGS: Lang[] = ['en', 'mr', 'hi'];
const HEALTHS: Health[] = ['ON_TRACK', 'AT_RISK', 'OVERDUE', 'BLOCKED', 'ON_HOLD'];
const BUCKETS: AttentionBucket[] = [
  'emergency', 'overdue', 'blocked', 'payment_pending', 'customer_waiting', 'technician_waiting',
  'supplier_delay', 'qc_failure', 'no_next_action', 'on_hold', 'licence_pending',
];
// The 10 spec §25 notifications, plus D-07/D-28/Step 10's own additions.
const NOTIFICATIONS: MvpNotification[] = [
  'mvp_task_assigned', 'mvp_task_due', 'mvp_task_overdue', 'mvp_survey_scheduled', 'mvp_quote_ready',
  'mvp_payment_due', 'mvp_installation_scheduled', 'mvp_qc_required', 'mvp_handover_ready', 'mvp_amc_reminder',
  'mvp_blocker_raised', 'mvp_emergency', 'mvp_daily_digest',
];
const NAV_TABS = ['MvpDashboard', 'MvpOwnerView', 'MvpOrders', 'MvpTasks', 'MvpToday', 'MvpReports', 'MvpSettings'];

function main() {
  for (const lang of LANGS) {
    for (const stage of MVP_STAGES) check(!!translateStage(lang, stage)?.trim(), `stage ${stage} has a ${lang} label`);
    for (const h of HEALTHS) check(!!translateHealth(lang, h)?.trim(), `health ${h} has a ${lang} label`);
    for (const b of BUCKETS) check(!!translateAttention(lang, b)?.trim(), `attention bucket ${b} has a ${lang} label`);
    for (const n of NOTIFICATIONS) {
      const t = translateNotification(lang, n);
      check(!!t?.subject?.trim() && !!t?.body?.trim(), `notification ${n} has a ${lang} subject and body (falls back to English)`);
    }
    for (const tab of NAV_TABS) check(!!translateNav(lang, tab, `fallback-${tab}`).trim(), `nav tab ${tab} has a ${lang} label`);
  }

  // English is always the literal, exact source — never itself a fallback.
  check(translateStage('en', 'INSTALLATION') === 'Installation', 'English stage labels are exact');
  check(translateHealth('en', 'AT_RISK') === 'At risk', 'English health labels are exact');

  // A tab i18n.ts has no entry for still resolves, via the fallback passed in.
  check(translateNav('mr', 'MvpNotARealTab', 'Not a real tab') === 'Not a real tab', 'an unknown nav id falls back to the caller\'s label, not a crash');

  done('mvp-i18n-check');
}

main();
