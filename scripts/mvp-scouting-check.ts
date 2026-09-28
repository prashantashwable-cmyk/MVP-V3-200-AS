/**
 * MVP field-scouting check (D-34): the rider's roadside sightings and Sales' inbox — capture,
 * photos, duplicates nearby, who may do what, and converting a sighting into a lead only with
 * consent and only by someone other than the rider. Demo repository only.
 * Run with: npx tsx scripts/mvp-scouting-check.ts
 */
import { check, done, Clock, demoCtx, USERS } from './mvp/fixtures';
import type { MvpActor } from '../src/mvp/services/orderService';
import { leadRepository } from '../src/mvp/services/orderService';
import {
  addSightingPhoto, convertSightingToLead, createSighting, findNearbySightings, listMySightings, listSightings,
  rejectSighting, updateSightingDetails,
} from '../src/mvp/services/scoutService';
import { distanceM, nearbySightings } from '../src/mvp/scouting';
import { getRepository } from '../src/repository';

const JPEG = `data:image/jpeg;base64,${'A'.repeat(4000)}`;
const photo = (kind: 'SITE' | 'SHAFT' | 'BOARD') => ({ kind, dataUrl: JPEG, contentType: 'image/jpeg', previewDataUrl: JPEG });
const rider: MvpActor = { userId: 'u_rider', role: 'sales', name: 'Rider Ravi' };
const sales2: MvpActor = { userId: 'u_sales2', role: 'sales', name: 'Sales Sunita' };
const BANER = { lat: 18.5590, lng: 73.7868 };
const refuse = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

