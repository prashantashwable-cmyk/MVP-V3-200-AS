import React, { useState, useEffect } from 'react';
import { 
  FileText, Send, CheckCircle2, AlertTriangle, ShieldCheck, ShieldAlert,
  Building2, Calendar, DollarSign, Plus, Trash2, Edit3, ArrowRight, 
  Search, Filter, Layers, ExternalLink, RefreshCw, MessageSquare, Split
} from 'lucide-react';
import { Card, Button } from './Common';
import { User, PurchaseOrder, POLineItem, Supplier, Deal } from '../types';
import { DbManager } from '../lib/db';
import { useLanguage } from '../lib/language';
import { bridgeProcurementPoCreated, bridgeProcurementPoStatusChanged } from '../services/legacyCommercialBridge';

interface PurchaseOrderGeneratorProps {
  user: User;
  initialSupplierId?: string;
  onNavigateToSupplierDirectory?: () => void;
}

export const PurchaseOrderGenerator: React.FC<PurchaseOrderGeneratorProps> = ({
  user,
  initialSupplierId,
  onNavigateToSupplierDirectory
}) => {
  const { t } = useLanguage(user);

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSupplier, setFilterSupplier] = useState<string>(initialSupplierId || 'all');

  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null);

  // Modal 1: Auto-Draft PO from Closed Deal
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string>('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');

  // Modal 2: Edit / Line Item Editor
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [editingPo, setEditingPo] = useState<PurchaseOrder | null>(null);
  const [deliveryDate, setDeliveryDate] = useState<string>('');
  const [poNotes, setPoNotes] = useState<string>('');

  // Modal 3: Split PO Modal
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitSecondarySupplierId, setSplitSecondarySupplierId] = useState<string>('');

  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const loadData = () => {
    const poList = DbManager.getPurchaseOrders();
    const supList = DbManager.getSuppliers();
    const dealList = DbManager.getDeals();

    setPurchaseOrders(poList);
    setSuppliers(supList);
    setDeals(dealList);
  };

  useEffect(() => {
    loadData();
    const handleDbUpdate = () => loadData();
    window.addEventListener('aiec_db_update', handleDbUpdate);
    return () => window.removeEventListener('aiec_db_update', handleDbUpdate);
  }, [user]);

  // Action: Create PO Draft from Closed Deal
  const handleAutoDraftFromDeal = () => {
    if (!selectedDealId || !selectedSupplierId) {
      setNotification({ msg: 'Please select both a closed deal and an eligible supplier.', type: 'error' });
      return;
    }

    const matchedDeal = deals.find(d => d.id === selectedDealId);
    const matchedSupplier = suppliers.find(s => s.id === selectedSupplierId);

    if (!matchedDeal || !matchedSupplier) return;

    if (matchedSupplier.kycStatus !== 'Verified' || matchedSupplier.status === 'suspended') {
      setNotification({ msg: 'Selected supplier is not KYC Verified or suspended. Cannot draft PO.', type: 'error' });
      return;
    }

    // Auto-populate line items from supplier catalog matching deal elevator spec
    const lineItems: POLineItem[] = matchedSupplier.catalog.slice(0, 3).map(cat => ({
      itemId: cat.itemId,
      itemName: cat.itemName,
      category: cat.category,
      quantity: 1,
      catalogPrice: cat.price,
      agreedUnitPrice: cat.price,
      quotedUnitPrice: cat.price,
      totalPrice: cat.price
    }));

    const subtotal = lineItems.reduce((acc, item) => acc + item.totalPrice, 0);
    const gstAmount = Math.round(subtotal * 0.18);
    const totalAmount = subtotal + gstAmount;

    const newPoId = `PO-2026-${matchedSupplier.name.substring(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

    const newPo: PurchaseOrder = {
      id: newPoId,
      linkedDealId: matchedDeal.id,
      customerName: matchedDeal.customerName || 'Customer Deal Site',
      siteLocation: matchedDeal.siteLocation || 'Pune Maharashtra',
      supplierId: matchedSupplier.id,
      supplierName: matchedSupplier.name,
      lineItems,
      subtotalAmount: subtotal,
      gstRate: 18,
      gstAmount,
      totalAmount,
      expectedDeliveryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'Draft',
      createdFromDealClosureAt: new Date().toISOString()
    };

    DbManager.addPurchaseOrder(newPo);
    setShowDraftModal(false);
    setSelectedDealId('');
    setSelectedSupplierId('');
    setNotification({ msg: `Auto-drafted ${newPoId} linked to Deal ${matchedDeal.id}.`, type: 'success' });

    // Phase 16: bridge this draft into a real, idempotent canonical
    // PurchaseOrder in addition to the DbManager write above — see
    // legacyCommercialBridge.ts.
    bridgeProcurementPoCreated(
      { id: user.id, role: user.role, isDemo: user.isDemo, authMethod: user.authMethod },
      newPo,
    ).then(result => {
      if (!result.bridged) {
        console.warn(`[Phase 16 bridge] PO ${newPo.id} not mirrored to canonical model: ${result.reason}`);
      }
    });
  };

  // Action: Send PO to Supplier
  const handleSendPoToSupplier = (po: PurchaseOrder) => {
    const targetSupplier = suppliers.find(s => s.id === po.supplierId);
    
    if (!targetSupplier || targetSupplier.kycStatus !== 'Verified' || targetSupplier.status === 'suspended') {
      setNotification({ msg: `🛑 Send blocked: Supplier "${po.supplierName}" is suspended or not KYC Verified.`, type: 'error' });
      return;
    }

    if (po.approvalRequired && po.hasPriceDiscrepancy) {
      setNotification({ msg: '⚠️ Price discrepancy requires Admin signoff approval prior to transmitting PO to supplier.', type: 'error' });
      return;
    }

    const threadRef = `TH-SUP-${po.supplierId}-${po.id}`;
    const updatedPo: PurchaseOrder = {
      ...po,
      status: 'Sent',
      sentAt: new Date().toISOString(),
      communicationThreadRef: threadRef
    };

    DbManager.updatePurchaseOrder(updatedPo);
    setNotification({
      msg: `✈️ ${po.id} transmitted to ${po.supplierName}. Supplier communication thread ${threadRef} opened with PO attachment.`,
      type: 'success'
    });

    // Phase 16: bridge into the canonical PO's pending_approval ->
    // sent_to_supplier transition, in addition to the DbManager write
    // above — see legacyCommercialBridge.ts.
    bridgeProcurementPoStatusChanged(
      { id: user.id, role: user.role, isDemo: user.isDemo, authMethod: user.authMethod },
      updatedPo,
      'Sent',
    ).then(result => {
      if (!result.bridged) {
        console.warn(`[Phase 16 bridge] PO ${po.id} "Sent" not mirrored to canonical model: ${result.reason}`);
      }
    });
  };

  // Line Item Editor Changes
  const handleUpdateLineItem = (index: number, field: 'quantity' | 'agreedUnitPrice', val: number) => {
    if (!editingPo) return;
    const updatedItems = [...editingPo.lineItems];
    const item = { ...updatedItems[index] };

    if (field === 'quantity') item.quantity = val;
    if (field === 'agreedUnitPrice') item.agreedUnitPrice = val;

    item.totalPrice = item.quantity * item.agreedUnitPrice;

    // Check price discrepancy tolerance (if unit price > catalog or quoted by > 2%)
    if (item.quotedUnitPrice && item.agreedUnitPrice > item.quotedUnitPrice * 1.02) {
      item.priceDiscrepancyFlag = true;
    } else {
      item.priceDiscrepancyFlag = false;
    }

    updatedItems[index] = item;

    const subtotal = updatedItems.reduce((acc, i) => acc + i.totalPrice, 0);
    const gstAmount = Math.round(subtotal * 0.18);
    const totalAmount = subtotal + gstAmount;

    const hasDiscrepancy = updatedItems.some(i => i.priceDiscrepancyFlag);

    setEditingPo({
      ...editingPo,
      lineItems: updatedItems,
      subtotalAmount: subtotal,
      gstAmount,
      totalAmount,
      hasPriceDiscrepancy: hasDiscrepancy,
      approvalRequired: hasDiscrepancy,
      discrepancyNote: hasDiscrepancy ? 'Unit price increased above deal quotation baseline. Admin signoff required.' : undefined
    });
  };

  // Save Line Item Editor
  const handleSaveEditorChanges = () => {
    if (!editingPo) return;
    const updated: PurchaseOrder = {
      ...editingPo,
      expectedDeliveryDate: deliveryDate || editingPo.expectedDeliveryDate,
      notes: poNotes
    };

    DbManager.updatePurchaseOrder(updated);
    setShowEditorModal(false);
    setEditingPo(null);
    setNotification({ msg: `Purchase order ${updated.id} line items and schedule updated.`, type: 'success' });
  };

  // Action: Split PO into 2 Suppliers
  const handleConfirmSplitPo = () => {
    if (!selectedPo || !splitSecondarySupplierId) return;

    const secondarySup = suppliers.find(s => s.id === splitSecondarySupplierId);
    if (!secondarySup) return;

    const splitGroupRef = `SPLIT-GROUP-${selectedPo.linkedDealId}`;

    // Update primary PO
    const primaryUpdated: PurchaseOrder = {
      ...selectedPo,
      splitPoGroupRef: splitGroupRef,
      notes: `${selectedPo.notes || ''} [Split PO Group: ${splitGroupRef}]`
    };
    DbManager.updatePurchaseOrder(primaryUpdated);

    // Create secondary PO
    const secondaryPoId = `PO-2026-${secondarySup.name.substring(0, 3).toUpperCase()}-SPLIT`;
    const secondaryLineItems: POLineItem[] = secondarySup.catalog.slice(0, 1).map(cat => ({
      itemId: cat.itemId,
      itemName: cat.itemName,
      category: cat.category,
      quantity: 1,
      catalogPrice: cat.price,
      agreedUnitPrice: cat.price,
      quotedUnitPrice: cat.price,
      totalPrice: cat.price
    }));

    const subtotal = secondaryLineItems.reduce((acc, i) => acc + i.totalPrice, 0);
    const gstAmount = Math.round(subtotal * 0.18);

    const secondaryPo: PurchaseOrder = {
      id: secondaryPoId,
      linkedDealId: selectedPo.linkedDealId,
      customerName: selectedPo.customerName,
      siteLocation: selectedPo.siteLocation,
      supplierId: secondarySup.id,
      supplierName: secondarySup.name,
      splitPoGroupRef: splitGroupRef,
      lineItems: secondaryLineItems,
      subtotalAmount: subtotal,
      gstRate: 18,
      gstAmount,
      totalAmount: subtotal + gstAmount,
      expectedDeliveryDate: selectedPo.expectedDeliveryDate,
      status: 'Draft',
      createdFromDealClosureAt: new Date().toISOString()
    };

    DbManager.addPurchaseOrder(secondaryPo);
    setShowSplitModal(false);
    setSelectedPo(null);
    setSplitSecondarySupplierId('');
    setNotification({ msg: `✂️ Deal ${selectedPo.linkedDealId} split into 2 linked POs: ${selectedPo.id} & ${secondaryPoId}.`, type: 'success' });
  };

  const filteredPos = purchaseOrders.filter(p => {
    const matchesSearch = p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.linkedDealId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.supplierName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
    const matchesSupplier = filterSupplier === 'all' || p.supplierId === filterSupplier;

    return matchesSearch && matchesStatus && matchesSupplier;
  });

  return (
    <div className="space-y-6 pb-12 text-left">
      {/* Toast Notification */}
      {notification && (
        <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between ${
          notification.type === 'success' ? 'bg-royalemerald/10 border-royalemerald/30 text-royalemerald' : 'bg-error/10 border-error/30 text-error'
        }`}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{notification.msg}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-warmgray hover:text-charcoal font-mono">✕</button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white p-6 rounded-3xl border border-[rgba(184,135,61,0.2)] shadow-diffuse flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 bg-antiquegold/10 text-antiquegold text-[10px] font-bold tracking-widest uppercase rounded-full font-mono">
              Module 10 • Automatic PO Generation
            </span>
            <span className="px-2 py-0.5 bg-royalemerald/10 text-royalemerald text-[10px] font-bold rounded-full font-mono">
              Deal Closure Trigger HandOff
            </span>
          </div>
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-charcoal">
            Purchase Order Generator & Desk
          </h1>
          <p className="text-xs text-warmgray mt-1">
            Auto-draft parts orders from closed deals, verify catalog prices against quote baselines, and transmit attachments to suppliers.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {onNavigateToSupplierDirectory && (
            <Button variant="secondary" onClick={onNavigateToSupplierDirectory} className="text-xs py-2">
              <Building2 className="w-3.5 h-3.5" />
              <span>Supplier Directory</span>
            </Button>
          )}

          <Button variant="emerald" onClick={() => setShowDraftModal(true)} className="text-xs py-2">
            <Plus className="w-3.5 h-3.5" />
            <span>Auto-Draft PO from Closed Deal</span>
          </Button>
        </div>
      </div>

      {/* Search & Multi-Filters */}
      <div className="bg-white p-4 rounded-2xl border border-[rgba(184,135,61,0.15)] shadow-xs space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-warmgray" />
          <input
            type="text"
            placeholder="Search PO #, deal ID, customer name, supplier..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl pl-9 pr-4 py-2 text-xs text-charcoal outline-none focus:ring-2 focus:ring-antiquegold"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div>
            <label className="block text-[10px] font-bold text-warmgray uppercase mb-1 font-mono">PO Status</label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl px-3 py-2 text-xs text-charcoal font-bold outline-none"
            >
              <option value="all">All PO Statuses</option>
              <option value="Draft">Draft</option>
              <option value="Sent">Sent to Supplier</option>
              <option value="Acknowledged">Acknowledged</option>
              <option value="In Production">In Production</option>
              <option value="Dispatched">Dispatched</option>
              <option value="Delivered">Delivered</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-warmgray uppercase mb-1 font-mono">Supplier Filter</label>
            <select
              value={filterSupplier}
              onChange={e => setFilterSupplier(e.target.value)}
              className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl px-3 py-2 text-xs text-charcoal font-bold outline-none"
            >
              <option value="all">All Suppliers</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* PO Cards List */}
      <div className="space-y-4">
        {filteredPos.length === 0 ? (
          <Card className="p-8 text-center space-y-3">
            <FileText className="w-10 h-10 text-warmgray mx-auto" />
            <h3 className="font-serif text-lg font-bold text-charcoal">No Purchase Orders Found</h3>
            <p className="text-xs text-warmgray">Select a closed deal to auto-draft a component purchase order for supplier manufacturing.</p>
            <Button variant="emerald" onClick={() => setShowDraftModal(true)} className="text-xs">
              <Plus className="w-3.5 h-3.5" />
              <span>Draft New Purchase Order</span>
            </Button>
          </Card>
        ) : (
          filteredPos.map(po => {
            const supplierObj = suppliers.find(s => s.id === po.supplierId);
            const isKycVerified = supplierObj?.kycStatus === 'Verified';

            return (
              <Card 
                key={po.id}
                className={`p-6 bg-white border rounded-3xl transition-all shadow-xs space-y-4 ${
                  po.hasPriceDiscrepancy ? 'border-amber-400/60 bg-amber-50/20' : 'border-[rgba(184,135,61,0.2)]'
                }`}
              >
                {/* Header Info */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[rgba(184,135,61,0.12)] pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-extrabold text-charcoal">{po.id}</span>
                      <span className={`px-2.5 py-0.5 text-[9px] font-bold rounded-full font-mono uppercase ${
                        po.status === 'Draft' ? 'bg-amber-100 text-amber-800' :
                        po.status === 'Sent' ? 'bg-blue-100 text-blue-800' :
                        po.status === 'In Production' ? 'bg-purple-100 text-purple-800' :
                        'bg-royalemerald/15 text-royalemerald'
                      }`}>
                        Status: {po.status}
                      </span>

                      {po.splitPoGroupRef && (
                        <span className="px-2 py-0.5 bg-antiquegold/10 text-antiquegold text-[9px] font-bold rounded-full font-mono flex items-center gap-1">
                          <Split className="w-3 h-3" />
                          <span>Split PO</span>
                        </span>
                      )}

                      {po.hasPriceDiscrepancy && (
                        <span className="px-2 py-0.5 bg-amber-200 text-amber-900 text-[9px] font-bold rounded-full font-mono flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Price Discrepancy Flag</span>
                        </span>
                      )}
                    </div>

                    <h3 className="font-serif text-lg font-bold text-charcoal mt-1">
                      Supplier: {po.supplierName}
                    </h3>
                    <p className="text-xs text-warmgray font-mono">
                      Originating Deal: <strong className="text-charcoal">{po.linkedDealId}</strong> ({po.customerName} - {po.siteLocation})
                    </p>
                  </div>

                  <div className="text-left md:text-right">
                    <p className="text-[10px] text-warmgray font-mono uppercase font-bold">PO Total Amount (Incl GST 18%)</p>
                    <p className="font-mono text-xl font-extrabold text-charcoal">
                      ₹{po.totalAmount.toLocaleString('en-IN')}
                    </p>
                    <p className="text-[10px] text-warmgray font-mono">
                      📅 Expected Delivery: {po.expectedDeliveryDate}
                    </p>
                  </div>
                </div>

                {/* Price Discrepancy Warning */}
                {po.hasPriceDiscrepancy && po.discrepancyNote && (
                  <div className="p-3 bg-amber-100/70 border border-amber-300 rounded-2xl text-xs text-amber-900 space-y-1">
                    <p className="font-bold flex items-center gap-1.5 uppercase font-mono tracking-wider">
                      <AlertTriangle className="w-4 h-4 text-amber-700" />
                      <span>Quotation Margin Discrepancy Notice:</span>
                    </p>
                    <p className="text-[11px]">{po.discrepancyNote}</p>
                  </div>
                )}

                {/* Line Items Table Preview */}
                <div className="p-3 bg-alabaster rounded-2xl border border-[rgba(184,135,61,0.1)] text-xs space-y-2">
                  <div className="flex justify-between items-center font-bold text-charcoal">
                    <span>Line Items ({po.lineItems.length})</span>
                    <span className="font-mono text-[10px] text-warmgray">Subtotal: ₹{po.subtotalAmount.toLocaleString('en-IN')}</span>
                  </div>

                  <div className="space-y-1 font-mono text-[11px]">
                    {po.lineItems.map((item, idx) => (
                      <div key={idx} className="p-2 bg-white rounded-xl border border-[#e6dfd4] flex flex-wrap justify-between items-center gap-2">
                        <span className="font-sans font-medium text-charcoal">{item.itemName} x{item.quantity}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-warmgray text-[10px]">Catalog ₹{item.catalogPrice.toLocaleString('en-IN')}</span>
                          <span className={`font-bold ${item.priceDiscrepancyFlag ? 'text-amber-800' : 'text-royalemerald'}`}>
                            Agreed ₹{item.totalPrice.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Communication Thread Attachment Token */}
                {po.communicationThreadRef && (
                  <div className="p-2.5 bg-royalemerald/5 rounded-xl border border-royalemerald/20 text-xs flex items-center justify-between text-royalemerald">
                    <span className="flex items-center gap-2 font-mono text-[11px] font-bold">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Communication Thread Attached: {po.communicationThreadRef}</span>
                    </span>
                    <span className="text-[10px] font-bold">Live Synced</span>
                  </div>
                )}

                {/* Toolbar Actions */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-[rgba(184,135,61,0.1)]">
                  {po.status === 'Draft' && (
                    <Button
                      variant="emerald"
                      className="text-xs py-2"
                      onClick={() => handleSendPoToSupplier(po)}
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Transmit PO to Supplier</span>
                    </Button>
                  )}

                  <Button
                    variant="secondary"
                    className="text-xs py-2"
                    onClick={() => {
                      setEditingPo(po);
                      setDeliveryDate(po.expectedDeliveryDate);
                      setPoNotes(po.notes || '');
                      setShowEditorModal(true);
                    }}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Quantities & Prices</span>
                  </Button>

                  <Button
                    variant="secondary"
                    className="text-xs py-2"
                    onClick={() => {
                      setSelectedPo(po);
                      setShowSplitModal(true);
                    }}
                  >
                    <Split className="w-3.5 h-3.5 text-antiquegold" />
                    <span>Split into Multiple POs</span>
                  </Button>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* MODAL 1: AUTO-DRAFT PO FROM CLOSED DEAL */}
      {showDraftModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="p-6 max-w-lg w-full bg-white rounded-3xl space-y-4 shadow-2xl">
            <h3 className="font-serif text-lg font-bold text-charcoal">Auto-Draft Purchase Order from Deal</h3>
            <p className="text-xs text-warmgray">Select a closed customer deal to match required elevator parts with a KYC verified supplier catalog.</p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-charcoal mb-1">Select Closed Customer Deal *</label>
                <select
                  value={selectedDealId}
                  onChange={e => setSelectedDealId(e.target.value)}
                  className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl px-3 py-2 text-xs text-charcoal font-bold outline-none"
                >
                  <option value="">-- Choose Originating Deal --</option>
                  {deals.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.id} - {d.customerName || 'Customer Site'} (₹{d.agreedPrice.toLocaleString('en-IN')})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-charcoal mb-1">Select Best-Fit KYC Verified Supplier *</label>
                <select
                  value={selectedSupplierId}
                  onChange={e => setSelectedSupplierId(e.target.value)}
                  className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl px-3 py-2 text-xs text-charcoal font-bold outline-none"
                >
                  <option value="">-- Choose Verified Supplier --</option>
                  {suppliers.filter(s => s.kycStatus === 'Verified' && s.status === 'active').map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.regionServed}) - Score: {s.performanceScore}/100
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="secondary" fullWidth onClick={() => setShowDraftModal(false)}>Cancel</Button>
              <Button variant="emerald" fullWidth onClick={handleAutoDraftFromDeal}>
                <Plus className="w-3.5 h-3.5" />
                <span>Generate PO Draft</span>
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* MODAL 2: LINE ITEM & PRICE EDITOR */}
      {showEditorModal && editingPo && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="p-6 max-w-xl w-full bg-white rounded-3xl space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-serif text-lg font-bold text-charcoal">Line-Item Editor & Margin Control</h3>
            <p className="text-xs text-warmgray">Adjust unit price and quantities for PO <strong className="text-charcoal">{editingPo.id}</strong>.</p>

            <div className="space-y-3 text-xs">
              <label className="block font-bold text-charcoal">Line Items List:</label>
              {editingPo.lineItems.map((item, idx) => (
                <div key={idx} className="p-3 bg-alabaster rounded-2xl border border-[#e6dfd4] space-y-2">
                  <p className="font-bold text-charcoal">{item.itemName}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-warmgray font-bold">Quantity</label>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={e => handleUpdateLineItem(idx, 'quantity', Number(e.target.value))}
                        className="w-full bg-white border border-[#e6dfd4] rounded-xl px-2 py-1.5 font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-warmgray font-bold">Agreed Unit Price (₹)</label>
                      <input
                        type="number"
                        value={item.agreedUnitPrice}
                        onChange={e => handleUpdateLineItem(idx, 'agreedUnitPrice', Number(e.target.value))}
                        className="w-full bg-white border border-[#e6dfd4] rounded-xl px-2 py-1.5 font-mono text-xs"
                      />
                    </div>
                  </div>

                  {item.priceDiscrepancyFlag && (
                    <p className="text-[10px] font-mono text-amber-800 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-700" />
                      <span>Exceeds quotation baseline ₹{item.quotedUnitPrice?.toLocaleString('en-IN')}!</span>
                    </p>
                  )}
                </div>
              ))}

              <div>
                <label className="block font-bold text-charcoal mb-1">Expected Delivery Date *</label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={e => setDeliveryDate(e.target.value)}
                  className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl px-3 py-2 text-xs font-mono text-charcoal outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-charcoal mb-1">PO Notes & Delivery Instructions</label>
                <textarea
                  rows={2}
                  value={poNotes}
                  onChange={e => setPoNotes(e.target.value)}
                  className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl p-3 text-xs text-charcoal outline-none"
                />
              </div>
            </div>

            <div className="p-3 bg-royalemerald/10 rounded-2xl text-xs flex justify-between items-center font-mono font-bold text-royalemerald">
              <span>Recalculated Total (Incl 18% GST):</span>
              <span className="text-sm">₹{editingPo.totalAmount.toLocaleString('en-IN')}</span>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="secondary" fullWidth onClick={() => setShowEditorModal(false)}>Cancel</Button>
              <Button variant="emerald" fullWidth onClick={handleSaveEditorChanges}>Save Line Items</Button>
            </div>
          </Card>
        </div>
      )}

      {/* MODAL 3: SPLIT PO INTO MULTIPLE SUPPLIERS */}
      {showSplitModal && selectedPo && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="p-6 max-w-md w-full bg-white rounded-3xl space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-antiquegold">
              <Split className="w-6 h-6" />
              <h3 className="font-serif text-lg font-bold text-charcoal">Split PO across Multiple Suppliers</h3>
            </div>

            <p className="text-xs text-warmgray">
              No single supplier carries every required component. Split Deal <strong className="text-charcoal">{selectedPo.linkedDealId}</strong> to issue a secondary linked PO.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-charcoal mb-1">Select Secondary Supplier for Component Split *</label>
                <select
                  value={splitSecondarySupplierId}
                  onChange={e => setSplitSecondarySupplierId(e.target.value)}
                  className="w-full bg-alabaster border border-[#e6dfd4] rounded-xl px-3 py-2 text-xs text-charcoal font-bold outline-none"
                >
                  <option value="">-- Choose Secondary Supplier --</option>
                  {suppliers.filter(s => s.id !== selectedPo.supplierId && s.kycStatus === 'Verified').map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.regionServed})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="secondary" fullWidth onClick={() => setShowSplitModal(false)}>Cancel</Button>
              <Button variant="emerald" fullWidth onClick={handleConfirmSplitPo}>
                <Split className="w-3.5 h-3.5" />
                <span>Confirm Multi-Supplier Split</span>
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
