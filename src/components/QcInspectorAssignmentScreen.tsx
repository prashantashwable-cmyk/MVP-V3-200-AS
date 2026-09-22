import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, QcInspectorAssignmentRecord, TechnicianJob, InstallationSopStep, SafetyComplianceItem 
} from '../types';
import { DbManager } from '../lib/db';
import { bridgeInstallationProgress } from '../services/legacyCommercialBridge';
import { Card, Button } from './Common';
import { 
  ShieldCheck, CheckCircle2, AlertTriangle, Calendar, Clock, UserCheck, 
  ChevronLeft, Award, FileText, Phone, Send, Info, Sparkles, Building, MapPin, 
  UserX, Shield, Lock, CheckSquare, RefreshCw, AlertCircle
} from 'lucide-react';
import { useLanguage } from '../lib/language';

interface QcInspectorAssignmentScreenProps {
  user: User;
  jobId?: string;
  onBack?: () => void;
  onNavigateToMechanicalQc?: (jobId: string) => void;
}

export const QcInspectorAssignmentScreen: React.FC<QcInspectorAssignmentScreenProps> = ({
  user,
  jobId = 'job_2026_101',
  onBack,
  onNavigateToMechanicalQc
}) => {
  const { t } = useLanguage();
  const [selectedJobId, setSelectedJobId] = useState<string>(jobId);
  const [jobList, setJobList] = useState<TechnicianJob[]>([]);
  const [activeJob, setActiveJob] = useState<TechnicianJob | undefined>(undefined);
  const [sopSteps, setSopSteps] = useState<InstallationSopStep[]>([]);
  const [safetyItems, setSafetyItems] = useState<SafetyComplianceItem[]>([]);
  
  // Assignment form state
  const [selectedInspectorId, setSelectedInspectorId] = useState<string>('user_qc_001');
  const [scheduledDate, setScheduledDate] = useState<string>('2026-08-14');
  const [scheduledSlot, setScheduledSlot] = useState<string>('10:00 AM - 01:00 PM');
  const [customerPreferredTiming, setCustomerPreferredTiming] = useState<string>('Morning Slot (10 AM - 1 PM)');
  const [customerConfirmedSlot, setCustomerConfirmedSlot] = useState<boolean>(true);
  const [adminOverrideReason, setAdminOverrideReason] = useState<string>('');
  const [isAdminSelfAssigned, setIsAdminSelfAssigned] = useState<boolean>(false);
  
  // Notice & notification modal
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  const [notificationSent, setNotificationSent] = useState<boolean>(false);
  const [draftSavedToast, setDraftSavedToast] = useState<boolean>(false);

  // Load data
  useEffect(() => {
    const jobs = DbManager.getTechnicianJobs();
    setJobList(jobs);
    
    const currJob = jobs.find(j => j.id === selectedJobId) || jobs[0];
    if (currJob) {
      setActiveJob(currJob);
      const steps = DbManager.getInstallationSopSteps(currJob.id);
      setSopSteps(steps);
      const safeties = DbManager.getSafetyComplianceItems(currJob.id);
      setSafetyItems(safeties);

      // Load existing assignment if available
      const existing = DbManager.getQcAssignmentByJobId(currJob.id);
      if (existing) {
        setSelectedInspectorId(existing.assignedInspectorId);
        setScheduledDate(existing.qcScheduledDate);
        setScheduledSlot(existing.qcScheduledTimeSlot);
        setCustomerConfirmedSlot(existing.customerConfirmedSlot ?? true);
        if (existing.adminOverrideReason) setAdminOverrideReason(existing.adminOverrideReason);
        if (existing.assignedInspectorRole === 'admin_exception') setIsAdminSelfAssigned(true);
      }
    }
  }, [selectedJobId]);

  // Available Inspectors Mock Pool
  const candidateInspectors = [
    {
      id: 'user_qc_001',
      name: 'Vikram Salunkhe',
      phone: '+91 98230 44556',
      role: 'qc_inspector',
      experienceYears: 8,
      certifications: ['Government Lift Inspector License', 'QC Certified', 'A1 Grade Technician', 'Electrical Auditor'],
      assignedJobsToday: 1,
      availabilityStatus: 'Available',
      isOriginalInstaller: false
    },
    {
      id: 'user_qc_002',
      name: 'Prakash Deshmukh',
      phone: '+91 98231 99887',
      role: 'senior_lead_auditor',
      experienceYears: 12,
      certifications: ['IS 14665 Lead Auditor', 'QC Certified', 'Safety Auditor', 'Hydraulic & Traction Specialist'],
      assignedJobsToday: 0,
      availabilityStatus: 'Available',
      isOriginalInstaller: false
    },
    {
      id: 'tech_001',
      name: 'Ramesh Patil (Lead Tech)',
      phone: '+91 98220 11223',
      role: 'technician',
      experienceYears: 6,
      certifications: ['QC Certified', 'Senior Installation Lead'],
      assignedJobsToday: 2,
      availabilityStatus: 'Onsite Busy',
      isOriginalInstaller: true // Conflict of independence!
    }
  ];

  const selectedInspector = candidateInspectors.find(c => c.id === selectedInspectorId);
  const isConflictOfIndependence = selectedInspector?.isOriginalInstaller ?? false;

  // Readiness Calculations
  const sopCompleted = sopSteps.length > 0 && sopSteps.every(s => s.status === 'completed' || s.status === 'na_confirmed');
  const safetyCompleted = safetyItems.length > 0 && safetyItems.every(s => s.status === 'passed');
  const isReadinessPassed = sopCompleted && safetyCompleted;

  // Auto-save draft helper
  const handleAutoSaveDraft = () => {
    setDraftSavedToast(true);
    setTimeout(() => setDraftSavedToast(false), 2000);
  };

  const handleConfirmAssignment = () => {
    if (!activeJob) return;

    const assignmentRecord: QcInspectorAssignmentRecord = {
      id: `qc_assign_${activeJob.id}_${Date.now()}`,
      jobId: activeJob.id,
      assignedInspectorId: isAdminSelfAssigned ? user.id : selectedInspectorId,
      assignedInspectorName: isAdminSelfAssigned ? `${user.name} (Admin Exception)` : (selectedInspector?.name || 'QC Inspector'),
      assignedInspectorPhone: isAdminSelfAssigned ? user.phone : (selectedInspector?.phone || ''),
      assignedInspectorRole: isAdminSelfAssigned ? 'admin_exception' : 'qc_inspector',
      qcScheduledDate: scheduledDate,
      qcScheduledTimeSlot: scheduledSlot,
      assignmentStatus: 'scheduled',
      eligibilityCheckPassed: isReadinessPassed,
      matchingSkillTags: selectedInspector?.certifications || ['Admin Authority'],
      conflictOfIndependenceFlag: isConflictOfIndependence && !isAdminSelfAssigned,
      conflictDetails: isConflictOfIndependence ? 'Inspector was Lead Technician on original installation.' : undefined,
      adminOverrideReason: adminOverrideReason ? adminOverrideReason : (isAdminSelfAssigned ? 'Admin self-assigned as QC inspector due to field scale exception.' : undefined),
      customerPreferredTiming,
      customerConfirmedSlot,
      autoNotificationSentAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST',
      assignedAt: new Date().toISOString()
    };

    DbManager.saveQcAssignment(assignmentRecord);
    setNotificationSent(true);
    setShowSuccessModal(true);

    // Phase 18: bridge into the real canonical InstallationJob's
    // completion + QC request (Phase 09's hard gate — a real check-in
    // and captured evidence — is enforced by the functions this walks
    // through, not bypassed), in addition to the DbManager write above —
    // see legacyCommercialBridge.ts.
    bridgeInstallationProgress(
      { id: user.id, role: user.role, isDemo: user.isDemo, authMethod: user.authMethod },
      activeJob.id,
      'qc_requested',
      { inspectorId: assignmentRecord.assignedInspectorId },
    ).then(result => {
      if (!result.bridged) {
        console.warn(`[Phase 18 bridge] QC assignment for job ${activeJob.id} not mirrored to canonical model: ${result.reason}`);
      }
    });
  };

  return (
    <div className="min-h-screen bg-alabaster pb-28 text-charcoal">
      {/* Top Header */}
      <div className="bg-white border-b border-[rgba(184,135,61,0.2)] sticky top-0 z-30 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <button 
                onClick={onBack}
                className="p-2 rounded-xl hover:bg-alabaster transition-colors border border-[rgba(184,135,61,0.15)] text-charcoal"
              >
                <ChevronLeft className="w-5 h-5 text-antiquegold" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-royalemerald" />
                <h1 className="font-serif text-lg font-bold text-charcoal">QC Inspector Assignment</h1>
              </div>
              <p className="text-xs text-warmgray">Module 14: Quality Check & Handover • Admin Governance</p>
            </div>
          </div>

          {draftSavedToast && (
            <span className="text-xs bg-royalemerald/10 text-royalemerald px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Draft Auto-Saved
            </span>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-4 space-y-5">
        {/* Job Selection Dropdown */}
        <Card className="p-4 space-y-3">
          <label className="block text-xs font-semibold text-warmgray uppercase tracking-wider">
            Select Active Elevator Installation Job
          </label>
          <select
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            className="w-full bg-alabaster border border-[rgba(184,135,61,0.3)] rounded-xl px-3 py-2.5 text-sm text-charcoal font-medium focus:outline-none focus:ring-2 focus:ring-antiquegold"
          >
            {jobList.map(j => (
              <option key={j.id} value={j.id}>
                {j.elevatorSpec.buildingName} ({j.id}) — {j.elevatorSpec.driveType.toUpperCase()}
              </option>
            ))}
          </select>

          {activeJob && (
            <div className="p-3 bg-alabaster rounded-xl border border-[rgba(184,135,61,0.15)] flex flex-wrap justify-between items-center text-xs text-charcoal gap-2">
              <div className="flex items-center gap-1.5 font-medium">
                <Building className="w-4 h-4 text-antiquegold" />
                <span>{activeJob.elevatorSpec.buildingName} ({activeJob.elevatorSpec.floorsCount} Floors)</span>
              </div>
              <div className="flex items-center gap-1 text-warmgray">
                <MapPin className="w-3.5 h-3.5 text-royalemerald" />
                <span>{activeJob.elevatorSpec.city}</span>
              </div>
            </div>
          )}
        </Card>

        {/* Gatekeeper Checklists Readiness Banner */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[rgba(184,135,61,0.15)] pb-2.5">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-antiquegold" />
              <h3 className="font-serif text-sm font-bold text-charcoal">Pre-Assignment SOP Readiness Check</h3>
            </div>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
              isReadinessPassed ? 'bg-royalemerald/10 text-royalemerald border border-royalemerald/20' : 'bg-warning/10 text-warning border border-warning/20'
            }`}>
              {isReadinessPassed ? 'Ready for QC Assignment' : 'Incomplete Pre-requisites'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {/* Installation SOP Checklist Status */}
            <div className={`p-3 rounded-xl border flex items-center justify-between ${
              sopCompleted ? 'bg-royalemerald/5 border-royalemerald/20' : 'bg-warning/5 border-warning/20'
            }`}>
              <div className="space-y-0.5">
                <p className="font-bold text-charcoal">1. Installation SOP Checklist</p>
                <p className="text-warmgray">All mechanical & wiring steps verified</p>
              </div>
              {sopCompleted ? (
                <CheckCircle2 className="w-5 h-5 text-royalemerald shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
              )}
            </div>

            {/* Safety Compliance Checklist Status */}
            <div className={`p-3 rounded-xl border flex items-center justify-between ${
              safetyCompleted ? 'bg-royalemerald/5 border-royalemerald/20' : 'bg-warning/5 border-warning/20'
            }`}>
              <div className="space-y-0.5">
                <p className="font-bold text-charcoal">2. Safety Compliance Checklist</p>
                <p className="text-warmgray">Governor, ARD & brakes passed</p>
              </div>
              {safetyCompleted ? (
                <CheckCircle2 className="w-5 h-5 text-royalemerald shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
              )}
            </div>
          </div>

          {!isReadinessPassed && (
            <div className="p-3 bg-error/10 border border-error/20 rounded-xl text-xs text-error flex gap-2">
              <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Workflow Rule Enforced</p>
                <p className="text-error/90">A job cannot be assigned a QC inspector until both Installation SOP and Safety Compliance checklists are marked complete on file.</p>
              </div>
            </div>
          )}
        </Card>

        {/* Section 1: Inspector Role & Qualification Selection */}
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-antiquegold" />
              <h3 className="font-serif text-sm font-bold text-charcoal">Qualified Inspector Selection</h3>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={isAdminSelfAssigned}
                onChange={(e) => {
                  setIsAdminSelfAssigned(e.target.checked);
                  handleAutoSaveDraft();
                }}
                className="rounded text-antiquegold focus:ring-antiquegold"
              />
              <span className="text-warmgray">Admin Self-Assignment Exception</span>
            </label>
          </div>

          {isAdminSelfAssigned ? (
            <div className="p-3.5 bg-antiquegold/10 border border-antiquegold/30 rounded-xl space-y-2 text-xs">
              <div className="flex items-center gap-2 font-bold text-charcoal">
                <Shield className="w-4 h-4 text-antiquegold" />
                <span>Admin Governance Exception Enabled</span>
              </div>
              <p className="text-warmgray leading-relaxed">
                You are explicitly delegating or performing the QC sign-off role as Admin ({user.name}). This documented exception prevents small-business workflow stalls when no dedicated external inspector is on duty.
              </p>
              <input
                type="text"
                placeholder="Reason for Admin QC self-assignment (e.g., Small-scale team deployment)"
                value={adminOverrideReason}
                onChange={(e) => {
                  setAdminOverrideReason(e.target.value);
                  handleAutoSaveDraft();
                }}
                className="w-full bg-white border border-[rgba(184,135,61,0.25)] rounded-lg p-2 text-xs focus:outline-none focus:ring-1 focus:ring-antiquegold"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-warmgray">
                Selecting an independent inspector (distinct from installing technician) ensures genuine regulatory compliance prediction.
              </p>

              <div className="space-y-2.5">
                {candidateInspectors.map((inspector) => {
                  const isSelected = selectedInspectorId === inspector.id;
                  const isInstallerConflict = inspector.isOriginalInstaller;

                  return (
                    <div
                      key={inspector.id}
                      onClick={() => {
                        setSelectedInspectorId(inspector.id);
                        handleAutoSaveDraft();
                      }}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected 
                          ? 'bg-white border-antiquegold shadow-sm ring-1 ring-antiquegold/50' 
                          : 'bg-alabaster border-[rgba(184,135,61,0.15)] hover:border-antiquegold/30'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-charcoal">{inspector.name}</span>
                            <span className="text-xs px-2 py-0.5 rounded bg-alabaster border border-[rgba(184,135,61,0.2)] text-warmgray">
                              {inspector.experienceYears} Yrs Exp
                            </span>
                            {isInstallerConflict && (
                              <span className="text-xs px-2 py-0.5 rounded bg-warning/10 text-warning font-semibold border border-warning/20">
                                Conflict Risk
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-warmgray mt-0.5">{inspector.phone}</p>
                        </div>
                        <input
                          type="radio"
                          name="inspector_selection"
                          checked={isSelected}
                          onChange={() => setSelectedInspectorId(inspector.id)}
                          className="text-antiquegold focus:ring-antiquegold mt-1"
                        />
                      </div>

                      {/* Certification Skill Tags */}
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {inspector.certifications.map((tag, idx) => (
                          <span 
                            key={idx}
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 bg-royalemerald/5 border border-royalemerald/15 text-royalemerald rounded-full"
                          >
                            <Award className="w-3 h-3 text-royalemerald" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Conflict of Independence Warning Banner */}
              {isConflictOfIndependence && (
                <div className="p-3 bg-warning/10 border border-warning/30 rounded-xl text-xs text-warning space-y-1.5">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="w-4 h-4 text-warning" />
                    <span>Independence Conflict Warning</span>
                  </div>
                  <p className="text-charcoal/80 leading-relaxed">
                    Ramesh Patil was assigned as Lead Technician during the original installation. Assigning the same technician to perform QC compromises audit independence.
                  </p>
                  <div className="pt-1">
                    <input
                      type="text"
                      placeholder="Document justification if proceeding with same technician (e.g. Mandatory peer re-check)"
                      value={adminOverrideReason}
                      onChange={(e) => {
                        setAdminOverrideReason(e.target.value);
                        handleAutoSaveDraft();
                      }}
                      className="w-full bg-white border border-warning/30 rounded-lg p-2 text-xs focus:outline-none focus:ring-1 focus:ring-warning"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Section 2: Scheduling Coordination with Customer */}
        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-antiquegold" />
            <h3 className="font-serif text-sm font-bold text-charcoal">QC Visit Scheduling Coordination</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-xs font-medium text-warmgray mb-1">Scheduled Visit Date</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => {
                  setScheduledDate(e.target.value);
                  handleAutoSaveDraft();
                }}
                className="w-full bg-alabaster border border-[rgba(184,135,61,0.25)] rounded-xl p-2.5 text-xs text-charcoal focus:outline-none focus:ring-1 focus:ring-antiquegold font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-warmgray mb-1">Inspector Time Slot</label>
              <select
                value={scheduledSlot}
                onChange={(e) => {
                  setScheduledSlot(e.target.value);
                  handleAutoSaveDraft();
                }}
                className="w-full bg-alabaster border border-[rgba(184,135,61,0.25)] rounded-xl p-2.5 text-xs text-charcoal focus:outline-none focus:ring-1 focus:ring-antiquegold font-medium"
              >
                <option value="09:00 AM - 12:00 PM">09:00 AM - 12:00 PM (Morning)</option>
                <option value="10:00 AM - 01:00 PM">10:00 AM - 01:00 PM (Mid-Day)</option>
                <option value="02:00 PM - 05:00 PM">02:00 PM - 05:00 PM (Afternoon)</option>
              </select>
            </div>
          </div>

          <div className="p-3 bg-alabaster rounded-xl border border-[rgba(184,135,61,0.15)] space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-charcoal">Customer Preferred Timing</span>
              <span className="text-warmgray font-mono">{customerPreferredTiming}</span>
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={customerConfirmedSlot}
                onChange={(e) => {
                  setCustomerConfirmedSlot(e.target.checked);
                  handleAutoSaveDraft();
                }}
                className="rounded text-antiquegold focus:ring-antiquegold"
              />
              <span className="text-charcoal font-medium">Customer confirmed availability over WhatsApp / Call</span>
            </label>
          </div>
        </Card>

        {/* Section 3: Evidence Context Access & Auto-Notification Preview */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-antiquegold" />
            <h3 className="font-serif text-sm font-bold text-charcoal">Inspector Context & Evidence Package</h3>
          </div>

          <p className="text-xs text-warmgray leading-relaxed">
            The assigned inspector automatically receives full read access to all installation evidence, shaft photos, and safety logs on record so QC does not start from zero context.
          </p>

          <div className="p-3 bg-royalemerald/5 border border-royalemerald/20 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between font-bold text-royalemerald">
              <div className="flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-royalemerald" />
                <span>Auto-Notification Package Ready</span>
              </div>
              <span className="text-[10px] bg-royalemerald/10 px-2 py-0.5 rounded uppercase tracking-wider">SMS / WhatsApp</span>
            </div>
            <p className="text-charcoal/80 text-[11px] font-mono leading-normal bg-white/80 p-2.5 rounded-lg border border-royalemerald/10">
              "AIEC QC Alert: Hi {selectedInspector?.name || 'Inspector'}, you have been assigned QC Audit for {activeJob?.elevatorSpec.buildingName}. Scheduled Date: {scheduledDate} ({scheduledSlot}). Installation & Safety Evidence attached."
            </p>
          </div>
        </Card>
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[rgba(184,135,61,0.2)] p-4 z-40 shadow-lg">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-charcoal">
              {isAdminSelfAssigned ? 'Admin Self-Assignment' : (selectedInspector?.name || 'Inspector Selected')}
            </p>
            <p className="text-[11px] text-warmgray font-mono">{scheduledDate} ({scheduledSlot})</p>
          </div>

          <div className="flex items-center gap-2">
            {onNavigateToMechanicalQc && (
              <Button
                variant="secondary"
                onClick={() => onNavigateToMechanicalQc(activeJob?.id || 'job_2026_101')}
                className="text-xs px-3 py-2.5"
              >
                Go to Mechanical QC
              </Button>
            )}

            <Button
              variant="primary"
              disabled={!isReadinessPassed && !isAdminSelfAssigned}
              onClick={handleConfirmAssignment}
              className="flex items-center gap-2 px-5 py-2.5 font-bold text-xs"
            >
              <ShieldCheck className="w-4 h-4" />
              Confirm & Assign QC Inspector
            </Button>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      <AnimatePresence>
        {showSuccessModal && (
          <div className="fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 border border-antiquegold shadow-2xl text-center"
            >
              <div className="w-14 h-14 bg-royalemerald/10 border border-royalemerald/20 rounded-full flex items-center justify-center mx-auto text-royalemerald">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h3 className="font-serif text-lg font-bold text-charcoal">QC Inspector Successfully Assigned!</h3>
                <p className="text-xs text-warmgray">
                  Assignment notification dispatched with full job context & evidence access link.
                </p>
              </div>

              <div className="p-3 bg-alabaster rounded-xl border border-[rgba(184,135,61,0.15)] text-left text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-warmgray">Job:</span>
                  <span className="font-bold text-charcoal">{activeJob?.elevatorSpec.buildingName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-warmgray">Assigned Inspector:</span>
                  <span className="font-bold text-royalemerald">
                    {isAdminSelfAssigned ? `${user.name} (Admin)` : selectedInspector?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-warmgray">Scheduled Visit:</span>
                  <span className="font-mono text-charcoal">{scheduledDate} ({scheduledSlot})</span>
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                {onNavigateToMechanicalQc && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      setShowSuccessModal(false);
                      onNavigateToMechanicalQc(activeJob?.id || 'job_2026_101');
                    }}
                    className="w-full flex items-center justify-center gap-2"
                  >
                    Proceed to Mechanical Quality Checklist
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => setShowSuccessModal(false)}
                  className="w-full text-xs"
                >
                  Close & Return to Dashboard
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
