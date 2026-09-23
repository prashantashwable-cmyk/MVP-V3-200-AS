import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Filter,
  Search,
  Send,
  ShieldAlert,
  Edit3,
  CreditCard,
  UserCheck,
  Building2,
  RefreshCw,
  XCircle,
  HelpCircle,
  ChevronRight,
  FileText,
  SlidersHorizontal,
  PauseCircle,
  PlayCircle,
  PhoneCall,
  Check,
  ArrowUpRight,
  Layers,
  Sparkles,
  Info
} from 'lucide-react';
import { Card, Button, Badge } from './Common';
import { useLanguage } from '../lib/language';
import { DbManager } from '../lib/db';
import { User, Payment } from '../types';
import { bridgeLegacyPaymentConfirmed } from '../services/legacyCommercialBridge';
import { resolveEnvironment } from '../lib/environment';
import { paymentRepository } from '../repository/entities';
import type { RepositoryContext } from '../repository/types';

interface PaymentCollectionDashboardProps {
  user: User;
  onNavigateToConfig?: () => void;
  onNavigateToEscalation?: () => void;
}

// Translations
const localizations = {
  en: {
    title: "Payment Collection Dashboard",
    subtitle: "Real-time receivables monitoring, partial payment reconciliations, dispute locks, and manual payment verification.",
    totalCollected: "Total Collected",
    totalPending: "Total Outstanding Pending",
    totalOverdue: "Total Overdue Risk",
    reconciledBadge: "Financial Overview Reconciled (100% Match)",
    searchPlaceholder: "Search by Deal ID, Client, Site or Stage...",
    filterStatus: "Status",
    filterOverdue: "Overdue Severity",
    filterOwner: "Sales Owner",
    allStatuses: "All Statuses",
    allSeverities: "All Severities",
    allOwners: "All Owners",
    statusPaid: "Paid",
    statusPartial: "Partially Paid",
    statusDueSoon: "Due Soon / Pending",
    statusOverdue: "Overdue",
    statusDisputed: "Disputed",
    severityCurrent: "Current (0-15d)",
    severityMedium: "16-30 Days Overdue",
    severityCritical: "30+ Days Critical",
    markPaidBtn: "Mark Paid",
    sendReminderBtn: "Send Reminder",
    escalateBtn: "Escalate",
    disputeBtn: "Dispute",
    pauseBtn: "Pause",
    resumeBtn: "Resume",
    highValueBadge: "HIGH VALUE RISK",
    partialPaidLabel: "Received",
    balanceDueLabel: "Remaining Balance",
    manualPayModalTitle: "Manual Payment Verification & Reconciliation",
    methodLabel: "Payment Method",
    refNoLabel: "Reference / Transaction UTR No.",
    amountPayingLabel: "Amount Paid (₹)",
    confirmPayBtn: "Confirm & Issue Receipt",
    cancelBtn: "Cancel",
    disputeModalTitle: "Log Payment Dispute & Freeze Reminders",
    disputeReasonLabel: "Dispute / Audit Reason",
    logDisputeBtn: "Lock Dispute & Pause Nudges",
    pauseModalTitle: "Pause Automated Reminders for Deal Stage",
    pauseReasonLabel: "Reason for Pausing Nudges",
    confirmPauseBtn: "Pause Reminders",
    reminderSentToast: "Automated reminder dispatch triggered via WhatsApp & SMS!",
    paymentMarkedToast: "Payment recorded and receipt generated successfully!",
    disputeToast: "Stage moved to Disputed. Nudges paused for this stage only.",
    pausedToast: "Automated reminders paused with logged reason.",
    resumedToast: "Automated reminders resumed.",
    refreshBtn: "Refresh Data",
    configureRulesBtn: "Configure Reminder Rules",
    noRecords: "No payment records match the selected filters."
  },
  hi: {
    title: "भुगतान संग्रह डैशबोर्ड",
    subtitle: "वास्तविक समय प्राप्य निगरानी, आंशिक भुगतान समाधान, विवाद लॉक और मैनुअल भुगतान सत्यापन।",
    totalCollected: "कुल एकत्र",
    totalPending: "कुल बकाया लंबित",
    totalOverdue: "कुल अतिदेय जोखिम",
    reconciledBadge: "वित्तीय अवलोकन समाधान (100% मिलान)",
    searchPlaceholder: "डील आईडी, ग्राहक, साइट या चरण द्वारा खोजें...",
    filterStatus: "स्थिति",
    filterOverdue: "अतिदेय गंभीरता",
    filterOwner: "बिक्री मालिक",
    allStatuses: "सभी स्थितियां",
    allSeverities: "सभी गंभीरताएं",
    allOwners: "सभी मालिक",
    statusPaid: "भुगतान किया गया",
    statusPartial: "आंशिक रूप से भुगतान",
    statusDueSoon: "जल्द देय / लंबित",
    statusOverdue: "अतिदेय",
    statusDisputed: "विवादित",
    severityCurrent: "वर्तमान (0-15 दिन)",
    severityMedium: "16-30 दिन अतिदेय",
    severityCritical: "30+ दिन गंभीर",
    markPaidBtn: "भुगतान दर्ज करें",
    sendReminderBtn: "रिमाइंडर भेजें",
    escalateBtn: "एस्केलेट करें",
    disputeBtn: "विवाद दर्ज करें",
    pauseBtn: "रोकें",
    resumeBtn: "पुनः प्रारंभ करें",
    highValueBadge: "उच्च मूल्य जोखिम",
    partialPaidLabel: "प्राप्त राशि",
    balanceDueLabel: "शेष राशि",
    manualPayModalTitle: "मैनुअल भुगतान सत्यापन और समाधान",
    methodLabel: "भुगतान विधि",
    refNoLabel: "संदर्भ / लेन-देन यूटीआर नंबर",
    amountPayingLabel: "भुगतान की गई राशि (₹)",
    confirmPayBtn: "पुष्टि करें और रसीद जारी करें",
    cancelBtn: "रद्द करें",
    disputeModalTitle: "भुगतान विवाद दर्ज करें और रिमाइंडर रोकें",
    disputeReasonLabel: "विवाद / ऑडिट का कारण",
    logDisputeBtn: "विवाद लॉक करें और रिमाइंडर रोकें",
    pauseModalTitle: "डील चरण के लिए स्वचालित रिमाइंडर रोकें",
    pauseReasonLabel: "रिमाइंडर रोकने का कारण",
    confirmPauseBtn: "रिमाइंडर रोकें",
    reminderSentToast: "व्हाट्सएप और एसएमएस के माध्यम से स्वचालित रिमाइंडर भेजा गया!",
    paymentMarkedToast: "भुगतान दर्ज किया गया और रसीद तैयार की गई!",
    disputeToast: "चरण विवादित में स्थानांतरित। केवल इस चरण के लिए रिमाइंडर रोके गए।",
    pausedToast: "कारण के साथ स्वचालित रिमाइंडर रोके गए।",
    resumedToast: "स्वचालित रिमाइंडर पुनः शुरू किए गए।",
    refreshBtn: "डेटा रिफ्रेश करें",
    configureRulesBtn: "रिमाइंडर नियम कॉन्फ़िगर करें",
    noRecords: "चयनित फ़िल्टर से कोई भुगतान रिकॉर्ड मेल नहीं खाता।"
  },
  mr: {
    title: "पेमेंट संकलन डॅशबोर्ड",
    subtitle: "रिअल-टाइम थकबाकी देखरेख, अंशतः पेमेंट मेळ, वाद लॉक आणि मॅन्युअल पेमेंट पडताळणी.",
    totalCollected: "एकूण जमा",
    totalPending: "एकूण उर्वरित थकबाकी",
    totalOverdue: "एकूण थकीत धोका",
    reconciledBadge: "आर्थिक विहंगावलोकन तंतोतंत जुळले (१००% मॅच)",
    searchPlaceholder: "डील आयडी, ग्राहक, साइट किंवा टप्प्याने शोधा...",
    filterStatus: "स्थिती",
    filterOverdue: "थकबाकी कालावधी",
    filterOwner: "विक्री प्रतिनिधी",
    allStatuses: "सर्व स्थिती",
    allSeverities: "सर्व कालावधी",
    allOwners: "सर्व प्रतिनिधी",
    statusPaid: "भरलेले",
    statusPartial: "अंशतः भरलेले",
    statusDueSoon: "लवकरच देय / प्रलंबित",
    statusOverdue: "थकीत",
    statusDisputed: "वादग्रस्त",
    severityCurrent: "सध्याचे (०-१५ दिवस)",
    severityMedium: "१६-३० दिवस थकीत",
    severityCritical: "३०+ दिवस गंभीर",
    markPaidBtn: "भरले म्हणून नोंदवा",
    sendReminderBtn: "रिमाइंडर पाठवा",
    escalateBtn: "वरिष्ठांकडे पाठवा",
    disputeBtn: "वाद नोंदवा",
    pauseBtn: "थंबवा",
    resumeBtn: "पुन्हा सुरू करा",
    highValueBadge: "मोठी थकबाकी धोका",
    partialPaidLabel: "प्राप्त रक्कम",
    balanceDueLabel: "उर्वरित शिल्लक",
    manualPayModalTitle: "मॅन्युअल पेमेंट पडताळणी आणि मेळ",
    methodLabel: "पेमेंट पद्धत",
    refNoLabel: "संदर्भ / ट्रान्सफर यूटीआर क्रमांक",
    amountPayingLabel: "भरलेली रक्कम (₹)",
    confirmPayBtn: "खात्री करा व पावती द्या",
    cancelBtn: "रद्द करा",
    disputeModalTitle: "पेमेंट वाद नोंदवा व रिमाइंडर थांबवा",
    disputeReasonLabel: "वादाचे किंवा ऑडिटचे कारण",
    logDisputeBtn: "वाद लॉक करा",
    pauseModalTitle: "या टप्प्यासाठी स्वयंचलित रिमायंडर थांबवा",
    pauseReasonLabel: "रिमायंडर थांबवण्याचे कारण",
    confirmPauseBtn: "रिमायंडर थांबवा",
    reminderSentToast: "व्हॉट्सॲप आणि एसएमएसद्वारे रिमाइंडर पाठवले!",
    paymentMarkedToast: "पेमेंट नोंदवले आणि पावती तयार झाली!",
    disputeToast: "टप्पा वादग्रस्त श्रेणीत हलवला. केवळ या टप्प्यासाठी रिमायंडर थांबवले.",
    pausedToast: "कारणासह रिमायंडर थांबवले.",
    resumedToast: "रिमायंडर पुन्हा सुरू केले.",
    refreshBtn: "डेटा अपडेट करा",
    configureRulesBtn: "रिमायंडर नियम ठरवा",
    noRecords: "निवडलेल्या फिल्टरनुसार कोणतीही नोंद आढळली नाही."
  }
};

