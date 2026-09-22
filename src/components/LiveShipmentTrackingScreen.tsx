import React, { useState, useEffect } from 'react';
import { 
  Truck, MapPin, Clock, Navigation, Phone, CheckCircle2, AlertTriangle, 
  Send, ShieldCheck, ChevronUp, ChevronDown, RefreshCw, MessageSquare, 
  ExternalLink, Layers, User, Zap, Info, ArrowRight, ShieldAlert, Radio
} from 'lucide-react';
import { DbManager } from '../lib/db';
import { bridgeShipmentArrived } from '../services/legacyCommercialBridge';
import { LiveShipmentTracker, ShipmentTrackingLeg, User as UserType } from '../types';

interface Props {
  user: UserType;
  selectedPoId?: string;
  onBackToSchedules?: () => void;
}

export const LiveShipmentTrackingScreen: React.FC<Props> = ({ user, selectedPoId, onBackToSchedules }) => {
  const [trackers, setTrackers] = useState<LiveShipmentTracker[]>([]);
  const [activeTracker, setActiveTracker] = useState<LiveShipmentTracker | null>(null);
  const [activeLeg, setActiveLeg] = useState<ShipmentTrackingLeg | null>(null);
  const [isBottomSheetExpanded, setIsBottomSheetExpanded] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSimulatingGps, setIsSimulatingGps] = useState<boolean>(true);

  const isCustomer = user.role === 'customer';

  useEffect(() => {
    loadTrackers();
  }, [selectedPoId]);

  const loadTrackers = () => {
    const list = DbManager.getShipmentTrackers();
    setTrackers(list);

    if (list.length > 0) {
      let target = list[0];
      if (selectedPoId) {
        const found = list.find(t => t.poId === selectedPoId);
        if (found) target = found;
      }
      setActiveTracker(target);
      const leg = target.legs.find(l => l.legId === target.activeLegId) || target.legs[0];
      setActiveLeg(leg || null);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Switch Leg
  const handleSelectLeg = (leg: ShipmentTrackingLeg) => {
    if (!activeTracker) return;
    setActiveLeg(leg);
    const updated = {
      ...activeTracker,
      activeLegId: leg.legId
    };
    setActiveTracker(updated);
    DbManager.updateShipmentTracker(updated);
  };

  // Simulate Milestone Advance (Admin / Supplier / System)
  const handleAdvanceMilestone = (nextMilestone: 'dispatched' | 'in_transit' | 'nearby' | 'arrived') => {
    if (!activeTracker || !activeLeg) return;

    const newMilestoneHistory = [
      ...activeLeg.milestoneHistory,
      {
        milestone: nextMilestone,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        locationName: nextMilestone === 'nearby' ? 'Within 2km of Site' : nextMilestone === 'arrived' ? 'Customer Site Gate' : 'En Route Highway',
        note: `Milestone updated to ${nextMilestone.toUpperCase()}`
      }
    ];

    // Auto-generate customer WhatsApp notification
    const autoWaText = nextMilestone === 'nearby'
      ? `AIEC Update: Elevator Delivery vehicle ${activeLeg.vehicleNumber} is NEARBY! Estimated arrival in 5-10 minutes.`
      : nextMilestone === 'arrived'
      ? `AIEC Update: Vehicle ${activeLeg.vehicleNumber} has ARRIVED at your site ${activeTracker.siteAddress}. Technician team notified!`
      : `AIEC Update: Shipment ${activeLeg.legTitle} is now ${nextMilestone.replace('_', ' ')}.`;

    const updatedLeg: ShipmentTrackingLeg = {
      ...activeLeg,
      transitMilestone: nextMilestone,
      milestoneHistory: newMilestoneHistory,
      customerNotifiedFlag: true,
      whatsappNotificationLog: [
        ...(activeLeg.whatsappNotificationLog || []),
        {
          sentAt: new Date().toISOString(),
          messageText: autoWaText,
          status: 'delivered'
        }
      ]
    };

    const updatedTracker: LiveShipmentTracker = {
      ...activeTracker,
      legs: activeTracker.legs.map(l => l.legId === activeLeg.legId ? updatedLeg : l),
      updatedAt: new Date().toISOString()
    };

    setActiveTracker(updatedTracker);
    setActiveLeg(updatedLeg);
    DbManager.updateShipmentTracker(updatedTracker);
    showToast(`✅ Milestone advanced to ${nextMilestone.toUpperCase()}! Automated customer WhatsApp message sent.`);

    // Phase 17: "arrived" bridges into the canonical Shipment's real
    // "arrived" status, in addition to the DbManager write above — see
    // legacyCommercialBridge.ts.
    if (nextMilestone === 'arrived') {
      bridgeShipmentArrived(
        { id: user.id, role: user.role, isDemo: user.isDemo, authMethod: user.authMethod },
        updatedTracker.poId,
      ).then(result => {
        if (!result.bridged) {
          console.warn(`[Phase 17 bridge] shipment arrival for PO ${updatedTracker.poId} not mirrored to canonical model: ${result.reason}`);
        }
      });
    }
  };

  return (
    <div className="space-y-4 pb-12">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 max-w-md bg-charcoal text-white px-4 py-3 rounded-xl shadow-2xl border border-antiquegold/40 flex items-center space-x-3 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-antiquegold shrink-0" />
          <p className="text-sm font-medium">{toastMessage}</p>
        </div>
      )}

      {/* Top Bar Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl shadow-sm border border-antiquegold/15">
        <div className="flex items-center space-x-3">
          {onBackToSchedules && (
            <button 
              onClick={onBackToSchedules}
              className="p-2 rounded-xl bg-alabaster hover:bg-antiquegold/10 text-charcoal text-xs font-semibold flex items-center space-x-1"
            >
              <span>← Delivery Schedules</span>
            </button>
          )}
          <div>
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald animate-ping" />
              <span className="text-xs font-bold text-emerald uppercase tracking-wider">Live Vehicle Dispatch GPS</span>
            </div>
            <h1 className="font-serif font-bold text-lg md:text-xl text-charcoal">
              {activeTracker ? `${activeTracker.poId} • ${activeTracker.customerName}` : 'Live Shipment Tracking'}
            </h1>
          </div>
        </div>

        {/* Multi-Leg Selector Pills */}
        {activeTracker && activeTracker.legs.length > 1 && (
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <span className="text-xs font-bold text-charcoal/60 shrink-0">PO Shipment Legs:</span>
            {activeTracker.legs.map(leg => (
              <button
                key={leg.legId}
                onClick={() => handleSelectLeg(leg)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all ${
                  activeLeg?.legId === leg.legId
                    ? 'bg-emerald text-white shadow-sm'
                    : 'bg-alabaster text-charcoal hover:bg-antiquegold/10'
                }`}
              >
                {leg.legTitle.split(':')[0]} ({leg.hasLiveGps ? 'GPS Live' : 'Milestone'})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Interactive Map & Visual Tracking Container */}
      {!activeTracker || !activeLeg ? (
        <div className="bg-white p-12 rounded-2xl border border-dashed border-antiquegold/30 text-center space-y-3">
          <Truck className="w-12 h-12 text-antiquegold mx-auto opacity-50" />
          <p className="text-sm font-medium text-charcoal">No active shipment tracking session loaded.</p>
        </div>
      ) : (
        <div className="relative rounded-2xl overflow-hidden border border-antiquegold/20 shadow-lg min-h-[480px] bg-[#e5e3df] flex flex-col justify-between">
          
          {/* Visual Map Canvas Representation */}
          <div className="absolute inset-0 z-0 bg-[#e8ecef] overflow-hidden">
            {/* Map Roads & Topography SVG */}
            <svg className="w-full h-full opacity-60" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#d5dbdf" strokeWidth="0.8" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
              {/* Highway Curves */}
              <path d="M -50 300 Q 250 150 600 280 T 1200 200" fill="none" stroke="#ffffff" strokeWidth="24" />
              <path d="M -50 300 Q 250 150 600 280 T 1200 200" fill="none" stroke="#b0bec5" strokeWidth="12" strokeDasharray="8 8" />
              <path d="M 300 -50 L 300 600" fill="none" stroke="#ffffff" strokeWidth="18" />
              <path d="M 300 -50 L 300 600" fill="none" stroke="#cfd8dc" strokeWidth="8" />
            </svg>

            {/* Live GPS Pin Marker for Truck */}
            {activeLeg.hasLiveGps ? (
              <div className="absolute top-[38%] left-[42%] transform -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center animate-bounce">
                <div className="bg-charcoal text-white text-[11px] font-mono font-bold px-2.5 py-1 rounded-full shadow-lg border border-antiquegold flex items-center space-x-1">
                  <Truck className="w-3.5 h-3.5 text-antiquegold shrink-0" />
                  <span>{activeLeg.vehicleNumber.split(' ')[0]} ({activeLeg.speedKmph || 40} km/h)</span>
                </div>
                <div className="w-4 h-4 bg-emerald rounded-full border-2 border-white shadow-xl mt-1" />
                <div className="w-8 h-2 bg-black/20 rounded-full blur-xs mt-0.5" />
              </div>
            ) : (
              /* Fallback Milestone Banner Overlay on Map */
              <div className="absolute top-4 left-4 right-4 z-20 bg-amber-500/95 backdrop-blur-md text-charcoal p-3 rounded-xl border border-amber-600 shadow-md flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ShieldAlert className="w-5 h-5 text-charcoal shrink-0" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide">Milestone-Only Carrier Telematics</p>
                    <p className="text-[11px] text-charcoal/80">Regional supplier logistics vehicle without live telemetry. Status updated via dispatch log.</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-white text-charcoal text-xs font-bold rounded-lg shadow-xs">
                  {activeLeg.transitMilestone.toUpperCase()}
                </span>
              </div>
            )}

            {/* Destination Site Marker */}
            <div className="absolute top-[62%] left-[75%] transform -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center">
              <div className="bg-emerald text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-lg border border-white flex items-center space-x-1">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span>Site Gate: {activeTracker.customerName.split(' ')[0]}</span>
              </div>
              <div className="w-4 h-4 bg-antiquegold rounded-full border-2 border-white shadow-lg mt-1" />
            </div>

            {/* Connecting Route Line */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
              <line x1="42%" y1="38%" x2="75%" y2="62%" stroke="#0E4B3D" strokeWidth="4" strokeDasharray="6 6" />
            </svg>
          </div>

          {/* Top Floating Telemetry Header */}
          <div className="relative z-30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-b from-charcoal/90 via-charcoal/70 to-transparent text-white">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-antiquegold/20 border border-antiquegold/40 text-antiquegold">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <span className="text-[10px] font-mono text-antiquegold uppercase tracking-widest">
                  {activeLeg.legTitle}
                </span>
                <p className="font-serif font-bold text-base text-alabaster">
                  {activeLeg.vehicleNumber} ({activeLeg.vehicleType})
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="bg-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/20 text-right">
                <span className="text-[10px] uppercase font-bold text-alabaster/60 block">Estimated Arrival</span>
                <span className="font-mono text-sm font-bold text-emerald">{activeLeg.etaEstimate}</span>
              </div>

              {activeLeg.distanceRemainingKm && (
                <div className="bg-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/20 text-right">
                  <span className="text-[10px] uppercase font-bold text-alabaster/60 block">Distance Left</span>
                  <span className="font-mono text-sm font-bold text-antiquegold">{activeLeg.distanceRemainingKm} KM</span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Floating Sheet with Timeline & Actions */}
          <div className="relative z-30 bg-white/95 backdrop-blur-md border-t border-antiquegold/20 shadow-2xl rounded-t-2xl transition-all duration-300">
            {/* Sheet Toggle Header */}
            <div 
              onClick={() => setIsBottomSheetExpanded(!isBottomSheetExpanded)}
              className="p-3 flex items-center justify-between cursor-pointer border-b border-gray-100 hover:bg-alabaster/50"
            >
              <div className="flex items-center space-x-2">
                <Truck className="w-4 h-4 text-emerald" />
                <span className="text-xs font-bold text-charcoal uppercase tracking-wider">
                  Shipment Progress & Customer Timeline
                </span>
              </div>
              <div className="flex items-center space-x-2 text-charcoal/60 text-xs">
                <span>{isBottomSheetExpanded ? 'Collapse Details' : 'Expand Details'}</span>
                {isBottomSheetExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </div>
            </div>

            {/* Sheet Expanded Content */}
            {isBottomSheetExpanded && (
              <div className="p-4 space-y-5 max-h-[320px] overflow-y-auto">
                {/* Milestone Progression Rail - Ascension Line Pattern */}
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-charcoal/60 uppercase tracking-wider block">
                    Delivery Milestones (SOP Progress):
                  </span>
                  
                  <div className="grid grid-cols-4 gap-2 text-center relative">
                    {/* Horizontal Ascension Rail */}
                    <div className="absolute top-4 left-6 right-6 h-1 bg-gray-200 z-0" />
                    
                    {[
                      { id: 'dispatched', label: 'Dispatched', desc: 'Left Supplier Hub' },
                      { id: 'in_transit', label: 'In Transit', desc: 'En Route Highway' },
                      { id: 'nearby', label: 'Nearby (2km)', desc: 'Approaching Gate' },
                      { id: 'arrived', label: 'Arrived', desc: 'At Customer Site' }
                    ].map((m, idx) => {
                      const milestoneOrder = ['dispatched', 'in_transit', 'nearby', 'arrived'];
                      const currentIdx = milestoneOrder.indexOf(activeLeg.transitMilestone);
                      const stepIdx = milestoneOrder.indexOf(m.id);
                      const isPassed = stepIdx <= currentIdx;
                      const isCurrent = stepIdx === currentIdx;

                      return (
                        <div key={m.id} className="relative z-10 flex flex-col items-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all border-2 ${
                            isCurrent ? 'bg-antiquegold text-charcoal border-antiquegold shadow-lg scale-110 ring-4 ring-antiquegold/20' :
                            isPassed ? 'bg-emerald text-white border-emerald' :
                            'bg-white text-gray-400 border-gray-300'
                          }`}>
                            {isPassed ? '✓' : idx + 1}
                          </div>
                          <span className={`text-xs font-bold mt-1.5 ${isCurrent ? 'text-antiquegold' : 'text-charcoal'}`}>
                            {m.label}
                          </span>
                          <span className="text-[10px] text-charcoal/60 hidden sm:block">
                            {m.desc}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Driver & Carrier Details Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-gray-100 text-xs">
                  <div className="bg-alabaster/70 p-3 rounded-xl border border-antiquegold/10 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-full bg-emerald/10 border border-emerald/20 flex items-center justify-center text-emerald font-bold">
                        <User className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-bold text-charcoal">{activeLeg.driverName}</p>
                        <p className="text-charcoal/60">{activeLeg.driverPhone}</p>
                      </div>
                    </div>

                    <a 
                      href={`tel:${activeLeg.driverPhone}`}
                      className="px-3 py-1.5 bg-emerald text-white font-semibold rounded-lg shadow-xs flex items-center space-x-1 hover:bg-emerald/90"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Call Driver</span>
                    </a>
                  </div>

                  <div className="bg-alabaster/70 p-3 rounded-xl border border-antiquegold/10 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-charcoal/60 font-medium block">Destination Site:</span>
                      <p className="font-bold text-charcoal truncate">{activeTracker.siteAddress}</p>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-charcoal/60 font-medium block">WhatsApp Alert:</span>
                      <span className="px-2 py-0.5 rounded bg-emerald/15 text-emerald text-[10px] font-bold">
                        {activeLeg.customerNotifiedFlag ? 'AUTOMATED SENT' : 'PENDING'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* WhatsApp Automated Communication Log */}
                {activeLeg.whatsappNotificationLog && activeLeg.whatsappNotificationLog.length > 0 && (
                  <div className="p-3 bg-green-50/60 border border-green-200 rounded-xl space-y-1 text-xs">
                    <div className="flex items-center space-x-1 text-emerald font-bold">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Automated Customer Communication Log (WhatsApp):</span>
                    </div>
                    {activeLeg.whatsappNotificationLog.map((log, idx) => (
                      <p key={idx} className="text-gray-700 font-mono text-[11px] italic">
                        [{new Date(log.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}] "{log.messageText}"
                      </p>
                    ))}
                  </div>
                )}

                {/* Admin / Supplier Manual Controls for Milestone Advancement */}
                {!isCustomer && (
                  <div className="pt-3 border-t flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-charcoal/70">
                      Admin Logistics Controls:
                    </span>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleAdvanceMilestone('in_transit')}
                        className="px-3 py-1.5 bg-alabaster hover:bg-antiquegold/10 text-charcoal text-xs font-medium rounded-lg border border-antiquegold/20"
                      >
                        Set In Transit
                      </button>
                      <button
                        onClick={() => handleAdvanceMilestone('nearby')}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg shadow-xs"
                      >
                        Set Nearby (2km)
                      </button>
                      <button
                        onClick={() => handleAdvanceMilestone('arrived')}
                        className="px-3 py-1.5 bg-emerald hover:bg-emerald/90 text-white text-xs font-semibold rounded-lg shadow-xs"
                      >
                        Set Arrived
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