async function main() {
  // Pure geometry.
  const d = distanceM(BANER, { lat: BANER.lat + 0.001, lng: BANER.lng });
  check(d > 105 && d < 117, `distance: 0.001° latitude ≈ 111 m (got ${Math.round(d)})`);
  const near = nearbySightings([{ lat: BANER.lat, lng: BANER.lng, createdAt: '2026-10-01T00:00:00Z', status: 'NEW' as const }], { lat: BANER.lat + 0.0002, lng: BANER.lng }, new Date('2026-10-02T00:00:00Z'), 60, 90);
  check(near.length === 1 && near[0].distanceM < 30, 'a sighting 22 m away counts as nearby');

  const clock = new Clock();
  const ctx = demoCtx(clock, USERS.admin);

  // Capture on the bike.
  check(await refuse(() => createSighting(ctx, USERS.tech1, { ...BANER, photo: photo('SITE') })), 'a technician cannot record sightings');
  check(await refuse(() => createSighting(ctx, rider, { lat: 0, lng: 0, photo: photo('SITE') })), 'no GPS fix: refused with a clear message');
  check(await refuse(() => createSighting(ctx, rider, { ...BANER, photo: { ...photo('SITE'), previewDataUrl: `data:image/jpeg;base64,${'A'.repeat(200_000)}` } })), 'an oversized preview is refused');
  const s1 = await createSighting(ctx, rider, { ...BANER, accuracyM: 12, address: 'Baner Road, Pune', photo: photo('SITE') });
  check(s1.status === 'NEW' && s1.scoutedBy === rider.userId && s1.photos.length === 1 && s1.address === 'Baner Road, Pune', 'first photo saves the sighting with GPS and the looked-up address');
  const docs = await getRepository<any>('documents', ctx).list();
  check(docs.some(x => x.id === s1.photos[0].docId && x.uploadedBy === rider.userId), 'the full photo is stored as a private document of the rider');
  const noAddr = await createSighting(ctx, rider, { lat: 18.6, lng: 73.8, photo: photo('SITE') });
  check(/^18\.60000, 73\.80000$/.test(noAddr.address), 'no address found (offline): the coordinates are kept instead');

  const s1b = await addSightingPhoto(ctx, rider, s1.id, photo('BOARD'));
  const s1c = await addSightingPhoto(ctx, rider, s1.id, photo('SHAFT'));
  check(s1b.photos.length === 2 && s1c.photos.length === 3, 'shaft and board photos are added to the same sighting');
  const s1d = await addSightingPhoto(ctx, rider, s1.id, photo('BOARD'));
  check(s1d.photos.length === 3, 'retaking a photo replaces it');
  check(await refuse(() => addSightingPhoto(ctx, sales2, s1.id, photo('SHAFT'))), 'another salesperson cannot add photos to the rider\'s sighting');
  check(await refuse(() => updateSightingDetails(ctx, rider, s1.id, { phone: '12345' })), 'an invalid number is refused');
  const withPhone = await updateSightingDetails(ctx, rider, s1.id, { phone: '+91 98220 11122', floors: 9 });
  check(withPhone.phone === '9822011122' && withPhone.floors === 9, 'the number from the board is saved in the standard 10-digit form');

  // Duplicates nearby.
  const dup = await findNearbySightings(ctx, { lat: BANER.lat + 0.0002, lng: BANER.lng + 0.0001 });
  check(dup.length === 1 && dup[0].id === s1.id, 'standing 25 m away, the earlier sighting is shown before saving');
  check((await findNearbySightings(ctx, { lat: BANER.lat + 0.003, lng: BANER.lng })).length === 0, '330 m away: no warning');

  // Lists and permissions.
  check((await listMySightings(ctx, rider)).length === 2, 'the rider sees their own sightings');
  check(await refuse(() => listSightings(ctx, USERS.tech1)), 'a technician cannot open the sightings inbox');
  const inbox = await listSightings(ctx, sales2);
  check(inbox.length === 2 && inbox.every(s => s.status === 'NEW'), 'Sales sees every new sighting at once (forwarded automatically)');

  // Converting: consent, and never by the rider themself.
  check(await refuse(() => convertSightingToLead(ctx, rider, s1.id, { name: 'Mr Patil', phone: '9822011122', consent: true })), 'the rider cannot confirm their own sighting (commission)');
  check(await refuse(() => convertSightingToLead(ctx, sales2, s1.id, { name: 'Mr Patil', phone: '9822011122', consent: false })), 'no consent from the builder: no lead');
  const lead = await convertSightingToLead(ctx, sales2, s1.id, { name: 'Mr Patil', phone: '', consent: true });
  const stored = await leadRepository(ctx).get(lead.id);
  check(!!stored && stored.scoutId === s1.id && stored.scoutedBy === rider.userId && stored.source === 'Field scouting', 'the lead remembers the sighting and the rider');
  check(stored!.phoneNormalized === '9822011122' && stored!.buildingInfo.latitude === BANER.lat && stored!.ownerUserId === sales2.userId, 'number, location and owner come across (the salesperson who called owns the lead)');
  check((stored!.photoIds ?? []).length === 3 && stored!.buildingInfo.floors === 9, 'the photos and floors come across');
  const after = (await listSightings(ctx, sales2)).find(s => s.id === s1.id)!;
  check(after.status === 'CONVERTED' && after.leadId === lead.id && after.reviewedBy === sales2.userId, 'the sighting shows it became a lead');
  check(await refuse(() => convertSightingToLead(ctx, sales2, s1.id, { name: 'X', phone: '9822011122', consent: true })), 'a sighting cannot become two leads');
  check(await refuse(() => addSightingPhoto(ctx, rider, s1.id, photo('SITE'))), 'once handled, the rider can no longer change it');

  // Not useful.
  check(await refuse(() => rejectSighting(ctx, sales2, noAddr.id, 'OTHER')), '"other" needs a note');
  const rej = await rejectSighting(ctx, USERS.admin, noAddr.id, 'ALREADY_HAS_LIFT');
  check(rej.status === 'REJECTED' && rej.rejectReason === 'ALREADY_HAS_LIFT', 'the Admin closes a sighting as not useful with a reason');
  check((await findNearbySightings(ctx, { lat: 18.6, lng: 73.8 })).length === 0, 'a rejected sighting does not block recording the site again later');

  // Audit trail.
  const audits = await getRepository<any>('audit_logs', ctx).list();
  const actions = new Set(audits.map((a: any) => a.action ?? a.eventType));
  check(['SCOUT_CREATED', 'SCOUT_CONVERTED', 'SCOUT_REJECTED'].every(a => actions.has(a)), 'capture, conversion and rejection are audited');

  done('mvp-scouting-check');
}

main().catch(err => { console.error(err); process.exit(1); });
