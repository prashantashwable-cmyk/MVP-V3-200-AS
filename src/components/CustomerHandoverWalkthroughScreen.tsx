import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  CheckCircle,
  Star,
  FileCheck2,
  Shield,
  HelpCircle,
  PhoneCall,
  Video,
  UserCheck,
  Users,
  Check,
  Send,
  Sparkles,
  BookOpen,
  Award,
  Clock,
  ThumbsUp,
  AlertCircle
} from 'lucide-react';
import { User, CustomerHandoverWalkthroughRecord, Job } from '../types';
import { DbManager } from '../lib/db';
import { bridgeCustomerAcceptanceRecorded } from '../services/legacyCommercialBridge';
import { Card, Button } from './Common';

const Badge = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide inline-flex items-center gap-1 ${className}`}>
    {children}
  </span>
);

interface CustomerHandoverWalkthroughScreenProps {
  user: User;
  jobId: string;
  onBack: () => void;
  onNavigateToTimeline?: (jobId: string) => void;
  onNavigateToWarranty?: (jobId: string) => void;
}

export const CustomerHandoverWalkthroughScreen: React.FC<CustomerHandoverWalkthroughScreenProps> = ({
  user,
  jobId,
  onBack,
  onNavigateToTimeline,
  onNavigateToWarranty
}) => {
  const [job, setJob] = useState<Job | null>(null);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Walkthrough mode & conductor
  const [walkthroughMode, setWalkthroughMode] = useState<'in_person' | 'video_call_remote' | 'site_representative'>('in_person');
  const [repName, setRepName] = useState('');
  const [conductorName, setConductorName] = useState('Vikram Salunkhe (Chief QC Auditor) & Prashant Wable');

  // Step 2: Demonstration Checklist
  const [demoNormalOp, setDemoNormalOp] = useState(true);
  const [demoArdEmergency, setDemoArdEmergency] = useState(true);
  const [demoAlarmIntercom, setDemoAlarmIntercom] = useState(true);
  const [demoCleaningCare, setDemoCleaningCare] = useState(true);

  // Step 3: Document Handover & AMC Plan Enrollment
  const [docsProvided, setDocsProvided] = useState<string[]>([
    'IS 14665 QA Certificate of Conformance',
    'AIEC 12-Month Comprehensive Warranty Terms',
    'Gold AMC Annual Maintenance Contract Plan Brochure',
    'Passenger Emergency Operations Manual',
    '24x7 AIEC Maharashtra Helpline Contacts Card'
  ]);
  const [amcEnrolled, setAmcEnrolled] = useState(true);
  const [amcPlanSelected, setAmcPlanSelected] = useState('Gold Comprehensive AMC (4 Preventive Visits + Free Callouts)');

  // Step 4: Digital Sign-off, Feedback & Follow-up Questions
  const [feedbackScore, setFeedbackScore] = useState<number>(5);
  const [feedbackComments, setFeedbackComments] = useState('');
  const [followupQuestions, setFollowupQuestions] = useState('');
  const [signatureCanvasSigned, setSignatureCanvasSigned] = useState(true);

  const [isCompleted, setIsCompleted] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [jobId]);

  const loadData = () => {
    const j = DbManager.getJobById(jobId) || DbManager.getJobs()[0];
    setJob(j);

    const existing = DbManager.getCustomerWalkthroughByJobId(j?.id || jobId);
    if (existing) {
      setWalkthroughMode(existing.walkthroughMode);
      setRepName(existing.repNameIfApplicable || '');
      setConductorName(existing.walkthroughConductedBy);
      setDemoNormalOp(existing.demonstratedItems.normalOperation);
      setDemoArdEmergency(existing.demonstratedItems.ardEmergencyProcedure);
      setDemoAlarmIntercom(existing.demonstratedItems.alarmAndIntercom);
      setDemoCleaningCare(existing.demonstratedItems.cleaningAndCare);
      setDocsProvided(existing.documentsProvided);
      setAmcEnrolled(existing.amcOptionEnrolled);
      setAmcPlanSelected(existing.amcPlanSelected || 'Gold Comprehensive AMC');
      setFeedbackScore(existing.immediateFeedbackScore);
      setFeedbackComments(existing.customerFeedbackComments || '');
      setFollowupQuestions(existing.followupQuestions || '');
    }
  };

  const handleFinalSubmit = () => {
    const record: CustomerHandoverWalkthroughRecord = {
      id: `chw_${Date.now()}`,
      jobId: job?.id || jobId,
      walkthroughConductedBy: conductorName,
      walkthroughMode: walkthroughMode,
      repNameIfApplicable: walkthroughMode === 'site_representative' ? repName : undefined,
      demonstratedItems: {
        normalOperation: demoNormalOp,
        ardEmergencyProcedure: demoArdEmergency,
        alarmAndIntercom: demoAlarmIntercom,
        cleaningAndCare: demoCleaningCare
      },
      customerSignatureUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><path d="M10 40 Q 50 10 90 40 T 170 30" stroke="%230E4B3D" stroke-width="3" fill="none"/></svg>',
      customerSignoffTimestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST',
      documentsProvided: docsProvided,
      amcOptionEnrolled: amcEnrolled,
      amcPlanSelected: amcEnrolled ? amcPlanSelected : undefined,
      immediateFeedbackScore: feedbackScore,
      customerFeedbackComments: feedbackComments,
      followupQuestions: followupQuestions
    };

    DbManager.updateCustomerWalkthrough(record);
    setIsCompleted(true);
    setSuccessBanner('Congratulations! Elevator Customer Handover Walkthrough & Digital Acceptance is official.');

    // Also update overall job status to 'handover_complete' if applicable
    if (job) {
      DbManager.updateJob({
        ...job,
        status: 'completed'
      });
    }

    // Phase 18: bridge into the real canonical Handover's customer
    // acceptance (Phase 09's hard gate — a certificate cannot be issued
    // without this), in addition to the DbManager writes above — see
    // legacyCommercialBridge.ts.
    bridgeCustomerAcceptanceRecorded(
      { id: user.id, role: user.role, isDemo: user.isDemo, authMethod: user.authMethod },
      jobId,
    ).then(result => {
      if (!result.bridged) {
        console.warn(`[Phase 18 bridge] customer acceptance for job ${jobId} not mirrored to canonical model: ${result.reason}`);
      }
    });

    if (onNavigateToWarranty) {
      setTimeout(() => {
        onNavigateToWarranty(jobId);
      }, 1200);
    }
  };

  const stepsList = [
    { num: 1, title: 'Conductor & Mode' },
    { num: 2, title: 'Guided Demo' },
    { num: 3, title: 'Docs & AMC' },
    { num: 4, title: 'Sign-off & Rating' }
  ];

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
                  Module 14 — Final Step
                </span>
                <span className="text-[var(--color-border)]">•</span>
                <span className="text-xs font-mono text-[var(--color-text-secondary)]">Job #{job?.jobNumber || jobId}</span>
              </div>
              <h1 className="text-lg font-bold font-serif text-[var(--color-text-primary)]">
                Customer Handover Walkthrough
              </h1>
            </div>
          </div>

          <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Customer Moment
          </Badge>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
        {/* Banner Alert */}
        {successBanner && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 flex items-center gap-3 animate-fade-in">
            <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-bold">{successBanner}</p>
              <p className="text-xs">Elevator handed over with 12-month AIEC warranty and AMC option active.</p>
            </div>
          </div>
        )}

        {/* Wizard Header Horizontal Ascension Line */}
        <Card className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)]">
          <div className="grid grid-cols-4 gap-2 relative">
            {stepsList.map(s => {
              const isActive = currentStep === s.num;
              const isPast = currentStep > s.num || isCompleted;
              return (
                <div
                  key={s.num}
                  onClick={() => !isCompleted && setCurrentStep(s.num as any)}
                  className={`flex flex-col items-center text-center cursor-pointer space-y-1 transition-all ${
                    isActive ? 'scale-105' : ''
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full font-mono text-xs font-bold flex items-center justify-center transition-colors ${
                    isPast || isActive
                      ? 'bg-[var(--color-accent-primary)] text-white shadow-sm'
                      : 'bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-secondary)]'
                  }`}>
                    {isPast ? <Check className="w-4 h-4" /> : s.num}
                  </div>
                  <span className={`text-[11px] font-medium leading-tight ${
                    isActive ? 'text-[var(--color-accent-primary)] font-bold' : 'text-[var(--color-text-secondary)]'
                  }`}>
                    {s.title}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Step 1: Conductor & Walkthrough Mode */}
        {currentStep === 1 && (
          <Card className="p-6 bg-[var(--color-surface)] border border-[var(--color-border)] space-y-5">
            <div className="border-b border-[var(--color-border)] pb-3">
              <span className="text-xs font-mono uppercase text-[var(--color-accent-primary)]">Step 1 of 4</span>
              <h2 className="text-base font-bold font-serif text-[var(--color-text-primary)]">
                Walkthrough Conductor & Setup
              </h2>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Select who is conducting the walkthrough and the interaction format.
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-semibold text-[var(--color-text-secondary)]">
                Walkthrough Format Mode
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div
                  onClick={() => setWalkthroughMode('in_person')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    walkthroughMode === 'in_person'
                      ? 'bg-[var(--color-surface)] border-[var(--color-accent-primary)] ring-1 ring-[var(--color-accent-primary)]'
                      : 'bg-[var(--color-bg)] border-[var(--color-border)] hover:border-[var(--color-accent-primary)]/50'
                  }`}
                >
                  <UserCheck className="w-5 h-5 text-[var(--color-accent-primary)] mb-1" />
                  <p className="text-xs font-bold text-[var(--color-text-primary)]">In-Person Onsite</p>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">Customer present at building site</p>
                </div>

                <div
                  onClick={() => setWalkthroughMode('video_call_remote')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    walkthroughMode === 'video_call_remote'
                      ? 'bg-[var(--color-surface)] border-[var(--color-accent-primary)] ring-1 ring-[var(--color-accent-primary)]'
                      : 'bg-[var(--color-bg)] border-[var(--color-border)] hover:border-[var(--color-accent-primary)]/50'
                  }`}
                >
                  <Video className="w-5 h-5 text-blue-600 mb-1" />
                  <p className="text-xs font-bold text-[var(--color-text-primary)]">Scheduled Video Call</p>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">NRI / Remote owner live call</p>
                </div>

                <div
                  onClick={() => setWalkthroughMode('site_representative')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    walkthroughMode === 'site_representative'
                      ? 'bg-[var(--color-surface)] border-[var(--color-accent-primary)] ring-1 ring-[var(--color-accent-primary)]'
                      : 'bg-[var(--color-bg)] border-[var(--color-border)] hover:border-[var(--color-accent-primary)]/50'
                  }`}
                >
                  <Users className="w-5 h-5 text-purple-600 mb-1" />
                  <p className="text-xs font-bold text-[var(--color-text-primary)]">Site Representative</p>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">Authorized building manager</p>
                </div>
              </div>
            </div>

            {walkthroughMode === 'site_representative' && (
              <div className="space-y-1.5 animate-fade-in">
                <label className="text-xs font-semibold text-[var(--color-text-secondary)]">
                  Representative Full Name & Designation
                </label>
                <input
                  type="text"
                  value={repName}
                  onChange={e => setRepName(e.target.value)}
                  placeholder="e.g. Mr. Sanjay Deshmukh (Society Secretary)"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--color-text-secondary)]">
                Conducted By (AIEC Lead & Team)
              </label>
              <input
                type="text"
                value={conductorName}
                onChange={e => setConductorName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => setCurrentStep(2)}
                className="py-2.5 px-6 bg-[var(--color-accent-primary)] text-white text-xs font-semibold rounded-xl"
              >
                Next: Guided Demonstration →
              </Button>
            </div>
          </Card>
        )}

        {/* Step 2: Guided Operation & Safety Demonstration Script */}
        {currentStep === 2 && (
          <Card className="p-6 bg-[var(--color-surface)] border border-[var(--color-border)] space-y-5">
            <div className="border-b border-[var(--color-border)] pb-3">
              <span className="text-xs font-mono uppercase text-[var(--color-accent-primary)]">Step 2 of 4</span>
              <h2 className="text-base font-bold font-serif text-[var(--color-text-primary)]">
                Guided Operation & Emergency Demonstration
              </h2>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Walk the customer through each critical feature and tick off upon physical demonstration.
              </p>
            </div>

            <div className="space-y-3">
              <div
                onClick={() => setDemoNormalOp(!demoNormalOp)}
                className="p-3.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] flex items-start gap-3 cursor-pointer hover:border-[var(--color-accent-primary)] transition-colors"
              >
                <div className={`w-5 h-5 rounded-md border shrink-0 mt-0.5 flex items-center justify-center ${
                  demoNormalOp ? 'bg-[var(--color-accent-primary)] border-[var(--color-accent-primary)] text-white' : 'border-[var(--color-border)]'
                }`}>
                  {demoNormalOp && <Check className="w-3.5 h-3.5" />}
                </div>
                <div>
                  <h3 className="text-xs font-bold text-[var(--color-text-primary)]">1. Normal Passenger Operation & Landing Call Logic</h3>
                  <p className="text-[11px] text-[var(--color-text-secondary)]">
                    Demonstrated call registration, smooth acceleration, door light curtain sensors, and precise floor leveling.
                  </p>
                </div>
              </div>

              <div
                onClick={() => setDemoArdEmergency(!demoArdEmergency)}
                className="p-3.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] flex items-start gap-3 cursor-pointer hover:border-[var(--color-accent-primary)] transition-colors"
              >
                <div className={`w-5 h-5 rounded-md border shrink-0 mt-0.5 flex items-center justify-center ${
                  demoArdEmergency ? 'bg-[var(--color-accent-primary)] border-[var(--color-accent-primary)] text-white' : 'border-[var(--color-border)]'
                }`}>
                  {demoArdEmergency && <Check className="w-3.5 h-3.5" />}
                </div>
                <div>
                  <h3 className="text-xs font-bold text-[var(--color-text-primary)]">2. Power Cut & Automatic Rescue Device (ARD) Demonstration</h3>
                  <p className="text-[11px] text-[var(--color-text-secondary)]">
                    Simulated power cut. Demonstrated ARD battery auto-landing at nearest floor and automatic door opening.
                  </p>
                </div>
              </div>

              <div
                onClick={() => setDemoAlarmIntercom(!demoAlarmIntercom)}
                className="p-3.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] flex items-start gap-3 cursor-pointer hover:border-[var(--color-accent-primary)] transition-colors"
              >
                <div className={`w-5 h-5 rounded-md border shrink-0 mt-0.5 flex items-center justify-center ${
                  demoAlarmIntercom ? 'bg-[var(--color-accent-primary)] border-[var(--color-accent-primary)] text-white' : 'border-[var(--color-border)]'
                }`}>
                  {demoAlarmIntercom && <Check className="w-3.5 h-3.5" />}
                </div>
                <div>
                  <h3 className="text-xs font-bold text-[var(--color-text-primary)]">3. Emergency Alarm & 2-Way Intercom Testing</h3>
                  <p className="text-[11px] text-[var(--color-text-secondary)]">
                    Tested yellow alarm button and two-way intercom clarity between cabin, machine room, and watchman booth.
                  </p>
                </div>
              </div>

              <div
                onClick={() => setDemoCleaningCare(!demoCleaningCare)}
                className="p-3.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] flex items-start gap-3 cursor-pointer hover:border-[var(--color-accent-primary)] transition-colors"
              >
                <div className={`w-5 h-5 rounded-md border shrink-0 mt-0.5 flex items-center justify-center ${
                  demoCleaningCare ? 'bg-[var(--color-accent-primary)] border-[var(--color-accent-primary)] text-white' : 'border-[var(--color-border)]'
                }`}>
                  {demoCleaningCare && <Check className="w-3.5 h-3.5" />}
                </div>
                <div>
                  <h3 className="text-xs font-bold text-[var(--color-text-primary)]">4. Basic Maintenance & Stainless Steel Cleaning Guidance</h3>
                  <p className="text-[11px] text-[var(--color-text-secondary)]">
                    Explained door track sill cleaning, mirror SS polish care, and avoiding water inside cabin floor or shaft.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                onClick={() => setCurrentStep(1)}
                className="py-2.5 px-4 text-xs font-semibold"
              >
                ← Back
              </Button>
              <Button
                onClick={() => setCurrentStep(3)}
                className="py-2.5 px-6 bg-[var(--color-accent-primary)] text-white text-xs font-semibold rounded-xl"
              >
                Next: Documents & AMC Enrollment →
              </Button>
            </div>
          </Card>
        )}

        {/* Step 3: Document Handover & AMC Plan Enrollment */}
        {currentStep === 3 && (
          <Card className="p-6 bg-[var(--color-surface)] border border-[var(--color-border)] space-y-5">
            <div className="border-b border-[var(--color-border)] pb-3">
              <span className="text-xs font-mono uppercase text-[var(--color-accent-primary)]">Step 3 of 4</span>
              <h2 className="text-base font-bold font-serif text-[var(--color-text-primary)]">
                Document Handover & AMC Enrollment
              </h2>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Provide essential compliance documents and prompt customer for Annual Maintenance Contract options.
              </p>
            </div>

            {/* Handed Over Documents List */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--color-text-secondary)]">
                Physical & Digital Document Package Handed Over
              </label>
              <div className="p-3.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] space-y-2">
                {docsProvided.map((doc, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-[var(--color-text-primary)]">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{doc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* AMC Enrollment Pitch & Selector */}
            <div className="p-4 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-[var(--color-accent-primary)]" />
                    Annual Maintenance Contract (AMC) Enrollment
                  </h3>
                  <p className="text-[11px] text-[var(--color-text-secondary)]">
                    Protect elevator performance beyond the initial 12-month warranty period.
                  </p>
                </div>
                <button
                  onClick={() => setAmcEnrolled(!amcEnrolled)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    amcEnrolled ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {amcEnrolled ? 'ENROLLED' : 'OPT OUT'}
                </button>
              </div>

              {amcEnrolled && (
                <div className="space-y-2 pt-2 animate-fade-in">
                  <label className="text-xs font-semibold text-[var(--color-text-secondary)]">
                    Selected AMC Tier Package
                  </label>
                  <select
                    value={amcPlanSelected}
                    onChange={e => setAmcPlanSelected(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
                  >
                    <option value="Silver Basic AMC (4 Routine Inspections / Year)">
                      Silver Basic AMC (4 Routine Inspections / Year)
                    </option>
                    <option value="Gold Comprehensive AMC (4 Preventive Visits + Free Callouts & Spares)">
                      Gold Comprehensive AMC (4 Preventive Visits + Free Callouts & Spares)
                    </option>
                    <option value="Platinum 24x7 Priority AMC (12 Monthly Visits + Zero-Downtime Guarantee)">
                      Platinum 24x7 Priority AMC (12 Monthly Visits + Zero-Downtime Guarantee)
                    </option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                onClick={() => setCurrentStep(2)}
                className="py-2.5 px-4 text-xs font-semibold"
              >
                ← Back
              </Button>
              <Button
                onClick={() => setCurrentStep(4)}
                className="py-2.5 px-6 bg-[var(--color-accent-primary)] text-white text-xs font-semibold rounded-xl"
              >
                Next: Sign-off & Immediate Feedback →
              </Button>
            </div>
          </Card>
        )}

        {/* Step 4: Digital Acceptance Sign-off & Immediate Feedback */}
        {currentStep === 4 && (
          <Card className="p-6 bg-[var(--color-surface)] border border-[var(--color-border)] space-y-5">
            <div className="border-b border-[var(--color-border)] pb-3">
              <span className="text-xs font-mono uppercase text-[var(--color-accent-primary)]">Step 4 of 4</span>
              <h2 className="text-base font-bold font-serif text-[var(--color-text-primary)]">
                Customer Acceptance Sign-off & Rating
              </h2>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Confirm digital signature sign-off and capture immediate customer rating.
              </p>
            </div>

            {/* Star Rating Widget */}
            <div className="p-4 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-center space-y-2">
              <span className="text-xs font-semibold uppercase text-[var(--color-text-secondary)]">
                Customer Overall Installation & Handover Experience Rating
              </span>
              <div className="flex items-center justify-center gap-2">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    onClick={() => setFeedbackScore(star)}
                    className="p-1 transition-transform hover:scale-110"
                  >
                    <Star
                      className={`w-7 h-7 ${
                        star <= feedbackScore ? 'text-amber-500 fill-amber-500' : 'text-gray-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
              <p className="text-xs font-bold text-[var(--color-accent-primary)]">
                {feedbackScore === 5 ? '5/5 — Outstanding / Delighted' : `${feedbackScore}/5 Stars`}
              </p>

              {feedbackScore < 3 && (
                <div className="p-2 rounded-lg bg-red-500/10 text-red-700 dark:text-red-300 text-[11px] flex items-center justify-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Feedback rating &lt; 3 stars will automatically alert Mr. Prashant Wable for personal review.</span>
                </div>
              )}
            </div>

            {/* Comments & Followup Questions */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--color-text-secondary)]">
                  Customer Testimonial / Feedback Comments
                </label>
                <textarea
                  value={feedbackComments}
                  onChange={e => setFeedbackComments(e.target.value)}
                  rows={2}
                  placeholder="e.g. Extremely smooth ride, beautiful cabin finishing, team was polite and explained ARD emergency operation clearly..."
                  className="w-full px-3 py-2 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
                />
              </div>

              {/* Edge Case 2: Handoff Follow-up Questions */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--color-text-secondary)]">
                  Customer Follow-up Questions (Customer Support Handoff)
                </label>
                <input
                  type="text"
                  value={followupQuestions}
                  onChange={e => setFollowupQuestions(e.target.value)}
                  placeholder="e.g. Request quarterly AMC visit schedule for November 2026..."
                  className="w-full px-3 py-2 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
                />
              </div>
            </div>

            {/* Simulated Digital Signature Box */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--color-text-secondary)]">
                Customer Digital Acceptance Signature *
              </label>
              <div className="p-4 rounded-xl bg-white border border-[var(--color-border)] text-center space-y-2">
                <div className="h-16 flex items-center justify-center border-b border-dashed border-gray-300">
                  <span className="font-serif italic text-xl text-[#0E4B3D] select-none">
                    {job?.customerName || 'Customer Acceptance Signature'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-gray-500">
                  <span>Signer: {job?.customerName || 'Customer / Authorized Rep'}</span>
                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Digitally Verified
                  </span>
                </div>
              </div>
            </div>

            {/* Navigation & Submit CTA */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                onClick={() => setCurrentStep(3)}
                className="py-2.5 px-4 text-xs font-semibold"
              >
                ← Back
              </Button>

              <Button
                onClick={handleFinalSubmit}
                disabled={isCompleted}
                className="py-3 px-6 bg-[var(--color-accent-primary)] text-white text-sm font-bold rounded-xl flex items-center gap-2 shadow-md hover:bg-[var(--color-accent-primary)]/90"
              >
                <FileCheck2 className="w-4 h-4" />
                Complete Handover & Lock Project
              </Button>
            </div>

            {onNavigateToTimeline && isCompleted && (
              <div className="pt-2 text-center">
                <button
                  onClick={() => onNavigateToTimeline(jobId)}
                  className="text-xs font-bold text-[var(--color-accent-primary)] hover:underline flex items-center justify-center gap-1 mx-auto"
                >
                  View Installation Progress Timeline →
                </button>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
};
