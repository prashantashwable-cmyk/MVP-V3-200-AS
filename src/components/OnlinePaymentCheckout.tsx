import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CreditCard,
  Building,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  FileText,
  Lock,
  ChevronRight,
  XCircle,
  Copy,
  Download,
  Info,
  Check
} from 'lucide-react';
import { Card, Button, Badge } from './Common';
import { useLanguage } from '../lib/language';
import { DbManager } from '../lib/db';
import { User, Payment } from '../types';
import { bridgeLegacyPaymentConfirmed } from '../services/legacyCommercialBridge';

interface OnlinePaymentCheckoutProps {
  user: User;
  paymentId?: string; // Optional specific payment ID to pay
  onSuccess?: () => void;
  onNavigateToLoan?: () => void;
}

const localizations = {
  en: {
    title: "AIEC Digital Checkout",
    subtitle: "Secure 256-bit SSL encrypted stage payment portal for AIEC Elevator projects.",
    selectStage: "Select Payment Stage to Pay",
    stageAmountLabel: "Authoritative Stage Amount Due",
    paymentAlreadyCleared: "Payment Already Cleared!",
    paymentAlreadyClearedDesc: "This stage payment has already been recorded and verified. No further payment is required.",
    viewReceipt: "View / Download Official GST Receipt",
    chooseMethod: "Select Preferred Payment Method",
    methodUpi: "UPI Payment (PhonePe / Google Pay / Paytm)",
    methodUpiSub: "Instant 0% fee transfer via VPA or QR Code",
    methodCard: "Credit / Debit Card",
    methodCardSub: "Visa, Mastercard, RuPay & Corporate Cards",
    methodNetBanking: "Net Banking",
    methodNetBankingSub: "Instant RTGS/NEFT direct debit (HDFC, ICICI, SBI, Axis)",
    enterUpiId: "Enter UPI ID / VPA",
    upiPlaceholder: "e.g. mobile@upi or name@okaxis",
    cardNumberLabel: "Card Number",
    cardExpiryLabel: "Expiry (MM/YY)",
    cardCvvLabel: "CVV",
    cardNameLabel: "Cardholder Name",
    selectBankLabel: "Select Your Bank",
    payNowBtn: "Pay Securely Now",
    processingTitle: "Processing with Gateway...",
    processingSubtitle: "Connecting with bank servers. Please do not close or refresh this browser window.",
    successTitle: "Payment Successful & Verified!",
    successSubtitle: "Receipt generated. Stage payment status has been automatically updated across AIEC systems.",
    txnRefLabel: "Transaction Reference ID",
    downloadReceiptBtn: "Download GST Tax Invoice Receipt",
    failedTitle: "Payment Transaction Failed",
    failedSubtitle: "Your bank declined or timed out the transaction. No funds were debited.",
    retryBtn: "Retry Payment Safely",
    convertEmiBannerTitle: "Looking for Flexible Installments?",
    convertEmiBannerDesc: "Convert your elevator remaining balance into a low-interest EMI plan with zero processing delay.",
    applyEmiBtn: "Apply for Loan / EMI",
    securityGuarantee: "100% Encrypted & GST Compliant • Official AIEC Invoice Issued Automatically"
  },
  hi: {
    title: "एआईईसी डिजिटल चेकआउट",
    subtitle: "एआईईसी लिफ्ट परियोजनाओं के लिए सुरक्षित 256-बिट एसएसएल एन्क्रिप्टेड चरण भुगतान पोर्टल।",
    selectStage: "भुगतान करने के लिए चरण चुनें",
    stageAmountLabel: "प्रमाणित चरण देय राशि",
    paymentAlreadyCleared: "भुगतान पहले ही हो चुका है!",
    paymentAlreadyClearedDesc: "यह चरण भुगतान पहले ही दर्ज और सत्यापित किया जा चुका है। किसी और भुगतान की आवश्यकता नहीं है।",
    viewReceipt: "आधिकारिक जीएसटी रसीद देखें / डाउनलोड करें",
    chooseMethod: "पसंदीदा भुगतान विधि चुनें",
    methodUpi: "यूपीआई भुगतान (फोनपे / गूगल पे / पेटीएम)",
    methodUpiSub: "वीपीए या क्यूआर कोड के माध्यम से तत्काल शुल्क मुक्त ट्रांसफर",
    methodCard: "क्रेडिट / डेबिट कार्ड",
    methodCardSub: "वीजा, मास्टरकार्ड, रुपे और कॉर्पोरेट कार्ड",
    methodNetBanking: "नेट बैंकिंग",
    methodNetBankingSub: "तत्काल आरटीजीएस/एनईएफटी डायरेक्ट डेबिट (एचडीएफसी, आईसीआईसीआई, एसबीआई, एक्सिस)",
    enterUpiId: "यूपीआई आईडी / वीपीए दर्ज करें",
    upiPlaceholder: "जैसे mobile@upi या name@okaxis",
    cardNumberLabel: "कार्ड संख्या",
    cardExpiryLabel: "समाप्ति (एमएम/वाईवाई)",
    cardCvvLabel: "सीवीवी",
    cardNameLabel: "कार्डधारक का नाम",
    selectBankLabel: "अपना बैंक चुनें",
    payNowBtn: "अभी सुरक्षित भुगतान करें",
    processingTitle: "गेटवे के साथ प्रसंस्करण...",
    processingSubtitle: "बैंक सर्वर से जुड़ रहा है। कृपया इस विंडो को बंद या रिफ्रेश न करें।",
    successTitle: "भुगतान सफल और सत्यापित!",
    successSubtitle: "रसीद तैयार की गई। चरण भुगतान स्थिति एआईईसी सिस्टम पर स्वचालित रूप से अपडेट कर दी गई है।",
    txnRefLabel: "लेन-देन संदर्भ आईडी",
    downloadReceiptBtn: "जीएसटी टैक्स चालान रसीद डाउनलोड करें",
    failedTitle: "भुगतान लेन-देन विफल",
    failedSubtitle: "आपके बैंक ने लेन-देन को अस्वीकार कर दिया या समय समाप्त हो गया। कोई धनराशि नहीं काटी गई।",
    retryBtn: "सुरक्षित रूप से पुन: प्रयास करें",
    convertEmiBannerTitle: "लचीली किश्तों की तलाश है?",
    convertEmiBannerDesc: "शून्य प्रसंस्करण देरी के साथ अपनी शेष राशि को कम ब्याज वाले ईएमआई प्लान में बदलें।",
    applyEmiBtn: "ऋण / ईएमआई के लिए आवेदन करें",
    securityGuarantee: "100% एन्क्रिप्टेड और जीएसटी अनुपालन • आधिकारिक एआईईसी चालान स्वचालित रूप से जारी"
  },
  mr: {
    title: "एआयईसी डिजिटल चेकआउट",
    subtitle: "एआयईसी लिफ्ट प्रकल्पांसाठी सुरक्षित २५६-बिट एसएसएल एनक्रिप्टेड टप्पा पेमेंट पोर्टल.",
    selectStage: "भरण्यासाठी टप्पा निवडा",
    stageAmountLabel: "प्रमाणित टप्पा देय रक्कम",
    paymentAlreadyCleared: "पेमेंट आधीच पूर्ण झाले आहे!",
    paymentAlreadyClearedDesc: "हे टप्पा पेमेंट आधीच नोंदवले आणि पडताळले गेले आहे. अधिक पेमेंटची गरज नाही.",
    viewReceipt: "अधिकृत जीएसटी पावती पाहा / डाउनलोड करा",
    chooseMethod: "पसंतीची पेमेंट पद्धत निवडा",
    methodUpi: "यूपीआय पेमेंट (फोनपे / गुगल पे / पेटीएम)",
    methodUpiSub: "व्हीपीए किंवा क्यूआर कोडद्वारे तत्काळ ०% फी ट्रान्सफर",
    methodCard: "क्रेडिट / डेबिट कार्ड",
    methodCardSub: "व्हिसा, मास्टरकार्ड, रुपे आणि कॉर्पोरेट कार्ड",
    methodNetBanking: "नेट बँकिंग",
    methodNetBankingSub: "तत्काळ थेट बँकिंग (एचडीएफसी, आयसीआयसीआय, एसबीआय, ॲक्सिस)",
    enterUpiId: "यूपीआय आयडी / व्हीपीए प्रविष्ट करा",
    upiPlaceholder: "उदा. mobile@upi किंवा name@okaxis",
    cardNumberLabel: "कार्ड क्रमांक",
    cardExpiryLabel: "मुदत (MM/YY)",
    cardCvvLabel: "सीव्हिव्ही",
    cardNameLabel: "कार्डधारकाचे नाव",
    selectBankLabel: "तुमची बँक निवडा",
    payNowBtn: "आता सुरक्षित पेमेंट करा",
    processingTitle: "गेटवेद्वारे प्रक्रिया सुरू आहे...",
    processingSubtitle: "बँक सर्व्हरशी जोडणी होत आहे. कृपया ही विंडो बंद किंवा रिफ्रेश करू नका.",
    successTitle: "पेमेंट यशस्वी व पडताळलेले!",
    successSubtitle: "पावती तयार झाली. टप्पा पेमेंट स्थिती एआयईसी सिस्टीमवर स्वयंचलितपणे अपडेट झाली आहे.",
    txnRefLabel: "व्यवहार संदर्भ आयडी",
    downloadReceiptBtn: "जीएसटी कर पावती डाउनलोड करा",
    failedTitle: "पेमेंट व्यवहार अयशस्वी",
    failedSubtitle: "तुमच्या बँकेने व्यवहार नाकारला किंवा वेळ संपली. पैसे कापले गेले नाहीत.",
    retryBtn: "सुरक्षितपणे पुन्हा प्रयत्न करा",
    convertEmiBannerTitle: "हप्त्यांची सोय हवी आहे का?",
    convertEmiBannerDesc: "तुमची शिल्लक रक्कम कमी व्याजाच्या ईएमआय योजनेत बदला.",
    applyEmiBtn: "कर्ज / ईएमआय साठी अर्ज करा",
    securityGuarantee: "१००% सुरक्षित आणि जीएसटी सुसंगत • अधिकृत एआयईसी पावती स्वयंचलितपणे तयार"
  }
};

