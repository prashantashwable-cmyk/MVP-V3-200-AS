import React, { useState } from 'react';
import { 
  Shield, Users, Lock, ArrowLeft, Sparkles, Check, X, AlertTriangle, 
  History, Plus, Edit2, ShieldAlert, Key, Clock, CheckCircle2, Search, 
  ChevronRight, FileText, Filter
} from 'lucide-react';
import { UserRole, RolePermissionConfig, UserPermissionOverride, PermissionChangeAuditEntry, PermissionModuleAction } from '../types';
import { DbManager } from '../lib/db';

interface UserRolePermissionManagementScreenProps {
  userRole: UserRole;
  currentLanguage: 'en' | 'hi' | 'mr';
  currentUserId?: string;
  onBack?: () => void;
  onNavigateTab?: (tab: string, params?: any) => void;
}

export const UserRolePermissionManagementScreen: React.FC<UserRolePermissionManagementScreenProps> = ({
  userRole,
  currentLanguage,
  currentUserId,
  onBack,
  onNavigateTab
}) => {
  const [roleConfigs, setRoleConfigs] = useState<RolePermissionConfig[]>(() => 
    DbManager.getRolePermissionConfigs()
  );

  const [overrides, setOverrides] = useState<UserPermissionOverride[]>(() => 
    DbManager.getUserPermissionOverrides()
  );

  const [auditEntries, setAuditEntries] = useState<PermissionChangeAuditEntry[]>(() => 
    DbManager.getPermissionChangeAuditEntries()
  );

  const [selectedRole, setSelectedRole] = useState<RolePermissionConfig>(roleConfigs[0] || null);
  const [activeTab, setActiveTab] = useState<'matrix' | 'user_overrides' | 'audit_ledger'>('matrix');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Individual Override Modal
  const [showOverrideModal, setShowOverrideModal] = useState<boolean>(false);
  const [overrideUserName, setOverrideUserName] = useState<string>('Vikram Salunkhe (Senior Tech Lead)');
  const [overrideUserId, setOverrideUserId] = useState<string>('tech_vikram');
  const [overrideModuleId, setOverrideModuleId] = useState<string>('qc_inspections');
  const [overrideAction, setOverrideAction] = useState<'canRead' | 'canWrite' | 'canApprove' | 'canOverride' | 'canExport'>('canApprove');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [overrideExpiration, setOverrideExpiration] = useState<string>('2026-09-30');

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleToggleModulePermission = (roleId: string, moduleId: string, actionKey: keyof PermissionModuleAction) => {
    if (actionKey === 'moduleId' || actionKey === 'moduleName') return;

    // Self-lockout safeguard for Admin
    if (roleId === 'admin' && (actionKey === 'canRead' || actionKey === 'canWrite' || actionKey === 'canApprove')) {
      triggerToast('SAFETY RESTRICTION: Cannot revoke essential System Admin permissions to prevent self-lockout.');
      return;
    }

    const updatedRoles = roleConfigs.map(role => {
      if (role.roleId === roleId) {
        const updatedModules = role.modulePermissions.map(mod => {
          if (mod.moduleId === moduleId) {
            const currentVal = Boolean(mod[actionKey]);
            const newVal = !currentVal;

            // Audit record creation
            const newAudit: PermissionChangeAuditEntry = {
              auditId: `perm_audit_${Date.now()}`,
              timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST',
              changedByAdmin: 'Mr. Prashant Vasant Wable',
              targetRoleOrUser: `Role: ${role.roleName}`,
              changeType: 'role_permission_updated',
              description: `Toggled ${actionKey} for module "${mod.moduleName}" in role ${role.roleName}.`,
              previousPermissionState: `${actionKey} = ${currentVal}`,
              newPermissionState: `${actionKey} = ${newVal}`
            };

            DbManager.savePermissionChangeAuditEntry(newAudit);
            setAuditEntries(DbManager.getPermissionChangeAuditEntries());

            return {
              ...mod,
              [actionKey]: newVal
            };
          }
          return mod;
        });

        const updatedRole: RolePermissionConfig = {
          ...role,
          modulePermissions: updatedModules,
          updatedAt: new Date().toISOString().split('T')[0],
          updatedBy: 'Mr. Prashant Vasant Wable'
        };

        DbManager.saveRolePermissionConfig(updatedRole);
        return updatedRole;
      }
      return role;
    });

    setRoleConfigs(updatedRoles);
    const refreshedSelected = updatedRoles.find(r => r.roleId === roleId);
    if (refreshedSelected) setSelectedRole(refreshedSelected);

    triggerToast('Role permission matrix updated & logged in governance audit ledger!');
  };

  const handleCreateOverride = () => {
    if (!overrideReason.trim()) {
      triggerToast('Mandatory justification is required for account-level overrides.');
      return;
    }

    const newOverride: UserPermissionOverride = {
      overrideId: `ovr_${Date.now()}`,
      userId: overrideUserId,
      userName: overrideUserName,
      userRole: 'technician',
      grantedModuleId: overrideModuleId,
      grantedAction: overrideAction,
      mandatoryReason: overrideReason,
      grantedBy: 'Mr. Prashant Vasant Wable',
      grantedAt: new Date().toISOString().split('T')[0],
      expiresAt: overrideExpiration,
      isActive: true
    };

    const newAudit: PermissionChangeAuditEntry = {
      auditId: `perm_audit_${Date.now()}`,
      timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST',
      changedByAdmin: 'Mr. Prashant Vasant Wable',
      targetRoleOrUser: `User: ${overrideUserName}`,
      changeType: 'user_override_granted',
      description: `Granted ${overrideAction} override on module "${overrideModuleId}". Reason: ${overrideReason}`,
      previousPermissionState: 'No override',
      newPermissionState: `${overrideAction} = true (Expires ${overrideExpiration})`
    };

    DbManager.saveUserPermissionOverride(newOverride);
    DbManager.savePermissionChangeAuditEntry(newAudit);

    setOverrides(DbManager.getUserPermissionOverrides());
    setAuditEntries(DbManager.getPermissionChangeAuditEntries());
    setShowOverrideModal(false);
    setOverrideReason('');
    triggerToast(`Individual permission override granted to ${overrideUserName}!`);
  };

  const handleRevokeOverride = (overrideId: string) => {
    // Phase 23: financial_security-tier action (revokes a granted
    // permission override immediately, on a single click, with no prior
    // confirmation step anywhere in this screen) — a native confirm()
    // is the minimal, appropriate guard per this pack's own "do not add
    // pointless confirmation dialogs everywhere" rule: this one earns it,
    // a reversible action would not.
    const target = overrides.find(o => o.overrideId === overrideId);
    if (!window.confirm(`Revoke the "${target?.grantedAction ?? 'this'}" permission override for ${target?.userName ?? 'this user'}? They will immediately lose this access.`)) {
      return;
    }
    const updatedList = overrides.map(ovr => {
      if (ovr.overrideId === overrideId) {
        return { ...ovr, isActive: false };
      }
      return ovr;
    });

    const revokedOvr = overrides.find(o => o.overrideId === overrideId);
    if (revokedOvr) {
      const newAudit: PermissionChangeAuditEntry = {
        auditId: `perm_audit_${Date.now()}`,
        timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST',
        changedByAdmin: 'Mr. Prashant Vasant Wable',
        targetRoleOrUser: `User: ${revokedOvr.userName}`,
        changeType: 'user_override_revoked',
        description: `Revoked ${revokedOvr.grantedAction} override on module "${revokedOvr.grantedModuleId}".`,
        previousPermissionState: `${revokedOvr.grantedAction} = true`,
        newPermissionState: 'Override Revoked'
      };
      DbManager.savePermissionChangeAuditEntry(newAudit);
      setAuditEntries(DbManager.getPermissionChangeAuditEntries());
    }

    DbManager.saveUserPermissionOverride(updatedList.find(o => o.overrideId === overrideId)!);
    setOverrides(updatedList);
    triggerToast('Individual permission override revoked.');
  };

  const filteredRoles = roleConfigs.filter(r => 
    r.roleName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.roleDescription.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] pb-24 transition-colors duration-200">
      
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[var(--color-surface)] border border-[var(--color-accent-primary)] text-[var(--color-text-primary)] px-4 py-2.5 rounded-xl shadow-xl flex items-center space-x-2 text-xs font-bold animate-fadeIn">
          <Sparkles className="w-4 h-4 text-[var(--color-accent-primary)]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Navigation Header */}
      <div className="bg-[var(--color-surface)] border-b border-[var(--color-border)] sticky top-0 z-20 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {onBack && (
              <button 
                onClick={onBack}
                className="p-2 rounded-xl hover:bg-[var(--color-bg)] text-[var(--color-text-secondary)] transition-colors"
                title="Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h1 className="font-serif text-xl font-bold flex items-center gap-2">
                <Shield className="w-6 h-6 text-[var(--color-accent-primary)]" />
                {currentLanguage === 'hi' ? 'उपयोगकर्ता व भूमिका अनुमति प्रबंधन' : currentLanguage === 'mr' ? 'वापरकर्ता आणि भूमिका परवानगी व्यवस्थापन' : 'User & Role Permission Management'}
              </h1>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Role-based access matrix, individual user overrides, and immutable security change ledger
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowOverrideModal(true)}
            className="px-3.5 py-2 bg-[var(--color-accent-primary)] text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 hover:opacity-90 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">User Override Exception</span>
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Tab Navigation Controls */}
        <div className="flex border-b border-[var(--color-border)] space-x-4 text-xs font-bold">
          <button
            onClick={() => setActiveTab('matrix')}
            className={`pb-3 px-1 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'matrix' 
                ? 'border-[var(--color-accent-primary)] text-[var(--color-accent-primary)]' 
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Role Access Matrix</span>
          </button>

          <button
            onClick={() => setActiveTab('user_overrides')}
            className={`pb-3 px-1 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'user_overrides' 
                ? 'border-[var(--color-accent-primary)] text-[var(--color-accent-primary)]' 
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>Account Overrides ({overrides.filter(o => o.isActive).length})</span>
          </button>

          <button
            onClick={() => setActiveTab('audit_ledger')}
            className={`pb-3 px-1 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'audit_ledger' 
                ? 'border-[var(--color-accent-primary)] text-[var(--color-accent-primary)]' 
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Security Change Ledger ({auditEntries.length})</span>
          </button>
        </div>

        {/* Tab 1: Role Access Matrix */}
        {activeTab === 'matrix' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Role List Selector */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 shadow-sm space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-[var(--color-text-secondary)] absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Filter system roles..."
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-[var(--color-accent-primary)]"
                />
              </div>

              <div className="space-y-2">
                {filteredRoles.map(role => {
                  const isSelected = selectedRole?.roleId === role.roleId;

                  return (
                    <button
                      key={role.roleId}
                      onClick={() => setSelectedRole(role)}
                      className={`w-full text-left p-3 rounded-xl border text-xs transition-all space-y-1 ${
                        isSelected 
                          ? 'bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] border-[var(--color-accent-primary)] shadow-xs' 
                          : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-accent-primary)]'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="truncate pr-2 text-[var(--color-text-primary)]">{role.roleName}</span>
                        {role.isSystemProtectedRole && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">PROTECTED</span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--color-text-secondary)] line-clamp-2">
                        {role.roleDescription}
                      </p>
                      <div className="text-[10px] font-mono text-[var(--color-text-secondary)] pt-1 flex justify-between">
                        <span>Users: {role.userCount}</span>
                        <span>Updated: {role.updatedAt}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Matrix Permissions Detail Table */}
            {selectedRole && (
              <div className="lg:col-span-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--color-border)] pb-3">
                  <div>
                    <h3 className="font-serif font-bold text-base text-[var(--color-text-primary)]">
                      {selectedRole.roleName}
                    </h3>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {selectedRole.roleDescription}
                    </p>
                  </div>

                  {selectedRole.roleId === 'admin' && (
                    <div className="text-[10px] font-mono text-amber-700 dark:text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-xl border border-amber-500/20 flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5" /> Self-Lockout Protection Guard active
                    </div>
                  )}
                </div>

                {/* Matrix Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] text-[var(--color-text-secondary)] uppercase font-mono text-[10px]">
                        <th className="py-2.5 px-3">Module</th>
                        <th className="py-2.5 px-2 text-center">Read</th>
                        <th className="py-2.5 px-2 text-center">Write</th>
                        <th className="py-2.5 px-2 text-center">Approve</th>
                        <th className="py-2.5 px-2 text-center">Override</th>
                        <th className="py-2.5 px-2 text-center">Export</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {selectedRole.modulePermissions.map(mod => (
                        <tr key={mod.moduleId} className="hover:bg-[var(--color-bg)]/50 transition-colors">
                          <td className="py-3 px-3 font-bold text-[var(--color-text-primary)] font-serif">
                            {mod.moduleName}
                          </td>

                          {(['canRead', 'canWrite', 'canApprove', 'canOverride', 'canExport'] as (keyof PermissionModuleAction)[]).map(actionKey => {
                            const isGranted = Boolean(mod[actionKey]);

                            return (
                              <td key={actionKey} className="py-3 px-2 text-center">
                                <button
                                  onClick={() => handleToggleModulePermission(selectedRole.roleId, mod.moduleId, actionKey)}
                                  className={`p-1.5 rounded-lg transition-all ${
                                    isGranted 
                                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25' 
                                      : 'bg-red-500/10 text-red-600 hover:bg-red-500/20'
                                  }`}
                                  title={`Toggle ${actionKey} for ${mod.moduleName}`}
                                >
                                  {isGranted ? <Check className="w-4 h-4 stroke-[3]" /> : <X className="w-4 h-4 stroke-[3]" />}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

              </div>
            )}

          </div>
        )}

        {/* Tab 2: User Permission Overrides */}
        {activeTab === 'user_overrides' && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-serif font-bold text-base text-[var(--color-text-primary)] border-b border-[var(--color-border)] pb-2 flex items-center gap-2">
              <Key className="w-5 h-5 text-[var(--color-accent-primary)]" />
              Account-Level Permission Exception Overrides
            </h3>

            <div className="space-y-3">
              {overrides.map(ovr => (
                <div 
                  key={ovr.overrideId}
                  className={`p-4 rounded-xl border text-xs space-y-2 transition-all ${
                    ovr.isActive 
                      ? 'bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-accent-primary)]' 
                      : 'bg-[var(--color-bg)] border-[var(--color-border)] opacity-60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="font-serif font-bold text-sm text-[var(--color-text-primary)] flex items-center gap-2">
                        {ovr.userName}
                        {ovr.isActive ? (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">ACTIVE EXCEPTION</span>
                        ) : (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-500/10 text-gray-600 border border-gray-500/20">REVOKED</span>
                        )}
                      </h4>
                      <p className="text-[11px] font-mono text-[var(--color-text-secondary)]">
                        Granted Action: <strong className="text-[var(--color-accent-primary)]">{ovr.grantedAction}</strong> on Module: <strong className="text-[var(--color-text-primary)]">{ovr.grantedModuleId}</strong>
                      </p>
                    </div>

                    {ovr.isActive && (
                      <button
                        onClick={() => handleRevokeOverride(ovr.overrideId)}
                        className="px-3 py-1 bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20 hover:bg-red-500/20 rounded-xl font-bold transition-all text-xs"
                      >
                        Revoke Override
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-[var(--color-text-primary)] bg-[var(--color-bg)] p-2.5 rounded-lg border border-[var(--color-border)]">
                    <strong>Mandatory Justification:</strong> {ovr.mandatoryReason}
                  </p>

                  <div className="text-[10px] font-mono text-[var(--color-text-secondary)] flex justify-between pt-1">
                    <span>Granted By: {ovr.grantedBy} ({ovr.grantedAt})</span>
                    <span>Expires: {ovr.expiresAt || 'Indefinite'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Security Change Ledger */}
        {activeTab === 'audit_ledger' && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-serif font-bold text-base text-[var(--color-text-primary)] border-b border-[var(--color-border)] pb-2 flex items-center gap-2">
              <History className="w-5 h-5 text-[var(--color-accent-primary)]" />
              Immutable Security Change & Access Audit Trail
            </h3>

            <div className="space-y-2">
              {auditEntries.map(entry => (
                <div 
                  key={entry.auditId}
                  className="p-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl text-xs space-y-1 font-mono"
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-[var(--color-accent-primary)]">{entry.timestamp}</span>
                    <span className="text-[var(--color-text-secondary)]">Admin: {entry.changedByAdmin}</span>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-primary)] font-sans">
                    <strong>Target:</strong> {entry.targetRoleOrUser} — {entry.description}
                  </p>
                  <div className="text-[10px] text-[var(--color-text-secondary)] flex justify-between">
                    <span>Prev: {entry.previousPermissionState}</span>
                    <span className="text-emerald-700 dark:text-emerald-300">New: {entry.newPermissionState}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Grant Account Override Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-fadeIn">
            <h3 className="font-serif font-bold text-base text-[var(--color-text-primary)] border-b border-[var(--color-border)] pb-2 flex items-center gap-2">
              <Key className="w-5 h-5 text-[var(--color-accent-primary)]" />
              Grant Individual User Permission Override
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-[var(--color-text-primary)] block mb-1">Target Account / User</label>
                <input
                  type="text"
                  value={overrideUserName}
                  onChange={e => setOverrideUserName(e.target.value)}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[var(--color-accent-primary)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[var(--color-text-primary)] block mb-1">Target Module</label>
                  <select
                    value={overrideModuleId}
                    onChange={e => setOverrideModuleId(e.target.value)}
                    className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[var(--color-accent-primary)]"
                  >
                    <option value="qc_inspections">QC Safety Inspections</option>
                    <option value="crm">CRM & Lead Pipeline</option>
                    <option value="quotations">Quotations & Contracts</option>
                    <option value="field_jobs">Field Installation Jobs</option>
                    <option value="payouts">Partner Payouts</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-[var(--color-text-primary)] block mb-1">Elevated Action</label>
                  <select
                    value={overrideAction}
                    onChange={e => setOverrideAction(e.target.value as any)}
                    className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[var(--color-accent-primary)]"
                  >
                    <option value="canApprove">canApprove</option>
                    <option value="canWrite">canWrite</option>
                    <option value="canOverride">canOverride</option>
                    <option value="canExport">canExport</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-[var(--color-text-primary)] block mb-1">Mandatory Exception Justification</label>
                <textarea
                  rows={2}
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value)}
                  placeholder="State explicit operational reason..."
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl p-3 text-xs focus:outline-none focus:border-[var(--color-accent-primary)]"
                />
              </div>

              <div>
                <label className="font-bold text-[var(--color-text-primary)] block mb-1">Expiration Date</label>
                <input
                  type="date"
                  value={overrideExpiration}
                  onChange={e => setOverrideExpiration(e.target.value)}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[var(--color-accent-primary)]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[var(--color-border)]">
              <button
                onClick={() => setShowOverrideModal(false)}
                className="px-4 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] text-xs font-bold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateOverride}
                className="px-5 py-2 bg-[var(--color-accent-primary)] text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-1.5"
              >
                <Shield className="w-4 h-4" />
                <span>Grant & Log Override</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
