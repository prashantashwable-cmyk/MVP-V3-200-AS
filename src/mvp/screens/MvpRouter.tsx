/**
 * The single MVP router (D-22). Renders only allow-listed screens for the user's role;
 * any other tab id (including every legacy screen id) falls back to the role's home, so
 * hidden screens are never mounted and cannot be reached by a direct tab id.
 */

import React, { useEffect, useState } from 'react';
import type { User } from '../../types';
import { isAllowedTab, homeTabFor } from '../mvpMode';
import { AdminDashboard } from './AdminDashboard';
import { OrdersList } from './OrdersList';
import { ProjectOperatingView } from '../../components/ProjectOperatingView';
import { WorkQueueScreen } from '../../components/WorkQueueScreen';
import { MvpSettings } from './MvpSettings';
import { LeadForm } from './LeadForm';
import { LeadsList } from './LeadsList';
import { LeadDetailScreen } from './LeadDetail';
import { SurveyForm, SurveyList } from './SurveyScreens';
import { OrderExtras } from './OrderExtras';

export interface MvpRouterProps {
  user: User;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  languageSection?: React.ReactNode;
}

// App.tsx re-mounts routed content on every tab change (motion key = activeTab), so the
// selected order must live outside this component's state.
const selection = { orderId: '', returnTab: '', leadId: '' };

export const MvpRouter: React.FC<MvpRouterProps> = ({ user, activeTab, setActiveTab, onLogout, languageSection }) => {
  const [orderId, setOrderIdState] = useState<string>(selection.orderId);
  const setOrderId = (id: string) => { selection.orderId = id; setOrderIdState(id); };
  const returnTab = selection.returnTab || homeTabFor(user.role);
  const setReturnTab = (t: string) => { selection.returnTab = t; };
  const tab = isAllowedTab(user.role, activeTab) ? activeTab : homeTabFor(user.role);

  useEffect(() => {
    // Deep links from anywhere (dashboard, task queue, notifications) use this event.
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail;
      if (typeof id === 'string' && id) { setOrderId(id); setActiveTab('MvpOrder'); }
    };
    window.addEventListener('aiec_open_order', handler);
    return () => window.removeEventListener('aiec_open_order', handler);
  }, [setActiveTab]);

  const openOrder = (id: string) => {
    setReturnTab(tab);
    setOrderId(id);
    setActiveTab('MvpOrder');
  };
  const openLead = (id: string) => { selection.leadId = id; setActiveTab('MvpLead'); };
  const openSurvey = (id: string) => { setOrderId(id); setActiveTab('MvpSurvey'); };

  switch (tab) {
    case 'MvpDashboard':
      return <AdminDashboard user={user} onOpenOrder={openOrder} />;
    case 'MvpOrders':
      return <OrdersList user={user} onOpenOrder={openOrder} />;
    case 'MvpTasks':
      return <WorkQueueScreen user={user} onOpenOrder={openOrder} />;
    case 'MvpOrder':
      return (
        <ProjectOperatingView user={user} orderId={orderId} onBack={() => setActiveTab(returnTab)}
          renderExtra={p => <OrderExtras user={user} onOpenSurvey={openSurvey} {...p} />} />
      );
    case 'MvpLeads':
      return <LeadsList user={user} onOpenLead={openLead} onNewLead={() => setActiveTab('MvpNewLead')} />;
    case 'MvpNewLead':
      return <LeadForm user={user} onSaved={openLead} onOpenLead={openLead} />;
    case 'MvpLead':
      return <LeadDetailScreen user={user} leadId={selection.leadId} onOpenOrder={openOrder} onBack={() => setActiveTab('MvpLeads')} />;
    case 'MvpSurveys':
      return <SurveyList user={user} onOpenSurvey={openSurvey} />;
    case 'MvpSurvey':
      return <SurveyForm user={user} orderId={orderId} onDone={() => setActiveTab('MvpSurveys')} />;
    case 'MvpSettings':
    default:
      return <MvpSettings user={user} onLogout={onLogout} languageSection={languageSection} />;
  }
};
