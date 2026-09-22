import React, { useState } from 'react';
import {
  ArrowLeft,
  Award,
  CheckCircle,
  FileText,
  Download,
  Printer,
  ShieldCheck,
  Building,
  User,
  Calendar,
  Zap,
  DollarSign,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  Share2,
  Lock,
  Sparkles,
  Check
} from 'lucide-react';
import { Card, Button } from './Common';

const Badge = ({ children, className = '', variant }: { children: React.ReactNode; className?: string; variant?: string }) => (
  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide inline-flex items-center gap-1 border ${className}`}>
    {children}
  </span>
);

import {
  User as UserType,
  HandoverCompletionCertificateRecord,
  StaffLifecyclePayout
} from '../types';
import { DbManager } from '../lib/db';
import { bridgeHandoverCertificateIssued } from '../services/legacyCommercialBridge';

interface HandoverCompletionCertificateScreenProps {
  user: UserType;
  jobId: string;
  onBack: () => void;
  onNavigateToTimeline?: (jobId: string) => void;
  onNavigateToServicePortal?: (jobId: string) => void;
}

export const HandoverCompletionCertificateScreen: React.FC<HandoverCompletionCertificateScreenProps> = ({
  user,
  jobId,
  onBack,
  onNavigateToTimeline,
  onNavigateToServicePortal
}) => {
  const certificate = DbManager.getHandoverCompletionCertificateByJobId(jobId);

  // Fallback defaults if record isn't loaded
  const certNumber = certificate?.certificateNumber || `AIEC-CERT-2026-${jobId.replace(/\D/g, '') || '101'}`;
  const customerName = certificate?.customerName || 'Kothrud Landmark Housing Society';
  const buildingName = certificate?.buildingName || 'Kothrud Landmark Tower A';
  const siteAddress = certificate?.siteAddress || 'Plot 42, Mayur Colony, Kothrud, Pune - 411038';
  const elevatorSpecs = certificate?.elevatorSpecsSummary || '6-Passenger (408 kg), 5 Stops (G+4), Gearless PMSM 1.0 m/s, Automatic SS Telescopic Doors, ARD Battery Rescue, Monarch Controller';
  const completionDate = certificate?.completionDate || '2026-08-15';
  const complianceRef = certificate?.complianceCertRef || 'AIEC-QA-2026-101 (IS 14665 / IS 15259 Compliant)';
  const warrantyAmcRef = certificate?.warrantyAndAmcRef || '12M AIEC Labor Warranty + Gold Comprehensive AMC (Reg #WAR-101)';

  const linkedDocs = certificate?.linkedDocuments || [
    { id: 'doc_1', title: 'IS 14665 Statutory QA Conformance Certificate', docType: 'qa_cert', fileUrl: 'https://images.unsplash.com/photo-1568992687947-868a62a9f521?auto=format&fit=crop&w=800&q=80', dateAdded: '2026-08-14' },
    { id: 'doc_2', title: '12-Month AIEC Comprehensive Warranty Card', docType: 'warranty_card', fileUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80', dateAdded: '2026-08-15' },
    { id: 'doc_3', title: 'Gold Comprehensive AMC Contract Agreement', docType: 'amc_contract', fileUrl: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=800&q=80', dateAdded: '2026-08-15' },
    { id: 'doc_4', title: 'Passenger Emergency & ARD Operations Manual', docType: 'user_manual', fileUrl: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=800&q=80', dateAdded: '2026-08-15' },
    { id: 'doc_5', title: 'Maharashtra PWD Elevator License Application Dossier', docType: 'lift_license_doc', fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80', dateAdded: '2026-08-15' }
  ];

  const milestones = certificate?.lifecycleMilestones || [
    { stageName: '1. Site Survey & Shaft Dimensional Audit', completedDate: '2026-06-01', leadStaffName: 'Sanjay Deshmukh (Surveyor)', status: 'completed' },
    { stageName: '2. Commercial Contract & Engineering Approval', completedDate: '2026-06-10', leadStaffName: 'Prashant Wable (Admin)', status: 'completed' },
    { stageName: '3. Material Delivery & Elevator Kit Unloading', completedDate: '2026-06-25', leadStaffName: 'Ramesh Patil (Lead Tech)', status: 'completed' },
    { stageName: '4. Mechanical Erection & Guide Rail Alignment', completedDate: '2026-07-15', leadStaffName: 'Ramesh Patil (Lead Tech)', status: 'completed' },
    { stageName: '5. Electrical Wiring, VFD Calibration & Trial Run', completedDate: '2026-08-05', leadStaffName: 'Anil Gaikwad (Electrical Lead)', status: 'completed' },
    { stageName: '6. IS 14665 Final Quality Audit & Statutory Certification', completedDate: '2026-08-14', leadStaffName: 'Vikram Salunkhe (Chief QC Auditor)', status: 'completed' },
    { stageName: '7. Customer Handover & AMC Registration', completedDate: '2026-08-15', leadStaffName: 'Prashant Wable & Vikram Salunkhe', status: 'completed' }
  ];

  const initialPayouts: StaffLifecyclePayout[] = certificate?.payoutsBreakdown || [
    { staffId: 'surv_001', staffName: 'Sanjay Deshmukh', role: 'Site Surveyor', payoutAmount: 2500, status: 'triggered_and_disbursed' },
    { staffId: 'sales_001', staffName: 'Prashant Wable', role: 'Sales & Project Lead', payoutAmount: 12000, status: 'triggered_and_disbursed' },
    { staffId: 'tech_001', staffName: 'Ramesh Patil', role: 'Lead Mechanical Installer', payoutAmount: 8500, status: 'triggered_and_disbursed' },
    { staffId: 'tech_002', staffName: 'Anil Gaikwad', role: 'Electrical Lead', payoutAmount: 6500, status: 'triggered_and_disbursed' },
    { staffId: 'qc_001', staffName: 'Vikram Salunkhe', role: 'Chief QC Inspector', payoutAmount: 4000, status: 'triggered_and_disbursed' }
  ];

  const [payouts, setPayouts] = useState<StaffLifecyclePayout[]>(initialPayouts);
  const [payoutsDisbursed, setPayoutsDisbursed] = useState<boolean>(
    certificate?.payoutsTriggeredFlag ?? true
  );
  const [activeTab, setActiveTab] = useState<'certificate' | 'payouts' | 'policy'>('certificate');

  const [lateDefectPolicyNote, setLateDefectPolicyNote] = useState<string>(
    certificate?.lateDefectPolicyNotes ||
      'Admin Policy: Post-handover defects reported within 30 days are handled under AIEC Warranty without retrospective penalty clawback on installation team unless intentional negligence is documented.'
  );

  const [showPayoutToast, setShowPayoutToast] = useState<boolean>(false);

  const handleTriggerFinalPayouts = () => {
    const updatedPayouts = payouts.map(p => ({
      ...p,
      status: 'triggered_and_disbursed' as const
    }));
    setPayouts(updatedPayouts);
    setPayoutsDisbursed(true);

    if (certificate) {
      DbManager.updateHandoverCompletionCertificate({
        ...certificate,
        payoutsTriggeredFlag: true,
        payoutsBreakdown: updatedPayouts
      });
    }

    // Phase 18: bridge into the real canonical Handover's certificate
    // issuance (Phase 09's hard gate — customer acceptance must already
    // be recorded — is enforced by issueCertificate() unmodified), in
    // addition to the DbManager write above — see legacyCommercialBridge.ts.
    bridgeHandoverCertificateIssued(
      { id: user.id, role: user.role, isDemo: user.isDemo, authMethod: user.authMethod },
      jobId,
    ).then(result => {
      if (!result.bridged) {
        console.warn(`[Phase 18 bridge] handover certificate for job ${jobId} not mirrored to canonical model: ${result.reason}`);
      }
    });

    setShowPayoutToast(true);
    setTimeout(() => setShowPayoutToast(false), 2500);
  };

  const totalPayoutSum = payouts.reduce((acc, p) => acc + p.payoutAmount, 0);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] pb-28">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[var(--color-surface)] border-b border-[var(--color-border)] px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-[var(--color-accent-primary)]" />
                <h1 className="font-serif text-lg font-bold">Handover Completion Certificate</h1>
              </div>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {certNumber} • {buildingName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-[var(--color-accent-secondary)] text-white text-xs">
              Project Completed & Certified
            </Badge>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 py-3 bg-[var(--color-surface)] border-b border-[var(--color-border)] flex gap-2">
        <Button
          size="sm"
          variant={activeTab === 'certificate' ? 'default' : 'outline'}
          onClick={() => setActiveTab('certificate')}
          className="flex-1 text-xs"
        >
          <FileText className="w-3.5 h-3.5 mr-1.5" />
          Completion Docket
        </Button>
        <Button
          size="sm"
          variant={activeTab === 'payouts' ? 'default' : 'outline'}
          onClick={() => setActiveTab('payouts')}
          className="flex-1 text-xs"
        >
          <DollarSign className="w-3.5 h-3.5 mr-1.5" />
          Staff Commission Payouts
        </Button>
        <Button
          size="sm"
          variant={activeTab === 'policy' ? 'default' : 'outline'}
          onClick={() => setActiveTab('policy')}
          className="flex-1 text-xs"
        >
          <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
          Late Defect Policy
        </Button>
      </div>

      <div className="p-4 space-y-6 max-w-3xl mx-auto">
        {showPayoutToast && (
          <div className="bg-[var(--color-accent-secondary)] text-white p-3 rounded-lg text-sm flex items-center gap-2 shadow-lg animate-bounce">
            <CheckCircle className="w-5 h-5 text-emerald-300" />
            Final Stage Commission & Rewards disbursed to all 5 team members!
          </div>
        )}

        {/* TAB 1: FORMAL CERTIFICATE DOCKET */}
        {activeTab === 'certificate' && (
          <div className="space-y-6">
            {/* Branded Official Certificate Card */}
            <Card className="p-6 bg-gradient-to-br from-[var(--color-surface)] via-white to-amber-500/5 border-2 border-[var(--color-accent-primary)]/40 rounded-2xl shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-[var(--color-accent-primary)] text-white text-[10px] font-bold px-4 py-1 rounded-bl-xl uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Permanent Official Record
              </div>

              {/* Company Banner */}
              <div className="text-center space-y-1 pb-4 border-b border-[var(--color-accent-primary)]/20">
                <h2 className="font-serif text-xl font-bold tracking-wide text-[var(--color-text-primary)]">
                  ALL INDIA ELEVATORS COMPANY
                </h2>
                <p className="text-xs text-[var(--color-accent-primary)] font-semibold uppercase tracking-widest">
                  Official Elevator Erection & Handover Certificate
                </p>
                <p className="text-[11px] text-[var(--color-text-secondary)] font-mono">
                  ISO 9001:2015 Certified • IS 14665 Statutory Conformance
                </p>
              </div>

              {/* Cert Identifier & Date */}
              <div className="my-4 p-3 bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] flex flex-wrap items-center justify-between text-xs gap-2">
                <div>
                  <span className="text-[var(--color-text-secondary)]">Certificate ID: </span>
                  <span className="font-mono font-bold text-[var(--color-accent-primary)]">{certNumber}</span>
                </div>
                <div>
                  <span className="text-[var(--color-text-secondary)]">Date of Handover: </span>
                  <span className="font-mono font-semibold">{completionDate}</span>
                </div>
              </div>

              {/* Body Text */}
              <div className="space-y-4 text-xs text-[var(--color-text-primary)] leading-relaxed">
                <p>
                  This is to certify that the elevator installation at <strong>{buildingName}</strong> ({siteAddress}) has been completed in full compliance with AIEC Quality Control Standard Operating Procedures, IS 14665, and IS 15259 statutory elevator safety standards.
                </p>

                <div className="bg-[var(--color-surface)] p-3 rounded-lg border border-[var(--color-border)] space-y-2">
                  <div className="font-semibold text-[var(--color-accent-primary)] flex items-center gap-1.5">
                    <Building className="w-4 h-4" /> Installed Elevator Technical Specification
                  </div>
                  <p className="text-[11px] text-[var(--color-text-secondary)] font-mono">
                    {elevatorSpecs}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                  <div className="p-2.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)]">
                    <span className="text-[var(--color-text-secondary)] block">Statutory Compliance Ref:</span>
                    <strong className="text-[var(--color-accent-secondary)]">{complianceRef}</strong>
                  </div>
                  <div className="p-2.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)]">
                    <span className="text-[var(--color-text-secondary)] block">Warranty & Service Status:</span>
                    <strong className="text-[var(--color-accent-primary)]">{warrantyAmcRef}</strong>
                  </div>
                </div>
              </div>

              {/* Signatures Footer */}
              <div className="mt-6 pt-4 border-t border-[var(--color-border)] grid grid-cols-2 gap-4 text-center">
                <div className="space-y-1">
                  <div className="h-8 flex items-center justify-center font-serif italic text-xs text-[var(--color-accent-secondary)] font-bold">
                    Vikram Salunkhe
                  </div>
                  <p className="text-[10px] font-semibold text-[var(--color-text-secondary)] border-t border-gray-300 pt-1">
                    Chief Quality Inspector
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="h-8 flex items-center justify-center font-serif italic text-xs text-[var(--color-accent-primary)] font-bold">
                    Prashant Vasant Wable
                  </div>
                  <p className="text-[10px] font-semibold text-[var(--color-text-secondary)] border-t border-gray-300 pt-1">
                    Managing Director, AIEC
                  </p>
                </div>
              </div>
            </Card>

            {/* Complete Project Lifecycle Ascension Line */}
            <Card className="p-4 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
                <div>
                  <h3 className="font-serif font-semibold text-sm flex items-center gap-2">
                    <Zap className="w-4 h-4 text-[var(--color-accent-primary)]" />
                    Project Lifecycle Journey Milestones
                  </h3>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Full trail from site survey to final customer handover
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {milestones.length} Milestones Complete
                </Badge>
              </div>

              {/* Ascension Line Container */}
              <div className="relative pl-6 space-y-4">
                {/* Vertical Gold Ascension Line Rail */}
                <div className="absolute left-2.5 top-2 bottom-2 w-0.5 bg-[var(--color-accent-primary)]" />

                {milestones.map((m, idx) => (
                  <div key={idx} className="relative flex items-start justify-between text-xs group">
                    {/* Node Dot */}
                    <div className="absolute -left-[19px] top-0.5 w-3.5 h-3.5 rounded-full bg-[var(--color-accent-primary)] text-white flex items-center justify-center text-[8px] font-bold ring-2 ring-[var(--color-surface)]">
                      ✓
                    </div>

                    <div className="space-y-0.5">
                      <div className="font-semibold text-sm text-[var(--color-text-primary)]">
                        {m.stageName}
                      </div>
                      <p className="text-[11px] text-[var(--color-text-secondary)]">
                        Lead: {m.leadStaffName}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono text-[11px] text-[var(--color-accent-secondary)] font-medium">
                        {m.completedDate}
                      </span>
                      <Badge className="block bg-emerald-100 text-emerald-800 text-[9px] py-0 mt-0.5">
                        Verified
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Linked Documents Vault */}
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
                <h3 className="font-serif font-semibold text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--color-accent-secondary)]" />
                  Customer Permanent Document Vault
                </h3>
                <Badge variant="outline" className="text-[10px]">
                  5 Vaulted Files
                </Badge>
              </div>

              <div className="space-y-2">
                {linkedDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-3 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] flex items-center justify-between text-xs hover:border-[var(--color-accent-primary)] transition-all"
                  >
                    <div className="flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-[var(--color-accent-primary)]" />
                      <div>
                        <div className="font-medium">{doc.title}</div>
                        <div className="text-[10px] text-[var(--color-text-secondary)]">
                          Added {doc.dateAdded} • Permanent Record
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(doc.fileUrl, '_blank')}
                      className="text-xs text-[var(--color-accent-primary)] flex items-center gap-1"
                    >
                      View <ExternalLink className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* TAB 2: STAFF COMMISSION & REWARDS PAYOUT TRIGGER */}
        {activeTab === 'payouts' && (
          <div className="space-y-6">
            <Card className="p-4 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
                <div>
                  <h2 className="font-serif font-semibold text-base flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-[var(--color-accent-primary)]" />
                    Final Handover Commission & Staff Payout Ledger
                  </h2>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Automatic payout triggered upon project handover completion
                  </p>
                </div>
                <Badge className={payoutsDisbursed ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'}>
                  {payoutsDisbursed ? 'Payouts Disbursed' : 'Ready for Payout'}
                </Badge>
              </div>

              <div className="p-3 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] flex items-center justify-between">
                <div>
                  <span className="text-xs text-[var(--color-text-secondary)]">Total Handover Commission Pool:</span>
                  <div className="font-mono text-2xl font-bold text-[var(--color-accent-primary)]">
                    ₹{totalPayoutSum.toLocaleString()}
                  </div>
                </div>
                <Button
                  onClick={handleTriggerFinalPayouts}
                  disabled={payoutsDisbursed}
                  className="bg-[var(--color-accent-secondary)] text-white text-xs py-2 px-4 flex items-center gap-2 shadow"
                >
                  <CheckCircle className="w-4 h-4" />
                  {payoutsDisbursed ? 'Commission Disbursed' : 'Disburse Staff Commission'}
                </Button>
              </div>

              <div className="space-y-3">
                {payouts.map((p) => (
                  <div
                    key={p.staffId}
                    className="p-3 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] flex items-center justify-center font-bold">
                        <User className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{p.staffName}</div>
                        <div className="text-[11px] text-[var(--color-text-secondary)]">{p.role}</div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-mono text-sm font-bold text-[var(--color-accent-primary)]">
                        ₹{p.payoutAmount.toLocaleString()}
                      </div>
                      <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300">
                        {p.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* TAB 3: LATE DEFECT POLICY & ADMIN OVERRIDE */}
        {activeTab === 'policy' && (
          <div className="space-y-6">
            <Card className="p-4 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
                <div>
                  <h2 className="font-serif font-semibold text-base flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[var(--color-accent-primary)]" />
                    Late-Discovered Defect Policy & Clawback Governance
                  </h2>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Fairness guidelines for post-handover warranty claims
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">Admin Policy</Badge>
              </div>

              <div className="space-y-3 text-xs text-[var(--color-text-secondary)] leading-relaxed">
                <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/30 text-amber-900 dark:text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <strong>Business Governance Principle:</strong> Automated punitive clawbacks are disabled. If a defect is discovered post-handover, Admin conducts a formal review to differentiate normal component burn-in vs. installation negligence.
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-[var(--color-text-primary)] block mb-1">
                    Documented Project Policy & Notes:
                  </label>
                  <textarea
                    value={lateDefectPolicyNote}
                    onChange={(e) => setLateDefectPolicyNote(e.target.value)}
                    rows={4}
                    className="w-full p-2.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-text-primary)]"
                  />
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* PORTAL MODE TRANSITION NOTIFICATION */}
        <Card className="p-4 bg-[var(--color-accent-primary)]/10 border border-[var(--color-accent-primary)]/30 space-y-2 text-center">
          <Badge className="bg-[var(--color-accent-primary)] text-white text-[10px] mx-auto">
            Portal Mode Transition
          </Badge>
          <h4 className="font-serif font-bold text-sm">
            Installation Phase Closed — Portal Mode Switched to Service & AMC Support
          </h4>
          <p className="text-xs text-[var(--color-text-secondary)]">
            This customer profile now accesses preventive servicing schedules, 24x7 breakdown request logging, and quarterly inspection reports.
          </p>
        </Card>

        {/* BOTTOM ACTION BAR */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            variant="outline"
            onClick={onBack}
            className="flex-1 text-xs"
          >
            Back
          </Button>

          <Button
            onClick={() => window.print()}
            variant="outline"
            className="text-xs flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" /> Print Cert
          </Button>

          <Button
            onClick={() => {
              if (onNavigateToServicePortal) {
                onNavigateToServicePortal(jobId);
              } else {
                alert('Project complete! Switched customer to Ongoing Service Portal.');
              }
            }}
            className="flex-[2] bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/90 text-white font-semibold text-xs py-2.5 flex items-center justify-center gap-2 shadow-md"
          >
            <CheckCircle className="w-4 h-4" />
            Complete Module 14 & Enter Service Mode
          </Button>
        </div>
      </div>
    </div>
  );
};
