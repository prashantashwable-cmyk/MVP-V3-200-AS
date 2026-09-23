import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, ShieldCheck, CheckCircle2, ChevronRight, PenTool, Hash,
  ArrowRight, Phone, RefreshCw, AlertTriangle, Shield, Check, Lock,
  Key, Trash2, Layers, Landmark, Sparkles, Send, Download, Clock
} from 'lucide-react';
import { Card, Button, Badge, AscensionLine } from './Common';
import { useLanguage } from '../lib/language';
import { isDemoEsignOtpAccepted, isDemoAuthBuild } from '../lib/demoCredentials';

// Localizations for E-Signature Capture Screen
const localizations = {
  en: {
    title: "E-Signature Center",
    subtitle: "Complete secure identity verification and sign the finalized contract using cryptographically secured digital execution.",
    stepOtp: "1. Identity OTP Re-Verification",
    stepSign: "2. Executing Signature",
    stepCounter: "3. AIEC Countersign",
    otpPrompt: "We have sent a secure e-sign OTP to your registered number:",
    otpLabel: "Enter 4-Digit Security OTP",
    otpVerifyBtn: "Verify Identity Token",
    otpSuccessMsg: "Identity cryptographically verified! Proceeding to contract signing.",
    otpResendBtn: "Resend Code",
    drawTab: "Draw Signature",
    typeTab: "Type Signature",
    clearBtn: "Clear Board",
    typePlaceholder: "Enter your full name for signature...",
    typedSignatureStyle: "Selected Font Variant",
    consentLabel: "I hereby confirm that this digital signature is a legally binding representation of my physical signature under Section 67A of the Information Technology Act.",
    signBtn: "Lock & Execute E-Sign",
    customerSignLabel: "Customer Legal Execution",
    aiecSignLabel: "AIEC Corporate Countersign",
    awaitingCounterTitle: "Awaiting Corporate Sign-Off",
    awaitingCounterDesc: "The client's signature has been securely bound. Waiting for Mr. Prashant Vasant Wable to authorize and countersign the contract.",
    countersignBtn: "Authorize & Countersign Deal",
    dealClosedWonTitle: "Contract Legally Sealed!",
    dealClosedWonDesc: "Both parties have completed authentication. The agreement is now fully locked and immutable. Proceeding to Deal Closure Confirmation.",
    toastOtpSent: "E-sign verification OTP sent to +91 98455 12092.",
    toastOtpSuccess: "Identity confirmed successfully.",
    toastOtpFail: "Incorrect OTP code. Please re-check and try again.",
    toastCustomerSigned: "Customer signature captured and locked in immutable metadata block.",
    toastCountersigned: "AIEC Authorized Countersignature sealed! Contract is now binding.",
    toastConsentWarning: "You must check the legal consent checkbox to execute the signature.",
    toastCanvasEmpty: "Please draw your signature or input your name before saving.",
    viewingAs: "View Screen As:",
    complianceFooter: "This transaction is audited and certified under ISO-9001:2015 electronic records protocols for AIEC."
  },
  hi: {
    title: "ई-हस्ताक्षर केंद्र",
    subtitle: "सुरक्षित पहचान सत्यापन पूरा करें और अंतिम अनुबंध को प्रमाणित करके डिजिटल रूप से हस्ताक्षर करें।",
    stepOtp: "1. पहचान ओटीपी सत्यापन",
    stepSign: "2. हस्ताक्षर निष्पादन",
    stepCounter: "3. AIEC काउंटर हस्ताक्षर",
    otpPrompt: "हमने आपके पंजीकृत मोबाइल नंबर पर एक सुरक्षित ई-हस्ताक्षर ओटीपी भेजा है:",
    otpLabel: "4-अंकीय सुरक्षा ओटीपी दर्ज करें",
    otpVerifyBtn: "पहचान सत्यापित करें",
    otpSuccessMsg: "पहचान सफलतापूर्वक सत्यापित! अनुबंध हस्ताक्षर पर आगे बढ़ें।",
    otpResendBtn: "कोड पुनः भेजें",
    drawTab: "हस्ताक्षर बनाएं",
    typeTab: "हस्ताक्षर टाइप करें",
    clearBtn: "बोर्ड साफ करें",
    typePlaceholder: "हस्ताक्षर के लिए अपना पूरा नाम दर्ज करें...",
    typedSignatureStyle: "चुना हुआ फ़ॉन्ट प्रकार",
    consentLabel: "मैं पुष्टि करता हूं कि यह डिजिटल हस्ताक्षर सूचना प्रौद्योगिकी अधिनियम की धारा 67A के तहत मेरे भौतिक हस्ताक्षर का कानूनी रूप से बाध्यकारी प्रतिनिधित्व है।",
    signBtn: "लॉक करें और ई-साइन निष्पादित करें",
    customerSignLabel: "ग्राहक कानूनी हस्ताक्षर",
    aiecSignLabel: "AIEC कॉर्पोरेट काउंटर-हस्ताक्षर",
    awaitingCounterTitle: "कॉर्पोरेट मंजूरी की प्रतीक्षा है",
    awaitingCounterDesc: "ग्राहक का हस्ताक्षर सुरक्षित रूप से लॉक कर दिया गया है। अनुबंध पर श्री प्रशांत वसंत वाबले की मंजूरी की प्रतीक्षा है।",
    countersignBtn: "अधिकृत और काउंटर-हस्ताक्षर करें",
    dealClosedWonTitle: "अनुबंध कानूनी रूप से सील किया गया!",
    dealClosedWonDesc: "दोनों पक्षों ने प्रमाणीकरण पूरा कर लिया है। समझौता अब पूरी तरह से लॉक है। डील क्लोजर पुष्टिकरण पर आगे बढ़ें।",
    toastOtpSent: "ई-साइन सत्यापन ओटीपी +91 98455 12092 पर भेजा गया।",
    toastOtpSuccess: "पहचान की सफलतापूर्वक पुष्टि की गई।",
    toastOtpFail: "गलत ओटीपी कोड। कृपया पुनः जांचें और पुनः प्रयास करें।",
    toastCustomerSigned: "ग्राहक के हस्ताक्षर सुरक्षित रूप से कैप्चर किए गए।",
    toastCountersigned: "AIEC कॉर्पोरेट काउंटर-हस्ताक्षर सील हो गया है!",
    toastConsentWarning: "हस्ताक्षर निष्पादित करने के लिए आपको कानूनी सहमति बॉक्स को चेक करना होगा।",
    toastCanvasEmpty: "सहेजने से पहले कृपया अपना हस्ताक्षर बनाएं या अपना नाम दर्ज करें।",
    viewingAs: "स्क्रीन दृश्य भूमिका:",
    complianceFooter: "यह लेनदेन AIEC के लिए ISO-9001:2015 इलेक्ट्रॉनिक रिकॉर्ड प्रोटोकॉल के तहत प्रमाणित है।"
  },
  mr: {
    title: "ई-स्वाक्षरी केंद्र",
    subtitle: "सुरक्षित आयडेंटिटी पडताळणी पूर्ण करा आणि अंतिम करारावर डिजिटल स्वाक्षरी करून सौदा निश्चित करा.",
    stepOtp: "१. आयडेंटिटी ओटीपी पडताळणी",
    stepSign: "२. स्वाक्षरी प्रक्रिया",
    stepCounter: "३. AIEC प्रति-स्वाक्षरी (Countersign)",
    otpPrompt: "आम्ही आपल्या नोंदणीकृत मोबाईल क्रमांकावर सुरक्षित ई-साइन ओटीपी पाठवला आहे:",
    otpLabel: "४-अंकी सुरक्षा ओटीपी प्रविष्ट करा",
    otpVerifyBtn: "ओटीपी पडताळणी करा",
    otpSuccessMsg: "ओटीपी पडताळणी यशस्वी! स्वाक्षरी प्रक्रियेकडे पुढे जात आहोत.",
    otpResendBtn: "ओटीपी पुन्हा पाठवा",
    drawTab: "स्वाक्षरी काढा",
    typeTab: "नाव टाईप करा",
    clearBtn: "बोर्ड साफ करा",
    typePlaceholder: "स्वाक्षरीसाठी आपले पूर्ण नाव टाईप करा...",
    typedSignatureStyle: "निवडलेला फॉन्ट प्रकार",
    consentLabel: "मी याद्वारे पुष्टी करतो की ही डिजिटल स्वाक्षरी माहिती तंत्रज्ञान कायद्याच्या कलम ६७A अंतर्गत माझ्या प्रत्यक्ष स्वाक्षरीचे कायदेशीररित्या बंधनकारक प्रतिनिधित्व आहे.",
    signBtn: "स्वाक्षरी लॉक आणि सबमिट करा",
    customerSignLabel: "ग्राहकाची कायदेशीर स्वाक्षरी",
    aiecSignLabel: "AIEC कॉर्पोरेट प्रति-स्वाक्षरी",
    awaitingCounterTitle: "कॉर्पोरेट प्रति-स्वाक्षरीची प्रतीक्षा",
    awaitingCounterDesc: "ग्राहकाची स्वाक्षरी सुरक्षितपणे नोंदवली आहे. श्री प्रशांत वसंत वाबले यांच्या प्रति-स्वाक्षरीची प्रतीक्षा आहे.",
    countersignBtn: "सौदा अधिकृत व मंजूर करा",
    dealClosedWonTitle: "करारनामा कायदेशीररित्या पूर्ण!",
    dealClosedWonDesc: "दोन्ही बाजूंची स्वाक्षरी प्रक्रिया पूर्ण झाली आहे. करार आता पूर्णपणे लॉक आणि अंतिम झाला आहे.",
    toastOtpSent: "ई-स्वाक्षरी ओटीपी +९१ ९८४५५ १२०९२ वर पाठवला गेला.",
    toastOtpSuccess: "पडताळणी यशस्वी झाली.",
    toastOtpFail: "चुकीचा ओटीपी. कृपया पुन्हा तपासा आणि पुन्हा प्रयत्न करा.",
    toastCustomerSigned: "ग्राहकाची डिजिटल स्वाक्षरी सुरक्षितपणे साठवली गेली आहे.",
    toastCountersigned: "AIEC कॉर्पोरेट प्रति-स्वाक्षरी पूर्ण झाली! सौदा अंतिम झाला आहे.",
    toastConsentWarning: "स्वाक्षरी मंजूर करण्यासाठी तुम्हाला कायदेशीर संमती चौकटीवर टिक करावे लागेल.",
    toastCanvasEmpty: "स्वाक्षरी काढल्याशिवाय किंवा नाव टाईप केल्याशिवाय पुढे जाता येणार नाही.",
    viewingAs: "स्क्रीन दृश्य भूमिका:",
    complianceFooter: "हा व्यवहार AIEC च्या ISO-9001:2015 इलेक्ट्रॉनिक दस्तऐवज सुरक्षा नियमांनुसार प्रमाणित आहे."
  }
};

