/**
 * Lead detail for Sales/Admin: contacted, follow-up date, qualify (creates the Order, D-04),
 * or lost with a reason. Why not reuse LeadDetail.tsx: legacy DbManager deals/scoring (1,211 lines).
 */

import React, { useState } from 'react';
import type { User } from '../../types';
import { Button, Card } from '../../components/Common';
import { leadRepository, qualifyLead, updateLeadStatus } from '../services/orderService';
import { setFollowUp } from '../services/leadService';
import { getEvidence } from '../services/evidenceService';
import { leadStatus } from '../leadModel';
import { formatDateTime } from '../format';
import { ErrorNote, inputCls, labelCls, Loading, SectionTitle, useAction, useLoad, useMvpCtx } from './ui';

export const LeadDetailScreen: React.FC<{ user: User; leadId: string; onOpenOrder: (id: string) => void; onBack: () => void }> = ({ user, leadId, onOpenOrder, onBack }) => {
  const { ctx, actor } = useMvpCtx(user);
  const { run, busy, error } = useAction();
  const { data: lead, error: loadError, loading, reload } = useLoad(() => leadRepository(ctx).get(leadId), [ctx, leadId]);
  const photos = useLoad(() => (lead?.photoIds?.length ? getEvidence(ctx, lead.photoIds) : Promise.resolve([])), [lead?.id]);
  const [lostReason, setLostReason] = useState('');
  const [follow, setFollow] = useState('');
  const [lift, setLift] = useState('');
  if (loading && !lead) return <Loading label="Loading lead…" />;
  if (loadError) return <ErrorNote message={loadError} />;
  if (!lead) return <Card className="p-6 text-sm text-warmgray">Lead not found.</Card>;
  const status = leadStatus(lead);
  const open = status === 'NEW' || status === 'CONTACTED';
  const act = (fn: () => Promise<unknown>) => run(fn).then(ok => ok && reload());

  return (
    <div className="space-y-3 max-w-xl mx-auto pb-24">
      <button onClick={onBack} className="text-xs font-semibold text-warmgray cursor-pointer">← Back</button>
      {error && <ErrorNote message={error} />}
      <Card className="p-4 space-y-2">
        <div className="flex justify-between"><h2 className="text-lg font-bold">{lead.contactInfo.name}</h2><span className="text-xs font-bold text-warmgray">{status}</span></div>
        <a className="text-sm text-royalemerald font-semibold" href={`tel:${lead.contactInfo.phone}`}>{lead.contactInfo.phone}</a>
        <div className="text-sm">{lead.buildingInfo.address}</div>
        <div className="text-xs text-warmgray">{lead.buildingInfo.type} · {lead.buildingInfo.floors || '?'} floors · {lead.buildingInfo.construction_stage ?? ''} · source {lead.source ?? '—'}</div>
        {lead.liftRequirement && <div className="text-sm">Lift: {lead.liftRequirement}</div>}
        {lead.notes && <div className="text-xs whitespace-pre-line text-warmgray">{lead.notes}</div>}
        {lead.nextFollowUp && <div className="text-xs">Next follow-up: <strong>{formatDateTime(lead.nextFollowUp)}</strong></div>}
        {lead.lostReasonText && <div className="text-xs text-error">Lost: {lead.lostReasonText}</div>}
        {(photos.data ?? []).length > 0 && (
          <div className="flex gap-2 flex-wrap">{photos.data!.map(p => p.dataUrl && <img key={p.id} src={p.dataUrl} alt="site" className="w-20 h-20 object-cover rounded-lg" />)}</div>
        )}
      </Card>

      {lead.projectId && <Button variant="primary" fullWidth onClick={() => onOpenOrder(lead.projectId!)}>Open order</Button>}

      {open && (
        <>
          <Card className="p-4 space-y-2">
            <SectionTitle>Qualify</SectionTitle>
            <p className="text-xs text-warmgray">Qualifying creates the order (AE-####) and asks the Admin to assign a surveyor.</p>
            <label className={labelCls}>Lift summary</label>
            <input className={inputCls} value={lift} onChange={e => setLift(e.target.value)} placeholder={lead.liftRequirement ?? 'e.g. G+7 passenger lift'} />
            <Button variant="emerald" fullWidth disabled={busy} onClick={() => run(async () => {
              const order = await qualifyLead(ctx, actor, lead.id, { liftSummary: lift || lead.liftRequirement });
              onOpenOrder(order.id);
            })}>Mark qualified</Button>
          </Card>
          <Card className="p-4 space-y-2">
            <SectionTitle>Follow-up</SectionTitle>
            {status === 'NEW' && <Button variant="secondary" disabled={busy} onClick={() => act(() => updateLeadStatus(ctx, actor, lead.id, 'CONTACTED'))}>Mark contacted</Button>}
            <input type="datetime-local" className={inputCls} value={follow} onChange={e => setFollow(e.target.value)} />
            <Button variant="secondary" disabled={busy || !follow} onClick={() => act(() => setFollowUp(ctx, actor, lead.id, new Date(follow).toISOString()))}>Set follow-up</Button>
          </Card>
          <Card className="p-4 space-y-2">
            <SectionTitle>Lost</SectionTitle>
            <input className={inputCls} value={lostReason} onChange={e => setLostReason(e.target.value)} placeholder="Reason (price, timeline, competitor…)" />
            <Button variant="danger" disabled={busy || !lostReason.trim()} onClick={() => act(() => updateLeadStatus(ctx, actor, lead.id, 'LOST', lostReason))}>Mark lost</Button>
          </Card>
        </>
      )}
    </div>
  );
};
