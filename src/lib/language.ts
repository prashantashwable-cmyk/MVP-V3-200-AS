import { useState, useEffect } from 'react';
import { DbManager } from './db';
import { User } from '../types';
import { isMvpMode } from '../mvp/mvpMode';

export type Language = 'en' | 'mr' | 'hi';

export const translations = {
  en: {
    // Brand Header / Landing
    title: "ALL INDIA ELEVATORS",
    subtitle: "Authorized Mobility Aggregator",
    description: "Managing high-rise infrastructure, physical shaft inspections, and floor milestone SOPs across India.",
    foundingDirector: "Founding Director",
    hq: "Pune HQ, Maharashtra • ISO 9001:2015",
    tryDemoMode: "Try Demo Mode",
    secureLogin: "Secure Login",
    aggregatorSandboxes: "Aggregator Sandboxes",
    sandboxDesc: "Instantly explore features with pre-seeded demo records.",
    firstTimeOnboarding: "First-Time Onboarding",
    selectRole: "Select a platform role & trigger approval flow",
    masterAdmin: "Master Admin Control",
    ownerMonitor: "Mr. Prashant Vasant Wable (Owner & Monitor)",
    enterMobile: "Primary Mobile Number",
    loginDesc: "Use a registered phone number to log in via password or simulated OTP.",
    otpButton: "Send Verification OTP",
    passwordButton: "Authenticate Credentials",
    rememberMe: "Remember credentials securely",
    enterPassword: "Security Password",
    defaultFallback: "Default fallback is",
    forgotPass: "Forgot Password?",
    accRecovery: "Account Recovery?",
    enterNumHelp: "Enter any mobile number. New phones register automatically as \"Pending Approval\".",
    langLabel: "Language / भाषा / Language",
    
    // Sidebar & Navigation
    home: "Home Dashboard",
    partners: "Partners Directory",
    settings: "Demo Settings",
    incentives: "Historical Incentives",
    jobs: "Job Pipeline",
    equipment: "Equipment Orders",
    support: "Client Support",
    logout: "Log Out",
    welcome: "Namaskar",
    adminTitle: "AIEC Operations Center",
    surveyorTitle: "Surveyor Field Log",
    technicianTitle: "Technician Workbench",
    supplierTitle: "Supplier Dispatch Portal",
    customerTitle: "Customer Portal",
    
    // Shared Dashboard Headers & Labels
    revenue: "Collected Revenue",
    leads: "Total Leads",
    won: "Deals Won",
    activePartners: "Active Partners",
    addLead: "Add New Lead",
    resetSeeds: "Reset Demo Seeds",
    liveTracker: "Live Tracking",
    activeSites: "Active Sites",
    operationsCenter: "Operations Center",
    liveFromPune: "Live from Pune HQ • Safety First",
    addNewLeadTitle: "Register New Building Lead",
    clientName: "Client Name",
    phoneNumber: "Phone Number",
    buildingAddress: "Building Address",
    totalFloors: "Total Floors",
    propertyType: "Property Type",
    residential: "Residential",
    commercial: "Commercial",
    submitLead: "Submit Lead",
    leadPipeline: "Lead Pipeline Stage Monitoring",
    partnerDirectory: "Partner Tracking Directory",
    launchAuditTracker: "Launch Audit Tracker",
    auditDesc: "Authorized cold start logs, credential check events, and geo-type signatures tracked securely.",
    
    // Buttons
    cancel: "Cancel",
    submit: "Submit",
    status: "Status",
    save: "Save",
    edit: "Edit",
    loading: "Loading...",
    close: "Close"
  },
  mr: {
    // Brand Header / Landing
    title: "ऑल इंडिया एलिव्हेटर्स",
    subtitle: "अधिकृत मोबिलिटी एग्रीगेटर",
    description: "भारतातील उंच इमारतींचे नियंत्रण, प्रत्यक्ष लिफ्ट शाफ्ट तपासणी आणि टप्पेवार गुणवत्ता पडताळणीचे व्यवस्थापन.",
    foundingDirector: "संस्थापक संचालक",
    hq: "पुणे मुख्यालय, महाराष्ट्र • ISO 9001:2015",
    tryDemoMode: "डेमो मोड",
    secureLogin: "सुरक्षित लॉगिन",
    aggregatorSandboxes: "एग्रीगेटर सँडबॉक्स",
    sandboxDesc: "पूर्व-लोड केलेल्या डेमो रेकॉर्ड्ससह त्वरित फीचर्स तपासा.",
    firstTimeOnboarding: "प्रथम-वेळ ऑनबोर्डिंग",
    selectRole: "प्लॅटफॉर्म भूमिका निवडा आणि मंजूरी प्रवाह सुरू करा",
    masterAdmin: "मास्टर ॲडमिन कंट्रोल",
    ownerMonitor: "श्री. प्रशांत वसंत वाबळे (मालक आणि मॉनिटर)",
    enterMobile: "प्राथमिक मोबाईल नंबर",
    loginDesc: "पासवर्ड किंवा सिम्युलेटेड OTP द्वारे लॉगिन करण्यासाठी नोंदणीकृत नंबर वापरा.",
    otpButton: "OTP पडताळणी पाठवा",
    passwordButton: "क्रेडेंशियल सत्यापित करा",
    rememberMe: "क्रेडेंशियल्स सुरक्षितपणे लक्षात ठेवा",
    enterPassword: "सुरक्षा पासवर्ड",
    defaultFallback: "डिफॉल्ट पासवर्ड आहे",
    forgotPass: "पासवर्ड विसरलात?",
    accRecovery: "खाते रिकव्हरी?",
    enterNumHelp: "कोणताही मोबाईल नंबर टाका. नवीन फोन 'प्रलंबित मंजुरी' म्हणून आपोआप नोंदणीकृत होतील.",
    langLabel: "भाषा / Language / भाषा",
    
    // Sidebar & Navigation
    home: "मुख्य डॅशबोर्ड",
    partners: "भागीदार निर्देशिका",
    settings: "डेमो सेटिंग्स",
    incentives: "ऐतिहासिक प्रोत्साहन",
    jobs: "काम प्रगतीपथ",
    equipment: "उपकरणे ऑर्डर्स",
    support: "ग्राहक सहाय्य",
    logout: "लॉग आउट",
    welcome: "नमस्कार",
    adminTitle: "AIEC ऑपरेशन्स केंद्र",
    surveyorTitle: "सर्वेक्षक फील्ड लॉग",
    technicianTitle: "तंत्रज्ञ वर्कबेंच",
    supplierTitle: "विक्रेता पाठवणे पोर्टल",
    customerTitle: "ग्राहक पोर्टल",
    
    // Shared Dashboard Headers & Labels
    revenue: "एकत्रित महसूल",
    leads: "एकूण लीड्स",
    won: "करार जिंकले",
    activePartners: "सक्रिय भागीदार",
    addLead: "नवीन लीड जोडा",
    resetSeeds: "डेमो सीड्स रीसेट करा",
    liveTracker: "थेट ट्रॅकिंग",
    activeSites: "सक्रिय साइट्स",
    operationsCenter: "ऑपरेशन्स केंद्र",
    liveFromPune: "पुणे मुख्यालयातून थेट • सुरक्षा प्रथम",
    addNewLeadTitle: "नवीन इमारत लीडची नोंदणी करा",
    clientName: "ग्राहकाचे नाव",
    phoneNumber: "फोन नंबर",
    buildingAddress: "इमारतीचा पत्ता",
    totalFloors: "एकूण मजले",
    propertyType: "मालमत्ता प्रकार",
    residential: "रहिवासी (Residential)",
    commercial: "व्यावसायिक (Commercial)",
    submitLead: "लीड सबमिट करा",
    leadPipeline: "लीड पाईपलाईन टप्पा पडताळणी",
    partnerDirectory: "भागीदार ट्रॅकिंग निर्देशिका",
    launchAuditTracker: "लॉन्च ऑडिट ट्रॅकर",
    auditDesc: "अधिकृत कोल्ड स्टार्ट लॉग्स, क्रेडेंशियल पडताळणी इव्हेंट्स आणि भौगोलिक-स्वाक्षरी सुरक्षितपणे ट्रॅक केल्या आहेत.",
    
    // Buttons
    cancel: "रद्द करा",
    submit: "सबमिट करा",
    status: "स्थिती",
    save: "जतन करा",
    edit: "संपादन",
    loading: "लोड होत आहे...",
    close: "बंद करा"
  },
  hi: {
    // Brand Header / Landing
    title: "ऑल इंडिया एलिवेटर्स",
    subtitle: "अधिकृत मोबिलिटी एग्रीगेटर",
    description: "भारत भर में ऊंची इमारतों के बुनियादी ढांचे, भौतिक शाफ्ट निरीक्षण और गुणवत्ता नियंत्रण चरणों का प्रबंधन।",
    foundingDirector: "संस्थापक निदेशक",
    hq: "पुणे मुख्यालय, महाराष्ट्र • ISO 9001:2015",
    tryDemoMode: "डेमो मोड",
    secureLogin: "सुरक्षित लॉगिन",
    aggregatorSandboxes: "एग्रीगेटर सैंडबॉक्स",
    sandboxDesc: "पहले से लोड किए गए डेमो रिकॉर्ड के साथ तुरंत सुविधाओं का परीक्षण करें।",
    firstTimeOnboarding: "प्रथम-बार ऑनबोर्डिंग",
    selectRole: "सिस्टम में भूमिका चुनें और स्वीकृति प्रक्रिया शुरू करें",
    masterAdmin: "मास्टर एडमिन कंट्रोल",
    ownerMonitor: "श्री प्रशांत वसंत वाबले (स्वामी और मॉनिटर)",
    enterMobile: "प्राथमिक मोबाइल नंबर",
    loginDesc: "पासवर्ड या सिम्युलेटेड ओटीपी के माध्यम से लॉगिन करने के लिए पंजीकृत नंबर का उपयोग करें।",
    otpButton: "ओटीपी सत्यापन भेजें",
    passwordButton: "क्रेडेंशियल्स सत्यापित करें",
    rememberMe: "क्रेडेंशियल्स सुरक्षित रूप से याद रखें",
    enterPassword: "सुरक्षा पासवर्ड",
    defaultFallback: "डिफ़ॉल्ट पासवर्ड है",
    forgotPass: "पासवर्ड भूल गए?",
    accRecovery: "खाता रिकवरी?",
    enterNumHelp: "कोई भी मोबाइल नंबर दर्ज करें। नए फोन 'लंबित अनुमोदन' के रूप में स्वचालित रूप से पंजीकृत हो जाएंगे।",
    langLabel: "भाषा / Language / भाषा",
    
    // Sidebar & Navigation
    home: "मुख्य डैशबोर्ड",
    partners: "भागीदार निर्देशिका",
    settings: "डेमो सेटिंग्स",
    incentives: "ऐतिहासिक प्रोत्साहन",
    jobs: "कार्य प्रगति",
    equipment: "उपकरण ऑर्डर",
    support: "ग्राहक सहायता",
    logout: "लॉग आउट",
    welcome: "नमस्कार",
    adminTitle: "AIEC संचालन केंद्र",
    surveyorTitle: "सर्वेक्षक फील्ड लॉग",
    technicianTitle: "तकनीशियन वर्कबेंच",
    supplierTitle: "आपूर्तिकर्ता पोर्टल",
    customerTitle: "ग्राहक पोर्टल",
    
    // Shared Dashboard Headers & Labels
    revenue: "एकत्रित राजस्व",
    leads: "कुल लीड्स",
    won: "सौदे जीते",
    activePartners: "सक्रिय भागीदार",
    addLead: "नया लीड जोड़ें",
    resetSeeds: "डेमो सीड्स रीसेट करें",
    liveTracker: "लाइव ट्रैकिंग",
    activeSites: "सक्रिय साइटें",
    operationsCenter: "संचालन केंद्र",
    liveFromPune: "पुणे मुख्यालय से लाइव • सुरक्षा पहले",
    addNewLeadTitle: "नया भवन लीड पंजीकृत करें",
    clientName: "ग्राहक का नाम",
    phoneNumber: "फ़ोन नंबर",
    buildingAddress: "भवन का पता",
    totalFloors: "कुल मंजिलों",
    propertyType: "संपत्ति का प्रकार",
    residential: "आवासीय (Residential)",
    commercial: "व्यावसायिक (Commercial)",
    submitLead: "लीड सबमिट करें",
    leadPipeline: "लीड पाइपलाइन चरण निगरानी",
    partnerDirectory: "भागीदार ट्रैकिंग निर्देशिका",
    launchAuditTracker: "लॉन्च ऑडिट ट्रैकर",
    auditDesc: "अधिकृत कोल्ड स्टार्ट लॉग, क्रेडेंशियल चेक इवेंट और भू-प्रकार हस्ताक्षर सुरक्षित रूप से ट्रैक किए गए।",
    
    // Buttons
    cancel: "रद्द करें",
    submit: "सबमिट करें",
    status: "स्थिति",
    save: "सहेजें",
    edit: "संपादन",
    loading: "लोड हो रहा है...",
    close: "बंद करें"
  }
};

