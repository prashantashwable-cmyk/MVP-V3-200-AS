/** Settings in MVP_MODE: language, sign out, and (Admin only) the per-browser MVP_MODE switch. */

import React from 'react';
import { LogOut } from 'lucide-react';
import type { User } from '../../types';
import { Button, Card } from '../../components/Common';
import { setLocalMvpMode } from '../mvpMode';
import { environmentLabel, resolveEnvironment } from '../../lib/environment';
import { SectionTitle } from './ui';
import { OnCallSetting } from './QcHandoverPanels';

export const MvpSettings: React.FC<{ user: User; onLogout: () => void; languageSection?: React.ReactNode }> = ({ user, onLogout, languageSection }) => (
  <div className="space-y-4 max-w-xl mx-auto pb-24">
    <Card className="p-4 space-y-1">
      <SectionTitle>Signed in</SectionTitle>
      <div className="text-sm font-bold">{user.name}</div>
      <div className="text-xs text-warmgray">{user.role} · {environmentLabel(resolveEnvironment(user))}</div>
    </Card>
    {languageSection && <Card className="p-4">{languageSection}</Card>}
    <OnCallSetting user={user} />
    {user.role === 'admin' && (
      <Card className="p-4 space-y-2">
        <SectionTitle>Full (legacy) app</SectionTitle>
        <p className="text-xs text-warmgray">The MVP shows only the screens needed to run an order. The full legacy app is still available in this browser for reference. Its data is local to this browser; it is not the shared order data.</p>
        <Button variant="secondary" onClick={() => { setLocalMvpMode(false); window.location.reload(); }}>Show the full legacy app in this browser</Button>
      </Card>
    )}
    <Button variant="danger" onClick={onLogout}><LogOut className="w-4 h-4" />Sign out</Button>
  </div>
);
