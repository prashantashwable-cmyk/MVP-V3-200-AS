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
import { cellBounds, cellKey, cellsOf, distanceM, earningsFor, leaderboard, monthOf, nearbySightings, routeKm, weekOf, whereNext } from '../src/mvp/scouting';
import { buildRiderBoard, getMyRouteToday, riderCommissionTable, saveRoutePoints, startDuty } from '../src/mvp/services/riderService';
import { runS1 } from './mvp/scenario';
import { evidenceOf, heatAt, heatColor, heatGrid, hotspots, revisits, whyHere } from '../src/mvp/heat';
import { HEAT_SETTINGS } from '../src/mvp/services/riderService';
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

  await part2();
  part3();
  done('mvp-scouting-check');
}

async function part2() {
  // --- Pure: route km, squares, where next, earnings, leaderboard ---
  const line = Array.from({ length: 11 }, (_, i) => ({ lat: BANER.lat + i * 0.001, lng: BANER.lng }));
  check(Math.abs(routeKm(line) - 1.1) <= 0.1, `route of 10 × 111 m ≈ 1.1 km (got ${routeKm(line)})`);
  check(routeKm([BANER, { lat: BANER.lat + 0.00003, lng: BANER.lng }, { lat: BANER.lat + 0.00006, lng: BANER.lng }]) === 0, 'standing still (GPS jitter under 15 m) adds no km');
  check(routeKm([BANER, { lat: BANER.lat + 0.05, lng: BANER.lng }]) === 0, 'a 5.5 km jump between two fixes (GPS glitch) is ignored');
  const b = cellBounds(cellKey(BANER.lat, BANER.lng, 500), 500);
  const mid = { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 };
  check(cellKey(mid.lat, mid.lng, 500) === cellKey(mid.lat + 0.0005, mid.lng + 0.0005, 500) && cellKey(mid.lat, mid.lng, 500) !== cellKey(mid.lat + 0.005, mid.lng, 500),
    'two spots 70 m apart share a 500 m square; 550 m apart do not');
  const lineCells = cellsOf(line, 500).length;
  check(lineCells === 3 || lineCells === 4, `a 1.1 km straight ride crosses 3–4 squares depending on where it starts (got ${lineCells})`);
  const now = new Date('2026-10-15T06:00:00Z');
  const site = (lat: number, lng: number, status: 'NEW' | 'CONVERTED' | 'REJECTED' = 'NEW') => ({ lat, lng, status, createdAt: '2026-10-10T06:00:00Z' });
  const wn = whereNext([site(BANER.lat, BANER.lng, 'CONVERTED')], [], now, 500, 30);
  check(wn.length === 5 && wn.every(w => w.key !== cellKey(BANER.lat, BANER.lng, 500)), 'where next: the squares around a found site (not the site\'s own square)');
  const around = whereNext([site(BANER.lat, BANER.lng)], [], now, 500, 30, 20).map(w => w.key);
  const coveredRecently = around[0];
  const wn2 = whereNext([site(BANER.lat, BANER.lng)], [{ day: '2026-10-12', cells: [coveredRecently] }], now, 500, 30, 20).map(w => w.key);
  check(around.length === 8 && !wn2.includes(coveredRecently), 'a square someone covered 3 days ago is not suggested');
  const wn3 = whereNext([site(BANER.lat, BANER.lng)], [{ day: '2026-08-01', cells: [coveredRecently] }], now, 500, 30, 20).map(w => w.key);
  check(wn3.includes(coveredRecently), 'covered 2.5 months ago: suggested again');
  check(whereNext([site(BANER.lat, BANER.lng, 'REJECTED')], [], now, 500, 30).length === 0, 'a rejected (not useful) site suggests nothing');
  const [ci, cj] = cellKey(mid.lat, mid.lng, 500).split(':').map(Number);
  const b2 = cellBounds(`${ci + 2}:${cj}`, 500);
  const two = whereNext([site(mid.lat, mid.lng, 'CONVERTED'), site((b2.south + b2.north) / 2, mid.lng)], [], now, 500, 30, 1);
  check(two[0].nearbySites === 2, 'the best square is the one between two found sites');
  const { from, to } = monthOf(now);
  check(from.toISOString() === '2026-09-30T18:30:00.000Z' && to.toISOString() === '2026-10-31T18:30:00.000Z', 'month = 1st 00:00 IST to next 1st');
  check(weekOf(new Date('2026-10-15T06:00:00Z')).from.toISOString() === '2026-10-11T18:30:00.000Z', 'week starts Monday 00:00 IST');
  const e = earningsFor([
    { status: 'CONVERTED', reviewedAt: '2026-10-05T10:00:00Z', bookedAt: '2026-10-09T10:00:00Z', createdAt: '2026-10-04T10:00:00Z' },
    { status: 'CONVERTED', reviewedAt: '2026-10-06T10:00:00Z', createdAt: '2026-10-06T09:00:00Z' },
    { status: 'CONVERTED', reviewedAt: '2026-09-20T10:00:00Z', bookedAt: '2026-10-02T10:00:00Z', createdAt: '2026-09-19T10:00:00Z' },
    { status: 'NEW', createdAt: '2026-10-07T10:00:00Z' }, { status: 'REJECTED', reviewedAt: '2026-10-07T12:00:00Z', createdAt: '2026-10-07T10:00:00Z' },
  ] as any, from, to, 50, 1000);
  check(e.confirmed === 2 && e.booked === 2 && e.pending === 1 && e.amount === 2100, `October: 2 confirmed × ₹50 + 2 booked × ₹1000 (one confirmed in September, booked in October) = ₹2,100 (got ${JSON.stringify(e)})`);
  const lb = leaderboard(
    [{ scoutedBy: 'a', scoutedByName: 'Anil', status: 'NEW', createdAt: '2026-10-13T05:00:00Z' }, { scoutedBy: 'a', scoutedByName: 'Anil', status: 'NEW', createdAt: '2026-10-13T06:00:00Z' },
     { scoutedBy: 'b', scoutedByName: 'Bala', status: 'CONVERTED', reviewedAt: '2026-10-14T05:00:00Z', createdAt: '2026-10-13T05:00:00Z' },
     { scoutedBy: 'c', scoutedByName: 'Chetan', status: 'NEW', createdAt: '2026-10-01T05:00:00Z' }] as any,
    [{ riderId: 'a', riderName: 'Anil', day: '2026-10-13', km: 12.5, cells: ['1:1', '1:2'] }, { riderId: 'd', riderName: 'Dev', day: '2026-10-14', km: 30, cells: ['5:5', '5:6', '5:7'] }],
    weekOf(now).from, weekOf(now).to,
  );
  check(lb.map(r => r.name).join() === 'Bala,Anil,Dev' && lb[1].km === 12.5 && lb[2].cells === 3, `leaderboard: confirmed first, then sites, then area; last week excluded (got ${lb.map(r => r.name).join()})`);

  // --- Service: on duty, route, stats, board, commission, booking bonus ---
  const clock = new Clock();
  clock.advanceDays(33); // a later week and month than part 1 (the demo repository is shared)
  const ctx = demoCtx(clock, USERS.admin);
  const rider: MvpActor = { userId: 'u_rider2', role: 'sales', name: 'Rider Rekha' };
  check(await refuse(() => startDuty(ctx, USERS.tech1)), 'a technician cannot go on duty as a rider');
  const r0 = await startDuty(ctx, rider);
  check(r0.onDuty && r0.points.length === 0 && r0.riderId === rider.userId, 'Start day opens today\'s route');
  check((await startDuty(ctx, rider)).id === r0.id, 'tapping Start day again keeps the same route');
  const t = (m: number) => new Date(clock.now().getTime() + m * 60_000).toISOString();
  const pts = line.map((p, i) => ({ ...p, t: t(i) }));
  const saved = await saveRoutePoints(ctx, rider, pts.slice(0, 6));
  const again = await saveRoutePoints(ctx, rider, pts.slice(3));
  check(again.route.points.length === 11 && again.stats.km === 1.1 && saved.stats.km === 0.6, `saving every few minutes adds only new points (km ${saved.stats.km} → ${again.stats.km})`);
  check(again.stats.cells.length === lineCells && again.stats.riderName === 'Rider Rekha', 'today\'s squares are shared as stats (no GPS points)');
  const s1 = await createSighting(ctx, rider, { ...BANER, address: 'Baner', photo: photo('SITE') });
  const ended = await saveRoutePoints(ctx, rider, [], true);
  check(!ended.route.onDuty && !!ended.route.endedAt, 'End day stops the route');
  check((await getMyRouteToday(ctx, rider))?.onDuty === false, 'after End day nothing more is recorded until Start again');

  const lead = await convertSightingToLead(ctx, sales2, s1.id, { name: 'Mr Kale', phone: '9822077788', consent: true });
  let board = await buildRiderBoard(ctx, rider);
  check(board.today.km === 1.1 && board.today.sightings === 1 && board.totalAreaKm2 === lineCells * 0.25, `rider's board: today 1.1 km, 1 site, ${lineCells * 0.25} km² covered (got ${JSON.stringify(board.today)} ${board.totalAreaKm2})`);
  check(board.earnings.confirmed === 1 && board.earnings.amount === 50, 'confirmed site: ₹50 this month');
  check(board.week[0]?.riderId === rider.userId && board.week[0].confirmed === 1, 'the rider tops this week\'s leaderboard');
  check(board.suggestions.length > 0 && board.suggestions.every(s => !again.stats.cells.includes(s.key)), 'where next never suggests a square the rider covered today');

  // The lead goes all the way to a paid booking token → booking bonus.
  await runS1(ctx, clock, 7, { leadId: lead.id, qualifier: sales2 });
  const booked = (await listSightings(ctx, sales2)).find(s => s.id === s1.id)!;
  check(!!booked.bookedAt, 'booking token paid on that lead: the sighting is marked booked');
  board = await buildRiderBoard(ctx, rider);
  check(board.earnings.booked === 1 && board.earnings.amount === 1050, `earnings now ₹50 + ₹1,000 = ₹1,050 (got ${board.earnings.amount})`);
  check(await refuse(() => riderCommissionTable(ctx, rider)), 'a rider cannot open the commission sheet');
  const sheet = await riderCommissionTable(ctx, USERS.owner);
  check(sheet.rows.some(r => r.riderId === rider.userId && r.amount === 1050), 'the Owner/Admin commission sheet shows ₹1,050 for the rider');
}

