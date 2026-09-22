import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, ArrowLeft, Check, CheckCircle2, AlertTriangle, 
  ChevronLeft, ChevronRight, Download, RefreshCw, Layers, Sparkles, 
  Phone, Send, MapPin, User, Calendar, DollarSign, Eye, AlertCircle, FileText,
  Info, ShieldAlert, FileSignature, ArrowRight
} from 'lucide-react';
import { User as UserType, Lead, LeadStage, Deal } from '../types';
import { Card, Button, Badge } from './Common';
import { useLanguage } from '../lib/language';
import { DbManager } from '../lib/db';
import { STAGE_CONFIG } from './LeadInbox';
import { LeadDetail } from './LeadDetail';
import { bridgeLeadStageTransition } from '../services/legacyCommercialBridge';

// Localization translations
const localizations = {
  en: {
    title: "CRM Pipeline & Stage Board",
    subtitle: "Ascension Kanban Node • All India Elevators CRM",
    totalValue: "Total Value",
    daysInStage: "{days} days stagnant",
    stalled: "STALLED DEAL ⚠️",
    backToInbox: "Back to CRM List",
    searchPlaceholder: "Filter pipeline leads...",
    noLeads: "No leads in this stage",
    prevStage: "Previous Stage",
    nextStage: "Next Stage",
    quotaPromptTitle: "Mandatory Quotation Generation Required",
    quotaPromptDesc: "An active commercial quote must exist in the database before transition to QUOTED is permitted.",
    quotaPrice: "Proposed Elevator Quote Price (₹)",
    quotaBtn: "Compile Quote & Move Forward",
    wonPromptTitle: "Signed Contract Verification",
    wonPromptDesc: "Transition to CLOSED WON requires confirmation of a physically signed contractual blueprint to prevent downstream liability issues.",
    wonContractCheckbox: "I verify a signed contract has been physically scanned & uploaded",
    wonBtn: "Approve Deal Win 🏆",
    errorTitle: "Operation Blocked",
    cancel: "Cancel",
    conflictTitle: "Simulated Sync Conflict Detected 🚨",
    conflictDesc: "Another Sales Supervisor recently updated this lead's state. Last valid transaction won.",
    simulateConflictBtn: "Simulate Sync Conflict",
    currentSectionProgress: "Lead Flow Elevator Progress",
    totalSystemProgress: "System Pipeline Target Achievement",
    stagePosition: "Stage {current} of {total}",
    allOwners: "All Owners",
    staleFilter: "Show Stale (>5 days) Only",
    allLeads: "All Leads",
    dragTooltip: "Drag cards between columns to transition",
    contractRequired: "Signed contract is mandatory to win deal!",
    quoteRequired: "Quotation details are required to quote lead!"
  },
  mr: {
    title: "सीआरएम पाईपलाईन आणि कानबान बोर्ड",
    subtitle: "असेन्शन कानबान नोड • ऑल इंडिया एलिव्हेटर्स",
    totalValue: "एकूण मूल्य",
    daysInStage: "{days} दिवस प्रलंबित",
    stalled: "प्रलंबित व्यवहार ⚠️",
    backToInbox: "यादीवर परत जा",
    searchPlaceholder: "पाईपलाईन लीड्स फिल्टर करा...",
    noLeads: "या टप्प्यात कोणतेही लीड्स नाहीत",
    prevStage: "मागील मजला",
    nextStage: "पुढील मजला",
    quotaPromptTitle: "कोटेशन निर्मिती आवश्यक",
    quotaPromptDesc: "कोटेशन टप्प्यावर जाण्यापूर्वी डेटाबेसमध्ये व्यावसायिक कोटेशन असणे आवश्यक आहे.",
    quotaPrice: "प्रस्तावित कोटेशन किंमत (₹)",
    quotaBtn: "कोटेशन तयार करा आणि पुढे जा",
    wonPromptTitle: "स्वाक्षरी केलेल्या कराराची पडताळणी",
    wonPromptDesc: "विजेत्या टप्प्यावर जाण्यासाठी स्वाक्षरी केलेल्या कराराची खात्री करणे बंधनकारक आहे.",
    wonContractCheckbox: "मी पडताळणी करतो की स्वाक्षरी केलेला करार स्कॅन करून अपलोड केला आहे",
    wonBtn: "मंजूर करा 🏆",
    errorTitle: "क्रिया रोखली गेली",
    cancel: "रद्द करा",
    conflictTitle: "समक्रमण संघर्ष आढळला 🚨",
    conflictDesc: "दुसऱ्या विक्री पर्यवेक्षकाने नुकतेच या लीडची माहिती अद्ययावत केली आहे. अंतिम वैध व्यवहार लागू झाला.",
    simulateConflictBtn: "समक्रमण संघर्ष चाचणी",
    currentSectionProgress: "सध्याची लीड प्रगती",
    totalSystemProgress: "एकूण प्रणाली उद्दिष्ट प्रगती",
    stagePosition: "टप्पा {current} पैकी {total}",
    allOwners: "सर्व अधिकारी",
    staleFilter: "केवळ शिळे लीड्स दाखवा (>५ दिवस)",
    allLeads: "सर्व लीड्स",
    dragTooltip: "मजला बदलण्यासाठी कार्ड ओढा",
    contractRequired: "करार जिंकण्यासाठी स्वाक्षरी आवश्यक आहे!",
    quoteRequired: "कोटेशन तपशील आवश्यक आहेत!"
  },
  hi: {
    title: "सीआरएम पाइपलाइन और कानबान बोर्ड",
    subtitle: "असेन्शन कानबान नोड • ऑल इंडिया एलिवेटर्स",
    totalValue: "कुल मूल्य",
    daysInStage: "{days} दिन से निष्क्रिय",
    stalled: "अवरुद्ध सौदा ⚠️",
    backToInbox: "सूची पर वापस जाएं",
    searchPlaceholder: "पाइपलाइन लीड फ़िल्टर करें...",
    noLeads: "इस चरण में कोई लीड नहीं है",
    prevStage: "पिछला चरण",
    nextStage: "अगला चरण",
    quotaPromptTitle: "अनिवार्य कोटेशन जनरेशन आवश्यक",
    quotaPromptDesc: "कोटेशन चरण में स्थानांतरण से पहले डेटाबेस में एक सक्रिय कोटेशन मौजूद होना चाहिए।",
    quotaPrice: "प्रस्तावित कोटेशन मूल्य (₹)",
    quotaBtn: "कोटेशन संकलित करें और आगे बढ़ें",
    wonPromptTitle: "हस्ताक्षरित अनुबंध सत्यापन",
    wonPromptDesc: "सौदा बंद और जीतने (WON) के लिए हस्ताक्षरित अनुबंध की पुष्टि आवश्यक है ताकि देयता समस्याओं से बचा जा सके।",
    wonContractCheckbox: "मैं सत्यापित करता हूं कि हस्ताक्षरित अनुबंध स्कैन और अपलोड किया गया है",
    wonBtn: "सौदा जीत स्वीकृत करें 🏆",
    errorTitle: "ऑपरेशन अवरुद्ध",
    cancel: "रद्द करें",
    conflictTitle: "समन्वयन संघर्ष का पता चला 🚨",
    conflictDesc: "किसी अन्य सेल्स सुपरवाइजर ने हाल ही में इस लीड की स्थिति को अपडेट किया है। अंतिम वैध ड्रॉप मान्य रहा।",
    simulateConflictBtn: "संघर्ष सिमुलेशन परीक्षण",
    currentSectionProgress: "वर्तमान लीड चरण प्रगति",
    totalSystemProgress: "कुल प्रणाली लक्ष्य प्रगति",
    stagePosition: "चरण {current} का {total}",
    allOwners: "सभी अधिकारी",
    staleFilter: "केवल निष्क्रिय लीड दिखाएं (>5 दिन)",
    allLeads: "सभी लीड",
    dragTooltip: "चरण बदलने के लिए कार्ड खींचें",
    contractRequired: "सौदा जीतने के लिए हस्ताक्षरित अनुबंध अनिवार्य है!",
    quoteRequired: "कोटेशन विवरण आवश्यक हैं!"
  }
};

