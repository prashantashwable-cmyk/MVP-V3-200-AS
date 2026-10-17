/**
 * MVP strings for the field and customer screens (D-18): English, Marathi,
 * Hindi. Missing keys fall back to English. Uses the app's existing
 * language choice (`aiec_app_lang`, set by src/lib/language.ts), or the language App passes down.
 * Marathi and Hindi strings: needs native review.
 */
export type Lang = 'en' | 'mr' | 'hi';

const EN = {
  myWork: 'My work', today: 'Today', orders: 'Orders', nothingToDo: 'Nothing to do right now.',
  start: 'START', checkIn: 'CHECK IN', blocked: 'BLOCKED', complete: 'COMPLETE', submit: 'Submit', save: 'Save',
  nextAction: 'Next action', owner: 'Owner', due: 'Due', blocker: 'Blocker', payment: 'Payment', health: 'Health',
  progress: 'Progress', stage: 'Stage', none: 'None', addPhoto: 'Add photo', photos: 'Photos', notes: 'Notes',
  reason: 'Reason', description: 'Description', emergency: 'EMERGENCY', emergencyHelp: 'Lift stuck, someone trapped or unsafe?',
  accept: 'Accept quote', reject: 'Reject', approveHandover: 'I approve the handover', submitProof: 'Submit payment proof',
  reference: 'UTR / reference', siteReady: 'My site is ready', loading: 'Loading…', retry: 'Retry', error: 'Something went wrong',
  checklist: 'Installation checklist', overdue: 'Overdue', call: 'Call',
};
type Key = keyof typeof EN;

// needs native review
const MR: Partial<Record<Key, string>> = {
  myWork: 'माझे काम', today: 'आज', orders: 'ऑर्डर', nothingToDo: 'सध्या काही काम नाही.',
  start: 'सुरू करा', checkIn: 'चेक इन', blocked: 'अडथळा', complete: 'पूर्ण', submit: 'सबमिट', save: 'जतन करा',
  nextAction: 'पुढील काम', owner: 'जबाबदार', due: 'मुदत', blocker: 'अडथळा', payment: 'पेमेंट', health: 'स्थिती',
  progress: 'प्रगती', stage: 'टप्पा', none: 'काही नाही', addPhoto: 'फोटो जोडा', photos: 'फोटो', notes: 'टीप',
  reason: 'कारण', description: 'वर्णन', emergency: 'आणीबाणी', emergencyHelp: 'लिफ्ट अडकली, कोणी अडकले किंवा धोका?',
  accept: 'कोटेशन स्वीकारा', reject: 'नाकारा', approveHandover: 'मी हस्तांतरण मंजूर करतो', submitProof: 'पेमेंट पुरावा पाठवा',
  reference: 'UTR / संदर्भ', siteReady: 'माझी साइट तयार आहे', loading: 'लोड होत आहे…', retry: 'पुन्हा प्रयत्न करा',
  error: 'काहीतरी चूक झाली', checklist: 'इन्स्टॉलेशन चेकलिस्ट', overdue: 'मुदत संपली', call: 'कॉल',
};
// needs native review
const HI: Partial<Record<Key, string>> = {
  myWork: 'मेरा काम', today: 'आज', orders: 'ऑर्डर', nothingToDo: 'अभी कोई काम नहीं है.',
  start: 'शुरू करें', checkIn: 'चेक इन', blocked: 'रुकावट', complete: 'पूरा', submit: 'सबमिट', save: 'सेव करें',
  nextAction: 'अगला काम', owner: 'ज़िम्मेदार', due: 'नियत तिथि', blocker: 'रुकावट', payment: 'भुगतान', health: 'स्थिति',
  progress: 'प्रगति', stage: 'चरण', none: 'कोई नहीं', addPhoto: 'फोटो जोड़ें', photos: 'फोटो', notes: 'नोट',
  reason: 'कारण', description: 'विवरण', emergency: 'आपातकाल', emergencyHelp: 'लिफ्ट फंसी, कोई फंसा या खतरा?',
  accept: 'कोटेशन स्वीकारें', reject: 'अस्वीकार', approveHandover: 'मैं हैंडओवर स्वीकार करता हूँ', submitProof: 'भुगतान प्रमाण भेजें',
  reference: 'UTR / संदर्भ', siteReady: 'मेरी साइट तैयार है', loading: 'लोड हो रहा है…', retry: 'फिर से कोशिश करें',
  error: 'कुछ गलत हो गया', checklist: 'इंस्टॉलेशन चेकलिस्ट', overdue: 'समय निकल गया', call: 'कॉल',
};

export function currentLang(): Lang {
  try {
    const l = localStorage.getItem('aiec_app_lang');
    return l === 'mr' || l === 'hi' ? l : 'en';
  } catch {
    return 'en';
  }
}

export function t(key: Key, lang: Lang = currentLang()): string {
  if (lang === 'mr') return MR[key] ?? EN[key];
  if (lang === 'hi') return HI[key] ?? EN[key];
  return EN[key];
}

export const MVP_I18N = { EN, MR, HI };
