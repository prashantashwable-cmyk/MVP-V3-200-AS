import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileCheck,
  ShieldCheck,
  BookOpen,
  Award,
  Users,
  ChevronRight,
  Lock,
  Unlock,
  Edit3,
  FileText,
  Building,
  Check
} from 'lucide-react';
import { User, FinalHandoverChecklistRecord, DefectSnagRecord, Job } from '../types';
import { DbManager } from '../lib/db';
import { bridgeFinalChecklistCompleted } from '../services/legacyCommercialBridge';
import { Card, Button } from './Common';

const Badge = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide inline-flex items-center gap-1 ${className}`}>
    {children}
  </span>
);

interface FinalHandoverChecklistScreenProps {
  user: User;
  jobId: string;
  onBack: () => void;
  onNavigateToWalkthrough?: (jobId: string) => void;
  onNavigateToSnagList?: (jobId: string) => void;
  onNavigateToComplianceCert?: (jobId: string) => void;
}

export const FinalHandoverChecklistScreen: React.FC<FinalHandoverChecklistScreenProps> = ({
  user,
  jobId,
  onBack,
  onNavigateToWalkthrough,
  onNavigateToSnagList,
  onNavigateToComplianceCert
}) => {
  const [job, setJob] = useState<Job | null>(null);
  const [record, setRecord] = useState<FinalHandoverChecklistRecord | null>(null);
  const [snags, setSnags] = useState<DefectSnagRecord[]>([]);

  // State for documentation items
  const [docWarrantyValid, setDocWarrantyValid] = useState(true);
  const [docAmcBrochureValid, setDocAmcBrochureValid] = useState(true);
  const [docManualValid, setDocManualValid] = useState(true);
  const [adminReviewApproved, setAdminReviewApproved] = useState(true);

  // Editing typo drawer state
  const [showDocEditModal, setShowDocEditModal] = useState(false);
  const [warrantyTierText, setWarrantyTierText] = useState('12-Month AIEC Gold Comprehensive Elevator Warranty');

  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [jobId]);

  const loadData = () => {
    const j = DbManager.getJobById(jobId) || DbManager.getJobs()[0];
    setJob(j);

    const allSnags = DbManager.getDefectSnags().filter(s => s.jobId === (j?.id || jobId));
    setSnags(allSnags);

    let fhc = DbManager.getFinalHandoverChecklistByJobId(j?.id || jobId);
    if (!fhc) {
      fhc = {
        id: `fhc_${Date.now()}`,
        jobId: j?.id || jobId,
        allSnagsResolvedFlag: false,
        complianceCertIssuedFlag: true,
        documentationPackageReadyFlag: true,
        adminFinalReviewApproved: true,
        handoverReadyStatus: 'blocked',
        blockingReasons: [],
        checkedByInspectorName: user.name || 'QC Lead Inspector',
        checkedAt: new Date().toISOString()
      };
    }

    // Evaluate live blocker signals
    const openSafetySnags = allSnags.filter(
      s => s.severity === 'safety_critical' && s.resolutionStatus !== 'qc_verified_closed'
    );
    const openFunctionalSnags = allSnags.filter(
      s => s.severity === 'functional' && s.resolutionStatus !== 'qc_verified_closed'
    );

    const blockers: string[] = [];
    if (openSafetySnags.length > 0) {
      blockers.push(`${openSafetySnags.length} Safety-Critical Snag(s) remain open.`);
    }
    if (openFunctionalSnags.length > 0) {
      blockers.push(`${openFunctionalSnags.length} Functional Snag(s) pending resolution or QC re-check.`);
    }

    const allResolved = openSafetySnags.length === 0 && openFunctionalSnags.length === 0;
    fhc.allSnagsResolvedFlag = allResolved;
    fhc.blockingReasons = blockers;

    if (blockers.length === 0 && docWarrantyValid && docAmcBrochureValid && docManualValid && adminReviewApproved) {
      fhc.handoverReadyStatus = 'ready_for_walkthrough';
    } else {
      fhc.handoverReadyStatus = 'blocked';
    }

    setRecord(fhc);
    DbManager.updateFinalHandoverChecklist(fhc);
  };

  const handleToggleDocValidity = (type: 'warranty' | 'amc' | 'manual') => {
    let w = docWarrantyValid;
    let a = docAmcBrochureValid;
    let m = docManualValid;

    if (type === 'warranty') w = !docWarrantyValid;
    if (type === 'amc') a = !docAmcBrochureValid;
    if (type === 'manual') m = !docManualValid;

    setDocWarrantyValid(w);
    setDocAmcBrochureValid(a);
    setDocManualValid(m);

    const docReady = w && a && m;
    if (record) {
      const updated = {
        ...record,
        documentationPackageReadyFlag: docReady
      };
      setRecord(updated);
      DbManager.updateFinalHandoverChecklist(updated);
    }
  };

  const handleConfirmReadyForHandover = () => {
    if (!record) return;

    if (!record.allSnagsResolvedFlag) {
      setErrorBanner('Cannot proceed: Unresolved Safety-Critical or Functional snags exist on the Defect/Snag List.');
      return;
    }

    if (!docWarrantyValid || !docAmcBrochureValid || !docManualValid) {
      setErrorBanner('Cannot proceed: Documentation package is incomplete or has unverified documents.');
      return;
    }

    if (!adminReviewApproved) {
      setErrorBanner('Cannot proceed: Final Admin review sign-off is pending.');
      return;
    }

    const updated: FinalHandoverChecklistRecord = {
      ...record,
      handoverReadyStatus: 'ready_for_walkthrough',
      checkedAt: new Date().toISOString()
    };

    setRecord(updated);
    DbManager.updateFinalHandoverChecklist(updated);

    // Phase 18: bridge into the real canonical Handover's final-checklist
    // transition (still gated on a real QC pass inside confirmCompliance,
    // called earlier in the chain — see legacyCommercialBridge.ts), in
    // addition to the DbManager write above.
    bridgeFinalChecklistCompleted(
      { id: user.id, role: user.role, isDemo: user.isDemo, authMethod: user.authMethod },
      jobId,
    ).then(result => {
      if (!result.bridged) {
        console.warn(`[Phase 18 bridge] final checklist for job ${jobId} not mirrored to canonical model: ${result.reason}`);
      }
    });

    setSuccessBanner('Final Handover Gate Passed! "Customer Handover Walkthrough" is now unlocked.');
    setTimeout(() => {
      if (onNavigateToWalkthrough) {
        onNavigateToWalkthrough(jobId);
      }
    }, 1500);
  };

  const isBlocked = record?.handoverReadyStatus === 'blocked' || (record?.blockingReasons && record.blockingReasons.length > 0);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] pb-28">
      {/* Top Bar Header */}
      <div className="sticky top-0 z-30 bg-[var(--color-surface)]/95 backdrop-blur-md border-b border-[var(--color-border)] px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 rounded-lg hover:bg-[var(--color-bg)] text-[var(--color-text-secondary)] transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-accent-primary)]">
                  Module 14 — Gate 4
                </span>
                <span className="text-[var(--color-border)]">•</span>
                <span className="text-xs font-mono text-[var(--color-text-secondary)]">Job #{job?.jobNumber || jobId}</span>
              </div>
              <h1 className="text-lg font-bold font-serif text-[var(--color-text-primary)]">
                Final Handover Completeness Gate
              </h1>
            </div>
          </div>

          <Badge className={isBlocked ? 'bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/30' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'}>
            {isBlocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            {isBlocked ? 'GATE LOCKED' : 'READY FOR HANDOVER'}
          </Badge>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
        {/* Banner Messages */}
        {errorBanner && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-800 dark:text-red-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
              <p className="text-xs font-medium">{errorBanner}</p>
            </div>
            <button onClick={() => setErrorBanner(null)} className="text-xs font-bold text-red-600">✕</button>
          </div>
        )}

        {successBanner && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <p className="text-xs font-medium">{successBanner}</p>
          </div>
        )}

        {/* Ascension Line Process Progress Header */}
        <Card className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-xs font-mono uppercase text-[var(--color-text-secondary)]">AIEC Quality Check SOP</span>
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Synthesized Gate Completeness</h2>
            </div>
            <span className="text-xs font-mono font-bold text-[var(--color-accent-primary)]">
              {record?.allSnagsResolvedFlag && record?.complianceCertIssuedFlag && docWarrantyValid ? '100% COMPLETE' : 'CHECKLIST IN PROGRESS'}
            </span>
          </div>

          <div className="relative pl-6 space-y-3.5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--color-accent-primary)]">
            <div className="relative flex items-center justify-between">
              <div className="absolute -left-6 w-3 h-3 rounded-full bg-[var(--color-accent-primary)] ring-4 ring-[var(--color-surface)]" />
              <span className="text-xs font-medium text-[var(--color-text-primary)]">1. Mechanical & Electrical Quality Checklists</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>

            <div className="relative flex items-center justify-between">
              <div className="absolute -left-6 w-3 h-3 rounded-full bg-[var(--color-accent-primary)] ring-4 ring-[var(--color-surface)]" />
              <span className="text-xs font-medium text-[var(--color-text-primary)]">2. Compliance & Statutory QA Certificate</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>

            <div className="relative flex items-center justify-between">
              <div className={`absolute -left-6 w-3 h-3 rounded-full ring-4 ring-[var(--color-surface)] ${
                record?.allSnagsResolvedFlag ? 'bg-[var(--color-accent-primary)]' : 'bg-red-500'
              }`} />
              <span className="text-xs font-medium text-[var(--color-text-primary)]">3. Zero-Safety-Critical Snag Resolution</span>
              {record?.allSnagsResolvedFlag ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500" />
              )}
            </div>

            <div className="relative flex items-center justify-between">
              <div className="absolute -left-6 w-3 h-3 rounded-full bg-[var(--color-accent-primary)] ring-4 ring-[var(--color-surface)] animate-pulse" />
              <span className="text-xs font-medium text-[var(--color-accent-primary)] font-semibold">4. Documentation Package & Final Handover Gate</span>
              <span className="text-[10px] font-mono text-[var(--color-accent-primary)] uppercase">CURRENT GATE</span>
            </div>
          </div>
        </Card>

        {/* Synthesis Gate Cards */}
        <div className="space-y-4">
          {/* Gate 1: Defect / Snag Resolution Signal */}
          <Card className={`p-5 bg-[var(--color-surface)] border transition-all ${
            record?.allSnagsResolvedFlag ? 'border-[var(--color-border)]' : 'border-red-500/50 shadow-sm'
          }`}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${record?.allSnagsResolvedFlag ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
                    1. Snag & Defect Clearance Check
                  </h3>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Ensures no open Safety-Critical or Functional snags remain on job.
                  </p>
                </div>
              </div>

              {onNavigateToSnagList && (
                <Button
                  variant="outline"
                  onClick={() => onNavigateToSnagList(jobId)}
                  className="text-xs py-1 px-2.5 flex items-center gap-1"
                >
                  View Snag List <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>

            {record?.allSnagsResolvedFlag ? (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>All mechanical, electrical & safety snags are verified closed or waived by customer.</span>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 space-y-2">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-300 font-semibold text-xs">
                  <XCircle className="w-4 h-4" />
                  <span>HANDOVER BLOCKED: Unresolved Snags Active</span>
                </div>
                <ul className="text-xs text-red-600 dark:text-red-400 pl-6 list-disc space-y-1">
                  {record?.blockingReasons.map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {/* Gate 2: Compliance Certificate Signal */}
          <Card className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)]">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
                    2. Statutory & Compliance Certification
                  </h3>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    IS 14665 QA Certificate issued & locked in immutable audit record.
                  </p>
                </div>
              </div>

              {onNavigateToComplianceCert && (
                <Button
                  variant="outline"
                  onClick={() => onNavigateToComplianceCert(jobId)}
                  className="text-xs py-1 px-2.5 flex items-center gap-1"
                >
                  View Certificate <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>

            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Certificate #AIEC-QA-2026-101 (IS 14665 / IS 15259) verified active.</span>
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-800 dark:text-emerald-200">
                LOCKED
              </Badge>
            </div>
          </Card>

          {/* Gate 3: Customer Handover Documentation Bundle */}
          <Card className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
                    3. Customer Handover Documentation Bundle
                  </h3>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Verify physical & digital document package ready for customer handover.
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                onClick={() => setShowDocEditModal(true)}
                className="text-xs py-1 px-2.5 flex items-center gap-1"
              >
                <Edit3 className="w-3.5 h-3.5 text-[var(--color-accent-primary)]" />
                Edit Bundle Details
              </Button>
            </div>

            {/* Document Checklist Items */}
            <div className="space-y-2.5 pt-1">
              <div
                onClick={() => handleToggleDocValidity('warranty')}
                className="p-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-between cursor-pointer hover:border-[var(--color-accent-primary)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                    docWarrantyValid ? 'bg-[var(--color-accent-primary)] border-[var(--color-accent-primary)] text-white' : 'border-[var(--color-border)]'
                  }`}>
                    {docWarrantyValid && <Check className="w-3.5 h-3.5" />}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[var(--color-text-primary)]">{warrantyTierText}</p>
                    <p className="text-[11px] text-[var(--color-text-secondary)]">12 Months Comprehensive Structural & Electrical Warranty Certificate</p>
                  </div>
                </div>
                <Badge className={docWarrantyValid ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700'}>
                  {docWarrantyValid ? 'READY' : 'UNVERIFIED'}
                </Badge>
              </div>

              <div
                onClick={() => handleToggleDocValidity('amc')}
                className="p-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-between cursor-pointer hover:border-[var(--color-accent-primary)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                    docAmcBrochureValid ? 'bg-[var(--color-accent-primary)] border-[var(--color-accent-primary)] text-white' : 'border-[var(--color-border)]'
                  }`}>
                    {docAmcBrochureValid && <Check className="w-3.5 h-3.5" />}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[var(--color-text-primary)]">AMC Option & Enrollment Brochure</p>
                    <p className="text-[11px] text-[var(--color-text-secondary)]">Silver, Gold & Platinum Annual Maintenance Plans & Rate Cards</p>
                  </div>
                </div>
                <Badge className={docAmcBrochureValid ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700'}>
                  {docAmcBrochureValid ? 'READY' : 'UNVERIFIED'}
                </Badge>
              </div>

              <div
                onClick={() => handleToggleDocValidity('manual')}
                className="p-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-between cursor-pointer hover:border-[var(--color-accent-primary)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                    docManualValid ? 'bg-[var(--color-accent-primary)] border-[var(--color-accent-primary)] text-white' : 'border-[var(--color-border)]'
                  }`}>
                    {docManualValid && <Check className="w-3.5 h-3.5" />}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[var(--color-text-primary)]">User Operating Manual & Emergency Procedures</p>
                    <p className="text-[11px] text-[var(--color-text-secondary)]">Includes ARD auto-landing, intercom instructions & 24x7 helpline contacts</p>
                  </div>
                </div>
                <Badge className={docManualValid ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700'}>
                  {docManualValid ? 'READY' : 'UNVERIFIED'}
                </Badge>
              </div>
            </div>
          </Card>

          {/* Gate 4: Admin Final Personal Review Step */}
          <Card className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
                  4. Admin / Management Final Sign-off
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  High-profile customer personal review sign-off by Mr. Prashant Wable / Admin.
                </p>
              </div>
            </div>

            <button
              onClick={() => setAdminReviewApproved(!adminReviewApproved)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                adminReviewApproved
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-700'
              }`}
            >
              {adminReviewApproved ? '✓ APPROVED' : 'PENDING APPROVAL'}
            </button>
          </Card>
        </div>

        {/* Sticky Bottom Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-[var(--color-surface)] border-t border-[var(--color-border)] p-4 shadow-lg">
          <div className="max-w-3xl mx-auto flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono uppercase text-[var(--color-text-secondary)] truncate">
                Inspector: {record?.checkedByInspectorName}
              </p>
              <p className="text-xs font-semibold text-[var(--color-text-primary)] truncate">
                {isBlocked ? 'Handover Gate Locked (Blockers Exist)' : 'Gate Unlocked: Ready for Walkthrough'}
              </p>
            </div>

            <Button
              onClick={handleConfirmReadyForHandover}
              disabled={isBlocked}
              className={`py-3 px-6 text-sm font-semibold rounded-xl flex items-center gap-2 shadow-md transition-all ${
                isBlocked
                  ? 'bg-gray-400 text-white cursor-not-allowed opacity-60'
                  : 'bg-[var(--color-accent-primary)] text-white hover:bg-[var(--color-accent-primary)]/90'
              }`}
            >
              <FileCheck className="w-4 h-4" />
              Confirm Ready for Handover
            </Button>
          </div>
        </div>
      </div>

      {/* Edit Bundle Details Modal */}
      {showDocEditModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-6 bg-[var(--color-surface)] border border-[var(--color-border)] space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <h3 className="text-base font-bold font-serif text-[var(--color-text-primary)]">
                Correct Documentation Package Details
              </h3>
              <button
                onClick={() => setShowDocEditModal(false)}
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[var(--color-text-secondary)]">
              Correct minor typos or update the warranty package tier referencing before final customer presentation.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--color-text-secondary)]">
                Warranty Certificate Title / Tier Name
              </label>
              <input
                type="text"
                value={warrantyTierText}
                onChange={e => setWarrantyTierText(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowDocEditModal(false)}
                className="w-full py-2 text-xs"
              >
                Save Details
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
