/**
 * D-34 field scouting: the rider's roadside sightings and Sales' inbox of them.
 * Canonical Firestore repository (`site_scouts`); full photos go through `saveEvidence`
 * (`documents`, private to the uploader and Admin/Owner) and a readable preview stays on the
 * sighting. Converting a sighting reuses `createLead` (consent required, D-04).
 * Why not reuse LeadForm/createLead directly for the rider: nobody at the site has consented
 * yet, so it cannot be a lead until Sales has spoken to them.
 */

import { getRepository } from '../../repository';
import { recordAuditEvent, newCorrelationId } from '../../lib/audit';
import type { MvpActor, MvpCtx } from './orderService';
import { createLead, leadRepository, MvpError, normalizeIndianMobile, nowOf } from './orderService';
import { saveEvidence } from './evidenceService';
import { dataUrlBytes } from './evidenceService';
import {
  nearbySightings, validLatLng, SCOUT_PHOTO_KINDS, SCOUT_REJECT_REASONS,
  type ScoutPhotoKind, type ScoutRejectReason, type SiteScout,
} from '../scouting';
import { MAX_SCOUT_PREVIEW_BYTES, SCOUT_DUPLICATE_DAYS, SCOUT_DUPLICATE_RADIUS_M } from '../config';
import type { MvpLead } from '../leadModel';

export const scoutRepository = (ctx: MvpCtx) => getRepository<SiteScout>('site_scouts', ctx);

export interface ScoutPhotoInput {
  kind: ScoutPhotoKind;
  dataUrl: string;
  contentType: string;
  previewDataUrl: string;
}

const isScoutRole = (a: MvpActor) => a.role === 'sales' || a.role === 'admin';
const canReview = (a: MvpActor) => a.role === 'sales' || a.role === 'admin';

async function audit(ctx: MvpCtx, actor: MvpActor, action: string, id: string, before: unknown, after: unknown, reason?: string) {
  await recordAuditEvent(ctx, {
    actorId: actor.userId, actorRole: actor.role, action, entityType: 'SiteScout', entityId: id,
    before: before as any, after: after as any, reason, source: 'ui', correlationId: newCorrelationId(),
  });
}

function checkPreview(p: ScoutPhotoInput): void {
  if (!SCOUT_PHOTO_KINDS.includes(p.kind)) throw new MvpError('invalid', 'Unknown photo type.');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(p.previewDataUrl) || dataUrlBytes(p.previewDataUrl) > MAX_SCOUT_PREVIEW_BYTES) {
    throw new MvpError('invalid', 'The photo preview could not be made small enough. Please try again.');
  }
}

async function storePhoto(ctx: MvpCtx, actor: MvpActor, scoutId: string, p: ScoutPhotoInput) {
  checkPreview(p);
  const doc = await saveEvidence(ctx, actor, {
    dataUrl: p.dataUrl, contentType: p.contentType, caption: `Site sighting: ${p.kind.toLowerCase()}`,
    ownerEntityType: 'SiteScout', ownerEntityId: scoutId,
  });
  return { kind: p.kind, docId: doc.id as string, previewDataUrl: p.previewDataUrl };
}

/** Sightings already recorded near this spot (any rider), newest-first by distance. */
export async function findNearbySightings(ctx: MvpCtx, at: { lat: number; lng: number }): Promise<(SiteScout & { distanceM: number })[]> {
  return nearbySightings(await scoutRepository(ctx).list(), at, nowOf(ctx), SCOUT_DUPLICATE_RADIUS_M, SCOUT_DUPLICATE_DAYS);
}

