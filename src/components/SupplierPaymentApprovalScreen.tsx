import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, AlertTriangle, ShieldAlert, DollarSign, Building2, 
  Search, Filter, Clock, ArrowRight, ShieldCheck, FileText, Lock, 
  RotateCcw, CheckSquare, Square, Eye, AlertCircle, Sparkles, Send, Layers
} from 'lucide-react';
import { DbManager } from '../lib/db';
import { SupplierPaymentRecord, User as UserType } from '../types';

interface Props {
  user: UserType;
  onNavigateToReleaseDetail: (paymentId: string) => void;
  onNavigateToDiscrepancyReport?: (reportId: string) => void;
}

export const SupplierPaymentApprovalScreen: React.FC<Props> = ({ 
  user, 
  onNavigateToReleaseDetail,
  onNavigateToDiscrepancyReport 
}) => {
  const [payments, setPayments] = useState<SupplierPaymentRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ready_for_approval');
  
  // Batch selection
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [showBatchModal, setShowBatchModal] = useState(false);

  // Hold reason modal
  const [holdingPayment, setHoldingPayment] = useState<SupplierPaymentRecord | null>(null);
  const [holdReasonText, setHoldReasonText] = useState('');

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const list = DbManager.getSupplierPayments();
    setPayments(list);
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // One-tap approve
  const handleApproveSingle = (payment: SupplierPaymentRecord) => {
    const reversalExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins
    const updated: SupplierPaymentRecord = {
      ...payment,
      approvalStatus: 'approved_pending_transfer',
      approvedAt: new Date().toISOString(),
      approvedBy: user.name,
      approvalReversalExpiry: reversalExpiry,
      updatedAt: new Date().toISOString()
    };

    // Update current milestone in chain to approved
    if (updated.milestoneChain[updated.currentMilestoneIndex]) {
      updated.milestoneChain[updated.currentMilestoneIndex].status = 'approved';
    }

    DbManager.updateSupplierPayment(updated);
    loadData();
    showToast(`Payment of ₹${payment.dueAmountINR.toLocaleString('en-IN')} approved for ${payment.supplierName}. 15-min reversal window active.`);
  };

  // Undo / Reverse approval within 15 mins
  const handleReverseApproval = (payment: SupplierPaymentRecord) => {
    const updated: SupplierPaymentRecord = {
      ...payment,
      approvalStatus: 'ready_for_approval',
      approvalReversalExpiry: undefined,
      approvedAt: undefined,
      approvedBy: undefined,
      updatedAt: new Date().toISOString()
    };

    if (updated.milestoneChain[updated.currentMilestoneIndex]) {
      updated.milestoneChain[updated.currentMilestoneIndex].status = 'triggered';
    }

    DbManager.updateSupplierPayment(updated);
    loadData();
    showToast(`Approval reversed for ${payment.poNumber}. Returned to Ready Queue.`);
  };

  // Hold payment with reason
  const handleConfirmHold = () => {
    if (!holdingPayment || !holdReasonText.trim()) return;

    const overrideRecord = {
      id: `ov_${Date.now()}`,
      timestamp: new Date().toISOString(),
      adminName: user.name,
      actionType: 'milestone_hold' as const,
      previousValue: holdingPayment.approvalStatus,
      newValue: 'held',
      reason: holdReasonText
    };

    const updated: SupplierPaymentRecord = {
      ...holdingPayment,
      approvalStatus: 'held',
      holdReason: holdReasonText,
      overrideLog: [overrideRecord, ...holdingPayment.overrideLog],
      updatedAt: new Date().toISOString()
    };

    if (updated.milestoneChain[updated.currentMilestoneIndex]) {
      updated.milestoneChain[updated.currentMilestoneIndex].status = 'held';
    }

    DbManager.updateSupplierPayment(updated);
    loadData();
    setHoldingPayment(null);
    setHoldReasonText('');
    showToast(`Payment of ₹${holdingPayment.dueAmountINR.toLocaleString('en-IN')} placed on hold.`);
  };

  // Batch approval
  const handleSelectAllRoutine = () => {
    const routineReady = payments
      .filter(p => p.approvalStatus === 'ready_for_approval' && !p.hasOpenDiscrepancyFlag)
      .map(p => p.id);
    
    if (selectedPaymentIds.length === routineReady.length) {
      setSelectedPaymentIds([]);
    } else {
      setSelectedPaymentIds(routineReady);
    }
  };

  const handleToggleSelect = (id: string) => {
    if (selectedPaymentIds.includes(id)) {
      setSelectedPaymentIds(selectedPaymentIds.filter(i => i !== id));
    } else {
      setSelectedPaymentIds([...selectedPaymentIds, id]);
    }
  };

  const handleExecuteBatchApprove = () => {
    // Phase 36 — LEVEL 3 (financial): batch supplier-payment approval had
    // no confirmation of any kind before this fix (a 15-minute reversal
    // window exists after approval, but confirming INTENT before acting
    // is still the right default for a financial batch action).
    if (selectedPaymentIds.length === 0) return;
    if (!window.confirm(`Approve ${selectedPaymentIds.length} supplier payment(s) for transfer? You will have a 15-minute window to reverse this batch.`)) {
      return;
    }
    const reversalExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const batchId = `BATCH-${Date.now().toString().slice(-4)}`;

    let count = 0;
    let totalAmt = 0;

    payments.forEach(payment => {
      if (selectedPaymentIds.includes(payment.id)) {
        count++;
        totalAmt += payment.dueAmountINR;

        const updated: SupplierPaymentRecord = {
          ...payment,
          approvalStatus: 'approved_pending_transfer',
          approvedAt: new Date().toISOString(),
          approvedBy: user.name,
          approvalReversalExpiry: reversalExpiry,
          batchId,
          updatedAt: new Date().toISOString()
        };

        if (updated.milestoneChain[updated.currentMilestoneIndex]) {
          updated.milestoneChain[updated.currentMilestoneIndex].status = 'approved';
        }

        DbManager.updateSupplierPayment(updated);
      }
    });

    loadData();
    setSelectedPaymentIds([]);
    setShowBatchModal(false);
    showToast(`Batch approved ${count} payments totaling ₹${totalAmt.toLocaleString('en-IN')}. 15-min undo active.`);
  };

  // Filtered payments
  const filteredPayments = payments.filter(p => {
    const matchesSearch = 
      p.poNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.supplierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.triggerMilestone.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = 
      statusFilter === 'all' || 
      (statusFilter === 'ready_for_approval' && p.approvalStatus === 'ready_for_approval') ||
      (statusFilter === 'approved' && p.approvalStatus === 'approved_pending_transfer') ||
      (statusFilter === 'held' && p.approvalStatus === 'held');

    return matchesSearch && matchesStatus;
  });

  const readyCount = payments.filter(p => p.approvalStatus === 'ready_for_approval').length;
  const heldCount = payments.filter(p => p.approvalStatus === 'held').length;
  const approvedCount = payments.filter(p => p.approvalStatus === 'approved_pending_transfer').length;
  const totalReadyVal = payments
    .filter(p => p.approvalStatus === 'ready_for_approval')
    .reduce((sum, p) => sum + p.dueAmountINR, 0);

  return (
    <div className="min-h-screen bg-alabaster text-charcoal p-4 md:p-6 pb-28 max-w-5xl mx-auto space-y-6">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-royalemerald text-white px-4 py-3 rounded-xl shadow-lg border border-antiquegold/30 flex items-center space-x-2 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-antiquegold" />
          <span className="text-sm font-medium">{toastMsg}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-antiquegold/20 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-antiquegold/10 text-antiquegold border border-antiquegold/20">
              SOP Step #1 • Module 12: Supplier Payments
            </span>
            <span className="text-xs text-charcoal/60 font-mono">Milestone-Gated Cash Release</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-charcoal mt-1">
            Supplier Payment Approval Queue
          </h1>
          <p className="text-sm text-charcoal/70">
            Verify milestone evidence, check for open quality discrepancies, and approve bank fund transfers.
          </p>
        </div>

        {/* Batch Approval Trigger Button */}
        {selectedPaymentIds.length > 0 && (
          <button
            onClick={() => setShowBatchModal(true)}
            className="px-4 py-2.5 bg-royalemerald hover:bg-royalemerald/90 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center space-x-2 self-start md:self-auto"
          >
            <Sparkles className="w-4 h-4 text-antiquegold" />
            <span>Batch Approve ({selectedPaymentIds.length} Selected)</span>
          </button>
        )}
      </div>

      {/* KPI Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-antiquegold/20 shadow-sm space-y-1">
          <span className="text-xs text-charcoal/60 font-semibold block">Ready for Approval</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-royalemerald">{readyCount} Queue</span>
            <span className="text-xs font-mono font-bold text-charcoal/80">₹{totalReadyVal.toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-antiquegold/20 shadow-sm space-y-1">
          <span className="text-xs text-charcoal/60 font-semibold block">Discrepancy / Admin Holds</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-red-600">{heldCount} Held</span>
            <span className="text-[11px] text-red-700 bg-red-50 px-2 py-0.5 rounded font-semibold">
              Quality Hold Active
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-antiquegold/20 shadow-sm space-y-1">
          <span className="text-xs text-charcoal/60 font-semibold block">Approved / Pending Bank Transfer</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-amber-700">{approvedCount} Pending</span>
            <span className="text-[11px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded font-semibold">
              15-Min Undo Active
            </span>
          </div>
        </div>
      </div>

      {/* Search & Status Filters Bar */}
      <div className="bg-white rounded-2xl p-4 border border-antiquegold/20 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search PO #, Supplier or Milestone..."
            className="w-full text-xs pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-charcoal focus:ring-1 focus:ring-antiquegold"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 w-full md:w-auto">
          <div className="flex items-center space-x-1.5 bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setStatusFilter('ready_for_approval')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === 'ready_for_approval'
                  ? 'bg-white text-royalemerald shadow-sm font-bold'
                  : 'text-charcoal/60 hover:text-charcoal'
              }`}
            >
              Ready Queue ({readyCount})
            </button>

            <button
              onClick={() => setStatusFilter('held')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === 'held'
                  ? 'bg-white text-red-700 shadow-sm font-bold'
                  : 'text-charcoal/60 hover:text-charcoal'
              }`}
            >
              On Hold ({heldCount})
            </button>

            <button
              onClick={() => setStatusFilter('approved')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === 'approved'
                  ? 'bg-white text-amber-700 shadow-sm font-bold'
                  : 'text-charcoal/60 hover:text-charcoal'
              }`}
            >
              Approved ({approvedCount})
            </button>

            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === 'all'
                  ? 'bg-white text-charcoal shadow-sm font-bold'
                  : 'text-charcoal/60 hover:text-charcoal'
              }`}
            >
              All
            </button>
          </div>

          {statusFilter === 'ready_for_approval' && (
            <button
              onClick={handleSelectAllRoutine}
              className="px-3 py-1.5 bg-alabaster border border-antiquegold/30 rounded-xl text-xs font-bold text-charcoal hover:bg-white transition flex items-center space-x-1"
            >
              <CheckSquare className="w-3.5 h-3.5 text-antiquegold" />
              <span>Select Low-Risk Routine</span>
            </button>
          )}
        </div>
      </div>

      {/* Payment Queue List */}
      <div className="space-y-4">
        {filteredPayments.length > 0 ? (
          filteredPayments.map((payment) => {
            const isSelected = selectedPaymentIds.includes(payment.id);
            const currentMs = payment.milestoneChain[payment.currentMilestoneIndex];

            // Reversal window check
            const nowMs = Date.now();
            const isReversable = 
              payment.approvalStatus === 'approved_pending_transfer' && 
              payment.approvalReversalExpiry && 
              new Date(payment.approvalReversalExpiry).getTime() > nowMs;

            return (
              <div
                key={payment.id}
                className={`bg-white rounded-2xl p-5 border transition shadow-sm space-y-4 ${
                  payment.hasOpenDiscrepancyFlag 
                    ? 'border-red-300 bg-red-50/20' 
                    : isSelected 
                    ? 'border-royalemerald ring-1 ring-royalemerald bg-emerald-50/10'
                    : 'border-antiquegold/30 hover:shadow-md'
                }`}
              >
                {/* Header Row */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
                  <div className="flex items-center space-x-3">
                    {payment.approvalStatus === 'ready_for_approval' && !payment.hasOpenDiscrepancyFlag && (
                      <button
                        onClick={() => handleToggleSelect(payment.id)}
                        className="text-antiquegold hover:scale-110 transition"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-royalemerald" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-300" />
                        )}
                      </button>
                    )}

                    <div className="w-10 h-10 rounded-xl bg-royalemerald/10 border border-royalemerald/20 flex items-center justify-center text-royalemerald font-bold font-serif">
                      <Building2 className="w-5 h-5 text-royalemerald" />
                    </div>

                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-charcoal text-base">{payment.poNumber}</span>
                        <span className="text-xs text-charcoal/60">•</span>
                        <h3 className="font-bold text-charcoal text-sm">{payment.supplierName}</h3>
                      </div>
                      <p className="text-xs text-charcoal/60 mt-0.5">
                        Bank: <span className="font-mono text-charcoal">{payment.supplierBankName}</span> (A/C: {payment.supplierAccountNo} • IFSC: {payment.supplierIfsc})
                      </p>
                    </div>
                  </div>

                  {/* Trailing Due Amount & Status Badge */}
                  <div className="flex items-center space-x-3 self-end sm:self-auto">
                    <div className="text-right">
                      <span className="text-[11px] text-charcoal/60 block">Milestone Release Amount</span>
                      <span className="font-mono font-bold text-royalemerald text-lg">
                        ₹{payment.dueAmountINR.toLocaleString('en-IN')}
                      </span>
                      <span className="text-[10px] text-charcoal/60 block">
                        of Total ₹{payment.totalPoAmountINR.toLocaleString('en-IN')} PO
                      </span>
                    </div>

                    {payment.approvalStatus === 'ready_for_approval' && (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                        Ready for Release
                      </span>
                    )}

                    {payment.approvalStatus === 'held' && (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-900 border border-red-300 flex items-center space-x-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                        <span>Payment Held</span>
                      </span>
                    )}

                    {payment.approvalStatus === 'approved_pending_transfer' && (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center space-x-1">
                        <Clock className="w-3.5 h-3.5 text-amber-700" />
                        <span>Approved (Pending Bank)</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Triggering Milestone & Evidence Attached Card */}
                <div className="bg-alabaster rounded-xl p-3 border border-antiquegold/20 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-charcoal flex items-center space-x-1.5">
                      <ShieldCheck className="w-4 h-4 text-antiquegold" />
                      <span>Triggering Milestone: {payment.triggerMilestone}</span>
                    </span>

                    {currentMs?.triggeredAt && (
                      <span className="text-[11px] font-mono text-charcoal/60">
                        Fired: {new Date(currentMs.triggeredAt).toLocaleDateString('en-IN')}
                      </span>
                    )}
                  </div>

                  {currentMs?.triggerEvidenceRef && (
                    <div className="p-2.5 bg-white rounded-lg border border-gray-200 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-royalemerald" />
                        <span className="font-semibold text-charcoal">Trigger Evidence:</span>
                        <span className="text-charcoal/80 italic">{currentMs.triggerEvidenceRef}</span>
                      </div>
                      <span className="text-[10px] font-mono bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200 font-bold">
                        Verified SOP
                      </span>
                    </div>
                  )}
                </div>

                {/* Prominent Open Discrepancy / Damaged Part Alert Banner */}
                {payment.hasOpenDiscrepancyFlag && (
                  <div className="p-3 bg-red-100/80 rounded-xl border border-red-300 text-red-900 text-xs flex items-center justify-between">
                    <div className="flex items-start space-x-2">
                      <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block">Open Discrepancy / Quality Risk Flag</span>
                        <span className="text-red-800">{payment.linkedDiscrepancySummary}</span>
                      </div>
                    </div>

                    {payment.linkedDiscrepancyReportId && onNavigateToDiscrepancyReport && (
                      <button
                        onClick={() => onNavigateToDiscrepancyReport(payment.linkedDiscrepancyReportId!)}
                        className="px-3 py-1.5 bg-white text-red-900 border border-red-300 hover:bg-red-50 rounded-lg text-xs font-bold transition shrink-0 ml-2"
                      >
                        Inspect Part Report ➔
                      </button>
                    )}
                  </div>
                )}

                {/* Hold Reason note if held */}
                {payment.approvalStatus === 'held' && payment.holdReason && (
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-1">
                    <span className="font-bold text-charcoal/80 block">Active Hold Note:</span>
                    <p className="text-charcoal/70 italic">{payment.holdReason}</p>
                  </div>
                )}

                {/* Actions Bar */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
                  <button
                    onClick={() => onNavigateToReleaseDetail(payment.id)}
                    className="text-antiquegold hover:underline font-bold flex items-center space-x-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Milestone Release Chain & Overrides ➔</span>
                  </button>

                  <div className="flex items-center space-x-2">
                    {/* Reversal Window Option */}
                    {isReversable && (
                      <button
                        onClick={() => handleReverseApproval(payment)}
                        className="px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition flex items-center space-x-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                        <span>Undo / Reverse Approval (15-Min Window)</span>
                      </button>
                    )}

                    {/* Ready Queue Actions */}
                    {payment.approvalStatus === 'ready_for_approval' && (
                      <>
                        <button
                          onClick={() => {
                            setHoldingPayment(payment);
                            setHoldReasonText(payment.linkedDiscrepancySummary || '');
                          }}
                          className="px-3 py-1.5 border border-red-300 text-red-700 hover:bg-red-50 rounded-xl text-xs font-semibold transition"
                        >
                          Place Hold
                        </button>

                        <button
                          onClick={() => handleApproveSingle(payment)}
                          className="px-4 py-1.5 bg-royalemerald hover:bg-royalemerald/90 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center space-x-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-antiquegold" />
                          <span>Approve Transfer</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="bg-white rounded-2xl p-12 text-center space-y-3 border border-antiquegold/20">
            <CheckCircle2 className="w-12 h-12 text-royalemerald mx-auto opacity-50" />
            <h3 className="text-lg font-serif font-bold text-charcoal">Approval Queue Empty</h3>
            <p className="text-xs text-charcoal/60">
              No supplier payments currently match the active status filter. All triggered milestones have been processed.
            </p>
          </div>
        )}
      </div>

      {/* Place Hold Reason Modal */}
      {holdingPayment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-antiquegold">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-serif font-bold text-lg text-charcoal flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <span>Place Hold on Payment</span>
              </h3>
              <button onClick={() => setHoldingPayment(null)} className="text-gray-400 hover:text-charcoal">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-charcoal/80">
                You are placing a hold on <strong>{holdingPayment.poNumber}</strong> ({holdingPayment.supplierName}) due amount <strong>₹{holdingPayment.dueAmountINR.toLocaleString('en-IN')}</strong>.
              </p>

              <div>
                <label className="font-semibold text-charcoal/80 mb-1 block">Mandatory Hold Reason / Explanation</label>
                <textarea
                  value={holdReasonText}
                  onChange={(e) => setHoldReasonText(e.target.value)}
                  rows={3}
                  placeholder="e.g. Received verbal notice of missing guide rail brackets. Pending site inspection re-check..."
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl p-2.5 text-xs text-charcoal"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t">
              <button
                onClick={() => setHoldingPayment(null)}
                className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-charcoal"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmHold}
                className="px-5 py-2 bg-red-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-red-700"
              >
                Confirm Payment Hold
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Approval Confirmation Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-antiquegold">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-serif font-bold text-lg text-charcoal flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-antiquegold" />
                <span>Batch Payment Approval Summary</span>
              </h3>
              <button onClick={() => setShowBatchModal(false)} className="text-gray-400 hover:text-charcoal">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-charcoal/80">
                You are about to approve <strong>{selectedPaymentIds.length}</strong> routine low-risk payments in bulk:
              </p>

              <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 bg-alabaster p-3 rounded-xl border border-antiquegold/20">
                {payments
                  .filter(p => selectedPaymentIds.includes(p.id))
                  .map(p => (
                    <div key={p.id} className="py-2 flex items-center justify-between">
                      <div>
                        <span className="font-bold font-mono text-charcoal">{p.poNumber}</span>
                        <span className="text-charcoal/60 block text-[11px]">{p.supplierName}</span>
                      </div>
                      <span className="font-mono font-bold text-royalemerald">
                        ₹{p.dueAmountINR.toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
              </div>

              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-emerald-900 text-[11px] flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>All selected payments have verified milestone triggers and zero open quality discrepancies.</span>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t">
              <button
                onClick={() => setShowBatchModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-charcoal"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteBatchApprove}
                className="px-5 py-2 bg-royalemerald text-white rounded-xl text-xs font-bold shadow-md hover:bg-royalemerald/90 flex items-center space-x-1.5"
              >
                <CheckCircle2 className="w-4 h-4 text-antiquegold" />
                <span>Execute Batch Approval</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
