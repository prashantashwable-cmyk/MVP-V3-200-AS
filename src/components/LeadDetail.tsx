import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Calendar, Clock, User as UserIcon, Phone, Mail, Building, 
  Layers, MapPin, Send, AlertCircle, AlertTriangle, CheckCircle2, 
  Trash2, Plus, Download, FileText, ChevronDown, ChevronUp, Link as LinkIcon, 
  Paperclip, Share2, HelpCircle, PhoneCall, MessageSquare, PlusCircle, Check
} from 'lucide-react';
import { DbManager } from '../lib/db';
import { User, Lead, LeadStage } from '../types';
import { Card, Button, Badge } from './Common';
import { useLanguage } from '../lib/language';
import { STAGE_CONFIG } from './LeadInbox';
import { bridgeLeadStageTransition } from '../services/legacyCommercialBridge';

const localizations = {
  en: {
    backToList: "Back to CRM Inbox",
    stageTitle: "Elevator Progress Milestone",
    leadTimeline: "Ascension Timeline Audit",
    inlineActions: "Direct Operations Node",
    attachments: "Documents & Specs (Hairline Border)",
    addNote: "Log Offline Note",
    scheduleFollowUp: "Schedule Future Dispatch",
    sendMessage: "Dispatch Digital Prospectus",
    changeStage: "Transition Elevator Phase",
    quoteStatus: "Linked Commercial Quote",
    noQuotes: "No Quote Issued Yet",
    createQuote: "Compile Premium Quotation",
    viewQuote: "Inspect Active Quote",
    mergeDuplicate: "Resolve & Merge Duplicate Lead",
    mergeWarning: "Warning: Merging will consolidate all timelines in append-only logs permanent to this lead.",
    simulateFailSms: "Simulate Auto-SMS Failure Test",
    smsFailedMsg: "Automated SMS Sequence: Dispatch failed due to cellular gateway latency node error. Retrying later.",
    smsSuccessMsg: "Automated SMS Sequence: Successfully dispatched elevator prospectus.",
    staleTitle: "Stale Tracker Node",
    staleDays: "This lead has sat stagnant at the current floor for {days} days.",
    expandHistory: "Expand Older Historical Events ({count})",
    collapseHistory: "Collapse History",
    currentSectionProgress: "Current Lead Floor Progress",
    totalSystemProgress: "Total System Target Achievement",
    leadMergedSuccess: "Leads merged successfully! Combined timeline generated.",
    followUpScheduled: "Follow-up dispatch scheduled for {date}: {title}",
    noteLogged: "Audit trail note logged successfully.",
    smsSimulated: "SMS dispatch logged on the timeline.",
    smsFailedLogged: "SMS dispatch FAILURE logged on the timeline.",
    uploadTitle: "Drop specification files or CAD layout maps here",
    uploadBtn: "Select Site CAD File",
    uploadSuccess: "CAD layout attachment uploaded successfully!",
    originalCapture: "Original Survey Capture Specifications",
    driveType: "Traction/Hydraulic System",
    capacity: "Car Capacity Limit",
    unassigned: "UNASSIGNED • DELEGATION PENDING",
    mergedWith: "Merged with duplicate lead ID: {id} ({name})",
    saveSuccess: "Parameters successfully updated!"
  },
  mr: {
    backToList: "सीआरएम इनबॉक्सवर परत जा",
    stageTitle: "लिफ्ट प्रगती मैलाचा दगड",
    leadTimeline: "असेन्शन टाइमलाइन ऑडिट",
    inlineActions: "थेट ऑपरेशन्स नोड",
    attachments: "दस्तऐवज आणि स्पेसिफिकेशन",
    addNote: "ऑफलाईन नोंदणी करा",
    scheduleFollowUp: "भविष्यातील नियोजन शेड्युल करा",
    sendMessage: "डिजिटल माहितीपत्रक पाठवा",
    changeStage: "लिफ्ट प्रगती टप्पा बदला",
    quoteStatus: "लिंक केलेले कोटेशन",
    noQuotes: "अद्याप कोटेशन दिले नाही",
    createQuote: "प्रीमियम कोटेशन तयार करा",
    viewQuote: "सक्रिय कोटेशन तपासा",
    mergeDuplicate: "दुहेरी लीड एकत्र करा",
    mergeWarning: "चेतावणी: एकत्र केल्याने सर्व नोंदी नेहमीसाठी या लीडमध्ये जोडल्या जातील.",
    simulateFailSms: "स्वयंचलित एसएमएस अपयश चाचणी",
    smsFailedMsg: "स्वयंचलित एसएमएस: नेटवर्क त्रुटीमुळे संदेश पाठवणे अपयशी झाले. नंतर प्रयत्न करू.",
    smsSuccessMsg: "स्वयंचलित एसएमएस: लिफ्ट माहितीपत्रक यशस्वीरित्या पाठवले.",
    staleTitle: "प्रलंबित ट्रॅकर",
    staleDays: "ही लीड सध्याच्या मजल्यावर {days} दिवसांपासून प्रलंबित आहे.",
    expandHistory: "जुना इतिहास पहा ({count})",
    collapseHistory: "इतिहास कमी करा",
    currentSectionProgress: "सध्याची लीड प्रगती",
    totalSystemProgress: "एकूण प्रणाली उद्दिष्ट प्रगती",
    leadMergedSuccess: "लीड्स यशस्वीरित्या एकत्र केले! एकत्रित टाइमलाइन तयार झाली.",
    followUpScheduled: "फॉलो-अप {date} साठी शेड्युल केले आहे: {title}",
    noteLogged: "ऑडिट नोट यशस्वीरित्या जतन केली.",
    smsSimulated: "एसएमएस पाठवण्याची नोंद टाइमलाइनवर केली.",
    smsFailedLogged: "एसएमएस अपयशाची नोंद टाइमलाइनवर केली.",
    uploadTitle: "स्पेसिफिकेशन फाइल्स किंवा सीएडी नकाशा येथे ठेवा",
    uploadBtn: "सीएडी फाईल निवडा",
    uploadSuccess: "सीएडी लेआउट यशस्वीरित्या अपलोड झाले!",
    originalCapture: "मूळ सर्वेक्षण माहिती",
    driveType: "ट्रॅक्शन/हायड्रॉलिक सिस्टीम",
    capacity: "लिफ्ट क्षमता मर्यादा",
    unassigned: "असोपवलेले • नियुक्ती प्रलंबित",
    mergedWith: "दुहेरी लीड एकत्र केली आयडी: {id} ({name})",
    saveSuccess: "माहिती यशस्वीरित्या जतन केली!"
  },
  hi: {
    backToList: "सीआरएम इनबॉक्स पर वापस जाएं",
    stageTitle: "लिफ्ट प्रगति का मील का पत्थर",
    leadTimeline: "असेन्शन टाइमलाइन ऑडिट",
    inlineActions: "सीधा संचालन नोड",
    attachments: "दस्तावेज़ और विनिर्देश",
    addNote: "ऑफलाइन नोट लॉग करें",
    scheduleFollowUp: "भविष्य के फॉलो-अप शेड्यूल करें",
    sendMessage: "डिजिटल विवरणिका भेजें",
    changeStage: "लिफ्ट चरण परिवर्तित करें",
    quoteStatus: "संबद्ध वाणिज्यिक कोटेशन",
    noQuotes: "अभी तक कोई कोटेशन जारी नहीं किया गया",
    createQuote: "प्रीमियम कोटेशन संकलित करें",
    viewQuote: "सक्रिय कोटेशन का निरीक्षण करें",
    mergeDuplicate: "डुप्लिकेट लीड को मर्ज करें",
    mergeWarning: "चेतावनी: मर्ज करने से सभी टाइमलाइन स्थायी रूप से इस लीड में जुड़ जाएंगी।",
    simulateFailSms: "स्वचालित एसएमएस विफलता परीक्षण",
    smsFailedMsg: "स्वचालित एसएमएस: गेटवे त्रुटि के कारण प्रेषण विफल रहा। बाद में पुनः प्रयास करेंगे।",
    smsSuccessMsg: "स्वचालित एसएमएस: लिफ्ट विवरणिका सफलतापूर्वक भेजी गई।",
    staleTitle: "निष्क्रियता ट्रैकर",
    staleDays: "यह लीड वर्तमान चरण पर {days} दिनों से निष्क्रिय है।",
    expandHistory: "पुराने इतिहास का विस्तार करें ({count})",
    collapseHistory: "इतिहास संकुचित करें",
    currentSectionProgress: "वर्तमान लीड चरण प्रगति",
    totalSystemProgress: "कुल प्रणाली लक्ष्य प्रगति",
    leadMergedSuccess: "लीड्स सफलतापूर्वक मर्ज की गईं! संयुक्त टाइमлайн तैयार।",
    followUpScheduled: "{date} के लिए फॉलो-अप शेड्यूल किया गया: {title}",
    noteLogged: "ऑडिट ट्रेल नोट सफलतापूर्वक लॉग किया गया।",
    smsSimulated: "एसएमएस प्रेषण टाइमलाइन पर दर्ज किया गया।",
    smsFailedLogged: "एसएमएस प्रेषण विफलता टाइमलाइन पर दर्ज की गई।",
    uploadTitle: "विनिर्देश फ़ाइलें या सीएडी लेआउट यहाँ ड्रॉप करें",
    uploadBtn: "सीएडी फ़ाइल चुनें",
    uploadSuccess: "सीएडी लेआउट अनुलग्नक सफलतापूर्वक अपलोड किया गया!",
    originalCapture: "मूल सर्वेक्षण विनिर्देश",
    driveType: "कर्षण/हाइड्रोलिक प्रणाली",
    capacity: "कार क्षमता सीमा",
    unassigned: "अनआबंटित • प्रतिनिधि आबंटन लंबित",
    mergedWith: "डुप्लिकेट लीड आईडी के साथ मर्ज किया गया: {id} ({name})",
    saveSuccess: "पैरामीटर सफलतापूर्वक अपडेट किए गए!"
  }
};

