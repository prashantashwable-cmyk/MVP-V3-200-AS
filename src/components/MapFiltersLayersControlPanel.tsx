import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Check, Plus, Trash2, Layers, Map as MapIcon, Sliders, Save, Sparkles, 
  RotateCcw, ShieldAlert, Wifi, CheckSquare, Info, Star, Shield, Battery,
  AlertTriangle, Hammer, Users, Building, Activity, Compass
} from 'lucide-react';
import { Card, Button, Badge } from './Common';

export interface MapFilterState {
  showSurveyors: boolean;
  showTechnicians: boolean;
  showActiveLeads: boolean;
  showActiveInstallations: boolean;
  showTerritories: boolean;
  showHeatmap: boolean;
  showGeofences: boolean;

  // Sub-filters
  staffRoleFilter: 'all' | 'surveyor' | 'technician';
  staffStatusFilter: 'all' | 'idle' | 'traveling' | 'on-site' | 'lost_signal';
  staffBatteryAlert: boolean; // filter only <= 35% battery
  staffSignalAlert: boolean;  // filter only lost/poor signal

  leadStageFilter: 'all' | 'captured' | 'assigned' | 'contacted' | 'survey_done' | 'quoted' | 'negotiating' | 'closed_won' | 'closed_lost';
  leadBuildingType: 'all' | 'residential' | 'commercial' | 'industrial';
  leadFloorsFilter: 'all' | 'low' | 'medium' | 'high'; // low: 1-4, medium: 5-9, high: 10+

  jobStatusFilter: 'all' | 'pending' | 'in_progress' | 'qc_pending' | 'completed';

  territorySelect: {
    t1: boolean; // Pune North
    t2: boolean; // Pune South
    t3: boolean; // Pune East
    t4: boolean; // Pune West
  };

  heatmapIntensity: 'gold' | 'emerald' | 'sapphire' | 'ruby';
  heatmapRadius: 'small' | 'medium' | 'large';

  geofenceMinConfidence: number; // 0-100
  geofenceAccuracyRadius: number; // in meters (e.g. 15, 30, 50, 100)
}

export interface SavedMapView {
  id: string;
  name: string;
  config: MapFilterState;
  isDefault: boolean;
  isShareable: boolean;
  createdBy: string;
}

export const defaultFilters: MapFilterState = {
  showSurveyors: true,
  showTechnicians: true,
  showActiveLeads: true,
  showActiveInstallations: true,
  showTerritories: true,
  showHeatmap: false,
  showGeofences: false,

  staffRoleFilter: 'all',
  staffStatusFilter: 'all',
  staffBatteryAlert: false,
  staffSignalAlert: false,

  leadStageFilter: 'all',
  leadBuildingType: 'all',
  leadFloorsFilter: 'all',

  jobStatusFilter: 'all',

  territorySelect: {
    t1: true,
    t2: true,
    t3: true,
    t4: true
  },

  heatmapIntensity: 'gold',
  heatmapRadius: 'medium',

  geofenceMinConfidence: 80,
  geofenceAccuracyRadius: 30
};

// Initial built-in view configs
const defaultSavedViews: SavedMapView[] = [
  {
    id: 'view_morning',
    name: 'Morning Standup View',
    config: {
      ...defaultFilters,
      showSurveyors: true,
      showTechnicians: false,
      showActiveLeads: true,
      showActiveInstallations: false,
      showTerritories: true,
      showHeatmap: false,
      showGeofences: false,
      staffRoleFilter: 'surveyor',
      staffStatusFilter: 'traveling'
    },
    isDefault: true,
    isShareable: true,
    createdBy: 'admin_1'
  },
  {
    id: 'view_installation_qc',
    name: 'Active Installations QC',
    config: {
      ...defaultFilters,
      showSurveyors: false,
      showTechnicians: true,
      showActiveLeads: false,
      showActiveInstallations: true,
      showTerritories: true,
      showHeatmap: false,
      showGeofences: true,
      staffRoleFilter: 'technician',
      staffStatusFilter: 'on-site',
      jobStatusFilter: 'in_progress'
    },
    isDefault: false,
    isShareable: true,
    createdBy: 'admin_1'
  },
  {
    id: 'view_heatmap_leads',
    name: 'Lead Generation Heatmap',
    config: {
      ...defaultFilters,
      showSurveyors: false,
      showTechnicians: false,
      showActiveLeads: true,
      showActiveInstallations: false,
      showTerritories: true,
      showHeatmap: true,
      showGeofences: false,
      leadStageFilter: 'captured'
    },
    isDefault: false,
    isShareable: false,
    createdBy: 'admin_1'
  }
];