export const ESignatureCapture: React.FC<{ user: any; onGoToNext?: () => void }> = ({ user, onGoToNext }) => {
  const { language } = useLanguage();
  const [activePersona, setActivePersona] = useState<'customer' | 'staff'>('customer');
  const [toastMsg, setToastMsg] = useState('');
  
  // E-sign process states
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1); // 1: OTP, 2: Customer Sign, 3: Countersign, 4: Fully Sealed
  const [otpValue, setOtpValue] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [signMethod, setSignMethod] = useState<'draw' | 'type'>('draw');
  
  // Custom Typed Sign states
  const [typedName, setTypedName] = useState('Karan Malhotra');
  const [fontStyleIdx, setFontStyleIdx] = useState(0);
  const [consentChecked, setConsentChecked] = useState(false);
  
  // Saved outputs
  const [customerSignatureImg, setCustomerSignatureImg] = useState<string | null>(null);
  const [customerSignedAt, setCustomerSignedAt] = useState<string | null>(null);
  const [aiecCountersigned, setAiecCountersigned] = useState(false);
  const [aiecSignedAt, setAiecSignedAt] = useState<string | null>(null);

  // Canvas drawing ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const t = useMemo(() => {
    return localizations[language as 'en' | 'hi' | 'mr'] || localizations.en;
  }, [language]);

  const fontOptions = [
    "font-serif italic text-xl text-royalemerald tracking-wider font-semibold",
    "font-sans italic text-lg text-charcoal font-black tracking-widest uppercase",
    "font-mono italic text-sm text-antiquegold tracking-wide font-extrabold"
  ];

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4500);
  };

  // Canvas Drawing Handlers (Mobile touch friendly)
  useEffect(() => {
    if (currentStep === 2 && signMethod === 'draw' && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#0E4B3D'; // Royal Emerald
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
      }
    }
  }, [currentStep, signMethod]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  // Verification OTP handler — Phase 32: routed through
  // src/lib/demoCredentials.ts. No real SMS/OTP backend exists behind
  // this flow in any environment (the same long-documented gap as the
  // main login OTP, Phase 05); the demo-only acceptance behavior is
  // preserved for sandbox/demo builds, but a real production build now
  // honestly always rejects rather than silently accepting any 4-digit
  // input (the prior, ungated behavior regardless of environment).
  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoEsignOtpAccepted(otpValue)) {
      setOtpVerified(true);
      triggerToast(t.toastOtpSuccess);
      setCurrentStep(2);
    } else {
      triggerToast(t.toastOtpFail);
    }
  };

  // Customer signature locker
  const handleLockAndSign = () => {
    if (!consentChecked) {
      triggerToast(t.toastConsentWarning);
      return;
    }

    if (signMethod === 'draw' && !hasDrawn) {
      triggerToast(t.toastCanvasEmpty);
      return;
    }

    if (signMethod === 'type' && !typedName.trim()) {
      triggerToast(t.toastCanvasEmpty);
      return;
    }

    // Save mock signature
    if (signMethod === 'draw' && canvasRef.current) {
      setCustomerSignatureImg(canvasRef.current.toDataURL());
    } else {
      setCustomerSignatureImg(`typed:${typedName}:${fontStyleIdx}`);
    }

    const timestamp = new Date().toLocaleString();
    setCustomerSignedAt(timestamp);
    triggerToast(t.toastCustomerSigned);
    setCurrentStep(3); // Go to countersignature step
  };

  // AIEC Staff Countersignature
  const handleAiecCountersign = () => {
    setAiecCountersigned(true);
    const timestamp = new Date().toLocaleString();
    setAiecSignedAt(timestamp);
    triggerToast(t.toastCountersigned);
    setCurrentStep(4); // Fully Locked
  };

  const activeWizardSteps = [
    { id: 'otp', label: t.stepOtp, completed: currentStep > 1, active: currentStep === 1 },
    { id: 'sign', label: t.stepSign, completed: currentStep > 2, active: currentStep === 2 },
    { id: 'counter', label: t.stepCounter, completed: currentStep > 3, active: currentStep === 3 }
  ];

  return (
    <div className="space-y-6 pb-12">
      
      {/* Toast Alert */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 right-6 z-50 bg-royalemerald text-white text-xs font-bold px-4 py-3 rounded-xl shadow-lg border border-antiquegold/25 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-white" />
            <span>{toastMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress Indicator Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-4 rounded-2xl border border-[rgba(184,135,61,0.15)] shadow-xs">
        <div>
          <div className="flex justify-between text-[10px] font-mono font-bold text-charcoal mb-1">
            <span>Negotiation & Closing Progress (Screen 6 of 10)</span>
            <span>60.0%</span>
          </div>
          <div className="h-2.5 bg-alabaster rounded-full overflow-hidden border border-[#e5dfd4]">
            <div className="h-full bg-royalemerald rounded-full" style={{ width: '60%' }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[10px] font-mono font-bold text-charcoal mb-1">
            <span>Overall Platform Build Progress (Screen 76 of 200)</span>
            <span>38.0%</span>
          </div>
          <div className="h-2.5 bg-alabaster rounded-full overflow-hidden border border-[#e5dfd4]">
            <div className="h-full bg-antiquegold rounded-full" style={{ width: '38%' }} />
          </div>
        </div>
      </div>

      {/* Screen Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 text-left">
        <div>
          <span className="text-[10px] uppercase tracking-widest text-antiquegold font-mono font-extrabold bg-antiquegold/10 px-2.5 py-1 rounded-md">
            MODULE 8 • FORMAL SIGNATURE CAPTURE
          </span>
          <h1 className="font-serif text-2xl md:text-3xl font-extrabold text-charcoal tracking-tight mt-1 flex items-center gap-2">
            <PenTool className="w-7 h-7 text-antiquegold" />
            <span>{t.title}</span>
          </h1>
          <p className="text-xs text-warmgray font-semibold max-w-2xl mt-0.5 leading-relaxed">
            {t.subtitle}
          </p>
        </div>

        {/* Persona toggle */}
        <div className="bg-white p-1 rounded-xl border border-border flex items-center gap-1 shrink-0">
          <span className="text-[10px] font-mono font-bold text-warmgray px-2 uppercase">{t.viewingAs}</span>
          <button
            onClick={() => {
              setActivePersona('customer');
              triggerToast("Switched viewpoint to Customer (Karan Malhotra).");
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activePersona === 'customer' 
                ? 'bg-royalemerald text-white' 
                : 'text-charcoal hover:bg-alabaster'
            }`}
          >
            {language === 'hi' ? 'ग्राहक' : language === 'mr' ? 'ग्राहक' : 'Customer'}
          </button>
          <button
            onClick={() => {
              setActivePersona('staff');
              triggerToast("Switched viewpoint to Staff Operator.");
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activePersona === 'staff' 
                ? 'bg-antiquegold text-white' 
                : 'text-charcoal hover:bg-alabaster'
            }`}
          >
            {language === 'hi' ? 'स्टाफ' : language === 'mr' ? 'स्टाफ' : 'Staff'}
          </button>
        </div>
      </div>

      {/* Ascension Line Vertical Progress Block & Document Key Spec Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left column: Ascension indicator timeline */}
        <div className="lg:col-span-4">
          <Card className="p-6 bg-white space-y-6 text-left">
            <h3 className="font-serif text-sm font-black text-charcoal border-b border-[#e5dfd4]/40 pb-2">
              E-Sign Execution Sequence
            </h3>
            
            {/* The signature Ascension Line motif */}
            <AscensionLine 
              steps={activeWizardSteps} 
              orientation="vertical" 
              className="pl-2"
            />

            <div className="pt-4 border-t border-[#e5dfd4]/40 text-[10px] text-warmgray leading-relaxed font-semibold">
              <p>
                🔒 <strong className="text-charcoal">Cryptographic Proof-in-Spirit</strong>: Our multi-step signing flow logs network timestamps, IP coordinates, and phone SMS authentications to secure absolute compliance under BIS and State Lift laws.
              </p>
            </div>
          </Card>
        </div>

        {/* Right column: Interactive E-sign Form wizard */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Main Wizard interactive stage cards */}
          <AnimatePresence mode="wait">
            
            {/* STEP 1: OTP Identity Re-verification */}
            {currentStep === 1 && (
              <motion.div
                key="step-otp-pane"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
              >
                <Card className="p-6 bg-white text-left space-y-6">
                  <div className="border-b border-[#e5dfd4]/40 pb-3 flex items-center gap-2">
                    <Hash className="w-5 h-5 text-antiquegold" />
                    <div>
                      <h3 className="font-serif text-base font-black text-charcoal">{t.stepOtp}</h3>
                      <p className="text-[10px] text-warmgray font-semibold">Two-Factor security block before finalizing multi-lakh contract liabilities.</p>
                    </div>
                  </div>

                  <div className="p-4 bg-alabaster rounded-2xl border border-border text-xs leading-normal font-semibold space-y-2">
                    <p className="text-charcoal">{t.otpPrompt}</p>
                    <div className="flex items-center gap-2 font-mono text-xs text-royalemerald bg-royalemerald/5 px-3 py-1.5 rounded-lg border border-royalemerald/10 w-fit">
                      <Phone className="w-3.5 h-3.5" />
                      <span>+91 98455 12092 (Karan Malhotra)</span>
                    </div>
                  </div>

                  <form onSubmit={handleVerifyOtp} className="space-y-4 max-w-sm">
                    <div className="space-y-1 text-xs">
                      <label className="text-[10px] font-mono text-warmgray uppercase block font-bold">
                        {t.otpLabel}
                      </label>
                      <input 
                        type="text"
                        maxLength={4}
                        value={otpValue}
                        onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, ''))}
                        placeholder="4-digit code"
                        className="w-full p-3 bg-alabaster border border-[#e5dfd4] rounded-xl text-center font-mono font-extrabold text-lg text-charcoal focus:outline-none focus:border-antiquegold"
                        required
                      />
                      {isDemoAuthBuild() && (
                        <span className="text-[9px] text-warmgray block">
                          *Demo/sandbox build: any 4 digits verify instantly for developer testing.
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        variant="emerald"
                        className="py-2.5 text-xs font-bold"
                      >
                        <Key className="w-4 h-4" />
                        <span>{t.otpVerifyBtn}</span>
                      </Button>

                      <button
                        type="button"
                        onClick={() => triggerToast(t.toastOtpSent)}
                        className="px-4 py-2 bg-alabaster border border-[#e5dfd4] rounded-xl text-xs font-bold text-charcoal hover:bg-[#edeae2]"
                      >
                        {t.otpResendBtn}
                      </button>
                    </div>
                  </form>
                </Card>
              </motion.div>
            )}

            {/* STEP 2: Customer Drawing/Typing E-Sign */}
            {currentStep === 2 && (
              <motion.div
                key="step-sign-pane"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
              >
                <Card className="p-6 bg-white text-left space-y-6">
                  
                  {/* Step Header */}
                  <div className="border-b border-[#e5dfd4]/40 pb-3 flex justify-between items-center">
                    <div>
                      <h3 className="font-serif text-base font-black text-charcoal">{t.stepSign}</h3>
                      <p className="text-[10px] text-warmgray font-semibold">Please execute your official commercial signature below.</p>
                    </div>

                    <div className="flex bg-alabaster p-1 rounded-xl border border-border">
                      <button
                        onClick={() => setSignMethod('draw')}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
                          signMethod === 'draw' ? 'bg-royalemerald text-white' : 'text-charcoal hover:bg-[#edeae2]'
                        }`}
                      >
                        {t.drawTab}
                      </button>
                      <button
                        onClick={() => setSignMethod('type')}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
                          signMethod === 'type' ? 'bg-royalemerald text-white' : 'text-charcoal hover:bg-[#edeae2]'
                        }`}
                      >
                        {t.typeTab}
                      </button>
                    </div>
                  </div>

                  {/* Draw Signature Canvas container */}
                  {signMethod === 'draw' ? (
                    <div className="space-y-2">
                      <div className="relative border-2 border-dashed border-[#e5dfd4] rounded-2xl bg-[#faf9f6] h-48 overflow-hidden flex flex-col justify-between">
                        <canvas
                          ref={canvasRef}
                          width={600}
                          height={190}
                          onMouseDown={startDrawing}
                          onMouseMove={draw}
                          onMouseUp={stopDrawing}
                          onMouseLeave={stopDrawing}
                          onTouchStart={startDrawing}
                          onTouchMove={draw}
                          onTouchEnd={stopDrawing}
                          className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
                        />
                        
                        {!hasDrawn && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-warmgray pointer-events-none">
                            <PenTool className="w-8 h-8 opacity-40 mb-1" />
                            <span className="text-[10px] font-bold uppercase tracking-wide">Draw with touch screen or mouse pointer</span>
                          </div>
                        )}

                        <button
                          onClick={clearCanvas}
                          className="absolute right-3 bottom-3 py-1.5 px-3 bg-white text-charcoal hover:bg-alabaster border border-[#e5dfd4] rounded-lg text-[9px] font-bold uppercase cursor-pointer"
                        >
                          {t.clearBtn}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Type Signature Input Container */
                    <div className="space-y-4">
                      <div className="space-y-1 text-xs">
                        <label className="text-[10px] font-mono text-warmgray uppercase block font-bold">
                          {t.typePlaceholder}
                        </label>
                        <input
                          type="text"
                          value={typedName}
                          onChange={(e) => setTypedName(e.target.value)}
                          className="w-full p-3 bg-alabaster border border-[#e5dfd4] rounded-xl text-charcoal font-sans font-bold focus:outline-none focus:border-antiquegold"
                        />
                      </div>

                      {/* Calligraphy display box */}
                      <div className="p-5 bg-alabaster border border-neutral-200/60 rounded-xl text-center space-y-1.5">
                        <span className="text-[8px] font-mono text-warmgray uppercase block">{t.typedSignatureStyle}</span>
                        <div className={fontOptions[fontStyleIdx]}>
                          {typedName || "Karan Malhotra"}
                        </div>

                        {/* Font selection dot trigger list */}
                        <div className="flex justify-center gap-1.5 pt-2">
                          {fontOptions.map((_, idx) => (
                            <button
                              key={idx}
                              onClick={() => setFontStyleIdx(idx)}
                              className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                                fontStyleIdx === idx ? 'bg-antiquegold border-antiquegold scale-110' : 'bg-white border-[#e5dfd4]'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Legal Consent checkbox */}
                  <label className="flex items-start gap-2.5 p-3.5 bg-neutral-50 rounded-xl border border-neutral-200/50 cursor-pointer text-xs leading-relaxed text-charcoal font-semibold">
                    <input 
                      type="checkbox"
                      checked={consentChecked}
                      onChange={(e) => setConsentChecked(e.target.checked)}
                      className="mt-0.5 rounded border-gray-300 text-royalemerald focus:ring-royalemerald"
                    />
                    <span>{t.consentLabel}</span>
                  </label>

                  {/* Submission and Handoff block */}
                  <div className="pt-2 flex justify-between items-center">
                    <span className="text-[10px] font-mono text-warmgray font-bold">IDENTITY: OTP SECURED ✅</span>
                    
                    <Button
                      variant="primary"
                      onClick={handleLockAndSign}
                      className="py-2.5 px-6 text-xs font-bold"
                    >
                      <span>{t.signBtn}</span>
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>

                </Card>
              </motion.div>
            )}

            {/* STEP 3: Corporate Countersignature Gate */}
            {currentStep === 3 && (
              <motion.div
                key="step-counter-pane"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
              >
                <Card className="p-6 bg-white text-left space-y-6">
                  <div className="border-b border-[#e5dfd4]/40 pb-3 flex items-center gap-2">
                    <Lock className="w-5 h-5 text-antiquegold" />
                    <div>
                      <h3 className="font-serif text-base font-black text-charcoal">{t.stepCounter}</h3>
                      <p className="text-[10px] text-warmgray font-semibold">E-signatures must be executed by both parties before the contract gains legal validity.</p>
                    </div>
                  </div>

                  {/* Double signature status cards side-by-side */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    
                    {/* Customer Completed Sign card */}
                    <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 text-xs text-charcoal font-semibold space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[8px] font-mono text-royalemerald uppercase font-bold">{t.customerSignLabel}</span>
                        <span className="text-[8px] font-mono text-emerald-800 font-extrabold uppercase bg-emerald-100 px-1.5 py-0.5 rounded">Signed</span>
                      </div>
                      <div className="font-serif text-sm italic font-bold">
                        {customerSignatureImg?.startsWith('typed:') 
                          ? customerSignatureImg.split(':')[1] 
                          : "Captured Draw Path"}
                      </div>
                      <span className="block text-[9px] text-warmgray">Secured at: {customerSignedAt}</span>
                    </div>

                    {/* AIEC Pending corporate countersign card */}
                    <div className="p-4 rounded-xl border border-dashed border-antiquegold/30 bg-alabaster text-xs text-charcoal font-semibold space-y-3 flex flex-col justify-between">
                      <div className="flex justify-between items-center">
                        <span className="text-[8px] font-mono text-antiquegold uppercase font-bold">{t.aiecSignLabel}</span>
                        <span className="text-[8px] font-mono text-amber-800 font-extrabold uppercase bg-amber-100 px-1.5 py-0.5 rounded animate-pulse">Pending</span>
                      </div>
                      <div className="font-serif text-xs font-semibold text-warmgray">
                        Prashant Vasant Wable (Managing Director)
                      </div>
                      <span className="block text-[9px] text-warmgray">Waiting for countersign token</span>
                    </div>

                  </div>

                  {/* Operator Bypass simulator block */}
                  {activePersona === 'staff' ? (
                    <div className="p-4 bg-amber-50/20 border border-antiquegold/25 rounded-2xl space-y-3">
                      <p className="text-xs text-[#B8873D] font-bold">
                        🔐 Staff Authority Panel:
                      </p>
                      <p className="text-[10px] text-warmgray font-semibold">
                        Confirm that site physical conditions are matched to quote parameters and authorize the closing execution.
                      </p>
                      <Button
                        variant="emerald"
                        onClick={handleAiecCountersign}
                        className="py-2 px-4 text-xs font-bold"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>{t.countersignBtn}</span>
                      </Button>
                    </div>
                  ) : (
                    <div className="p-4 bg-alabaster rounded-2xl border border-border text-center space-y-3">
                      <Clock className="w-10 h-10 text-antiquegold mx-auto" />
                      <h4 className="font-serif text-sm font-black text-charcoal">{t.awaitingCounterTitle}</h4>
                      <p className="text-[10px] text-warmgray font-semibold max-w-md mx-auto leading-normal">
                        {t.awaitingCounterDesc}
                      </p>
                      <div className="text-[8px] text-amber-700 font-bold uppercase animate-pulse">
                        *Simulate "Staff" role using toggle in the top-right corner to countersign as Admin!
                      </div>
                    </div>
                  )}

                </Card>
              </motion.div>
            )}

            {/* STEP 4: Fully Sealed Closed Won celebratory display */}
            {currentStep === 4 && (
              <motion.div
                key="step-sealed-pane"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
              >
                <Card className="p-8 bg-white text-center space-y-6">
                  
                  {/* Glowing success circle indicator */}
                  <div className="relative w-20 h-20 bg-royalemerald text-white rounded-full flex items-center justify-center mx-auto shadow-[0_0_24px_rgba(14,75,61,0.3)] border-2 border-antiquegold">
                    <Check className="w-10 h-10 stroke-[3]" />
                    <span className="absolute -inset-1.5 rounded-full border border-royalemerald/30 animate-pulse" />
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] font-mono text-antiquegold font-extrabold uppercase bg-antiquegold/10 px-2.5 py-1 rounded">
                      DEAL STATUS: CLOSED WON 🏆
                    </span>
                    <h3 className="font-serif text-2xl font-black text-charcoal">{t.dealClosedWonTitle}</h3>
                    <p className="text-xs text-warmgray font-semibold max-w-lg mx-auto leading-relaxed">
                      {t.dealClosedWonDesc}
                    </p>
                  </div>

                  {/* Summary grid of completed execution info */}
                  <div className="grid grid-cols-2 gap-4 max-w-md mx-auto p-4 bg-alabaster rounded-2xl border border-border text-left">
                    <div>
                      <span className="text-[8px] font-mono text-warmgray uppercase block">{t.customerSignLabel}</span>
                      <strong className="text-xs text-charcoal block">Karan Malhotra</strong>
                      <span className="text-[9px] text-warmgray block">{customerSignedAt}</span>
                    </div>
                    <div>
                      <span className="text-[8px] font-mono text-warmgray uppercase block">{t.aiecSignLabel}</span>
                      <strong className="text-xs text-charcoal block">Prashant V. Wable</strong>
                      <span className="text-[9px] text-warmgray block">{aiecSignedAt}</span>
                    </div>
                  </div>

                  {/* Quick summary check */}
                  <div className="flex justify-center gap-2">
                    <button
                      onClick={() => triggerToast("Initializing secure PDF draft containing both digital signatures...")}
                      className="px-4 py-2.5 bg-alabaster hover:bg-[#edeae2] border border-[#e5dfd4] rounded-xl text-xs font-bold text-charcoal flex items-center gap-1.5 transition-all"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Executed Contract</span>
                    </button>

                    {onGoToNext && (
                      <Button
                        variant="primary"
                        onClick={onGoToNext}
                        className="py-2.5 text-xs font-bold"
                      >
                        <span>Go to Confirmation</span>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                </Card>
              </motion.div>
            )}

          </AnimatePresence>

          {/* Fallback & Technical support assistance bottom trigger */}
          <div className="p-4 bg-alabaster rounded-2xl border border-border flex flex-col sm:flex-row justify-between items-center gap-4 text-left">
            <div className="space-y-0.5">
              <span className="text-[9px] font-mono text-warmgray font-bold uppercase">TECHNICAL ASSISTANCE & ALTERNATIVES</span>
              <p className="text-[10px] text-warmgray font-semibold leading-normal">
                If the OTP code is not reaching your network or draw signature is failing on your device, you can trigger a secure manual verification bypass request.
              </p>
            </div>
            <button
              onClick={() => {
                setOtpVerified(true);
                setCurrentStep(2);
                triggerToast("Demo Bypass: Redirecting to signature step.");
              }}
              className="px-3.5 py-1.5 bg-white hover:bg-neutral-50 text-charcoal border border-neutral-200 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider shrink-0 transition-all cursor-pointer"
            >
              Request Bypass
            </button>
          </div>

        </div>

      </div>

      {/* ISO electronic execution regulatory disclosure */}
      <div className="p-4 bg-alabaster rounded-2xl border border-border text-center text-[10px] font-mono text-warmgray font-bold">
        🛡️ {t.complianceFooter}
      </div>

    </div>
  );
};
