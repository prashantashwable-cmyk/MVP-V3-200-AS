/**
 * D-36 planned projects: buildings registered to be built (e.g. MahaRERA's public project list,
 * copied in by the Admin, or any list the Owner has) that will need a lift. Pure; `now` injected.
 *
 * Why it matters: a rider can only find a site whose shaft is already visible, often after a
 * competitor has quoted. A registered project gives the address and the *proposed completion
 * date* months earlier — and the lift is ordered in a fairly predictable window before
 * possession (after the structure is up, before finishing). So each project gets a "lift
 * window": riders go when the shaft should be ready, not before (wasted trip) and not after
 * (lift already ordered).
 *
 * Only project facts are kept (name, registration number, address, dates, company). Phone
 * numbers and e-mails in an imported list are deliberately ignored: nobody at the site has
 * agreed to be contacted (D-04) — the rider visits and Sales asks for consent, as for any sighting.
 */

import { distanceM, validLatLng } from './scouting';
import { PLANNED_HEAT_WEIGHTS } from './config';

export type ProspectStatus = 'OPEN' | 'DISMISSED';

export interface SiteProspect {
  id: string;
  name: string;
  /** e.g. the MahaRERA registration number (P5210000xxxx); the key for re-imports. */
  regNo?: string;
  promoter?: string;
  address: string;
  pincode?: string;
  lat: number;
  lng: number;
  /** Proposed completion (possession) date, YYYY-MM-DD. */
  completion?: string;
  floors?: number;
  source: string;
  status: ProspectStatus;
  dismissReason?: string;
  importedBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** One parsed row of the pasted list (before it has a location or is saved). */
export interface ProspectRow {
  line: number;
  name: string;
  regNo?: string;
  promoter?: string;
  address: string;
  pincode?: string;
  lat?: number;
  lng?: number;
  completion?: string;
  floors?: number;
}

export type LiftPhase = 'EARLY' | 'WINDOW' | 'LATE' | 'OVERDUE' | 'UNKNOWN';

/** Splits one CSV line (commas or tabs — a copy from a spreadsheet pastes as tabs). */
function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Indian-style dates: 31/12/2027, 31-12-2027, 2027-12-31, Dec 2027, 12/2027 → YYYY-MM-DD. */
export function parseDate(raw: string): string | undefined {
  const s = raw.trim().toLowerCase();
  if (!s) return undefined;
  let y: number, m: number, d: number;
  let r: RegExpMatchArray | null;
  if ((r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) [d, m, y] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2})[/.-](\d{4})$/))) { m = +r[1]; y = +r[2]; d = m >= 1 && m <= 12 ? lastDay(y, m) : 1; }
  else if ((r = s.match(/^(?:(\d{1,2})[\s-]+)?([a-z]{3})[a-z]*[\s,-]+(\d{4})$/)) && MONTHS.includes(r[2])) {
    y = +r[3]; m = MONTHS.indexOf(r[2]) + 1; d = r[1] ? +r[1] : lastDay(y, m);
  } else return undefined;
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > lastDay(y, m)) return undefined;
  return `${y}-${pad(m)}-${pad(d)}`;
}

const COLUMNS: Record<keyof Omit<ProspectRow, 'line'>, RegExp> = {
  regNo: /(rera|registration|reg\.?\s*no|certificate)/,
  name: /(project|name)/,
  promoter: /(promoter|developer|builder)/,
  address: /(address|location|locality|village|area)/,
  pincode: /(pin)/,
  completion: /(completion|possession|end date|due)/,
  floors: /(floor|storey|stories)/,
  lat: /^(lat|latitude)$/,
  lng: /^(lng|lon|long|longitude)$/,
};

/**
 * The pasted list → rows. The first line must be the column names (any order; names are
 * matched loosely: "Project Name", "MahaRERA Registration No", "Proposed Completion Date"…).
 * Phone and e-mail columns are ignored on purpose (see the file comment).
 */