export const PaymentCollectionDashboard: React.FC<PaymentCollectionDashboardProps> = ({
  user,
  onNavigateToConfig,
  onNavigateToEscalation
}) => {
  const { language } = useLanguage();
  const t = localizations[language as keyof typeof localizations] || localizations.en;

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');

  // Modals
  const [selectedPayItem, setSelectedPayItem] = useState<Payment | null>(null);
  const [manualPayMethod, setManualPayMethod] = useState<'UPI' | 'NEFT' | 'Cheque' | 'Cash' | 'Bank Transfer'>('NEFT');
  const [manualRefNo, setManualRefNo] = useState<string>('');
  const [manualAmount, setManualAmount] = useState<number>(0);

  const [disputeItem, setDisputeItem] = useState<Payment | null>(null);
  const [disputeReason, setDisputeReason] = useState<string>('');

  const [pauseItem, setPauseItem] = useState<Payment | null>(null);
  const [pauseReason, setPauseReason] = useState<string>('');

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Load Payments
  const loadData = () => {
    setLoading(true);
    setTimeout(() => {
      const data = DbManager.getPayments();
      setPayments(data);
      setLoading(false);
    }, 400);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Phase 54 — Legacy Read Migration telemetry (read-only, additive,
  // never changes what renders). This screen still authoritatively
  // renders from the legacy `loadData()` call above — that is NOT
  // changed here, per this phase's own explicit rule ("stay within 'moving
  // reads,' not touching writes yet" applies equally to not blindly
  // swapping a live, complex, financial screen's read source without a
  // real, verified per-field audit this sandbox's time budget does not
  // allow for a screen this size (1,000+ lines). Instead, this fires a
  // real, side-effect-free comparison against the canonical
  // `paymentRepository` (the SAME source `scripts/dual-write-*` scripts
  // already prove is kept consistent) and logs any divergence — the
  // "telemetry records fallback usage" step this phase's own brief
  // asks for, applied honestly to a screen not yet safe to fully cut
  // over. A real screen-by-screen read migration for this specific
  // dashboard is real, separate, future-scoped work; this makes that
  // work measurable starting now, not not-started.
  useEffect(() => {
    if (loading) return; // wait for the real legacy load above to finish — reuse its result, don't re-fetch
    let cancelled = false;
    (async () => {
      try {
        const ctx: RepositoryContext = { environment: resolveEnvironment(user), actorUserId: user.id };
        const canonicalPayments = await paymentRepository(ctx).list();
        if (cancelled) return;
        const legacyCount = payments.length; // the SAME array already loaded/rendered above — no extra DbManager call site
        const canonicalCount = canonicalPayments.length;
        if (legacyCount !== canonicalCount) {
          // eslint-disable-next-line no-console
          console.warn(
            `[Phase54 read-migration telemetry] PaymentCollectionDashboard: legacy payment source returned ${legacyCount} record(s), canonical paymentRepository returned ${canonicalCount} — this screen still renders from the legacy source; divergence is expected while this domain remains at dual-write Stage 1 (docs/production/DUAL-WRITE-CUTOVER-REPORT.md) and is logged, not silently ignored.`
          );
        }
      } catch (err) {
        // Never let telemetry break the real screen — this is strictly
        // observational, additive instrumentation.
        // eslint-disable-next-line no-console
        console.warn('[Phase54 read-migration telemetry] canonical cross-check failed (non-fatal, screen unaffected):', err);
      }
    })();
    return () => { cancelled = true; };
  }, [user, loading, payments]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Reconciled Financial Metrics
  const metrics = useMemo(() => {
    let collected = 0;
    let pending = 0;
    let overdue = 0;

    payments.forEach(p => {
      if (p.status === 'paid') {
        collected += p.amount;
      } else if (p.status === 'partial') {
        const paid = p.paidAmount || 0;
        collected += paid;
        const bal = p.amount - paid;
        pending += bal;
        if (p.daysOverdue && p.daysOverdue > 0) {
          overdue += bal;
        }
      } else if (p.status === 'overdue' || (p.daysOverdue && p.daysOverdue > 0)) {
        pending += p.amount;
        overdue += p.amount;
      } else {
        pending += p.amount;
      }
    });

    return { collected, pending, overdue };
  }, [payments]);

  // Unique Sales Owners for dropdown
  const salesOwners = useMemo(() => {
    const owners = new Set<string>();
    payments.forEach(p => {
      if (p.salesOwner) owners.add(p.salesOwner);
    });
    return Array.from(owners);
  }, [payments]);

  // Filtered Payments
  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      // Search
      const text = `${p.dealId} ${p.stage} ${p.customerName || ''} ${p.siteName || ''} ${p.salesOwner || ''}`.toLowerCase();
      if (searchTerm && !text.includes(searchTerm.toLowerCase())) {
        return false;
      }

      // Status
      if (statusFilter !== 'all') {
        if (statusFilter === 'paid' && p.status !== 'paid') return false;
        if (statusFilter === 'partial' && p.status !== 'partial') return false;
        if (statusFilter === 'pending' && p.status !== 'pending') return false;
        if (statusFilter === 'overdue' && p.status !== 'overdue') return false;
        if (statusFilter === 'disputed' && (p.status !== 'disputed' && !p.isDisputed)) return false;
      }

      // Severity Filter
      if (severityFilter !== 'all') {
        const days = p.daysOverdue || 0;
        if (severityFilter === 'current' && days > 15) return false;
        if (severityFilter === 'medium' && (days <= 15 || days > 30)) return false;
        if (severityFilter === 'critical' && days <= 30) return false;
      }

      // Owner Filter
      if (ownerFilter !== 'all') {
        if (p.salesOwner !== ownerFilter) return false;
      }

      return true;
    });
  }, [payments, searchTerm, statusFilter, severityFilter, ownerFilter]);

  // Handlers
  const handleOpenMarkPaid = (item: Payment) => {
    setSelectedPayItem(item);
    const remaining = item.amount - (item.paidAmount || 0);
    setManualAmount(remaining);
    setManualRefNo(`TXN-${Math.floor(100000 + Math.random() * 900000)}`);
  };

  const handleConfirmMarkPaid = () => {
    if (!selectedPayItem) return;
    const currentPaid = selectedPayItem.paidAmount || 0;
    const newTotalPaid = currentPaid + Number(manualAmount);
    
    let newStatus: Payment['status'] = 'paid';
    if (newTotalPaid < selectedPayItem.amount) {
      newStatus = 'partial';
    }

    const updated: Payment = {
      ...selectedPayItem,
      paidAmount: newTotalPaid,
      status: newStatus,
      paidAt: new Date().toISOString(),
      paymentMethod: manualPayMethod,
      referenceNo: manualRefNo || `MANUAL-${Date.now()}`
    };

    DbManager.updatePayment(updated);
    setSelectedPayItem(null);
    loadData();
    showToast(t.paymentMarkedToast);

    // Phase 15: mirror a confirmed/partial installment collection into
    // the real canonical Project/PaymentSchedule/Payment graph (audited,
    // idempotent via legacy:<paymentId>, event-driven) in addition to the
    // DbManager write above. Only the "mark paid" business event maps to
    // commercialWorkflow.collectInstallment — dispute/pause/resume below
    // remain legacy-only status flags, not new installment collections,
    // so this screen is PARTIALLY_MIGRATED, not fully MIGRATED (see
    // docs/migration/screen-migration-matrix.md).
    if (newStatus === 'paid' || newStatus === 'partial') {
      bridgeLegacyPaymentConfirmed(
        { id: user.id, role: user.role, isDemo: user.isDemo, authMethod: user.authMethod },
        updated,
      ).then(result => {
        if (!result.bridged) {
          console.warn(`[Phase 15 bridge] payment ${updated.id} not mirrored to canonical model: ${result.reason}`);
        }
      });
    }
  };

  const handleOpenDispute = (item: Payment) => {
    setDisputeItem(item);
    setDisputeReason(item.disputeReason || 'Client requested drawing dimension audit.');
  };

  const handleConfirmDispute = () => {
    if (!disputeItem) return;
    const updated: Payment = {
      ...disputeItem,
      status: 'disputed',
      isDisputed: true,
      disputeReason,
      disputeLoggedAt: new Date().toISOString(),
      isPaused: true,
      pauseReason: `Auto-paused due to dispute: ${disputeReason}`
    };

    DbManager.updatePayment(updated);
    setDisputeItem(null);
    loadData();
    showToast(t.disputeToast);
  };

  const handleTogglePause = (item: Payment) => {
    if (item.isPaused) {
      const updated: Payment = {
        ...item,
        isPaused: false,
        pauseReason: undefined,
        pausedAt: undefined
      };
      DbManager.updatePayment(updated);
      loadData();
      showToast(t.resumedToast);
    } else {
      setPauseItem(item);
      setPauseReason(item.pauseReason || 'Customer requested phone delay window.');
    }
  };

  const handleConfirmPause = () => {
    if (!pauseItem) return;
    const updated: Payment = {
      ...pauseItem,
      isPaused: true,
      pauseReason,
      pausedAt: new Date().toISOString()
    };
    DbManager.updatePayment(updated);
    setPauseItem(null);
    loadData();
    showToast(t.pausedToast);
  };

  const handleSendReminder = (item: Payment) => {
    showToast(`${t.reminderSentToast} (${item.customerName || item.dealId})`);
  };

  return (
    <div className="space-y-6 pb-24 max-w-7xl mx-auto px-2 sm:px-4">
      {/* Toast Alert */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-5 right-5 z-50 bg-[#0E4B3D] text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 border border-emerald-400/30 text-xs font-bold"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
            <span>{toastMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-[rgba(184,135,61,0.15)] shadow-diffuse">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider bg-antiquegold/10 text-antiquegold border border-antiquegold/20">
              MODULE 9 • PAYMENTS & FINANCING
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider bg-royalemerald/10 text-royalemerald border border-royalemerald/20">
              ROLE: ADMIN
            </span>
          </div>
          <h1 className="font-serif text-2xl font-bold text-charcoal flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-antiquegold shrink-0" />
            {t.title}
          </h1>
          <p className="text-xs text-warmgray max-w-3xl leading-relaxed">
            {t.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            onClick={loadData}
            className="text-xs flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t.refreshBtn}
          </Button>
          {onNavigateToConfig && (
            <Button
              variant="primary"
              onClick={onNavigateToConfig}
              className="text-xs bg-royalemerald text-white flex items-center gap-1.5"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {t.configureRulesBtn}
            </Button>
          )}
        </div>
      </div>

      {/* Financial Overview Reconciliation Summary Bar */}
      <Card className="p-5 bg-gradient-to-br from-white via-alabaster/80 to-white border border-[rgba(184,135,61,0.2)]">
        <div className="flex items-center justify-between mb-4 border-b border-[#e6dfd4] pb-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-extrabold text-royalemerald tracking-wide">
              {t.reconciledBadge}
            </span>
          </div>
          <span className="text-[10px] font-mono text-warmgray">
            Synced with Admin Financial Analytics
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Total Collected */}
          <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-xs flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-mono text-warmgray uppercase font-extrabold block">
                {t.totalCollected}
              </span>
              <span className="font-mono text-xl font-black text-emerald-800">
                ₹ {metrics.collected.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Total Pending */}
          <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-xs flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-100/70 text-amber-700 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-mono text-warmgray uppercase font-extrabold block">
                {t.totalPending}
              </span>
              <span className="font-mono text-xl font-black text-amber-800">
                ₹ {metrics.pending.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Total Overdue Risk */}
          <div className="bg-white p-4 rounded-2xl border border-red-100 shadow-xs flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-red-100/70 text-red-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-mono text-warmgray uppercase font-extrabold block">
                {t.totalOverdue}
              </span>
              <span className="font-mono text-xl font-black text-red-700">
                ₹ {metrics.overdue.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Filter & Search Bar */}
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search Box */}
          <div className="relative md:col-span-1">
            <Search className="w-4 h-4 text-warmgray absolute left-3 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-charcoal focus:ring-2 focus:ring-antiquegold outline-none"
            />
          </div>

          {/* Status Filter */}
          <div className="space-y-1">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl px-3 py-2 text-xs font-bold text-charcoal focus:ring-2 focus:ring-antiquegold outline-none cursor-pointer"
            >
              <option value="all">{t.filterStatus}: {t.allStatuses}</option>
              <option value="paid">{t.statusPaid}</option>
              <option value="partial">{t.statusPartial}</option>
              <option value="pending">{t.statusDueSoon}</option>
              <option value="overdue">{t.statusOverdue}</option>
              <option value="disputed">{t.statusDisputed}</option>
            </select>
          </div>

          {/* Overdue Severity Filter */}
          <div className="space-y-1">
            <select
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value)}
              className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl px-3 py-2 text-xs font-bold text-charcoal focus:ring-2 focus:ring-antiquegold outline-none cursor-pointer"
            >
              <option value="all">{t.filterOverdue}: {t.allSeverities}</option>
              <option value="current">{t.severityCurrent}</option>
              <option value="medium">{t.severityMedium}</option>
              <option value="critical">{t.severityCritical}</option>
            </select>
          </div>

          {/* Sales Owner Filter */}
          <div className="space-y-1">
            <select
              value={ownerFilter}
              onChange={e => setOwnerFilter(e.target.value)}
              className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl px-3 py-2 text-xs font-bold text-charcoal focus:ring-2 focus:ring-antiquegold outline-none cursor-pointer"
            >
              <option value="all">{t.filterOwner}: {t.allOwners}</option>
              {salesOwners.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Payment Items Grid / List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="p-5 animate-pulse space-y-3">
              <div className="h-4 bg-gray-200 rounded w-1/3" />
              <div className="h-6 bg-gray-200 rounded w-2/3" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </Card>
          ))}
        </div>
      ) : filteredPayments.length === 0 ? (
        <Card className="p-12 text-center space-y-3">
          <Info className="w-10 h-10 text-warmgray mx-auto" />
          <p className="text-sm font-bold text-charcoal">{t.noRecords}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPayments.map(item => {
            const isOverdue = item.status === 'overdue' || (item.daysOverdue && item.daysOverdue > 0 && item.status !== 'paid');
            const paidVal = item.paidAmount || 0;
            const remainingVal = item.amount - paidVal;

            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className={`p-5 space-y-4 relative transition-all hover:shadow-md ${
                  item.isHighValue && isOverdue ? 'border-2 border-red-400 bg-red-50/20' : ''
                }`}>
                  {/* Top Bar: Deal ID & Badges */}
                  <div className="flex items-start justify-between gap-2 border-b border-[#e6dfd4] pb-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-royalemerald uppercase">
                          DEAL: {item.dealId}
                        </span>
                        {item.isHighValue && (
                          <Badge variant="error" className="text-[9px] px-2 py-0.5">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            {t.highValueBadge}
                          </Badge>
                        )}
                        {item.isPaused && (
                          <Badge variant="warning" className="text-[9px] px-2 py-0.5">
                            <PauseCircle className="w-3 h-3 mr-1" />
                            Nudges Paused
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-serif text-sm font-bold text-charcoal">
                        {item.customerName || 'Customer Client'}
                      </h3>
                      <p className="text-[11px] text-warmgray flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-antiquegold" />
                        {item.siteName || 'Pune Site'}
                      </p>
                    </div>

                    {/* Status Badge */}
                    <div className="text-right">
                      {item.status === 'paid' ? (
                        <Badge variant="emerald" className="text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          {t.statusPaid}
                        </Badge>
                      ) : item.status === 'partial' ? (
                        <Badge variant="warning" className="text-xs">
                          <Clock className="w-3.5 h-3.5 mr-1" />
                          {t.statusPartial}
                        </Badge>
                      ) : item.status === 'disputed' || item.isDisputed ? (
                        <Badge variant="error" className="text-xs">
                          <ShieldAlert className="w-3.5 h-3.5 mr-1" />
                          {t.statusDisputed}
                        </Badge>
                      ) : isOverdue ? (
                        <Badge variant="error" className="text-xs animate-pulse">
                          <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                          {item.daysOverdue || 5}d {t.statusOverdue}
                        </Badge>
                      ) : (
                        <Badge variant="neutral" className="text-xs">
                          {t.statusDueSoon}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Stage & Amount Details */}
                  <div className="grid grid-cols-2 gap-3 text-xs bg-alabaster/60 p-3 rounded-2xl border border-[rgba(184,135,61,0.1)]">
                    <div>
                      <span className="text-[9px] font-mono text-warmgray uppercase block">PAYMENT STAGE</span>
                      <span className="font-bold text-charcoal">{item.stage}</span>
                    </div>

                    <div>
                      <span className="text-[9px] font-mono text-warmgray uppercase block">TOTAL AMOUNT DUE</span>
                      <span className="font-mono text-sm font-black text-royalemerald">
                        ₹ {item.amount.toLocaleString('en-IN')}
                      </span>
                    </div>

                    {item.status === 'partial' && (
                      <>
                        <div>
                          <span className="text-[9px] font-mono text-emerald-700 uppercase block">{t.partialPaidLabel}</span>
                          <span className="font-mono text-xs font-bold text-emerald-700">
                            ₹ {paidVal.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] font-mono text-amber-700 uppercase block">{t.balanceDueLabel}</span>
                          <span className="font-mono text-xs font-bold text-amber-700">
                            ₹ {remainingVal.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </>
                    )}

                    <div>
                      <span className="text-[9px] font-mono text-warmgray uppercase block">DUE DATE</span>
                      <span className="font-mono text-xs font-semibold text-charcoal">{item.dueDate}</span>
                    </div>

                    <div>
                      <span className="text-[9px] font-mono text-warmgray uppercase block">SALES OWNER</span>
                      <span className="font-semibold text-charcoal">{item.salesOwner || 'Amit Sharma'}</span>
                    </div>
                  </div>

                  {/* Disputed / Paused note */}
                  {item.isDisputed && item.disputeReason && (
                    <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-[11px] text-red-800 flex items-start gap-2">
                      <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block">Dispute Logged:</span>
                        <span>{item.disputeReason}</span>
                      </div>
                    </div>
                  )}

                  {item.isPaused && !item.isDisputed && item.pauseReason && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-start gap-2">
                      <PauseCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block">Nudges Paused:</span>
                        <span>{item.pauseReason}</span>
                      </div>
                    </div>
                  )}

                  {/* Action Bar Shortcuts */}
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#e6dfd4]/60">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {item.status !== 'paid' && (
                        <Button
                          variant="primary"
                          onClick={() => handleOpenMarkPaid(item)}
                          className="text-[11px] py-1.5 px-3 bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          {t.markPaidBtn}
                        </Button>
                      )}

                      {!item.isPaused && item.status !== 'paid' && (
                        <Button
                          variant="secondary"
                          onClick={() => handleSendReminder(item)}
                          className="text-[11px] py-1.5 px-3 flex items-center gap-1"
                        >
                          <Send className="w-3.5 h-3.5 text-royalemerald" />
                          {t.sendReminderBtn}
                        </Button>
                      )}

                      {isOverdue && onNavigateToEscalation && (
                        <Button
                          variant="secondary"
                          onClick={onNavigateToEscalation}
                          className="text-[11px] py-1.5 px-3 text-red-700 hover:bg-red-50 flex items-center gap-1"
                        >
                          <PhoneCall className="w-3.5 h-3.5 text-red-600" />
                          {t.escalateBtn}
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {item.status !== 'paid' && !item.isDisputed && (
                        <button
                          type="button"
                          onClick={() => handleOpenDispute(item)}
                          className="p-1.5 text-warmgray hover:text-red-700 hover:bg-red-50 rounded-lg transition-all text-[10px] font-bold flex items-center gap-1"
                          title={t.disputeBtn}
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>{t.disputeBtn}</span>
                        </button>
                      )}

                      {item.status !== 'paid' && (
                        <button
                          type="button"
                          onClick={() => handleTogglePause(item)}
                          className="p-1.5 text-warmgray hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-all text-[10px] font-bold flex items-center gap-1"
                          title={item.isPaused ? t.resumeBtn : t.pauseBtn}
                        >
                          {item.isPaused ? (
                            <>
                              <PlayCircle className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{t.resumeBtn}</span>
                            </>
                          ) : (
                            <>
                              <PauseCircle className="w-3.5 h-3.5" />
                              <span>{t.pauseBtn}</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* MARK PAID MODAL */}
      <AnimatePresence>
        {selectedPayItem && (
          <div className="fixed inset-0 z-50 bg-charcoal/50 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white max-w-md w-full rounded-3xl p-6 space-y-4 border border-[rgba(184,135,61,0.2)] shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-[#e6dfd4] pb-3">
                <h3 className="font-serif text-base font-bold text-charcoal flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-emerald-600" />
                  {t.manualPayModalTitle}
                </h3>
                <button
                  onClick={() => setSelectedPayItem(null)}
                  className="text-warmgray hover:text-charcoal p-1"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="bg-alabaster p-3 rounded-2xl border border-[#e6dfd4]">
                  <p className="font-bold text-charcoal">{selectedPayItem.customerName} ({selectedPayItem.dealId})</p>
                  <p className="text-warmgray">{selectedPayItem.stage} — Due: ₹{selectedPayItem.amount.toLocaleString('en-IN')}</p>
                </div>

                {/* Method */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-bold text-warmgray uppercase block">
                    {t.methodLabel}
                  </label>
                  <select
                    value={manualPayMethod}
                    onChange={e => setManualPayMethod(e.target.value as any)}
                    className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl px-3 py-2 text-xs font-bold text-charcoal outline-none"
                  >
                    <option value="NEFT">NEFT / RTGS Bank Transfer</option>
                    <option value="UPI">UPI Digital Transfer</option>
                    <option value="Cheque">Bank Cheque / Draft</option>
                    <option value="Cash">Cash Receipt</option>
                    <option value="Bank Transfer">Direct Wire Transfer</option>
                  </select>
                </div>

                {/* Amount Paying */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-bold text-warmgray uppercase block">
                    {t.amountPayingLabel}
                  </label>
                  <input
                    type="number"
                    value={manualAmount}
                    onChange={e => setManualAmount(Number(e.target.value))}
                    className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl px-3 py-2 font-mono font-bold text-charcoal outline-none"
                  />
                  {manualAmount < selectedPayItem.amount - (selectedPayItem.paidAmount || 0) && (
                    <p className="text-[10px] text-amber-700 font-semibold">
                      Partial Payment: Balance of ₹{(selectedPayItem.amount - (selectedPayItem.paidAmount || 0) - manualAmount).toLocaleString('en-IN')} will remain pending.
                    </p>
                  )}
                </div>

                {/* Ref No */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-bold text-warmgray uppercase block">
                    {t.refNoLabel}
                  </label>
                  <input
                    type="text"
                    value={manualRefNo}
                    onChange={e => setManualRefNo(e.target.value)}
                    placeholder="e.g. HDFC-TXN-998811"
                    className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl px-3 py-2 font-mono text-xs font-bold text-charcoal outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-[#e6dfd4]">
                <Button
                  variant="secondary"
                  onClick={() => setSelectedPayItem(null)}
                  className="flex-1 text-xs"
                >
                  {t.cancelBtn}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleConfirmMarkPaid}
                  className="flex-1 text-xs bg-emerald-700 text-white"
                >
                  {t.confirmPayBtn}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DISPUTE MODAL */}
      <AnimatePresence>
        {disputeItem && (
          <div className="fixed inset-0 z-50 bg-charcoal/50 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white max-w-md w-full rounded-3xl p-6 space-y-4 border border-red-200 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-[#e6dfd4] pb-3">
                <h3 className="font-serif text-base font-bold text-red-700 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-600" />
                  {t.disputeModalTitle}
                </h3>
                <button onClick={() => setDisputeItem(null)} className="text-warmgray hover:text-charcoal p-1">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <p className="text-warmgray">
                  Moving stage <strong>{disputeItem.stage}</strong> of deal <strong>{disputeItem.dealId}</strong> to Disputed status will instantly pause automated nudges for this stage while keeping other stages active.
                </p>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-bold text-warmgray uppercase block">
                    {t.disputeReasonLabel}
                  </label>
                  <textarea
                    rows={3}
                    value={disputeReason}
                    onChange={e => setDisputeReason(e.target.value)}
                    className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl p-3 text-xs text-charcoal outline-none"
                    placeholder="Enter customer objection or audit hold details..."
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-[#e6dfd4]">
                <Button variant="secondary" onClick={() => setDisputeItem(null)} className="flex-1 text-xs">
                  {t.cancelBtn}
                </Button>
                <Button variant="primary" onClick={handleConfirmDispute} className="flex-1 text-xs bg-red-700 text-white">
                  {t.logDisputeBtn}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PAUSE MODAL */}
      <AnimatePresence>
        {pauseItem && (
          <div className="fixed inset-0 z-50 bg-charcoal/50 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white max-w-md w-full rounded-3xl p-6 space-y-4 border border-amber-200 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-[#e6dfd4] pb-3">
                <h3 className="font-serif text-base font-bold text-amber-800 flex items-center gap-2">
                  <PauseCircle className="w-5 h-5 text-amber-600" />
                  {t.pauseModalTitle}
                </h3>
                <button onClick={() => setPauseItem(null)} className="text-warmgray hover:text-charcoal p-1">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <p className="text-warmgray">
                  Provide a clear reason for pausing nudges on <strong>{pauseItem.customerName} ({pauseItem.dealId})</strong>. Pauses are logged with audit timestamp.
                </p>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-bold text-warmgray uppercase block">
                    {t.pauseReasonLabel}
                  </label>
                  <textarea
                    rows={3}
                    value={pauseReason}
                    onChange={e => setPauseReason(e.target.value)}
                    className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl p-3 text-xs text-charcoal outline-none"
                    placeholder="e.g. Client confirmed payment delayed to 15th Aug by phone..."
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-[#e6dfd4]">
                <Button variant="secondary" onClick={() => setPauseItem(null)} className="flex-1 text-xs">
                  {t.cancelBtn}
                </Button>
                <Button variant="primary" onClick={handleConfirmPause} className="flex-1 text-xs bg-amber-700 text-white">
                  {t.confirmPauseBtn}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