export const OnlinePaymentCheckout: React.FC<OnlinePaymentCheckoutProps> = ({
  user,
  paymentId,
  onSuccess,
  onNavigateToLoan
}) => {
  const { language } = useLanguage();
  const t = localizations[language as keyof typeof localizations] || localizations.en;

  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'Card' | 'NetBanking'>('UPI');

  // Form inputs
  const [upiId, setUpiId] = useState<string>('');
  const [cardNumber, setCardNumber] = useState<string>('');
  const [cardExpiry, setCardExpiry] = useState<string>('');
  const [cardCvv, setCardCvv] = useState<string>('');
  const [cardName, setCardName] = useState<string>('');
  const [selectedBank, setSelectedBank] = useState<string>('HDFC');

  // State flow: 'idle' | 'processing' | 'success' | 'failed'
  const [checkoutState, setCheckoutState] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');
  const [lastTxnRef, setLastTxnRef] = useState<string>('');
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);

  const loadData = () => {
    const list = DbManager.getPayments();
    setPayments(list);
    
    if (paymentId) {
      const match = list.find(p => p.id === paymentId);
      if (match) setSelectedPayment(match);
      else if (list.length > 0) setSelectedPayment(list.find(p => p.status !== 'paid') || list[0]);
    } else if (list.length > 0) {
      const unpaid = list.find(p => p.status !== 'paid');
      setSelectedPayment(unpaid || list[0]);
    }
  };

  useEffect(() => {
    loadData();
  }, [paymentId]);

  const handleStartPay = () => {
    if (!selectedPayment) return;
    setCheckoutState('processing');

    // Simulate Gateway Response
    setTimeout(() => {
      // 90% success rate simulation
      const isOk = Math.random() < 0.95;
      if (isOk) {
        const generatedTxnRef = `PG-AIEC-${Math.floor(10000000 + Math.random() * 90000000)}`;
        setLastTxnRef(generatedTxnRef);

        // Authoritative update server-side / DbManager
        const updatedPayment: Payment = {
          ...selectedPayment,
          status: 'paid',
          paidAmount: selectedPayment.amount,
          paidAt: new Date().toISOString(),
          paymentMethod: paymentMethod === 'UPI' ? 'UPI' : paymentMethod === 'Card' ? 'Gateway' : 'Bank Transfer',
          referenceNo: generatedTxnRef,
          isDisputed: false,
          isPaused: false
        };

        DbManager.updatePayment(updatedPayment);
        setSelectedPayment(updatedPayment);
        setCheckoutState('success');

        // Phase 15: bridge this confirmed payment into the real canonical
        // Project/PaymentSchedule/Payment graph (audited, idempotent,
        // event-driven) in addition to the DbManager write above, which
        // remains authoritative for this screen's own rendering. Never
        // blocks the UI and never throws — see legacyCommercialBridge.ts.
        bridgeLegacyPaymentConfirmed(
          { id: user.id, role: user.role, isDemo: user.isDemo, authMethod: user.authMethod },
          updatedPayment,
        ).then(result => {
          if (!result.bridged) {
            console.warn(`[Phase 15 bridge] payment ${updatedPayment.id} not mirrored to canonical model: ${result.reason}`);
          }
        });

        if (onSuccess) onSuccess();
      } else {
        setCheckoutState('failed');
      }
    }, 2500);
  };

  return (
    <div className="space-y-6 pb-24 max-w-4xl mx-auto px-2 sm:px-4">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-[rgba(184,135,61,0.15)] shadow-diffuse space-y-2 text-center md:text-left">
        <div className="flex items-center justify-center md:justify-start gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider bg-antiquegold/10 text-antiquegold border border-antiquegold/20">
            MODULE 9 • ONLINE CHECKOUT
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider bg-royalemerald/10 text-royalemerald border border-royalemerald/20">
            SSL 256-BIT ENCRYPTED
          </span>
        </div>
        <h1 className="font-serif text-2xl font-bold text-charcoal flex items-center justify-center md:justify-start gap-2">
          <Lock className="w-6 h-6 text-emerald-700" />
          {t.title}
        </h1>
        <p className="text-xs text-warmgray max-w-2xl">
          {t.subtitle}
        </p>
      </div>

      {/* Stage Selector Dropdown */}
      <Card className="p-5 space-y-3">
        <label className="text-xs font-mono font-bold text-warmgray uppercase block">
          {t.selectStage}
        </label>
        <select
          value={selectedPayment?.id || ''}
          onChange={e => {
            const p = payments.find(item => item.id === e.target.value);
            if (p) {
              setSelectedPayment(p);
              setCheckoutState('idle');
            }
          }}
          className="w-full bg-alabaster border border-[#e6dfd4] rounded-2xl px-4 py-3 text-sm font-bold text-charcoal outline-none focus:ring-2 focus:ring-antiquegold cursor-pointer"
        >
          {payments.map(p => (
            <option key={p.id} value={p.id}>
              {p.dealId} • {p.stage} — ₹{p.amount.toLocaleString('en-IN')} ({p.status.toUpperCase()})
            </option>
          ))}
        </select>

        {selectedPayment && (
          <div className="p-4 bg-gradient-to-r from-alabaster via-white to-alabaster rounded-2xl border border-[rgba(184,135,61,0.15)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-mono text-warmgray uppercase block">{t.stageAmountLabel}</span>
              <span className="font-mono text-2xl font-black text-royalemerald">
                ₹ {selectedPayment.amount.toLocaleString('en-IN')}
              </span>
              <p className="text-xs text-warmgray mt-0.5">
                Site: <strong>{selectedPayment.siteName || 'Kothrud, Pune'}</strong> • Due: <strong>{selectedPayment.dueDate}</strong>
              </p>
            </div>

            <div>
              {selectedPayment.status === 'paid' ? (
                <Badge variant="emerald" className="text-xs px-3 py-1">
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  PAID IN FULL
                </Badge>
              ) : selectedPayment.status === 'partial' ? (
                <Badge variant="warning" className="text-xs px-3 py-1">
                  PARTIAL (₹{(selectedPayment.paidAmount || 0).toLocaleString('en-IN')} paid)
                </Badge>
              ) : (
                <Badge variant="neutral" className="text-xs px-3 py-1">
                  UNPAID / DUE
                </Badge>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Already Paid Block */}
      {selectedPayment?.status === 'paid' ? (
        <Card className="p-8 text-center space-y-4 bg-emerald-50/50 border border-emerald-200">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="font-serif text-lg font-bold text-emerald-900">{t.paymentAlreadyCleared}</h3>
            <p className="text-xs text-emerald-800 max-w-md mx-auto">{t.paymentAlreadyClearedDesc}</p>
          </div>
          <div className="pt-2">
            <Button
              variant="primary"
              onClick={() => setShowReceiptModal(true)}
              className="bg-emerald-800 text-white text-xs px-5 py-2.5 inline-flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              {t.viewReceipt}
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* Main Checkout Options & Form */}
          {checkoutState === 'idle' && selectedPayment && (
            <div className="space-y-6">
              {/* Payment Method Tabs */}
              <Card className="p-5 space-y-4">
                <h3 className="font-serif text-base font-bold text-charcoal">{t.chooseMethod}</h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* UPI */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('UPI')}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      paymentMethod === 'UPI'
                        ? 'bg-emerald-50/60 border-emerald-600 ring-2 ring-emerald-500/20'
                        : 'bg-white border-[#e6dfd4] hover:bg-alabaster'
                    }`}
                  >
                    <Smartphone className={`w-6 h-6 mb-2 ${paymentMethod === 'UPI' ? 'text-emerald-700' : 'text-warmgray'}`} />
                    <span className="font-bold text-xs text-charcoal block">{t.methodUpi}</span>
                    <span className="text-[10px] text-warmgray block mt-0.5">{t.methodUpiSub}</span>
                  </button>

                  {/* Cards */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('Card')}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      paymentMethod === 'Card'
                        ? 'bg-emerald-50/60 border-emerald-600 ring-2 ring-emerald-500/20'
                        : 'bg-white border-[#e6dfd4] hover:bg-alabaster'
                    }`}
                  >
                    <CreditCard className={`w-6 h-6 mb-2 ${paymentMethod === 'Card' ? 'text-emerald-700' : 'text-warmgray'}`} />
                    <span className="font-bold text-xs text-charcoal block">{t.methodCard}</span>
                    <span className="text-[10px] text-warmgray block mt-0.5">{t.methodCardSub}</span>
                  </button>

                  {/* Net Banking */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('NetBanking')}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      paymentMethod === 'NetBanking'
                        ? 'bg-emerald-50/60 border-emerald-600 ring-2 ring-emerald-500/20'
                        : 'bg-white border-[#e6dfd4] hover:bg-alabaster'
                    }`}
                  >
                    <Building className={`w-6 h-6 mb-2 ${paymentMethod === 'NetBanking' ? 'text-emerald-700' : 'text-warmgray'}`} />
                    <span className="font-bold text-xs text-charcoal block">{t.methodNetBanking}</span>
                    <span className="text-[10px] text-warmgray block mt-0.5">{t.methodNetBankingSub}</span>
                  </button>
                </div>

                {/* Form Fields according to selected method */}
                <div className="pt-2 border-t border-[#e6dfd4] space-y-4">
                  {paymentMethod === 'UPI' && (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono font-bold text-warmgray uppercase block">
                          {t.enterUpiId}
                        </label>
                        <input
                          type="text"
                          value={upiId}
                          onChange={e => setUpiId(e.target.value)}
                          placeholder={t.upiPlaceholder}
                          className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl px-4 py-2.5 text-xs font-mono font-bold text-charcoal outline-none focus:ring-2 focus:ring-antiquegold"
                        />
                      </div>
                      <div className="p-3 bg-alabaster rounded-xl text-[11px] text-warmgray flex items-center gap-2">
                        <Info className="w-4 h-4 text-antiquegold shrink-0" />
                        <span>Instant notification collect request will be pushed to your GPay / PhonePe / Paytm app.</span>
                      </div>
                    </div>
                  )}

                  {paymentMethod === 'Card' && (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono font-bold text-warmgray uppercase block">{t.cardNumberLabel}</label>
                        <input
                          type="text"
                          value={cardNumber}
                          onChange={e => setCardNumber(e.target.value)}
                          placeholder="4532 •••• •••• 8812"
                          className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl px-4 py-2.5 text-xs font-mono font-bold text-charcoal outline-none focus:ring-2 focus:ring-antiquegold"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono font-bold text-warmgray uppercase block">{t.cardExpiryLabel}</label>
                          <input
                            type="text"
                            value={cardExpiry}
                            onChange={e => setCardExpiry(e.target.value)}
                            placeholder="12/28"
                            className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl px-4 py-2.5 text-xs font-mono font-bold text-charcoal outline-none focus:ring-2 focus:ring-antiquegold"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono font-bold text-warmgray uppercase block">{t.cardCvvLabel}</label>
                          <input
                            type="password"
                            maxLength={4}
                            value={cardCvv}
                            onChange={e => setCardCvv(e.target.value)}
                            placeholder="•••"
                            className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl px-4 py-2.5 text-xs font-mono font-bold text-charcoal outline-none focus:ring-2 focus:ring-antiquegold"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-mono font-bold text-warmgray uppercase block">{t.cardNameLabel}</label>
                        <input
                          type="text"
                          value={cardName}
                          onChange={e => setCardName(e.target.value)}
                          placeholder="Name as printed on card"
                          className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl px-4 py-2.5 text-xs font-bold text-charcoal outline-none focus:ring-2 focus:ring-antiquegold"
                        />
                      </div>
                    </div>
                  )}

                  {paymentMethod === 'NetBanking' && (
                    <div className="space-y-3">
                      <label className="text-[10px] font-mono font-bold text-warmgray uppercase block">{t.selectBankLabel}</label>
                      <select
                        value={selectedBank}
                        onChange={e => setSelectedBank(e.target.value)}
                        className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl px-4 py-2.5 text-xs font-bold text-charcoal outline-none focus:ring-2 focus:ring-antiquegold cursor-pointer"
                      >
                        <option value="HDFC">HDFC Bank Commercial Portal</option>
                        <option value="ICICI">ICICI Bank Corporate & Retail</option>
                        <option value="SBI">State Bank of India (SBI)</option>
                        <option value="AXIS">Axis Bank Corporate Internet Banking</option>
                        <option value="KOTAK">Kotak Mahindra Bank</option>
                      </select>
                    </div>
                  )}
                </div>

                <div className="pt-3 flex flex-col items-center gap-3">
                  <Button
                    variant="primary"
                    onClick={handleStartPay}
                    className="w-full py-3.5 bg-royalemerald hover:bg-emerald-900 text-white font-serif font-bold text-base shadow-md flex items-center justify-center gap-2"
                  >
                    <Lock className="w-4 h-4 text-emerald-300" />
                    <span>{t.payNowBtn} (₹{selectedPayment.amount.toLocaleString('en-IN')})</span>
                  </Button>

                  <p className="text-[10px] text-warmgray text-center font-mono">
                    {t.securityGuarantee}
                  </p>
                </div>
              </Card>

              {/* Conversion to EMI Banner */}
              {onNavigateToLoan && (
                <Card className="p-5 bg-gradient-to-r from-antiquegold/10 via-white to-antiquegold/10 border border-antiquegold/30 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1 text-center sm:text-left">
                    <h4 className="font-serif font-bold text-sm text-charcoal">{t.convertEmiBannerTitle}</h4>
                    <p className="text-xs text-warmgray max-w-md">{t.convertEmiBannerDesc}</p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={onNavigateToLoan}
                    className="text-xs bg-white text-antiquegold border-antiquegold hover:bg-antiquegold/10 shrink-0 flex items-center gap-1.5"
                  >
                    <span>{t.applyEmiBtn}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </Card>
              )}
            </div>
          )}

          {/* Processing State */}
          {checkoutState === 'processing' && (
            <Card className="p-12 text-center space-y-6 bg-white border border-antiquegold/30">
              <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-antiquegold/20 border-t-antiquegold animate-spin" />
                <Lock className="w-6 h-6 text-royalemerald" />
              </div>
              <div className="space-y-2">
                <h3 className="font-serif text-lg font-bold text-charcoal">{t.processingTitle}</h3>
                <p className="text-xs text-warmgray max-w-md mx-auto">{t.processingSubtitle}</p>
              </div>
            </Card>
          )}

          {/* Success State */}
          {checkoutState === 'success' && (
            <Card className="p-8 text-center space-y-6 bg-emerald-50/50 border border-emerald-300">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div className="space-y-1">
                <h3 className="font-serif text-xl font-bold text-emerald-950">{t.successTitle}</h3>
                <p className="text-xs text-emerald-800 max-w-md mx-auto">{t.successSubtitle}</p>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-emerald-200 inline-block text-left font-mono text-xs space-y-1">
                <p><span className="text-warmgray">TXN REF:</span> <strong>{lastTxnRef}</strong></p>
                <p><span className="text-warmgray">STAGE:</span> <strong>{selectedPayment?.stage}</strong></p>
                <p><span className="text-warmgray">AMOUNT:</span> <strong>₹{selectedPayment?.amount.toLocaleString('en-IN')}</strong></p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button
                  variant="primary"
                  onClick={() => setShowReceiptModal(true)}
                  className="bg-emerald-800 hover:bg-emerald-900 text-white text-xs px-5 py-2.5 flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  {t.downloadReceiptBtn}
                </Button>
              </div>
            </Card>
          )}

          {/* Failed State */}
          {checkoutState === 'failed' && (
            <Card className="p-8 text-center space-y-6 bg-red-50/50 border border-red-200">
              <div className="w-16 h-16 bg-red-100 text-red-700 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                <XCircle className="w-10 h-10" />
              </div>

              <div className="space-y-1">
                <h3 className="font-serif text-xl font-bold text-red-950">{t.failedTitle}</h3>
                <p className="text-xs text-red-800 max-w-md mx-auto">{t.failedSubtitle}</p>
              </div>

              <div>
                <Button
                  variant="primary"
                  onClick={() => setCheckoutState('idle')}
                  className="bg-red-700 hover:bg-red-800 text-white text-xs px-6 py-2.5"
                >
                  {t.retryBtn}
                </Button>
              </div>
            </Card>
          )}
        </>
      )}

      {/* RECEIPT MODAL */}
      <AnimatePresence>
        {showReceiptModal && selectedPayment && (
          <div className="fixed inset-0 z-50 bg-charcoal/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white max-w-md w-full rounded-3xl p-6 space-y-4 border border-[rgba(184,135,61,0.2)] shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-[#e6dfd4] pb-3">
                <h3 className="font-serif text-base font-bold text-charcoal flex items-center gap-2">
                  <FileText className="w-5 h-5 text-emerald-700" />
                  Official Tax Invoice Receipt
                </h3>
                <button onClick={() => setShowReceiptModal(false)} className="text-warmgray hover:text-charcoal p-1">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 font-mono text-xs bg-alabaster p-4 rounded-2xl border border-[#e6dfd4]">
                <div className="text-center border-b border-[#e6dfd4] pb-2 space-y-0.5">
                  <p className="font-bold text-royalemerald">ALL INDIA ELEVATORS COMPANY (AIEC)</p>
                  <p className="text-[10px] text-warmgray">GSTIN: 27AABCA1234F1ZM • Pune Maharashtra</p>
                </div>

                <div className="space-y-1 pt-1 text-[11px]">
                  <p><span className="text-warmgray">RECEIPT NO:</span> {lastTxnRef || selectedPayment.referenceNo || 'RCP-88129'}</p>
                  <p><span className="text-warmgray">DEAL REF:</span> {selectedPayment.dealId}</p>
                  <p><span className="text-warmgray">STAGE:</span> {selectedPayment.stage}</p>
                  <p><span className="text-warmgray">DATE:</span> {new Date().toLocaleDateString()}</p>
                  <p><span className="text-warmgray">METHOD:</span> {selectedPayment.paymentMethod || 'Gateway'}</p>
                </div>

                <div className="border-t border-b border-[#e6dfd4] py-2 flex justify-between text-sm font-bold text-charcoal">
                  <span>TOTAL PAID:</span>
                  <span className="text-emerald-800">₹ {selectedPayment.amount.toLocaleString('en-IN')}</span>
                </div>

                <p className="text-[9px] text-center text-warmgray italic">
                  This is a computer-generated tax invoice receipt for elevator project milestone clearance.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-[#e6dfd4]">
                <Button
                  variant="secondary"
                  onClick={() => setShowReceiptModal(false)}
                  className="flex-1 text-xs"
                >
                  Close
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    alert("Receipt PDF downloaded to device storage.");
                    setShowReceiptModal(false);
                  }}
                  className="flex-1 text-xs bg-emerald-800 text-white flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download PDF
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
