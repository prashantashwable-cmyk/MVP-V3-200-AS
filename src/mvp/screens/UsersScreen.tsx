/**
 * Users (D-13): the Admin's invite list — the only way anyone but the owner email gets a
 * role in MVP_MODE. Shows who has signed in already and who is still invited-but-pending.
 */

import React, { useState } from 'react';
import type { User } from '../../types';
import type { CanonicalUserRole } from '../../domain/entities';
import { Button, Card } from '../../components/Common';
import { createInvite, listCustomersForInvite, listInvites } from '../services/invites';
import { listPeople, setPersonPhone, type Person } from '../services/people';
import { formatDate } from '../format';
import { ErrorNote, inputCls, labelCls, SectionTitle, useAction, useLoad, useMvpCtx } from './ui';

/** D-32: the mobile the chase list uses for WhatsApp / call (Google sign-in gives none). */
const PhoneCell: React.FC<{ person: Person; onSave: (phone: string) => Promise<boolean> }> = ({ person, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(person.phone ?? '');
  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="text-xs font-semibold text-royalemerald cursor-pointer min-h-[40px] px-1">
        {person.phone ? person.phone : 'Add mobile'}
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <input aria-label={`Mobile for ${person.name}`} className={`${inputCls} w-36`} inputMode="tel" value={value} onChange={e => setValue(e.target.value)} placeholder="98xxxxxxxx" />
      <Button variant="primary" onClick={() => onSave(value).then(ok => { if (ok) setEditing(false); })}>Save</Button>
    </span>
  );
};

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
        <p className="text-xs text-warmgray mb-1">Add each person's mobile so the chase list can WhatsApp or call them.</p>
        <ul className="divide-y divide-[#f0ebe2]">
          {(people.data ?? []).map(p => (
            <li key={p.id} className="py-2 text-sm flex flex-wrap items-center justify-between gap-2">
              <span>{p.name} · <strong>{p.role}</strong>{p.status && p.status !== 'active' ? ` · ${p.status}` : ''}</span>
              {p.role !== 'customer' && (
                <PhoneCell person={p} onSave={phone => run(() => setPersonPhone(ctx, actor, p.id, phone)).then(ok => { if (ok) people.reload(); return !!ok; })} />
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};
