/**
 * Sales / rider screens (spec §13, §23): New Lead, My Leads, Follow-ups,
 * Won, Lost. A thin screen on `canonical_leads`; the legacy LeadInbox
 * (1,646 lines, browser-only) stays hidden behind MVP_MODE.
 */
import React, { useState } from 'react';
import type { User } from '../../types';
import * as svc from '../../mvp/service';
import { formatIst } from '../../mvp/money';
import { listLeadsFor } from '../../mvp/views';
import type { Evidence, LeadStatus, MvpLead } from '../../mvp/types';
import { openOrder } from '../../mvp/navigation';
import { Btn, C, Empty, ErrorText, EvidenceThumbs, Field, Input, Loading, Panel, PhotoInput, Pill, Screen, Select, TextArea, fromDateInput, toDateInput, useAction, useLoader, useServiceCtx } from '../../mvp/ui/kit';

type Tab = 'new' | 'mine' | 'followups' | 'won' | 'lost';
const TABS: [Tab, string][] = [['new', 'New lead'], ['mine', 'My leads'], ['followups', 'Follow-ups'], ['won', 'Won'], ['lost', 'Lost']];
const OPEN: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'SURVEY', 'QUOTE'];

export const MvpLeads: React.FC<{ user: User }> = ({ user }) => {
  const ctx = useServiceCtx(user);
  const [tab, setTab] = useState<Tab>('mine');
  const { data, error, loading, reload } = useLoader(() => listLeadsFor(ctx.repo, ctx.actor), [ctx]);
  const leads = data ?? [];
  const today = new Date(); today.setHours(23, 59, 59, 999);
  const followUps = leads.filter(l => !l.orderId && OPEN.includes(l.mvpStatus) && l.nextFollowup && new Date(l.nextFollowup) <= today);
  const counts: Record<Tab, number | null> = {
    new: null, mine: leads.filter(l => OPEN.includes(l.mvpStatus)).length, followups: followUps.length,
    won: leads.filter(l => l.mvpStatus === 'WON').length, lost: leads.filter(l => l.mvpStatus === 'LOST').length,
  };
  const shown = tab === 'mine' ? leads.filter(l => OPEN.includes(l.mvpStatus))
    : tab === 'followups' ? [...followUps].sort((a, b) => (a.nextFollowup! < b.nextFollowup! ? -1 : 1))
    : tab === 'won' ? leads.filter(l => l.mvpStatus === 'WON') : leads.filter(l => l.mvpStatus === 'LOST');
  return (
    <Screen title="Leads" subtitle="Capture fast, follow up, qualify into an order">
      <div role="tablist" className="flex gap-1 overflow-x-auto">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="min-h-[44px] px-3 rounded-xl text-sm whitespace-nowrap"
            style={{ background: tab === k ? C.goldTint : C.panel2, color: tab === k ? C.gold : C.muted, border: `1px solid ${tab === k ? C.gold : C.line}` }}>
            {label}{counts[k] !== null && data ? ` (${counts[k]})` : ''}
          </button>
        ))}
      </div>
      {tab === 'new' ? <NewLeadForm ctx={ctx} onDone={() => { reload(); setTab('mine'); }} /> : loading && !data ? <Loading /> : error ? <ErrorText error={error} /> : shown.length === 0 ? <Empty>No leads here.</Empty> : (
        <div className="space-y-2">{shown.map(l => <LeadCard key={l.id} ctx={ctx} lead={l} onDone={reload} />)}</div>
      )}
    </Screen>
  );
};