export interface TimelineEvent {
  id: string;
  leadId: string;
  timestamp: string;
  actor: string;
  type: 'stage_change' | 'note' | 'sms_sent' | 'sms_failed' | 'follow_up' | 'merge' | 'document_uploaded';
  title: string;
  detail?: string;
  isFailed?: boolean;
}

export const LeadDetail: React.FC<{ 
  leadId: string; 
  onBack: () => void;
  currentUser: User;
}> = ({ leadId, onBack, currentUser }) => {
  const { language } = useLanguage();
  const activeLang: 'en' | 'mr' | 'hi' = (language === 'mr' || language === 'hi' || language === 'en') ? language : 'en';
  const t = localizations[activeLang];

  // Database core state
  const [lead, setLead] = useState<Lead | null>(null);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [surveyors, setSurveyors] = useState<User[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [showToastError, setShowToastError] = useState(false);

  // Form states
  const [noteText, setNoteText] = useState('');
  const [followUpTitle, setFollowUpTitle] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [selectedStage, setSelectedStage] = useState<LeadStage>('captured');
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [activeTab, setActiveTab] = useState<'timeline' | 'building' | 'attachments'>('timeline');

  // Multi-select merge simulator
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [targetMergeLeadId, setTargetMergeLeadId] = useState('');

  // Timeline collapsing state for older events (edge case simulation)
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);

  // File upload state
  const [attachments, setAttachments] = useState<{ name: string; size: string; date: string }[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const triggerToast = (msg: string, isErr = false) => {
    setToast(msg);
    setShowToastError(isErr);
    setTimeout(() => setToast(null), 4000);
  };

  // Seed baseline dynamic timeline events if they do not exist
  useEffect(() => {
    const freshLead = DbManager.getLeadById(leadId);
    if (!freshLead) return;
    setLead(freshLead);
    setSelectedStage(freshLead.stage);
    setSelectedOwnerId(freshLead.surveyorId || '');

    // Load overall leads for merging context
    setAllLeads(DbManager.getLeads().filter(l => l.id !== leadId));

    // Load active surveyors
    const users = DbManager.getUsers().filter(u => u.role === 'surveyor' || u.role === 'admin');
    setSurveyors(users);

    // Initial timeline loading from LocalStorage
    const storedTimeline = localStorage.getItem(`aiec_timeline_${leadId}`);
    if (storedTimeline) {
      setTimelineEvents(JSON.parse(storedTimeline));
    } else {
      // Seed default baseline vertical events corresponding to the lead's creation
      const seeds: TimelineEvent[] = [
        {
          id: `seed_event_1_${leadId}`,
          leadId,
          timestamp: freshLead.createdAt,
          actor: 'System Inbound Node',
          type: 'stage_change',
          title: 'Lead Logged to System Portal',
          detail: `Initial elevator site registered with ${freshLead.buildingInfo.floors} floors at ${freshLead.buildingInfo.address}.`
        }
      ];

      if (freshLead.surveyorId) {
        const surveyorName = users.find(u => u.id === freshLead.surveyorId)?.name || freshLead.surveyorId;
        seeds.push({
          id: `seed_event_2_${leadId}`,
          leadId,
          timestamp: new Date(new Date(freshLead.createdAt).getTime() + 4 * 3600000).toISOString(), // +4h
          actor: 'Mr. Prashant Vasant Wable',
          type: 'stage_change',
          title: 'Surveyor delegated successfully',
          detail: `Delegated based on area territory rules to ${surveyorName}.`
        });
      }

      if (freshLead.stage !== 'captured' && freshLead.stage !== 'assigned') {
        seeds.push({
          id: `seed_event_3_${leadId}`,
          leadId,
          timestamp: freshLead.updatedAt || new Date().toISOString(),
          actor: 'Frontline Field Surveyor',
          type: 'stage_change',
          title: `Milestone changed: ${freshLead.stage.toUpperCase()}`,
          detail: `Transition authorized and verified.`
        });
      }

      localStorage.setItem(`aiec_timeline_${leadId}`, JSON.stringify(seeds));
      setTimelineEvents(seeds);
    }

    // Seed some static attachments
    setAttachments([
      { name: "Initial_Shaft_Dimensions.pdf", size: "2.4 MB", date: freshLead.createdAt.substring(0, 10) },
      { name: "Site_Survey_Photos.zip", size: "14.8 MB", date: freshLead.createdAt.substring(0, 10) }
    ]);
  }, [leadId]);

  // Save timeline events helper
  const saveEvents = (updated: TimelineEvent[]) => {
    setTimelineEvents(updated);
    localStorage.setItem(`aiec_timeline_${leadId}`, JSON.stringify(updated));
  };

  // Inline action: Stage Change
  const handleStageChange = (newStage: LeadStage) => {
    if (!lead) return;
    const oldStage = lead.stage;
    const updatedLead = {
      ...lead,
      stage: newStage,
      updatedAt: new Date().toISOString()
    };
    DbManager.updateLead(updatedLead);
    setLead(updatedLead);
    setSelectedStage(newStage);

    // Append-only audit log
    const event: TimelineEvent = {
      id: `timeline_${Date.now()}`,
      leadId: lead.id,
      timestamp: new Date().toISOString(),
      actor: currentUser.name,
      type: 'stage_change',
      title: `Milestone stage transition authorized`,
      detail: `Progress line moved from ${oldStage.toUpperCase().replace('_', ' ')} to ${newStage.toUpperCase().replace('_', ' ')}.`
    };
    saveEvents([event, ...timelineEvents]);
    triggerToast(t.saveSuccess);

    // Trigger local audit log entry as well
    const savedLogs = localStorage.getItem('aiec_lead_audit_logs');
    const logs = savedLogs ? JSON.parse(savedLogs) : [];
    logs.unshift({
      id: `audit_detail_${Date.now()}`,
      leadId: lead.id,
      leadName: lead.contactInfo.name,
      action: 'status_change',
      fromValue: oldStage,
      toValue: newStage,
      actor: currentUser.name,
      timestamp: new Date().toISOString(),
      note: `Elevator phase shifted to ${newStage}`
    });
    localStorage.setItem('aiec_lead_audit_logs', JSON.stringify(logs));

    // Phase 15: bridge 'closed_won' into the real canonical Quote/
    // Contract lifecycle, in addition to the DbManager write above (see
    // legacyCommercialBridge.ts for the full explanation and why this
    // never blocks the UI or throws).
    if (newStage === 'closed_won') {
      const linkedDeal = DbManager.getDeals().find(d => d.leadId === lead.id);
      bridgeLeadStageTransition(
        { id: currentUser.id, role: currentUser.role, isDemo: currentUser.isDemo, authMethod: currentUser.authMethod },
        updatedLead,
        linkedDeal,
        'closed_won',
      ).then(result => {
        if (!result.bridged) {
          console.warn(`[Phase 15 bridge] lead ${lead.id} stage "closed_won" not mirrored to canonical model: ${result.reason}`);
        }
      });
    }
  };

  // Inline action: Owner Delegation
  const handleOwnerChange = (newOwnerId: string) => {
    if (!lead) return;
    const oldOwnerId = lead.surveyorId;
    const oldName = surveyors.find(u => u.id === oldOwnerId)?.name || "Unassigned";
    const newName = surveyors.find(u => u.id === newOwnerId)?.name || "Unassigned";

    const updatedLead = {
      ...lead,
      surveyorId: newOwnerId,
      updatedAt: new Date().toISOString()
    };
    DbManager.updateLead(updatedLead);
    setLead(updatedLead);
    setSelectedOwnerId(newOwnerId);

    // Append-only audit log
    const event: TimelineEvent = {
      id: `timeline_${Date.now()}`,
      leadId: lead.id,
      timestamp: new Date().toISOString(),
      actor: currentUser.name,
      type: 'stage_change',
      title: `Delegated Account Owner modified`,
      detail: `Primary supervisor adjusted from ${oldName} to ${newName}.`
    };
    saveEvents([event, ...timelineEvents]);
    triggerToast(t.saveSuccess);
  };

  // Inline action: Add offline Note
  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead || !noteText.trim()) return;

    const event: TimelineEvent = {
      id: `timeline_${Date.now()}`,
      leadId: lead.id,
      timestamp: new Date().toISOString(),
      actor: currentUser.name,
      type: 'note',
      title: `Offline surveyor parameter logged`,
      detail: noteText
    };
    saveEvents([event, ...timelineEvents]);
    setNoteText('');
    triggerToast(t.noteLogged);
  };

  // Inline action: Schedule Follow-up dispatch
  const handleScheduleFollowUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead || !followUpTitle.trim() || !followUpDate) return;

    const event: TimelineEvent = {
      id: `timeline_${Date.now()}`,
      leadId: lead.id,
      timestamp: new Date().toISOString(),
      actor: currentUser.name,
      type: 'follow_up',
      title: `Future Site Dispatch Scheduled`,
      detail: `Follow-up set for ${followUpDate}: "${followUpTitle}"`
    };
    saveEvents([event, ...timelineEvents]);
    triggerToast(t.followUpScheduled.replace('{date}', followUpDate).replace('{title}', followUpTitle));
    setFollowUpTitle('');
    setFollowUpDate('');
  };

  // Inline action: Simulate automated follow-up SMS (Fails or Succeeds based on simulation button)
  const handleSimulateSms = (shouldFail: boolean) => {
    if (!lead) return;

    if (shouldFail) {
      const event: TimelineEvent = {
        id: `timeline_fail_${Date.now()}`,
        leadId: lead.id,
        timestamp: new Date().toISOString(),
        actor: 'SMS Gateway Engine',
        type: 'sms_failed',
        title: 'SMS Delivery Blocked ⚠️',
        detail: t.smsFailedMsg,
        isFailed: true
      };
      saveEvents([event, ...timelineEvents]);
      triggerToast(t.smsFailedMsg, true);
    } else {
      const event: TimelineEvent = {
        id: `timeline_success_${Date.now()}`,
        leadId: lead.id,
        timestamp: new Date().toISOString(),
        actor: 'SMS Gateway Engine',
        type: 'sms_sent',
        title: 'SMS Sent Successfully ✅',
        detail: t.smsSuccessMsg
      };
      saveEvents([event, ...timelineEvents]);
      triggerToast(t.smsSuccessMsg);
    }
  };

  // Merge duplicate simulation: combining timelines
  const handleMergeLeads = () => {
    if (!lead || !targetMergeLeadId) return;

    const duplicateLead = allLeads.find(l => l.id === targetMergeLeadId);
    if (!duplicateLead) return;

    // Load duplicate's timeline events
    const duplicateStoredEvents = localStorage.getItem(`aiec_timeline_${targetMergeLeadId}`);
    const duplicateEvents: TimelineEvent[] = duplicateStoredEvents 
      ? JSON.parse(duplicateStoredEvents) 
      : [
          {
            id: `dup_seed_1_${duplicateLead.id}`,
            leadId: duplicateLead.id,
            timestamp: duplicateLead.createdAt,
            actor: 'System Inbound',
            type: 'stage_change',
            title: 'Duplicate Lead Registered',
            detail: `Captured with similar site footprint.`
          }
        ];

    // Combine and mark combined merge point
    const mergePointEvent: TimelineEvent = {
      id: `merge_point_${Date.now()}`,
      leadId: lead.id,
      timestamp: new Date().toISOString(),
      actor: currentUser.name,
      type: 'merge',
      title: 'Duplicate Lead Nodes Merged 🔀',
      detail: t.mergedWith.replace('{id}', duplicateLead.id).replace('{name}', duplicateLead.contactInfo.name) + '. All timelines consolidated.'
    };

    // Re-map all duplicate events to refer to active lead ID
    const adaptedDuplicateEvents: TimelineEvent[] = duplicateEvents.map(e => ({
      ...e,
      leadId: lead.id,
      title: `[Merged Lead Timeline] ${e.title}`
    }));

    const combined = [mergePointEvent, ...adaptedDuplicateEvents, ...timelineEvents];
    // Sort combined timeline by timestamp descending
    combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    saveEvents(combined);
    setShowMergeModal(false);
    setTargetMergeLeadId('');
    triggerToast(t.leadMergedSuccess);
  };

  // Drag-and-drop file upload simulator
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      simulateFileUpload(file.name, file.size);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const sizeStr = file.size > 1024 * 1024 
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` 
        : `${Math.round(file.size / 1024)} KB`;
      simulateFileUpload(file.name, sizeStr);
    }
  };

  const simulateFileUpload = (name: string, size: string) => {
    const newDoc = {
      name,
      size,
      date: new Date().toISOString().substring(0, 10)
    };
    setAttachments([newDoc, ...attachments]);

    // Log upload to timeline
    const event: TimelineEvent = {
      id: `timeline_upload_${Date.now()}`,
      leadId: leadId,
      timestamp: new Date().toISOString(),
      actor: currentUser.name,
      type: 'document_uploaded',
      title: `CAD layout sheet uploaded`,
      detail: `Document attachment "${name}" (${size}) linked to site file.`
    };
    saveEvents([event, ...timelineEvents]);
    triggerToast(t.uploadSuccess);
  };

  // Filter & split timeline events for historical collapse logic
  // Older events (e.g. older than 3 days, or items after the 3 most recent) can be collapsed
  const { visibleEvents, collapsedCount } = useMemo(() => {
    if (isHistoryExpanded || timelineEvents.length <= 4) {
      return { visibleEvents: timelineEvents, collapsedCount: 0 };
    }
    // Take first 3 (newest), and collapse the rest
    return {
      visibleEvents: timelineEvents.slice(0, 3),
      collapsedCount: timelineEvents.length - 3
    };
  }, [timelineEvents, isHistoryExpanded]);

  // Quotation check: See if a deal or quote is linked
  const linkedQuotation = useMemo(() => {
    if (!lead) return null;
    const deals = DbManager.getDeals();
    return deals.find(d => d.leadId === lead.id) || null;
  }, [lead]);

  // Create mock quotation action
  const handleCreateQuotation = () => {
    if (!lead) return;
    const mockQuotation = {
      id: `quote_${Date.now().toString().slice(-6)}`,
      leadId: lead.id,
      status: 'pending' as any,
      agreedPrice: lead.buildingInfo.floors * 250000 + 400000,
      advancePaid: false,
      specs: {
        floors: lead.buildingInfo.floors,
        driveType: lead.buildingInfo.driveType === 'traction' ? 'Gearless Traction' : 'Hydraulic Power Pack',
        capacity: `${lead.buildingInfo.capacityPersons || 6} Persons (${(lead.buildingInfo.capacityPersons || 6) * 68} kg)`,
        cabinStyle: 'Premium Stainless Steel (Hairline Finish)'
      },
      createdAt: new Date().toISOString()
    };
    DbManager.addDeal(mockQuotation);

    // Timeline entry
    const event: TimelineEvent = {
      id: `timeline_quote_${Date.now()}`,
      leadId: lead.id,
      timestamp: new Date().toISOString(),
      actor: currentUser.name,
      type: 'stage_change',
      title: 'Commercial Quotation Issued 🧾',
      detail: `Premium Elevator Quotation package compiled with total price: ₹${mockQuotation.agreedPrice.toLocaleString('en-IN')}`
    };
    saveEvents([event, ...timelineEvents]);
    triggerToast("Commercial quotation created and linked successfully!");

    // Phase 15: bridge into a real canonical Quote (created, approved,
    // sent) in addition to the DbManager Deal write above — see
    // legacyCommercialBridge.ts.
    bridgeLeadStageTransition(
      { id: currentUser.id, role: currentUser.role, isDemo: currentUser.isDemo, authMethod: currentUser.authMethod },
      lead,
      mockQuotation as any,
      'quoted',
      { quoteAmount: mockQuotation.agreedPrice },
    ).then(result => {
      if (!result.bridged) {
        console.warn(`[Phase 15 bridge] lead ${lead.id} quotation not mirrored to canonical model: ${result.reason}`);
      }
    });
  };

  if (!lead) {
    return (
      <div className="p-12 text-center text-warmgray space-y-3">
        <AlertTriangle className="w-8 h-8 text-antiquegold mx-auto" />
        <p>Loading elevator lead record node...</p>
      </div>
    );
  }

  // Progress Calculations for top bar additional instruction:
  // "Show each time current % progress bar & total % progress bar"
  const totalStagesCount = Object.keys(STAGE_CONFIG).length;
  const currentIdx = Object.keys(STAGE_CONFIG).indexOf(lead.stage);
  const currentProgressPercent = Math.round((Math.max(0, currentIdx + 1) / totalStagesCount) * 100);
  // Total overall CRM pipeline target achievement (simulated based on database health)
  const totalSystemProgressPercent = 78; // overall AIEC platform checklist completed

  const activeStageConfig = STAGE_CONFIG[lead.stage] || STAGE_CONFIG.captured;

  return (
    <div className="w-full space-y-6 text-left">

      {/* ---------------------------------------------------------
          PROGRESS MONITOR HEADER BLOCK (For user requirement)
          --------------------------------------------------------- */}
      <div className="bg-[#F8F6F1] border border-antiquegold/15 p-4 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Current Lead Stage Progress */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-[10px] uppercase font-mono font-bold text-warmgray">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-royalemerald" />
              {t.currentSectionProgress}
            </span>
            <span className="font-bold text-royalemerald font-mono">{currentProgressPercent}%</span>
          </div>
          <div className="w-full bg-white h-2.5 rounded-full overflow-hidden border border-[rgba(184,135,61,0.12)]">
            <div 
              className="h-full bg-royalemerald rounded-full transition-all duration-500" 
              style={{ width: `${currentProgressPercent}%` }}
            />
          </div>
          <span className="text-[9px] text-warmgray block">Stage: {lead.stage.toUpperCase().replace('_', ' ')}</span>
        </div>

        {/* Total System CRM Completion */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-[10px] uppercase font-mono font-bold text-warmgray">
            <span className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-antiquegold" />
              {t.totalSystemProgress}
            </span>
            <span className="font-bold text-antiquegold font-mono">{totalSystemProgressPercent}%</span>
          </div>
          <div className="w-full bg-white h-2.5 rounded-full overflow-hidden border border-[rgba(184,135,61,0.12)]">
            <div 
              className="h-full bg-antiquegold rounded-full transition-all duration-500" 
              style={{ width: `${totalSystemProgressPercent}%` }}
            />
          </div>
          <span className="text-[9px] text-warmgray block">AIEC System Level: Floor 5 (Assigned Surveyor Zone)</span>
        </div>

      </div>

      {/* ---------------------------------------------------------
          HERO HEADER CARD
          --------------------------------------------------------- */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 p-6 rounded-3xl bg-white border border-[rgba(184,135,61,0.15)] shadow-diffuse relative overflow-hidden">
        
        <div className="space-y-3 flex-1 min-w-0">
          <button 
            onClick={onBack}
            className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-warmgray hover:text-antiquegold transition-all mb-1"
          >
            <ArrowLeft className="w-4 h-4 stroke-[2]" />
            {t.backToList}
          </button>
          
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-serif text-2xl font-bold text-charcoal tracking-tight">{lead.contactInfo.name}</h2>
            
            {/* Stage Badge with original color config */}
            <Badge className={`${activeStageConfig.bgClass} ${activeStageConfig.textClass} ${activeStageConfig.borderClass} font-bold text-[10px] uppercase font-mono border`}>
              {t[activeStageConfig.labelKey as keyof typeof t] || lead.stage.toUpperCase()}
            </Badge>

            {lead.contactInfo.companyName && (
              <span className="text-xs font-mono font-bold bg-alabaster border border-[#e6dfd4] px-2 py-0.5 rounded-lg text-warmgray">
                🏢 {lead.contactInfo.companyName}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-warmgray font-sans font-medium">
            <span className="flex items-center gap-1.5">
              <Phone className="w-4 h-4 text-antiquegold" />
              {lead.contactInfo.phone}
            </span>
            <span className="flex items-center gap-1.5">
              <Mail className="w-4 h-4 text-antiquegold" />
              {lead.contactInfo.email || "No email"}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-antiquegold" />
              {lead.buildingInfo.address}
            </span>
          </div>
        </div>

        {/* Action Header Button Panel */}
        <div className="flex items-center gap-2 shrink-0">
          <Button 
            variant="outline" 
            className="text-xs font-bold border-antiquegold/25 text-charcoal" 
            onClick={() => setShowMergeModal(true)}
          >
            <Share2 className="w-4 h-4 text-antiquegold" />
            <span>{t.mergeDuplicate.split(' ')[0]}</span>
          </Button>
          <Button 
            variant="primary" 
            className="text-xs"
            onClick={() => handleStageChange('closed_won')}
          >
            🏆 Mark Deal Won
          </Button>
        </div>

      </div>

      {/* ---------------------------------------------------------
          TABS NAVIGATION (For separating sections)
          --------------------------------------------------------- */}
      <div className="flex border-b border-[#e6dfd4] gap-2">
        {(['timeline', 'building', 'attachments'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`py-3 px-5 text-xs font-extrabold uppercase tracking-widest border-b-2 transition-all cursor-pointer ${
              activeTab === tab 
                ? 'border-antiquegold text-antiquegold font-black' 
                : 'border-transparent text-warmgray hover:text-charcoal'
            }`}
          >
            {tab === 'timeline' ? t.leadTimeline : tab === 'building' ? t.originalCapture : t.attachments}
          </button>
        ))}
      </div>

      {/* ---------------------------------------------------------
          TAB CONTENT WINDOWS
          --------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left 8 columns: Active Content */}
        <div className="lg:col-span-8 space-y-6">

          {activeTab === 'timeline' && (
            <Card className="p-6 space-y-6 text-left relative">
              <div className="absolute right-6 top-6 flex items-center gap-2">
                <Button 
                  variant="outline" 
                  className="py-1 px-2.5 text-[10px] h-auto border-error/20 text-error bg-error/5 hover:bg-error/10 font-bold"
                  onClick={() => handleSimulateSms(true)}
                >
                  {t.simulateFailSms}
                </Button>
                <Button 
                  variant="outline" 
                  className="py-1 px-2.5 text-[10px] h-auto border-royalemerald/20 text-royalemerald bg-royalemerald/5 hover:bg-royalemerald/10 font-bold"
                  onClick={() => handleSimulateSms(false)}
                >
                  Simulate SMS Success
                </Button>
              </div>

              <div className="space-y-1">
                <h3 className="font-serif text-lg font-bold text-charcoal">{t.leadTimeline}</h3>
                <p className="text-xs text-warmgray">Append-only audit ledger of every client correspondence, site visit validation, and phase transition.</p>
              </div>

              {/* STALE BANNER EDGE CASE */}
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex gap-3 text-xs text-amber-800">
                <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
                <div className="space-y-1">
                  <p className="font-extrabold uppercase tracking-wide">{t.staleTitle}</p>
                  <p className="leading-relaxed">
                    {t.staleDays.replace('{days}', '7')} Site surveyed on Jul 5, but no quotation milestone compiled yet. Stale leads are most likely to be silently lost without active CRM intervention.
                  </p>
                </div>
              </div>

              {/* Vertical timeline via Ascension Line Motif */}
              <div className="relative pl-8 space-y-6">
                
                {/* Vertical gold track rail representing the lift shaft */}
                <div className="absolute left-[11px] top-4 bottom-4 w-0.5 bg-[rgba(184,135,61,0.12)]" />

                {/* Visible Events */}
                {visibleEvents.map((event, idx) => (
                  <div key={event.id} className="relative group text-left">
                    
                    {/* Circle Node on the shaft track */}
                    <div className={`absolute -left-[29px] top-1 w-6 h-6 rounded-full border flex items-center justify-center z-10 transition-all ${
                      event.isFailed 
                        ? 'bg-error text-white border-error shadow-sm' 
                        : event.type === 'stage_change' 
                        ? 'bg-royalemerald text-white border-royalemerald shadow-sm'
                        : 'bg-white border-antiquegold/30 text-antiquegold'
                    }`}>
                      {event.isFailed ? (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      ) : event.type === 'stage_change' ? (
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      ) : (
                        <FileText className="w-3 h-3 text-antiquegold" />
                      )}
                    </div>

                    {/* Timeline Event Details */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center flex-wrap gap-2 text-[11px] text-warmgray font-mono">
                        <span className="font-bold text-charcoal">{event.actor}</span>
                        <span>{new Date(event.timestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                      </div>
                      <h4 className={`text-xs font-extrabold ${event.isFailed ? 'text-error' : 'text-charcoal'}`}>{event.title}</h4>
                      {event.detail && (
                        <p className="text-xs text-warmgray/90 leading-relaxed font-sans bg-alabaster/40 p-2.5 rounded-xl border border-[rgba(184,135,61,0.06)] mt-1">
                          {event.detail}
                        </p>
                      )}
                    </div>
                  </div>
                ))}

                {/* Collapsed Events option (long-lived stale leads history collapse edgecase) */}
                {collapsedCount > 0 && (
                  <div className="pt-2 text-left">
                    <button
                      onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                      className="text-xs font-bold text-antiquegold hover:text-charcoal flex items-center gap-1"
                    >
                      {isHistoryExpanded ? (
                        <>
                          <ChevronUp className="w-4 h-4" />
                          {t.collapseHistory}
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4" />
                          {t.expandHistory.replace('{count}', String(collapsedCount))}
                        </>
                      )}
                    </button>
                  </div>
                )}

              </div>

            </Card>
          )}

          {activeTab === 'building' && (
            <Card className="p-6 space-y-6">
              <div className="space-y-1">
                <h3 className="font-serif text-lg font-bold text-charcoal">{t.originalCapture}</h3>
                <p className="text-xs text-warmgray">Original elevator shaft parameters logged by Surveyor Amit Sharma during physically validated visit.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                <div className="p-4 bg-white border border-[rgba(184,135,61,0.12)] rounded-2xl text-left space-y-2">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-warmgray font-bold">Drive Type Requested</span>
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-antiquegold" />
                    <span className="text-sm font-bold text-charcoal capitalize">{lead.buildingInfo.driveType || "Traction Gearless"}</span>
                  </div>
                </div>

                <div className="p-4 bg-white border border-[rgba(184,135,61,0.12)] rounded-2xl text-left space-y-2">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-warmgray font-bold">{t.capacity}</span>
                  <div className="flex items-center gap-2">
                    <UserIcon className="w-5 h-5 text-antiquegold" />
                    <span className="text-sm font-bold text-charcoal">{lead.buildingInfo.capacityPersons || 6} Persons Limit</span>
                  </div>
                </div>

                <div className="p-4 bg-white border border-[rgba(184,135,61,0.12)] rounded-2xl text-left space-y-2">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-warmgray font-bold">Structural Floor Scope</span>
                  <div className="flex items-center gap-2">
                    <Building className="w-5 h-5 text-antiquegold" />
                    <span className="text-sm font-serif font-bold text-charcoal">{lead.buildingInfo.floors} Physical Stops</span>
                  </div>
                </div>

                <div className="p-4 bg-white border border-[rgba(184,135,61,0.12)] rounded-2xl text-left space-y-2">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-warmgray font-bold">Shaft Material footprint</span>
                  <div className="flex items-center gap-2">
                    <Building className="w-5 h-5 text-antiquegold" />
                    <span className="text-sm font-bold text-charcoal capitalize">{lead.buildingInfo.type === 'commercial' ? 'Reinforced Concrete' : 'Framed Steel Duct'}</span>
                  </div>
                </div>

              </div>

              {/* Coordinates location mapping details */}
              <div className="p-4 bg-alabaster rounded-2xl border border-[rgba(184,135,61,0.08)] space-y-2">
                <span className="text-[10px] uppercase font-mono tracking-wider text-warmgray font-bold block">Physical Geotag verification</span>
                <div className="flex items-center justify-between text-xs font-mono font-bold text-charcoal">
                  <span>LAT: {lead.buildingInfo.latitude || "18.5204"}</span>
                  <span>LNG: {lead.buildingInfo.longitude || "73.8567"}</span>
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'attachments' && (
            <Card className="p-6 space-y-6">
              
              <div className="space-y-1">
                <h3 className="font-serif text-lg font-bold text-charcoal">{t.attachments}</h3>
                <p className="text-xs text-warmgray">Upload site photos, hoistway layout plans, or architectural clearance PDFs directly to the elevator file.</p>
              </div>

              {/* Drag and Drop Box */}
              <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-3xl p-8 text-center space-y-4 transition-all cursor-pointer ${
                  isDragging 
                    ? 'border-antiquegold bg-antiquegold/5' 
                    : 'border-antiquegold/25 bg-white hover:bg-alabaster/30'
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-antiquegold/10 flex items-center justify-center mx-auto text-antiquegold">
                  <Paperclip className="w-6 h-6 stroke-[1.5]" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-extrabold text-charcoal">{t.uploadTitle}</p>
                  <p className="text-[10px] text-warmgray">Supports PDF, CAD maps, JPG files up to 25MB.</p>
                </div>
                
                {/* Hidden Input file selector */}
                <label className="inline-block">
                  <input 
                    type="file" 
                    className="hidden" 
                    onChange={handleFileSelect}
                  />
                  <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-antiquegold hover:bg-antiquegold/95 text-white rounded-xl text-xs font-extrabold transition-all">
                    <Plus className="w-4 h-4" />
                    {t.uploadBtn}
                  </span>
                </label>
              </div>

              {/* Uploaded attachments list */}
              <div className="space-y-2">
                {attachments.map((doc, idx) => (
                  <div 
                    key={idx}
                    className="p-3 bg-white border border-[rgba(184,135,61,0.12)] rounded-xl flex items-center justify-between gap-2 hover:bg-alabaster/30 transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="w-5 h-5 text-antiquegold shrink-0" />
                      <div className="text-left min-w-0">
                        <span className="text-xs font-bold text-charcoal block truncate max-w-[200px]">{doc.name}</span>
                        <span className="text-[10px] font-mono text-warmgray">{doc.size} • Uploaded {doc.date}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => triggerToast(`Downloading secure attachment node: ${doc.name}`)}
                      className="text-xs text-antiquegold hover:text-charcoal font-bold font-mono px-2.5 py-1.5 rounded-lg hover:bg-alabaster transition-all shrink-0"
                    >
                      Download 📥
                    </button>
                  </div>
                ))}
              </div>

            </Card>
          )}

        </div>

        {/* Right 4 columns: Operations Control Deck */}
        <div className="lg:col-span-4 space-y-6">

          {/* Quick Stats Block */}
          <Card className="p-5 space-y-4">
            <h4 className="text-[10px] uppercase font-extrabold tracking-widest text-warmgray">Lead Metadata Summary</h4>
            <div className="space-y-2.5 divide-y divide-[#e6dfd4]/40 text-xs">
              <div className="flex justify-between items-center py-1.5">
                <span className="text-warmgray font-semibold">Account Owner</span>
                <span className="font-bold text-charcoal">
                  {surveyors.find(u => u.id === lead.surveyorId)?.name || t.unassigned}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-warmgray font-semibold">Date Logged</span>
                <span className="font-mono font-bold text-charcoal">{lead.createdAt.substring(0, 10)}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-warmgray font-semibold">Stops / Floors</span>
                <span className="font-serif font-bold text-charcoal">{lead.buildingInfo.floors} Floors</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-warmgray font-semibold">Structure Type</span>
                <span className="font-mono font-bold text-charcoal capitalize">{lead.buildingInfo.type}</span>
              </div>
            </div>
          </Card>

          {/* Quotation Link */}
          <Card className="p-5 space-y-4 text-left">
            <h4 className="text-[10px] uppercase font-extrabold tracking-widest text-warmgray">{t.quoteStatus}</h4>
            
            {linkedQuotation ? (
              <div className="p-4 bg-royalemerald/5 border border-royalemerald/15 rounded-2xl space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-extrabold text-royalemerald">Quote ID: {linkedQuotation.id}</span>
                  <Badge className="bg-emerald-500/10 text-emerald-600 font-bold border-emerald-500/20 text-[10px] uppercase">
                    ACTIVE
                  </Badge>
                </div>
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-charcoal">Price compiled: ₹{linkedQuotation.agreedPrice?.toLocaleString('en-IN')}</p>
                  <p className="text-warmgray text-[11px] leading-tight">Drive: {linkedQuotation.specs.driveType} • Cabin: {linkedQuotation.specs.cabinStyle}</p>
                </div>
                <Button variant="secondary" className="py-2 text-xs font-bold" fullWidth onClick={() => triggerToast(`Navigating to Quote details workspace: ${linkedQuotation.id}`)}>
                  <FileText className="w-4 h-4 text-royalemerald" />
                  <span>{t.viewQuote}</span>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3.5 bg-alabaster/50 border border-[#e6dfd4] rounded-2xl text-center">
                  <AlertCircle className="w-5 h-5 text-antiquegold mx-auto mb-1 stroke-[1.5]" />
                  <p className="text-xs text-warmgray font-semibold">{t.noQuotes}</p>
                </div>
                <Button variant="primary" className="text-xs font-bold" fullWidth onClick={handleCreateQuotation}>
                  <PlusCircle className="w-4 h-4" />
                  <span>{t.createQuote}</span>
                </Button>
              </div>
            )}
          </Card>

          {/* Direct Operations actions */}
          <Card className="p-5 space-y-4 text-left">
            <h4 className="text-[10px] uppercase font-extrabold tracking-widest text-warmgray">{t.inlineActions}</h4>

            {/* Change Stage dropdown inline */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-warmgray">{t.changeStage}</label>
              <div className="relative">
                <select
                  value={selectedStage}
                  onChange={(e) => handleStageChange(e.target.value as LeadStage)}
                  className="w-full px-3 py-2 bg-alabaster rounded-xl text-xs font-bold appearance-none cursor-pointer border border-[rgba(184,135,61,0.12)] focus:bg-white focus:ring-1 focus:ring-antiquegold"
                >
                  {Object.keys(STAGE_CONFIG).map((stage) => (
                    <option key={stage} value={stage}>
                      {t[STAGE_CONFIG[stage as LeadStage].labelKey as keyof typeof t] || stage.toUpperCase()}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warmgray pointer-events-none" />
              </div>
            </div>

            {/* Change Owner inline */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-warmgray">Delegated Supervisor</label>
              <div className="relative">
                <select
                  value={selectedOwnerId}
                  onChange={(e) => handleOwnerChange(e.target.value)}
                  className="w-full px-3 py-2 bg-alabaster rounded-xl text-xs font-bold appearance-none cursor-pointer border border-[rgba(184,135,61,0.12)] focus:bg-white focus:ring-1 focus:ring-antiquegold"
                >
                  <option value="">{t.unassigned.split(' • ')[0]}</option>
                  {surveyors.map(surv => (
                    <option key={surv.id} value={surv.id}>{surv.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warmgray pointer-events-none" />
              </div>
            </div>

          </Card>

          {/* Inline Log Note & Followup Scheduling */}
          <Card className="p-5 space-y-4">
            <h4 className="text-[10px] uppercase font-extrabold tracking-widest text-warmgray">{t.addNote}</h4>
            
            <form onSubmit={handleAddNote} className="space-y-3">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Log discussion notes, shaft issues, or custom requests offline..."
                className="w-full p-3 bg-alabaster rounded-xl text-xs placeholder-warmgray/50 border border-[rgba(184,135,61,0.12)] focus:bg-white focus:ring-1 focus:ring-antiquegold focus:outline-none h-20"
              />
              <Button type="submit" variant="outline" className="w-full py-2 text-xs font-bold border-antiquegold/25 text-charcoal">
                <span>{t.addNote}</span>
              </Button>
            </form>

            <form onSubmit={handleScheduleFollowUp} className="space-y-3 pt-3 border-t border-dashed border-[#e6dfd4]">
              <label className="text-[10px] uppercase font-bold text-warmgray block text-left">{t.scheduleFollowUp}</label>
              <input
                type="text"
                value={followUpTitle}
                onChange={(e) => setFollowUpTitle(e.target.value)}
                placeholder="E.g. Engineering Shaft clearance validation visit"
                className="w-full p-2.5 bg-alabaster rounded-xl text-xs placeholder-warmgray/50 border border-[rgba(184,135,61,0.12)] focus:bg-white focus:ring-1 focus:ring-antiquegold focus:outline-none"
              />
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="w-full p-2.5 bg-alabaster rounded-xl text-xs border border-[rgba(184,135,61,0.12)] focus:bg-white focus:ring-1 focus:ring-antiquegold focus:outline-none font-semibold text-charcoal"
              />
              <Button type="submit" variant="secondary" className="w-full py-2 text-xs font-bold" fullWidth>
                <span>{t.scheduleFollowUp}</span>
              </Button>
            </form>
          </Card>

        </div>

      </div>

      {/* ---------------------------------------------------------
          MERGE DUPLICATES SIMULATOR OVERLAY
          --------------------------------------------------------- */}
      <AnimatePresence>
        {showMergeModal && (
          <div className="fixed inset-0 z-50 bg-charcoal/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white border border-antiquegold/15 rounded-3xl p-6 space-y-4 shadow-xl text-left">
              <div className="flex justify-between items-center border-b border-[#e6dfd4] pb-3">
                <h3 className="font-serif text-lg font-bold text-charcoal">{t.mergeDuplicate}</h3>
                <button onClick={() => setShowMergeModal(false)} className="text-warmgray hover:text-charcoal font-bold">✕</button>
              </div>

              <p className="text-xs text-warmgray leading-relaxed">{t.mergeWarning}</p>

              <div className="space-y-2 text-left">
                <label className="text-[10px] uppercase font-bold text-warmgray">Select target duplicate lead record</label>
                <div className="relative">
                  <select
                    value={targetMergeLeadId}
                    onChange={(e) => setTargetMergeLeadId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-alabaster rounded-xl text-xs font-bold appearance-none cursor-pointer border border-[rgba(184,135,61,0.12)] focus:bg-white focus:ring-1 focus:ring-antiquegold"
                  >
                    <option value="">-- Choose duplicate site file --</option>
                    {allLeads.map(l => (
                      <option key={l.id} value={l.id}>{l.contactInfo.name} ({l.buildingInfo.floors} Floors, {l.id})</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warmgray pointer-events-none" />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button 
                  variant="primary" 
                  fullWidth 
                  onClick={handleMergeLeads} 
                  disabled={!targetMergeLeadId}
                >
                  Confirm Lead Node Merge
                </Button>
                <Button 
                  variant="outline" 
                  fullWidth 
                  onClick={() => setShowMergeModal(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Persistent notifications overlay */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className={`fixed bottom-6 right-6 z-50 rounded-xl p-4 shadow-xl border text-xs font-bold flex items-center gap-2.5 max-w-sm ${
              showToastError 
                ? 'bg-red-50 text-red-800 border-red-200' 
                : 'bg-charcoal text-white border-antiquegold/20'
            }`}
          >
            {showToastError ? (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            )}
            <span>{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
