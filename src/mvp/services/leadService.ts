/**
 * Lead lists for Sales/Rider (spec §13, §23): My Leads, Follow-ups, Won, Lost, plus the
 * simple duplicate-phone warning. Creation and qualification live in orderService so the
 * D-08 tasks and the order are created in one place.
 */

import type { MvpActor, MvpCtx } from './orderService';
import { leadRepository, MvpError, normalizeIndianMobile, nowOf } from './orderService';
import { recordAuditEvent, newCorrelationId } from '../../lib/audit';
import { leadOwner, leadStatus, type MvpLead } from '../leadModel';

export type LeadTab = 'MINE' | 'FOLLOW_UPS' | 'WON' | 'LOST';

/** Leads this user may see (rules: Admin/Owner all; Sales their own). */
export async function listLeadsFor(ctx: MvpCtx, actor: MvpActor): Promise<MvpLead[]> {
  const repo = leadRepository(ctx);
  if (actor.role === 'admin' || actor.role === 'owner') return repo.list();
  if (actor.role === 'sales') return repo.query({ ownerUserId: actor.userId } as Partial<MvpLead>);
  return [];
}

export function filterLeads(leads: MvpLead[], tab: LeadTab): MvpLead[] {
  const by = (s: string[]) => leads.filter(l => s.includes(leadStatus(l)));
  switch (tab) {
    case 'MINE':
      return by(['NEW', 'CONTACTED', 'QUALIFIED', 'SURVEY', 'QUOTE']).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case 'FOLLOW_UPS':
      return by(['NEW', 'CONTACTED']).filter(l => !!l.nextFollowUp).sort((a, b) => (a.nextFollowUp! < b.nextFollowUp! ? -1 : 1));
    case 'WON':
      return by(['WON']);
    case 'LOST':
      return by(['LOST']);
  }
}

/** Same phone already in the leads this user can see (exact match; no fuzzy matching). */
export async function findDuplicateLeads(ctx: MvpCtx, actor: MvpActor, phone: string): Promise<MvpLead[]> {
  const normalized = normalizeIndianMobile(phone);
  if (!normalized) return [];
  const mine = await listLeadsFor(ctx, actor);
  return mine.filter(l => (l.phoneNormalized ?? normalizeIndianMobile(l.contactInfo?.phone ?? '')) === normalized);
}

export async function setFollowUp(ctx: MvpCtx, actor: MvpActor, leadId: string, nextFollowUp: string, note?: string): Promise<MvpLead> {
  const repo = leadRepository(ctx);
  const lead = await repo.get(leadId);
  if (!lead) throw new MvpError('not_found', `Lead ${leadId} not found.`);
  if (actor.role !== 'admin' && !(actor.role === 'sales' && leadOwner(lead) === actor.userId)) {
    throw new MvpError('forbidden', 'This is not your lead.');
  }
  if (Number.isNaN(new Date(nextFollowUp).getTime())) throw new MvpError('invalid', 'Choose a valid follow-up date.');
  const updated = await repo.update(leadId, {
    nextFollowUp, updatedAt: nowOf(ctx).toISOString(),
    ...(note ? { notes: [lead.notes, note].filter(Boolean).join('\n') } : {}),
  });
  await recordAuditEvent(ctx, {
    actorId: actor.userId, actorRole: actor.role, action: 'LEAD_FOLLOW_UP_SET', entityType: 'Lead', entityId: leadId,
    before: { nextFollowUp: lead.nextFollowUp }, after: { nextFollowUp }, reason: note, source: 'ui', correlationId: newCorrelationId(),
  });
  return updated;
}
