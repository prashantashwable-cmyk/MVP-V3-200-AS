import React, { useState, useEffect } from 'react';
import { 
  Package, CheckCircle2, AlertTriangle, Camera, FileText, 
  ChevronRight, ArrowLeft, ShieldCheck, User as UserIcon, Phone,
  Plus, Trash2, Info, Lock, Truck, RefreshCw, Check
} from 'lucide-react';
import { DbManager } from '../lib/db';
import { bridgeMaterialReceiptRecorded } from '../services/legacyCommercialBridge';
import { 
  SiteDeliveryChecklist, SiteDeliveryChecklistItem, 
  DiscrepancyReport, User as UserType 
} from '../types';

interface Props {
  user: UserType;
  selectedPoId?: string;
  onNavigateToConfirmation?: (poId: string) => void;
  onNavigateToDiscrepancy?: (reportId: string) => void;
}

export const SiteDeliveryChecklistScreen: React.FC<Props> = ({
  user,
  selectedPoId,
  onNavigateToConfirmation,
  onNavigateToDiscrepancy
}) => {
  const [checklists, setChecklists] = useState<SiteDeliveryChecklist[]>([]);
  const [activeChecklist, setActiveChecklist] = useState<SiteDeliveryChecklist | null>(null);
  const [items, setItems] = useState<SiteDeliveryChecklistItem[]>([]);
  const [receiverName, setReceiverName] = useState(user.name || '');
  const [receiverRole, setReceiverRole] = useState<'technician' | 'site_engineer' | 'customer_rep'>('technician');
  const [receiverPhone, setReceiverPhone] = useState(user.phone || '');
  const [deliveryType, setDeliveryType] = useState<'full' | 'partial'>('full');
  
  // Photo modal simulation
  const [photoModalItemId, setPhotoModalItemId] = useState<string | null>(null);
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  
  // Feedback toasts
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [selectedPoId]);

  const loadData = () => {
    const list = DbManager.getSiteDeliveryChecklists();
    setChecklists(list);

    let match = list.find(c => c.poId === selectedPoId);
    if (!match && list.length > 0) {
      match = list[0];
    }

    if (match) {
      setActiveChecklist(match);
      setItems(match.items);
      setReceiverName(match.receivedBy || user.name);
      setReceiverRole(match.receiverRole || 'technician');
      setReceiverPhone(match.receiverPhone || user.phone);
      setDeliveryType(match.deliveryType || 'full');
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleUpdateItemCondition = (
    itemId: string, 
    condition: 'good' | 'minor_scratches' | 'damaged' | 'missing'
  ) => {
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        let newVerified = item.verified;
        // If good or minor scratches, auto verify; if damaged/missing, mark verified to acknowledge discrepancy
        return { ...item, condition, verified: true };
      }
      return item;
    }));
  };

  const handleUpdateItemQty = (itemId: string, delta: number) => {
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const newQty = Math.max(0, item.receivedQty + delta);
        const newCond = newQty < item.expectedQty ? 'missing' : (item.condition === 'missing' ? 'good' : item.condition);
        return { ...item, receivedQty: newQty, condition: newCond, verified: true };
      }
      return item;
    }));
  };

  const handleToggleVerified = (itemId: string) => {
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, verified: !item.verified };
      }
      return item;
    }));
  };

  const handleAddPhoto = (itemId: string) => {
    const samplePhotos = [
      'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=300',
      'https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=300',
      'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=300',
      'https://images.unsplash.com/photo-1517646287270-a5a9ca602e5c?w=300'
    ];
    const randomPhoto = samplePhotos[Math.floor(Math.random() * samplePhotos.length)];

    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, photos: [...item.photos, randomPhoto] };
      }
      return item;
    }));
    showToast('Photo evidence captured & attached to checklist item');
  };

  const handleRemovePhoto = (itemId: string, photoIdx: number) => {
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const newPhotos = item.photos.filter((_, idx) => idx !== photoIdx);
        return { ...item, photos: newPhotos };
      }
      return item;
    }));
  };

  const handleSaveChecklistProgress = () => {
    if (!activeChecklist) return;

    const hasDiscrepancy = items.some(
      i => i.condition === 'damaged' || i.condition === 'missing' || i.receivedQty < i.expectedQty
    );

    const updated: SiteDeliveryChecklist = {
      ...activeChecklist,
      items,
      receivedBy: receiverName,
      receiverRole,
      receiverPhone,
      deliveryType,
      discrepancyFlag: hasDiscrepancy,
      status: 'in_progress',
      updatedAt: new Date().toISOString()
    };

    DbManager.updateSiteDeliveryChecklist(updated);
    setActiveChecklist(updated);
    showToast('Delivery checklist progress auto-saved');
  };

  const handleCompleteChecklist = () => {
    if (!activeChecklist) return;

    const unverifiedMandatory = items.filter(i => i.isMandatory && !i.verified);
    if (unverifiedMandatory.length > 0) {
      alert(`Please verify all mandatory safety/core components (${unverifiedMandatory.length} items remaining).`);
      return;
    }

    const hasDiscrepancy = items.some(
      i => i.condition === 'damaged' || i.condition === 'missing' || i.receivedQty < i.expectedQty
    );

    let discReportId = activeChecklist.discrepancyReportId;

    if (hasDiscrepancy) {
      const discrepantItems = items
        .filter(i => i.condition === 'damaged' || i.condition === 'missing' || i.receivedQty < i.expectedQty)
        .map(i => `${i.itemName} (${i.condition.toUpperCase()}: Rec ${i.receivedQty}/${i.expectedQty})`);

      const newDiscReport: DiscrepancyReport = {
        id: `disc_${activeChecklist.poId}_${Date.now().toString().slice(-4)}`,
        poId: activeChecklist.poId,
        supplierId: activeChecklist.supplierId,
        supplierName: activeChecklist.supplierName,
        customerName: activeChecklist.customerName,
        itemNames: discrepantItems,
        issueSummary: `On-site checklist logged discrepancies across ${discrepantItems.length} line items upon unboxing.`,
        photos: items.flatMap(i => i.photos),
        status: 'open_investigating',
        reportedAt: new Date().toISOString()
      };

      DbManager.addDiscrepancyReport(newDiscReport);
      discReportId = newDiscReport.id;
    }

    const updated: SiteDeliveryChecklist = {
      ...activeChecklist,
      items,
      receivedBy: receiverName,
      receiverRole,
      receiverPhone,
      deliveryType,
      discrepancyFlag: hasDiscrepancy,
      discrepancyReportId: discReportId,
      status: hasDiscrepancy ? 'discrepancy_filed' : 'completed',
      completedAt: new Date().toISOString(),
      paymentTriggered: true,
      updatedAt: new Date().toISOString()
    };

    DbManager.updateSiteDeliveryChecklist(updated);

    // Also update Purchase Order status to Delivered
    const pos = DbManager.getPurchaseOrders();
    const targetPo = pos.find(p => p.id === activeChecklist.poId);
    if (targetPo) {
      targetPo.status = 'Delivered';
      DbManager.updatePurchaseOrder(targetPo);
    }

    showToast('Delivery Checklist Completed! Payment release milestone unlocked.');

    // Phase 17: bridge into a real canonical DeliveryReceipt (ok, or an
    // audited damaged/missing incident), in addition to the DbManager
    // writes above — see legacyCommercialBridge.ts.
    const missingItem = items.some(i => i.condition === 'missing');
    const receiptCondition: 'ok' | 'damaged' | 'missing_items' = !hasDiscrepancy ? 'ok' : missingItem ? 'missing_items' : 'damaged';
    bridgeMaterialReceiptRecorded(
      { id: user.id, role: user.role, isDemo: user.isDemo, authMethod: user.authMethod },
      activeChecklist.poId,
      receiptCondition,
    ).then(result => {
      if (!result.bridged) {
        console.warn(`[Phase 17 bridge] material receipt for PO ${activeChecklist.poId} not mirrored to canonical model: ${result.reason}`);
      }
    });

    if (onNavigateToConfirmation) {
      setTimeout(() => onNavigateToConfirmation(activeChecklist.poId), 600);
    }
  };

  const verifiedCount = items.filter(i => i.verified).length;
  const totalCount = items.length;
  const progressPercent = totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 0;
  const hasDiscrepancies = items.some(
    i => i.condition === 'damaged' || i.condition === 'missing' || i.receivedQty < i.expectedQty
  );

  return (
    <div className="min-h-screen bg-alabaster text-charcoal p-4 md:p-6 pb-28 max-w-5xl mx-auto space-y-6">
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-royalemerald text-white px-4 py-3 rounded-xl shadow-lg border border-antiquegold/30 flex items-center space-x-2 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-antiquegold" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Screen Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-antiquegold/20 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-royalemerald/10 text-royalemerald border border-royalemerald/20">
              SOP Step #3 • Site Unboxing & Inspection
            </span>
            <span className="text-xs text-charcoal/60">Module 11</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-charcoal mt-1">
            Site Delivery Inspection Checklist
          </h1>
          <p className="text-sm text-charcoal/70">
            Field verification for unboxing condition, physical piece count, and proof-of-delivery photos.
          </p>
        </div>

        {/* PO Switcher Dropdown */}
        <div className="flex items-center space-x-2">
          <label className="text-xs font-semibold text-charcoal/70 whitespace-nowrap">Active PO:</label>
          <select
            value={activeChecklist?.poId || ''}
            onChange={(e) => {
              const selected = checklists.find(c => c.poId === e.target.value);
              if (selected) {
                setActiveChecklist(selected);
                setItems(selected.items);
              }
            }}
            className="bg-white border border-antiquegold/30 text-charcoal text-sm rounded-xl px-3 py-2 focus:ring-2 focus:ring-antiquegold"
          >
            {checklists.map(c => (
              <option key={c.id} value={c.poId}>
                {c.poId} — {c.customerName.slice(0, 22)}...
              </option>
            ))}
          </select>
        </div>
      </div>

      {activeChecklist ? (
        <>
          {/* PO Summary Card */}
          <div className="bg-white rounded-2xl p-5 border border-antiquegold/20 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
              <div>
                <span className="text-xs font-semibold text-antiquegold uppercase tracking-wider">Purchase Order</span>
                <h2 className="text-lg font-bold text-charcoal flex items-center space-x-2">
                  <span>{activeChecklist.poId}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-normal border border-blue-200">
                    Supplier: {activeChecklist.supplierName}
                  </span>
                </h2>
              </div>
              <div className="text-right">
                <span className="text-xs text-charcoal/60">Delivery Mode</span>
                <div className="flex items-center space-x-2 mt-0.5">
                  <button
                    onClick={() => setDeliveryType('full')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                      deliveryType === 'full' 
                        ? 'bg-royalemerald text-white shadow-sm' 
                        : 'bg-gray-100 text-charcoal/70 hover:bg-gray-200'
                    }`}
                  >
                    Full Shipment
                  </button>
                  <button
                    onClick={() => setDeliveryType('partial')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                      deliveryType === 'partial' 
                        ? 'bg-amber-600 text-white shadow-sm' 
                        : 'bg-gray-100 text-charcoal/70 hover:bg-gray-200'
                    }`}
                  >
                    Partial Delivery
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="flex items-start space-x-2">
                <Package className="w-4 h-4 text-royalemerald mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-xs text-charcoal/60 block">Customer Site & Location</span>
                  <span className="font-semibold text-charcoal">{activeChecklist.customerName}</span>
                  <p className="text-xs text-charcoal/70">{activeChecklist.siteAddress}</p>
                </div>
              </div>
              <div className="flex items-start space-x-2">
                <UserIcon className="w-4 h-4 text-antiquegold mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-xs text-charcoal/60 block">On-Site Receiving Officer</span>
                  <span className="font-semibold text-charcoal">{receiverName} ({receiverRole})</span>
                  <p className="text-xs text-charcoal/70">{receiverPhone}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Ascension Line Vertical Progress Bar */}
          <div className="bg-white rounded-2xl p-5 border border-antiquegold/20 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-antiquegold animate-pulse" />
                <h3 className="text-sm font-bold text-charcoal">Inspection Progress (Ascension Line)</h3>
              </div>
              <span className="text-xs font-mono font-bold text-royalemerald bg-royalemerald/10 px-2.5 py-1 rounded-full">
                {verifiedCount} / {totalCount} Items Verified ({progressPercent}%)
              </span>
            </div>

            {/* Visual Rail */}
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden border border-gray-200">
              <div 
                className="bg-gradient-to-r from-antiquegold to-royalemerald h-full transition-all duration-500 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {hasDiscrepancies && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-2 text-xs text-red-800">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Discrepancies Detected on Site:</span> One or more items are damaged or missing pieces. A formal Discrepancy Report will auto-generate upon checklist submission.
                </div>
              </div>
            )}
          </div>

          {/* Checklist Items Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-serif font-bold text-charcoal flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-royalemerald" />
                <span>Line Item Physical Inspection</span>
              </h3>
              <span className="text-xs text-charcoal/60">
                Tap items to update count, photos, or physical condition
              </span>
            </div>

            {items.map((item, index) => (
              <div 
                key={item.id}
                className={`bg-white rounded-2xl p-5 border transition-all ${
                  item.verified 
                    ? 'border-royalemerald/40 shadow-sm bg-gradient-to-r from-white to-emerald-50/20' 
                    : 'border-antiquegold/20 shadow-sm'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  {/* Left item details */}
                  <div className="flex items-start space-x-3">
                    <button
                      onClick={() => handleToggleVerified(item.id)}
                      className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition flex-shrink-0 mt-0.5 ${
                        item.verified 
                          ? 'bg-royalemerald border-royalemerald text-white shadow-sm' 
                          : 'border-gray-300 hover:border-antiquegold text-transparent'
                      }`}
                      title={item.verified ? 'Verified' : 'Click to verify'}
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                    </button>

                    <div>
                      <div className="flex items-center space-x-2 flex-wrap">
                        <span className="font-bold text-charcoal text-base">{item.itemName}</span>
                        {item.isMandatory && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                            MANDATORY QC
                          </span>
                        )}
                        {item.partNumber && (
                          <span className="text-xs font-mono text-gray-500">[{item.partNumber}]</span>
                        )}
                      </div>

                      {/* Quantity counter */}
                      <div className="flex items-center space-x-4 mt-2">
                        <span className="text-xs text-charcoal/70">Quantity Check:</span>
                        <div className="flex items-center space-x-2 bg-gray-50 border border-gray-200 rounded-lg p-1">
                          <button
                            onClick={() => handleUpdateItemQty(item.id, -1)}
                            className="w-6 h-6 bg-white rounded border border-gray-300 text-charcoal font-bold flex items-center justify-center hover:bg-gray-100"
                          >
                            -
                          </button>
                          <span className="text-xs font-mono font-bold px-2">
                            {item.receivedQty} / {item.expectedQty} units
                          </span>
                          <button
                            onClick={() => handleUpdateItemQty(item.id, 1)}
                            className="w-6 h-6 bg-white rounded border border-gray-300 text-charcoal font-bold flex items-center justify-center hover:bg-gray-100"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Condition Selector */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                    <span className="text-xs font-semibold text-charcoal/70">Condition:</span>
                    <div className="flex items-center space-x-1 bg-gray-50 p-1 rounded-xl border border-gray-200">
                      {(['good', 'minor_scratches', 'damaged', 'missing'] as const).map((cond) => {
                        const isSelected = item.condition === cond;
                        let colorClasses = 'bg-white text-gray-600 hover:bg-gray-100';
                        if (isSelected) {
                          if (cond === 'good') colorClasses = 'bg-royalemerald text-white shadow-sm';
                          if (cond === 'minor_scratches') colorClasses = 'bg-amber-500 text-white shadow-sm';
                          if (cond === 'damaged' || cond === 'missing') colorClasses = 'bg-red-600 text-white shadow-sm';
                        }

                        return (
                          <button
                            key={cond}
                            onClick={() => handleUpdateItemCondition(item.id, cond)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition ${colorClasses}`}
                          >
                            {cond.replace('_', ' ')}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Photo & Notes attachments */}
                <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <Camera className="w-4 h-4 text-antiquegold" />
                      <span className="text-xs font-semibold text-charcoal/80">Proof Photos ({item.photos.length}):</span>
                    </div>
                    <button
                      onClick={() => handleAddPhoto(item.id)}
                      className="px-2.5 py-1 bg-antiquegold/10 text-antiquegold hover:bg-antiquegold/20 rounded-lg text-xs font-semibold flex items-center space-x-1 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Snap Photo / Attach</span>
                    </button>
                  </div>

                  {/* Photo Thumbnails */}
                  {item.photos.length > 0 && (
                    <div className="flex items-center space-x-2 overflow-x-auto py-1">
                      {item.photos.map((photo, pIdx) => (
                        <div key={pIdx} className="relative group w-16 h-16 rounded-xl overflow-hidden border border-gray-200 flex-shrink-0">
                          <img src={photo} alt="Inspection photo" className="w-full h-full object-cover" />
                          <button
                            onClick={() => handleRemovePhoto(item.id, pIdx)}
                            className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-red-600 transition"
                            title="Delete photo"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Inspector Notes */}
                  <input
                    type="text"
                    value={item.notes || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setItems(prev => prev.map(i => i.id === item.id ? { ...i, notes: val } : i));
                    }}
                    placeholder="Inspector notes (e.g., box seal intact, minor packing damage)..."
                    className="w-full text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-charcoal focus:ring-1 focus:ring-antiquegold"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* On-Site Receiver Info Section */}
          <div className="bg-white rounded-2xl p-5 border border-antiquegold/20 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-charcoal flex items-center space-x-2">
              <UserIcon className="w-4 h-4 text-antiquegold" />
              <span>Receiving Officer Verification Details</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-charcoal/70 mb-1 block">Full Name</label>
                <input
                  type="text"
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value)}
                  className="w-full text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-charcoal"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-charcoal/70 mb-1 block">Role on Site</label>
                <select
                  value={receiverRole}
                  onChange={(e) => setReceiverRole(e.target.value as any)}
                  className="w-full text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-charcoal"
                >
                  <option value="technician">AIEC Lead Technician</option>
                  <option value="site_engineer">Site Civil Engineer</option>
                  <option value="customer_rep">Customer Authorized Rep</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-charcoal/70 mb-1 block">Phone Number</label>
                <input
                  type="text"
                  value={receiverPhone}
                  onChange={(e) => setReceiverPhone(e.target.value)}
                  className="w-full text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-charcoal"
                />
              </div>
            </div>
          </div>

          {/* Sticky Bottom Bar */}
          <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-antiquegold/30 p-4 z-40">
            <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                onClick={handleSaveChecklistProgress}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-antiquegold/40 text-charcoal text-xs font-semibold hover:bg-antiquegold/10 transition flex items-center justify-center space-x-2"
              >
                <RefreshCw className="w-4 h-4 text-antiquegold" />
                <span>Save Progress Draft</span>
              </button>

              <button
                onClick={handleCompleteChecklist}
                className={`w-full sm:w-auto px-6 py-3 rounded-xl text-white text-sm font-bold shadow-md transition flex items-center justify-center space-x-2 ${
                  hasDiscrepancies 
                    ? 'bg-amber-600 hover:bg-amber-700' 
                    : 'bg-royalemerald hover:bg-royalemerald/90'
                }`}
              >
                <ShieldCheck className="w-5 h-5 text-antiquegold" />
                <span>
                  {hasDiscrepancies 
                    ? 'File Discrepancy & Proceed to Signatures' 
                    : 'Complete Checklist & Open Material Sign-Off'
                  }
                </span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-2xl p-12 text-center space-y-4 border border-antiquegold/20">
          <Package className="w-12 h-12 text-antiquegold mx-auto opacity-50" />
          <h3 className="text-lg font-serif font-bold text-charcoal">No Active Delivery Checklist Found</h3>
          <p className="text-sm text-charcoal/60">
            Select a purchase order above or verify that a delivery schedule has been created.
          </p>
        </div>
      )}
    </div>
  );
};
