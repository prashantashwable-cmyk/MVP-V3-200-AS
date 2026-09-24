/** Sales: My Leads / Follow-ups / Won / Lost (spec §23). Why not reuse LeadKanban/LeadFollowUpScheduler: legacy local data, 1,100–1,650 lines each. */

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import type { User } from '../../types';
import { Button, Card } from '../../components/Common';
import { filterLeads, listLeadsFor, type LeadTab } from '../services/leadService';
import { leadStatus } from '../leadModel';
import { formatDateTime } from '../format';
import { ErrorNote, Loading, useLoad, useMvpCtx } from './ui';

const TABS: { id: LeadTab; label: string }[] = [
  { id: 'MINE', label: 'My leads' }, { id: 'FOLLOW_UPS', label: 'Follow-ups' }, { id: 'WON', label: 'Won' }, { id: 'LOST', label: 'Lost' },
];

export const LeadsList: React.FC<{ user: User; onOpenLead: (id: string) => void; onNewLead: () => void }> = ({ user, onOpenLead, onNewLead }) => {
  const { ctx, actor } = useMvpCtx(user);
  const [tab, setTab] = useState<LeadTab>('MINE');
  const { data, error, loading } = useLoad(() => listLeadsFor(ctx, actor), [ctx]);
  if (loading && !data) return <Loading label="Loading leads…" />;
  if (error) return <ErrorNote message={`Could not load leads: ${error}`} />;
  const leads = filterLeads(data ?? [], tab);
  const now = Date.now();
  return (
    <div className="space-y-3 max-w-3xl mx-auto pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-charcoal">Leads</h2>
        {(user.role === 'sales' || user.role === 'admin') && <Button variant="primary" onClick={onNewLead}><Plus className="w-4 h-4" />New lead</Button>}
      </div>
      <div className="flex gap-1 bg-alabaster p-1 rounded-xl">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold cursor-pointer ${tab === t.id ? 'bg-white shadow-xs text-[#8a6224]' : 'text-warmgray'}`}>{t.label}</button>
        ))}
      </div>
      {leads.length === 0 && <Card className="p-6 text-sm text-warmgray">Nothing here yet.</Card>}
      {leads.map(l => {
        const late = l.nextFollowUp && new Date(l.nextFollowUp).getTime() < now;
        return (
          <button key={l.id} onClick={() => onOpenLead(l.id)} className="w-full text-left cursor-pointer">
            <Card className="p-4" hoverEffect>
              <div className="flex justify-between gap-2">
                <span className="font-bold text-sm">{l.contactInfo.name}</span>
                <span className="text-[11px] font-bold text-warmgray">{leadStatus(l)}</span>
              </div>
              <div className="text-xs text-warmgray">{l.buildingInfo.address} · {l.contactInfo.phone}</div>
              {tab === 'FOLLOW_UPS' && l.nextFollowUp && <div className={`text-xs mt-1 ${late ? 'text-error font-bold' : 'text-warmgray'}`}>Follow up {formatDateTime(l.nextFollowUp)}</div>}
              {tab === 'LOST' && l.lostReasonText && <div className="text-xs mt-1 text-warmgray">Reason: {l.lostReasonText}</div>}
            </Card>
          </button>
        );
      })}
    </div>
  );
};
