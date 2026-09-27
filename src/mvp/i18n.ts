/**
 * MVP languages (spec §30, D-18): English, then Marathi, then Hindi. A small, self-contained
 * dictionary — separate from the legacy `src/lib/language.ts` translations — covering the
 * strings every role sees regardless of screen: stage names, health, the dashboard's
 * "Needs attention" buckets, notification text and the nav tab labels. Falls back to English
 * for any missing key, so a partial translation never breaks the UI. This is a starting set;
 * D-18 says it can be expanded later, one key at a time — not translated all at once.
 */

import type { AttentionBucket } from './services/readModels';
import type { Health } from './health';
import type { MvpNotification } from './services/notify';
import type { MvpStage } from '../domain/entities';
import { MVP_STAGE_LABELS } from './stage';
import { getNotificationTemplate } from '../services/notificationService';

export type Lang = 'en' | 'mr' | 'hi';

interface MvpDict {
  stage: Record<MvpStage, string>;
  health: Record<Health, string>;
  attention: Record<AttentionBucket, string>;
  notify: Partial<Record<MvpNotification, { subject: string; body: string }>>;
  nav: Record<string, string>;
}

const en: MvpDict = {
  stage: MVP_STAGE_LABELS,
  health: { ON_TRACK: 'On track', AT_RISK: 'At risk', OVERDUE: 'Overdue', BLOCKED: 'Blocked', ON_HOLD: 'On hold' },
  attention: {
    emergency: 'Emergency', overdue: 'Overdue', blocked: 'Blocked', payment_pending: 'Payment pending',
    customer_waiting: 'Waiting on customer', technician_waiting: 'Technician waiting', supplier_delay: 'Supplier delay',
    qc_failure: 'QC failure / rework', no_next_action: 'NO NEXT ACTION', on_hold: 'On hold', licence_pending: 'Licence pending',
  },
  notify: {
    mvp_task_assigned: { subject: 'New task assigned', body: 'A task has been assigned to you.' },
    mvp_task_due: { subject: 'Task due soon', body: 'One of your tasks is due within 24 hours.' },
    mvp_task_overdue: { subject: 'Task overdue', body: 'One of your tasks is overdue.' },
    mvp_qc_required: { subject: 'QC required', body: 'An installation is ready for QC inspection.' },
    mvp_handover_ready: { subject: 'Handover ready', body: 'QC has passed; the lift is ready for handover.' },
    mvp_emergency: { subject: 'EMERGENCY', body: 'A lift emergency was reported. Respond now.' },
    mvp_daily_digest: { subject: 'Daily summary', body: 'Your daily summary is ready on the dashboard.' },
    mvp_escalated: { subject: 'Escalated: work is late', body: 'An order task is well past its due date. Please chase it.' },
    mvp_unassigned: { subject: 'Nobody has picked up a task', body: 'A task is waiting for someone to be assigned.' },
    mvp_blocker_aging: { subject: 'Blocker still open', body: 'A blocker has been open longer than its due time.' },
    mvp_lead_followup: { subject: 'Lead follow-up due', body: 'A lead is waiting for your follow-up call.' },
  },
  nav: {
    MvpDashboard: 'Dashboard', MvpOwnerView: 'Overview', MvpOrders: 'Orders', MvpTasks: 'My tasks',
    MvpLeads: 'Leads', MvpNewLead: 'New lead', MvpSuppliers: 'Suppliers', MvpSurveys: 'Surveys',
    MvpToday: 'Today', MvpReports: 'Reports', MvpUsers: 'Users', MvpSettings: 'Settings',
  },
};

// needs native review (D-18): a working translation, not yet checked by a Marathi speaker.
const mr: MvpDict = {
  stage: {
    LEAD: 'लीड', QUALIFIED: 'पात्र', SURVEY: 'सर्वेक्षण', QUOTE: 'कोटेशन', BOOKED: 'बुक केले',
    SITE_READY: 'साइट तयार', DELIVERY: 'डिलिव्हरी', INSTALLATION: 'बसवणी', QC_HANDOVER: 'QC व हस्तांतरण', AMC: 'AMC',
  },
  health: { ON_TRACK: 'योग्य मार्गावर', AT_RISK: 'जोखीम', OVERDUE: 'उशीर झाला', BLOCKED: 'अडथळा', ON_HOLD: 'थांबवले' },
  attention: {
    emergency: 'आपत्कालीन', overdue: 'उशीर झाला', blocked: 'अडथळा', payment_pending: 'पेमेंट बाकी',
    customer_waiting: 'ग्राहकाची प्रतीक्षा', technician_waiting: 'तंत्रज्ञ प्रतीक्षेत', supplier_delay: 'पुरवठादार विलंब',
    qc_failure: 'QC अपयश / पुनःकाम', no_next_action: 'पुढील कृती नाही', on_hold: 'थांबवले', licence_pending: 'परवाना बाकी',
  },
  notify: {
    mvp_task_assigned: { subject: 'नवीन काम नेमले', body: 'तुम्हाला एक काम नेमले आहे.' },
    mvp_task_overdue: { subject: 'काम उशीर झाले', body: 'तुमचे एक काम उशीर झाले आहे.' },
    mvp_emergency: { subject: 'आपत्कालीन', body: 'लिफ्ट बिघाडाची तक्रार आली आहे. लवकर प्रतिसाद द्या.' },
    mvp_task_due: { subject: 'काम लवकरच देय', body: 'तुमचे एक काम २४ तासांत पूर्ण करायचे आहे.' },
    mvp_blocker_aging: { subject: 'अडथळा अजून सुटलेला नाही', body: 'एक अडथळा ठरलेल्या वेळेपेक्षा जास्त काळ उघडा आहे.' },
    mvp_lead_followup: { subject: 'ग्राहकाला फोन करायचा आहे', body: 'एक लीड तुमच्या फॉलो-अप कॉलची वाट पाहत आहे.' },
  },
  nav: {
    MvpDashboard: 'डॅशबोर्ड', MvpOwnerView: 'आढावा', MvpOrders: 'ऑर्डर्स', MvpTasks: 'माझी कामे',
    MvpLeads: 'लीड्स', MvpToday: 'आज', MvpReports: 'अहवाल', MvpSettings: 'सेटिंग्ज',
  },
};