const NewLeadForm: React.FC<{ ctx: svc.ServiceCtx; onDone: () => void }> = ({ ctx, onDone }) => {
  const [f, setF] = useState({ name: '', phone: '', location: '', source: 'Walk-in', siteType: 'Residential', floors: 0, liftRequirement: 'Passenger lift', constructionStage: 'Structure complete', notes: '', consent: false });
  const [photos, setPhotos] = useState<Evidence[]>([]);
  const [follow, setFollow] = useState(toDateInput(new Date(Date.now() + 2 * 86400e3).toISOString()));
  const a = useAction(onDone);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: k === 'floors' ? Math.max(0, Number(e.target.value) || 0) : e.target.value });
  return (
    <Panel>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Customer name"><Input value={f.name} onChange={set('name')} autoComplete="name" /></Field>
        <Field label="Phone"><Input type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" /></Field>
        <Field label="Location / site address"><Input value={f.location} onChange={set('location')} /></Field>
        <Field label="Floors"><Input inputMode="numeric" value={f.floors || ''} onChange={set('floors')} /></Field>
        <Field label="Lift requirement"><Input value={f.liftRequirement} onChange={set('liftRequirement')} /></Field>
        <Field label="Construction stage">
          <Select value={f.constructionStage} onChange={set('constructionStage')}>
            {['Planning', 'Foundation', 'Structure in progress', 'Structure complete', 'Finishing', 'Occupied building'].map(x => <option key={x}>{x}</option>)}
          </Select>
        </Field>
        <Field label="Site type"><Select value={f.siteType} onChange={set('siteType')}>{['Residential', 'Commercial', 'Hospital', 'Industrial', 'Other'].map(x => <option key={x}>{x}</option>)}</Select></Field>
        <Field label="Source"><Select value={f.source} onChange={set('source')}>{['Walk-in', 'Referral', 'Site visit', 'Phone', 'Website', 'Other'].map(x => <option key={x}>{x}</option>)}</Select></Field>
        <Field label="Next follow-up"><Input type="date" value={follow} onChange={e => setFollow(e.target.value)} /></Field>
      </div>
      <Field label="Notes"><TextArea value={f.notes} onChange={set('notes')} /></Field>
      <EvidenceThumbs items={photos} />
      <PhotoInput ctx={ctx} orderKey={`lead_${ctx.actor.id}`} label="Site photo" onAdd={e => setPhotos([...photos, e])} />
      <label className="flex items-start gap-2 text-sm min-h-[44px]">
        <input type="checkbox" className="mt-1 w-5 h-5" checked={f.consent} onChange={e => setF({ ...f, consent: e.target.checked })} />
        <span>The customer agrees to be contacted about this enquiry (calls, SMS, WhatsApp). ⚖ VERIFY consent wording</span>
      </label>
      <ErrorText error={a.error} />
      <Btn busy={a.busy} disabled={!f.name.trim() || !f.phone.trim() || !f.consent} onClick={() => a.run(() => svc.createLead(ctx, { ...f, sitePhotos: photos, nextFollowup: follow ? fromDateInput(follow, 10) : undefined }), 'Lead saved')}>Save lead</Btn>
    </Panel>
  );
};

const LeadCard: React.FC<{ ctx: svc.ServiceCtx; lead: MvpLead; onDone: () => void }> = ({ ctx, lead, onDone }) => {
  const [mode, setMode] = useState<'none' | 'follow' | 'lost'>('none');
  const [note, setNote] = useState('');
  const [next, setNext] = useState(toDateInput(lead.nextFollowup));
  const a = useAction(() => { setMode('none'); setNote(''); onDone(); });
  return (
    <Panel>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="font-semibold">{lead.name} · <a href={`tel:${lead.phone}`} className="underline" style={{ color: C.gold }}>{lead.phone}</a></div>
          <div className="text-xs" style={{ color: C.muted }}>{lead.location} · {lead.floors} floors · {lead.liftRequirement} · {lead.constructionStage}</div>
          {lead.nextFollowup && <div className="text-xs" style={{ color: C.muted }}>Follow-up {formatIst(lead.nextFollowup)}</div>}
        </div>
        <Pill tone={lead.mvpStatus === 'LOST' ? 'red' : lead.mvpStatus === 'WON' ? 'gold' : 'green'}>{lead.mvpStatus}</Pill>
      </div>
      <EvidenceThumbs items={lead.sitePhotos} />
      {lead.notes && <p className="text-xs whitespace-pre-wrap" style={{ color: C.muted }}>{lead.notes}</p>}
      {lead.orderId ? (
        <Btn tone="ghost" onClick={() => openOrder(lead.orderId!)}>Open order</Btn>
      ) : lead.mvpStatus !== 'LOST' && (
        <div className="flex gap-2 flex-wrap">
          <Btn busy={a.busy} onClick={() => a.run(() => svc.qualifyLead(ctx, lead.id), 'Qualified — order created')}>Qualify → create order</Btn>
          <Btn tone="ghost" onClick={() => setMode('follow')}>Log follow-up</Btn>
          <Btn tone="ghost" onClick={() => setMode('lost')}>Mark lost</Btn>
        </div>
      )}
      {mode !== 'none' && (
        <div className="space-y-2">
          <Field label={mode === 'lost' ? 'Why was it lost?' : 'What happened?'}><Input value={note} onChange={e => setNote(e.target.value)} /></Field>
          {mode === 'follow' && <Field label="Next follow-up"><Input type="date" value={next} onChange={e => setNext(e.target.value)} /></Field>}
          <Btn busy={a.busy} disabled={!note.trim()} onClick={() => a.run(() => mode === 'lost'
            ? svc.markLeadLost(ctx, lead.id, note)
            : svc.logFollowUp(ctx, lead.id, note, next ? fromDateInput(next, 10) : undefined), 'Saved')}>Save</Btn>
        </div>
      )}
      <ErrorText error={a.error} />
    </Panel>
  );
};
