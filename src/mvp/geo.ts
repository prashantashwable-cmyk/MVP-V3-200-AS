/**
 * D-34 browser location helpers for field scouting: the phone's GPS and a street address for
 * it. The address comes from this app's own server (`/api/maps/geocode`, Google with an
 * OpenStreetMap fallback) when the app is served by it, else straight from OpenStreetMap's
 * Nominatim (light use only: one lookup per sighting). Never blocks saving: without an address
 * the sighting keeps its coordinates.
 */

export interface Fix { lat: number; lng: number; accuracyM: number; at: number }

/** Keeps the latest GPS fix while the screen is open. Returns a stop function. */
export function watchFix(onFix: (f: Fix) => void, onError: (message: string) => void): () => void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onError('This phone cannot share its location.');
    return () => undefined;
  }
  const id = navigator.geolocation.watchPosition(
    p => onFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy), at: p.timestamp }),
    e => onError(e.code === 1 ? 'Location is blocked. Allow location for this app in the phone settings.' : 'Finding your location… (go outside for a better signal)'),
    { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

async function fetchJson(url: string, ms: number): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

const cache = new Map<string, string>();

/** A readable address for the spot, or '' when none could be found (the caller keeps lat/lng). */
export async function lookupAddress(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (cache.has(key)) return cache.get(key)!;
  let address = '';
  try {
    const own = await fetchJson(`/api/maps/geocode?lat=${lat}&lng=${lng}`, 6000);
    if (typeof own?.address === 'string' && !own.address.startsWith('Lat:')) address = own.address;
  } catch { /* not served by our own server (e.g. the phone preview link) */ }
  if (!address) {
    try {
      const osm = await fetchJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lng}`, 8000);
      if (typeof osm?.display_name === 'string') address = osm.display_name;
    } catch { /* offline: keep the coordinates */ }
  }
  if (address) cache.set(key, address);
  return address;
}

/**
 * D-36: a place for an address (planned-project import). OpenStreetMap's Nominatim search,
 * limited to India; the caller waits ~1.1 s between lookups (Nominatim's fair-use limit).
 * Returns null when nothing is found — the Admin fixes the address or adds latitude/longitude.
 */
export async function findPlace(query: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const list = await fetchJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=in&limit=1&q=${encodeURIComponent(q)}`, 10_000);
    const hit = Array.isArray(list) ? list[0] : null;
    const lat = Number(hit?.lat);
    const lng = Number(hit?.lon);
    return hit && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, label: String(hit.display_name ?? q) } : null;
  } catch {
    return null;
  }
}

/** Google Maps directions to the spot (opens the Maps app on the phone). */
export function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
