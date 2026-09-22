import React, { useState, useEffect } from 'react';
import { User, TechnicianJob, InstallationSopStep, InstallationEvidenceItem } from '../types';
import { DbManager } from '../lib/db';
import { bridgeInstallationProgress } from '../services/legacyCommercialBridge';
import { 
  Camera, Video, ArrowLeft, Upload, CheckCircle2, AlertTriangle, 
  Trash2, RefreshCw, Layers, ShieldCheck, Eye, Plus, Sparkles, X, FileText
} from 'lucide-react';
import { Card, Button } from './Common';

interface PhotoVideoEvidenceCaptureScreenProps {
  user: User;
  jobId: string;
  initialStepId?: string;
  onBack: () => void;
}

export const PhotoVideoEvidenceCaptureScreen: React.FC<PhotoVideoEvidenceCaptureScreenProps> = ({
  user,
  jobId,
  initialStepId,
  onBack
}) => {
  const [job, setJob] = useState<TechnicianJob | null>(null);
  const [steps, setSteps] = useState<InstallationSopStep[]>([]);
  const [evidenceList, setEvidenceList] = useState<InstallationEvidenceItem[]>([]);
  const [selectedStepId, setSelectedStepId] = useState<string>(initialStepId || '');
  const [isLoading, setIsLoading] = useState(true);

  // Capture mode state
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureType, setCaptureType] = useState<'photo' | 'video'>('photo');
  const [captionInput, setCaptionInput] = useState('');
  const [isDefect, setIsDefect] = useState(false);
  const [defectNotesInput, setDefectNotesInput] = useState('');
  const [previewMediaUrl, setPreviewMediaUrl] = useState<string | null>(null);
  const [lightboxEvidence, setLightboxEvidence] = useState<InstallationEvidenceItem | null>(null);

  useEffect(() => {
    loadData();
  }, [jobId]);

  const loadData = () => {
    setIsLoading(true);
    setTimeout(() => {
      const foundJob = DbManager.getTechnicianJobById(jobId);
      const stepList = DbManager.getInstallationSopSteps(jobId);
      const evidence = DbManager.getInstallationEvidenceByJob(jobId);

      setJob(foundJob || null);
      setSteps(stepList);
      setEvidenceList(evidence);

      if (!selectedStepId && stepList.length > 0) {
        setSelectedStepId(stepList[0].id);
      }
      setIsLoading(false);
    }, 300);
  };

  const selectedStep = steps.find(s => s.id === selectedStepId);

  const samplePhotos = [
    'https://images.unsplash.com/photo-1541888946425-d0fbb186a5b3?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=800&q=80'
  ];

  const handleSimulateCapture = () => {
    // Pick random sample photo
    const randomUrl = samplePhotos[Math.floor(Math.random() * samplePhotos.length)];
    setPreviewMediaUrl(randomUrl);
    setIsCapturing(true);
  };

  const handleSaveEvidence = () => {
    if (!previewMediaUrl || !selectedStep) return;

    const newEvidence: InstallationEvidenceItem = {
      id: 'evid_' + Date.now(),
      jobId,
      sopStepId: selectedStep.id,
      sopStepTitle: selectedStep.title,
      evidenceType: captureType,
      mediaUrl: previewMediaUrl,
      captureTimestamp: new Date().toLocaleString('en-IN', { hour12: true }) + ' IST',
      caption: captionInput.trim() || `Verified ${captureType} proof for ${selectedStep.title}`,
      isDefectFlagged: isDefect,
      defectNotes: isDefect ? defectNotesInput.trim() : undefined,
      gpsLat: job?.latitude || 19.0473,
      gpsLng: job?.longitude || 73.0699,
      uploadStatus: 'uploaded'
    };

    DbManager.addInstallationEvidence(newEvidence);

    // Phase 18: bridge into the real canonical InstallationJob's
    // evidence-capture progression, in addition to the DbManager write
    // above — see legacyCommercialBridge.ts.
    bridgeInstallationProgress(
      { id: user.id, role: user.role, isDemo: user.isDemo, authMethod: user.authMethod },
      jobId,
      'evidence_captured',
      { evidenceCount: evidenceList.length + 1 },
    ).then(result => {
      if (!result.bridged) {
        console.warn(`[Phase 18 bridge] evidence capture for job ${jobId} not mirrored to canonical model: ${result.reason}`);
      }
    });

    setIsCapturing(false);
    setPreviewMediaUrl(null);
    setCaptionInput('');
    setIsDefect(false);
    setDefectNotesInput('');
    loadData();
  };

  if (isLoading || !job) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto animate-pulse">
        <div className="h-8 bg-[var(--color-border)] opacity-30 rounded w-1/3"></div>
        <div className="h-64 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl"></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto pb-28">
      {/* Navigation Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to SOP Checklist
        </button>

        <span className="px-2.5 py-0.5 text-xs font-mono font-bold rounded bg-black/10 dark:bg-white/10 text-[var(--color-text-primary)]">
          JOB #{job.id.toUpperCase()}
        </span>
      </div>

      {/* Screen Title & Target Step Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[var(--color-accent-primary)] uppercase tracking-wider">
            <Camera className="w-4 h-4" /> Proof-of-Installation Media Evidence
          </div>
          <h1 className="text-2xl font-serif font-bold text-[var(--color-text-primary)] mt-1">
            Photo & Video Evidence Capture
          </h1>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Auto-tagged with GPS coordinates and timestamps for AIEC Quality Check Audit
          </p>
        </div>

        {/* SOP Step Selector Dropdown */}
        <div className="w-full sm:w-72 shrink-0">
          <label className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider block mb-1">
            Target SOP Step:
          </label>
          <select
            value={selectedStepId}
            onChange={(e) => setSelectedStepId(e.target.value)}
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-2.5 text-xs font-semibold text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-antiquegold"
          >
            {steps.map(s => (
              <option key={s.id} value={s.id}>
                Step {s.stepNumber}: {s.title} {s.isSafetyCritical ? ' (Safety Critical)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Guided Capture Trigger Card */}
      {selectedStep && (
        <Card className="p-5 border border-[var(--color-accent-primary)]/30 bg-[var(--color-surface)] rounded-2xl space-y-4">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] pb-3">
            <div>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-mono text-[var(--color-accent-primary)] font-bold">{selectedStep.phase}</span>
                {selectedStep.isSafetyCritical && (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-500/20 text-red-700 dark:text-red-300">
                    Safety Critical
                  </span>
                )}
              </div>
              <h2 className="text-base font-serif font-bold text-[var(--color-text-primary)] mt-0.5">
                Guidance: {selectedStep.title}
              </h2>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                {selectedStep.description}
              </p>
            </div>
          </div>

          {/* Capture Trigger Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <Button
              onClick={() => { setCaptureType('photo'); handleSimulateCapture(); }}
              className="w-full sm:w-auto bg-antiquegold text-white font-bold text-xs py-2.5 px-5 flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" /> Capture Photo Evidence
            </Button>

            <Button
              onClick={() => { setCaptureType('video'); handleSimulateCapture(); }}
              variant="outline"
              className="w-full sm:w-auto border-[var(--color-border)] font-bold text-xs py-2.5 px-5 flex items-center justify-center gap-2"
            >
              <Video className="w-4 h-4 text-purple-600" /> Record Short Video Clip
            </Button>
          </div>
        </Card>
      )}

      {/* Camera Capture Modal / Preview Dialog */}
      {isCapturing && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <Card className="p-6 max-w-lg w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <h3 className="text-base font-serif font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                <Camera className="w-5 h-5 text-antiquegold" /> Review {captureType.toUpperCase()} Evidence
              </h3>
              <button onClick={() => setIsCapturing(false)} className="text-[var(--color-text-secondary)] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Media Framing Preview */}
            <div className="relative rounded-xl overflow-hidden border border-[var(--color-border)] aspect-video bg-black">
              {previewMediaUrl && (
                <img src={previewMediaUrl} alt="Preview capture" className="w-full h-full object-cover" />
              )}
              <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-1 rounded text-[10px] font-mono text-white flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" /> GPS Tagged: 19.0473, 73.0699
              </div>
            </div>

            {/* Form Details */}
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-[var(--color-text-primary)] block mb-1">
                  Evidence Caption / Description:
                </label>
                <input
                  type="text"
                  value={captionInput}
                  onChange={(e) => setCaptionInput(e.target.value)}
                  placeholder={`E.g., Torqued bolts on step #${selectedStep?.stepNumber || 1}...`}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl p-2.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-antiquegold"
                />
              </div>

              {/* Defect Flagging Option */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
                <label className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDefect}
                    onChange={(e) => setIsDefect(e.target.checked)}
                    className="rounded border-amber-500 text-amber-600 focus:ring-amber-500"
                  />
                  <span>Flag Site Defect / Component Issue in this Photo</span>
                </label>

                {isDefect && (
                  <textarea
                    value={defectNotesInput}
                    onChange={(e) => setDefectNotesInput(e.target.value)}
                    placeholder="Describe specific defect observed..."
                    rows={2}
                    className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl p-2 text-xs text-[var(--color-text-primary)] focus:outline-none"
                  />
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={handleSimulateCapture}
                  className="text-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retake Photo
                </Button>
                <Button
                  onClick={handleSaveEvidence}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                >
                  Confirm & Attach Evidence
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Gallery of Uploaded Evidence */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-serif font-bold text-[var(--color-text-primary)] flex items-center gap-2">
            <Layers className="w-4 h-4 text-antiquegold" /> Job Evidence Gallery ({evidenceList.length})
          </h2>
          <span className="text-xs text-[var(--color-text-secondary)] font-mono">Auto-Synced to Cloud</span>
        </div>

        {evidenceList.length === 0 ? (
          <Card className="p-8 text-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl space-y-2">
            <Camera className="w-10 h-10 text-[var(--color-text-secondary)] mx-auto opacity-50" />
            <p className="text-xs text-[var(--color-text-secondary)]">No photo/video evidence captured for this job yet.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {evidenceList.map((ev) => (
              <Card
                key={ev.id}
                className="overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] rounded-2xl flex flex-col group hover:border-antiquegold/50 transition-colors cursor-pointer"
                onClick={() => setLightboxEvidence(ev)}
              >
                <div className="relative aspect-video bg-black">
                  <img src={ev.mediaUrl} alt={ev.sopStepTitle} className="w-full h-full object-cover" />
                  <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-mono text-white">
                    {ev.evidenceType.toUpperCase()}
                  </div>
                  {ev.isDefectFlagged && (
                    <div className="absolute top-2 right-2 bg-red-600 text-white px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> DEFECT
                    </div>
                  )}
                </div>

                <div className="p-3.5 space-y-1 flex-1 flex flex-col justify-between text-xs">
                  <div>
                    <span className="text-[10px] text-[var(--color-accent-primary)] font-mono font-semibold block">
                      {ev.sopStepTitle}
                    </span>
                    <p className="font-semibold text-[var(--color-text-primary)] line-clamp-2 mt-0.5">
                      {ev.caption}
                    </p>
                  </div>

                  <div className="text-[10px] text-[var(--color-text-secondary)] font-mono flex items-center justify-between pt-2 border-t border-[var(--color-border)]">
                    <span>{ev.captureTimestamp}</span>
                    <span className="text-emerald-600 font-bold">● {ev.uploadStatus}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {lightboxEvidence && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <Card className="p-5 max-w-2xl w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
              <span className="text-xs font-mono font-bold text-[var(--color-accent-primary)]">
                {lightboxEvidence.sopStepTitle}
              </span>
              <button onClick={() => setLightboxEvidence(null)} className="text-[var(--color-text-secondary)] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-xl overflow-hidden border border-[var(--color-border)] aspect-video bg-black">
              <img src={lightboxEvidence.mediaUrl} alt="Full view" className="w-full h-full object-contain" />
            </div>

            <div className="text-xs space-y-2">
              <p className="font-bold text-[var(--color-text-primary)]">{lightboxEvidence.caption}</p>
              {lightboxEvidence.isDefectFlagged && (
                <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-700 dark:text-red-300">
                  <span className="font-bold">Defect Note: </span>
                  {lightboxEvidence.defectNotes || 'Marked as site defect during installation.'}
                </div>
              )}
              <div className="text-[10px] text-[var(--color-text-secondary)] font-mono flex items-center justify-between pt-2 border-t border-[var(--color-border)]">
                <span>Timestamp: {lightboxEvidence.captureTimestamp}</span>
                <span>GPS: Lat {lightboxEvidence.gpsLat}, Lng {lightboxEvidence.gpsLng}</span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
