import React, { useState } from 'react';
import { 
  ArrowLeft, DollarSign, CheckCircle2, Clock, AlertTriangle, Filter, 
  Search, ShieldCheck, CheckSquare, XCircle, ArrowUpRight, HelpCircle, 
  Layers, User, ChevronRight, RefreshCw, AlertCircle, Info, Sparkles
} from 'lucide-react';
import { Card, Button } from './Common';
import { DbManager } from '../lib/db';
import { 
  CommissionPayoutEntry, 
  CommissionPayoutSummary, 
  UserRole 
} from '../types';

interface StageWisePayoutTrackerScreenProps {
  onBack: () => void;
  onNavigateToRulesEngine?: () => void;
  userRole?: UserRole;
  currentLanguage?: 'en' | 'hi' | 'mr';
}

export const StageWisePayoutTrackerScreen: React.FC<StageWisePayoutTrackerScreenProps> = ({
  onBack,
  onNavigateToRulesEngine,
  userRole = 'admin',
  currentLanguage = 'en'
}) => {
  // Payout Data State
  const [summary, setSummary] = useState<CommissionPayoutSummary>(() => DbManager.getCommissionPayoutSummary());
  const [entries, setEntries] = useState<CommissionPayoutEntry[]>(() => DbManager.getCommissionPayoutEntries());

  // Filter State
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [triggerFilter, setTriggerFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Hold Dispute Modal State
  const [holdingEntry, setHoldingEntry] = useState<CommissionPayoutEntry | null>(null);
  const [disputeNote, setDisputeNote] = useState<string>('');

  // UI Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const refreshData = () => {
    setSummary(DbManager.getCommissionPayoutSummary());
    setEntries(DbManager.getCommissionPayoutEntries());
  };

  // Action Handlers
  const handleApproveSingle = (entryId: string, partnerName: string, amount: number) => {
    DbManager.approveCommissionPayout(entryId);
    refreshData();
    showToast(`Approved payout of ₹${amount.toLocaleString('en-IN')} for ${partnerName}.`);
  };

  const handleApproveAllPending = () => {
    // Phase 36 — LEVEL 3 (financial): bulk-approving EVERY pending
    // commission payout had no confirmation of any kind before this fix.
    if (!window.confirm('Approve ALL pending commission payouts? This affects every partner with a pending payout, not just one.')) {
      return;
    }
    const approvedCount = DbManager.approveAllPendingCommissionPayouts();
    refreshData();
    showToast(`Successfully batch-approved ${approvedCount} pending commission payouts!`);
  };

  const handleOpenHoldModal = (entry: CommissionPayoutEntry) => {
    setHoldingEntry(entry);
    setDisputeNote('');
  };

  const handleSaveHoldDispute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!holdingEntry) return;

    DbManager.holdCommissionPayout(holdingEntry.id, disputeNote || 'Held for verification');
    refreshData();
    setHoldingEntry(null);
    showToast(`Payout held under dispute investigation.`);
  };

  // Filtered List
  const filteredEntries = entries.filter(e => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (triggerFilter !== 'all' && e.triggerType !== triggerFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchPartner = e.partnerName.toLowerCase().includes(q);
      const matchDoc = e.referenceDocNo.toLowerCase().includes(q);
      const matchTrigger = e.triggerTypeLabel.toLowerCase().includes(q);
      if (!matchPartner && !matchDoc && !matchTrigger) return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-5 py-3 rounded-lg shadow-xl flex items-center gap-3 animate-fade-in border border-slate-700">
          <CheckCircle2 className="w-5 h-5 text-amber-400 shrink-0" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Top Banner Header */}
      <div className="bg-slate-900 text-white border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <button 
            onClick={onBack}
            className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-medium mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                  <DollarSign className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-white">
                    Stage-Wise Workforce Payout Tracker
                  </h1>
                  <p className="text-slate-400 text-sm mt-0.5">
                    Whole-business ledger tracking pending approvals, stage completion bonuses & disbursements
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {summary.totalPendingCount > 0 && (
                <Button
                  onClick={handleApproveAllPending}
                  className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs py-2 px-3.5 flex items-center gap-2 shadow-lg"
                >
                  <CheckSquare className="w-4 h-4" />
                  <span>Batch Approve All Pending ({summary.totalPendingCount})</span>
                </Button>
              )}

              {onNavigateToRulesEngine && (
                <Button 
                  variant="secondary"
                  onClick={onNavigateToRulesEngine}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 text-xs py-2 px-3"
                >
                  Configure Rules
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <Card className="bg-white p-5 border border-amber-200 shadow-sm rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Pending Approval Outflow</span>
              <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-amber-900 mt-2">
              ₹{summary.totalPendingAmount.toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-amber-700 font-medium mt-1">
              {summary.totalPendingCount} pending worker approvals
            </p>
          </Card>

          <Card className="bg-white p-5 border border-emerald-200 shadow-sm rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Approved Ready Payout</span>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-900 mt-2">
              ₹{summary.totalApprovedAmount.toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-emerald-700 font-medium mt-1">
              Queued for next banking run
            </p>
          </Card>

          <Card className="bg-white p-5 border border-slate-200 shadow-sm rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Disbursed This Month</span>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-2">
              ₹{summary.totalPaidThisMonth.toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {summary.totalPaidCount} payouts cleared to partner accounts
            </p>
          </Card>

          <Card className="bg-white p-5 border border-slate-200 shadow-sm rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Disputed / Held</span>
              <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-red-600 mt-2">
              {summary.heldDisputeCount}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Under attendance or milestone review
            </p>
          </Card>
        </div>

        {/* Breakdown by Stage / Trigger Type */}
        <Card className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h3 className="font-bold text-slate-900 text-base">Spend Distribution by Stage & Event Trigger</h3>
          </div>

          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {summary.breakdownByStage.map(stage => (
              <div key={stage.triggerType} className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-xs font-bold text-slate-700 block truncate">{stage.label}</span>
                <div className="font-mono text-lg font-bold text-slate-900 mt-1">
                  ₹{stage.totalAmount.toLocaleString('en-IN')}
                </div>
                <span className="text-xs text-slate-500 font-medium block mt-1">
                  {stage.count} transaction entries
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Filter Bar & Main Table */}
        <div className="space-y-4">
          <Card className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Search */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Search Entries</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search partner, doc #, trigger..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Filter by Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full py-1.5 px-3 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="all">All Payout Statuses</option>
                  <option value="pending_approval">Pending Approval</option>
                  <option value="approved_pending_payout">Approved Ready</option>
                  <option value="paid">Disbursed / Paid</option>
                  <option value="held_dispute">Held in Dispute</option>
                </select>
              </div>

              {/* Trigger Filter */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Filter by Event Trigger</label>
                <select
                  value={triggerFilter}
                  onChange={(e) => setTriggerFilter(e.target.value)}
                  className="w-full py-1.5 px-3 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="all">All Event Triggers</option>
                  <option value="surveyor_lead_capture">Lead Capture Bonus</option>
                  <option value="deal_conversion">Deal Conversion Commission</option>
                  <option value="technician_job_completion">Technician Stage Completion</option>
                  <option value="qc_inspection_passed">QC Inspection Audit Fee</option>
                  <option value="referral_bonus">Referral Network Bonus</option>
                </select>
              </div>
            </div>
          </Card>

          {/* Table List */}
          <Card className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="divide-y divide-slate-200">
              {filteredEntries.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <Info className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  No payout entries matched your filter selection.
                </div>
              ) : (
                filteredEntries.map(entry => (
                  <div key={entry.id} className="p-5 hover:bg-slate-50/80 transition-colors">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900 text-base">{entry.partnerName}</span>
                          <span className="text-xs text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded capitalize">
                            {entry.partnerRole} ({entry.partnerTier.toUpperCase()})
                          </span>

                          {entry.status === 'pending_approval' && (
                            <span className="text-xs font-bold text-amber-800 bg-amber-100 border border-amber-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-600" />
                              Pending Approval
                            </span>
                          )}
                          {entry.status === 'approved_pending_payout' && (
                            <span className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Approved Ready
                            </span>
                          )}
                          {entry.status === 'paid' && (
                            <span className="text-xs font-bold text-blue-800 bg-blue-100 border border-blue-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-blue-600" />
                              Paid
                            </span>
                          )}
                          {entry.status === 'held_dispute' && (
                            <span className="text-xs font-bold text-red-800 bg-red-100 border border-red-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-red-600" />
                              Held in Dispute
                            </span>
                          )}
                        </div>

                        <div className="mt-1.5 text-xs text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span>Trigger: <strong className="text-slate-800">{entry.triggerTypeLabel}</strong></span>
                          <span>Doc Ref: <strong className="font-mono text-slate-800">{entry.referenceDocNo}</strong></span>
                          <span>Applied Rule: <strong className="font-mono text-amber-700">{entry.appliedRuleVersion}</strong></span>
                        </div>

                        {entry.notes && (
                          <p className="text-xs text-slate-500 mt-2 bg-slate-50 border border-slate-200 p-2 rounded">
                            "{entry.notes}"
                          </p>
                        )}
                      </div>

                      {/* Right Amount & Actions */}
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <span className="text-xs text-slate-400 block">Payout Amount</span>
                          <span className="font-mono text-xl font-bold text-slate-900">
                            ₹{entry.amount.toLocaleString('en-IN')}
                          </span>
                        </div>

                        {entry.status === 'pending_approval' && (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleApproveSingle(entry.id, entry.partnerName, entry.amount)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-1.5 px-3"
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenHoldModal(entry)}
                              className="text-xs py-1.5 px-2.5 text-red-700 border-red-200 hover:bg-red-50"
                            >
                              Hold
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

      </div>

      {/* HOLD DISPUTE MODAL */}
      {holdingEntry && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="bg-white max-w-md w-full p-6 rounded-2xl shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Hold Payout for Investigation
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Holding payout of ₹{holdingEntry.amount.toLocaleString('en-IN')} for {holdingEntry.partnerName}.
            </p>

            <form onSubmit={handleSaveHoldDispute} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason / Dispute Note</label>
                <textarea
                  rows={3}
                  value={disputeNote}
                  onChange={(e) => setDisputeNote(e.target.value)}
                  placeholder="Specify missing site photo evidence, attendance gap, or compliance discrepancy..."
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setHoldingEntry(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs"
                >
                  Confirm Hold
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

    </div>
  );
};
