import React, { useState, useEffect } from 'react';
import {
  User,
  RecruitmentApplicantRecord,
  OfferAgreementRecord,
  RoleSpecificAgreementTerms
} from '../types';
import { DbManager } from '../lib/db';
import { Card, Button } from './Common';
import { isDemoAgreementOtpAccepted, getDemoAgreementOtp, isDemoAuthBuild } from '../lib/demoCredentials';
import {
  FileText,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  User as UserIcon,
  PhoneCall,
  Lock,
  Check,
  Send,
  AlertCircle,
  Building,
  Info,
  Edit3,
  Award
} from 'lucide-react';

interface OfferOnboardingAgreementScreenProps {
  user: User;
  applicantId?: string;
  onNavigateToDashboard?: () => void;
  onNavigateToTierAssignment?: (partnerId: string) => void;
  onBack?: () => void;
}

export const OfferOnboardingAgreementScreen: React.FC<OfferOnboardingAgreementScreenProps> = ({
  user,
  applicantId,
  onNavigateToDashboard,
  onNavigateToTierAssignment,
  onBack
}) => {
  const [applicant, setApplicant] = useState<RecruitmentApplicantRecord | null>(null);
  const [agreement, setAgreement] = useState<OfferAgreementRecord | null>(null);
  
  // Custom Term Addendum state (Admin)
  const [showAddendumModal, setShowAddendumModal] = useState(false);
  const [customAddendumNote, setCustomAddendumNote] = useState('');

  // E-Signature & OTP state
  const [otpSent, setOtpSent] = useState(false);
  const [enteredOtp, setEnteredOtp] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  // Default templates by role
  const agreementTemplates: Record<string, { title: string; docText: string; terms: RoleSpecificAgreementTerms }> = {
    technician: {
      title: 'Master Service Provider & SOP-Compliance Agreement (Technician Grade)',
      docText: `THIS INDEPENDENT SERVICE PROVIDER AGREEMENT is executed between ALL INDIA ELEVATORS COMPANY ("AIEC"), represented by Mr. Prashant Vasant Wable, and the undersigned Technical Partner.

1. SCOPE & ASSET-LIGHT ORCHESTRATION: Partner agrees to perform elevator installation, mechanical guide-rail erection, electrical panel wiring, VFD calibration, and preventive AMC maintenance strictly following AIEC digital SOP guidelines. AIEC provides digital lead aggregation, client invoicing, and milestone disbursement.

2. NO-LIABILITY & SAFETY COMPLIANCE: Partner is an independent contractor. Partner is required to maintain valid personal accident insurance, wireman license compliance, and mandatory safety harness equipment. AIEC assumes no employer liability for accidents arising from Partner's willful deviation from safety SOPs.

3. MILESTONE DISBURSEMENT:
- Mechanical Erection Milestone: ₹8,500 upon 100% SOP verification & QC clearance.
- Electrical Wiring & VFD Calibration: ₹6,500 upon trial-run signoff.
- Zero-Defect Handover Bonus: ₹2,500 upon customer signoff.`,
      terms: {
        commissionStructure: 'Standard Technician Milestone Payout (₹15,000 Total Base per Installation)',
        territoryAssigned: 'Pune West & PCMC Elevator Corridors',
        sopLiabilityTerms: 'Independent Contractor Model — Safety Harness & Helmet Mandatory',
        insuranceTerms: 'Partner maintains independent group personal accident insurance',
        version: '2026.V2_MH'
      }
    },
    surveyor: {
      title: 'Site Shaft Surveying & Dimensional Audit Partner Agreement',
      docText: `THIS SURVEYOR PARTNER AGREEMENT is executed between ALL INDIA ELEVATORS COMPANY ("AIEC") and the undersigned Shaft Survey Partner.

1. SCOPE: Perform pre-installation shaft dimensional audits, plumb-line verification, overhead clearance checks, and pit depth measurements using AIEC digital survey toolkit.

2. COMMISSION: ₹2,500 fixed payout per verified shaft survey submitted with high-precision photos and CAD drawing signoff.`,
      terms: {
        commissionStructure: '₹2,500 per verified survey + ₹500 travel allowance for outstation shafts',
        territoryAssigned: 'Chakan & Talegaon Industrial Hub',
        sopLiabilityTerms: 'Laser meter accuracy tolerance ±2mm required',
        insuranceTerms: 'Standard field survey coverage',
        version: '2026.V1_SURVEY'
      }
    },
    supplier: {
      title: 'Master OEM Component Supply & Quality SLA Agreement',
      docText: `THIS OEM SUPPLY AGREEMENT is executed between ALL INDIA ELEVATORS COMPANY ("AIEC") and the undersigned Component Supplier.

1. SCOPE: Supply certified elevator traction drives, control panels, doors, and cabin materials complying with IS 14665 standards.

2. PAYMENT TERMS: 20% Advance on PO dispatch, 80% Net-30 upon site delivery receipt & GRN verification.`,
      terms: {
        commissionStructure: 'Net-30 Commercial Purchase Order terms with GRN auto-reconciliation',
        territoryAssigned: 'Maharashtra State Delivery Scope',
        sopLiabilityTerms: 'Pass-through 24-Month OEM Factory Warranty Required',
        insuranceTerms: 'Transit insurance covered by supplier until site unloading',
        version: '2026.V3_OEM'
      }
    },
    sales_rep: {
      title: 'Authorized Elevator Sales Partner & Commission Agreement',
      docText: `THIS SALES PARTNER AGREEMENT is executed between ALL INDIA ELEVATORS COMPANY ("AIEC") and the undersigned Sales Partner.

1. SCOPE: Generate elevator sales inquiries, conduct client walkthroughs, and submit formal AIEC quotation packages.

2. COMMISSION: 3.5% of net contract value paid in two milestones (50% on client booking advance, 50% on material delivery).`,
      terms: {
        commissionStructure: '3.5% Net Contract Commission (50% Advance / 50% Delivery)',
        territoryAssigned: 'Greater Pune Metropolitan Area',
        sopLiabilityTerms: 'Strict compliance with AIEC authorized pricing guidelines',
        insuranceTerms: 'N/A',
        version: '2026.V1_SALES'
      }
    }
  };

  useEffect(() => {
    const list = DbManager.getRecruitmentApplicants();
    const targetId = applicantId || (list.length > 0 ? list[0].id : '');
    const foundApp = list.find(a => a.id === targetId);

    if (foundApp) {
      setApplicant(foundApp);
      setSignerName(foundApp.applicantName);

      // Check existing offer agreement
      let existingAgr = DbManager.getOfferAgreementByApplicantId(foundApp.id);
      if (!existingAgr) {
        const tmpl = agreementTemplates[foundApp.primaryRole] || agreementTemplates.technician;
        existingAgr = {
          id: `agr_${Date.now()}`,
          applicantId: foundApp.id,
          applicantName: foundApp.applicantName,
          applicantPhone: foundApp.applicantPhone,
          role: foundApp.primaryRole,
          agreementTitle: tmpl.title,
          agreementDocumentText: tmpl.docText,
          roleSpecificTerms: tmpl.terms,
          status: 'pending_signature',
          activationTriggeredFlag: false,
          createdDate: new Date().toISOString().split('T')[0]
        };
        DbManager.saveOfferAgreement(existingAgr);
      }
      setAgreement(existingAgr);
      if (existingAgr.roleSpecificTerms?.customAddendumNote) {
        setCustomAddendumNote(existingAgr.roleSpecificTerms.customAddendumNote);
      }
      if (existingAgr.status === 'signed_active') {
        setOtpVerified(true);
        setHasDrawnSignature(true);
      }
    }
  }, [applicantId]);

  const handleSendOtp = () => {
    setOtpSent(true);
    // Auto-fill demo OTP for smooth testing experience — Phase 32:
    // routed through src/lib/demoCredentials.ts, null in production.
    const demoOtp = getDemoAgreementOtp();
    if (demoOtp) setEnteredOtp(demoOtp);
  };

  // Phase 32: no real SMS/OTP backend exists behind this e-sign flow in
  // any environment (same documented gap as the main login OTP, Phase
  // 05). The demo-only acceptance behavior (any 4+ digit code) is
  // preserved for sandbox/demo builds via isDemoAgreementOtpAccepted;
  // a real production build honestly always rejects rather than
  // silently accepting any code (the prior, ungated behavior).
  const handleVerifyOtpAndSign = () => {
    if (!agreement || !applicant) return;
    if (!isDemoAgreementOtpAccepted(enteredOtp)) {
      alert('Please enter a valid verification code.');
      return;
    }

    setIsActivating(true);
    setTimeout(() => {
      const updatedAgr: OfferAgreementRecord = {
        ...agreement,
        status: 'signed_active',
        activationTriggeredFlag: true,
        activatedAt: new Date().toISOString(),
        signatureData: {
          signedByName: signerName || applicant.applicantName,
          signedPhone: applicant.applicantPhone,
          otpVerified: true,
          otpVerifiedAt: new Date().toISOString(),
          signedAt: new Date().toISOString(),
          signatureDataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><path d="M10 40 Q 50 10 90 40 T 170 30" stroke="%230E4B3D" stroke-width="3" fill="none"/></svg>'
        }
      };

      DbManager.saveOfferAgreement(updatedAgr);
      setAgreement(updatedAgr);
      setOtpVerified(true);
      setHasDrawnSignature(true);
      setIsActivating(false);
    }, 800);
  };

  const handleSaveCustomAddendum = () => {
    if (!agreement) return;
    const updatedAgr: OfferAgreementRecord = {
      ...agreement,
      roleSpecificTerms: {
        ...agreement.roleSpecificTerms,
        customAddendumNote: customAddendumNote
      },
      customAddendumApprovedByAdmin: true,
      agreementDocumentText: agreement.agreementDocumentText + `\n\n6. ADMIN-APPROVED CUSTOM ADDENDUM: ${customAddendumNote}`
    };
    DbManager.saveOfferAgreement(updatedAgr);
    setAgreement(updatedAgr);
    setShowAddendumModal(false);
  };

  const isSignedAndActive = agreement?.status === 'signed_active';

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] pb-20">
      {/* Header */}
      <div className="bg-[var(--color-surface)] border-b border-[var(--color-border)] py-6 px-4 sm:px-8">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            {onBack && (
              <button
                onClick={onBack}
                className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] flex items-center gap-1 mb-2 cursor-pointer"
              >
                ← Back to Recruitment Pipeline
              </button>
            )}
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-serif font-bold text-[var(--color-text-primary)]">
                Offer & Onboarding Agreement
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] border border-[var(--color-accent-primary)]/20">
                Formal Partner Contract
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              Role-specific terms, no-liability responsibility allocation, OTP e-signature, and instant account activation.
            </p>
          </div>

          {agreement && (
            <div className="text-right">
              <div className="text-xs text-[var(--color-text-secondary)]">Agreement Status</div>
              <div className={`text-sm font-bold flex items-center gap-1 justify-end ${isSignedAndActive ? 'text-emerald-600' : 'text-amber-600'}`}>
                {isSignedAndActive ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Clock className="w-4 h-4 text-amber-500" />}
                <span>{isSignedAndActive ? 'Account Activated' : 'Pending Signature'}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-8 mt-6">
        {applicant && agreement ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* LEFT COLUMN: Agreement Document Viewer & E-Signature */}
            <div className="lg:col-span-8 space-y-6">
              
              {/* Document Header & Title */}
              <Card className="p-6 border-[var(--color-border)] bg-[var(--color-surface)] shadow-md space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
                  <div className="flex items-center gap-3">
                    <FileText className="w-6 h-6 text-[var(--color-accent-primary)]" />
                    <div>
                      <h2 className="text-sm font-bold text-[var(--color-text-primary)]">
                        {agreement.agreementTitle}
                      </h2>
                      <span className="text-[10px] text-[var(--color-text-secondary)]">
                        Document Ref: {agreement.id} • Version: {agreement.roleSpecificTerms?.version || '2026.V1'}
                      </span>
                    </div>
                  </div>
                  {user.role === 'admin' && (
                    <Button
                      onClick={() => setShowAddendumModal(true)}
                      className="px-3 py-1.5 text-xs bg-[var(--color-bg)] text-[var(--color-text-primary)] border border-[var(--color-border)] font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-[var(--color-accent-primary)]" />
                      <span>Custom Term Addendum</span>
                    </Button>
                  )}
                </div>

                {/* Role-specific Highlights Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)]">
                    <span className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)]">Commission / Rate Structure</span>
                    <p className="font-semibold text-[var(--color-text-primary)] mt-1">
                      {agreement.roleSpecificTerms?.commissionStructure}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)]">
                    <span className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)]">Assigned Operating Territory</span>
                    <p className="font-semibold text-[var(--color-text-primary)] mt-1">
                      {agreement.roleSpecificTerms?.territoryAssigned}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] sm:col-span-2">
                    <span className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)]">No-Liability & SOP Safety Model</span>
                    <p className="text-[var(--color-text-primary)] mt-1">
                      {agreement.roleSpecificTerms?.sopLiabilityTerms}
                    </p>
                  </div>
                </div>

                {/* Agreement Body Text Box */}
                <div className="p-4 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] font-mono text-xs text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto">
                  {agreement.agreementDocumentText}
                </div>

                {/* Custom Addendum Notice if present */}
                {agreement.roleSpecificTerms?.customAddendumNote && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-200">
                    <strong className="block font-bold">Admin Custom Addendum:</strong>
                    <span>"{agreement.roleSpecificTerms.customAddendumNote}"</span>
                  </div>
                )}
              </Card>

              {/* OTP E-Signature Capture Block */}
              <Card className="p-6 border-[var(--color-border)] bg-[var(--color-surface)] shadow-md space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-[var(--color-accent-secondary)]" />
                    <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
                      OTP Identity-Verified E-Signature
                    </h3>
                  </div>
                  <span className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase">
                    Legal Conformance
                  </span>
                </div>

                {isSignedAndActive ? (
                  <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>Executed & Verified via Mobile OTP</span>
                    </div>
                    <div className="text-xs text-[var(--color-text-secondary)] space-y-1">
                      <div>Signed By: <strong>{agreement.signatureData?.signedByName}</strong> ({agreement.signatureData?.signedPhone})</div>
                      <div>Timestamp: <strong>{agreement.signatureData?.signedAt}</strong></div>
                      <div>OTP Clearance: <strong>Verified (UIDAI / Mobile SMS Gateway)</strong></div>
                    </div>
                    {agreement.signatureData?.signatureDataUrl && (
                      <div className="mt-2 pt-2 border-t border-emerald-500/20">
                        <span className="text-[10px] text-[var(--color-text-secondary)] block">Digital Touch Signature:</span>
                        <img
                          src={agreement.signatureData.signatureDataUrl}
                          alt="Signature"
                          className="h-10 bg-white/80 rounded border p-1 mt-1"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      Sign below to accept terms and trigger immediate account activation. An OTP will be sent to <strong>{applicant.applicantPhone}</strong> to bind this legally binding agreement.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                          Full Legal Name
                        </label>
                        <input
                          type="text"
                          value={signerName}
                          onChange={e => setSignerName(e.target.value)}
                          className="w-full px-3.5 py-2 text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-primary)] font-semibold"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                          Mobile OTP Verification
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="4-digit OTP"
                            value={enteredOtp}
                            onChange={e => setEnteredOtp(e.target.value)}
                            className="w-28 px-3.5 py-2 text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-primary)] font-mono text-center font-bold"
                          />
                          <Button
                            type="button"
                            onClick={handleSendOtp}
                            className="px-3 py-2 text-xs bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] border border-[var(--color-accent-primary)]/20 font-bold shrink-0 cursor-pointer"
                          >
                            {otpSent ? 'Resend OTP' : 'Send OTP'}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Touch Signature Pad Simulation */}
                    <div>
                      <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                        Draw / Touch Signature Below
                      </label>
                      <div
                        onClick={() => setHasDrawnSignature(true)}
                        className={`h-24 rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer transition-all ${
                          hasDrawnSignature
                            ? 'border-emerald-500 bg-emerald-500/5'
                            : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-accent-primary)]'
                        }`}
                      >
                        {hasDrawnSignature ? (
                          <div className="text-center">
                            <Check className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Digital Touch Signature Recorded</span>
                          </div>
                        ) : (
                          <div className="text-center text-xs text-[var(--color-text-secondary)]">
                            <Edit3 className="w-5 h-5 mx-auto mb-1 text-[var(--color-accent-primary)]" />
                            <span>Click or draw here to sign agreement</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <Button
                      disabled={!hasDrawnSignature || isActivating}
                      onClick={handleVerifyOtpAndSign}
                      className="w-full py-3.5 text-xs font-bold bg-[var(--color-accent-primary)] text-white shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isActivating ? (
                        <span>Activating Account...</span>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          <span>Verify OTP & Execute Agreement</span>
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </Card>

            </div>

            {/* RIGHT COLUMN: Account Activation & Post-Onboarding Controls */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* Account Activation Status Box */}
              <Card className="p-5 border-[var(--color-border)] bg-[var(--color-surface)] shadow-md space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
                  <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[var(--color-accent-primary)]" />
                    <span>Account Activation</span>
                  </h3>
                </div>

                <div className={`p-4 rounded-xl border text-xs leading-relaxed space-y-2 ${
                  isSignedAndActive
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200'
                }`}>
                  <div className="flex items-center gap-2 font-bold">
                    {isSignedAndActive ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Lock className="w-4 h-4 text-amber-500" />}
                    <span>{isSignedAndActive ? 'Partner Account Active' : 'Activation Locked'}</span>
                  </div>
                  <p className="text-[11px]">
                    {isSignedAndActive
                      ? 'This account has been activated in the AIEC network. The partner can now receive job assignments and lead dispatches.'
                      : 'Complete the OTP e-signature to activate partner credentials.'}
                  </p>
                </div>

                {/* Remaining Onboarding Steps Checklist */}
                <div className="space-y-2.5 pt-2">
                  <span className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)] block">
                    Remaining Operational Requirements
                  </span>

                  {[
                    { label: 'E-Signature Agreement', done: isSignedAndActive },
                    { label: 'Aadhaar / GSTIN Identity Proof', done: applicant.idProofUploaded ?? true },
                    { label: 'Wireman / Trade License', done: applicant.licenseUploaded ?? true },
                    { label: 'Bank Account & Cancelled Cheque', done: applicant.bankDetailsProvided ?? false }
                  ].map((step, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)]">
                      <span className="text-[var(--color-text-primary)]">{step.label}</span>
                      {step.done ? (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          ✓ Complete
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                          Pending
                        </span>
                      )}
                    </div>
                  ))}

                  {!applicant.bankDetailsProvided && (
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-800 dark:text-amber-200 flex items-start gap-1.5 mt-2">
                      <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span>Account activated for basic app access. Full milestone payouts require bank details submission.</span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="space-y-2 pt-2">
                  {onNavigateToTierAssignment && (
                    <Button
                      onClick={() => onNavigateToTierAssignment(applicant.id)}
                      className="w-full py-2.5 text-xs font-bold bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] border border-[var(--color-accent-primary)]/20 hover:bg-[var(--color-accent-primary)] hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Award className="w-4 h-4" />
                      <span>Assign Partner Skill Tier</span>
                    </Button>
                  )}

                  {onNavigateToDashboard && (
                    <Button
                      onClick={onNavigateToDashboard}
                      className="w-full py-2.5 text-xs font-bold bg-[var(--color-bg)] text-[var(--color-text-primary)] border border-[var(--color-border)] hover:bg-[var(--color-surface)] flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Recruitment Funnel Dashboard</span>
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </Card>

            </div>

          </div>
        ) : (
          <Card className="p-12 text-center border-[var(--color-border)] bg-[var(--color-surface)]">
            <UserIcon className="w-12 h-12 text-[var(--color-text-secondary)] mx-auto mb-2 opacity-50" />
            <h3 className="text-base font-bold text-[var(--color-text-primary)]">No Applicant Selected</h3>
          </Card>
        )}
      </div>

      {/* Custom Term Addendum Modal */}
      {showAddendumModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-[var(--color-accent-primary)]" />
                <span>Admin Custom Term Addendum</span>
              </h3>
              <button onClick={() => setShowAddendumModal(false)} className="text-xs text-[var(--color-text-secondary)]">✕</button>
            </div>

            <p className="text-xs text-[var(--color-text-secondary)]">
              Document special negotiated terms for experienced candidates (e.g., custom commission rates or bonus retainers).
            </p>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                Approved Custom Terms / Addendum Note
              </label>
              <textarea
                rows={4}
                placeholder="e.g., Approved +₹1,000 bonus per completion for master VFD calibrator in Chakan zone..."
                value={customAddendumNote}
                onChange={e => setCustomAddendumNote(e.target.value)}
                className="w-full px-3.5 py-2 text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-primary)]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button onClick={() => setShowAddendumModal(false)} className="px-4 py-2 text-xs bg-[var(--color-bg)] text-[var(--color-text-primary)] border border-[var(--color-border)]">
                Cancel
              </Button>
              <Button onClick={handleSaveCustomAddendum} className="px-4 py-2 text-xs bg-[var(--color-accent-primary)] text-white font-bold">
                Save & Attach Addendum
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