interface MapFiltersLayersControlPanelProps {
  isOpen: boolean;
  onClose: () => void;
  filters: MapFilterState;
  onChangeFilters: (filters: MapFilterState) => void;
  userId: string;
  onShowAlert: (text: string, type: 'success' | 'info' | 'warn') => void;
}

export const MapFiltersLayersControlPanel: React.FC<MapFiltersLayersControlPanelProps> = ({
  isOpen,
  onClose,
  filters,
  onChangeFilters,
  userId,
  onShowAlert
}) => {
  const [savedViews, setSavedViews] = useState<SavedMapView[]>([]);
  const [newViewName, setNewViewName] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);
  const [makeShareable, setMakeShareable] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'layers' | 'presets'>('layers');

  // Load saved views from localStorage or fallback to seeds
  useEffect(() => {
    const stored = localStorage.getItem('aiec_map_saved_views');
    if (stored) {
      try {
        setSavedViews(JSON.parse(stored));
      } catch (e) {
        setSavedViews(defaultSavedViews);
      }
    } else {
      setSavedViews(defaultSavedViews);
      localStorage.setItem('aiec_map_saved_views', JSON.stringify(defaultSavedViews));
    }
  }, []);

  // Save the list of views to local storage helper
  const saveViewsToStorage = (views: SavedMapView[]) => {
    setSavedViews(views);
    localStorage.setItem('aiec_map_saved_views', JSON.stringify(views));
  };

  // Reset all filters back to factory default
  const handleResetToDefault = () => {
    onChangeFilters(defaultFilters);
    onShowAlert('Map layers reset to standard baseline configuration.', 'info');
  };

  // Filter View Duplicate Check and Auto-suffix implementation
  const handleSaveView = () => {
    if (!newViewName.trim()) {
      onShowAlert('Please specify a name for this custom view.', 'warn');
      return;
    }

    let finalName = newViewName.trim();
    let suffix = 1;
    const existingNames = savedViews.map(v => v.name.toLowerCase());

    while (existingNames.includes(finalName.toLowerCase())) {
      finalName = `${newViewName.trim()} (${suffix})`;
      suffix++;
    }

    const newViewId = `view_${Date.now()}`;
    const newView: SavedMapView = {
      id: newViewId,
      name: finalName,
      config: { ...filters },
      isDefault: makeDefault,
      isShareable: makeShareable,
      createdBy: userId
    };

    let updatedViews = [...savedViews];

    // If marked default, remove default flag from other views
    if (makeDefault) {
      updatedViews = updatedViews.map(v => ({ ...v, isDefault: false }));
    }

    updatedViews.push(newView);
    saveViewsToStorage(updatedViews);

    onShowAlert(`Saved view "${finalName}" successfully recalled as preset.`, 'success');
    setNewViewName('');
    setMakeDefault(false);
    setMakeShareable(false);
    setIsSaving(false);
  };

  // Toggle Default marker on existing view
  const handleToggleDefaultView = (viewId: string) => {
    const updated = savedViews.map(v => {
      if (v.id === viewId) {
        return { ...v, isDefault: !v.isDefault };
      }
      return { ...v, isDefault: false }; // Clear other defaults
    });
    saveViewsToStorage(updated);
    onShowAlert('Updated default startup map view preset.', 'success');
  };

  // Delete saved view
  const handleDeleteView = (viewId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Phase 36 — LEVEL 4 (irreversible): deleting a saved map view preset
    // had no confirmation of any kind before this fix.
    if (!window.confirm('Delete this saved map view preset? This cannot be undone.')) {
      return;
    }
    const updated = savedViews.filter(v => v.id !== viewId);
    saveViewsToStorage(updated);
    onShowAlert('Map view preset deleted.', 'info');
  };

  // Load preset filters
  const handleLoadPreset = (view: SavedMapView) => {
    // Safety check - if a deleted territory or property is configured, load with a small warning gracefully
    const checkedConfig = { ...defaultFilters, ...view.config };
    onChangeFilters(checkedConfig);
    onShowAlert(`Recalled view: "${view.name}" with custom sub-filters.`, 'success');
    onClose();
  };

  // Helper count of active layers to show device warning
  const activeLayersCount = [
    filters.showSurveyors,
    filters.showTechnicians,
    filters.showActiveLeads,
    filters.showActiveInstallations,
    filters.showTerritories,
    filters.showHeatmap,
    filters.showGeofences
  ].filter(Boolean).length;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* BACKDROP */}
          <div 
            onClick={onClose}
            className="fixed inset-0 z-50 bg-charcoal/20 backdrop-blur-xs transition-opacity"
          />

          {/* SLIDE OUT DRAWER */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[#F8F6F1] border-l border-[rgba(184,135,61,0.2)] shadow-2xl flex flex-col font-sans"
          >
            {/* PANEL HEADER */}
            <header className="p-5 bg-white border-b border-[rgba(184,135,61,0.12)] flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#B8873D]/10 text-[#B8873D] flex items-center justify-center">
                  <Layers className="w-4 h-4 stroke-[1.5]" />
                </div>
                <div>
                  <h3 className="font-serif text-base font-bold text-charcoal">Map Control Unit</h3>
                  <p className="text-[10px] text-warmgray uppercase tracking-widest font-bold">Filters &amp; Overlays Hub</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={handleResetToDefault}
                  className="p-1.5 hover:bg-[#F8F6F1] text-warmgray hover:text-charcoal rounded-lg transition-colors"
                  title="Reset to Baseline"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 hover:bg-[#F8F6F1] text-warmgray hover:text-charcoal rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </header>

            {/* TAB SELECTOR */}
            <div className="px-5 pt-3 bg-white border-b border-[rgba(184,135,61,0.08)] flex gap-2 shrink-0">
              <button
                onClick={() => setActiveTab('layers')}
                className={`pb-2.5 text-xs font-bold transition-all relative ${
                  activeTab === 'layers' ? 'text-charcoal' : 'text-warmgray hover:text-charcoal'
                }`}
              >
                <span>Active Layers ({activeLayersCount})</span>
                {activeTab === 'layers' && (
                  <motion.div 
                    layoutId="activeTabIndicator" 
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-antiquegold" 
                  />
                )}
              </button>
              <button
                onClick={() => setActiveTab('presets')}
                className={`pb-2.5 text-xs font-bold transition-all relative ${
                  activeTab === 'presets' ? 'text-charcoal' : 'text-warmgray hover:text-charcoal'
                }`}
              >
                <span>Presets &amp; Saved Views</span>
                {activeTab === 'presets' && (
                  <motion.div 
                    layoutId="activeTabIndicator" 
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-antiquegold" 
                  />
                )}
              </button>
            </div>

            {/* SCROLLABLE MAIN CONTENT */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">

              {/* DEVICE RENDERING WARNING PANEL */}
              {activeLayersCount > 4 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-[#FFF9E6] rounded-xl border border-[#FFC72C]/30 flex items-start gap-2.5"
                >
                  <AlertTriangle className="w-4 h-4 text-[#B8873D] shrink-0 mt-0.5" />
                  <div className="text-[10px] text-charcoal leading-normal">
                    <strong className="block font-bold">High Layer Overlay Density ({activeLayersCount} Active)</strong>
                    Simultaneously rendering multiple custom vector vectors and GIS grids may degrade frame rates on battery-restricted or budget mobile devices. Consider hiding unused layers.
                  </div>
                </motion.div>
              )}

              {activeTab === 'layers' ? (
                <>
                  {/* GROUP 1: CORE OPERATIONAL TRACKING */}
                  <section className="space-y-3">
                    <h4 className="text-[10px] uppercase tracking-wider font-extrabold text-antiquegold border-b border-[rgba(184,135,61,0.08)] pb-1 flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5" />
                      On-Duty Personnel Layers
                    </h4>

                    {/* Field Surveyors */}
                    <div className="bg-white p-3.5 rounded-2xl border border-[rgba(184,135,61,0.08)] space-y-3 shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-royalemerald/10 text-royalemerald flex items-center justify-center">
                            <Users className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-charcoal">Field Surveyors</p>
                            <p className="text-[9px] text-warmgray">Map real-time locations of onsite estimators</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={filters.showSurveyors}
                            onChange={(e) => onChangeFilters({ ...filters, showSurveyors: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-royalemerald"></div>
                        </label>
                      </div>

                      {/* Surveyor Sub-filters */}
                      {filters.showSurveyors && (
                        <div className="pt-2.5 border-t border-dashed border-[#e5dfd4] space-y-2.5 text-[11px]">
                          {/* Status */}
                          <div className="flex justify-between items-center">
                            <span className="text-warmgray font-medium">Status Filter</span>
                            <select 
                              value={filters.staffStatusFilter}
                              onChange={(e: any) => onChangeFilters({ ...filters, staffStatusFilter: e.target.value })}
                              className="bg-[#FAF9F5] border border-[rgba(184,135,61,0.15)] rounded-lg px-2 py-1 text-[10px] focus:ring-1 focus:ring-antiquegold focus:outline-none"
                            >
                              <option value="all">All Statuses</option>
                              <option value="traveling">🚗 Traveling Only</option>
                              <option value="on-site">✓ On-Site Only</option>
                              <option value="idle">💤 Idle</option>
                              <option value="lost_signal">⚠️ Off-link (Lost Signal)</option>
                            </select>
                          </div>

                          {/* Battery toggle */}
                          <label className="flex items-center justify-between cursor-pointer">
                            <span className="text-warmgray font-medium flex items-center gap-1">
                              <Battery className="w-3.5 h-3.5 text-antiquegold" />
                              Filter Low Battery (&le; 35%)
                            </span>
                            <input 
                              type="checkbox"
                              checked={filters.staffBatteryAlert}
                              onChange={(e) => onChangeFilters({ ...filters, staffBatteryAlert: e.target.checked })}
                              className="w-3.5 h-3.5 rounded accent-royalemerald cursor-pointer"
                            />
                          </label>
                        </div>
                      )}
                    </div>

                    {/* Installation Techs */}
                    <div className="bg-white p-3.5 rounded-2xl border border-[rgba(184,135,61,0.08)] space-y-3 shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-antiquegold/10 text-antiquegold flex items-center justify-center">
                            <Hammer className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-charcoal">Installation Technicians</p>
                            <p className="text-[9px] text-warmgray">Track team members assembling cabins</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={filters.showTechnicians}
                            onChange={(e) => onChangeFilters({ ...filters, showTechnicians: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-royalemerald"></div>
                        </label>
                      </div>

                      {/* Techs Sub-filters */}
                      {filters.showTechnicians && (
                        <div className="pt-2.5 border-t border-dashed border-[#e5dfd4] space-y-2.5 text-[11px]">
                          {/* Skill Filters */}
                          <div className="flex justify-between items-center">
                            <span className="text-warmgray font-medium">Link Diagnostics</span>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <span className="text-[10px] text-warmgray font-mono">Offline-Alerts Only</span>
                              <input 
                                type="checkbox"
                                checked={filters.staffSignalAlert}
                                onChange={(e) => onChangeFilters({ ...filters, staffSignalAlert: e.target.checked })}
                                className="w-3.5 h-3.5 rounded accent-royalemerald cursor-pointer"
                              />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* GROUP 2: CRM & CONSTITUENCY PROJECTS */}
                  <section className="space-y-3">
                    <h4 className="text-[10px] uppercase tracking-wider font-extrabold text-antiquegold border-b border-[rgba(184,135,61,0.08)] pb-1 flex items-center gap-1">
                      <Building className="w-3.5 h-3.5" />
                      Client &amp; Pipeline Elements
                    </h4>

                    {/* Active Leads */}
                    <div className="bg-white p-3.5 rounded-2xl border border-[rgba(184,135,61,0.08)] space-y-3 shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[#E6F7ED] text-success flex items-center justify-center">
                            <Building className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-charcoal">Active Leads</p>
                            <p className="text-[9px] text-warmgray">Draw physical client buildings awaiting quotes</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={filters.showActiveLeads}
                            onChange={(e) => onChangeFilters({ ...filters, showActiveLeads: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-royalemerald"></div>
                        </label>
                      </div>

                      {filters.showActiveLeads && (
                        <div className="pt-2.5 border-t border-dashed border-[#e5dfd4] space-y-2.5 text-[11px]">
                          {/* CRM Stage Filter */}
                          <div className="flex justify-between items-center">
                            <span className="text-warmgray font-medium">Pipeline Stage</span>
                            <select 
                              value={filters.leadStageFilter}
                              onChange={(e: any) => onChangeFilters({ ...filters, leadStageFilter: e.target.value })}
                              className="bg-[#FAF9F5] border border-[rgba(184,135,61,0.15)] rounded-lg px-2 py-1 text-[10px] focus:ring-1 focus:ring-antiquegold"
                            >
                              <option value="all">All Stages</option>
                              <option value="captured">📍 Captured</option>
                              <option value="assigned">⚡ Assigned</option>
                              <option value="survey_done">📋 Survey Complete</option>
                              <option value="negotiating">💬 Negotiating</option>
                            </select>
                          </div>

                          {/* Building Heights Filter */}
                          <div className="flex justify-between items-center">
                            <span className="text-warmgray font-medium">Building Heights</span>
                            <select 
                              value={filters.leadFloorsFilter}
                              onChange={(e: any) => onChangeFilters({ ...filters, leadFloorsFilter: e.target.value })}
                              className="bg-[#FAF9F5] border border-[rgba(184,135,61,0.15)] rounded-lg px-2 py-1 text-[10px] focus:ring-1 focus:ring-antiquegold"
                            >
                              <option value="all">Any Floor Height</option>
                              <option value="low">Low Rise (1-4 floors)</option>
                              <option value="medium">Medium Rise (5-9 floors)</option>
                              <option value="high">High Rise (10+ floors)</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Active Installations / SOP Hubs */}
                    <div className="bg-white p-3.5 rounded-2xl border border-[rgba(184,135,61,0.08)] space-y-3 shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-yellow-50 text-[#B8873D] border border-yellow-200 flex items-center justify-center">
                            <Compass className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-charcoal">Install SOP Hubs</p>
                            <p className="text-[9px] text-warmgray">Map sites currently undergoing cabin construction</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={filters.showActiveInstallations}
                            onChange={(e) => onChangeFilters({ ...filters, showActiveInstallations: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-royalemerald"></div>
                        </label>
                      </div>

                      {filters.showActiveInstallations && (
                        <div className="pt-2.5 border-t border-dashed border-[#e5dfd4] space-y-2.5 text-[11px]">
                          {/* Installation progress filter */}
                          <div className="flex justify-between items-center">
                            <span className="text-warmgray font-medium">Project Status</span>
                            <select 
                              value={filters.jobStatusFilter}
                              onChange={(e: any) => onChangeFilters({ ...filters, jobStatusFilter: e.target.value })}
                              className="bg-[#FAF9F5] border border-[rgba(184,135,61,0.15)] rounded-lg px-2 py-1 text-[10px] focus:ring-1 focus:ring-antiquegold"
                            >
                              <option value="all">All Jobs</option>
                              <option value="pending">⏳ Pending Dispatch</option>
                              <option value="in_progress">🚧 In-Assembly</option>
                              <option value="qc_pending">👑 QC Audits pending</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* GROUP 3: GEO-TERRITORIAL OVERLAYS */}
                  <section className="space-y-3">
                    <h4 className="text-[10px] uppercase tracking-wider font-extrabold text-antiquegold border-b border-[rgba(184,135,61,0.08)] pb-1 flex items-center gap-1">
                      <MapIcon className="w-3.5 h-3.5" />
                      Geographical Territories &amp; GIS
                    </h4>

                    {/* Territories Layer */}
                    <div className="bg-white p-3.5 rounded-2xl border border-[rgba(184,135,61,0.08)] space-y-3 shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                            <MapIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-charcoal">Territory Zones</p>
                            <p className="text-[9px] text-warmgray">Highlight Pune administrative sectors</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={filters.showTerritories}
                            onChange={(e) => onChangeFilters({ ...filters, showTerritories: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-royalemerald"></div>
                        </label>
                      </div>

                      {filters.showTerritories && (
                        <div className="pt-2.5 border-t border-dashed border-[#e5dfd4] space-y-2 text-[11px]">
                          <span className="text-[9px] uppercase font-bold text-warmgray block mb-1">Select Active Municipal Sectors</span>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { id: 't1', label: 'Pune North (Chakan)' },
                              { id: 't2', label: 'Pune South (Kothrud)' },
                              { id: 't3', label: 'Pune East (Kharadi)' },
                              { id: 't4', label: 'Pune West (Hinjewadi)' }
                            ].map(t => (
                              <label key={t.id} className="flex items-center gap-2 p-1.5 bg-[#FAF9F5] border border-antiquegold/5 rounded-lg cursor-pointer">
                                <input 
                                  type="checkbox"
                                  checked={(filters.territorySelect as any)[t.id]}
                                  onChange={(e) => {
                                    const select = { ...filters.territorySelect, [t.id]: e.target.checked };
                                    onChangeFilters({ ...filters, territorySelect: select });
                                  }}
                                  className="w-3.5 h-3.5 rounded accent-royalemerald"
                                />
                                <span className="text-[9px] font-semibold text-charcoal truncate">{t.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Heatmap Layer */}
                    <div className="bg-white p-3.5 rounded-2xl border border-[rgba(184,135,61,0.08)] space-y-3 shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[#FFF5C6] text-[#B8873D] border border-[#B8873D]/20 flex items-center justify-center">
                            <Sparkles className="w-4 h-4 animate-pulse" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-charcoal">Demand Density Heatmap</p>
                            <p className="text-[9px] text-warmgray">Visualizes lead clusters dynamically via gradient clouds</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={filters.showHeatmap}
                            onChange={(e) => onChangeFilters({ ...filters, showHeatmap: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-royalemerald"></div>
                        </label>
                      </div>

                      {filters.showHeatmap && (
                        <div className="pt-2.5 border-t border-dashed border-[#e5dfd4] space-y-2 text-[11px]">
                          {/* Heatmap Gradient Color */}
                          <div className="flex justify-between items-center">
                            <span className="text-warmgray font-medium">Gradient Spectrum</span>
                            <div className="flex gap-1.5">
                              {[
                                { id: 'gold', label: 'Gold', color: 'bg-[#B8873D]' },
                                { id: 'emerald', label: 'Emerald', color: 'bg-royalemerald' },
                                { id: 'sapphire', label: 'Sapphire', color: 'bg-blue-600' },
                                { id: 'ruby', label: 'Ruby', color: 'bg-red-600' }
                              ].map(gradient => (
                                <button
                                  key={gradient.id}
                                  onClick={() => onChangeFilters({ ...filters, heatmapIntensity: gradient.id as any })}
                                  className={`w-5 h-5 rounded-full ${gradient.color} border-2 ${
                                    filters.heatmapIntensity === gradient.id ? 'border-charcoal ring-1 ring-antiquegold' : 'border-white'
                                  }`}
                                  title={gradient.label}
                                />
                              ))}
                            </div>
                          </div>

                          {/* Heatmap Radius size */}
                          <div className="flex justify-between items-center pt-1">
                            <span className="text-warmgray font-medium">Radius Dimension</span>
                            <div className="flex bg-[#FAF9F5] border border-antiquegold/10 p-0.5 rounded-lg text-[9px] font-bold">
                              {(['small', 'medium', 'large'] as const).map(size => (
                                <button
                                  key={size}
                                  onClick={() => onChangeFilters({ ...filters, heatmapRadius: size })}
                                  className={`px-2 py-0.5 rounded-md capitalize transition-colors ${
                                    filters.heatmapRadius === size ? 'bg-white text-charcoal shadow-xs' : 'text-warmgray hover:text-charcoal'
                                  }`}
                                >
                                  {size}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Geofences Layer */}
                    <div className="bg-white p-3.5 rounded-2xl border border-[rgba(184,135,61,0.08)] space-y-3 shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 border border-orange-200 flex items-center justify-center">
                            <Shield className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-charcoal">Cryptographic Geofences</p>
                            <p className="text-[9px] text-warmgray">Enforce virtual rings around claimed coordinates</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={filters.showGeofences}
                            onChange={(e) => onChangeFilters({ ...filters, showGeofences: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-royalemerald"></div>
                        </label>
                      </div>

                      {filters.showGeofences && (
                        <div className="pt-2.5 border-t border-dashed border-[#e5dfd4] space-y-2.5 text-[11px]">
                          {/* Min Match confidence slider */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-bold text-warmgray">
                              <span>Min Match Confidence</span>
                              <span className="text-royalemerald font-mono">{filters.geofenceMinConfidence}%</span>
                            </div>
                            <input 
                              type="range"
                              min="30"
                              max="100"
                              value={filters.geofenceMinConfidence}
                              onChange={(e) => onChangeFilters({ ...filters, geofenceMinConfidence: Number(e.target.value) })}
                              className="w-full accent-antiquegold h-1 bg-[#FAF9F5] rounded-full cursor-pointer"
                            />
                          </div>

                          {/* Acceptable Device accuracy */}
                          <div className="flex justify-between items-center">
                            <span className="text-warmgray font-medium">Acceptable GPS Radius</span>
                            <select 
                              value={filters.geofenceAccuracyRadius}
                              onChange={(e: any) => onChangeFilters({ ...filters, geofenceAccuracyRadius: Number(e.target.value) })}
                              className="bg-[#FAF9F5] border border-[rgba(184,135,61,0.15)] rounded-lg px-2 py-1 text-[10px] focus:ring-1 focus:ring-antiquegold"
                            >
                              <option value="15">🎯 High Lock (&le;15m)</option>
                              <option value="30">📶 Standard (&le;30m)</option>
                              <option value="50">📡 Medium Tunnel (&le;50m)</option>
                              <option value="100">🌍 Rural Wide (&le;100m)</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                </>
              ) : (
                /* PRESETS & SAVED VIEWS TAB */
                <div className="space-y-5">
                  <div className="bg-white p-4 rounded-2xl border border-[rgba(184,135,61,0.08)] space-y-4">
                    <div className="flex items-center gap-2">
                      <Save className="w-4 h-4 text-antiquegold" />
                      <span className="text-xs font-serif font-bold text-charcoal">Save Current Combination</span>
                    </div>

                    {!isSaving ? (
                      <Button
                        variant="secondary"
                        className="w-full text-xs font-bold py-2.5 flex items-center justify-center gap-1.5"
                        onClick={() => setIsSaving(true)}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Create New Saved Preset</span>
                      </Button>
                    ) : (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-3 pt-1 text-xs"
                      >
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-extrabold text-charcoal">Preset View Name</label>
                          <input 
                            type="text"
                            placeholder="e.g. Pune North Dispatch View"
                            value={newViewName}
                            onChange={(e) => setNewViewName(e.target.value)}
                            className="w-full bg-[#FAF9F5] border border-antiquegold/25 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-antiquegold focus:outline-none"
                          />
                        </div>

                        <div className="flex flex-col gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                              type="checkbox"
                              checked={makeDefault}
                              onChange={(e) => setMakeDefault(e.target.checked)}
                              className="w-3.5 h-3.5 rounded text-royalemerald accent-royalemerald cursor-pointer"
                            />
                            <span>Set as my personal default map startup view</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                              type="checkbox"
                              checked={makeShareable}
                              onChange={(e) => setMakeShareable(e.target.checked)}
                              className="w-3.5 h-3.5 rounded text-royalemerald accent-royalemerald cursor-pointer"
                            />
                            <span>Share preset view globally with other admins</span>
                          </label>
                        </div>

                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => setIsSaving(false)}
                            className="flex-1 py-2 text-xs font-bold border border-warmgray/20 rounded-xl text-warmgray hover:bg-[#FAF9F5] transition-all"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveView}
                            className="flex-1 py-2 text-xs font-bold bg-[#B8873D] text-white rounded-xl hover:bg-opacity-90 transition-all shadow"
                          >
                            Save View
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* SAVED PRESETS VIEW LIST */}
                  <div className="space-y-3">
                    <h5 className="text-[10px] uppercase tracking-wider font-extrabold text-warmgray">All Saved Presets</h5>

                    <div className="space-y-2.5">
                      {savedViews.map(view => (
                        <div
                          key={view.id}
                          onClick={() => handleLoadPreset(view)}
                          className="bg-white p-3.5 rounded-2xl border border-[rgba(184,135,61,0.08)] hover:border-antiquegold transition-all cursor-pointer shadow-xs hover:shadow flex justify-between items-start group"
                        >
                          <div className="space-y-1 flex-1 pr-4">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-serif text-sm font-bold text-charcoal">{view.name}</span>
                              {view.isDefault && (
                                <span className="text-[8px] px-1.5 py-0 rounded-full bg-[#FFF5C6] text-[#B8873D] border border-antiquegold/20 font-bold uppercase tracking-wider">
                                  Default
                                </span>
                              )}
                              {view.isShareable && (
                                <span className="text-[8px] px-1.5 py-0 rounded-full bg-blue-50 text-blue-600 border border-blue-200 uppercase font-bold tracking-wider">
                                  Shared
                                </span>
                              )}
                            </div>

                            {/* Summary description of active items in preset */}
                            <p className="text-[10px] text-warmgray line-clamp-2 leading-relaxed">
                              Layers active: {
                                [
                                  view.config.showSurveyors ? 'Surveyors' : '',
                                  view.config.showTechnicians ? 'Technicians' : '',
                                  view.config.showActiveLeads ? 'Leads' : '',
                                  view.config.showActiveInstallations ? 'Jobs' : '',
                                  view.config.showTerritories ? 'Territories' : '',
                                  view.config.showHeatmap ? 'Heatmap' : '',
                                  view.config.showGeofences ? 'Geofences' : ''
                                ].filter(Boolean).join(', ') || 'None'
                              }
                            </p>
                          </div>

                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleDefaultView(view.id);
                              }}
                              className={`p-1.5 rounded-lg border transition-colors ${
                                view.isDefault 
                                  ? 'bg-[#FFF5C6] border-antiquegold/20 text-[#B8873D]' 
                                  : 'bg-white border-warmgray/10 text-warmgray hover:text-[#B8873D] hover:bg-[#FAF9F5]'
                              }`}
                              title={view.isDefault ? "Unset Default View" : "Make Default Startup View"}
                            >
                              <Star className={`w-3.5 h-3.5 ${view.isDefault ? 'fill-current' : ''}`} />
                            </button>

                            <button
                              onClick={(e) => handleDeleteView(view.id, e)}
                              className="p-1.5 bg-white border border-warmgray/10 text-warmgray hover:text-error hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                              title="Delete preset"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* STICKY ACTION PANEL FOOTER */}
            <footer className="p-4 bg-white border-t border-[rgba(184,135,61,0.12)] shrink-0 flex gap-2">
              <Button
                variant="secondary"
                className="flex-1 py-2.5 text-xs font-bold"
                onClick={() => {
                  onChangeFilters(defaultFilters);
                  onShowAlert('Map layers reset to factory defaults.', 'info');
                }}
              >
                Reset Default View
              </Button>
              <Button
                variant="primary"
                className="flex-1 py-2.5 text-xs font-bold bg-royalemerald text-white hover:bg-opacity-90"
                onClick={onClose}
              >
                Apply Layers
              </Button>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