export function parseProspectList(text: string): { rows: ProspectRow[]; errors: { line: number; message: string }[] } {
  const lines = text.replace(/\r/g, '').split('\n');
  const headerAt = lines.findIndex(l => l.trim());
  if (headerAt < 0) return { rows: [], errors: [{ line: 1, message: 'The list is empty.' }] };
  const sep = lines[headerAt].includes('\t') ? '\t' : ',';
  const header = splitLine(lines[headerAt], sep).map(h => h.toLowerCase());
  const col: Partial<Record<keyof typeof COLUMNS, number>> = {};
  // Most specific first, so "Project Registration No" is the number and not the name.
  for (const key of ['regNo', 'promoter', 'pincode', 'completion', 'floors', 'lat', 'lng', 'address', 'name'] as (keyof typeof COLUMNS)[]) {
    const i = header.findIndex((h, idx) => COLUMNS[key].test(h) && !Object.values(col).includes(idx) && !/(phone|mobile|e-?mail|contact)/.test(h));
    if (i >= 0) col[key] = i;
  }
  const errors: { line: number; message: string }[] = [];
  if (col.name === undefined) return { rows: [], errors: [{ line: headerAt + 1, message: 'No "Project name" column found in the first line.' }] };
  if (col.address === undefined && (col.lat === undefined || col.lng === undefined)) {
    return { rows: [], errors: [{ line: headerAt + 1, message: 'Need an "Address" (or "Latitude" and "Longitude") column.' }] };
  }
  const rows: ProspectRow[] = [];
  for (let i = headerAt + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const c = splitLine(lines[i], sep);
    const get = (k: keyof typeof COLUMNS) => (col[k] !== undefined ? (c[col[k]!] ?? '').trim() : '');
    const name = get('name');
    const address = get('address');
    if (!name) { errors.push({ line: i + 1, message: 'No project name.' }); continue; }
    const row: ProspectRow = { line: i + 1, name, address };
    const reg = get('regNo').toUpperCase().replace(/\s+/g, '');
    if (reg) row.regNo = reg;
    if (get('promoter')) row.promoter = get('promoter');
    const pin = get('pincode').replace(/\D/g, '');
    if (pin) {
      if (/^[1-9]\d{5}$/.test(pin)) row.pincode = pin;
      else errors.push({ line: i + 1, message: `PIN code "${get('pincode')}" is not 6 digits (kept without it).` });
    }
    const lat = parseFloat(get('lat'));
    const lng = parseFloat(get('lng'));
    if (validLatLng(lat, lng)) { row.lat = lat; row.lng = lng; }
    if (get('completion')) {
      const d = parseDate(get('completion'));
      if (d) row.completion = d;
      else errors.push({ line: i + 1, message: `Completion date "${get('completion')}" not understood (use 31/12/2027 or Dec 2027).` });
    }
    const floors = parseInt(get('floors'), 10);
    if (Number.isFinite(floors) && floors >= 1 && floors <= 200) row.floors = floors;
    if (!row.address && row.lat === undefined) { errors.push({ line: i + 1, message: 'No address and no location.' }); continue; }
    rows.push(row);
  }
  return { rows, errors };
}

const MONTH_MS = 30.44 * 86_400_000;

/**
 * Where a project is against its lift window (`fromMonths` … `toMonths` before completion,
 * ⚖ VERIFY with the Owner's own orders). Registered completion dates slip often, so a project
 * past its date is "OVERDUE — check", not dead: it may still be waiting for its lift.
 */
export function liftPhase(completion: string | undefined, now: Date, fromMonths: number, toMonths: number): { phase: LiftPhase; months: number | null } {
  if (!completion) return { phase: 'UNKNOWN', months: null };
  const months = Math.round(((new Date(`${completion}T00:00:00+05:30`).getTime() - now.getTime()) / MONTH_MS) * 10) / 10;
  if (months > fromMonths) return { phase: 'EARLY', months };
  if (months >= toMonths) return { phase: 'WINDOW', months };
  if (months >= 0) return { phase: 'LATE', months };
  return { phase: 'OVERDUE', months };
}

/** How strongly a planned project pulls the heatmap (relative to a found site), by phase (config.ts). */
export const PHASE_WEIGHT: Record<LiftPhase, number> = PLANNED_HEAT_WEIGHTS;
/** Riders see the most useful first. */
export const PHASE_ORDER: Record<LiftPhase, number> = { WINDOW: 0, LATE: 1, OVERDUE: 2, UNKNOWN: 3, EARLY: 4 };

/** A rider already recorded a site here (within `radiusM`) since the project was added. */
export function visitedBy<T extends { lat: number; lng: number; createdAt: string }>(p: Pick<SiteProspect, 'lat' | 'lng' | 'createdAt'>, sightings: T[], radiusM: number): T | undefined {
  return sightings.find(s => s.createdAt >= p.createdAt.slice(0, 10) && distanceM(p, s) <= radiusM);
}

/** An import row matches an existing project: same registration number, or same name within `radiusM`. */
export function sameProject(a: { regNo?: string; name: string; lat: number; lng: number }, b: Pick<SiteProspect, 'regNo' | 'name' | 'lat' | 'lng'>, radiusM: number): boolean {
  if (a.regNo && b.regNo) return a.regNo === b.regNo;
  return a.name.trim().toLowerCase() === b.name.trim().toLowerCase() && distanceM(a, b) <= radiusM;
}
