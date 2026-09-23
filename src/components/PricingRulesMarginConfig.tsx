import React, { useState, useMemo } from 'react';
import { 
  Sliders, Landmark, Info, AlertTriangle, ShieldCheck, CheckCircle2, 
  HelpCircle, RefreshCw, Plus, Trash2, Edit3, Save, Calendar, Clock,
  ArrowRight, ShieldAlert, Cpu
} from 'lucide-react';
import { Card, Button, Badge } from './Common';
import { useLanguage } from '../lib/language';

interface DrivePricingRule {
  driveType: string;
  basePrice: number;
  perFloorIncrementPct: number;
  minCapacityKg: number;
}

interface AMCTier {
  name: string;
  monthlyRate: number;
  visitsPerYear: number;
  includesSpares: boolean;
  description: string;
}

export const PricingRulesMarginConfig: React.FC<{
  user: any;
}> = ({ user }) => {
  const { language } = useLanguage();
  const [toastMsg, setToastMsg] = useState('');
  
  // Base pricing states
  const [driveRules, setDriveRules] = useState<DrivePricingRule[]>([
    {
      driveType: 'VVVF Geared Traction',
      basePrice: 850000,
      perFloorIncrementPct: 12,
      minCapacityKg: 400
    },
    {
      driveType: 'VVVF Gearless Roomless (MRL)',
      basePrice: 1350000,
      perFloorIncrementPct: 15,
      minCapacityKg: 540
    },
    {
      driveType: 'Hydraulic Compact Suite',
      basePrice: 950000,
      perFloorIncrementPct: 18,
      minCapacityKg: 300
    }
  ]);

  // Minimum margin floor setting
  const [marginFloorPct, setMarginFloorPct] = useState<number>(15);

  // Active GST rate (standard is 18% in India for elevators)
  const [gstRatePct, setGstRatePct] = useState<number>(18);
  
  // Future dated GST rate change
  const [scheduledGstEnabled, setScheduledGstEnabled] = useState<boolean>(false);
  const [scheduledGstRate, setScheduledGstRate] = useState<number>(18);
  const [scheduledGstDate, setScheduledGstDate] = useState<string>('2026-10-01');

  // AMC Tiers state
  const [amcTiers, setAmcTiers] = useState<AMCTier[]>([
    {
      name: 'Ascension Standard Shield',
      monthlyRate: 3500,
      visitsPerYear: 12,
      includesSpares: false,
      description: 'Monthly lubrication, routine brake safety tests, and 24/7 call-out dispatch.'
    },
    {
      name: 'Ascension Golden Armour',
      monthlyRate: 6500,
      visitsPerYear: 12,
      includesSpares: true,
      description: 'Comprehensive maintenance covering standard VVVF parts and inverter replacements.'
    }
  ]);

  // Editing state for new entries
  const [newAMCTierName, setNewAMCTierName] = useState('');
  const [newAMCRate, setNewAMCRate] = useState(4000);

  const t = useMemo(() => {
    const translations = {
      en: {
        title: "Pricing Rules & Margin Configuration",
        subtitle: "Establish raw material cost baseline thresholds, set rigid margin floor guardrails, and configure official state tax schedules.",
        badgeTitle: "ROOT PRICING CONFIGURATOR • MODULE 7 OF 20",
        driveTable: "Base Pricing by Drive Type Mechanics",
        driveType: "Drive Propulsion Type",
        basePrice: "Base Price (₹)",
        increment: "Additional Floor Increment (%)",
        marginFloorTitle: "Strategic Minimum Margin Guardrail Floor",
        marginFloorDesc: "Enforce a strict bottom-line limit for all digital quotation outputs. System locks out any discount going below this limit without senior executive override.",
        gstTitle: "State GST Levy Configuration",
        gstDesc: "GST is federally mandated and kept isolated from pricing strategy considerations.",
        scheduledChange: "Support Future GST Rate Adjustment Schedules",
        amcTitle: "Annual Maintenance Contract (AMC) Tiers",
        amcDesc: "Configure lifetime service packages. AMC represents long-term high-margin recurring business.",
        saveSuccess: "Root configuration parameters updated successfully! Changes apply exclusively to brand new quotations generated from this point forward.",
        riskWarning: "Redline Action: Setting the margin floor below 10.0% is highly destructive to the company's financial model and risk limits.",
        errorFloorLimit: "Configuration Blocked: Minimum margin floor cannot be zero or negative. A zero risk business model requires positive margins.",
        amcAddBtn: "Add Custodian AMC Tier"
      },
      hi: {
        title: "मूल्य निर्धारण नियम और मार्जिन कॉन्फ़िगरेशन",
        subtitle: "कच्चे माल की लागत सीमाएं स्थापित करें, कड़े मार्जिन फ्लोर सुरक्षा नियम निर्धारित करें और कर कार्यक्रम कॉन्फ़िगर करें।",
        badgeTitle: "रूट मूल्य निर्धारण विन्यासकर्ता • मॉड्यूल 7 का 20",
        driveTable: "ड्राइव प्रकार के अनुसार मूल मूल्य निर्धारण",
        driveType: "ड्राइव प्रकार",
        basePrice: "मूल्य (₹)",
        increment: "अतिरिक्त मंजिल वृद्धि (%)",
        marginFloorTitle: "न्यूनतम सुरक्षा मार्जिन सीमा",
        marginFloorDesc: "सभी डिजिटल कोटेशन आउटपुट के लिए एक सख्त न्यूनतम सीमा लागू करें।",
        gstTitle: "राज्य जीएसटी लेवी कॉन्फ़िगरेशन",
        gstDesc: "जीएसटी संघ द्वारा अनिवार्य है और इसे मूल्य निर्धारण रणनीति से अलग रखा गया है।",
        scheduledChange: "भविष्य की जीएसटी दर समायोजन कार्यक्रम का समर्थन करें",
        amcTitle: "वार्षिक रखरखाव अनुबंध (AMC) स्तर",
        amcDesc: "जीवनकाल सेवा पैकेजों को कॉन्फ़िगर करें। एएमसी दीर्घकालिक आवर्ती व्यापार का प्रतिनिधित्व करता है।",
        saveSuccess: "कॉन्फ़िगरेशन पैरामीटर सफलतापूर्वक अपडेट किए गए!",
        riskWarning: "रेडलाइन कार्रवाई: मार्जिन फ्लोर को 10.0% से नीचे सेट करना कंपनी के वित्तीय मॉडल के लिए जोखिम भरा है।",
        errorFloorLimit: "कॉन्फ़िगरेशन अवरुद्ध: न्यूनतम मार्जिन फ्लोर शून्य या नकारात्मक नहीं हो सकता।",
        amcAddBtn: "नया एएमसी स्तर जोड़ें"
      },
      mr: {
        title: "किंमत नियम आणि नफा मार्जिन रचना",
        subtitle: "लिफ्टच्या विविध प्रकारांचे मूळ दर निश्चित करा, नफ्याची अंतिम मर्यादा (Margin Floor) आणि सरकारी जीएसटी दर नियंत्रित करा.",
        badgeTitle: "किंमत रचना केंद्र • मॉड्युल ७ ऑफ २०",
        driveTable: "लिफ्ट प्रकारानुसार मूळ दर",
        driveType: "लिफ्ट ड्राईव्ह प्रकार (Drive Type)",
        basePrice: "मूळ किंमत (₹)",
        increment: "प्रति जादा मजला वाढ दर (%)",
        marginFloorTitle: "नफ्याची अंतिम मर्यादा (Margin Floor Guardrail)",
        marginFloorDesc: "विक्रेत्यांना ग्राहकाला द्यायच्या सवलतीची कमाल मर्यादा इथे निश्चित करा. या मर्यादेपेक्षा कमी नफा असल्यास सिस्टम कोट लॉक करते.",
        gstTitle: "सरकारी जीएसटी (GST) दर रचना",
        gstDesc: "जीएसटी हा शासकीय कर असून तो कंपनीच्या निव्वळ उत्पन्नाचा भाग म्हणून मोजला जात नाही.",
        scheduledChange: "भविष्यातील जीएसटी दरामधील बदल आधीच नोंदवून ठेवा",
        amcTitle: "वार्षिक देखभाल कंत्राट (AMC) योजना",
        amcDesc: "मंजूर केलेल्या सेवा योजना व्यवस्थापित करा. लिफ्ट विकल्यानंतरचे कंत्राट दीर्घकालीन फायद्याचे असते.",
        saveSuccess: "मूल्य रचना यशस्वीरित्या जतन झाली! हे बदल पुढील नवीन कोटेशनसाठी लागू होतील.",
        riskWarning: "धोकादायक कृती: नफ्याची मर्यादा १०% पेक्षा कमी ठेवल्यास कंपनीला आर्थिक तोटा होऊ शकतो.",
        errorFloorLimit: "रचना नाकारली: नफ्याची किमान मर्यादा शून्य किंवा त्यापेक्षा कमी ठेवता येणार नाही.",
        amcAddBtn: "नवीन योजना समाविष्ट करा"
      }
    };
    return translations[language] || translations.en;
  }, [language]);

  const handleUpdateDriveRule = (index: number, field: keyof DrivePricingRule, value: any) => {
    setDriveRules(prev => prev.map((rule, idx) => {
      if (idx === index) {
        return {
          ...rule,
          [field]: value
        };
      }
      return rule;
    }));
  };

  const handleSaveConfig = () => {
    if (marginFloorPct <= 0) {
      handleTriggerToast(t.errorFloorLimit);
      return;
    }
    handleTriggerToast(t.saveSuccess);
  };

  const handleAddAMCTier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAMCTierName.trim()) return;

    const newTier: AMCTier = {
      name: newAMCTierName,
      monthlyRate: newAMCRate,
      visitsPerYear: 12,
      includesSpares: true,
      description: 'Custom added lifetime tier covering standard service cycles.'
    };

    setAmcTiers(prev => [...prev, newTier]);
    setNewAMCTierName('');
    handleTriggerToast("New AMC tier successfully added to system database.");
  };

  const handleDeleteAMCTier = (name: string) => {
    // Phase 36 — LEVEL 4 (irreversible): deleting an AMC pricing tier
    // (affects future quotes/pricing configuration) had no confirmation
    // of any kind before this fix.
    if (!window.confirm(`Delete the "${name}" AMC service tier? This affects future quotes and cannot be undone.`)) {
      return;
    }
    setAmcTiers(prev => prev.filter(t => t.name !== name));
    handleTriggerToast("AMC Service tier successfully removed.");
  };

  const handleTriggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4500);
  };

  return (
    <div className="space-y-6 pb-16">
      
      {/* Toast Banner */}
      {toastMsg && (
        <div className="fixed top-6 right-6 z-50 bg-[#0E4B3D] text-white text-xs font-bold px-4 py-3 rounded-xl shadow-lg border border-antiquegold/30 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-white" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Double Progress Bars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-4 rounded-2xl border border-[rgba(184,135,61,0.15)]">
        <div>
          <div className="flex justify-between text-[10px] font-mono font-bold text-charcoal mb-1">
            <span>Auto-Quotation Engine Progress (Screen 10 of 10)</span>
            <span>100.0%</span>
          </div>
          <div className="h-2.5 bg-alabaster rounded-full overflow-hidden border border-[#e5dfd4]">
            <div className="h-full bg-royalemerald rounded-full" style={{ width: '100%' }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[10px] font-mono font-bold text-charcoal mb-1">
            <span>Overall Platform Build Progress (Screen 70 of 200)</span>
            <span>35.0%</span>
          </div>
          <div className="h-2.5 bg-alabaster rounded-full overflow-hidden border border-[#e5dfd4]">
            <div className="h-full bg-antiquegold rounded-full" style={{ width: '35.0%' }} />
          </div>
        </div>
      </div>

      {/* Hero Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] uppercase tracking-widest text-antiquegold font-mono font-extrabold bg-antiquegold/10 px-2.5 py-1 rounded-md">
            {t.badgeTitle}
          </span>
          <h1 className="font-serif text-2xl md:text-3xl font-extrabold text-[#2A2723] tracking-tight mt-1 flex items-center gap-2">
            <Sliders className="w-7 h-7 text-antiquegold" />
            <span>{t.title}</span>
          </h1>
          <p className="text-xs text-warmgray font-semibold max-w-2xl mt-0.5 leading-relaxed">
            {t.subtitle}
          </p>
        </div>
      </div>

      {/* In-flight locked warning */}
      <div className="p-4 bg-amber-50 border border-antiquegold/30 rounded-2xl flex items-start gap-3 text-xs leading-relaxed">
        <Info className="w-5 h-5 text-antiquegold shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="font-mono font-bold text-charcoal uppercase tracking-wider text-[10px]">CONTRACT IMMUTABILITY POLICY ACTIVATED</h4>
          <p className="text-warmgray font-semibold">
            Note: Changing these base structures will not impact quotes already finalized or in-flight with customers. New parameters apply exclusively to future quotes to safeguard system-wide deal integrity.
          </p>
        </div>
      </div>

      {/* Grid Settings Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Drive pricing Mechanics & Margin Config */}
        <div className="lg:col-span-8 space-y-6 text-left">
          
          {/* Card 1: Drive types base table */}
          <Card className="p-6 bg-white space-y-4">
            <div className="border-b border-[#e5dfd4] pb-3">
              <h3 className="font-serif text-base font-black text-charcoal">{t.driveTable}</h3>
              <p className="text-[10px] text-warmgray font-semibold">Base cost configuration including floor escalations.</p>
            </div>

            <div className="space-y-4 text-xs font-semibold">
              {driveRules.map((rule, idx) => (
                <div key={idx} className="p-4 bg-alabaster rounded-xl border border-[#e5dfd4]/40 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-warmgray uppercase">Drive Propulsive Class</label>
                    <span className="font-serif font-black text-charcoal block py-2">{rule.driveType}</span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-warmgray uppercase">{t.basePrice}</label>
                    <input 
                      type="number"
                      value={rule.basePrice}
                      onChange={(e) => handleUpdateDriveRule(idx, 'basePrice', parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-[#e5dfd4] p-2 rounded-lg font-mono font-bold text-charcoal"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-warmgray uppercase">{t.increment}</label>
                    <input 
                      type="number"
                      min="5"
                      max="25"
                      value={rule.perFloorIncrementPct}
                      onChange={(e) => handleUpdateDriveRule(idx, 'perFloorIncrementPct', parseInt(e.target.value) || 12)}
                      className="w-full bg-white border border-[#e5dfd4] p-2 rounded-lg font-mono font-bold text-charcoal"
                    />
                    <span className="text-[8px] text-warmgray font-medium block mt-1">Acceptable range: 10% - 25%</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Card 2: Margin Floor Settings & Warnings */}
          <Card className="p-6 bg-white space-y-4">
            <div className="border-b border-[#e5dfd4] pb-3">
              <h3 className="font-serif text-base font-black text-[#2A2723]">{t.marginFloorTitle}</h3>
              <p className="text-[10px] text-warmgray font-semibold">{t.marginFloorDesc}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              
              <div className="space-y-2 p-4 bg-alabaster rounded-2xl border border-[#e5dfd4]/40">
                <div className="flex justify-between items-baseline font-mono text-xs text-charcoal">
                  <span>Current Floor Limit</span>
                  <span className="text-royalemerald font-black text-lg font-mono">{marginFloorPct}%</span>
                </div>

                <input 
                  type="range"
                  min="5"
                  max="25"
                  step="1"
                  value={marginFloorPct}
                  onChange={(e) => setMarginFloorPct(parseInt(e.target.value))}
                  className="w-full accent-royalemerald cursor-pointer"
                />

                <span className="text-[9px] text-warmgray font-semibold block mt-1">Recommended safe threshold level is 15.0%.</span>
              </div>

              {/* Risk warning dynamic box */}
              <div className={`p-4 rounded-2xl border flex items-start gap-3 text-xs font-semibold leading-relaxed transition-colors ${
                marginFloorPct < 12 
                  ? 'bg-red-50 border-red-200 text-red-800' 
                  : 'bg-emerald-50/50 border-emerald-100 text-[#0E4B3D]'
              }`}>
                {marginFloorPct < 12 ? (
                  <>
                    <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5 animate-pulse" />
                    <div className="space-y-1">
                      <strong className="uppercase font-mono text-[10px] text-red-700 block">REDLINE THRESHOLD PENETRATION</strong>
                      <p className="text-[11px] text-warmgray leading-snug">{t.riskWarning}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5 text-royalemerald shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <strong className="uppercase font-mono text-[10px] text-royalemerald block">PORTFOLIO SHIELDED SECURE</strong>
                      <p className="text-[11px] text-warmgray leading-snug">The company safety baseline is fully protected. Sales cannot submit losing deals without direct admin approval.</p>
                    </div>
                  </>
                )}
              </div>

            </div>
          </Card>

          {/* Card 3: AMC Configuration */}
          <Card className="p-6 bg-white space-y-4">
            <div className="border-b border-[#e5dfd4] pb-3">
              <h3 className="font-serif text-base font-black text-[#2A2723]">{t.amcTitle}</h3>
              <p className="text-[10px] text-warmgray font-semibold">{t.amcDesc}</p>
            </div>

            {/* List existing */}
            <div className="space-y-3">
              {amcTiers.map((tier, index) => (
                <div key={index} className="p-4 bg-alabaster rounded-xl border border-[#e5dfd4]/40 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs font-semibold">
                  <div>
                    <strong className="text-charcoal font-serif text-sm">{tier.name}</strong>
                    <p className="text-warmgray text-[11px] mt-0.5">{tier.description}</p>
                    <div className="flex gap-4 mt-1.5 text-[10px] font-mono text-warmgray uppercase">
                      <span>Visits: {tier.visitsPerYear}/Year</span>
                      <span>Spares Coverage: {tier.includesSpares ? 'Full Spare Inclusive' : 'No Spares Included'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <span className="text-[10px] font-mono text-warmgray block">Monthly Cost</span>
                      <strong className="text-charcoal text-base font-mono">₹{tier.monthlyRate.toLocaleString()}</strong>
                    </div>

                    <button 
                      onClick={() => handleDeleteAMCTier(tier.name)}
                      className="p-2 hover:bg-white rounded-lg text-[#B23B3B] border border-transparent hover:border-[#e5dfd4]"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add inline form */}
            <form onSubmit={handleAddAMCTier} className="p-4 bg-alabaster/30 rounded-xl border border-[#e5dfd4]/40 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-semibold">
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-warmgray uppercase">New AMC Tier Name</label>
                <input 
                  type="text"
                  required
                  value={newAMCTierName}
                  onChange={(e) => setNewAMCTierName(e.target.value)}
                  placeholder="e.g. Ascension Platinum Armor"
                  className="w-full bg-white border border-[#e5dfd4] p-2.5 rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-mono text-warmgray uppercase">Monthly Fee (₹)</label>
                <input 
                  type="number"
                  value={newAMCRate}
                  onChange={(e) => setNewAMCRate(parseInt(e.target.value) || 0)}
                  className="w-full bg-white border border-[#e5dfd4] p-2.5 rounded-lg font-mono"
                />
              </div>

              <div className="flex items-end">
                <Button
                  type="submit"
                  variant="outline"
                  fullWidth
                  className="py-2.5 text-xs font-bold font-mono"
                >
                  <Plus className="w-4 h-4 text-antiquegold" />
                  <span>{t.amcAddBtn}</span>
                </Button>
              </div>
            </form>
          </Card>

        </div>

        {/* Right Column: Tax levy & Global Submit Controls */}
        <div className="lg:col-span-4 space-y-6 text-left">
          
          {/* GST Configuration card */}
          <Card className="p-6 bg-white space-y-4">
            <div className="border-b border-[#e5dfd4] pb-3">
              <h3 className="font-serif text-base font-black text-charcoal">{t.gstTitle}</h3>
              <p className="text-[10px] text-warmgray font-semibold">{t.gstDesc}</p>
            </div>

            <div className="space-y-4 text-xs font-semibold">
              
              <div className="p-4 bg-alabaster rounded-xl border border-[#e5dfd4]/40 flex justify-between items-center">
                <div>
                  <span className="font-bold text-charcoal block">Current GST Rate</span>
                  <span className="text-[10px] text-warmgray">Federally matched standard levy</span>
                </div>
                <input 
                  type="number"
                  value={gstRatePct}
                  onChange={(e) => setGstRatePct(parseInt(e.target.value) || 18)}
                  className="w-20 bg-white border border-[#e5dfd4] p-2 rounded-lg font-mono font-bold text-right"
                />
              </div>

              {/* Scheduled GST effective date option */}
              <div className="p-4 bg-alabaster rounded-xl border border-[#e5dfd4]/40 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-charcoal">{t.scheduledChange}</span>
                  <button 
                    onClick={() => setScheduledGstEnabled(!scheduledGstEnabled)}
                    className={`w-10 h-5 rounded-full p-0.5 transition-all duration-300 ${scheduledGstEnabled ? 'bg-royalemerald' : 'bg-neutral-300'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 transform ${scheduledGstEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                {scheduledGstEnabled && (
                  <div className="space-y-3 pt-2 border-t border-[#e5dfd4]/40">
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono text-warmgray uppercase">Effective Date (Midnight)</label>
                      <input 
                        type="date"
                        value={scheduledGstDate}
                        onChange={(e) => setScheduledGstDate(e.target.value)}
                        className="w-full bg-white border border-[#e5dfd4] p-2 rounded-lg font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono text-warmgray uppercase">Proposed GST rate (%)</label>
                      <input 
                        type="number"
                        value={scheduledGstRate}
                        onChange={(e) => setScheduledGstRate(parseInt(e.target.value) || 18)}
                        className="w-full bg-white border border-[#e5dfd4] p-2 rounded-lg font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

            </div>
          </Card>

          {/* Sticky Master Action controls */}
          <Card className="p-5 bg-white space-y-3 text-center border-2 border-antiquegold">
            <span className="text-[10px] font-mono text-antiquegold uppercase font-extrabold block">MASTER CONTROLS LATCHED</span>
            <p className="text-[11px] text-warmgray font-semibold leading-relaxed">
              Updating these values applies root changes to our system. Check your parameters carefully.
            </p>

            <Button
              onClick={handleSaveConfig}
              variant="primary"
              fullWidth
              className="py-3 text-xs font-bold font-mono"
            >
              <Save className="w-4 h-4 text-white" />
              <span>Lock Pricing Rules</span>
            </Button>
          </Card>

        </div>

      </div>

    </div>
  );
};