main().catch(err => { console.error(err); process.exit(1); });

function part3() {
  // --- D-35 opportunity heatmap: outcomes over counts, yield over footprint, time fades ---
  const now = new Date('2026-10-15T06:00:00Z');
  const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
  const S = HEAT_SETTINGS;
  const site = (lat: number, lng: number, p: Record<string, unknown> = {}) => ({ lat, lng, status: 'NEW' as const, createdAt: ago(1), ...p }) as any;
  const e = (p: Record<string, unknown>) => evidenceOf(site(0, 0, p), now, S);
  check(e({ status: 'CONVERTED', bookedAt: ago(1) }) > e({ status: 'CONVERTED' }) && e({ status: 'CONVERTED' }) > e({}) && e({}) > 0,
    'evidence: booked > became a lead > just seen > 0');
  check(e({ status: 'REJECTED', rejectReason: 'ALREADY_HAS_LIFT' }) < 0 && e({ status: 'REJECTED', rejectReason: 'NOT_READY_YET' }) > 0,
    'a site that already has a lift counts slightly against; "not ready yet" counts for (it will be)');
  check(Math.abs(e({ floors: 20 }) - 2 * e({})) < 1e-9, 'a G+19 building counts double (bigger lift order)');
  check(Math.abs(e({ createdAt: ago(61) }) / e({ createdAt: ago(1) }) - 0.5) < 0.01, 'evidence halves every 60 days (construction moves on)');

  const A = { lat: 18.5596, lng: 73.7799 };
  const B = { lat: 18.5975, lng: 73.7629 }; // ~4.5 km away
  check(heatGrid([site(A.lat, A.lng, { status: 'REJECTED', rejectReason: 'ALREADY_HAS_LIFT' })], [], now, S) === null, 'no good evidence yet: no heatmap (the app falls back to "Try here")');
  const g = heatGrid([site(A.lat, A.lng, { status: 'CONVERTED', bookedAt: ago(2) }), site(B.lat, B.lng)], [], now, S)!;
  check(g.values.length === g.rows * g.cols && g.rows * g.cols <= 6400 * 1.1, `grid stays phone-sized (${g.rows}×${g.cols})`);
  check(heatAt(g, A.lat, A.lng) > 0.9 && heatAt(g, B.lat, B.lng) < heatAt(g, A.lat, A.lng), `hottest at the booked site; a plain sighting is cooler (${heatAt(g, A.lat, A.lng)} vs ${heatAt(g, B.lat, B.lng)})`);
  check(heatAt(g, A.lat - 0.05, A.lng) === 0, 'far from everything (5 km from any site): no heat');

  // Yield, not footprint: the same sites, but riders combed around A for the last few days.
  const [ai, aj] = cellKey(A.lat, A.lng, S.effortCellM).split(':').map(Number);
  const cellA = [-1, 0, 1].flatMap(di => [-1, 0, 1].map(dj => `${ai + di}:${aj + dj}`)); // the streets around A
  const combed = heatGrid([site(A.lat, A.lng, { status: 'CONVERTED' }), site(B.lat, B.lng, { status: 'CONVERTED' })],
    [0, 1, 2, 3, 4, 5].map(d => ({ day: ago(d).slice(0, 10), cells: cellA })), now, S)!;
  check(heatAt(combed, B.lat, B.lng) > heatAt(combed, A.lat, A.lng), 'two equal finds: the one where riders have NOT been combing recently ranks higher');

  // A lift already installed next door cools the area.
  const withLift = heatGrid([site(A.lat, A.lng), site(A.lat + 0.001, A.lng, { status: 'REJECTED', rejectReason: 'ALREADY_HAS_LIFT' }), site(B.lat, B.lng)], [], now, S)!;
  check(heatAt(withLift, B.lat, B.lng) > heatAt(withLift, A.lat, A.lng), '"already has a lift" next door makes that area less promising than an equal one without');

  // Fresh beats stale.
  const stale = heatGrid([site(A.lat, A.lng, { status: 'CONVERTED', createdAt: ago(360) }), site(B.lat, B.lng, { createdAt: ago(3) })], [], now, S)!;
  check(heatAt(stale, B.lat, B.lng) > heatAt(stale, A.lat, A.lng), 'a site seen this week outweighs a lead from a year ago');

  const hs = hotspots(g, 3);
  check(hs.length >= 1 && distanceM(hs[0], A) < 400 && hs.every((h, i) => hs.slice(i + 1).every(o => distanceM(h, o) >= 1200)), 'best spots: the first is at the booked site, all at least 1.2 km apart');
  const why = whyHere([site(A.lat, A.lng, { status: 'CONVERTED', bookedAt: ago(2) }), site(A.lat + 0.002, A.lng), site(B.lat, B.lng)], [{ day: ago(1).slice(0, 10), cells: cellA }], g, A, now, S);
  check(why.booked === 1 && why.waiting === 1 && why.leads === 0 && why.daysRiddenRecently > 0.9 && why.heat > 0.9, `"why here": 1 booked + 1 waiting within 1.5 km, ridden yesterday (${JSON.stringify(why)})`);

  const rv = revisits([
    site(A.lat, A.lng, { status: 'REJECTED', rejectReason: 'NOT_READY_YET', reviewedAt: ago(40) }),
    site(B.lat, B.lng, { status: 'REJECTED', rejectReason: 'NOT_READY_YET', reviewedAt: ago(10) }),
    site(B.lat, B.lng, { status: 'REJECTED', rejectReason: 'ALREADY_HAS_LIFT', reviewedAt: ago(40) }),
  ], now, 30);
  check(rv.length === 1 && rv[0].lat === A.lat, '"not ready yet" 40 days ago: go back; 10 days ago: not yet; other reasons: never');

  const far = heatGrid([site(18.3, 73.6), site(18.7, 74.1)], [], now, S)!;
  check(far.rows * far.cols <= 6400 * 1.1 && far.cellM > S.cellM, `sites 60 km apart: bigger cells, still phone-sized (${far.rows}×${far.cols}, ${far.cellM} m)`);
  check(heatColor(0)[3] === 0 && heatColor(1)[2] > heatColor(1)[0] && heatColor(1)[3] > heatColor(0.3)[3], 'colour: transparent at 0, dark blue and more opaque as the chance rises');
}
