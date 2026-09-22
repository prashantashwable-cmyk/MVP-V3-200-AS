import React, { useState, useEffect } from 'react';
import { User, PurchaseOrder, POLineItem, POStatusHistoryEntry } from '../types';
import { DbManager } from '../lib/db';
import { Card } from './Common';
import { bridgeProcurementPoStatusChanged } from '../services/legacyCommercialBridge';
import { 
  Truck, Clock, AlertTriangle, CheckCircle2, ChevronRight, ChevronLeft, 
  Search, Filter, Calendar, MapPin, Building, ArrowRight, UserCheck, 
  RotateCcw, ShieldAlert, FileText, Check, AlertCircle, ExternalLink, RefreshCw, Save
} from 'lucide-react';

interface SupplierOrderStatusTrackingProps {
  user: User;
  onNavigateToLogistics?: (poId: string) => void;
  onNavigateToPOGenerator?: () => void;
}

type POStatusStage = 'Sent' | 'Acknowledged' | 'In Production' | 'Ready to Ship' | 'Shipped' | 'Delivered';

const KANBAN_STAGES: { id: POStatusStage; label: string; desc: string; icon: any }[] = [
  { id: 'Sent', label: 'Sent to Vendor', desc: 'PO issued, awaiting supplier confirmation', icon: FileText },
  { id: 'Acknowledged', label: 'Acknowledged', desc: 'Supplier confirmed lead time & specifications', icon: UserCheck },
  { id: 'In Production', label: 'In Production', desc: 'Components being manufactured/assembled', icon: Clock },
  { id: 'Ready to Ship', label: 'Ready to Ship', desc: 'Factory QC passed, awaiting dispatch', icon: CheckCircle2 },
  { id: 'Shipped', label: 'In Transit', desc: 'Dispatched via freight courier to site/hub', icon: Truck },
  { id: 'Delivered', label: 'Delivered at Site', desc: 'Received & verified by site manager', icon: Check }
];

