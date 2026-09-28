/**
 * D-34 field scouting (rider on a bike finds construction sites whose lift shaft is ready).
 * Pure types and geometry; `now` is always injected. No AI, no image recognition.
 *
 * A **sighting** (`site_scouts`) is what the rider records at the roadside: GPS, the address
 * the app looks up, up to three photos (site, lift shaft, builder's board with the number) and
 * an optional phone number. It is not yet a lead: nobody at the site has agreed to be
 * contacted. Sales sees every new sighting at once, calls, and — with consent — converts it
 * into a lead (`createLead`), or marks it "not useful" with a reason.
 */

export type ScoutPhotoKind = 'SITE' | 'SHAFT' | 'BOARD';
export const SCOUT_PHOTO_KINDS: ScoutPhotoKind[] = ['SITE', 'SHAFT', 'BOARD'];

export type ScoutStatus = 'NEW' | 'CONVERTED' | 'REJECTED';

export type ScoutRejectReason = 'NO_LIFT_NEEDED' | 'ALREADY_HAS_LIFT' | 'WRONG_NUMBER' | 'DUPLICATE' | 'NOT_READY_YET' | 'OTHER';
export const SCOUT_REJECT_REASONS: ScoutRejectReason[] = ['NO_LIFT_NEEDED', 'ALREADY_HAS_LIFT', 'WRONG_NUMBER', 'DUPLICATE', 'NOT_READY_YET', 'OTHER'];

export interface ScoutPhoto {
  kind: ScoutPhotoKind;
  /** The full photo, in `documents` (readable by its uploader and Admin/Owner). */
  docId: string;
  /** A readable preview (≤ ~90 KB) kept on the sighting so Sales can read the board number. */
  previewDataUrl: string;
}

export interface SiteScout {
  id: string;
  scoutedBy: string;
  scoutedByName: string;
  lat: number;
  lng: number;
  accuracyM?: number;
  address: string;
  phone?: string;
  notes?: string;
  floors?: number;
  photos: ScoutPhoto[];
  status: ScoutStatus;
  leadId?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectReason?: ScoutRejectReason;
  rejectNote?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

const EARTH_M = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function validLatLng(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

/** Sightings recorded near this spot recently — shown before saving, so a site isn't counted twice. */
export function nearbySightings<T extends Pick<SiteScout, 'lat' | 'lng' | 'createdAt' | 'status'>>(
  list: T[], at: { lat: number; lng: number }, now: Date, radiusM: number, withinDays: number,
): (T & { distanceM: number })[] {
  const since = now.getTime() - withinDays * 86_400_000;
  return list
    .filter(s => s.status !== 'REJECTED' && new Date(s.createdAt).getTime() >= since)
    .map(s => ({ ...s, distanceM: Math.round(distanceM(s, at)) }))
    .filter(s => s.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM);
}