// needs native review (D-18): a working translation, not yet checked by a Hindi speaker.
const hi: MvpDict = {
  stage: {
    LEAD: 'लीड', QUALIFIED: 'योग्य', SURVEY: 'सर्वेक्षण', QUOTE: 'कोटेशन', BOOKED: 'बुक किया',
    SITE_READY: 'साइट तैयार', DELIVERY: 'डिलिवरी', INSTALLATION: 'इंस्टॉलेशन', QC_HANDOVER: 'QC व हस्तांतरण', AMC: 'AMC',
  },
  health: { ON_TRACK: 'ठीक चल रहा है', AT_RISK: 'जोखिम में', OVERDUE: 'देर हो गई', BLOCKED: 'रुका हुआ', ON_HOLD: 'रोका गया' },
  attention: {
    emergency: 'आपातकाल', overdue: 'देर हो गई', blocked: 'रुका हुआ', payment_pending: 'भुगतान बाकी',
    customer_waiting: 'ग्राहक की प्रतीक्षा', technician_waiting: 'तकनीशियन प्रतीक्षा में', supplier_delay: 'सप्लायर देरी',
    qc_failure: 'QC असफल / फिर से काम', no_next_action: 'कोई अगला कदम नहीं', on_hold: 'रोका गया', licence_pending: 'लाइसेंस बाकी',
  },
  notify: {
    mvp_task_assigned: { subject: 'नया काम सौंपा गया', body: 'आपको एक काम सौंपा गया है.' },
    mvp_task_overdue: { subject: 'काम में देरी', body: 'आपका एक काम देर हो गया है.' },
    mvp_emergency: { subject: 'आपातकाल', body: 'लिफ्ट खराबी की सूचना मिली है. तुरंत जवाब दें.' },
    mvp_task_due: { subject: 'काम जल्द देय', body: 'आपका एक काम 24 घंटे में पूरा करना है.' },
    mvp_blocker_aging: { subject: 'रुकावट अभी भी खुली है', body: 'एक रुकावट तय समय से ज़्यादा देर से खुली है.' },
    mvp_lead_followup: { subject: 'ग्राहक को फ़ोन करना है', body: 'एक लीड आपके फ़ॉलो-अप कॉल की प्रतीक्षा में है.' },
  },
  nav: {
    MvpDashboard: 'डैशबोर्ड', MvpOwnerView: 'सारांश', MvpOrders: 'ऑर्डर', MvpTasks: 'मेरे काम',
    MvpLeads: 'लीड्स', MvpToday: 'आज', MvpReports: 'रिपोर्ट', MvpSettings: 'सेटिंग्स',
  },
};

export const MVP_I18N: Record<Lang, Partial<MvpDict>> = { en, mr, hi };

function pick<K extends keyof MvpDict, K2 extends string>(lang: Lang, section: K, key: K2): string | undefined {
  const dict = MVP_I18N[lang]?.[section] as Record<string, string> | undefined;
  return dict?.[key];
}

export function translateStage(lang: Lang, stage: MvpStage): string {
  return pick(lang, 'stage', stage) ?? MVP_STAGE_LABELS[stage];
}
export function translateHealth(lang: Lang, health: Health): string {
  return pick(lang, 'health', health) ?? en.health[health];
}
export function translateAttention(lang: Lang, bucket: AttentionBucket): string {
  return pick(lang, 'attention', bucket) ?? en.attention[bucket];
}
export function translateNav(lang: Lang, tabId: string, fallback: string): string {
  return pick(lang, 'nav', tabId) ?? fallback;
}
/** English is never hand-duplicated here — it falls back to the single template source in notificationService.ts. */
export function translateNotification(lang: Lang, templateId: MvpNotification): { subject: string; body: string } | undefined {
  const localized = (MVP_I18N[lang]?.notify as MvpDict['notify'] | undefined)?.[templateId] ?? en.notify[templateId];
  if (localized) return localized;
  const template = getNotificationTemplate(templateId);
  return template ? { subject: template.subject, body: template.body } : undefined;
}

/** D-32: the daily digest's text carries the real counts (stored on the notification). */
export function digestLine(data: Record<string, number> | undefined): string | undefined {
  if (!data) return undefined;
  const parts: [string, number | undefined][] = [
    ['overdue', data.overdue], ['escalated', data.escalated], ['blockers open too long', data.blockers],
    ['customers late', data.customers], ['orders with no next action', data.noNextAction], ['lead calls due', data.leads],
  ];
  const shown = parts.filter(([, n]) => (n ?? 0) > 0).map(([label, n]) => `${n} ${label}`);
  return shown.length ? shown.join(' · ') : 'Nothing was late at this check.';
}
