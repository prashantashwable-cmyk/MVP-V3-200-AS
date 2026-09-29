/**
 * Lead lists for Sales/Rider (spec §13, §23): My Leads, Follow-ups, Won, Lost, plus the
 * simple duplicate-phone warning. Creation and qualification live in orderService so the
 * D-08 tasks and the order are created in one place.
 */

import type { MvpActor, MvpCtx } from './orderService';
import { leadRepository, MvpError, normalizeIndianMobile, nowOf } from './orderService';
import { recordAuditEvent, newCorrelationId } from '../../lib/audit';
import { leadOwner, leadStatus, type MvpLead } from '../leadModel';
import { validLatLng } from '../scouting';

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

/**
 * D-37: puts a lead on the map (the address looked up, or the salesperson's own GPS at the
 * site). Owner of the lead or the Admin; only the building's latitude/longitude change.
 */
export async function setLeadLocation(ctx: MvpCtx, actor: MvpActor, leadId: string, at: { lat: number; lng: number }, how: 'address' | 'gps'): Promise<MvpLead> {
  const repo = leadRepository(ctx);
  const lead = await repo.get(leadId);
  if (!lead) throw new MvpError('not_found', `Lead ${leadId} not found.`);
  if (actor.role !== 'admin' && !(actor.role === 'sales' && leadOwner(lead) === actor.userId)) {
    throw new MvpError('forbidden', 'This is not your lead.');
  }
  if (!validLatLng(at.lat, at.lng)) throw new MvpError('invalid', 'That location is not valid.');
  const lat = Math.round(at.lat * 1e5) / 1e5;
  const lng = Math.round(at.lng * 1e5) / 1e5;
  // Versioned: buildingInfo is written as a whole, so a save that raced another edit of the
  // same lead fails ("changed by someone else") instead of silently undoing it.
  const updated = await repo.update(leadId, {
    buildingInfo: { ...lead.buildingInfo, latitude: lat, longitude: lng }, updatedAt: nowOf(ctx).toISOString(),
  } as Partial<MvpLead>, lead.version ?? 0);
  await recordAuditEvent(ctx, {
    actorId: actor.userId, actorRole: actor.role, action: 'LEAD_LOCATION_SET', entityType: 'Lead', entityId: leadId,
    before: { latitude: lead.buildingInfo?.latitude, longitude: lead.buildingInfo?.longitude } as any, after: { latitude: lat, longitude: lng } as any,
    reason: how === 'gps' ? 'Set from GPS at the site' : 'Found from the address', source: 'ui', correlationId: newCorrelationId(),
  });
  return updated;
}
