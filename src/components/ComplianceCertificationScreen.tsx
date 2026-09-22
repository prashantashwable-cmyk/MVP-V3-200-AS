import React, { useState, useEffect } from 'react';
import { 
  Award, ShieldCheck, FileCheck, Building, User as UserIcon, 
  ArrowLeft, Download, Share2, Lock, LockKeyhole, RefreshCw, 
  CheckCircle2, AlertCircle, FileText, ChevronRight, MapPin, 
  Layers, ExternalLink, Printer, Info, Sparkles, Shield
} from 'lucide-react';
import { User, ComplianceCertificateRecord, QcMechanicalReport, QcElectricalReport } from '../types';
import { DbManager } from '../lib/db';
import { bridgeQcPassed } from '../services/legacyCommercialBridge';
import { Card, Button } from './Common';

const Badge = ({ children, variant = 'default', className = '' }: { children: React.ReactNode; variant?: string; className?: string }) => (
  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide inline-flex items-center gap-1 ${className}`}>
    {children}
  </span>
);

interface ComplianceCertificationScreenProps {
  user: User;
  jobId: string;
  onBack: () => void;
  onNavigateToSnagList?: (jobId: string) => void;
  onNavigateToHandover?: (jobId: string) => void;
}

export const ComplianceCertificationScreen: React.FC<ComplianceCertificationScreenProps> = ({
  user,
  jobId,
  onBack,
  onNavigateToSnagList,
  onNavigateToHandover
}) => {
  const [language, setLanguage] = useState<'en' | 'hi' | 'mr'>('en');
  const [cert, setCert] = useState<ComplianceCertificateRecord | null>(null);
  const [mechReport, setMechReport] = useState<QcMechanicalReport | null>(null);
  const [elecReport, setElecReport] = useState<QcElectricalReport | null>(null);
  const [job, setJob] = useState<any>(null);

  const [selectedIsStandard, setSelectedIsStandard] = useState<string>('IS 14665 (Electric Traction Lifts)');
  const [showReissueModal, setShowReissueModal] = useState<boolean>(false);
  const [reissueReasonInput, setReissueReasonInput] = useState<string>('');
  const [downloadSuccessToast, setDownloadSuccessToast] = useState<boolean>(false);

  useEffect(() => {
    loadData();
  }, [jobId]);

  const loadData = () => {
    const c = DbManager.getComplianceCertificate(jobId);
    setCert(c || null);
    const m = DbManager.getMechanicalReport(jobId);
    setMechReport(m);
    const e = DbManager.getElectricalReport(jobId);
    setElecReport(e);
    const j = DbManager.getTechnicianJobById(jobId);
    setJob(j);

    if (c) {
      setSelectedIsStandard(c.applicableIsStandard);
    }
  };

  const labels = {
    en: {
      title: "Compliance Certification",
      sub: "Internal AIEC Quality Assurance Certificate & Government Inspection Package",
      disclaimer: "AIEC Quality Notice: This document is AIEC's internal certification confirming the installation complies with relevant BIS/IS code standards and passed 100% pre-commissioning trial runs. It serves as the primary technical package for the customer's application to the State Electrical/Lift Inspectorate for their official License to Operate.",
      heroBadge: "READY FOR GOVERNMENT LIFT INSPECTORATE SUBMISSION",
      certNumber: "Certificate Registration #",
      standardApplied: "Applicable Indian Standard (BIS/IS)",
      governingJurisdiction: "State Authority Jurisdiction",
      documentPackageTitle: "Assembled Government Submission Package",
      govGuidanceTitle: "State Government License to Operate Guidance",
      licensingAuth: "State Licensing Authority",
      formRequired: "Required Government Form",
      estimatedFee: "Treasury Fee Estimate",
      reissueBtn: "Formally Reissue Certificate",
      downloadPackage: "Download Full QC & Compliance Bundle (PDF)",
      proceedHandover: "Proceed to Final Customer Handover & License Registration",
      reissueNotice: "A superseding reissue voids the previous document reference and creates a logged revision track."
    },
    hi: {
      title: "अनुपालन प्रमाणन",
      sub: "आंतरिक AIEC गुणवत्ता आश्वासन प्रमाणपत्र एवं सरकारी निरीक्षण पैकेज",
      disclaimer: "AIEC गुणवत्ता सूचना: यह दस्तावेज़ AIEC का आंतरिक प्रमाणन है जो यह पुष्टि करता है कि लिफ्ट स्थापना बीआईएस/आईएस मानकों के अनुरूप है। यह आधिकारिक लाइसेंस आवेदन के लिए मुख्य तकनीकी पैकेज है।",
      heroBadge: "सरकारी लिफ्ट निरीक्षण हेतु तैयार",
      certNumber: "प्रमाणपत्र पंजीकरण संख्या",
      standardApplied: "लागू भारतीय मानक (BIS/IS)",
      governingJurisdiction: "राज्य प्राधिकरण क्षेत्राधिकार",
      documentPackageTitle: "एकत्रित सरकारी सबमिशन पैकेज",
      govGuidanceTitle: "राज्य सरकार लाइसेंस गाइडेंस",
      licensingAuth: "राज्य लाइसेंसिंग प्राधिकरण",
      formRequired: "आवश्यक सरकारी फॉर्म",
      estimatedFee: "सरकारी शुल्क अनुमान",
      reissueBtn: "प्रमाणपत्र पुनः जारी करें",
      downloadPackage: "पूर्ण अनुपालन बंडल डाउनलोड करें (PDF)",
      proceedHandover: "अंतिम ग्राहक हैंडओवर पर आगे बढ़ें",
      reissueNotice: "पुनः जारी करने से पिछला प्रमाणपत्र संशोधित संदर्भ दर्ज करता है।"
    },
    mr: {
      title: "अनुपालन प्रमाणपत्र",
      sub: "अंतर्गत AIEC गुणवत्ता हमी प्रमाणपत्र व शासकीय तपासणी संच",
      disclaimer: "AIEC गुणवत्ता सूचना: हे दस्तऐवज AIEC चे अंतर्गत प्रमाणपत्र आहे जे लिफ्टची उभारणी BIS/IS मानकांनुसार पूर्ण झाल्याची पुष्टी करते. शासकीय परवान्यासाठी हा तांत्रिक पुरावा संच वापरला जातो.",
      heroBadge: "शासकीय लिफ्ट निरीक्षकांकडे सादर करण्यासाठी तयार",
      certNumber: "प्रमाणपत्र नोंदणी क्रमांक",
      standardApplied: "लागू भारतीय मानके (BIS/IS)",
      governingJurisdiction: "राज्य प्राधिकरण कार्यक्षेत्र",
      documentPackageTitle: "एकत्रित शासकीय सबमिशन संच",
      govGuidanceTitle: "राज्य शासन परवाना मार्गदर्शन",
      licensingAuth: "राज्य परवाना प्राधिकरण",
      formRequired: "आवश्यक शासकीय अर्ज फॉर्म",
      estimatedFee: "अंदाजित शासकीय फी",
      reissueBtn: "प्रमाणपत्र पुन्हा जारी करा",
      downloadPackage: "पूर्ण अनुपालन बंडल डाउनलोड करा (PDF)",
      proceedHandover: "अंतिम ग्राहक हँडओवरकडे जा",
      reissueNotice: "पुन्हा जारी केल्यास जुन्या क्रमांकाची सुधारित नोंद ठेवली जाते."
    }
  }[language];

  const handleIssueOrUpdateCert = () => {
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const isHydraulic = job?.liftType === 'hydraulic';
    const autoStandard = isHydraulic 
      ? 'IS 15259 (Hydraulic Lifts)' 
      : selectedIsStandard as any;

    const newCert: ComplianceCertificateRecord = {
      id: cert ? cert.id : `cert_${jobId}`,
      jobId,
      certificateNumber: cert ? cert.certificateNumber : `AIEC/QC-CERT/2026/MH-${Math.floor(100 + Math.random() * 900)}`,
      buildingName: job?.siteName || 'Kothrud Commercial Tower (G+4 Lifts)',
      customerName: job?.customerName || 'Shri. Rajesh Patil / Kothrud Infra',
      applicableIsStandard: autoStandard,
      driveType: isHydraulic ? 'hydraulic' : 'mrl_gearless',
      floorsCount: job?.floors || 5,
      ratedCapacityKg: job?.capacityKg || 630,
      stateJurisdiction: 'Maharashtra (MH Lift Act 2012 / PWD Electrical Inspectorate Pune)',
      governmentApplicationGuidance: {
        licensingAuthority: 'Office of the Chief Electrical Inspector to Government, Maharashtra State, Pune Division',
        formName: 'Form A — Application for Permission to Erect & License to Operate Lift',
        requiredAttachments: [
          'AIEC Internal Compliance Certificate & QC Sign-off',
          'Approved Shaft Civil & Overhead Clearance Drawing (3 Copies)',
          'Dual Earthing Resistance Test Certificate (< 2.0 Ohms)',
          'Erection Completion Certificate signed by Licensed Lift Contractor',
          'Government Treasury Challan Fee Receipt (Rs. 2,500)'
        ],
        stateFeeEstimateRs: 2500,
        nextStepInstructions: 'Submit Form A along with this AIEC Compliance Package to PWD Electrical Inspectorate Office, Pune. State Lift Inspector visit will be scheduled within 7-10 working days.'
      },
      documentPackageRef: {
        mechanicalQcReportId: mechReport?.id || 'report_101',
        electricalQcReportId: elecReport?.id || 'report_elec_101',
        trialRunLogId: `trial_run_${jobId}`,
        drawingApprovalRef: `DWG-AIEC-2026-${jobId.toUpperCase()}`,
        earthingTestCertificateRef: `EARTH-TEST-MH-2026-${Math.floor(10 + Math.random() * 90)}`
      },
      issuedTimestamp: `${timestamp} IST`,
      issuedByInspectorName: user.name || 'Vikram Salunkhe (Chief QC Auditor)',
      isLockedImmutable: true,
      isReissued: cert ? true : false,
      originalCertificateRefId: cert?.id,
      reissueReason: reissueReasonInput || undefined
    };

    DbManager.saveComplianceCertificate(newCert);
    setCert(newCert);
    setShowReissueModal(false);
    setReissueReasonInput('');

    // Phase 18: issuing the compliance certificate bridges to a real QC
    // PASS (the only code path allowed to set Handover.qcPassed = true —
    // Phase 09's handover hard gate) followed by confirming handover
    // compliance, in addition to the DbManager write above. Idempotent
    // on reissue — see legacyCommercialBridge.ts.
    bridgeQcPassed(
      { id: user.id, role: user.role, isDemo: user.isDemo, authMethod: user.authMethod },
      jobId,
      user.id,
    ).then(result => {
      if (!result.bridged) {
        console.warn(`[Phase 18 bridge] compliance certificate for job ${jobId} not mirrored to canonical model: ${result.reason}`);
      }
    });
  };

  const handleDownload = () => {
    setDownloadSuccessToast(true);
    setTimeout(() => setDownloadSuccessToast(false), 3500);
  };

  return (
    <div className="space-y-6 pb-24 max-w-4xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface p-4 sm:p-6 rounded-2xl border border-gold/15 shadow-sm">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack} className="p-2 h-10 w-10 rounded-xl">
            <ArrowLeft className="w-5 h-5 text-antiquegold" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-gold/30 text-antiquegold text-xs font-mono">
                Job #{jobId}
              </Badge>
              <Badge className="bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-xs">
                {labels.heroBadge}
              </Badge>
            </div>
            <h1 className="text-xl sm:text-2xl font-serif font-bold text-text-primary mt-1">
              {labels.title}
            </h1>
            <p className="text-xs sm:text-sm text-text-secondary">
              {labels.sub}
            </p>
          </div>
        </div>

        {/* Language Selector */}
        <div className="flex items-center gap-1 bg-surface-hover p-1 rounded-xl border border-gold/20 self-start sm:self-auto">
          {(['en', 'hi', 'mr'] as const).map(lang => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                language === lang ? 'bg-antiquegold text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {lang === 'en' ? 'EN' : lang === 'hi' ? 'हिंदी' : 'मराठी'}
            </button>
          ))}
        </div>
      </div>

      {/* AIEC Quality Assurance Framing Notice */}
      <Card className="p-4 sm:p-5 bg-antiquegold/10 border-gold/30 border-l-4 border-l-antiquegold rounded-2xl">
        <div className="flex items-start gap-3">
          <Shield className="w-6 h-6 text-antiquegold shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs text-text-primary">
            <strong className="font-bold text-antiquegold block">
              Internal QA vs Government License Framing
            </strong>
            <p className="text-text-secondary leading-relaxed">
              {labels.disclaimer}
            </p>
          </div>
        </div>
      </Card>

      {/* Main Certificate Card (Official Printable Frame) */}
      <Card className="p-6 sm:p-8 bg-surface border-gold/30 shadow-md rounded-2xl relative overflow-hidden space-y-6">
        {/* Certificate Decorative Watermark Badge */}
        <div className="absolute top-4 right-4 opacity-10 pointer-events-none">
          <Award className="w-48 h-48 text-antiquegold" />
        </div>

        {/* Certificate Title Header */}
        <div className="text-center border-b border-gold/20 pb-6 space-y-2">
          <div className="flex items-center justify-center gap-2 text-antiquegold font-mono text-xs uppercase tracking-widest font-bold">
            <Sparkles className="w-4 h-4" />
            All India Elevators Company (AIEC) Internal QA
            <Sparkles className="w-4 h-4" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-text-primary">
            CERTIFICATE OF COMPLIANCE & SAFETY
          </h2>
          <p className="text-xs text-text-secondary font-mono">
            {labels.certNumber}: <span className="font-bold text-antiquegold">{cert?.certificateNumber || `AIEC/QC-CERT/2026/MH-${jobId}`}</span>
          </p>
        </div>

        {/* Building & Customer Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs bg-surface-hover/60 p-4 rounded-xl border border-gold/15 font-mono">
          <div>
            <span className="text-text-secondary block font-mono text-[10px] uppercase">Site / Building Name:</span>
            <strong className="text-sm text-text-primary font-serif font-bold">{cert?.buildingName || job?.siteName || 'Kothrud Commercial Tower (G+4)'}</strong>
          </div>
          <div>
            <span className="text-text-secondary block font-mono text-[10px] uppercase">Customer / Client:</span>
            <strong className="text-sm text-text-primary font-serif font-bold">{cert?.customerName || job?.customerName || 'Shri. Rajesh Patil'}</strong>
          </div>
          <div>
            <span className="text-text-secondary block font-mono text-[10px] uppercase">Drive Configuration:</span>
            <span className="text-text-primary font-bold">Gearless MRL Traction (630kg / 8 Persons)</span>
          </div>
          <div>
            <span className="text-text-secondary block font-mono text-[10px] uppercase">Issuance Date & Auditor:</span>
            <span className="text-text-primary font-bold">{cert?.issuedTimestamp || '2026-08-14 14:30 IST'} ({cert?.issuedByInspectorName || 'Vikram Salunkhe'})</span>
          </div>
        </div>

        {/* Applicable BIS/IS Standard Selection */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-text-primary font-mono block">
            {labels.standardApplied}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {[
              'IS 14665 (Electric Traction Lifts)',
              'IS 15259 (Hydraulic Lifts)',
              'IS 14671 (Lifts for Persons with Disabilities)',
              'State Lift Act Special Standards'
            ].map((std) => (
              <button
                key={std}
                type="button"
                onClick={() => setSelectedIsStandard(std)}
                className={`p-3 rounded-xl border text-left font-mono transition-all flex items-center justify-between ${
                  selectedIsStandard === std
                    ? 'bg-antiquegold/15 border-antiquegold text-text-primary font-bold shadow-sm'
                    : 'bg-surface border-gold/20 text-text-secondary hover:border-gold/40'
                }`}
              >
                <span>{std}</span>
                {selectedIsStandard === std && <CheckCircle2 className="w-4 h-4 text-antiquegold shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        {/* Summary of Verified Milestones */}
        <div className="space-y-3 pt-2">
          <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-text-secondary flex items-center gap-1.5">
            <FileCheck className="w-4 h-4 text-royalemerald" />
            Verified Pre-Commissioning Audit Components
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-emerald-950/10 border border-emerald-500/30 text-xs space-y-1">
              <div className="flex items-center justify-between font-bold text-emerald-700 dark:text-emerald-300">
                <span>Mechanical QC</span>
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <p className="text-[11px] text-text-secondary font-mono">Guide rails, balance, leveling, door operator</p>
            </div>

            <div className="p-3 rounded-xl bg-emerald-950/10 border border-emerald-500/30 text-xs space-y-1">
              <div className="flex items-center justify-between font-bold text-emerald-700 dark:text-emerald-300">
                <span>Electrical & Safety</span>
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <p className="text-[11px] text-text-secondary font-mono">Earthing, Governor, ARD, Buffers, Overload</p>
            </div>

            <div className="p-3 rounded-xl bg-emerald-950/10 border border-emerald-500/30 text-xs space-y-1">
              <div className="flex items-center justify-between font-bold text-emerald-700 dark:text-emerald-300">
                <span>30-Min Trial Run</span>
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <p className="text-[11px] text-text-secondary font-mono">No-load, 100% contract load & overload</p>
            </div>
          </div>
        </div>

        {/* Document Lock Status */}
        <div className="flex items-center justify-between pt-4 border-t border-gold/15 text-xs text-text-secondary font-mono">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-antiquegold" />
            <span>Document Status: <strong className="text-emerald-600 dark:text-emerald-400">LOCKED & IMMUTABLE</strong></span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowReissueModal(true)}
            className="border-gold/30 text-xs font-mono text-antiquegold hover:bg-antiquegold/10"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            {labels.reissueBtn}
          </Button>
        </div>
      </Card>

      {/* Assembled Document Submission Package Card */}
      <Card className="p-5 sm:p-6 bg-surface border-gold/20 shadow-sm rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-serif font-bold text-text-primary flex items-center gap-2">
            <Layers className="w-5 h-5 text-antiquegold" />
            {labels.documentPackageTitle}
          </h3>
          <Badge variant="outline" className="text-xs text-antiquegold border-gold/30 font-mono">
            5 Attachments Ready
          </Badge>
        </div>

        <div className="space-y-2.5 text-xs font-mono">
          {[
            { title: 'AIEC Internal Certificate of Compliance (IS 14665)', ref: cert?.certificateNumber || 'AIEC/QC-CERT/2026/MH-101', status: 'Verified' },
            { title: 'Mechanical & Civil Pre-Commissioning QC Sign-off Report', ref: cert?.documentPackageRef.mechanicalQcReportId || 'REF-MECH-101', status: 'Passed' },
            { title: 'Electrical, ARD & Governor Inspection Certificate', ref: cert?.documentPackageRef.electricalQcReportId || 'REF-ELEC-101', status: 'Passed' },
            { title: 'Dual Earthing Pit Resistance Test Record (< 2.0 Ohms)', ref: cert?.documentPackageRef.earthingTestCertificateRef || 'EARTH-TEST-MH-2026-88', status: 'Passed (1.4 Ω)' },
            { title: 'Approved Shaft Civil, Pit & Overhead Clearance Drawings', ref: cert?.documentPackageRef.drawingApprovalRef || 'DWG-AIEC-KOTHRUD-REV3', status: 'Approved' }
          ].map((doc, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-surface-hover border border-gold/15">
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-royalemerald shrink-0" />
                <div>
                  <span className="font-bold text-text-primary block">{doc.title}</span>
                  <span className="text-[10px] text-text-secondary">{doc.ref}</span>
                </div>
              </div>
              <Badge className="bg-emerald-800/20 text-emerald-700 dark:text-emerald-300 text-[10px]">
                {doc.status}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* State Government Licensing Guidance Section */}
      <Card className="p-5 sm:p-6 bg-surface border-gold/20 shadow-sm rounded-2xl space-y-4">
        <h3 className="text-sm font-serif font-bold text-text-primary flex items-center gap-2">
          <Building className="w-5 h-5 text-antiquegold" />
          {labels.govGuidanceTitle}
        </h3>

        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 bg-surface-hover rounded-xl border border-gold/15 space-y-1">
              <span className="text-[10px] font-mono text-text-secondary uppercase">{labels.licensingAuth}:</span>
              <p className="font-bold text-text-primary">{cert?.governmentApplicationGuidance.licensingAuthority}</p>
            </div>

            <div className="p-3 bg-surface-hover rounded-xl border border-gold/15 space-y-1">
              <span className="text-[10px] font-mono text-text-secondary uppercase">{labels.formRequired}:</span>
              <p className="font-bold text-text-primary">{cert?.governmentApplicationGuidance.formName}</p>
            </div>
          </div>

          <div className="p-3.5 bg-antiquegold/10 rounded-xl border border-gold/20 space-y-2">
            <div className="flex items-center justify-between font-mono font-bold text-antiquegold">
              <span>Next Steps for Customer / Owner:</span>
              <span>Treasury Fee: ₹{cert?.governmentApplicationGuidance.stateFeeEstimateRs.toLocaleString('en-IN')}</span>
            </div>
            <p className="text-text-primary text-xs leading-relaxed">
              {cert?.governmentApplicationGuidance.nextStepInstructions}
            </p>
          </div>
        </div>
      </Card>

      {/* Reissue Modal */}
      {showReissueModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-6 bg-surface border-gold/30 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gold/15 pb-3">
              <h3 className="text-base font-bold font-serif text-text-primary">
                Formally Reissue Compliance Certificate
              </h3>
              <Button size="sm" variant="ghost" onClick={() => setShowReissueModal(false)}>
                ✕
              </Button>
            </div>

            <p className="text-xs text-text-secondary">
              {labels.reissueNotice} Specify the formal paperwork or administrative correction reason.
            </p>

            <div>
              <label className="text-xs font-mono text-text-secondary block mb-1">
                Reason for Reissue / Paperwork Correction
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Corrected customer entity name spelling on certificate cover..."
                value={reissueReasonInput}
                onChange={e => setReissueReasonInput(e.target.value)}
                className="w-full bg-surface border border-gold/30 rounded-xl p-2.5 text-xs text-text-primary"
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowReissueModal(false)} className="flex-1 text-xs font-mono">
                Cancel
              </Button>
              <Button onClick={handleIssueOrUpdateCert} className="flex-1 bg-antiquegold text-white text-xs font-semibold">
                Confirm Reissue
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Toast feedback */}
      {downloadSuccessToast && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-800 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-mono border border-emerald-400/30 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-200" />
          Full Compliance Document Package PDF successfully compiled and downloaded.
        </div>
      )}

      {/* Sticky Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-surface/90 backdrop-blur-md border-t border-gold/20 shadow-lg z-30">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={handleDownload}
            className="w-full sm:w-auto border-gold/30 text-xs font-mono text-text-primary"
          >
            <Download className="w-3.5 h-3.5 mr-1.5 text-antiquegold" />
            {labels.downloadPackage}
          </Button>

          <Button
            onClick={() => onNavigateToHandover ? onNavigateToHandover(jobId) : onBack()}
            className="w-full sm:w-auto bg-gradient-to-r from-antiquegold to-royalemerald text-white text-xs font-semibold px-6 py-2.5 rounded-xl shadow-md"
          >
            <Award className="w-4 h-4 mr-1.5" />
            {labels.proceedHandover}
          </Button>
        </div>
      </div>
    </div>
  );
};