export const SupplierOrderStatusTracking: React.FC<SupplierOrderStatusTrackingProps> = ({ 
  user, 
  onNavigateToLogistics,
  onNavigateToPOGenerator
}) => {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [selectedStage, setSelectedStage] = useState<POStatusStage>('In Production');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState('All');

  // Modal / Action States
  const [activePoModal, setActivePoModal] = useState<PurchaseOrder | null>(null);
  const [newStatusNote, setNewStatusNote] = useState('');
  const [targetStatus, setTargetStatus] = useState<POStatusStage | 'Cancelled'>('In Production');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  useEffect(() => {
    loadOrders();
    const handleDbUpdate = () => loadOrders();
    window.addEventListener('aiec_db_update', handleDbUpdate);
    return () => window.removeEventListener('aiec_db_update', handleDbUpdate);
  }, []);

  const loadOrders = () => {
    let pos = DbManager.getPurchaseOrders();
    if (user.role === 'supplier') {
      pos = pos.filter(p => p.supplierId === user.supplierId || p.supplierName.toLowerCase().includes(user.name.toLowerCase()));
    }
    setPurchaseOrders(pos);
  };

  // Auto calculate delay risk flag
  const checkDelayRisk = (po: PurchaseOrder): boolean => {
    if (po.status === 'Delivered' || po.status === 'Cancelled') return false;
    const expected = new Date(po.expectedDeliveryDate).getTime();
    const now = Date.now();
    // If expected delivery is within 2 days or past, or if in production for >10 days without moving to Ready to Ship
    const daysUntilDelivery = (expected - now) / (1000 * 60 * 60 * 24);
    return daysUntilDelivery < 2 || (po.status === 'In Production' && daysUntilDelivery < 4);
  };

  const filteredOrders = purchaseOrders.filter(po => {
    const matchesSearch = po.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      po.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      po.supplierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      po.siteLocation.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSupplier = selectedSupplierFilter === 'All' || po.supplierId === selectedSupplierFilter;
    return matchesSearch && matchesSupplier;
  });

  const getStageOrders = (stageId: POStatusStage) => {
    return filteredOrders.filter(po => po.status === stageId);
  };

  const handleOpenStatusModal = (po: PurchaseOrder) => {
    setActivePoModal(po);
    setTargetStatus(po.status as POStatusStage);
    setNewStatusNote('');
  };

  const handleUpdatePOStatus = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePoModal) return;

    setIsUpdatingStatus(true);

    const nowIso = new Date().toISOString();
    const newHistoryEntry: POStatusHistoryEntry = {
      status: targetStatus as any,
      timestamp: nowIso,
      updatedBy: `${user.name} (${user.role.toUpperCase()})`,
      note: newStatusNote || `Status updated to ${targetStatus}`
    };

    const existingHistory = activePoModal.statusHistory || [];

    const updatedPo: PurchaseOrder = {
      ...activePoModal,
      status: targetStatus as any,
      actualStatusUpdateTimestamp: nowIso,
      statusHistory: [newHistoryEntry, ...existingHistory],
      delayRiskFlag: checkDelayRisk(activePoModal)
    };

    DbManager.updatePurchaseOrder(updatedPo);
    setIsUpdatingStatus(false);
    setActivePoModal(null);

    // Phase 16: bridge into the matching canonical PurchaseOrder
    // transition (Acknowledged/In Production/Shipped), in addition to
    // the DbManager write above — see legacyCommercialBridge.ts.
    bridgeProcurementPoStatusChanged(
      { id: user.id, role: user.role, isDemo: user.isDemo, authMethod: user.authMethod },
      updatedPo,
      updatedPo.status,
    ).then(result => {
      if (!result.bridged) {
        console.warn(`[Phase 16 bridge] PO ${updatedPo.id} status "${updatedPo.status}" not mirrored to canonical model: ${result.reason}`);
      }
    });
  };

  const handleUpdateLineItemStatus = (po: PurchaseOrder, itemId: string, itemStatus: POLineItem['itemStatus']) => {
    const updatedLineItems = po.lineItems.map(item => {
      if (item.itemId === itemId) {
        return { ...item, itemStatus };
      }
      return item;
    });

    DbManager.updatePurchaseOrder({
      ...po,
      lineItems: updatedLineItems,
      actualStatusUpdateTimestamp: new Date().toISOString()
    });
  };

  const uniqueSuppliersMap = new Map<string, string>();
  purchaseOrders.forEach(p => uniqueSuppliersMap.set(p.supplierId, p.supplierName));
  const uniqueSuppliers = Array.from(uniqueSuppliersMap.entries()).map(([id, name]) => ({ id, name }));

  const currentStageIndex = KANBAN_STAGES.findIndex(s => s.id === selectedStage);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner / Header */}
      <div className="bg-surface p-6 rounded-2xl border border-gold/15 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-antiquegold bg-antiquegold/10 px-2.5 py-1 rounded-full border border-antiquegold/20">
              Module 10 • Screen 5
            </span>
            <span className="text-xs font-semibold text-royalemerald bg-royalemerald/10 px-2.5 py-1 rounded-full border border-royalemerald/20 flex items-center gap-1">
              <Truck className="w-3.5 h-3.5" /> Synchronized Fulfillment Tracker
            </span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-charcoal mt-2">
            Supplier Order Status Tracking Board
          </h1>
          <p className="text-sm text-charcoal/70 mt-1">
            Real-time status tracking from factory production through site delivery with automated delay risk alerts.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {onNavigateToPOGenerator && (
            <button
              onClick={onNavigateToPOGenerator}
              className="w-full md:w-auto px-4 py-2.5 rounded-xl border border-gold/30 bg-surface hover:bg-gold/10 text-charcoal text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4 text-antiquegold" />
              PO Generator
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <Card className="p-4 bg-surface border-gold/15 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-charcoal/40 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by PO #, Customer, Supplier, or Site Location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-background border border-gold/20 rounded-xl pl-9 pr-4 py-2 text-sm text-charcoal placeholder-charcoal/40 focus:outline-none focus:border-antiquegold"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <Filter className="w-4 h-4 text-antiquegold shrink-0" />
            <select
              value={selectedSupplierFilter}
              onChange={(e) => setSelectedSupplierFilter(e.target.value)}
              className="bg-background border border-gold/20 rounded-xl px-3 py-2 text-xs font-semibold text-charcoal focus:outline-none focus:border-antiquegold w-full md:w-auto"
            >
              <option value="All">All Suppliers ({purchaseOrders.length} POs)</option>
              {uniqueSuppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Mobile Stage Selector Strip */}
      <div className="md:hidden space-y-3">
        <div className="flex items-center justify-between bg-surface p-2 rounded-xl border border-gold/15">
          <button
            disabled={currentStageIndex === 0}
            onClick={() => setSelectedStage(KANBAN_STAGES[currentStageIndex - 1].id)}
            className="p-2 rounded-lg text-charcoal disabled:opacity-30 hover:bg-gold/10"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="text-center">
            <span className="text-[11px] uppercase tracking-wider text-antiquegold font-semibold">
              Stage {currentStageIndex + 1} of {KANBAN_STAGES.length}
            </span>
            <h3 className="text-sm font-bold text-charcoal">
              {KANBAN_STAGES[currentStageIndex].label}
            </h3>
          </div>

          <button
            disabled={currentStageIndex === KANBAN_STAGES.length - 1}
            onClick={() => setSelectedStage(KANBAN_STAGES[currentStageIndex + 1].id)}
            className="p-2 rounded-lg text-charcoal disabled:opacity-30 hover:bg-gold/10"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Horizontal Tab Strip */}
        <div className="flex overflow-x-auto gap-2 pb-1 no-scrollbar">
          {KANBAN_STAGES.map((stg) => {
            const count = getStageOrders(stg.id).length;
            const isSelected = selectedStage === stg.id;
            return (
              <button
                key={stg.id}
                onClick={() => setSelectedStage(stg.id)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold shrink-0 transition flex items-center gap-1.5 border ${
                  isSelected 
                    ? 'bg-antiquegold text-white border-antiquegold shadow-sm' 
                    : 'bg-surface text-charcoal border-gold/15'
                }`}
              >
                <span>{stg.label}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-gold/10 text-antiquegold'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop / Wide Kanban Board (And Mobile Single Column View) */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {KANBAN_STAGES.map((stg) => {
          const stageOrders = getStageOrders(stg.id);
          const stageTotalVal = stageOrders.reduce((sum, p) => sum + p.totalAmount, 0);
          const isMobileHidden = selectedStage !== stg.id;

          return (
            <div 
              key={stg.id} 
              className={`space-y-3 ${isMobileHidden ? 'hidden md:block' : 'block'}`}
            >
              {/* Column Header */}
              <div className="bg-surface p-3 rounded-xl border border-gold/15 flex flex-col justify-between min-h-[70px]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-charcoal flex items-center gap-1">
                    <stg.icon className="w-3.5 h-3.5 text-antiquegold" />
                    {stg.label}
                  </span>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 bg-antiquegold/10 text-antiquegold rounded-full">
                    {stageOrders.length}
                  </span>
                </div>
                <div className="text-[11px] font-mono font-semibold text-royalemerald mt-1">
                  ₹{(stageTotalVal / 100000).toFixed(1)} L
                </div>
              </div>

              {/* Column Cards Container */}
              <div className="space-y-3 min-h-[300px]">
                {stageOrders.length === 0 ? (
                  <div className="border border-dashed border-gold/20 rounded-xl p-4 text-center text-charcoal/40 text-xs">
                    No orders in {stg.label}
                  </div>
                ) : (
                  stageOrders.map(po => {
                    const isDelayed = checkDelayRisk(po);

                    return (
                      <Card 
                        key={po.id} 
                        className={`p-3.5 bg-surface border transition-all hover:border-gold/40 shadow-sm ${
                          isDelayed 
                            ? 'border-red-500/40 bg-red-500/5' 
                            : 'border-gold/15'
                        }`}
                      >
                        {/* Header Badge & Delayed Flag */}
                        <div className="flex items-center justify-between gap-1 mb-2">
                          <span className="font-mono text-xs font-bold text-antiquegold">
                            {po.id}
                          </span>
                          {isDelayed && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white flex items-center gap-1 animate-pulse">
                              <AlertTriangle className="w-3 h-3" /> Delay Risk
                            </span>
                          )}
                        </div>

                        {/* Customer & Site */}
                        <div className="space-y-0.5 text-xs">
                          <h4 className="font-bold text-charcoal line-clamp-1">{po.customerName}</h4>
                          <p className="text-[11px] text-charcoal/60 flex items-center gap-1 line-clamp-1">
                            <MapPin className="w-3 h-3 text-royalemerald shrink-0" />
                            {po.siteLocation}
                          </p>
                          <p className="text-[11px] text-charcoal/60 flex items-center gap-1 line-clamp-1">
                            <Building className="w-3 h-3 text-antiquegold shrink-0" />
                            {po.supplierName}
                          </p>
                        </div>

                        {/* Line Items Summary */}
                        <div className="mt-2 pt-2 border-t border-gold/10 text-[11px] space-y-1">
                          <div className="text-charcoal/70 font-semibold">
                            {po.lineItems.length} Component(s):
                          </div>
                          {po.lineItems.map((li, idx) => (
                            <div key={idx} className="flex justify-between items-center gap-2 text-[10px] font-mono">
                              <span className="text-charcoal/80 truncate max-w-[120px] min-w-0">{li.itemName}</span>
                              <span className="text-charcoal/50 shrink-0">x{li.quantity}</span>
                            </div>
                          ))}
                        </div>

                        {/* Delivery Date & Amount */}
                        <div className="mt-3 pt-2 border-t border-gold/15 flex justify-between items-end text-xs">
                          <div>
                            <span className="text-[10px] text-charcoal/50 block">Expected Date</span>
                            <span className={`font-mono font-bold ${isDelayed ? 'text-red-600' : 'text-charcoal'}`}>
                              {po.expectedDeliveryDate}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-mono font-bold text-royalemerald">
                              ₹{po.totalAmount.toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="mt-3 flex items-center justify-between gap-1">
                          <button
                            onClick={() => handleOpenStatusModal(po)}
                            className="flex-1 px-2 py-1.5 rounded-lg bg-antiquegold/10 hover:bg-antiquegold/20 text-antiquegold text-[11px] font-semibold transition text-center"
                          >
                            Update Status
                          </button>

                          {(po.status === 'Shipped' || po.status === 'Delivered') && onNavigateToLogistics && (
                            <button
                              onClick={() => onNavigateToLogistics(po.id)}
                              title="View Logistics & Site Receiving"
                              className="p-1.5 rounded-lg bg-royalemerald/10 hover:bg-royalemerald/20 text-royalemerald text-[11px] transition"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Update Status & Timeline Modal */}
      {activePoModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <Card className="p-6 max-w-xl w-full bg-surface border-gold/30 shadow-xl space-y-4 my-8">
            <div className="flex justify-between items-center border-b border-gold/15 pb-3">
              <div>
                <h3 className="text-base font-serif font-bold text-charcoal">
                  Update PO Fulfillment Status
                </h3>
                <p className="text-xs text-charcoal/60 font-mono">{activePoModal.id} • {activePoModal.supplierName}</p>
              </div>
              <button onClick={() => setActivePoModal(null)} className="text-charcoal/50 hover:text-charcoal p-1">
                <AlertCircle className="w-5 h-5 rotate-45" />
              </button>
            </div>

            <form onSubmit={handleUpdatePOStatus} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-charcoal/80 mb-1">Target Fulfillment Stage</label>
                <select
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value as any)}
                  className="w-full bg-background border border-gold/20 rounded-xl px-3 py-2 text-sm font-semibold text-charcoal focus:outline-none focus:border-antiquegold"
                >
                  <option value="Sent">1. Sent to Vendor</option>
                  <option value="Acknowledged">2. Acknowledged by Vendor</option>
                  <option value="In Production">3. In Production (Factory Assembly)</option>
                  <option value="Ready to Ship">4. Ready to Ship (Passed Factory QC)</option>
                  <option value="Shipped">5. In Transit (Dispatched Freight)</option>
                  <option value="Delivered">6. Delivered at Installation Site</option>
                  <option value="Cancelled">Cancelled / Terminated Order</option>
                </select>
                {targetStatus !== activePoModal.status && (
                  <p className="text-[11px] text-antiquegold font-medium mt-1 flex items-center gap-1">
                    <ArrowRight className="w-3 h-3" /> Transitioning stage from {activePoModal.status} to {targetStatus}
                  </p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-charcoal/80 mb-1">Status Note / Dispatch Remarks</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Factory QC completed, LR #44109 dispatched via V-Trans Logistics..."
                  value={newStatusNote}
                  onChange={(e) => setNewStatusNote(e.target.value)}
                  className="w-full bg-background border border-gold/20 rounded-xl p-3 text-xs text-charcoal focus:outline-none focus:border-antiquegold"
                />
              </div>

              {/* Per Line Item Granularity Status */}
              <div className="border-t border-gold/15 pt-3 space-y-2">
                <label className="block font-semibold text-charcoal/80">
                  Line Item Granular Status (Partial Shipments):
                </label>
                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {activePoModal.lineItems.map((item) => (
                    <div key={item.itemId} className="p-2.5 bg-background rounded-xl border border-gold/15 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-charcoal block">{item.itemName}</span>
                        <span className="text-[10px] text-charcoal/50 font-mono">Qty: {item.quantity}</span>
                      </div>
                      <select
                        value={item.itemStatus || 'In Production'}
                        onChange={(e) => handleUpdateLineItemStatus(activePoModal, item.itemId, e.target.value as any)}
                        className="bg-surface border border-gold/20 rounded-lg px-2 py-1 text-xs text-charcoal font-semibold"
                      >
                        <option value="In Production">In Production</option>
                        <option value="Ready to Ship">Ready to Ship</option>
                        <option value="Shipped">Shipped</option>
                        <option value="Delivered">Delivered</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status History Timeline */}
              <div className="border-t border-gold/15 pt-3 space-y-2">
                <span className="font-semibold text-charcoal/80 block">Status Audit Log History:</span>
                <div className="space-y-1.5 max-h-32 overflow-y-auto text-[11px]">
                  {(!activePoModal.statusHistory || activePoModal.statusHistory.length === 0) ? (
                    <p className="text-charcoal/50 italic">Initial order creation timestamp logged.</p>
                  ) : (
                    activePoModal.statusHistory.map((h, idx) => (
                      <div key={idx} className="p-2 bg-background rounded-lg border border-gold/10 flex justify-between items-start">
                        <div>
                          <span className="font-bold text-royalemerald">{h.status}</span>
                          <span className="text-charcoal/60 block text-[10px]">{h.note}</span>
                        </div>
                        <div className="text-right font-mono text-[10px] text-charcoal/50">
                          <div>{h.updatedBy}</div>
                          <div>{new Date(h.timestamp).toLocaleDateString()}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gold/15">
                <button
                  type="button"
                  onClick={() => setActivePoModal(null)}
                  className="px-4 py-2 rounded-xl border border-gold/20 text-charcoal/70 hover:bg-gold/10 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingStatus}
                  className="px-5 py-2 rounded-xl bg-antiquegold hover:bg-antiquegold/90 text-white font-semibold shadow-sm flex items-center gap-1.5"
                >
                  {isUpdatingStatus ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save Status Update
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};
