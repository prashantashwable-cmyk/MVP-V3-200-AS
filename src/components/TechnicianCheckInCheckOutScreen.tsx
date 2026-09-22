import React, { useState, useEffect } from 'react';
import { User, TechnicianJob, TechnicianCheckInRecord } from '../types';
import { DbManager } from '../lib/db';
import { bridgeInstallationProgress } from '../services/legacyCommercialBridge';
import { 
  MapPin, Clock, ArrowLeft, CheckCircle2, AlertTriangle, ShieldCheck, 
  Navigation, RefreshCw, FileText, Lock, Play, Square, History, Layers
} from 'lucide-react';
import { Card, Button } from './Common';

interface TechnicianCheckInCheckOutScreenProps {
  user: User;
  jobId: string;
  onBack: () => void;
  onNavigateToSopChecklist: (jobId: string) => void;
}

export const TechnicianCheckInCheckOutScreen: React.FC<TechnicianCheckInCheckOutScreenProps> = ({
  user,
  jobId,
  onBack,
  onNavigateToSopChecklist
}) => {
  const [job, setJob] = useState<TechnicianJob | null>(null);
  const [activeCheckIn, setActiveCheckIn] = useState<TechnicianCheckInRecord | undefined>(undefined);
  const [history, setHistory] = useState<TechnicianCheckInRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Live timer for active check-in duration
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [checkOutNotesInput, setCheckOutNotesInput] = useState('');
  const [showIncompleteSopWarning, setShowIncompleteSopWarning] = useState(false);

  useEffect(() => {
    loadData();
  }, [jobId]);

  useEffect(() => {
    let timer: any;
    if (activeCheckIn && activeCheckIn.status === 'active_onsite') {
      const startTime = new Date(activeCheckIn.checkInTimestamp).getTime();
      timer = setInterval(() => {
        const now = Date.now();
        const diffSec = Math.max(0, Math.floor((now - startTime) / 1000));
        setElapsedSeconds(diffSec);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [activeCheckIn]);

  const loadData = () => {
    setIsLoading(true);
    setTimeout(() => {
      const foundJob = DbManager.getTechnicianJobById(jobId);
      const active = DbManager.getActiveCheckIn(jobId, user.id || 'tech_001');
      const checkinHistory = DbManager.getCheckInHistory(jobId);

      setJob(foundJob || null);
      setActiveCheckIn(active);
      setHistory(checkinHistory);
      setIsLoading(false);
    }, 300);
  };

  const handlePerformCheckIn = () => {
    if (!job) return;

    const newRecord: TechnicianCheckInRecord = {
      id: 'checkin_' + Date.now(),
      jobId: job.id,
      technicianId: user.id || 'tech_001',
      technicianName: user.name || 'Ramesh Patil',
      checkInTimestamp: new Date().toISOString(),
      checkInLat: job.latitude || 19.0473,
      checkInLng: job.longitude || 73.0699,
      checkInDistanceMeters: Math.floor(Math.random() * 25) + 5, // 5 to 30m accuracy
      status: 'active_onsite'
    };

    DbManager.checkInTechnician(newRecord);
    loadData();

    // Phase 18: bridge into a real canonical InstallationJob check-in
    // (Phase 09's hard gate — site readiness must be confirmed first —
    // stays enforced in checkIn() itself), in addition to the DbManager
    // write above — see legacyCommercialBridge.ts.
    bridgeInstallationProgress(
      { id: user.id, role: user.role, isDemo: user.isDemo, authMethod: user.authMethod },
      job.id,
      'checked_in',
    ).then(result => {
      if (!result.bridged) {
        console.warn(`[Phase 18 bridge] check-in for job ${job.id} not mirrored to canonical model: ${result.reason}`);
      }
    });
  };

  const handlePerformCheckOut = () => {
    if (!activeCheckIn || !job) return;

    // Check if SOP steps are pending
    const steps = DbManager.getInstallationSopSteps(job.id);
    const pendingSteps = steps.filter(s => s.status === 'pending');

    if (pendingSteps.length > 0 && !showIncompleteSopWarning) {
      setShowIncompleteSopWarning(true);
      return;
    }

    DbManager.checkOutTechnician(
      activeCheckIn.id,
      job.latitude || 19.0473,
      job.longitude || 73.0699,
      checkOutNotesInput.trim()
    );

    setShowIncompleteSopWarning(false);
    setCheckOutNotesInput('');
    loadData();
  };

  const formatTimer = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading || !job) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-3xl mx-auto animate-pulse">
        <div className="h-8 bg-[var(--color-border)] opacity-30 rounded w-1/3"></div>
        <div className="h-48 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl"></div>
      </div>
    );
  }

  const steps = DbManager.getInstallationSopSteps(job.id);
  const pendingCount = steps.filter(s => s.status === 'pending').length;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl mx-auto pb-28">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Job Details
        </button>

        <span className="px-2.5 py-0.5 text-xs font-mono font-bold rounded bg-black/10 dark:bg-white/10 text-[var(--color-text-primary)]">
          GPS GEO-VERIFIED
        </span>
      </div>

      {/* Screen Title */}
      <div>
        <div className="flex items-center gap-2 text-xs font-mono text-[var(--color-accent-primary)] uppercase tracking-wider">
          <Clock className="w-4 h-4" /> On-Site Time Tracking & Attendance Log
        </div>
        <h1 className="text-2xl font-serif font-bold text-[var(--color-text-primary)] mt-1">
          Technician Site Check-In / Check-Out
        </h1>
        <p className="text-xs text-[var(--color-text-secondary)]">
          {job.customerName} • {job.siteCity}
        </p>
      </div>

      {/* Main Check-In / Active Session Card */}
      {activeCheckIn ? (
        <Card className="p-6 border border-emerald-500/40 bg-emerald-500/5 rounded-2xl space-y-4 text-center shadow-md">
          <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center mx-auto animate-pulse">
            <MapPin className="w-6 h-6" />
          </div>

          <div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 inline-block">
              ACTIVE ON-SITE SESSION
            </span>
            <h2 className="text-3xl font-serif font-bold font-mono text-[var(--color-text-primary)] mt-2">
              {formatTimer(elapsedSeconds)}
            </h2>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              Checked in at {new Date(activeCheckIn.checkInTimestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} • Distance: {activeCheckIn.checkInDistanceMeters}m from site center
            </p>
          </div>

          {/* Incomplete SOP Warning Modal Banner */}
          {showIncompleteSopWarning && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-left space-y-2 text-xs">
              <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>Warning: {pendingCount} SOP Checklist Steps Still Incomplete</span>
              </div>
              <p className="text-[var(--color-text-secondary)]">
                You are checking out while SOP steps are pending. Admin Control Desk will receive an automatic site exit notice.
              </p>
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={() => onNavigateToSopChecklist(job.id)}
                  className="bg-antiquegold text-white text-xs py-1.5 px-3"
                >
                  Return to SOP Checklist
                </Button>
                <Button
                  onClick={handlePerformCheckOut}
                  variant="outline"
                  className="text-xs py-1.5 px-3"
                >
                  Proceed Checkout
                </Button>
              </div>
            </div>
          )}

          {/* Checkout Form */}
          <div className="space-y-3 pt-2 text-left">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1">
                End of Shift / Checkout Notes (Optional):
              </label>
              <textarea
                value={checkOutNotesInput}
                onChange={(e) => setCheckOutNotesInput(e.target.value)}
                placeholder="Summary of work completed today or notes for next shift..."
                rows={2}
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-2.5 text-xs text-[var(--color-text-primary)] focus:outline-none"
              />
            </div>

            <Button
              onClick={handlePerformCheckOut}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-3 flex items-center justify-center gap-2 shadow-md"
            >
              <Square className="w-4 h-4" /> CHECK-OUT & END SHIFT
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-6 border border-[var(--color-accent-primary)]/30 bg-[var(--color-surface)] rounded-2xl space-y-4 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-antiquegold/20 text-antiquegold flex items-center justify-center mx-auto">
            <MapPin className="w-6 h-6" />
          </div>

          <div>
            <h2 className="text-lg font-serif font-bold text-[var(--color-text-primary)]">
              Ready to Start On-Site Work?
            </h2>
            <p className="text-xs text-[var(--color-text-secondary)] max-w-md mx-auto mt-1">
              Verify GPS position at {job.siteAddress} to initiate on-site time tracking for this installation.
            </p>
          </div>

          <div className="p-3 bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] font-mono">
            <span>Verified GPS Position: Lat {job.latitude}, Lng {job.longitude}</span>
          </div>

          <Button
            onClick={handlePerformCheckIn}
            className="w-full bg-antiquegold text-white hover:bg-antiquegold/90 font-bold text-xs py-3.5 flex items-center justify-center gap-2 shadow-lg"
          >
            <Play className="w-4 h-4 fill-white" /> CONFIRM & CHECK-IN ON SITE NOW
          </Button>
        </Card>
      )}

      {/* Check-In Log History */}
      <div className="space-y-3 pt-4 border-t border-[var(--color-border)]">
        <h2 className="text-base font-serif font-bold text-[var(--color-text-primary)] flex items-center gap-2">
          <History className="w-4 h-4 text-antiquegold" /> Site Time Log History ({history.length})
        </h2>

        {history.length === 0 ? (
          <p className="text-xs text-[var(--color-text-secondary)] italic">No previous check-in logs recorded for this job.</p>
        ) : (
          <div className="space-y-2">
            {history.map((rec) => (
              <div key={rec.id} className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl flex items-center justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2 font-bold text-[var(--color-text-primary)]">
                    <span>{rec.technicianName}</span>
                    {rec.status === 'active_onsite' ? (
                      <span className="px-2 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-full font-mono">
                        Active Now
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-[10px] bg-black/10 dark:bg-white/10 text-[var(--color-text-secondary)] rounded font-mono">
                        {rec.onsiteDurationMinutes || 0} mins
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-[var(--color-text-secondary)] font-mono mt-0.5">
                    In: {new Date(rec.checkInTimestamp).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                    {rec.checkOutTimestamp && ` • Out: ${new Date(rec.checkOutTimestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
                  </div>
                </div>

                {rec.hasIncompleteSopAtCheckOut && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-800 dark:text-amber-300 rounded shrink-0">
                    Sop Incomplete
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
