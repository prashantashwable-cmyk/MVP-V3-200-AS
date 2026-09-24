import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, clearSession, getSession, setSession } from './api';
import type { Me } from './api';
import { AdminPage } from './admin';
import { CustomerPage, MyWorkPage } from './field';
import { AskHost, Toaster, ask, toast } from './ui';

const browserDemo: { reset(): Promise<void> } | undefined = (window as any).__AIEC_BROWSER_DEMO__;

const ROLE_LABEL: Record<Me['role'], string> = { admin: 'Admin', technician: 'Technician', customer: 'Customer', supplier: 'Supplier' };

function Login({ onLogin }: { onLogin: (m: Me) => void }) {
  const [users, setUsers] = useState<{ id: string; name: string; role: Me['role']; org: string; active: boolean }[]>([]);
  const [pick, setPick] = useState<string>('');
  const [pin, setPin] = useState('1234');
  useEffect(() => { api('/login-options').then(setUsers).catch(() => toast('Server not reachable')); }, []);
  const login = async (userId: string) => {
    try {
      const r = await api<{ token: string; user: Me }>('/login', 'POST', { userId, pin });
      setSession(r.token, r.user);
      onLogin(r.user);
    } catch (e) { toast(e instanceof Error ? e.message : String(e)); }
  };
  const groups: Me['role'][] = ['admin', 'technician', 'customer', 'supplier'];
  return (
    <div className="wrap narrow">
      <div className="card" style={{ marginTop: 24 }}>
        <h1>AIEC Work Manager</h1>
        <p className="muted">ALL INDIA ELEVATORS COMPANY · workflow MVP. Pick who you are.{' '}
          {browserDemo ? 'This phone demo runs every user on this device: use Switch user (top right) to move between Admin, technician, customer and supplier.' : 'Each browser tab can be a different person, so open one tab per role to watch them work together.'}</p>
        {browserDemo && <p className="small muted">Tip: log in as Admin and tap ▶ START DEMO. The demo bot plays the field users while you watch the Control Tower.</p>}
        {groups.map(g => (
          <div key={g} style={{ marginTop: 12 }}>
            <div className="muted small" style={{ fontWeight: 600 }}>{ROLE_LABEL[g].toUpperCase()}</div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginTop: 6 }}>
              {users.filter(u => u.role === g).map(u => (
                <button key={u.id} className={`btn ${pick === u.id ? 'primary' : ''}`} style={{ textAlign: 'left' }} disabled={!u.active} onClick={() => setPick(u.id)}>
                  <b>{u.name}</b><div className="small" style={{ opacity: .8 }}>{u.org}{!u.active && ' · access removed'}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="row" style={{ marginTop: 16 }}>
          <input type="password" inputMode="numeric" aria-label="PIN" value={pin} onChange={e => setPin(e.target.value)} style={{ maxWidth: 140 }} />
          <button className="btn primary" disabled={!pick} onClick={() => login(pick)}>Log in</button>
          <span className="small muted">Demo PIN: 1234</span>
        </div>
        {browserDemo && (
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn danger" onClick={async () => { const a = await ask('Reset all demo data?', [], { note: 'Deletes every project on this device and starts fresh.', confirm: 'Reset' }); if (a) browserDemo.reset(); }}>Reset demo data</button>
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [me, setMe] = useState<Me | null>(getSession()?.user ?? null);
  useEffect(() => {
    const out = () => setMe(null);
    window.addEventListener('aiec-logout', out);
    return () => window.removeEventListener('aiec-logout', out);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [me?.id]);

  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="brand">AIEC Work Manager<small>{me ? `${me.name} · ${ROLE_LABEL[me.role]}` : 'Workflow automation MVP'}</small></div>
          <div className="spacer" />
          {me && <button className="btn" onClick={async () => { try { await api('/logout', 'POST'); } catch { /* ignore */ } clearSession(); setMe(null); }}>Switch user</button>}
        </div>
      </header>
      {!me && <Login onLogin={setMe} />}
      {me?.role === 'admin' && <AdminPage />}
      {(me?.role === 'technician' || me?.role === 'supplier') && <MyWorkPage me={me} />}
      {me?.role === 'customer' && <CustomerPage me={me} />}
      <Toaster />
      <AskHost />
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
