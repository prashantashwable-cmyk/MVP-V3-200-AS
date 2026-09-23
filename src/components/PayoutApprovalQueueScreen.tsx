import React, { useState } from 'react';
import { 
  ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Clock, 
  Search, Filter, ArrowLeft, RefreshCw, Zap, Eye, AlertCircle, 
  HelpCircle, ChevronRight, FileText, Lock, IndianRupee, UserCheck, CheckCheck
} from 'lucide-react';
import { DbManager } from '../lib/db';
import { CommissionPayoutEntry, UserRole } from '../types';

interface PayoutApprovalQueueScreenProps {
  userRole: UserRole;
  currentLanguage: 'en' | 'hi' | 'mr';
  onNavigateToDisbursement?: () => void;
  onNavigateToRulesEngine?: () => void;
  onBack?: () => void;
}

export const PayoutApprovalQueueScreen: React.FC<PayoutApprovalQueueScreenProps> = ({
  userRole,
  currentLanguage,
  onNavigateToDisbursement,
  onNavigateToRulesEngine,
  onBack
}) => {
  const [entries, setEntries] = useState<CommissionPayoutEntry[]>(() => DbManager.getCommissionPayoutEntries());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'anomalies' | 'routine' | 'expedited'>('all');
  const [selectedEntry, setSelectedEntry] = useState<CommissionPayoutEntry | null>(null);
  
  // Hold Modal
  const [isHoldModalOpen, setIsHoldModalOpen] = useState(false);
  const [holdTargetEntry, setHoldTargetEntry] = useState<CommissionPayoutEntry | null>(null);
  const [holdReason, setHoldReason] = useState('');

  // Selected for batch
  const [selectedForBatch, setSelectedForBatch] = useState<string[]>([]);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const pendingEntries = entries.filter(e => e.status === 'pending_approval');

  const filteredEntries = pendingEntries.filter(entry => {
    const matchesSearch = 
      entry.partnerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.referenceDocNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.triggerTypeLabel.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterMode === 'anomalies') return !!entry.isStatisticalAnomaly;
    if (filterMode === 'routine') return !entry.isStatisticalAnomaly && !entry.relatedOpenQcIssue && !entry.relatedDisputeId;
    if (filterMode === 'expedited') return !!entry.isExpeditedHardship;
    return true;
  });

  const anomalyCount = pendingEntries.filter(e => e.isStatisticalAnomaly).length;
  const expeditedCount = pendingEntries.filter(e => e.isExpeditedHardship).length;
  const routineCount = pendingEntries.filter(e => !e.isStatisticalAnomaly && !e.relatedOpenQcIssue && !e.relatedDisputeId).length;

  const handleApproveSingle = (entryId: string) => {
    DbManager.updateCommissionPayoutStatus(entryId, 'approved_pending_payout');
    setEntries(DbManager.getCommissionPayoutEntries());
    setSelectedEntry(null);
    setActionSuccessMsg(currentLanguage === 'hi' ? 'भुगतान प्रविष्टि स्वीकृत की गई!' : currentLanguage === 'mr' ? 'पेआउट नोंद मंजूर करण्यात आली!' : 'Payout entry approved successfully!');
    setTimeout(() => setActionSuccessMsg(null), 3000);
  };

  const handleOpenHoldModal = (entry: CommissionPayoutEntry) => {
    setHoldTargetEntry(entry);
    setHoldReason(entry.relatedOpenQcIssue ? `QC Issue Pending: ${entry.relatedOpenQcIssue}` : '');
    setIsHoldModalOpen(true);
  };

  const handleConfirmHold = () => {
    if (!holdTargetEntry) return;
    DbManager.updateCommissionPayoutStatus(holdTargetEntry.id, 'held_dispute', holdReason);
    setEntries(DbManager.getCommissionPayoutEntries());
    setIsHoldModalOpen(false);
    setHoldTargetEntry(null);
    setHoldReason('');
    setSelectedEntry(null);
    setActionSuccessMsg(currentLanguage === 'hi' ? 'भुगतान पर रोक लगाई गई (Hold)' : currentLanguage === 'mr' ? 'पेआउट रोखून ठेवले (Hold)' : 'Payout held pending issue resolution.');
    setTimeout(() => setActionSuccessMsg(null), 3000);
  };

  const handleExpediteHardship = (entryId: string) => {
    DbManager.expediteCommissionPayout(entryId);
    setEntries(DbManager.getCommissionPayoutEntries());
    setSelectedEntry(null);
    setActionSuccessMsg(currentLanguage === 'hi' ? 'तत्काल भुगतान स्वीकृत!' : currentLanguage === 'mr' ? 'तातडीचे पेआउट मंजूर!' : 'Expedited hardship payout approved!');
    setTimeout(() => setActionSuccessMsg(null), 3000);
  };

  const toggleSelectForBatch = (id: string) => {
    setSelectedForBatch(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllRoutine = () => {
    const routineIds = filteredEntries
      .filter(e => !e.isStatisticalAnomaly && !e.relatedOpenQcIssue && !e.relatedDisputeId)
      .map(e => e.id);
    setSelectedForBatch(routineIds);
  };

  const handleApproveBatch = () => {
    // Phase 36 — LEVEL 3 (financial): batch commission-payout approval had
    // no confirmation of any kind before this fix.
    if (selectedForBatch.length === 0) return;
    if (!window.confirm(`Approve ${selectedForBatch.length} commission payout(s) for disbursement? This moves them to "approved, pending payout".`)) {
      return;
    }
    selectedForBatch.forEach(id => {
      DbManager.updateCommissionPayoutStatus(id, 'approved_pending_payout');
    });
    setEntries(DbManager.getCommissionPayoutEntries());
    setSelectedForBatch([]);
    setActionSuccessMsg(currentLanguage === 'hi' ? `बैच स्वीकृति: ${selectedForBatch.length} प्रविष्टियां स्वीकृत!` : currentLanguage === 'mr' ? `बॅच मंजुरी: ${selectedForBatch.length} नोंदी मंजूर!` : `Batch Approved: ${selectedForBatch.length} routine entries approved!`);
    setTimeout(() => setActionSuccessMsg(null), 3000);
  };

  const formatCurrency = (amt: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amt);
  };

  const getTierBadge = (tier: string) => {
    switch(tier) {
      case 'diamond': return 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-900/40 dark:text-cyan-300';
      case 'platinum': return 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40 dark:text-purple-300';
      case 'gold': return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300';
      case 'silver': return 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300';
      default: return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-300';
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] p-4 md:p-6 pb-24">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {onBack && (
              <button 
                onClick={onBack}
                className="p-2 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-black/5"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  {currentLanguage === 'hi' ? 'मालिक और व्यवस्थापक कतार' : currentLanguage === 'mr' ? 'मालक व व्यवस्थापक रांग' : 'Admin & Owner Queue'}
                </span>
                <span className="text-xs text-[var(--color-text-secondary)] font-mono">Module 17 • Prompt 163</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-serif font-bold tracking-tight text-[var(--color-text-primary)] mt-1">
                {currentLanguage === 'hi' ? 'भुगतान स्वीकृति कतार' : currentLanguage === 'mr' ? 'पेआउट मंजुरी रांग' : 'Payout Approval Queue'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onNavigateToRulesEngine && (
              <button
                onClick={onNavigateToRulesEngine}
                className="px-3.5 py-2 rounded-xl text-xs font-medium border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-black/5 flex items-center gap-1.5"
              >
                <FileText className="w-4 h-4 text-amber-600" />
                {currentLanguage === 'hi' ? 'कमिशन नियम' : currentLanguage === 'mr' ? 'कमिशन नियम' : 'Rules Engine'}
              </button>
            )}
            {onNavigateToDisbursement && (
              <button
                onClick={onNavigateToDisbursement}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-[var(--color-accent-secondary)] text-white hover:opacity-90 flex items-center gap-1.5 shadow-sm"
              >
                <Zap className="w-4 h-4" />
                {currentLanguage === 'hi' ? 'स्वचालित वितरण' : currentLanguage === 'mr' ? 'स्वयंचलित वितरण' : 'Automated Disbursement'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Success Banner */}
      {actionSuccessMsg && (
        <div className="max-w-6xl mx-auto mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* Overview Metric Cards */}
      <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm">
          <div className="text-xs text-[var(--color-text-secondary)] font-medium mb-1">
            {currentLanguage === 'hi' ? 'स्वीकृति हेतु लंबित' : currentLanguage === 'mr' ? 'मंजुरीसाठी प्रलंबित' : 'Pending Verification'}
          </div>
          <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {pendingEntries.length}
          </div>
          <div className="text-[11px] text-[var(--color-text-secondary)] mt-1">
            Total Amt: <span className="font-mono font-medium">{formatCurrency(pendingEntries.reduce((s, e) => s + e.amount, 0))}</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-rose-500/30 shadow-sm bg-rose-500/5">
          <div className="text-xs text-rose-600 dark:text-rose-400 font-medium mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            {currentLanguage === 'hi' ? 'सांख्यिकी विसंगतियां' : currentLanguage === 'mr' ? 'संख्याशास्त्र विसंगती' : 'Statistical Anomalies'}
          </div>
          <div className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
            {anomalyCount}
          </div>
          <div className="text-[11px] text-[var(--color-text-secondary)] mt-1">
            Requires manual sanity check
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-blue-500/30 shadow-sm bg-blue-500/5">
          <div className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5" />
            {currentLanguage === 'hi' ? 'तत्काल कठिनाई अनुरोध' : currentLanguage === 'mr' ? 'तातडीची गरज विनंती' : 'Expedited Hardships'}
          </div>
          <div className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
            {expeditedCount}
          </div>
          <div className="text-[11px] text-[var(--color-text-secondary)] mt-1">
            Prioritized worker payouts
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-emerald-500/30 shadow-sm bg-emerald-500/5">
          <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-1 flex items-center gap-1">
            <CheckCheck className="w-3.5 h-3.5" />
            {currentLanguage === 'hi' ? 'नियमित कम जोखिम प्रविष्टियां' : currentLanguage === 'mr' ? 'नियमित कमी धोका नोंदी' : 'Low-Risk Routine'}
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {routineCount}
          </div>
          <div className="text-[11px] text-[var(--color-text-secondary)] mt-1">
            Batch approval eligible
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="max-w-6xl mx-auto mb-6 p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={currentLanguage === 'hi' ? 'पार्टनर का नाम, काम/डील आईडी, ट्रिगर खोजें...' : currentLanguage === 'mr' ? 'भागीदाराचे नाव, जॉब आयडी, ट्रिगर शोधा...' : 'Search partner name, ref doc no, trigger event...'}
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
            />
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                filterMode === 'all' 
                  ? 'bg-[var(--color-accent-primary)] text-white' 
                  : 'bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              All Pending ({pendingEntries.length})
            </button>
            <button
              onClick={() => setFilterMode('anomalies')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1 ${
                filterMode === 'anomalies' 
                  ? 'bg-rose-600 text-white' 
                  : 'bg-[var(--color-bg)] border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Anomalies ({anomalyCount})
            </button>
            <button
              onClick={() => setFilterMode('routine')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1 ${
                filterMode === 'routine' 
                  ? 'bg-emerald-600 text-white' 
                  : 'bg-[var(--color-bg)] border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50'
              }`}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Routine ({routineCount})
            </button>
            <button
              onClick={() => setFilterMode('expedited')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1 ${
                filterMode === 'expedited' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-[var(--color-bg)] border border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-50'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Expedited ({expeditedCount})
            </button>
          </div>
        </div>

        {/* Batch Selection Action Bar */}
        <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border)] text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAllRoutine}
              className="text-[var(--color-accent-primary)] hover:underline font-medium"
            >
              {currentLanguage === 'hi' ? 'सभी सामान्य प्रविष्टियों का चयन करें' : currentLanguage === 'mr' ? 'सर्व सामान्य नोंदी निवडा' : 'Select All Routine Low-Risk'}
            </button>
            {selectedForBatch.length > 0 && (
              <span className="text-[var(--color-text-secondary)]">
                ({selectedForBatch.length} selected)
              </span>
            )}
          </div>

          {selectedForBatch.length > 0 && (
            <button
              onClick={handleApproveBatch}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 flex items-center gap-1.5 shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              Approve Batch ({selectedForBatch.length})
            </button>
          )}
        </div>
      </div>

      {/* Main Queue List */}
      <div className="max-w-6xl mx-auto space-y-3">
        {filteredEntries.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3 opacity-80" />
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
              {currentLanguage === 'hi' ? 'कतार में कोई लंबित भुगतान नहीं' : currentLanguage === 'mr' ? 'रांगेत कोणतेही प्रलंबित पेआउट नाही' : 'No Pending Payout Approvals'}
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)] max-w-md mx-auto mt-1">
              All partner commission payouts for this filter have been verified or disbursed. Routine automation keeps queue clear.
            </p>
          </div>
        ) : (
          filteredEntries.map((entry) => {
            const isBatchSelected = selectedForBatch.includes(entry.id);
            const isAnomaly = !!entry.isStatisticalAnomaly;
            const hasQcIssue = !!entry.relatedOpenQcIssue;
            const isExpedited = !!entry.isExpeditedHardship;

            return (
              <div 
                key={entry.id}
                className={`p-4 rounded-2xl bg-[var(--color-surface)] border transition-all ${
                  isAnomaly 
                    ? 'border-rose-500/40 shadow-sm shadow-rose-500/5' 
                    : hasQcIssue 
                    ? 'border-amber-500/40' 
                    : isExpedited 
                    ? 'border-blue-500/40 bg-blue-500/5' 
                    : 'border-[var(--color-border)] hover:border-amber-500/30'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left Anatomy */}
                  <div className="flex items-start gap-3 flex-1">
                    <input
                      type="checkbox"
                      checked={isBatchSelected}
                      onChange={() => toggleSelectForBatch(entry.id)}
                      className="mt-1.5 h-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-[var(--color-text-primary)]">
                          {entry.partnerName}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold border ${getTierBadge(entry.partnerTier)}`}>
                          {entry.partnerTier} Tier
                        </span>
                        <span className="text-xs text-[var(--color-text-secondary)] font-mono">
                          ({entry.partnerRole})
                        </span>

                        {isAnomaly && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Statistical Anomaly
                          </span>
                        )}

                        {hasQcIssue && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Open QC Snag Linked
                          </span>
                        )}

                        {isExpedited && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            Expedited Hardship
                          </span>
                        )}
                      </div>

                      <div className="mt-1.5 text-xs text-[var(--color-text-secondary)] flex flex-wrap items-center gap-x-4 gap-y-1">
                        <div>
                          Trigger: <span className="text-[var(--color-text-primary)] font-medium">{entry.triggerTypeLabel}</span>
                        </div>
                        <div>
                          Ref: <span className="font-mono text-[var(--color-text-primary)]">{entry.referenceDocNo}</span>
                        </div>
                        <div>
                          Rule: <span className="font-mono text-amber-600 dark:text-amber-400">{entry.appliedRuleVersion}</span>
                        </div>
                      </div>

                      {/* Anomaly or QC Notes */}
                      {isAnomaly && entry.anomalyNote && (
                        <div className="mt-2 text-xs p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300">
                          <strong>Anomaly Alert:</strong> {entry.anomalyNote}
                        </div>
                      )}

                      {hasQcIssue && (
                        <div className="mt-2 text-xs p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300">
                          <strong>QC Issue Trace:</strong> {entry.relatedOpenQcIssue}. Consider holding payout until final signoff.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Side: Amount & Action buttons */}
                  <div className="flex items-center justify-between md:justify-end gap-4 pt-3 md:pt-0 border-t md:border-t-0 border-[var(--color-border)]">
                    <div className="text-right">
                      <div className="text-xs text-[var(--color-text-secondary)] font-medium">Calculated Payout</div>
                      <div className="text-xl font-bold font-mono text-[var(--color-accent-primary)]">
                        {formatCurrency(entry.amount)}
                      </div>
                      {entry.dealOrJobValue > 0 && (
                        <div className="text-[10px] text-[var(--color-text-secondary)]">
                          Deal Val: {formatCurrency(entry.dealOrJobValue)}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isExpedited ? (
                        <button
                          onClick={() => handleExpediteHardship(entry.id)}
                          className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1 shadow-sm"
                          title="Expedite and approve immediately for worker hardship"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          Expedite
                        </button>
                      ) : (
                        <button
                          onClick={() => handleApproveSingle(entry.id)}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 shadow-sm"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approve
                        </button>
                      )}

                      <button
                        onClick={() => handleOpenHoldModal(entry)}
                        className="px-3 py-1.5 rounded-xl bg-[var(--color-bg)] border border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 text-xs font-medium flex items-center gap-1"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        Hold
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Hold Reason Modal */}
      {isHoldModalOpen && holdTargetEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-amber-600" />
                <h3 className="font-serif font-bold text-lg text-[var(--color-text-primary)]">
                  Hold Payout Entry
                </h3>
              </div>
              <button 
                onClick={() => setIsHoldModalOpen(false)}
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="p-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-xs">
                <div className="font-semibold">{holdTargetEntry.partnerName} ({holdTargetEntry.partnerRole})</div>
                <div className="text-[var(--color-text-secondary)]">Doc Ref: {holdTargetEntry.referenceDocNo}</div>
                <div className="font-mono font-bold text-amber-600 mt-1">Amount: {formatCurrency(holdTargetEntry.amount)}</div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                  Reason for Hold / QC Snag Link:
                </label>
                <textarea
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  placeholder="e.g. Unresolved QC snag on high-voltage electrical cable connection. Held until final re-inspection."
                  rows={3}
                  className="w-full p-2.5 text-xs rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>

              <p className="text-[11px] text-[var(--color-text-secondary)]">
                Holding this payout prevents automated bank disbursement until Admin releases the hold. The partner will see a transparent status update.
              </p>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsHoldModalOpen(false)}
                className="px-4 py-2 text-xs font-medium rounded-xl border border-[var(--color-border)] hover:bg-black/5"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmHold}
                disabled={!holdReason.trim()}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
              >
                Confirm Hold Status
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
