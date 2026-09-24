/**
 * MVP login pieces:
 *  - MvpDemoLogin: "Try as Role" for all 8 MVP roles (demo builds only, D-20), with demo data
 *    created in the in-memory store through the real services (src/mvp/demoSeed.ts).
 *  - MvpAwaitingInvite: shown to a signed-in user who has no invite yet (D-13): no self-signup.
 */

import React, { useState } from 'react';
import { ChevronRight, ShieldAlert } from 'lucide-react';
import type { User } from '../../types';
import type { CanonicalUserRole } from '../../domain/entities';
import { Button, Card } from '../../components/Common';
import { DEMO_PEOPLE, ensureDemoSeed } from '../demoSeed';
import { ErrorNote } from './ui';

const ROLE_ORDER: CanonicalUserRole[] = ['admin', 'owner', 'sales', 'surveyor', 'technician', 'qc', 'customer'];
const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin', owner: 'Owner', sales: 'Sales / Rider', surveyor: 'Surveyor', technician: 'Technician', qc: 'QC inspector', customer: 'Customer',
};

export async function buildDemoUser(role: CanonicalUserRole): Promise<User> {
  const { customerId } = await ensureDemoSeed({ environment: 'demo', actorUserId: 'demo_seed' });
  const p = DEMO_PEOPLE[role];
  return {
    id: p.userId, role, name: p.name, phone: '', status: 'active', isDemo: true, authMethod: 'demo',
    onboardingCompleted: true, primer_shown_flag: true, ...(role === 'customer' ? { customerId } : {}),
  };
}

export const MvpDemoLogin: React.FC<{ onLogin: (user: User) => void }> = ({ onLogin }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <p className="text-xs text-warmgray">Training mode: sample orders, kept only in this browser tab. Nothing is saved to the real database.</p>
      {error && <ErrorNote message={error} />}
      {ROLE_ORDER.map(role => (
        <button key={role} type="button" disabled={!!busy}
          onClick={async () => {
            setBusy(role); setError(null);
            try { onLogin(await buildDemoUser(role)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
          }}
          className="w-full p-3 bg-alabaster hover:bg-[#edeae2] border border-[rgba(184,135,61,0.1)] rounded-xl flex items-center justify-between text-left cursor-pointer">
          <span className="text-sm font-bold text-charcoal">Try as {ROLE_LABEL[role]}</span>
          <span className="text-xs text-warmgray">{busy === role ? 'Preparing…' : <ChevronRight className="w-4 h-4" />}</span>
        </button>
      ))}
    </div>
  );
};

export const MvpAwaitingInvite: React.FC<{ user: User; onSignOut: () => void }> = ({ user, onSignOut }) => (
  <Card className="w-full max-w-md p-6 space-y-4 text-center">
    <ShieldAlert className="w-10 h-10 mx-auto text-[#B8873D]" />
    <h2 className="text-lg font-bold">Ask the Admin to invite you</h2>
    <p className="text-sm text-warmgray">
      You are signed in as <strong>{user.email || user.name}</strong>, but this account has not been invited yet.
      The Admin adds your email with your role; then sign in again.
    </p>
    <Button variant="secondary" fullWidth onClick={onSignOut}>Sign out</Button>
  </Card>
);