/** The rider's first photo creates the sighting (GPS + looked-up address). One tap on the bike. */
export async function createSighting(
  ctx: MvpCtx, actor: MvpActor,
  input: { lat: number; lng: number; accuracyM?: number; address?: string; photo: ScoutPhotoInput },
): Promise<SiteScout> {
  if (!isScoutRole(actor)) throw new MvpError('forbidden', 'Only riders (Sales) can record site sightings.');
  if (!validLatLng(input.lat, input.lng)) throw new MvpError('invalid', 'No GPS location yet. Wait for the location, then take the photo.');
  checkPreview(input.photo);
  const now = nowOf(ctx);
  const id = `scout_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const photo = await storePhoto(ctx, actor, id, input.photo);
  const scout: SiteScout = {
    id, scoutedBy: actor.userId, scoutedByName: actor.name,
    lat: input.lat, lng: input.lng, accuracyM: input.accuracyM,
    address: (input.address ?? '').trim() || `${input.lat.toFixed(5)}, ${input.lng.toFixed(5)}`,
    photos: [photo], status: 'NEW', createdAt: now.toISOString(), updatedAt: now.toISOString(), version: 0,
  };
  const saved = await scoutRepository(ctx).create(JSON.parse(JSON.stringify(scout)));
  await audit(ctx, actor, 'SCOUT_CREATED', id, undefined, { lat: scout.lat, lng: scout.lng, address: scout.address });
  return saved;
}

async function loadOwnNew(ctx: MvpCtx, actor: MvpActor, scoutId: string): Promise<SiteScout> {
  const s = await scoutRepository(ctx).get(scoutId);
  if (!s) throw new MvpError('not_found', 'Sighting not found.');
  if (actor.role !== 'admin' && s.scoutedBy !== actor.userId) throw new MvpError('forbidden', 'This sighting was recorded by someone else.');
  if (s.status !== 'NEW') throw new MvpError('invalid', 'Sales has already handled this sighting.');
  return s;
}

/** Adds the lift-shaft or board photo to the rider's sighting (replaces an earlier one of the same kind). */
export async function addSightingPhoto(ctx: MvpCtx, actor: MvpActor, scoutId: string, photo: ScoutPhotoInput): Promise<SiteScout> {
  const s = await loadOwnNew(ctx, actor, scoutId);
  const p = await storePhoto(ctx, actor, scoutId, photo);
  const photos = [...s.photos.filter(x => x.kind !== p.kind), p];
  return scoutRepository(ctx).update(scoutId, { photos, updatedAt: nowOf(ctx).toISOString() }, s.version);
}

/** The optional details the rider may add (the number from the board, a note, a floor count). */
export async function updateSightingDetails(
  ctx: MvpCtx, actor: MvpActor, scoutId: string, input: { phone?: string; notes?: string; floors?: number; address?: string },
): Promise<SiteScout> {
  const s = await loadOwnNew(ctx, actor, scoutId);
  const patch: Partial<SiteScout> = { updatedAt: nowOf(ctx).toISOString() };
  if (input.phone !== undefined) {
    const phone = input.phone.trim() === '' ? '' : normalizeIndianMobile(input.phone);
    if (phone === null) throw new MvpError('invalid', 'Enter a valid 10-digit Indian mobile number, or leave it empty.');
    patch.phone = phone;
  }
  if (input.notes !== undefined) patch.notes = input.notes.trim();
  if (input.address !== undefined && input.address.trim()) patch.address = input.address.trim();
  if (input.floors !== undefined) {
    if (!Number.isFinite(input.floors) || input.floors < 1 || input.floors > 200) throw new MvpError('invalid', 'Floors must be between 1 and 200.');
    patch.floors = input.floors;
  }
  return scoutRepository(ctx).update(scoutId, patch, s.version);
}

export async function listMySightings(ctx: MvpCtx, actor: MvpActor): Promise<SiteScout[]> {
  const list = await scoutRepository(ctx).query({ scoutedBy: actor.userId } as Partial<SiteScout>);
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Sales' inbox: every sighting (all riders), new first. */
export async function listSightings(ctx: MvpCtx, actor: MvpActor): Promise<SiteScout[]> {
  if (!['sales', 'admin', 'owner'].includes(actor.role)) throw new MvpError('forbidden', 'Only Sales, Admin and Owner see site sightings.');
  const order = { NEW: 0, CONVERTED: 1, REJECTED: 2 } as const;
  return (await scoutRepository(ctx).list()).sort((a, b) => order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt));
}

export async function getSighting(ctx: MvpCtx, scoutId: string): Promise<SiteScout | null> {
  return scoutRepository(ctx).get(scoutId);
}

async function loadForReview(ctx: MvpCtx, actor: MvpActor, scoutId: string): Promise<SiteScout> {
  if (!canReview(actor)) throw new MvpError('forbidden', 'Only Sales or the Admin can handle sightings.');
  const s = await scoutRepository(ctx).get(scoutId);
  if (!s) throw new MvpError('not_found', 'Sighting not found.');
  if (s.status !== 'NEW') throw new MvpError('invalid', 'This sighting was already handled.');
  // Commission is earned on sightings Sales confirms, so a rider never confirms their own.
  if (actor.role !== 'admin' && s.scoutedBy === actor.userId) {
    throw new MvpError('forbidden', 'Another salesperson (or the Admin) must call and confirm your own sighting.');
  }
  return s;
}

/**
 * Sales spoke to the site and they agreed to be contacted: the sighting becomes a lead owned
 * by this salesperson, with the rider's location, address and photos, and the rider credited.
 */
export async function convertSightingToLead(
  ctx: MvpCtx, actor: MvpActor, scoutId: string,
  input: { name: string; phone: string; consent: boolean; floors?: number; liftRequirement?: string; notes?: string },
): Promise<MvpLead> {
  const s = await loadForReview(ctx, actor, scoutId);
  const lead = await createLead(ctx, actor, {
    name: input.name, phone: input.phone || s.phone || '', location: s.address, source: 'Field scouting',
    floors: input.floors ?? s.floors, liftRequirement: input.liftRequirement, notes: [s.notes, input.notes].filter(Boolean).join('\n') || undefined,
    consent: input.consent, latitude: s.lat, longitude: s.lng, photoIds: s.photos.map(p => p.docId), constructionStage: 'structure-up',
  });
  await leadRepository(ctx).update(lead.id, { scoutId: s.id, scoutedBy: s.scoutedBy } as Partial<MvpLead>);
  const now = nowOf(ctx).toISOString();
  await scoutRepository(ctx).update(scoutId, { status: 'CONVERTED', leadId: lead.id, reviewedBy: actor.userId, reviewedAt: now, updatedAt: now }, s.version);
  await audit(ctx, actor, 'SCOUT_CONVERTED', scoutId, { status: 'NEW' }, { status: 'CONVERTED', leadId: lead.id });
  return { ...lead, scoutId: s.id, scoutedBy: s.scoutedBy };
}

/** Not a real opportunity: closed with a reason (no commission). */
export async function rejectSighting(ctx: MvpCtx, actor: MvpActor, scoutId: string, reason: ScoutRejectReason, note?: string): Promise<SiteScout> {
  if (!SCOUT_REJECT_REASONS.includes(reason)) throw new MvpError('invalid', 'Choose a reason.');
  if (reason === 'OTHER' && !note?.trim()) throw new MvpError('invalid', 'Write why this sighting is not useful.');
  const s = await loadForReview(ctx, actor, scoutId);
  const now = nowOf(ctx).toISOString();
  const updated = await scoutRepository(ctx).update(scoutId, {
    status: 'REJECTED', rejectReason: reason, ...(note?.trim() ? { rejectNote: note.trim() } : {}),
    reviewedBy: actor.userId, reviewedAt: now, updatedAt: now,
  }, s.version);
  await audit(ctx, actor, 'SCOUT_REJECTED', scoutId, { status: 'NEW' }, { status: 'REJECTED', reason }, note);
  return updated;
}
