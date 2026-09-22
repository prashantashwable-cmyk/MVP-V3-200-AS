import React, { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, Clock, CheckCircle2, AlertTriangle, Truck, 
  ChevronRight, ArrowRight, UserCheck, ShieldAlert, Plus, AlertCircle,
  Building2, MapPin, Layers, RefreshCw, FileText, CheckSquare, X, Filter,
  Phone, User, Check
} from 'lucide-react';
import { DbManager } from '../lib/db';
import { bridgeDeliveryScheduled } from '../services/legacyCommercialBridge';
import { DeliverySchedule, SiteReadinessChecklist, User as UserType, Job } from '../types';

interface Props {
  user: UserType;
  onNavigateToTracking?: (poId: string) => void;
}

export const DeliverySchedulingScreen: React.FC<Props> = ({ user, onNavigateToTracking }) => {
  const [schedules, setSchedules] = useState<DeliverySchedule[]>([]);
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'agenda'>('agenda');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedSchedule, setSelectedSchedule] = useState<DeliverySchedule | null>(null);

  // Modals state
  const [showChecklistModal, setShowChecklistModal] = useState<boolean>(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState<boolean>(false);
  const [showAttemptFailedModal, setShowAttemptFailedModal] = useState<boolean>(false);
  const [showScheduleLockModal, setShowScheduleLockModal] = useState<boolean>(false);

  // Form states
  const [checklistState, setChecklistState] = useState<SiteReadinessChecklist>({
    shaftCivilWorkComplete: false,
    unloadingAreaClear: false,
    powerSupply3PhaseReady: false,
    siteEngineerSignoff: false,
    craneScaffoldingAvailable: false,
    confirmedBy: ''
  });

  const [rescheduleData, setRescheduleData] = useState({
    newDate: '',
    timeWindow: '09:00 AM - 12:00 PM',
    reason: ''
  });

  const [attemptNote, setAttemptNote] = useState('');
  const [selectedTimeWindow, setSelectedTimeWindow] = useState('10:00 AM - 01:00 PM');
  const [selectedTechnician, setSelectedTechnician] = useState('tech_sanjay');
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().split('T')[0]);
  const [dependencyWarning, setDependencyWarning] = useState<string | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const list = DbManager.getDeliverySchedules();
    setSchedules(list);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const filteredSchedules = schedules.filter(s => {
    if (statusFilter === 'all') return true;
    return s.status === statusFilter;
  });

  // Open checklist modal
  const handleOpenChecklist = (item: DeliverySchedule) => {
    setSelectedSchedule(item);
    setChecklistState({
      ...item.siteReadinessChecklist,
      confirmedBy: item.siteReadinessChecklist.confirmedBy || (user.name + ' (' + user.role.toUpperCase() + ')')
    });
    setShowChecklistModal(true);
  };

  // Save checklist sign-off
  const handleSaveChecklist = () => {
    if (!selectedSchedule) return;
    const allChecked = 
      checklistState.shaftCivilWorkComplete &&
      checklistState.unloadingAreaClear &&
      checklistState.powerSupply3PhaseReady &&
      checklistState.siteEngineerSignoff &&
      checklistState.craneScaffoldingAvailable;

    const updated: DeliverySchedule = {
      ...selectedSchedule,
      siteReadinessConfirmedFlag: allChecked,
      siteReadinessChecklist: {
        ...checklistState,
        confirmedBy: checklistState.confirmedBy || user.name,
        confirmedAt: new Date().toISOString()
      },
      status: allChecked ? (selectedSchedule.status === 'pending_site_readiness' ? 'scheduled_locked' : selectedSchedule.status) : 'pending_site_readiness',
      updatedAt: new Date().toISOString()
    };

    DbManager.updateDeliverySchedule(updated);
    loadData();
    setShowChecklistModal(false);
    showToast(allChecked 
      ? 'Site Readiness Checklist 100% Verified! Site is cleared for delivery.' 
      : 'Site readiness saved. Missing items prevent date lock-in.'
    );
  };

  // Open Schedule Lock Modal
  const handleOpenScheduleLock = (item: DeliverySchedule) => {
    if (!item.siteReadinessConfirmedFlag) {
      showToast('⚠️ Cannot lock delivery schedule until Site Readiness is 100% confirmed!');
      return;
    }

    // Check PO dependency
    if (item.prerequisitePoId) {
      const prereq = schedules.find(s => s.poId === item.prerequisitePoId);
      if (prereq && prereq.status !== 'completed' && prereq.status !== 'in_transit') {
        setDependencyWarning(`⚠️ DEPENDENCY ALERT: ${item.poId} depends on ${item.prerequisitePoId} (${prereq.itemSummary}) arriving first! Prerequisite status is current '${prereq.status}'.`);
      } else {
        setDependencyWarning(null);
      }
    } else {
      setDependencyWarning(null);
    }

    setSelectedSchedule(item);
    setScheduledDate(item.scheduledDeliveryDate || new Date().toISOString().split('T')[0]);
    setSelectedTimeWindow(item.deliveryTimeWindow || '10:00 AM - 01:00 PM');
    setShowScheduleLockModal(true);
  };

  // Lock Schedule & Trigger Installation Job creation
  const handleConfirmScheduleLock = () => {
    if (!selectedSchedule) return;

    const updated: DeliverySchedule = {
      ...selectedSchedule,
      scheduledDeliveryDate: scheduledDate,
      deliveryTimeWindow: selectedTimeWindow,
      status: 'technician_assigned',
      assignedTechnicianId: selectedTechnician,
      assignedTechnicianName: selectedTechnician === 'tech_sanjay' ? 'Sanjay Kumar (Sr. Elevator Tech)' : 'Vikas Deshmukh (Installation Lead)',
      updatedAt: new Date().toISOString()
    };

    DbManager.updateDeliverySchedule(updated);

    // Auto-create/sync installation job entry
    const newJob: Job = {
      id: `job_${Date.now()}`,
      dealId: `deal_${selectedSchedule.poId}`,
      technicianId: selectedTechnician,
      status: 'pending',
      sopSteps: [
        { id: 's1', label: 'Material Arrival Inspection & Unboxing QC', completed: false },
        { id: 's2', label: 'Shaft Rail Alignment & Scaffolding Check', completed: false },
        { id: 's3', label: 'Traction Motor & Drive Mounting', completed: false }
      ],
      startedAt: scheduledDate
    };
    DbManager.addJob(newJob);

    loadData();
    setShowScheduleLockModal(false);
    showToast(`✅ Delivery date locked for ${scheduledDate}! Technician ${updated.assignedTechnicianName} notified and installation job auto-created.`);

    // Phase 17: bridge into a real canonical Shipment (scheduled), in
    // addition to the DbManager write above — see legacyCommercialBridge.ts.
    bridgeDeliveryScheduled(
      { id: user.id, role: user.role, isDemo: user.isDemo, authMethod: user.authMethod },
      updated.poId,
    ).then(result => {
      if (!result.bridged) {
        console.warn(`[Phase 17 bridge] delivery schedule for PO ${updated.poId} not mirrored to canonical model: ${result.reason}`);
      }
    });
  };

  // Open Reschedule Modal
  const handleOpenReschedule = (item: DeliverySchedule) => {
    setSelectedSchedule(item);
    setRescheduleData({
      newDate: item.scheduledDeliveryDate,
      timeWindow: item.deliveryTimeWindow || '09:00 AM - 12:00 PM',
      reason: ''
    });
    setShowRescheduleModal(true);
  };

  // Submit Reschedule
  const handleSaveReschedule = () => {
    if (!selectedSchedule) return;
    if (!rescheduleData.reason.trim()) {
      showToast('⚠️ Reschedule reason is mandatory for audit & scorecards!');
      return;
    }

    const historyEntry = {
      previousDate: selectedSchedule.scheduledDeliveryDate,
      newDate: rescheduleData.newDate,
      reason: rescheduleData.reason,
      requestedBy: user.name + ' (' + user.role.toUpperCase() + ')',
      timestamp: new Date().toISOString()
    };

    const updated: DeliverySchedule = {
      ...selectedSchedule,
      scheduledDeliveryDate: rescheduleData.newDate,
      deliveryTimeWindow: rescheduleData.timeWindow,
      status: 'rescheduled',
      rescheduledReason: rescheduleData.reason,
      rescheduleHistory: [...(selectedSchedule.rescheduleHistory || []), historyEntry],
      updatedAt: new Date().toISOString()
    };

    DbManager.updateDeliverySchedule(updated);
    loadData();
    setShowRescheduleModal(false);
    showToast(`🔄 Delivery rescheduled to ${rescheduleData.newDate}. Reason logged for Supplier Scorecard audit.`);
  };

  // Record Same-Day Attempted Delivery Failure
  const handleOpenAttemptFailed = (item: DeliverySchedule) => {
    setSelectedSchedule(item);
    setAttemptNote('');
    setShowAttemptFailedModal(true);
  };

  const handleSaveAttemptFailed = () => {
    if (!selectedSchedule) return;
    if (!attemptNote.trim()) {
      showToast('⚠️ Please specify what blocked site reception (e.g. key missing, gate locked, shaft flooded).');
      return;
    }

    const updated: DeliverySchedule = {
      ...selectedSchedule,
      status: 'delivery_attempt_failed',
      siteReadinessConfirmedFlag: false, // Reset readiness flag as site turned out unready!
      attemptedFailureNote: `[${new Date().toLocaleDateString()}] Delivery Attempt Failed: ${attemptNote}`,
      updatedAt: new Date().toISOString()
    };

    DbManager.updateDeliverySchedule(updated);
    loadData();
    setShowAttemptFailedModal(false);
    showToast('🚨 Delivery Attempt Failed recorded! Site readiness reset & admin alerted.');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 max-w-md bg-charcoal text-white px-4 py-3 rounded-xl shadow-2xl border border-antiquegold/40 flex items-center space-x-3 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-antiquegold shrink-0" />
          <p className="text-sm font-medium">{toastMessage}</p>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-charcoal via-[#1a232e] to-charcoal text-white p-6 rounded-2xl shadow-lg border border-antiquegold/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-antiquegold/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center space-x-2 text-antiquegold text-xs font-semibold uppercase tracking-wider mb-1">
              <Truck className="w-4 h-4" />
              <span>Module 11 • Material Logistics & Delivery</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-serif font-bold text-alabaster">
              Delivery Scheduling & Site Readiness
            </h1>
            <p className="text-xs md:text-sm text-alabaster/70 mt-1 max-w-xl">
              Coordinate PO shipments, enforce site-readiness checklist gates, and automatically dispatch installation technician schedules.
            </p>
          </div>

          <div className="flex items-center space-x-2 bg-white/10 p-1.5 rounded-xl border border-white/10">
            <button
              onClick={() => setViewMode('agenda')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'agenda' ? 'bg-antiquegold text-charcoal font-semibold shadow' : 'text-alabaster hover:text-white'
              }`}
            >
              Agenda View
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'week' ? 'bg-antiquegold text-charcoal font-semibold shadow' : 'text-alabaster hover:text-white'
              }`}
            >
              Week Calendar
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'month' ? 'bg-antiquegold text-charcoal font-semibold shadow' : 'text-alabaster hover:text-white'
              }`}
            >
              Month View
            </button>
          </div>
        </div>
      </div>

      {/* Filters & Status Summary Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-antiquegold/15 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <Filter className="w-4 h-4 text-emerald font-semibold shrink-0" />
          <span className="text-xs font-bold text-charcoal uppercase tracking-wider shrink-0">Filter Status:</span>
          {[
            { id: 'all', label: 'All Deliveries' },
            { id: 'pending_site_readiness', label: '⚠️ Site Unready Gate' },
            { id: 'scheduled_locked', label: '🔒 Date Locked' },
            { id: 'technician_assigned', label: '👨‍🔧 Tech Assigned' },
            { id: 'in_transit', label: '🚚 In Transit' },
            { id: 'delivery_attempt_failed', label: '🚨 Attempt Failed' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0 ${
                statusFilter === f.id
                  ? 'bg-emerald text-white shadow-sm'
                  : 'bg-alabaster text-charcoal/70 hover:bg-antiquegold/10'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button 
          onClick={loadData}
          className="p-2 rounded-lg text-charcoal/60 hover:text-emerald hover:bg-alabaster transition-all"
          title="Refresh List"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Main Layout Area */}
      {viewMode === 'agenda' && (
        <div className="grid grid-cols-1 gap-4">
          {filteredSchedules.length === 0 ? (
            <div className="bg-white p-8 rounded-xl border border-dashed border-antiquegold/30 text-center space-y-3">
              <Truck className="w-10 h-10 text-antiquegold mx-auto opacity-50" />
              <p className="text-sm font-medium text-charcoal/70">No delivery schedules matching selected filter.</p>
            </div>
          ) : (
            filteredSchedules.map(item => (
              <div 
                key={item.id}
                className={`bg-white rounded-2xl p-5 border shadow-sm transition-all hover:shadow-md relative overflow-hidden ${
                  item.status === 'delivery_attempt_failed' ? 'border-red-300 bg-red-50/20' : 'border-antiquegold/20'
                }`}
              >
                {/* Ascension Line rail element on left card border */}
                <div 
                  className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                    item.status === 'technician_assigned' || item.status === 'in_transit' ? 'bg-emerald' :
                    item.status === 'pending_site_readiness' ? 'bg-amber-500' :
                    item.status === 'delivery_attempt_failed' ? 'bg-red-500' : 'bg-antiquegold'
                  }`} 
                />

                <div className="pl-2 space-y-4">
                  {/* Top Header Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
                    <div className="flex items-center space-x-3">
                      <span className="px-2.5 py-1 rounded-md bg-antiquegold/10 text-antiquegold font-mono text-xs font-bold border border-antiquegold/20">
                        {item.poId}
                      </span>
                      <h3 className="font-serif font-bold text-charcoal text-base">
                        {item.customerName}
                      </h3>
                    </div>

                    <div className="flex items-center space-x-2">
                      {item.siteReadinessConfirmedFlag ? (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-emerald/10 text-emerald text-xs font-semibold border border-emerald/20">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Site Ready Cleared</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold border border-amber-300 animate-pulse">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Checklist Unconfirmed</span>
                        </span>
                      )}

                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        item.status === 'in_transit' ? 'bg-blue-100 text-blue-800' :
                        item.status === 'technician_assigned' ? 'bg-emerald/15 text-emerald' :
                        item.status === 'delivery_attempt_failed' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {item.status.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Body Content Details */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-1 text-charcoal/60 font-medium">
                        <Building2 className="w-3.5 h-3.5 text-antiquegold" />
                        <span>Supplier & Component:</span>
                      </div>
                      <p className="font-semibold text-charcoal">{item.supplierName}</p>
                      <p className="text-charcoal/70 italic">{item.itemSummary}</p>
                      {item.prerequisitePoId && (
                        <div className="mt-1 p-1.5 rounded bg-amber-50 border border-amber-200 text-amber-900 font-medium flex items-center space-x-1">
                          <Layers className="w-3 h-3 text-amber-600 shrink-0" />
                          <span>Prereq PO: <strong>{item.prerequisitePoId}</strong> (Must arrive first)</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center space-x-1 text-charcoal/60 font-medium">
                        <MapPin className="w-3.5 h-3.5 text-emerald" />
                        <span>Site Location:</span>
                      </div>
                      <p className="text-charcoal font-medium">{item.siteAddress}</p>
                      {item.assignedTechnicianName && (
                        <div className="mt-1 flex items-center space-x-1 text-emerald font-semibold">
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Assigned Tech: {item.assignedTechnicianName}</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1 bg-alabaster/60 p-3 rounded-xl border border-antiquegold/10">
                      <div className="flex items-center justify-between">
                        <span className="text-charcoal/60 font-medium">Delivery Window:</span>
                        <Clock className="w-3.5 h-3.5 text-antiquegold" />
                      </div>
                      <p className="font-mono text-sm font-bold text-charcoal">
                        {item.scheduledDeliveryDate || 'Not Locked Yet'}
                      </p>
                      <p className="text-charcoal/70 font-mono">{item.deliveryTimeWindow}</p>
                    </div>
                  </div>

                  {/* Same-Day Attempt Failed Warning Note if any */}
                  {item.attemptedFailureNote && (
                    <div className="p-3 bg-red-100/70 border border-red-300 rounded-xl text-red-900 text-xs flex items-start space-x-2">
                      <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Delivery Attempt Blocked:</span>
                        <p>{item.attemptedFailureNote}</p>
                      </div>
                    </div>
                  )}

                  {/* Reschedule History if present */}
                  {item.rescheduleHistory && item.rescheduleHistory.length > 0 && (
                    <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs space-y-1">
                      <span className="font-semibold text-charcoal/80 flex items-center space-x-1">
                        <RefreshCw className="w-3 h-3 text-antiquegold" />
                        <span>Reschedule Log ({item.rescheduleHistory.length}):</span>
                      </span>
                      {item.rescheduleHistory.slice(-1).map((rh, idx) => (
                        <p key={idx} className="text-gray-600">
                          Shifted from <strong>{rh.previousDate}</strong> to <strong>{rh.newDate}</strong> • Reason: <em>"{rh.reason}"</em> by {rh.requestedBy}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Action Buttons Row */}
                  <div className="pt-2 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleOpenChecklist(item)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
                          item.siteReadinessConfirmedFlag 
                            ? 'bg-emerald/10 text-emerald hover:bg-emerald/20 border border-emerald/20' 
                            : 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm'
                        }`}
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                        <span>{item.siteReadinessConfirmedFlag ? 'View / Edit Readiness' : 'Confirm Site Checklist Gate'}</span>
                      </button>

                      <button
                        onClick={() => handleOpenScheduleLock(item)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
                          !item.siteReadinessConfirmedFlag
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-antiquegold text-charcoal hover:bg-antiquegold/90 shadow-sm'
                        }`}
                        disabled={!item.siteReadinessConfirmedFlag}
                        title={!item.siteReadinessConfirmedFlag ? 'Site readiness checklist required first' : 'Lock delivery date & assign tech'}
                      >
                        <CalendarIcon className="w-3.5 h-3.5" />
                        <span>Lock Date & Dispatch Tech</span>
                      </button>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleOpenReschedule(item)}
                        className="px-3 py-1.5 bg-alabaster hover:bg-antiquegold/10 text-charcoal text-xs font-medium rounded-lg border border-antiquegold/20 flex items-center space-x-1"
                      >
                        <RefreshCw className="w-3 h-3 text-antiquegold" />
                        <span>Reschedule Date</span>
                      </button>

                      <button
                        onClick={() => handleOpenAttemptFailed(item)}
                        className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium rounded-lg border border-red-200"
                        title="Record same-day attempt failure (e.g. site unready on truck arrival)"
                      >
                        Attempt Failed
                      </button>

                      {onNavigateToTracking && (
                        <button
                          onClick={() => onNavigateToTracking(item.poId)}
                          className="px-3 py-1.5 bg-emerald text-white hover:bg-emerald/90 text-xs font-semibold rounded-lg shadow-sm flex items-center space-x-1"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>Track Live GPS</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Week / Month Grid View Placeholder / Interactive Calendar Layout */}
      {(viewMode === 'week' || viewMode === 'month') && (
        <div className="bg-white p-6 rounded-2xl border border-antiquegold/20 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-4">
            <h2 className="font-serif font-bold text-lg text-charcoal flex items-center space-x-2">
              <CalendarIcon className="w-5 h-5 text-antiquegold" />
              <span>{viewMode === 'week' ? 'Weekly Logistics Dispatch Board' : 'Monthly Delivery Overview'}</span>
            </h2>
            <span className="text-xs text-charcoal/60 font-mono">August 2026</span>
          </div>

          <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-charcoal/70 border-b pb-2">
            <div>MON</div><div>TUE</div><div>WED</div><div>THU</div><div>FRI</div><div>SAT</div><div>SUN</div>
          </div>

          <div className="grid grid-cols-7 gap-2 min-h-[300px]">
            {[11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24].map((day) => {
              const dayStr = `2026-08-${day < 10 ? '0' + day : day}`;
              const dayItems = schedules.filter(s => s.scheduledDeliveryDate === dayStr);
              const isToday = day === 12;

              return (
                <div 
                  key={day}
                  className={`min-h-[90px] p-2 rounded-xl border flex flex-col justify-between transition-all ${
                    isToday ? 'bg-antiquegold/10 border-antiquegold shadow-inner' : 'bg-alabaster/40 border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold font-mono ${isToday ? 'text-antiquegold' : 'text-charcoal'}`}>
                      {day} {isToday && '(Today)'}
                    </span>
                    {dayItems.length > 0 && (
                      <span className="w-2 h-2 rounded-full bg-emerald" />
                    )}
                  </div>

                  <div className="space-y-1 my-1">
                    {dayItems.map(di => (
                      <div 
                        key={di.id}
                        onClick={() => handleOpenScheduleLock(di)}
                        className="p-1 rounded bg-white border border-antiquegold/20 text-[10px] font-medium text-charcoal truncate cursor-pointer hover:border-emerald"
                        title={`${di.poId} - ${di.customerName}`}
                      >
                        {di.poId}: {di.supplierName.split(' ')[0]}
                      </div>
                    ))}
                  </div>

                  <span className="text-[9px] text-charcoal/40 text-right">
                    {dayItems.length} deliveries
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal 1: Site Readiness Checklist Gate */}
      {showChecklistModal && selectedSchedule && (
        <div className="fixed inset-0 z-50 bg-charcoal/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-antiquegold/30 max-h-[90vh] overflow-y-auto animate-fade-in">
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <span className="text-xs font-semibold text-antiquegold uppercase tracking-wider">Site Gate Lock</span>
                <h2 className="font-serif font-bold text-xl text-charcoal">
                  Site Readiness Checklist
                </h2>
                <p className="text-xs text-charcoal/70">
                  {selectedSchedule.poId} • {selectedSchedule.customerName}
                </p>
              </div>
              <button 
                onClick={() => setShowChecklistModal(false)}
                className="p-1 rounded-lg text-charcoal/50 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
              <span className="font-bold flex items-center space-x-1">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Strict AIEC Rule:</span>
              </span>
              <p>Delivery date cannot be locked until <strong>all 5 checklist items</strong> are explicitly verified and signed off by the site engineer or project manager.</p>
            </div>

            <div className="space-y-3 text-sm">
              {[
                { key: 'shaftCivilWorkComplete', label: '1. Elevator Shaft Civil Work & Plastering Complete', desc: 'Shaft dimensions, pit waterproofing & floor pockets verified' },
                { key: 'unloadingAreaClear', label: '2. Unloading Area & Access Pathway Clear', desc: 'Sufficient clearance for 14ft flatbed truck & heavy component offloading' },
                { key: 'powerSupply3PhaseReady', label: '3. 3-Phase Temporary Power Supply Connected', desc: 'Required for testing motor, hoist motor & controller on arrival' },
                { key: 'craneScaffoldingAvailable', label: '4. Crane / Hoisting Scaffolding Available', desc: 'Chain pulley block or crane ready for heavy motor lifting' },
                { key: 'siteEngineerSignoff', label: '5. Site Engineer Formal Clearance Sign-off', desc: 'Civil site engineer has inspected & cleared reception' }
              ].map(item => {
                const k = item.key as keyof SiteReadinessChecklist;
                const isChecked = !!checklistState[k];
                return (
                  <label 
                    key={item.key}
                    onClick={() => setChecklistState(prev => ({ ...prev, [k]: !prev[k] }))}
                    className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      isChecked ? 'bg-emerald/5 border-emerald text-charcoal' : 'bg- alabaster border-gray-200 text-charcoal/70'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 border ${
                      isChecked ? 'bg-emerald border-emerald text-white' : 'bg-white border-gray-300'
                    }`}>
                      {isChecked && <Check className="w-3.5 h-3.5" />}
                    </div>
                    <div>
                      <p className="font-semibold text-xs">{item.label}</p>
                      <p className="text-[11px] text-charcoal/60">{item.desc}</p>
                    </div>
                  </label>
                );
              })}

              <div className="pt-2">
                <label className="block text-xs font-bold text-charcoal mb-1">
                  Verified & Signed Off By:
                </label>
                <input 
                  type="text"
                  value={checklistState.confirmedBy || ''}
                  onChange={e => setChecklistState(prev => ({ ...prev, confirmedBy: e.target.value }))}
                  placeholder="e.g. Er. Rajesh Patil (Site Engineer)"
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-antiquegold outline-none"
                />
              </div>
            </div>

            <div className="pt-3 border-t flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowChecklistModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-charcoal hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveChecklist}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald text-white hover:bg-emerald/90 shadow-md flex items-center space-x-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Save Checklist Verification</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Schedule Date Lock & Technician Dispatch Modal */}
      {showScheduleLockModal && selectedSchedule && (
        <div className="fixed inset-0 z-50 bg-charcoal/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-antiquegold/30 animate-fade-in">
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <span className="text-xs font-semibold text-emerald uppercase tracking-wider">Installation Sync</span>
                <h2 className="font-serif font-bold text-xl text-charcoal">
                  Lock Delivery Date & Assign Tech
                </h2>
                <p className="text-xs text-charcoal/70">
                  {selectedSchedule.poId} • {selectedSchedule.customerName}
                </p>
              </div>
              <button 
                onClick={() => setShowScheduleLockModal(false)}
                className="p-1 rounded-lg text-charcoal/50 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dependency Alert if applicable */}
            {dependencyWarning && (
              <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-xs text-red-900 font-medium space-y-1">
                <p>{dependencyWarning}</p>
              </div>
            )}

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-charcoal mb-1">
                  Confirmed Delivery Date:
                </label>
                <input 
                  type="date"
                  value={scheduledDate}
                  onChange={e => setScheduledDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-antiquegold font-mono text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-charcoal mb-1">
                  Supplier Capacity Window (Available Slot):
                </label>
                <select 
                  value={selectedTimeWindow}
                  onChange={e => setSelectedTimeWindow(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-antiquegold text-xs font-mono"
                >
                  {(selectedSchedule.supplierAvailableWindows || ['09:00 AM - 12:00 PM', '10:00 AM - 01:00 PM', '02:00 PM - 05:00 PM']).map((w, idx) => (
                    <option key={idx} value={w}>{w}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-charcoal mb-1">
                  Assign Lead Technician for Site Reception & Installation Job:
                </label>
                <select 
                  value={selectedTechnician}
                  onChange={e => setSelectedTechnician(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-antiquegold text-xs"
                >
                  <option value="tech_sanjay">Sanjay Kumar (Sr. Elevator Technician)</option>
                  <option value="tech_vikas">Vikas Deshmukh (Installation Lead)</option>
                </select>
              </div>
            </div>

            <div className="pt-3 border-t flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowScheduleLockModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-charcoal hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmScheduleLock}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-antiquegold text-charcoal hover:bg-antiquegold/90 shadow-md flex items-center space-x-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm & Auto-Create Tech Job</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Reschedule Flow with Reason Logging */}
      {showRescheduleModal && selectedSchedule && (
        <div className="fixed inset-0 z-50 bg-charcoal/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-antiquegold/30 animate-fade-in">
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Audit Logged</span>
                <h2 className="font-serif font-bold text-xl text-charcoal">
                  Reschedule Delivery Date
                </h2>
                <p className="text-xs text-charcoal/70">
                  {selectedSchedule.poId} • {selectedSchedule.customerName}
                </p>
              </div>
              <button 
                onClick={() => setShowRescheduleModal(false)}
                className="p-1 rounded-lg text-charcoal/50 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-charcoal mb-1">
                  New Delivery Date:
                </label>
                <input 
                  type="date"
                  value={rescheduleData.newDate}
                  onChange={e => setRescheduleData(prev => ({ ...prev, newDate: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-antiquegold font-mono text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-charcoal mb-1">
                  Time Window:
                </label>
                <select 
                  value={rescheduleData.timeWindow}
                  onChange={e => setRescheduleData(prev => ({ ...prev, timeWindow: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-antiquegold text-xs font-mono"
                >
                  <option value="09:00 AM - 12:00 PM">09:00 AM - 12:00 PM</option>
                  <option value="12:00 PM - 03:00 PM">12:00 PM - 03:00 PM</option>
                  <option value="03:00 PM - 06:00 PM">03:00 PM - 06:00 PM</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-charcoal mb-1">
                  Mandatory Reschedule Reason (Feeds Supplier Scorecard):
                </label>
                <textarea 
                  rows={3}
                  value={rescheduleData.reason}
                  onChange={e => setRescheduleData(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="e.g. Supplier factory quality testing delayed dispatch by 24 hours, or site civil work rain delay..."
                  className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-antiquegold text-xs"
                />
              </div>
            </div>

            <div className="pt-3 border-t flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowRescheduleModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-charcoal hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveReschedule}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 shadow-md flex items-center space-x-1.5"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Save Reschedule & Log Reason</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Same-Day Delivery Attempt Failed */}
      {showAttemptFailedModal && selectedSchedule && (
        <div className="fixed inset-0 z-50 bg-charcoal/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-red-300 animate-fade-in">
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">Unplanned Incident</span>
                <h2 className="font-serif font-bold text-xl text-red-900 flex items-center space-x-2">
                  <ShieldAlert className="w-5 h-5 text-red-600" />
                  <span>Delivery Attempt Failed</span>
                </h2>
                <p className="text-xs text-charcoal/70">
                  {selectedSchedule.poId} • {selectedSchedule.customerName}
                </p>
              </div>
              <button 
                onClick={() => setShowAttemptFailedModal(false)}
                className="p-1 rounded-lg text-charcoal/50 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-charcoal/80">
              Use this when the supplier's truck actually arrived on site, but site conditions prevented unloading (e.g. gate locked, shaft flooded, site engineer absent). This resets site readiness and alerts Admin.
            </p>

            <div>
              <label className="block text-xs font-bold text-charcoal mb-1">
                Failure Cause Note:
              </label>
              <textarea 
                rows={3}
                value={attemptNote}
                onChange={e => setAttemptNote(e.target.value)}
                placeholder="e.g. Truck arrived at 11:00 AM, but site key holder was absent and shaft pit was inundated with rainwater."
                className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-red-500 text-xs"
              />
            </div>

            <div className="pt-3 border-t flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowAttemptFailedModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-charcoal hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAttemptFailed}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-red-600 text-white hover:bg-red-700 shadow-md flex items-center space-x-1.5"
              >
                <AlertCircle className="w-4 h-4" />
                <span>Confirm Failed Attempt</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
