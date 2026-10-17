/**
 * Team & settings (Admin): invite people with a role (D-13), today's
 * on-call technician and the emergency number (D-28), default QC /
 * technician / surveyor, the confirmed GST rate ⚖ and survey fee (D-30),
 * and the supplier list (spec §24). Also the per-browser MVP_MODE switch.
 */
import React, { useState } from 'react';
import type { User } from '../../types';
import * as svc from '../../mvp/service';
import { isMvpModeOn, MVP_CONFIG } from '../../mvp/config';
import { getRepository } from '../../repository';
import { loadDirectory, ROLE_LABELS } from '../../mvp/ui/directory';
import type { MvpRole } from '../../mvp/types';
import { Btn, C, ErrorText, Field, Input, Loading, Panel, Screen, Select, useAction, useLoader, useServiceCtx } from '../../mvp/ui/kit';

const INVITE_ROLES: MvpRole[] = ['admin', 'owner', 'sales', 'surveyor', 'technician', 'qc', 'customer'];

export const MvpSettings: React.FC<{ user: User }> = ({ user }) => {
  const ctx = useServiceCtx(user);
  const { data, loading, reload } = useLoader(async () => {
    const r = svc.repos(ctx);
    const [settings, people, suppliers, invites, customers, pending] = await Promise.all([
      svc.loadSettings(ctx), loadDirectory(ctx.repo, ctx.actor), r.suppliers.list().catch(() => []), r.invites.list().catch(() => []), r.customers.list().catch(() => []),
      ctx.repo.environment === 'demo' ? Promise.resolve([]) : getRepository<any>('users', ctx.repo).queryWhere([['role', '==', 'pending_selection']]).catch(() => []),
    ]);
    return { settings, people, suppliers, invites, customers, pending };
  }, [ctx]);
  if (loading && !data) return <Screen title="Team & settings"><Loading /></Screen>;
  if (!data) return null;
  return (
    <Screen title="Team & settings">
      <InvitePanel ctx={ctx} customers={data.customers} invites={data.invites} onDone={reload} />
      {data.pending.length > 0 && <PendingPanel ctx={ctx} pending={data.pending} customers={data.customers} onDone={reload} />}
      <OpsPanel ctx={ctx} settings={data.settings} people={data.people} onDone={reload} />
      <SupplierPanel ctx={ctx} suppliers={data.suppliers} onDone={reload} />
      <Panel title="Navigation">
        <p className="text-sm" style={{ color: C.muted }}>MVP mode shows only the MVP screens. Turning it off in this browser brings back the full legacy navigation (nothing was deleted).</p>
        <Btn tone="ghost" onClick={() => { try { localStorage.setItem('aiec_mvp_mode', isMvpModeOn() ? 'off' : 'on'); } catch { /* ignore */ } window.location.reload(); }}>
          {isMvpModeOn() ? 'Turn MVP mode off (this browser)' : 'Turn MVP mode on'}
        </Btn>
      </Panel>
    </Screen>
  );
};

const InvitePanel: React.FC<{ ctx: svc.ServiceCtx; customers: any[]; invites: any[]; onDone: () => void }> = ({ ctx, customers, invites, onDone }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<MvpRole>('technician');
  const [customerId, setCustomerId] = useState('');
  const a = useAction(() => { setEmail(''); setName(''); onDone(); });
  return (
    <Panel title="Invite people">
      <p className="text-xs" style={{ color: C.muted }}>People sign in with Google using this email. Their role (and, for a customer, their order) is set here — nobody chooses their own staff role.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Google email"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></Field>
        <Field label="Name"><Input value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="Role"><Select value={role} onChange={e => setRole(e.target.value as MvpRole)}>{INVITE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select></Field>
        {role === 'customer' && (
          <Field label="Customer record">
            <Select value={customerId} onChange={e => setCustomerId(e.target.value)}>
              <option value="">Choose…</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}
            </Select>
          </Field>
        )}
      </div>
      <ErrorText error={a.error} />
      <Btn busy={a.busy} disabled={!email || !name || (role === 'customer' && !customerId)} onClick={() => a.run(() => svc.inviteUser(ctx, email, role, name, customerId || undefined), 'Invite saved')}>Save invite</Btn>
      {invites.length > 0 && (
        <ul className="text-xs space-y-1" style={{ color: C.muted }}>
          {invites.map(i => <li key={i.id}>{i.email} · {ROLE_LABELS[i.role as MvpRole] ?? i.role}{i.customerId ? ` · ${i.customerId}` : ''}</li>)}
        </ul>
      )}
    </Panel>
  );
};

/** People who signed in before being invited wait here until the Admin gives them a role (D-13). */
const PendingPanel: React.FC<{ ctx: svc.ServiceCtx; pending: any[]; customers: any[]; onDone: () => void }> = ({ ctx, pending, customers, onDone }) => (
  <Panel title={`Waiting for a role (${pending.length})`}>
    {pending.map(u => <PendingRow key={u.id} ctx={ctx} u={u} customers={customers} onDone={onDone} />)}
  </Panel>
);