// CRM pipeline columns configuration matching database stages
const STAGES_ORDER: LeadStage[] = [
  'captured',
  'assigned',
  'contacted',
  'survey_done',
  'quoted',
  'negotiating',
  'closed_won',
  'closed_lost'
];

export interface LeadAuditLog {
  id: string;
  leadId: string;
  leadName: string;
  action: 'reassignment' | 'status_change' | 'tag_added' | 'created';
  fromValue?: string;
  toValue?: string;
  actor: string;
  timestamp: string;
  note?: string;
}

export const LeadKanban: React.FC<{ user: UserType; onBackToInbox?: () => void }> = ({ user, onBackToInbox }) => {
  const { language } = useLanguage();
  const activeLang: 'en' | 'mr' | 'hi' = (language === 'mr' || language === 'hi' || language === 'en') ? language : 'en';
  const t = localizations[activeLang];

  // Database States
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  
  // Filtering & View states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>('All');
  const [showStaleOnly, setShowStaleOnly] = useState(false);
  
  // Mobile stage sliding
  const [activeStageIndex, setActiveStageIndex] = useState(0);

  // Flow Modals
  const [pendingTransition, setPendingTransition] = useState<{ lead: Lead; targetStage: LeadStage } | null>(null);
  
  // Quoting prompt parameters
  const [quotePrice, setQuotePrice] = useState<number>(850000);
  const [quoteDrive, setQuoteDrive] = useState<string>('Gearless Traction System');
  const [quoteCapacity, setQuoteCapacity] = useState<string>('6 Persons (408 kg)');
  const [quoteCabin, setQuoteCabin] = useState<string>('Hairline Finished Stainless Steel');

  // Won verification checkbox
  const [isContractChecked, setIsContractChecked] = useState(false);

  // Sync Conflict notification
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictMessage, setConflictMessage] = useState('');

  // Toast feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' } | null>(null);

  // Detail view redirect
  const [viewingLeadDetailId, setViewingLeadDetailId] = useState<string | null>(null);

  // Drag over target highlight tracking
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<LeadStage | null>(null);

  // Load and refresh state
  const loadData = () => {
    const rawLeads = DbManager.getLeads();
    const rawDeals = DbManager.getDeals();
    const rawUsers = DbManager.getUsers();

    // Fill placeholder source or updated timestamps if undefined
    const enhancedLeads = rawLeads.map((lead, idx) => {
      return {
        ...lead,
        updatedAt: lead.updatedAt || new Date(Date.now() - idx * 2 * 24 * 3600 * 1000).toISOString()
      };
    });

    setLeads(enhancedLeads);
    setDeals(rawDeals);
    setUsers(rawUsers.filter(u => u.role === 'admin' || u.role === 'surveyor'));
  };

  useEffect(() => {
    loadData();
    
    // Listen to DB update events
    const handleUpdate = () => {
      loadData();
    };
    window.addEventListener('aiec_db_update', handleUpdate);
    return () => {
      window.removeEventListener('aiec_db_update', handleUpdate);
    };
  }, []);

  const triggerToast = (message: string, type: 'success' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Helper: Estimate lead value
  const getLeadValue = (lead: Lead): number => {
    const matchedDeal = deals.find(d => d.leadId === lead.id);
    if (matchedDeal) return matchedDeal.agreedPrice;
    // Fallback based on floor count
    const floors = lead.buildingInfo.floors || lead.buildingInfo.floor_count || 4;
    return (floors * 250000) + 400000;
  };

  // Helper: Calculate stagnant days in stage
  const getStaleDays = (lead: Lead): number => {
    const lastUpdate = new Date(lead.updatedAt || lead.createdAt).getTime();
    return Math.max(1, Math.floor((Date.now() - lastUpdate) / (1000 * 60 * 60 * 24)));
  };

  // Process core stage updates & log to audit
  const performStageUpdate = (lead: Lead, targetStage: LeadStage, overridePrice?: number) => {
    // 1. Log previous and new stages
    const originalStage = lead.stage;
    const updatedLead: Lead = {
      ...lead,
      stage: targetStage,
      updatedAt: new Date().toISOString()
    };

    // 2. Perform DB update
    DbManager.updateLead(updatedLead);

    // 3. Create or update deal if appropriate
    if (targetStage === 'quoted' && overridePrice) {
      const existingDeal = deals.find(d => d.leadId === lead.id);
      if (!existingDeal) {
        const newDeal: Deal = {
          id: `deal_${Date.now()}`,
          leadId: lead.id,
          status: 'pending',
          agreedPrice: overridePrice,
          advancePaid: false,
          specs: {
            floors: lead.buildingInfo.floors || 4,
            driveType: quoteDrive,
            capacity: quoteCapacity,
            cabinStyle: quoteCabin
          },
          createdAt: new Date().toISOString()
        };
        DbManager.addDeal(newDeal);
      }
    } else if (targetStage === 'closed_won') {
      const existingDeal = deals.find(d => d.leadId === lead.id);
      if (existingDeal) {
        DbManager.updateDeal({
          ...existingDeal,
          status: 'closed'
        });
      } else {
        // Create standard completed deal
        const newDeal: Deal = {
          id: `deal_${Date.now()}`,
          leadId: lead.id,
          status: 'closed',
          agreedPrice: getLeadValue(lead),
          advancePaid: true,
          specs: {
            floors: lead.buildingInfo.floors || 4,
            driveType: 'Traction Gearless 1.0 m/s',
            capacity: '6 Persons (408 kg)',
            cabinStyle: 'Premium Brushed Stainless'
          },
          createdAt: new Date().toISOString()
        };
        DbManager.addDeal(newDeal);
      }
    }

    // Phase 15: bridge the two real business-meaningful stage moves
    // ('quoted' -> a real Quote; 'closed_won' -> quote accepted, which
    // the real Phase 07 event bus turns into a drafted canonical
    // Contract) into the canonical model, in addition to the DbManager
    // writes above (which remain authoritative for this screen). Never
    // blocks the UI and never throws — see legacyCommercialBridge.ts.
    if (targetStage === 'quoted' || targetStage === 'closed_won') {
      const dealForBridge = deals.find(d => d.leadId === lead.id);
      bridgeLeadStageTransition(
        { id: user.id, role: user.role, isDemo: user.isDemo, authMethod: user.authMethod },
        updatedLead,
        dealForBridge,
        targetStage,
        { quoteAmount: overridePrice ?? dealForBridge?.agreedPrice ?? getLeadValue(lead) },
      ).then(result => {
        if (!result.bridged) {
          console.warn(`[Phase 15 bridge] lead ${lead.id} stage "${targetStage}" not mirrored to canonical model: ${result.reason}`);
        }
      });
    }

    // 4. Record to unified AIEC audit logs
    const savedLogs = localStorage.getItem('aiec_lead_audit_logs');
    const logsList: LeadAuditLog[] = savedLogs ? JSON.parse(savedLogs) : [];
    const newLog: LeadAuditLog = {
      id: `log_${Date.now()}`,
      leadId: lead.id,
      leadName: lead.contactInfo.name,
      action: 'status_change',
      fromValue: originalStage,
      toValue: targetStage,
      actor: user.name,
      timestamp: new Date().toISOString(),
      note: `Moved elevator deal to ${targetStage.toUpperCase()}${overridePrice ? ` at ₹${overridePrice.toLocaleString()}` : ''}`
    };
    logsList.unshift(newLog);
    localStorage.setItem('aiec_lead_audit_logs', JSON.stringify(logsList));

    // 5. Trigger feedback
    triggerToast(`Lead "${lead.contactInfo.name}" successfully moved to ${targetStage.toUpperCase()}`);
    loadData();
  };

  // Main validator for any drag or button transition
  const validateAndTransition = (lead: Lead, targetStage: LeadStage) => {
    // Edge case 1: Target is same stage
    if (lead.stage === targetStage) return;

    // Edge case 2: Quoted Stage transition triggers mandatory quotation dialog
    if (targetStage === 'quoted') {
      const hasQuote = deals.some(d => d.leadId === lead.id);
      if (!hasQuote) {
        // Prompt for quote creation parameters
        const defaultPrice = (lead.buildingInfo.floors || 4) * 250000 + 400000;
        setQuotePrice(defaultPrice);
        setPendingTransition({ lead, targetStage });
        return;
      }
    }

    // Edge case 3: Won Stage transition requires signed contract verification
    if (targetStage === 'closed_won') {
      setIsContractChecked(false);
      setPendingTransition({ lead, targetStage });
      return;
    }

    // General simple transition
    performStageUpdate(lead, targetStage);
  };

  // Drag-and-drop HTML5 event handlers
  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData('text/plain', leadId);
    setDraggedLeadId(leadId);
  };

  const handleDragOver = (e: React.DragEvent, columnId: LeadStage) => {
    e.preventDefault();
    if (dragOverColumn !== columnId) {
      setDragOverColumn(columnId);
    }
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, targetStage: LeadStage) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain') || draggedLeadId;
    setDraggedLeadId(null);
    setDragOverColumn(null);

    if (!leadId) return;

    const lead = leads.find(l => l.id === leadId);
    if (lead) {
      validateAndTransition(lead, targetStage);
    }
  };

  // Simulate sync collision edge case: Two users dragging same card
  const handleSimulateSyncConflict = () => {
    if (leads.length === 0) {
      triggerToast("No active leads in pipeline to simulate conflict.", "warning");
      return;
    }
    const randomLead = leads[Math.floor(Math.random() * leads.length)];
    setConflictMessage(`Sales Manager 'Ashok Sawant' already reassigned ${randomLead.contactInfo.name} to NEGOTIATING 4 seconds ago. Your drag action to Won has been resolved by server timestamp (Last valid transaction won).`);
    setShowConflictModal(true);

    // Mutate the lead on behind-the-scenes
    const updated: Lead = {
      ...randomLead,
      stage: 'negotiating',
      updatedAt: new Date().toISOString()
    };
    DbManager.updateLead(updated);
    loadData();
  };

  // Filtered Leads list
  const filteredLeads = leads.filter(lead => {
    const matchesSearch = 
      lead.contactInfo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lead.contactInfo.companyName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.buildingInfo.address.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesOwner = selectedOwnerId === 'All' || lead.surveyorId === selectedOwnerId;
    const matchesStale = !showStaleOnly || getStaleDays(lead) > 5;

    return matchesSearch && matchesOwner && matchesStale;
  });

  // Calculate Column aggregates
  const getColumnSummary = (stage: LeadStage) => {
    const colLeads = filteredLeads.filter(l => l.stage === stage);
    const count = colLeads.length;
    const totalVal = colLeads.reduce((sum, l) => sum + getLeadValue(l), 0);
    return { count, totalVal };
  };

  // Total Pipeline value for visual target bar (Ascension Line signature)
  const totalWonValue = leads
    .filter(l => l.stage === 'closed_won')
    .reduce((sum, l) => sum + getLeadValue(l), 0);
  
  const totalPipelineValue = leads
    .reduce((sum, l) => sum + getLeadValue(l), 0);

  const wonRatio = totalPipelineValue > 0 ? (totalWonValue / totalPipelineValue) * 100 : 0;

  // Render detail view if selected
  if (viewingLeadDetailId) {
    return (
      <LeadDetail 
        leadId={viewingLeadDetailId} 
        onBack={() => {
          setViewingLeadDetailId(null);
          loadData();
        }} 
        currentUser={user} 
      />
    );
  }

  return (
    <div className="w-full space-y-6">
      
      {/* ==========================================
          HEADER SECTION WITH % TARGET PROGRESS
          ========================================== */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl border border-border shadow-diffuse">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-antiquegold">
            <Layers className="w-5 h-5 text-antiquegold animate-pulse" />
            <span className="text-[10px] uppercase font-extrabold tracking-wider font-mono bg-antiquegold/10 px-2 py-0.5 rounded-md">
              AIEC Admin Portal
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-serif font-black text-charcoal">{t.title}</h1>
          <p className="text-xs text-warmgray font-medium">{t.subtitle}</p>
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant="secondary" 
            onClick={handleSimulateSyncConflict}
            className="py-1.5 px-3 text-xs font-semibold"
          >
            <RefreshCw className="w-3.5 h-3.5 text-warning" />
            <span>{t.simulateConflictBtn}</span>
          </Button>
          
          {onBackToInbox && (
            <Button 
              variant="outline" 
              onClick={onBackToInbox}
              className="py-1.5 px-3 text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t.backToInbox}</span>
            </Button>
          )}
        </div>
      </div>

      {/* ==========================================
          THE ASCENSION LINE SIGNATURE PROGRESS
          ========================================== */}
      <div className="bg-white p-5 rounded-2xl border border-border shadow-diffuse space-y-3">
        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center gap-1.5 font-bold text-charcoal">
            <div className="w-2 h-2 rounded-full bg-royalemerald animate-ping" />
            <span>{t.totalSystemProgress}</span>
          </div>
          <span className="font-mono font-extrabold text-antiquegold text-sm">
            ₹{totalWonValue.toLocaleString()} / ₹{totalPipelineValue.toLocaleString()} ({Math.round(wonRatio)}%)
          </span>
        </div>
        
        {/* Elevator style vertical-to-horizontal Ascension track */}
        <div className="relative h-3 w-full bg-alabaster rounded-full border border-border overflow-hidden">
          <motion.div 
            className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-antiquegold to-royalemerald rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(3, wonRatio)}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
          {/* Elevator Cabin Node Indicator */}
          <motion.div 
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full border-2 border-antiquegold flex items-center justify-center shadow-md"
            style={{ left: `calc(${wonRatio}% - 8px)` }}
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ repeat: Infinity, duration: 3 }}
          >
            <div className="w-1.5 h-1.5 bg-royalemerald rounded-full" />
          </motion.div>
        </div>
        <div className="flex justify-between items-center text-[10px] text-warmgray font-mono font-semibold">
          <span>0% FLOOR BASE</span>
          <span>CAPACITY LIMIT TARGET</span>
          <span>100% PENTHOUSE (WON)</span>
        </div>
      </div>

      {/* ==========================================
          FILTER CONTROLS BAR
          ========================================== */}
      <div className="bg-white p-4 rounded-2xl border border-border shadow-diffuse flex flex-col md:flex-row gap-3">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-warmgray" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full pl-10 pr-4 py-2 bg-alabaster border border-border/70 rounded-xl text-xs font-medium text-charcoal placeholder-warmgray focus:outline-none focus:ring-1 focus:ring-antiquegold focus:bg-white transition-all"
          />
        </div>

        {/* Owner dropdown */}
        <div className="w-full md:w-48">
          <select
            value={selectedOwnerId}
            onChange={(e) => setSelectedOwnerId(e.target.value)}
            className="w-full p-2 bg-alabaster border border-border/70 rounded-xl text-xs font-bold text-charcoal focus:outline-none cursor-pointer"
          >
            <option value="All">👤 {t.allOwners}</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        {/* Stale filter toggle */}
        <button
          onClick={() => setShowStaleOnly(!showStaleOnly)}
          className={`flex items-center justify-center gap-2 py-2 px-4 rounded-xl border text-xs font-bold transition-all ${
            showStaleOnly 
              ? 'bg-warning/10 border-warning text-warning' 
              : 'bg-alabaster border-border text-warmgray hover:text-charcoal'
          }`}
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{t.staleFilter}</span>
        </button>
      </div>

      {/* ==========================================
          MOBILE SWIPE/TAB STRIP FOR ONE COL VIEW
          ========================================== */}
      <div className="block lg:hidden bg-white p-2.5 rounded-2xl border border-border shadow-diffuse overflow-x-auto scrollbar-none">
        <div className="flex gap-2 min-w-max">
          {STAGES_ORDER.map((stageId, idx) => {
            const summary = getColumnSummary(stageId);
            const isActive = activeStageIndex === idx;
            const config = STAGE_CONFIG[stageId];
            return (
              <button
                key={stageId}
                onClick={() => setActiveStageIndex(idx)}
                className={`py-2 px-3.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 ${
                  isActive
                    ? 'bg-antiquegold border-antiquegold text-white shadow-sm'
                    : 'bg-alabaster border-border text-charcoal hover:bg-[#edeae2]'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-white' : config.textClass} bg-current`} />
                <span>{STAGE_CONFIG[stageId] ? t[STAGE_CONFIG[stageId].labelKey as keyof typeof t] : stageId}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${isActive ? 'bg-white/20 text-white' : 'bg-charcoal/10 text-charcoal'}`}>
                  {summary.count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex justify-between items-center text-[10px] font-mono text-warmgray mt-2.5 px-1 font-bold">
          <span>{t.stagePosition.replace('{current}', String(activeStageIndex + 1)).replace('{total}', String(STAGES_ORDER.length))}</span>
          <span>SWIPE LEFT/RIGHT OR CLICK CHIP TO TRAVEL FLOORS</span>
        </div>
      </div>

      {/* ==========================================
          KANBAN BOARD LAYOUT
          ========================================== */}
      <div className="relative">
        
        {/* Desktop grid & Mobile Slider container */}
        <div className="grid grid-cols-1 lg:grid-cols-8 gap-4 overflow-x-auto pb-4">
          
          {STAGES_ORDER.map((stageId, idx) => {
            const summary = getColumnSummary(stageId);
            const config = STAGE_CONFIG[stageId];
            const colLeads = filteredLeads.filter(l => l.stage === stageId);
            
            // On mobile, hide other columns
            const isColumnVisibleOnMobile = activeStageIndex === idx;
            
            // Check if column is crowded to activate condensed view
            const isCrowded = colLeads.length > 3;

            return (
              <div
                key={stageId}
                onDragOver={(e) => handleDragOver(e, stageId)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stageId)}
                className={`flex-1 min-w-[280px] rounded-2xl transition-all duration-300 flex flex-col ${
                  !isColumnVisibleOnMobile ? 'hidden lg:flex' : 'flex'
                } ${
                  dragOverColumn === stageId 
                    ? 'bg-antiquegold/10 border-2 border-dashed border-antiquegold p-2' 
                    : 'bg-alabaster/50 border border-border/80 p-2.5'
                }`}
                style={{ minHeight: '480px' }}
              >
                
                {/* Column Header */}
                <div className="p-2 space-y-2 mb-3 bg-white rounded-xl border border-border shadow-xs">
                  <div className="flex justify-between items-start">
                    <div className="space-y-0.5">
                      <h3 className="text-xs font-extrabold text-charcoal font-serif tracking-tight leading-tight">
                        {t[config.labelKey as keyof typeof t] || stageId}
                      </h3>
                      <span className="text-[9px] uppercase tracking-wider font-mono font-bold text-warmgray block">
                        ₹{summary.totalVal.toLocaleString()}
                      </span>
                    </div>
                    
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono ${config.bgClass} ${config.textClass} border ${config.borderClass}`}>
                      {summary.count}
                    </span>
                  </div>
                  
                  {/* Subtle elevator wire illustration as indicator of progress */}
                  <div className="h-1.5 w-full bg-alabaster rounded-full overflow-hidden relative">
                    <div 
                      className="absolute left-0 top-0 bottom-0 rounded-full"
                      style={{ 
                        backgroundColor: config.color,
                        width: `${((idx + 1) / STAGES_ORDER.length) * 100}%` 
                      }} 
                    />
                  </div>
                </div>

                {/* Cards wrapper */}
                <div className={`flex-1 space-y-3 overflow-y-auto pr-1 max-h-[500px] scrollbar-thin ${
                  isCrowded ? 'border-t border-b border-dashed border-border/60 py-2' : ''
                }`}>
                  {colLeads.length === 0 ? (
                    <div className="h-28 border border-dashed border-border/50 rounded-xl flex flex-col items-center justify-center p-4 text-center text-warmgray">
                      <FileText className="w-5 h-5 text-warmgray/40 mb-1" />
                      <p className="text-[10px] font-semibold">{t.noLeads}</p>
                    </div>
                  ) : (
                    colLeads.map((lead) => {
                      const staleDays = getStaleDays(lead);
                      const isStale = staleDays > 5;
                      const hasPhotos = lead.site_photos && lead.site_photos.length > 0;
                      const hasQuote = deals.some(d => d.leadId === lead.id);

                      return (
                        <div
                          key={lead.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, lead.id)}
                          className={`group bg-white rounded-xl border p-3 cursor-grab active:cursor-grabbing transition-all hover:shadow-md relative overflow-hidden ${
                            isStale 
                              ? 'border-warning/40 bg-amber-50/10' 
                              : 'border-border'
                          }`}
                        >
                          
                          {/* Stale Highlight Ribbon */}
                          {isStale && (
                            <div className="absolute right-0 top-0 bg-warning text-white font-mono text-[8px] font-extrabold px-1.5 py-0.5 rounded-bl-lg">
                              STALE
                            </div>
                          )}

                          {/* Building & Value */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-start gap-1 pr-6">
                              <h4 className="text-[11px] font-serif font-black text-charcoal leading-snug group-hover:text-antiquegold transition-colors">
                                {lead.buildingInfo.address.split(',')[0]}
                              </h4>
                              <span className="text-[10px] font-mono font-bold text-antiquegold bg-antiquegold/10 px-1 py-0.2 rounded shrink-0">
                                ₹{(getLeadValue(lead) / 100000).toFixed(1)}L
                              </span>
                            </div>

                            {/* Contact Person */}
                            <div className="flex items-center gap-1.5 text-warmgray text-[10px] font-medium min-w-0">
                              <User className="w-3 h-3 text-warmgray shrink-0" />
                              <span className="truncate max-w-[140px] min-w-0">{lead.contactInfo.name}</span>
                            </div>

                            {/* Elevator technical spec tag */}
                            <div className="flex flex-wrap gap-1 mt-1 text-[8px] font-bold font-mono">
                              <span className="px-1.5 py-0.5 bg-alabaster border border-border text-charcoal rounded">
                                🏢 {lead.buildingInfo.floors} Floors
                              </span>
                              {lead.buildingInfo.type && (
                                <span className="px-1.5 py-0.5 bg-royalemerald/10 text-royalemerald border border-royalemerald/10 rounded uppercase">
                                  {lead.buildingInfo.type}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Image preview or sketch preview */}
                          <div className="mt-2 h-14 bg-alabaster rounded-lg overflow-hidden border border-border/50 relative flex items-center justify-center">
                            {hasPhotos ? (
                              <img 
                                src={lead.site_photos![0].dataUrl} 
                                alt="Site survey" 
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : lead.buildingInfo.shaft_sketch_data_url ? (
                              <img 
                                src={lead.buildingInfo.shaft_sketch_data_url} 
                                alt="Sketch preview" 
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-contain p-1"
                              />
                            ) : (
                              <div className="flex flex-col items-center justify-center p-1 text-center">
                                <Sparkles className="w-3 h-3 text-antiquegold/60" />
                                <span className="text-[8px] font-bold text-warmgray">Ascension Blueprint</span>
                              </div>
                            )}

                            {/* Quote indicator overlay */}
                            {hasQuote && (
                              <div className="absolute bottom-1 right-1 bg-royalemerald text-white text-[8px] font-extrabold font-mono px-1 py-0.2 rounded flex items-center gap-0.5">
                                <Check className="w-2.5 h-2.5" />
                                QUOTED
                              </div>
                            )}
                          </div>

                          {/* Stale text or last active */}
                          <div className="mt-2.5 pt-2 border-t border-dashed border-border/60 flex justify-between items-center text-[9px] font-mono font-bold text-warmgray">
                            <span>
                              {isStale ? (
                                <span className="text-warning font-bold">⚠️ {t.daysInStage.replace('{days}', String(staleDays))}</span>
                              ) : (
                                <span>Updated {staleDays}d ago</span>
                              )}
                            </span>
                            
                            <button
                              onClick={() => setViewingLeadDetailId(lead.id)}
                              className="text-antiquegold hover:underline flex items-center gap-0.5 text-[8px] font-serif font-black"
                            >
                              <Eye className="w-3 h-3" />
                              VIEW 360°
                            </button>
                          </div>

                          {/* Quick stage transition button for mobile */}
                          <div className="mt-2 flex gap-1 lg:hidden">
                            {idx > 0 && (
                              <button
                                onClick={() => validateAndTransition(lead, STAGES_ORDER[idx - 1])}
                                className="flex-1 py-1 bg-alabaster border border-border hover:bg-white text-[9px] font-bold text-charcoal rounded-lg flex items-center justify-center gap-0.5"
                              >
                                <ChevronLeft className="w-3 h-3" />
                                <span>{t.prevStage}</span>
                              </button>
                            )}
                            {idx < STAGES_ORDER.length - 1 && (
                              <button
                                onClick={() => validateAndTransition(lead, STAGES_ORDER[idx + 1])}
                                className="flex-1 py-1 bg-antiquegold/10 border border-antiquegold/20 text-antiquegold hover:bg-antiquegold hover:text-white text-[9px] font-bold rounded-lg flex items-center justify-center gap-0.5"
                              >
                                <span>{t.nextStage}</span>
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                        </div>
                      );
                    })
                  )}
                </div>

                {/* Stagnant/crowded summary warning at bottom */}
                {isCrowded && (
                  <div className="mt-2 p-1.5 bg-antiquegold/5 border border-antiquegold/10 rounded-lg text-center">
                    <span className="text-[8px] font-mono font-black text-antiquegold block">
                      SCROLLABLE OVERFLOW • {colLeads.length} DEALS ACTIVE
                    </span>
                  </div>
                )}

              </div>
            );
          })}

        </div>
        
        {/* Helper bottom line */}
        <div className="hidden lg:flex items-center justify-center gap-1.5 p-4 bg-white/40 border border-border/80 rounded-2xl text-[10px] font-mono text-warmgray font-bold">
          <Info className="w-4 h-4 text-antiquegold" />
          <span>{t.dragTooltip}</span>
        </div>

      </div>

      {/* ==========================================
          MODAL 1: MANDATORY QUOTE COMPILE DIALOG
          ========================================== */}
      <AnimatePresence>
        {pendingTransition && pendingTransition.targetStage === 'quoted' && (
          <div className="fixed inset-0 bg-charcoal/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-antiquegold/20 p-6 max-w-md w-full shadow-2xl space-y-5"
            >
              <div className="flex items-center gap-3 text-antiquegold">
                <div className="p-3 bg-antiquegold/10 rounded-2xl">
                  <FileText className="w-6 h-6 text-antiquegold" />
                </div>
                <div>
                  <h3 className="font-serif text-lg font-black text-charcoal">{t.quotaPromptTitle}</h3>
                  <p className="text-[10px] text-warmgray font-bold uppercase tracking-wider">Ascension Automation Control</p>
                </div>
              </div>

              <p className="text-xs text-warmgray leading-relaxed">
                {t.quotaPromptDesc}
              </p>

              <div className="space-y-4">
                
                {/* Proposed price */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-black tracking-widest text-warmgray">{t.quotaPrice}</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={quotePrice}
                      onChange={(e) => setQuotePrice(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-alabaster rounded-xl text-sm font-black text-charcoal border border-border focus:ring-1 focus:ring-antiquegold outline-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono font-black text-warmgray">INR</span>
                  </div>
                </div>

                {/* Technical specs prefilled/editable */}
                <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-black text-warmgray block">Drive Mechanism</label>
                    <select 
                      value={quoteDrive} 
                      onChange={(e) => setQuoteDrive(e.target.value)}
                      className="w-full p-2 bg-alabaster rounded-xl border border-border text-[11px] font-bold"
                    >
                      <option value="Gearless Traction System">Gearless Traction (1.0m/s)</option>
                      <option value="Geared Traction System">Geared Traction (0.63m/s)</option>
                      <option value="Premium Hydraulic System">Hydraulic System (Silent)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-black text-warmgray block">Cabin Capacity</label>
                    <select 
                      value={quoteCapacity} 
                      onChange={(e) => setQuoteCapacity(e.target.value)}
                      className="w-full p-2 bg-alabaster rounded-xl border border-border text-[11px] font-bold"
                    >
                      <option value="4 Persons (272 kg)">4 Persons (272 kg)</option>
                      <option value="6 Persons (408 kg)">6 Persons (408 kg)</option>
                      <option value="8 Persons (544 kg)">8 Persons (544 kg)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-black text-warmgray block">Cabin Interior Finish</label>
                  <select 
                    value={quoteCabin} 
                    onChange={(e) => setQuoteCabin(e.target.value)}
                    className="w-full p-2 bg-alabaster rounded-xl border border-border text-[11px] font-bold"
                  >
                    <option value="Hairline Finished Stainless Steel">Hairline Finish Stainless Steel</option>
                    <option value="Mirror Finished Golden Gold SS">Mirror Finished Golden Gold SS</option>
                    <option value="Scenic Panoramic Glass Side Wall">Scenic Panoramic Glass Cabin</option>
                  </select>
                </div>

              </div>

              <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setPendingTransition(null)}
                  className="flex-1 py-2 text-xs font-bold"
                >
                  {t.cancel}
                </Button>
                <Button 
                  variant="primary" 
                  onClick={() => {
                    if (!quotePrice || quotePrice <= 0) {
                      triggerToast(t.quoteRequired, "warning");
                      return;
                    }
                    performStageUpdate(pendingTransition.lead, 'quoted', quotePrice);
                    setPendingTransition(null);
                  }}
                  className="flex-1 py-2 text-xs font-bold"
                >
                  {t.quotaBtn}
                </Button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==========================================
          MODAL 2: SIGNED CONTRACT VERIFICATION
          ========================================== */}
      <AnimatePresence>
        {pendingTransition && pendingTransition.targetStage === 'closed_won' && (
          <div className="fixed inset-0 bg-charcoal/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-border p-6 max-w-md w-full shadow-2xl space-y-5"
            >
              <div className="flex items-center gap-3 text-royalemerald">
                <div className="p-3 bg-royalemerald/10 rounded-2xl">
                  <FileSignature className="w-6 h-6 text-royalemerald" />
                </div>
                <div>
                  <h3 className="font-serif text-lg font-black text-charcoal">{t.wonPromptTitle}</h3>
                  <p className="text-[10px] text-warmgray font-bold uppercase tracking-wider">Legal Validation Center</p>
                </div>
              </div>

              <div className="p-4 bg-alabaster rounded-2xl border border-border/80 text-xs text-charcoal space-y-2.5">
                <div className="flex items-start gap-2 text-warning font-bold">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>Downstream Liability Protection Active</span>
                </div>
                <p className="text-[11px] text-warmgray leading-relaxed">
                  {t.wonPromptDesc}
                </p>
              </div>

              {/* Checkbox */}
              <label className="flex items-start gap-3 p-3 bg-royalemerald/5 rounded-2xl border border-royalemerald/15 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isContractChecked}
                  onChange={(e) => setIsContractChecked(e.target.checked)}
                  className="w-5 h-5 rounded border-border text-royalemerald focus:ring-royalemerald mt-0.5 cursor-pointer"
                />
                <span className="text-xs font-bold text-charcoal leading-snug">
                  {t.wonContractCheckbox}
                </span>
              </label>

              <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setPendingTransition(null)}
                  className="flex-1 py-2 text-xs font-bold"
                >
                  {t.cancel}
                </Button>
                <Button 
                  variant="emerald" 
                  onClick={() => {
                    if (!isContractChecked) {
                      triggerToast(t.contractRequired, "warning");
                      return;
                    }
                    performStageUpdate(pendingTransition.lead, 'closed_won');
                    setPendingTransition(null);
                  }}
                  className="flex-1 py-2 text-xs font-bold"
                >
                  {t.wonBtn}
                </Button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==========================================
          MODAL 3: CONFLICT SIMULATOR NOTIFICATION
          ========================================== */}
      <AnimatePresence>
        {showConflictModal && (
          <div className="fixed inset-0 bg-charcoal/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-warning/20 p-6 max-w-sm w-full shadow-2xl text-center space-y-4"
            >
              <div className="w-12 h-12 bg-warning/10 text-warning rounded-full flex items-center justify-center mx-auto">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="font-serif text-base font-black text-charcoal">{t.conflictTitle}</h4>
                <p className="text-[10px] text-warmgray uppercase tracking-widest font-mono font-bold">Concurrent Modification Filter</p>
              </div>
              <p className="text-xs text-warmgray leading-relaxed">
                {conflictMessage}
              </p>
              <Button 
                variant="primary" 
                fullWidth 
                onClick={() => setShowConflictModal(false)}
                className="py-2.5 text-xs font-bold"
              >
                ✓ Resolve Sync Board
              </Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==========================================
          TOAST FEEDBACK PANEL
          ========================================== */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className={`fixed bottom-6 right-6 z-50 rounded-xl p-3.5 shadow-xl border text-xs font-bold flex items-center gap-2.5 max-w-sm ${
              toast.type === 'warning'
                ? 'bg-amber-50 border-warning text-warning'
                : 'bg-charcoal text-white border-antiquegold/20'
            }`}
          >
            {toast.type === 'warning' ? (
              <AlertCircle className="w-4 h-4 text-warning shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            )}
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
