/**
 * Mounts the MVP screens by tab id (D-22). Rendered next to the legacy
 * routers in App.tsx; every legacy route stays mounted and reachable when
 * MVP_MODE is off.
 */
import React, { Suspense } from 'react';
import type { User } from '../../types';
import { Loading } from '../../mvp/ui/kit';

const MvpDashboard = React.lazy(() => import('./MvpDashboard').then(m => ({ default: m.MvpDashboard })));
const MvpOrders = React.lazy(() => import('./MvpOrders').then(m => ({ default: m.MvpOrders })));
const MvpLeads = React.lazy(() => import('./MvpLeads').then(m => ({ default: m.MvpLeads })));
const MvpMyWork = React.lazy(() => import('./MvpMyWork').then(m => ({ default: m.MvpMyWork })));
const MvpNotifications = React.lazy(() => import('./MvpMyWork').then(m => ({ default: m.MvpNotifications })));
const MvpReports = React.lazy(() => import('./MvpReports').then(m => ({ default: m.MvpReports })));
const MvpSettings = React.lazy(() => import('./MvpSettings').then(m => ({ default: m.MvpSettings })));

export const MvpRoutes: React.FC<{ user: User; activeTab: string }> = ({ user, activeTab }) => {
  const screen = (() => {
    switch (activeTab) {
      case 'MvpDashboard': return <MvpDashboard user={user} />;
      case 'MvpOrders': return <MvpOrders user={user} />;
      case 'MvpLeads': return <MvpLeads user={user} />;
      case 'MvpMyWork': return <MvpMyWork user={user} />;
      case 'MvpNotifications': return <MvpNotifications user={user} />;
      case 'MvpReports': return <MvpReports user={user} />;
      case 'MvpSettings': return user.role === 'admin' ? <MvpSettings user={user} /> : null;
      default: return null;
    }
  })();
  if (!screen) return null;
  return <Suspense fallback={<Loading />}>{screen}</Suspense>;
};