const PendingRow: React.FC<{ ctx: svc.ServiceCtx; u: any; customers: any[]; onDone: () => void }> = ({ ctx, u, customers, onDone }) => {
  const [role, setRole] = useState<MvpRole>('customer');
  const [customerId, setCustomerId] = useState('');
  const a = useAction(onDone);
  return (
    <div className="grid sm:grid-cols-4 gap-2 items-center text-sm">
      <span className="truncate">{u.name} · {u.email}</span>
      <Select aria-label="Role" value={role} onChange={e => setRole(e.target.value as MvpRole)}>{INVITE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select>
      {role === 'customer' ? (
        <Select aria-label="Customer" value={customerId} onChange={e => setCustomerId(e.target.value)}>
          <option value="">Customer record…</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      ) : <span />}
      <Btn tone="ghost" busy={a.busy} disabled={role === 'customer' && !customerId} onClick={() => a.run(() => svc.setUserRole(ctx, u.id, role, customerId || undefined), 'Role set')}>Set role</Btn>
      <ErrorText error={a.error} />
    </div>
  );
};

const OpsPanel: React.FC<{ ctx: svc.ServiceCtx; settings: any; people: any[]; onDone: () => void }> = ({ ctx, settings, people, onDone }) => {
  const today = svc.istDate(new Date());
  const techs = people.filter(p => p.role === 'technician');
  const [onCall, setOnCall] = useState(settings.onCall?.date === today ? settings.onCall.technicianId : '');
  const [phone, setPhone] = useState(settings.emergencyPhone ?? '');
  const [qc, setQc] = useState(settings.defaultAssignees?.qc ?? '');
  const [gst, setGst] = useState(settings.gstRatePct?.toString() ?? '');
  const [fee, setFee] = useState(String(settings.surveyFeeInr ?? MVP_CONFIG.SURVEY_FEE_INR));
  const a = useAction(onDone);
  return (
    <Panel title="Operations">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={`On-call technician today (${today})`} hint="Emergencies go to the Admin when nobody is on call.">
          <Select value={onCall} onChange={e => setOnCall(e.target.value)}>
            <option value="">Nobody (Admin handles emergencies)</option>
            {techs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Emergency phone number ⚖ VERIFY"><Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder={MVP_CONFIG.EMERGENCY_PHONE_FALLBACK} /></Field>
        <Field label="Default QC inspector" hint="Otherwise any QC login can pick up QC tasks.">
          <Select value={qc} onChange={e => setQc(e.target.value)}>
            <option value="">Any QC</option>
            {people.filter(p => p.role === 'qc').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Confirmed GST rate % ⚖ VERIFY with a CA" hint="Leave empty until a CA confirms it; quotes then show 'tax rate not confirmed'.">
          <Input inputMode="decimal" value={gst} onChange={e => setGst(e.target.value)} />
        </Field>
        <Field label="Survey fee ₹ (0 = off, D-30)"><Input inputMode="numeric" value={fee} onChange={e => setFee(e.target.value)} /></Field>
      </div>
      <ErrorText error={a.error} />
      <Btn busy={a.busy} onClick={() => a.run(() => svc.saveSettings(ctx, {
        onCall: onCall ? { date: today, technicianId: onCall } : undefined,
        emergencyPhone: phone || undefined,
        defaultAssignees: { ...(settings.defaultAssignees ?? {}), qc: qc || undefined },
        gstRatePct: gst === '' ? undefined : Number(gst),
        surveyFeeInr: Math.max(0, Number(fee) || 0),
      }), 'Settings saved')}>Save</Btn>
    </Panel>
  );
};

const SupplierPanel: React.FC<{ ctx: svc.ServiceCtx; suppliers: any[]; onDone: () => void }> = ({ ctx, suppliers, onDone }) => {
  const [f, setF] = useState({ name: '', contact: '', phone: '', gstin: '' });
  const a = useAction(() => { setF({ name: '', contact: '', phone: '', gstin: '' }); onDone(); });
  return (
    <Panel title="Suppliers">
      <ul className="text-sm space-y-1">{suppliers.map(s => <li key={s.id}>{s.name} · {s.contact} · <a className="underline" href={`tel:${s.phone}`}>{s.phone}</a></li>)}</ul>
      <div className="grid sm:grid-cols-4 gap-2">
        <Input placeholder="Supplier" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
        <Input placeholder="Contact person" value={f.contact} onChange={e => setF({ ...f, contact: e.target.value })} />
        <Input placeholder="Phone" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
        <Input placeholder="GSTIN" value={f.gstin} onChange={e => setF({ ...f, gstin: e.target.value })} />
      </div>
      <ErrorText error={a.error} />
      <Btn tone="ghost" busy={a.busy} disabled={!f.name.trim()} onClick={() => a.run(() => svc.upsertSupplier(ctx, { ...f, status: 'active' }), 'Supplier added')}>Add supplier</Btn>
    </Panel>
  );
};
