/**
 * Users (D-13): the Admin's invite list — the only way anyone but the owner email gets a
 * role in MVP_MODE. Shows who has signed in already and who is still invited-but-pending.
 */

import React, { useState } from 'react';
import type { User } from '../../types';
import type { CanonicalUserRole } from '../../domain/entities';
import { Button, Card } from '../../components/Common';
import { createInvite, listCustomersForInvite, listInvites } from '../services/invites';
import { listPeople } from '../services/people';
import { formatDate } from '../format';
import { ErrorNote, inputCls, labelCls, SectionTitle, useAction, useLoad, useMvpCtx } from './ui';

const ROLES: CanonicalUserRole[] = ['admin', 'owner', 'sales', 'surveyor', 'technician', 'qc', 'customer', 'supplier'];

export const UsersScreen: React.FC<{ user: User }> = ({ user }) => {
  const { ctx, actor } = useMvpCtx(user);
  const { run, busy, error } = useAction();
  const people = useLoad(() => listPeople(ctx), [ctx]);
  const invites = useLoad(() => listInvites(ctx), [ctx]);
  const customers = useLoad(() => listCustomersForInvite(ctx), [ctx]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<CanonicalUserRole>('sales');
  const [customerId, setCustomerId] = useState('');
  if (user.role !== 'admin') return null;

  const signedIn = new Set((people.data ?? []).map(p => p.email?.toLowerCase()).filter(Boolean));
  const save = () => run(() => createInvite(ctx, actor, { email, name, role, customerId: role === 'customer' ? customerId : undefined }))
    .then(ok => { if (ok) { setEmail(''); setName(''); setCustomerId(''); invites.reload(); } });

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-24">
      <h2 className="text-lg font-bold text-charcoal">Users</h2>

      <Card className="p-4 space-y-2">
        <SectionTitle>Invite someone</SectionTitle>
        {error && <ErrorNote message={error} />}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div><label className={labelCls}>Email (must sign in with this Google account)</label><input className={inputCls} value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" /></div>
          <div><label className={labelCls}>Name</label><input className={inputCls} value={name} onChange={e => setName(e.target.value)} /></div>
          <div><label className={labelCls}>Role</label>
            <select className={inputCls} value={role} onChange={e => setRole(e.target.value as CanonicalUserRole)}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {role === 'customer' && (
            <div><label className={labelCls}>Customer</label>
              <select className={inputCls} value={customerId} onChange={e => setCustomerId(e.target.value)}>
                <option value="">Choose…</option>
                {(customers.data ?? []).map(c => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}
              </select>
            </div>
          )}
        </div>
        <Button variant="primary" disabled={busy || !email.trim() || !name.trim() || (role === 'customer' && !customerId)} onClick={save}>Send invite</Button>
      </Card>

      <Card className="p-4">
        <SectionTitle>Invited</SectionTitle>
        {(invites.data ?? []).length === 0 && <p className="text-xs text-warmgray">No one invited yet.</p>}
        <ul className="divide-y divide-[#f0ebe2]">
          {(invites.data ?? []).map(i => (
            <li key={i.id} className="py-2 flex justify-between gap-2 text-sm">
              <span>{i.name} · {i.email} · <strong>{i.role}</strong></span>
              <span className="text-xs text-warmgray">{signedIn.has(i.email.toLowerCase()) ? 'Signed in' : 'Pending'} · invited {formatDate(i.createdAt)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-4">
        <SectionTitle>Signed in</SectionTitle>
        <ul className="divide-y divide-[#f0ebe2]">
          {(people.data ?? []).map(p => <li key={p.id} className="py-2 text-sm">{p.name} · <strong>{p.role}</strong>{p.status && p.status !== 'active' ? ` · ${p.status}` : ''}</li>)}
        </ul>
      </Card>
    </div>
  );
};
