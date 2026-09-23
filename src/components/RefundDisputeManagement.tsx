import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, RefreshCw, CheckCircle2, XCircle, FileText, 
  Clock, AlertTriangle, Landmark, DollarSign, Search, Filter, 
  ArrowRight, CornerDownRight, MessageSquare, ShieldCheck, Image, Eye
} from 'lucide-react';
import { Card, Button } from './Common';
import { User, DisputeItem, Payment, Invoice } from '../types';
import { DbManager } from '../lib/db';
import { useLanguage } from '../lib/language';

interface RefundDisputeManagementProps {
  user: User;
  onNavigateToInvoices?: () => void;
}

export const RefundDisputeManagement: React.FC<RefundDisputeManagementProps> = ({
  user,
  onNavigateToInvoices
}) => {
  const { t } = useLanguage(user);

  const [disputes, setDisputes] = useState<DisputeItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedDispute, setSelectedDispute] = useState<DisputeItem | null>(null);

  // Resolution Modal
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolutionType, setResolutionType] = useState<'Full Refund' | 'Partial Refund' | 'Rejected'>('Full Refund');
  const [resolutionAmount, setResolutionAmount] = useState<number>(0);
  const [explanationText, setExplanationText] = useState('');

  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const loadData = () => {
    const dispList = DbManager.getDisputes();
    const payList = DbManager.getPayments();
    const invList = DbManager.getInvoices();

    setDisputes(dispList);
    setPayments(payList);
    setInvoices(invList);
  };

  useEffect(() => {
    loadData();
    const handleDbUpdate = () => loadData();
    window.addEventListener('aiec_db_update', handleDbUpdate);
    return () => window.removeEventListener('aiec_db_update', handleDbUpdate);
  }, [user]);

  // Handle Dispute Resolution Finalization
  const handleFinalizeResolution = () => {
    if (!selectedDispute) return;
    if (!explanationText) {
      setNotification({ msg: 'Please provide resolution explanation reasoning for audit trail.', type: 'error' });
      return;
    }

    let finalAmount = resolutionType === 'Rejected' ? 0 : (resolutionType === 'Full Refund' ? selectedDispute.disputeAmount : resolutionAmount);

    // Phase 36 — LEVEL 3 (financial): finalizing a refund dispute had no
    // confirmation of any kind before this fix (it already required a
    // reason/explanation, which is kept — this adds the missing explicit
    // "are you sure" step for a real money-movement decision).
    const confirmMsg = resolutionType === 'Rejected'
      ? 'Finalize this dispute as REJECTED (no refund issued)? This cannot be undone from here.'
      : `Finalize this dispute with a ${resolutionType} of ₹${finalAmount.toLocaleString('en-IN')}? This generates a credit note and cannot be undone from here.`;
    if (!window.confirm(confirmMsg)) {
      return;
    }

    let creditNoteGeneratedId = undefined;

    // If approved full or partial refund, generate downstream Credit Note automatically
    if (resolutionType !== 'Rejected' && finalAmount > 0) {
      const cnId = `CN-2026-DISP-${Math.floor(100 + Math.random() * 900)}`;
      taxableCN: Number;
      const taxableCN = Math.round(finalAmount / 1.18);
      const gstCN = finalAmount - taxableCN;

      const newCreditNote: Invoice = {
        id: cnId,
        dealId: selectedDispute.dealId,
        paymentId: selectedDispute.paymentId,
        customerName: selectedDispute.customerName,
        type: 'Credit Note',
        stageName: `Dispute Settlement (${resolutionType}: ${selectedDispute.disputeReason})`,
        taxableValue: taxableCN,
        gstRate: 18,
        gstAmount: gstCN,
        totalAmount: finalAmount,
        issuedAt: new Date().toISOString(),
        originalInvoiceId: `INV-${selectedDispute.paymentId}`
      };

      DbManager.addInvoice(newCreditNote);
      creditNoteGeneratedId = cnId;
    }

    const updatedDispute: DisputeItem = {
      ...selectedDispute,
      status: resolutionType === 'Rejected' ? 'Rejected' : (resolutionType === 'Full Refund' ? 'Full Refund Approved' : 'Partial Refund Approved'),
      resolutionType,
      resolutionAmount: finalAmount,
      resolutionExplanation: explanationText,
      creditNoteId: creditNoteGeneratedId,
      resolvedAt: new Date().toISOString()
    };

    DbManager.updateDispute(updatedDispute);
    setShowResolveModal(false);
    setSelectedDispute(null);
    setExplanationText('');
    setNotification({ 
      msg: `Dispute ${selectedDispute.id} resolved as [${resolutionType}]. ${creditNoteGeneratedId ? `Credit Note ${creditNoteGeneratedId} auto-issued.` : ''}`, 
      type: 'success' 
    });
  };

  const filteredDisputes = disputes.filter(d => {
    const matchesSearch = d.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.dealId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.originalTransactionId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || d.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 pb-12 text-left">
      {/* Toast Notification */}
      {notification && (
        <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between ${
          notification.type === 'success' ? 'bg-royalemerald/10 border-royalemerald/30 text-royalemerald' : 'bg-error/10 border-error/30 text-error'
        }`}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{notification.msg}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-warmgray hover:text-charcoal font-mono">✕</button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white p-6 rounded-3xl border border-[rgba(184,135,61,0.2)] shadow-diffuse flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 bg-antiquegold/10 text-antiquegold text-[10px] font-bold tracking-widest uppercase rounded-full font-mono">
              Module 9 • Dispute Resolution Desk
            </span>
            <span className="px-2 py-0.5 bg-royalemerald/10 text-royalemerald text-[10px] font-bold rounded-full font-mono">
              Automatic Downstream Credit Notes
            </span>
          </div>
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-charcoal">
            Refund & Dispute Management Desk
          </h1>
          <p className="text-xs text-warmgray mt-1">
            Investigate customer-raised remittance disputes, review site evidence, and execute reconciled accounting refunds.
          </p>
        </div>

        {onNavigateToInvoices && (
          <Button variant="secondary" onClick={onNavigateToInvoices} className="text-xs py-2">
            <FileText className="w-3.5 h-3.5" />
            <span>View Credit Notes Ledger</span>
          </Button>
        )}
      </div>

      {/* Search & Status Filter */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-2xl border border-[rgba(184,135,61,0.15)] shadow-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-warmgray" />
          <input
            type="text"
            placeholder="Search dispute #, customer name, deal ID, UTR..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl pl-9 pr-4 py-2 text-xs text-charcoal outline-none focus:ring-2 focus:ring-antiquegold"
          />
        </div>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-alabaster border border-[#e6dfd4] rounded-xl px-3 py-2 text-xs font-bold text-charcoal outline-none focus:ring-2 focus:ring-antiquegold"
        >
          <option value="all">All Dispute Statuses</option>
          <option value="Open">Open / Pending SLA</option>
          <option value="Under Investigation">Under Investigation</option>
          <option value="Full Refund Approved">Full Refund Approved</option>
          <option value="Partial Refund Approved">Partial Refund Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>

      {/* Dispute Cards List */}
      <div className="space-y-4">
        {filteredDisputes.length === 0 ? (
          <Card className="p-8 text-center space-y-3">
            <ShieldCheck className="w-10 h-10 text-royalemerald mx-auto" />
            <h3 className="font-serif text-lg font-bold text-charcoal">No Disputed Transactions Found</h3>
            <p className="text-xs text-warmgray">All customer stage remittances are clear with zero active disputes.</p>
          </Card>
        ) : (
          filteredDisputes.map(disp => {
            const isResolved = disp.status.includes('Approved') || disp.status === 'Rejected';
            const matchedPayment = payments.find(p => p.id === disp.paymentId || p.dealId === disp.dealId);

            return (
              <Card 
                key={disp.id}
                className="p-6 bg-white border border-[rgba(184,135,61,0.2)] rounded-3xl shadow-xs space-y-4"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-[rgba(184,135,61,0.12)] pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-extrabold text-charcoal">{disp.id}</span>
                      <span className={`px-2.5 py-0.5 text-[9px] font-bold rounded-full font-mono uppercase ${
                        disp.status === 'Open' ? 'bg-amber-100 text-amber-800' :
                        disp.status.includes('Approved') ? 'bg-royalemerald/15 text-royalemerald' :
                        'bg-error/15 text-error'
                      }`}>
                        {disp.status}
                      </span>
                      {disp.isLoanFinanced && (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-[9px] font-bold rounded-full font-mono">
                          🏦 Loan Financed ({disp.partnerName || 'Bajaj Finserv'})
                        </span>
                      )}
                    </div>
                    <h3 className="font-serif text-lg font-bold text-charcoal mt-1">{disp.customerName}</h3>
                    <p className="text-xs text-warmgray font-mono">
                      Txn Ref: {disp.originalTransactionId} • Deal ID: {disp.dealId}
                    </p>
                  </div>

                  <div className="text-left md:text-right">
                    <p className="text-[10px] text-warmgray font-mono uppercase font-bold">Disputed Amount</p>
                    <p className="font-mono text-xl font-extrabold text-charcoal">
                      ₹{disp.disputeAmount.toLocaleString('en-IN')}
                    </p>
                    <p className="text-[10px] text-warmgray font-mono">
                      Raised: {new Date(disp.raisedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                </div>

                {/* Stated Reason & Evidence Card */}
                <div className="p-4 bg-alabaster rounded-2xl border border-[rgba(184,135,61,0.1)] text-xs space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-charcoal uppercase font-mono tracking-wider text-[10px]">
                      CUSTOMER DISPUTE REASON & EVIDENCE:
                    </span>
                    <span className="text-[10px] text-amber-800 font-mono font-bold">SLA: 24h Review Window</span>
                  </div>
                  <p className="text-charcoal font-medium italic">"{disp.disputeReason}"</p>
                  {disp.supportingEvidence && (
                    <div className="flex items-center gap-2 pt-1 text-royalemerald font-bold text-[11px]">
                      <Image className="w-3.5 h-3.5" />
                      <span>Evidence Attached: {disp.supportingEvidence}</span>
                    </div>
                  )}
                </div>

                {/* Downstream Ripple Alert Check */}
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1">
                  <p className="font-bold text-amber-900 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-700" />
                    <span>Downstream Financial Ripple Awareness:</span>
                  </p>
                  <p className="text-amber-800 text-[11px]">
                    {disp.isLoanFinanced 
                      ? '⚠️ Payment was disbursed via Financing Partner. Approved refunds route back directly to financing partner account to settle loan principal.' 
                      : 'Notice: Funds may have been allocated toward supplier parts procurement or technician payouts. Check inventory ledger prior to approval.'}
                  </p>
                </div>

                {/* Resolution Summary if completed */}
                {isResolved && (
                  <div className="p-4 bg-royalemerald/5 border border-royalemerald/20 rounded-2xl text-xs space-y-1">
                    <div className="flex justify-between items-center font-bold text-royalemerald">
                      <span>Resolution Type: {disp.resolutionType}</span>
                      <span className="font-mono">Amount: ₹{disp.resolutionAmount?.toLocaleString('en-IN')}</span>
                    </div>
                    <p className="text-charcoal text-[11px]">{disp.resolutionExplanation}</p>
                    {disp.creditNoteId && (
                      <p className="text-[10px] font-mono font-bold text-antiquegold pt-1">
                        📄 Auto-Issued Credit Note ID: {disp.creditNoteId}
                      </p>
                    )}
                  </div>
                )}

                {/* Admin Action Button */}
                {!isResolved && (
                  <div className="pt-2">
                    <Button
                      variant="emerald"
                      fullWidth
                      onClick={() => {
                        setSelectedDispute(disp);
                        setResolutionAmount(disp.disputeAmount);
                        setShowResolveModal(true);
                      }}
                      className="py-2.5 text-xs"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Investigate & Finalize Dispute Resolution</span>
                    </Button>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* RESOLUTION MODAL */}
      {showResolveModal && selectedDispute && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="p-6 max-w-lg w-full bg-white border border-[rgba(184,135,61,0.25)] rounded-3xl space-y-4 shadow-2xl">
            <h3 className="font-serif text-lg font-bold text-charcoal">Finalize Dispute Resolution Workflow</h3>
            <p className="text-xs text-warmgray">
              Dispute <span className="font-mono font-bold text-charcoal">{selectedDispute.id}</span> for customer {selectedDispute.customerName}.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-charcoal mb-1">Select Resolution Outcome *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Full Refund', 'Partial Refund', 'Rejected'] as const).map(res => (
                    <button
                      key={res}
                      type="button"
                      onClick={() => setResolutionType(res)}
                      className={`py-2 px-2 rounded-xl border text-[11px] font-bold transition-all ${
                        resolutionType === res 
                          ? (res === 'Rejected' ? 'bg-error text-white border-error' : 'bg-royalemerald text-white border-royalemerald')
                          : 'bg-alabaster text-warmgray border-[#e6dfd4]'
                      }`}
                    >
                      {res}
                    </button>
                  ))}
                </div>
              </div>

              {resolutionType === 'Partial Refund' && (
                <div>
                  <label className="block font-bold text-charcoal mb-1">Approved Partial Refund Amount (₹) *</label>
                  <input
                    type="number"
                    value={resolutionAmount}
                    onChange={e => setResolutionAmount(Number(e.target.value))}
                    className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl px-3 py-2 text-xs font-mono text-charcoal outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block font-bold text-charcoal mb-1">Resolution Explanation & Audit Notes *</label>
                <textarea
                  rows={3}
                  placeholder="State detailed reason for customer notification and accounting audit..."
                  value={explanationText}
                  onChange={e => setExplanationText(e.target.value)}
                  className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl p-3 text-xs text-charcoal outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="secondary" fullWidth onClick={() => setShowResolveModal(false)}>Cancel</Button>
              <Button variant="emerald" fullWidth onClick={handleFinalizeResolution}>Execute Settlement</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