const LISTEN_EVENT = 'aiec_language_update';

export function getAppLanguage(): Language {
  const saved = localStorage.getItem('aiec_app_lang');
  if (saved === 'en' || saved === 'mr' || saved === 'hi') {
    return saved;
  }
  return 'en';
}

export function setAppLanguage(lang: Language, currentUser?: User | null) {
  localStorage.setItem('aiec_app_lang', lang);
  document.documentElement.setAttribute('lang', lang);
  
  // D-01: MVP users are never written through the legacy local store. The choice already
  // persists per-browser via localStorage above; cross-device sync is not built (D-18: keep
  // it simple, expand later).
  if (currentUser && !isMvpMode()) {
    const updatedUser = {
      ...currentUser,
      preferred_language: lang
    };
    DbManager.updateUser(updatedUser);
  }

  window.dispatchEvent(new CustomEvent(LISTEN_EVENT, { detail: lang }));
}

export function useLanguage(currentUser?: User | null) {
  const [lang, setLang] = useState<Language>(getAppLanguage());

  useEffect(() => {
    // Initial sync of HTML lang attribute
    document.documentElement.setAttribute('lang', lang);

    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<Language>;
      if (customEvent.detail) {
        setLang(customEvent.detail);
      }
    };
    window.addEventListener(LISTEN_EVENT, handleUpdate);
    return () => window.removeEventListener(LISTEN_EVENT, handleUpdate);
  }, [lang]);

  // Sync language automatically when user logs in or profile changes
  useEffect(() => {
    if (currentUser && currentUser.preferred_language) {
      if (currentUser.preferred_language !== lang) {
        setAppLanguage(currentUser.preferred_language);
      }
    }
  }, [currentUser]);

  const t = (key: keyof typeof translations['en']): string => {
    const dict = translations[lang] || translations['en'];
    return dict[key] || translations['en'][key] || String(key);
  };

  return {
    language: lang,
    setLanguage: (newLang: Language) => {
      setAppLanguage(newLang, currentUser);
    },
    t,
    dict: translations[lang] || translations['en']
  };
}
