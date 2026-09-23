import React, { useState, useMemo } from 'react';
import { 
  Bot, Settings, Percent, HelpCircle, ShieldCheck, AlertTriangle, Play, Pause, 
  Trash2, Plus, Sparkles, RefreshCw, MessageSquare, AlertCircle, CheckCircle2, 
  Eye, ToggleLeft, ToggleRight, ArrowRight, UserCheck, ShieldAlert
} from 'lucide-react';
import { Card, Button, Badge, AscensionLine } from './Common';
import { useLanguage } from '../lib/language';

interface ObjectionScenario {
  id: string;
  objectionKey: string;
  customerObjection: string;
  strategyName: string;
  approvedResponse: string;
  discountTriggerPct: number;
}

interface ActiveNegotiation {
  id: string;
  quoteId: string;
  customerName: string;
  projectValue: number;
  currentOffer: number;
  roundCount: number;
  lastCustomerMessage: string;
  botProposedResponse: string;
  status: 'bot_active' | 'human_escalated' | 'completed_won' | 'completed_lost';
}

export const AutoNegotiationBotConfig: React.FC<{ 
  user: any;
  onNavigateToPreview?: () => void;
  onNavigateToThread?: () => void;
}> = ({ user, onNavigateToPreview, onNavigateToThread }) => {
  const { language } = useLanguage();
  const [toastMsg, setToastMsg] = useState('');

  // Core Configuration States
  const [dealPriceFloorPct, setDealPriceFloorPct] = useState<number>(18); // Inherits from general margin rules (minimum margin)
  const [maxNegotiationRounds, setMaxNegotiationRounds] = useState<number>(4);
  const [botTone, setBotTone] = useState<'conservative' | 'warm_assertive' | 'concession_heavy'>('warm_assertive');
  const [autoCloseAuthority, setAutoCloseAuthority] = useState<boolean>(false);

  // Scenario Library State
  const [scenarios, setScenarios] = useState<ObjectionScenario[]>([
    {
      id: 'sc-1',
      objectionKey: 'price_too_high',
      customerObjection: 'Your initial quotation is significantly higher than our budget allowance.',
      strategyName: 'Amortized Value Explanation & Core Safety Certifications',
      approvedResponse: 'We understand budget concerns. At All India Elevators, our cost is grounded in 100% genuine safety brakes, VVVF drive efficiency, and a 2-year shield warranty. This prevents costly breakdowns down the line. I am authorized to extend a 3% bundle discount to close today.',
      discountTriggerPct: 3
    },
    {
      id: 'sc-2',
      objectionKey: 'competitor_comparison',
      customerObjection: 'Other local fabricators are offering us a similar layout for 20% less.',
      strategyName: 'Differentiate via AMC Lifetime Shield & Certification',
      approvedResponse: 'Many local fabricators omit critical national safety certifications (IS-14665) and use non-branded drive belts. AIEC uses top-tier components. We can offer a free first-year AMC upgrade worth ₹42,000 rather than cutting structural margins.',
      discountTriggerPct: 5
    },
    {
      id: 'sc-3',
      objectionKey: 'delay_closing',
      customerObjection: 'Our society committee needs 3 months to review and decide.',
      strategyName: 'Urgency lock & raw material cost index protection',
      approvedResponse: 'Steel index pricing is revised monthly. To lock in this weeks calculated rate, we can accept a token ₹10,000 reservation deposit which is fully refundable if your committee decides otherwise.',
      discountTriggerPct: 0
    }
  ]);

  // Form states for adding new objection strategy
  const [newObjectionKey, setNewObjectionKey] = useState('');
  const [newObjection, setNewObjection] = useState('');
  const [newStrategy, setNewStrategy] = useState('');
  const [newResponse, setNewResponse] = useState('');
  const [newTriggerPct, setNewTriggerPct] = useState(3);

  // Active Negotiations Real-Time Dashboard
  const [activeNegotiations, setActiveNegotiations] = useState<ActiveNegotiation[]>([
    {
      id: 'neg-1',
      quoteId: 'AIEC-QT-1092',
      customerName: 'Karan Malhotra (Penthouse)',
      projectValue: 1250000,
      currentOffer: 1120000,
      roundCount: 2, // Within limit of 4
      lastCustomerMessage: 'If you can do ₹11,00,000 inclusive of GST, I will sign the authorization form right now.',
      botProposedResponse: 'Analyzing final discount strategy. Pushing towards ₹11,20,000 with a companion AMC voucher to protect our margin guardrail.',
      status: 'bot_active'
    },
    {
      id: 'neg-2',
      quoteId: 'AIEC-QT-1095',
      customerName: 'Shree Krishna Developers',
      projectValue: 2840000,
      currentOffer: 2500000,
      roundCount: 4, // Hit limit of 4!
      lastCustomerMessage: 'We need another 5% off because we are buying three identical compact units.',
      botProposedResponse: 'Rounds limit exceeded. Human handoff required to Amit Shah (Mumbai Metro).',
      status: 'human_escalated'
    },
    {
      id: 'neg-3',
      quoteId: 'AIEC-QT-1031',
      customerName: 'Dr. Deshpande Clinic',
      projectValue: 950000,
      currentOffer: 910000,
      roundCount: 3,
      lastCustomerMessage: 'Excellent. Please send the final payment schedule.',
      botProposedResponse: 'Generating payment schedule... Won!',
      status: 'completed_won'
    }
  ]);

  // Multilingual translations
  const t = useMemo(() => {
    const translations = {
      en: {
        title: "Auto-Negotiation Bot Config",
        subtitle: "Supercharge your closing rates. Deploy safe, margin-bounded conversational bots that handle objections, offer strategic concessions, and close contracts automatically.",
        badgeTitle: "CONVERSATIONAL BOT DISPATCH • MODULE 8 OF 10",
        tabTitle: "Negotiation Bot Controller",
        priceFloorLabel: "Acceptable Final Deal Profit Floor (%)",
        priceFloorDesc: "Enforce safety. The bot will automatically halt and escalate if the customer demands a price below this net margin level.",
        maxRoundsLabel: "Max Negotiation Conversation Rounds",
        maxRoundsDesc: "Mandatory safety handoff. If the bot does not secure a signature in this many interactions, control reverts to Sales.",
        toneLabel: "Persona & Conversational Tone",
        toneDesc: "Determines the bot's negotiation tactic aggressiveness.",
        toneConservative: "Conservative & Educational (Value-Driven)",
        toneWarmAssertive: "Warm & Assertive (Relationship & Closing-focused)",
        toneConcessionHeavy: "Agile & Concession-Heavy (Volume-focused)",
        authorityLabel: "Independent Bot Closing Authority",
        authorityDesc: "Allow the bot to finalize the quote and generate the digital contract instantly once an authorized floor price is met, without a manual human signature.",
        activeNegotiationsTitle: "Live Negotiation Terminal",
        takeOverBtn: "Manual Take Over",
        botActiveBadge: "AI Bot Negotiating",
        humanNeededBadge: "Human Escalation Required",
        wonBadge: "Deal Secured!",
        lostBadge: "Deal Archived",
        rounds: "Rounds",
        lastMsg: "Last Customer Text",
        proposedMsg: "Proposed Bot Counter",
        scenarioTitle: "Canned Objection Strategy Library",
        scenarioDesc: "Define how the bot responds to common price, delay, or competitor objections. Keep answers professional and value-focused.",
        addScenarioBtn: "Register Strategy",
        toastSave: "Negotiation bot configurations successfully updated and saved.",
        toastTakeover: "Control successfully diverted. Sales Operator has been notified.",
        toastAddScenario: "New objection handler added to the bot strategy database.",
        toastDeleteScenario: "Objection handler deleted successfully.",
        novelObjectionWarning: "Novel Concern Safeguard Active: If the client raises a topic not mapped below, the bot automatically flags a Sales representative."
      },
      hi: {
        title: "स्वचालित बातचीत बॉट कॉन्फ़िगरेशन",
        subtitle: "सुरक्षित, मार्जिन-बाउंड संवादी बॉट्स तैनात करें जो आपत्तियों को संभालते हैं, रणनीतिक छूट प्रदान करते हैं, और सौदे बंद करते हैं।",
        badgeTitle: "संवादी बॉट प्रेषण • मॉड्यूल 8 का 10",
        tabTitle: "बातचीत बॉट नियंत्रक",
        priceFloorLabel: "स्वीकार्य अंतिम सौदा लाभ न्यूनतम सीमा (%)",
        priceFloorDesc: "सुरक्षा लागू करें। यदि ग्राहक इस सीमा से कम की मांग करता है तो बॉट रुक जाएगा।",
        maxRoundsLabel: "अधिकतम बातचीत बातचीत दौर",
        maxRoundsDesc: "यदि बॉट इतने दौरों में सौदा नहीं कर पाता है, तो नियंत्रण बिक्री प्रतिनिधि के पास वापस आ जाता है।",
        toneLabel: "व्यक्तित्व और संवादी लहजा",
        toneDesc: "बॉट की बातचीत रणनीति की आक्रामकता निर्धारित करता है।",
        toneConservative: "रूढ़िवादी और शैक्षिक (मूल्य-संचालित)",
        toneWarmAssertive: "गर्म और मुखर (संबंध और समापन-केंद्रित)",
        toneConcessionHeavy: "चंचल और रियायत-भारी (मात्रा-केंद्रित)",
        authorityLabel: "स्वतंत्र बॉट समापन प्राधिकरण",
        authorityDesc: "एक बार अधिकृत मंजिल मूल्य पूरा हो जाने पर बॉट को अनुबंध को अंतिम रूप देने की अनुमति दें।",
        activeNegotiationsTitle: "लाइव बातचीत टर्मिनल",
        takeOverBtn: "मैनुअल नियंत्रण लें",
        botActiveBadge: "एआई बॉट बातचीत कर रहा है",
        humanNeededBadge: "मानव हस्तक्षेप आवश्यक",
        wonBadge: "सौदा सुरक्षित!",
        lostBadge: "सौदा संग्रहीत",
        rounds: "दौर",
        lastMsg: "अंतिम ग्राहक संदेश",
        proposedMsg: "प्रस्तावित बॉट काउंटर",
        scenarioTitle: "सामान्य आपत्ति रणनीति लाइब्रेरी",
        scenarioDesc: "परिभाषित करें कि बॉट सामान्य मूल्य, देरी या प्रतिस्पर्धी आपत्तियों का क्या उत्तर देता है।",
        addScenarioBtn: "रणनीति पंजीकृत करें",
        toastSave: "वार्ता बॉट कॉन्फ़िगरेशन सफलतापूर्वक सहेजा गया।",
        toastTakeover: "नियंत्रण सफलतापूर्वक हस्तांतरित किया गया। सेल्स ऑपरेटर को सूचित कर दिया गया है।",
        toastAddScenario: "बॉट रणनीति डेटाबेस में नया आपत्ति हैंडलर जोड़ा गया।",
        toastDeleteScenario: "आपत्ति हैंडलर सफलतापूर्वक हटा दिया गया।",
        novelObjectionWarning: "नवीन चिंता सुरक्षा सक्रिय: यदि ग्राहक किसी ऐसे विषय को उठाता है जो नीचे मैप नहीं किया गया है, तो बॉट स्वतः सेल्स टीम को सचेत करता है।"
      },
      mr: {
        title: "ऑटो-नेगोशिएशन बॉट रचना",
        subtitle: "सुरक्षित आणि नफा मर्यादा सांभाळणारे एआय बॉट्स कार्यान्वित करा. हे बॉट्स ग्राहकांच्या शंकांचे निरसन करून सौदे स्वयंचलितपणे पूर्ण करतात.",
        badgeTitle: "संभाषण बॉट व्यवस्थापन • मॉड्युल ८ ऑफ १०",
        tabTitle: "नेगोशिएशन बॉट कंट्रोलर",
        priceFloorLabel: "किमान नफा मर्यादा (Profit Floor %)",
        priceFloorDesc: "सुरक्षा मर्यादा: या मर्यादेपेक्षा कमी नफा असल्यास बॉट चर्चा थांबवून सेल्स प्रतिनिधीकडे सोपवेल.",
        maxRoundsLabel: "जास्तीत जास्त चर्चा फेऱ्या (Max Rounds)",
        maxRoundsDesc: "अनिवार्य मर्यादा: ठराविक फेऱ्यांमध्ये करार न झाल्यास नियंत्रण सेल्स ऑपरेटरकडे सोपवले जाईल.",
        toneLabel: "बॉटचे संभाषण कौशल्य आणि टोन",
        toneDesc: "चर्चे दरम्यान बॉटच्या वागणुकीची पद्धत निश्चित करा.",
        toneConservative: "मूल्य-केंद्रित आणि संयमी संभाषण",
        toneWarmAssertive: "आदरयुक्त आणि आक्रमक (करार पूर्ण करण्याकडे कल)",
        toneConcessionHeavy: "लवचिक आणि झटपट सवलत देणारा",
        authorityLabel: "स्वयंचलित करार मंजुरी अधिकार",
        authorityDesc: "मर्यादेत किंमत मान्य झाल्यास मानवी मंजुरीशिवाय करार स्वयंचलितपणे अंतिम करण्यास परवानगी द्या.",
        activeNegotiationsTitle: "सध्या चालू असलेल्या चर्चा",
        takeOverBtn: "स्वतः ताबा घ्या",
        botActiveBadge: "एआय बॉट चर्चेत",
        humanNeededBadge: "मानवी मदतीची गरज",
        wonBadge: "सौदा निश्चित झाला!",
        lostBadge: "सौदा रद्द",
        rounds: "फेऱ्या",
        lastMsg: "ग्राहकाचा शेवटचा संदेश",
        proposedMsg: "बॉटचे उत्तर / ऑफर",
        scenarioTitle: "शंका आणि उत्तर संच (Objection Library)",
        scenarioDesc: "जास्त दर किंवा वेळेची कमतरता यांसारख्या सामान्य ग्राहकांच्या शंकांवर बॉटने काय उत्तर द्यावे हे निश्चित करा.",
        addScenarioBtn: "योजना नोंदवा",
        toastSave: "बॉटची संभाषण सेटिंग्ज यशस्वीरित्या जतन झाली.",
        toastTakeover: "संभाषणाचा ताबा घेतला आहे. सेल्स प्रतिनिधीला संदेश पाठवला आहे.",
        toastAddScenario: "शंकांचे नवीन उत्तर यशस्वीरित्या समाविष्ट झाले.",
        toastDeleteScenario: "उत्तर यशस्वीरित्या काढले गेले.",
        novelObjectionWarning: "अनोख्या शंकांसाठी सुरक्षा सक्रिय: जर ग्राहकाने खालील यादीबाहेरील प्रश्न विचारला, तर बॉट स्वयंचलितपणे सेल्स टीमला सूचित करेल."
      }
    };
    return translations[language] || translations.en;
  }, [language]);

  const handleSaveConfig = () => {
    if (dealPriceFloorPct < 10) {
      triggerToast(t.errorFloorLimit);
      return;
    }
    triggerToast(t.toastSave);
  };

  const handleAddScenario = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newObjectionKey.trim() || !newResponse.trim()) return;

    const newSc: ObjectionScenario = {
      id: `sc-${scenarios.length + 1}`,
      objectionKey: newObjectionKey,
      customerObjection: newObjection,
      strategyName: newStrategy,
      approvedResponse: newResponse,
      discountTriggerPct: newTriggerPct
    };

    setScenarios(prev => [...prev, newSc]);
    setNewObjectionKey('');
    setNewObjection('');
    setNewStrategy('');
    setNewResponse('');
    triggerToast(t.toastAddScenario);
  };

  const handleDeleteScenario = (id: string) => {
    // Phase 36 — LEVEL 4 (irreversible): deleting a negotiation scenario
    // had no confirmation of any kind before this fix.
    if (!window.confirm('Delete this negotiation scenario? This cannot be undone.')) {
      return;
    }
    setScenarios(prev => prev.filter(sc => sc.id !== id));
    triggerToast(t.toastDeleteScenario);
  };

  const handleTakeOver = (id: string) => {
    setActiveNegotiations(prev => prev.map(neg => {
      if (neg.id === id) {
        return {
          ...neg,
          status: 'human_escalated'
        };
      }
      return neg;
    }));
    triggerToast(t.toastTakeover);
  };

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4500);
  };

  return (
    <div className="space-y-6 pb-16">
      
      {/* Toast Announcement */}
      {toastMsg && (
        <div className="fixed top-6 right-6 z-50 bg-[#0E4B3D] text-white text-xs font-bold px-4 py-3 rounded-xl shadow-lg border border-antiquegold/30 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-white" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Progress indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-4 rounded-2xl border border-[rgba(184,135,61,0.15)] shadow-xs">
        <div>
          <div className="flex justify-between text-[10px] font-mono font-bold text-charcoal mb-1">
            <span>Negotiation & Closing Progress (Screen 1 of 10)</span>
            <span>10.0%</span>
          </div>
          <div className="h-2.5 bg-alabaster rounded-full overflow-hidden border border-[#e5dfd4]">
            <div className="h-full bg-royalemerald rounded-full" style={{ width: '10%' }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[10px] font-mono font-bold text-charcoal mb-1">
            <span>Overall Platform Build Progress (Screen 71 of 200)</span>
            <span>35.5%</span>
          </div>
          <div className="h-2.5 bg-alabaster rounded-full overflow-hidden border border-[#e5dfd4]">
            <div className="h-full bg-antiquegold rounded-full" style={{ width: '35.5%' }} />
          </div>
        </div>
      </div>

      {/* Hero Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] uppercase tracking-widest text-antiquegold font-mono font-extrabold bg-antiquegold/10 px-2.5 py-1 rounded-md">
            {t.badgeTitle}
          </span>
          <h1 className="font-serif text-2xl md:text-3xl font-extrabold text-[#2A2723] tracking-tight mt-1 flex items-center gap-2">
            <Bot className="w-7 h-7 text-antiquegold" />
            <span>{t.title}</span>
          </h1>
          <p className="text-xs text-warmgray font-semibold max-w-2xl mt-0.5 leading-relaxed">
            {t.subtitle}
          </p>
        </div>
      </div>

      {/* Alert Safeguard */}
      <div className="p-4 bg-emerald-50 border border-royalemerald/15 rounded-2xl flex items-start gap-3 text-xs leading-relaxed">
        <ShieldCheck className="w-5 h-5 text-royalemerald shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="font-mono font-bold text-charcoal uppercase tracking-wider text-[10px]">MARGIN GUARANTEES INTEGRITY LATCH</h4>
          <p className="text-warmgray font-semibold">
            This conversational bot is structurally tethered to your Root Pricing Rules. It is mathematically locked from presenting any client quotation that drops below the minimum safety threshold.
          </p>
        </div>
      </div>

      {/* Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Configuration Form Parameters */}
        <div className="lg:col-span-5 space-y-6 text-left">
          
          <Card className="p-6 bg-white space-y-5">
            <div className="border-b border-[#e5dfd4] pb-3 flex items-center gap-2">
              <Settings className="w-4 h-4 text-antiquegold" />
              <h3 className="font-serif text-base font-black text-charcoal">{t.tabTitle}</h3>
            </div>

            <div className="space-y-4 text-xs font-semibold">
              
              {/* Parameter 1: Price floor */}
              <div className="space-y-2 p-4 bg-alabaster rounded-2xl border border-[#e5dfd4]/40">
                <div className="flex justify-between items-baseline font-mono text-[10px] text-charcoal">
                  <span>{t.priceFloorLabel}</span>
                  <span className="text-royalemerald font-black text-sm">{dealPriceFloorPct}%</span>
                </div>
                <input 
                  type="range"
                  min="10"
                  max="25"
                  step="1"
                  value={dealPriceFloorPct}
                  onChange={(e) => setDealPriceFloorPct(parseInt(e.target.value))}
                  className="w-full accent-royalemerald cursor-pointer"
                />
                <p className="text-[9px] text-warmgray font-medium leading-normal mt-1">
                  {t.priceFloorDesc}
                </p>
              </div>

              {/* Parameter 2: Max Rounds */}
              <div className="space-y-2 p-4 bg-alabaster rounded-2xl border border-[#e5dfd4]/40">
                <div className="flex justify-between items-baseline font-mono text-[10px] text-charcoal">
                  <span>{t.maxRoundsLabel}</span>
                  <span className="text-antiquegold font-black text-sm">{maxNegotiationRounds} Rounds</span>
                </div>
                <input 
                  type="range"
                  min="2"
                  max="8"
                  step="1"
                  value={maxNegotiationRounds}
                  onChange={(e) => setMaxNegotiationRounds(parseInt(e.target.value))}
                  className="w-full accent-antiquegold cursor-pointer"
                />
                <p className="text-[9px] text-warmgray font-medium leading-normal mt-1">
                  {t.maxRoundsDesc}
                </p>
              </div>

              {/* Parameter 3: Bot Tone Selector */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-warmgray uppercase">{t.toneLabel}</label>
                <select
                  value={botTone}
                  onChange={(e) => setBotTone(e.target.value as any)}
                  className="w-full p-3 rounded-xl bg-alabaster border border-[#e5dfd4] text-charcoal"
                >
                  <option value="conservative">{t.toneConservative}</option>
                  <option value="warm_assertive">{t.toneWarmAssertive}</option>
                  <option value="concession_heavy">{t.toneConcessionHeavy}</option>
                </select>
                <p className="text-[9px] text-warmgray font-medium mt-1">
                  {t.toneDesc}
                </p>
              </div>

              {/* Parameter 4: Closing Authority Toggle */}
              <div className="p-4 bg-alabaster rounded-xl border border-[#e5dfd4]/40 flex justify-between items-center gap-4">
                <div>
                  <span className="font-bold text-charcoal block">{t.authorityLabel}</span>
                  <span className="text-[9px] text-warmgray leading-normal block mt-0.5">{t.authorityDesc}</span>
                </div>
                <button 
                  onClick={() => setAutoCloseAuthority(!autoCloseAuthority)}
                  className={`w-12 h-6 rounded-full p-0.5 transition-all duration-300 shrink-0 ${autoCloseAuthority ? 'bg-royalemerald' : 'bg-neutral-300'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 transform ${autoCloseAuthority ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              <Button
                onClick={handleSaveConfig}
                variant="primary"
                fullWidth
                className="py-3 text-xs font-bold mt-2"
              >
                <span>Save Bot Parameters</span>
              </Button>

            </div>
          </Card>

          {/* Objection safeguarding warning */}
          <div className="p-4 bg-amber-50 border border-antiquegold/30 rounded-2xl flex items-start gap-2.5 text-[10px] text-warmgray font-semibold leading-relaxed">
            <ShieldAlert className="w-4 h-4 text-antiquegold shrink-0 mt-0.5" />
            <p>
              {t.novelObjectionWarning}
            </p>
          </div>

        </div>

        {/* Right Column: Objection Scenarios & Active Dashboard */}
        <div className="lg:col-span-7 space-y-6 text-left">
          
          {/* Active Negotiations Dashboard */}
          <div className="space-y-4">
            <h2 className="font-serif text-lg font-black text-charcoal flex items-center gap-2">
              <span>{t.activeNegotiationsTitle}</span>
              <span className="bg-antiquegold text-white font-mono text-xs font-black px-2 py-0.5 rounded-full">
                {activeNegotiations.filter(n => n.status === 'bot_active').length} Active
              </span>
            </h2>

            <div className="space-y-4">
              {activeNegotiations.map((neg) => {
                const isEscalated = neg.status === 'human_escalated';
                const isWon = neg.status === 'completed_won';
                const isActive = neg.status === 'bot_active';

                return (
                  <Card 
                    key={neg.id} 
                    className={`p-5 bg-white relative overflow-hidden border ${
                      isEscalated 
                        ? 'border-2 border-red-500 shadow-md' 
                        : isActive 
                          ? 'border-[rgba(184,135,61,0.15)]' 
                          : 'border-[#e5dfd4]/40 bg-neutral-50/50'
                    }`}
                  >
                    <div className="space-y-3">
                      
                      {/* Header row */}
                      <div className="flex flex-col sm:flex-row justify-between items-start gap-2 border-b border-[#e5dfd4]/40 pb-2.5">
                        <div>
                          <span className="text-[9px] font-mono text-antiquegold block uppercase">{neg.quoteId}</span>
                          <strong className="text-charcoal font-serif text-base">{neg.customerName}</strong>
                        </div>

                        {/* Badges & Status indicator */}
                        <div className="flex gap-1.5 items-center">
                          <span className="bg-alabaster border border-[#e5dfd4] px-2 py-0.5 rounded font-mono text-[9px] text-warmgray">
                            {t.rounds}: {neg.roundCount} / {maxNegotiationRounds}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-mono font-bold ${
                            isActive 
                              ? 'bg-emerald-100 text-royalemerald' 
                              : isEscalated 
                                ? 'bg-red-100 text-red-700' 
                                : 'bg-neutral-100 text-neutral-600'
                          }`}>
                            {isActive ? t.botActiveBadge : isEscalated ? t.humanNeededBadge : isWon ? t.wonBadge : t.lostBadge}
                          </span>
                        </div>
                      </div>

                      {/* Ascension Line: Horizontal progress visualization */}
                      <div className="space-y-1">
                        <span className="text-[8px] font-mono text-warmgray uppercase">Round Conversation Progress</span>
                        <div className="h-1 bg-alabaster rounded-full overflow-hidden border border-neutral-200">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${isEscalated ? 'bg-red-500' : 'bg-antiquegold'}`}
                            style={{ width: `${Math.min(100, (neg.roundCount / maxNegotiationRounds) * 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* Pricing block */}
                      <div className="grid grid-cols-2 gap-4 text-center">
                        <div className="p-2 bg-alabaster rounded-lg text-xs">
                          <span className="text-[8px] font-mono text-warmgray block uppercase">Original Baseline</span>
                          <strong className="text-charcoal block font-mono">₹{neg.projectValue.toLocaleString()}</strong>
                        </div>
                        <div className="p-2 bg-alabaster rounded-lg text-xs">
                          <span className="text-[8px] font-mono text-warmgray block uppercase">Current Offer Price</span>
                          <strong className="text-royalemerald block font-mono">₹{neg.currentOffer.toLocaleString()}</strong>
                        </div>
                      </div>

                      {/* Transcripts excerpt */}
                      <div className="p-3 bg-alabaster/50 rounded-xl space-y-2 border border-[#e5dfd4]/20 text-xs">
                        <div>
                          <span className="text-[8px] font-mono text-[#B23B3B] block uppercase">{t.lastMsg}</span>
                          <p className="text-charcoal italic mt-0.5">"{neg.lastCustomerMessage}"</p>
                        </div>
                        <div className="border-t border-[#e5dfd4]/40 pt-2">
                          <span className="text-[8px] font-mono text-royalemerald block uppercase">{t.proposedMsg}</span>
                          <p className="text-charcoal font-semibold mt-0.5">"{neg.botProposedResponse}"</p>
                        </div>
                      </div>

                      {/* Take over button workspace */}
                      <div className="pt-2 flex justify-between items-center gap-2">
                        {onNavigateToThread && (
                          <button
                            onClick={onNavigateToThread}
                            className="py-1.5 px-3 bg-white text-royalemerald border border-royalemerald/25 hover:bg-emerald-50 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>View Thread 💬</span>
                          </button>
                        )}
                        {isActive && (
                          <button
                            onClick={() => handleTakeOver(neg.id)}
                            className="py-1.5 px-3 bg-red-50 text-[#B23B3B] border border-red-200 hover:bg-red-100 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>{t.takeOverBtn}</span>
                          </button>
                        )}
                      </div>

                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Objection Strategy Scenario Library List */}
          <Card className="p-6 bg-white space-y-4">
            <div className="border-b border-[#e5dfd4] pb-3">
              <h3 className="font-serif text-base font-black text-charcoal">{t.scenarioTitle}</h3>
              <p className="text-[10px] text-warmgray font-semibold">{t.scenarioDesc}</p>
            </div>

            {/* List existing Scenarios */}
            <div className="space-y-4">
              {scenarios.map((sc) => (
                <div key={sc.id} className="p-4 bg-alabaster rounded-xl border border-[#e5dfd4]/40 text-xs font-semibold space-y-2">
                  <div className="flex justify-between items-start gap-2 border-b border-[#e5dfd4]/20 pb-2">
                    <div>
                      <strong className="text-charcoal font-serif text-sm block">{sc.strategyName}</strong>
                      <span className="bg-[#B8873D]/10 text-antiquegold font-mono text-[9px] uppercase px-1.5 py-0.5 rounded mt-0.5 block w-fit">
                        Objection key: {sc.objectionKey}
                      </span>
                    </div>

                    <button 
                      onClick={() => handleDeleteScenario(sc.id)}
                      className="p-1.5 hover:bg-white rounded-md text-[#B23B3B]"
                      title="Remove Handler"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[8px] font-mono text-warmgray uppercase block">Simulated Customer Objection:</span>
                    <p className="text-charcoal font-medium italic">"{sc.customerObjection}"</p>
                  </div>

                  <div className="space-y-1 p-2.5 bg-white border border-[#e5dfd4]/30 rounded-lg">
                    <span className="text-[8px] font-mono text-royalemerald uppercase block font-bold">Approved Bot Response Strategy:</span>
                    <p className="text-charcoal leading-relaxed">"{sc.approvedResponse}"</p>
                    {sc.discountTriggerPct > 0 && (
                      <span className="text-[9px] text-[#B23B3B] font-bold block mt-1">
                        Authorized maximum bundle discount trigger: {sc.discountTriggerPct}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Form to insert new Scenario */}
            <form onSubmit={handleAddScenario} className="p-4 bg-alabaster/30 rounded-xl border border-[#e5dfd4]/40 space-y-3 text-xs font-semibold">
              <span className="text-[10px] font-mono text-antiquegold uppercase font-extrabold block">Add Custom Strategy Handler</span>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-mono text-warmgray uppercase">Objection Keyword Identifier</label>
                  <input 
                    type="text" 
                    required
                    value={newObjectionKey}
                    onChange={(e) => setNewObjectionKey(e.target.value)}
                    placeholder="e.g. warranty_too_short"
                    className="w-full bg-white border border-[#e5dfd4] p-2 rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-mono text-warmgray uppercase">Strategy Action Name</label>
                  <input 
                    type="text"
                    required
                    value={newStrategy}
                    onChange={(e) => setNewStrategy(e.target.value)}
                    placeholder="e.g. Extended Comprehensive Protection Package"
                    className="w-full bg-white border border-[#e5dfd4] p-2 rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-mono text-warmgray uppercase">Expected Client Objection Statement</label>
                <input 
                  type="text"
                  required
                  value={newObjection}
                  onChange={(e) => setNewObjection(e.target.value)}
                  placeholder="e.g. 2 years warranty feels too short for an elevator."
                  className="w-full bg-white border border-[#e5dfd4] p-2 rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-mono text-warmgray uppercase">Approved Output Text Response</label>
                <textarea 
                  required
                  rows={2}
                  value={newResponse}
                  onChange={(e) => setNewResponse(e.target.value)}
                  placeholder="We stand behind our craftsmanship. I can offer an optional 3rd-year extension at 50% discount..."
                  className="w-full bg-white border border-[#e5dfd4] p-2 rounded-lg"
                />
              </div>

              <div className="flex justify-between items-center pt-2 gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-[9px] font-mono text-warmgray uppercase shrink-0">Trigger Discount (%)</label>
                  <input 
                    type="number"
                    min="0"
                    max="10"
                    value={newTriggerPct}
                    onChange={(e) => setNewTriggerPct(parseInt(e.target.value) || 0)}
                    className="w-16 bg-white border border-[#e5dfd4] p-1.5 rounded font-mono text-right"
                  />
                </div>

                <Button
                  type="submit"
                  variant="outline"
                  className="py-2 text-[11px] font-mono uppercase font-black"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t.addScenarioBtn}</span>
                </Button>
              </div>
            </form>

          </Card>

        </div>

      </div>

    </div>
  );
};
