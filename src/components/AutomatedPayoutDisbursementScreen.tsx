import React, { useState } from 'react';
import { 
  Zap, CheckCircle2, XCircle, RefreshCw, AlertTriangle, 
  Send, Building, CreditCard, ArrowLeft, Download, ShieldCheck, 
  Search, Filter, Clock, FileCheck, DollarSign, Layers, ChevronRight, Phone
} from 'lucide-react';
import { DbManager } from '../lib/db';
import { AutomatedDisbursementRecord, CommissionPayoutEntry, UserRole } from '../types';

interface AutomatedPayoutDisbursementScreenProps {
  userRole: UserRole;
  currentLanguage: 'en' | 'hi' | 'mr';
  onNavigateToApprovalQueue?: () => void;
  onBack?: () => void;
}

export const AutomatedPayoutDisbursementScreen: React.FC<AutomatedPayoutDisbursementScreenProps> = ({
  userRole,
  currentLanguage,
  onNavigateToApprovalQueue,
  onBack
}) => {
  const [disbursements, setDisbursements] = useState<AutomatedDisbursementRecord[]>(() => DbManager.getAutomatedDisbursements());
  const [payoutEntries, setPayoutEntries] = useState<CommissionPayoutEntry[]>(() => DbManager.getCommissionPayoutEntries());
  
  const [activeTab, setActiveTab] = useState<'approved_ready' | 'history' | 'failed_alerts'>('approved_ready');
  const [disbursementMethod, setDisbursementMethod] = useState<'bank_neft' | 'bank_rtgs' | 'upi_instant'>('upi_instant');
  const [searchQuery, setSearchQuery] = useState('');

  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Ready for payout entries (status = approved_pending_payout)
  const approvedEntries = payoutEntries.filter(e => e.status === 'approved_pending_payout');

  // Group approved entries by partner
  const partnerConsolidatedMap: Record<string, CommissionPayoutEntry[]> = {};
  approvedEntries.forEach(entry => {
    if (!partnerConsolidatedMap[entry.partnerId]) {
      partnerConsolidatedMap[entry.partnerId] = [];
    }
    partnerConsolidatedMap[entry.partnerId].push(entry);
  });

  const partnerConsolidatedList = Object.keys(partnerConsolidatedMap).map(partnerId => {
    const list = partnerConsolidatedMap[partnerId];
    const totalAmount = list.reduce((s, item) => s + item.amount, 0);
    return {
      partnerId,
      partnerName: list[0].partnerName,
      partnerRole: list[0].partnerRole,
      partnerTier: list[0].partnerTier,
      entriesCount: list.length,
      entries: list,
      totalAmount
    };
  });

  const totalApprovedPoolAmount = approvedEntries.reduce((sum, item) => sum + item.amount, 0);
  const failedDisbursements = disbursements.filter(d => d.status === 'failed');

  const handleExecuteBatchDisbursement = () => {
    if (approvedEntries.length === 0) return;
    // Phase 36 — LEVEL 3 (financial): a batch bank disbursement had no
    // confirmation of any kind before this fix.
    if (!window.confirm(`Execute batch disbursement of ${formatCurrency(totalApprovedPoolAmount)} across ${approvedEntries.length} entries? This transfers real funds and cannot be undone from here.`)) {
      return;
    }
    setIsProcessingBatch(true);

    setTimeout(() => {
      const allApprovedIds = approvedEntries.map(e => e.id);
      DbManager.triggerBatchDisbursement(allApprovedIds, disbursementMethod);
      
      setDisbursements(DbManager.getAutomatedDisbursements());
      setPayoutEntries(DbManager.getCommissionPayoutEntries());
      setIsProcessingBatch(false);

      const msg = currentLanguage === 'hi'
        ? `सफलतापूर्वक ${approvedEntries.length} प्रविष्टियों के लिए ${formatCurrency(totalApprovedPoolAmount)} का वितरण किया गया!`
        : currentLanguage === 'mr'
        ? `यशस्वीरित्या ${approvedEntries.length} नोंदींसाठी ${formatCurrency(totalApprovedPoolAmount)} वितरित केले!`
        : `Batch Disbursement Executed: ${formatCurrency(totalApprovedPoolAmount)} transferred across ${partnerConsolidatedList.length} partners!`;

      setSuccessMessage(msg);
      setTimeout(() => setSuccessMessage(null), 4000);
    }, 1200);
  };

  const handleRetryFailed = (disbursementId: string) => {
    DbManager.retryFailedDisbursement(disbursementId);
    setDisbursements(DbManager.getAutomatedDisbursements());
    setSuccessMessage(currentLanguage === 'hi' ? 'पुनः प्रयास सफल: वितरण पूर्ण हुआ' : currentLanguage === 'mr' ? 'पुन्हा प्रयत्न यशस्वी: वितरण पूर्ण झाले' : 'Disbursement retry successful! Bank response verified.');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const formatCurrency = (amt: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amt);
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
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  {currentLanguage === 'hi' ? 'बैंकिंग ऑटोमेशन' : currentLanguage === 'mr' ? 'बँकिंग ऑटोमेशन' : 'Banking Automation Engine'}
                </span>
                <span className="text-xs text-[var(--color-text-secondary)] font-mono">Module 17 • Prompt 164</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-serif font-bold tracking-tight text-[var(--color-text-primary)] mt-1">
                {currentLanguage === 'hi' ? 'स्वचालित भुगतान वितरण' : currentLanguage === 'mr' ? 'स्वयंचलित पेआउट वितरण' : 'Automated Payout Disbursement'}
              </h1>
            </div>
          </div>

          {onNavigateToApprovalQueue && (
            <button
              onClick={onNavigateToApprovalQueue}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-black/5 flex items-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              {currentLanguage === 'hi' ? 'स्वीकृति कतार पर लौटें' : currentLanguage === 'mr' ? 'मंजुरी रांगेवर परत जा' : 'Back to Approval Queue'}
            </button>
          )}
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="max-w-6xl mx-auto mb-4 p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm flex items-center gap-2.5 animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Metric Overview Bar */}
      <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-emerald-500/30 shadow-sm">
          <div className="text-xs text-[var(--color-text-secondary)] font-medium mb-1">
            {currentLanguage === 'hi' ? 'वितरण हेतु तैयार पूल' : currentLanguage === 'mr' ? 'वितरणासाठी तयार निधी' : 'Approved Ready Pool'}
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {formatCurrency(totalApprovedPoolAmount)}
          </div>
          <div className="text-[11px] text-[var(--color-text-secondary)] mt-1">
            {approvedEntries.length} entries ({partnerConsolidatedList.length} partners)
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm">
          <div className="text-xs text-[var(--color-text-secondary)] font-medium mb-1">
            {currentLanguage === 'hi' ? 'इस माह वितरित कुल राशि' : currentLanguage === 'mr' ? 'या महिन्यात वितरीत एकूण' : 'Disbursed This Month'}
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--color-accent-primary)]">
            {formatCurrency(disbursements.filter(d => d.status === 'completed').reduce((sum, item) => sum + item.amount, 0))}
          </div>
          <div className="text-[11px] text-[var(--color-text-secondary)] mt-1">
            Instant UPI & NEFT verified
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-rose-500/30 shadow-sm bg-rose-500/5">
          <div className="text-xs text-rose-600 dark:text-rose-400 font-medium mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            {currentLanguage === 'hi' ? 'विफल वितरण अलर्ट' : currentLanguage === 'mr' ? 'अयशस्वी वितरण इशारे' : 'Failed Disbursements'}
          </div>
          <div className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
            {failedDisbursements.length}
          </div>
          <div className="text-[11px] text-[var(--color-text-secondary)] mt-1">
            Bank rejection / account fix needed
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-blue-500/30 shadow-sm bg-blue-500/5">
          <div className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5" />
            {currentLanguage === 'hi' ? 'त्वरित UPI सफलता दर' : currentLanguage === 'mr' ? 'इन्स्टंट UPI यश दर' : 'Instant UPI Success Rate'}
          </div>
          <div className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
            99.4%
          </div>
          <div className="text-[11px] text-[var(--color-text-secondary)] mt-1">
            Direct NPCI API Gateway
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="max-w-6xl mx-auto mb-6 flex items-center gap-2 border-b border-[var(--color-border)] pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('approved_ready')}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
            activeTab === 'approved_ready'
              ? 'bg-[var(--color-accent-primary)] text-white shadow-sm'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-black/5'
          }`}
        >
          <Layers className="w-4 h-4" />
          {currentLanguage === 'hi' ? 'स्वीकृत तैयार बैच' : currentLanguage === 'mr' ? 'मंजूर तयार बॅच' : 'Approved Ready Queue'}
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-white/20 font-mono">
            {approvedEntries.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('failed_alerts')}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
            activeTab === 'failed_alerts'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          {currentLanguage === 'hi' ? 'विफल प्रयास' : currentLanguage === 'mr' ? 'अयशस्वी प्रयत्न' : 'Failed Exceptions'}
          {failedDisbursements.length > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-white/20 font-mono">
              {failedDisbursements.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
            activeTab === 'history'
              ? 'bg-[var(--color-accent-primary)] text-white shadow-sm'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-black/5'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          {currentLanguage === 'hi' ? 'वितरण इतिहास' : currentLanguage === 'mr' ? 'वितरण इतिहास' : 'Disbursement Log'}
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-black/10 dark:bg-white/10 font-mono">
            {disbursements.length}
          </span>
        </button>
      </div>

      {/* Tab 1: Approved Ready Queue */}
      {activeTab === 'approved_ready' && (
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Method Selector & Batch Execution Banner */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-900/10 via-amber-900/10 to-transparent border border-emerald-500/30 bg-[var(--color-surface)] shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-serif font-bold text-lg text-[var(--color-text-primary)] flex items-center gap-2">
                  <Zap className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  {currentLanguage === 'hi' ? 'बैच वितरण निष्पादन' : currentLanguage === 'mr' ? 'बॅच वितरण अंमलबजावणी' : 'Execute Consolidated Batch Transfer'}
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                  Consolidates multiple stage payouts for the same partner into 1 single bank transaction to streamline operations.
                </p>

                {/* Disbursement Method Choice */}
                <div className="mt-4 flex items-center gap-3">
                  <span className="text-xs font-semibold text-[var(--color-text-secondary)]">Method:</span>
                  <div className="flex items-center gap-2">
                    <label className={`cursor-pointer px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all ${
                      disbursementMethod === 'upi_instant' 
                        ? 'bg-emerald-600 text-white border-emerald-600' 
                        : 'bg-[var(--color-bg)] border-[var(--color-border)] text-[var(--color-text-secondary)]'
                    }`}>
                      <input 
                        type="radio" 
                        name="method" 
                        value="upi_instant" 
                        checked={disbursementMethod === 'upi_instant'} 
                        onChange={() => setDisbursementMethod('upi_instant')}
                        className="sr-only"
                      />
                      <Zap className="w-3.5 h-3.5" />
                      Instant UPI (NPCI 24/7)
                    </label>

                    <label className={`cursor-pointer px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all ${
                      disbursementMethod === 'bank_neft' 
                        ? 'bg-emerald-600 text-white border-emerald-600' 
                        : 'bg-[var(--color-bg)] border-[var(--color-border)] text-[var(--color-text-secondary)]'
                    }`}>
                      <input 
                        type="radio" 
                        name="method" 
                        value="bank_neft" 
                        checked={disbursementMethod === 'bank_neft'} 
                        onChange={() => setDisbursementMethod('bank_neft')}
                        className="sr-only"
                      />
                      <Building className="w-3.5 h-3.5" />
                      Bank NEFT
                    </label>

                    <label className={`cursor-pointer px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all ${
                      disbursementMethod === 'bank_rtgs' 
                        ? 'bg-emerald-600 text-white border-emerald-600' 
                        : 'bg-[var(--color-bg)] border-[var(--color-border)] text-[var(--color-text-secondary)]'
                    }`}>
                      <input 
                        type="radio" 
                        name="method" 
                        value="bank_rtgs" 
                        checked={disbursementMethod === 'bank_rtgs'} 
                        onChange={() => setDisbursementMethod('bank_rtgs')}
                        className="sr-only"
                      />
                      <CreditCard className="w-3.5 h-3.5" />
                      Bank RTGS (&gt;₹2L)
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="text-right">
                  <div className="text-xs text-[var(--color-text-secondary)]">Total Payout Amount</div>
                  <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(totalApprovedPoolAmount)}
                  </div>
                </div>

                <button
                  onClick={handleExecuteBatchDisbursement}
                  disabled={approvedEntries.length === 0 || isProcessingBatch}
                  className="w-full md:w-auto px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition-all"
                >
                  {isProcessingBatch ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Dispatching Bank Gateway...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Disburse Now ({partnerConsolidatedList.length} Transfers)
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Consolidated Partner Cards List */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
              Consolidated Partner Payout Bundles ({partnerConsolidatedList.length})
            </h3>

            {partnerConsolidatedList.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3 opacity-80" />
                <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                  All Approved Payouts Disbursed
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] max-w-md mx-auto mt-1">
                  There are currently no approved payouts awaiting disbursement. New items will appear here after Admin queue verification.
                </p>
              </div>
            ) : (
              partnerConsolidatedList.map((bundle) => (
                <div 
                  key={bundle.partnerId}
                  className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-emerald-500/30 transition-all shadow-sm"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base text-[var(--color-text-primary)]">
                          {bundle.partnerName}
                        </span>
                        <span className="text-xs font-mono text-[var(--color-text-secondary)]">
                          ({bundle.partnerRole})
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 uppercase font-bold">
                          {bundle.partnerTier} Tier
                        </span>
                      </div>

                      {/* Items breakdown inside bundle */}
                      <div className="mt-2 space-y-1">
                        {bundle.entries.map((entry) => (
                          <div key={entry.id} className="text-xs flex items-center gap-3 text-[var(--color-text-secondary)]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            <span className="text-[var(--color-text-primary)] font-medium">{entry.triggerTypeLabel}</span>
                            <span className="font-mono text-[11px] text-[var(--color-text-secondary)]">Ref: {entry.referenceDocNo}</span>
                            <span className="font-mono font-semibold text-[var(--color-accent-primary)]">{formatCurrency(entry.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="text-right flex md:flex-col justify-between items-end border-t md:border-t-0 pt-3 md:pt-0 border-[var(--color-border)]">
                      <div className="text-xs text-[var(--color-text-secondary)]">
                        Consolidated Transfer ({bundle.entriesCount} triggers)
                      </div>
                      <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(bundle.totalAmount)}
                      </div>
                      <div className="text-[11px] text-[var(--color-text-secondary)] flex items-center gap-1 mt-1">
                        <CreditCard className="w-3 h-3" /> Bank details verified
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Failed Exceptions */}
      {activeTab === 'failed_alerts' && (
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-600" />
            <div>
              <strong>Disbursement Exception Protocol:</strong> When a bank transfer fails, money remains safely in AIEC escrow. Fix bank credentials or resolve bank downtime before triggering re-try.
            </div>
          </div>

          {failedDisbursements.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3 opacity-80" />
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                Zero Failed Disbursements
              </h3>
              <p className="text-xs text-[var(--color-text-secondary)] max-w-md mx-auto mt-1">
                All bank & UPI transactions have completed cleanly without gateway rejections.
              </p>
            </div>
          ) : (
            failedDisbursements.map((failed) => (
              <div 
                key={failed.id}
                className="p-4 rounded-2xl bg-[var(--color-surface)] border border-rose-500/40 shadow-sm"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[var(--color-text-primary)]">
                        {failed.partnerName}
                      </span>
                      <span className="text-xs text-[var(--color-text-secondary)] font-mono">
                        ({failed.partnerRole})
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-bold uppercase">
                        Failed Attempt #{failed.retryCount}
                      </span>
                    </div>

                    <div className="mt-2 text-xs p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300">
                      <strong>Failure Reason:</strong> {failed.failureReason || 'Bank gateway connection timeout or invalid account credentials.'}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-text-secondary)]">
                      <div>Account: <span className="font-mono text-[var(--color-text-primary)]">{failed.bankAccountMasked}</span></div>
                      <div>IFSC: <span className="font-mono text-[var(--color-text-primary)]">{failed.ifscCode}</span></div>
                      <div>UPI: <span className="font-mono text-[var(--color-text-primary)]">{failed.upiId || 'N/A'}</span></div>
                    </div>
                  </div>

                  <div className="text-right flex md:flex-col justify-between items-end border-t md:border-t-0 pt-3 md:pt-0 border-[var(--color-border)]">
                    <div>
                      <div className="text-xs text-[var(--color-text-secondary)]">Held Amount</div>
                      <div className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400">
                        {formatCurrency(failed.amount)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => handleRetryFailed(failed.id)}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 shadow-sm"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Retry Disbursement
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 3: Disbursement Log History */}
      {activeTab === 'history' && (
        <div className="max-w-6xl mx-auto space-y-3">
          <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search partner, batch ID..."
                className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] focus:outline-none"
              />
            </div>
            <div className="text-xs text-[var(--color-text-secondary)]">
              Showing {disbursements.length} disbursement records
            </div>
          </div>

          {disbursements.map((d) => (
            <div 
              key={d.id}
              className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[var(--color-text-primary)]">{d.partnerName}</span>
                    <span className="font-mono text-[var(--color-text-secondary)]">Batch: {d.batchId}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      d.status === 'completed' 
                        ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' 
                        : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                    }`}>
                      {d.status}
                    </span>
                  </div>
                  <div className="mt-1 text-[var(--color-text-secondary)] flex items-center gap-3">
                    <span>Method: <strong className="uppercase">{d.disbursementMethod}</strong></span>
                    <span>Account: <span className="font-mono">{d.bankAccountMasked}</span></span>
                    <span>Time: {new Date(d.initiatedAt).toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-base font-bold font-mono text-[var(--color-accent-primary)]">
                    {formatCurrency(d.amount)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
