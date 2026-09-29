/**
 * MVP Sales leads-map and day-plan check (D-37): urgency by IST calendar day, the riding order
 * (nearest next, no crossings), Google Maps links split for phones, and placing a lead on the
 * map (owner or Admin only, audited). Demo repository only.
 * Run with: npx tsx scripts/mvp-leadsmap-check.ts
 */
import { check, done, Clock, demoCtx, FIXTURE_LEAD, USERS } from './mvp/fixtures';
import { createLead } from '../src/mvp/services/orderService';
import { setLeadLocation } from '../src/mvp/services/leadService';
import { directionsLinks, isOpenLead, locationOf, planVisits, urgencyOf } from '../src/mvp/visitPlan';
import { distanceM } from '../src/mvp/scouting';
import { getRepository } from '../src/repository';

const refuse = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

async function main() {
  // --- Urgency: calendar days in India, not 24-hour windows ---
  const now = new Date('2026-10-01T16:00:00Z'); // 21:30 IST on 1 Oct
  const u = (iso?: string) => urgencyOf({ nextFollowUp: iso }, now);
  check(u('2026-10-01T03:00:00Z') === 'TODAY' && u('2026-10-01T18:00:00Z') === 'TODAY', 'earlier and later today (IST) are both "today"');
  check(u('2026-10-01T19:00:00Z') === 'SOON', '00:30 IST on 2 Oct is tomorrow, not today (IST day boundary)');
  check(u('2026-09-30T18:00:00Z') === 'OVERDUE' && u('2026-10-08T06:00:00Z') === 'LATER' && u(undefined) === 'NONE' && u('garbage') === 'NONE',
    'yesterday is overdue; next week is later; missing or bad dates are "no follow-up date"');
  check(isOpenLead({ mvpStatus: 'QUOTE', stage: 'quoted' } as any) && !isOpenLead({ mvpStatus: 'WON', stage: 'closed_won' } as any) && !isOpenLead({ mvpStatus: 'LOST', stage: 'closed_lost' } as any),
    'won and lost leads are not planned');
  check(locationOf({ buildingInfo: { latitude: 0, longitude: 0 } } as any) === null && locationOf({ buildingInfo: {} } as any) === null &&
    locationOf({ buildingInfo: { latitude: 18.5, longitude: 73.8 } } as any)?.lat === 18.5, 'a lead is on the map only with a real location');

  // --- Riding order ---
  const home = { lat: 18.52, lng: 73.80 };
  const line = [0.05, 0.01, 0.04, 0.02, 0.03].map((d, i) => ({ id: `s${i}`, lat: 18.52 + d, lng: 73.80 }));
  const plan = planVisits(home, line);
  check(plan.order.map(s => s.id).join() === 's1,s3,s4,s2,s0', `stops along one road are visited in order, nearest first (${plan.order.map(s => s.id)})`);
  check(Math.abs(plan.km - 5.6) < 0.15 && plan.legsKm.length === 5, `total ≈ 5.5 km straight-line (${plan.km})`);
  // A zig-zag that nearest-next alone would cross: the clean-up pass never makes it longer.
  const zig = [{ id: 'a', lat: 18.53, lng: 73.80 }, { id: 'b', lat: 18.53, lng: 73.83 }, { id: 'c', lat: 18.55, lng: 73.80 }, { id: 'd', lat: 18.55, lng: 73.83 }];
  const pz = planVisits(home, zig);
  const naive = zig.reduce((s, p, i) => s + distanceM(i ? zig[i - 1] : home, p), 0) / 1000;
  check(pz.km <= naive + 0.05 && new Set(pz.order.map(s => s.id)).size === 4, `every stop exactly once, never longer than the listed order (${pz.km} ≤ ${naive.toFixed(1)} km)`);
  check(planVisits(null, line).order[0].id === 's0' && planVisits(home, []).order.length === 0, 'no GPS yet: starts from the first lead; no stops: empty plan');

  // --- Google Maps links ---
  const links = directionsLinks(home, plan.order);
  check(links.length === 2 && links[0].includes('origin=18.52000,73.80000') && decodeURIComponent(links[0]).split('waypoints=')[1].split('&')[0].split('|').length === 3,
    '5 stops → 2 links; the first starts at your location with 3 waypoints (phone limit)');
  const lastOfFirst = plan.order[3];
  check(links[1].includes(`origin=${lastOfFirst.lat.toFixed(5)},${lastOfFirst.lng.toFixed(5)}`) && !links[1].includes('waypoints'), 'the second link starts where the first ended');

  // --- Placing a lead on the map ---
  const clock = new Clock();
  const ctx = demoCtx(clock, USERS.admin);
  const lead = await createLead(ctx, USERS.sales, { ...FIXTURE_LEAD, phone: '9000000301' });
  const other = { userId: 'u_sales9', role: 'sales' as const, name: 'Other Sales' };
  check(await refuse(() => setLeadLocation(ctx, other, lead.id, home, 'gps')), 'another salesperson cannot move my lead');
  check(await refuse(() => setLeadLocation(ctx, USERS.tech1, lead.id, home, 'gps')), 'a technician cannot place leads');
  check(await refuse(() => setLeadLocation(ctx, USERS.sales, lead.id, { lat: 0, lng: 0 }, 'gps')), 'an empty (0,0) location is refused');
  const placed = await setLeadLocation(ctx, USERS.sales, lead.id, { lat: 18.5212345, lng: 73.8012345 }, 'address');
  check(placed.buildingInfo.latitude === 18.52123 && placed.buildingInfo.longitude === 73.80123 && placed.buildingInfo.address === lead.buildingInfo.address && placed.buildingInfo.floors === lead.buildingInfo.floors,
    'the owner places it (rounded to ~1 m); the rest of the building details are kept');
  const byAdmin = await setLeadLocation(ctx, USERS.admin, lead.id, home, 'gps');
  check(byAdmin.buildingInfo.latitude === home.lat, 'the Admin can correct it');
  const audit = (await getRepository<any>('audit_logs', ctx).list()).filter(a => a.action === 'LEAD_LOCATION_SET' && a.entityId === lead.id);
  check(audit.length === 2 && audit[1].before.latitude === 18.52123, 'each change is in the audit trail with the old position');

  done('mvp-leadsmap-check');
}

main().catch(err => { console.error(err); process.exit(1); });
