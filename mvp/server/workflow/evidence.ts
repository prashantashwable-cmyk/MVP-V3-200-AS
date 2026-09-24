/**
 * Evidence gate — deterministic, rule-based validation (prompt §13).
 *
 * PASS  = every required evidence item present + GPS within radius +
 *         timestamps plausible + checklist complete + fields filled +
 *         measurements inside tolerance.
 * FAIL  = something present but wrong (GPS off-site, stale/future photo,
 *         unchecked checklist item) → task rejected, owner retries.
 * FLAG  = technically complete but outside tolerance (e.g. shaft too
 *         narrow) → needs a human decision; never auto-approved.
 *
 * `precheck()` is the cheap "is anything missing" pass used before a
 * submission is accepted at all: missing evidence keeps the task
 * incomplete without counting as a rejection.
 *
 * Photo content analysis is behind `PhotoAnalyzer`. The only
 * implementation today is an MVP MOCK that returns "not analysed". A real
 * computer-vision model can replace it without touching the engine.
 */
import type { EvidenceSpec } from './catalog';

export interface EvidenceRecord {
  id: string;
  kind: 'gps' | 'photo' | 'measurement' | 'checklist' | 'signature' | 'field';
  label?: string | null;
  data: any;
  captured_at: number;
  lat?: number | null;
  lng?: number | null;
}

export interface CheckResult { name: string; ok: boolean; severity: 'fail' | 'flag'; detail: string }
export interface ValidationResult {
  outcome: 'PASS' | 'FAIL' | 'FLAG';
  checks: CheckResult[];
  reasons: string[];
  cv: { analyzer: string; status: string };
}

export interface PhotoAnalyzer {
  name: string;
  analyze(photos: EvidenceRecord[]): { status: 'not_analyzed' | 'ok' | 'suspicious'; detail: string };
}

/** MVP MOCK — no computer vision. Swap for a real model later. */
export const mockPhotoAnalyzer: PhotoAnalyzer = {
  name: 'MVP MOCK (no CV)',
  analyze: () => ({ status: 'not_analyzed', detail: 'Photo content not analysed — rule checks only (MVP MOCK)' }),
};

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function latest<T extends EvidenceRecord>(items: T[]): T | undefined {
  return items.slice().sort((a, b) => b.captured_at - a.captured_at)[0];
}

export function collect(evidence: EvidenceRecord[]) {
  const byKind = (k: EvidenceRecord['kind']) => evidence.filter(e => e.kind === k);
  const checklist = latest(byKind('checklist'))?.data as Record<string, boolean> | undefined;
  const measurements = latest(byKind('measurement'))?.data as Record<string, number> | undefined;
  const fields: Record<string, string> = {};
  for (const f of byKind('field').sort((a, b) => a.captured_at - b.captured_at)) Object.assign(fields, f.data);
  return {
    gps: latest(byKind('gps')),
    photos: byKind('photo'),
    checklist,
    measurements,
    signature: latest(byKind('signature')),
    fields,
  };
}

/** What is still MISSING (not wrong) — used to refuse a premature submit. */
export function precheck(spec: EvidenceSpec | undefined, evidence: EvidenceRecord[]): string[] {
  if (!spec) return [];
  const c = collect(evidence);
  const missing: string[] = [];
  if (spec.gps && !c.gps) missing.push('GPS check-in');
  if (spec.photos && c.photos.length < spec.photos.min) missing.push(`${spec.photos.min - c.photos.length} more photo(s) — ${spec.photos.hint}`);
  if (spec.measurements) {
    for (const m of spec.measurements) {
      const v = c.measurements?.[m.key];
      if (typeof v !== 'number' || !Number.isFinite(v)) missing.push(`Measurement: ${m.label}`);
    }
  }
  if (spec.checklist && !c.checklist) missing.push('Checklist');
  if (spec.signature && !c.signature) missing.push('Signature');
  for (const f of spec.fields ?? []) {
    if (!String(c.fields[f.key] ?? '').trim()) missing.push(f.label);
  }
  return missing;
}

export interface ValidateContext {
  site: { lat: number | null; lng: number | null };
  /** Evidence captured before this is not evidence of THIS visit. */
  windowStart: number;
  now: number;
  analyzer?: PhotoAnalyzer;
}

export function validateEvidence(spec: EvidenceSpec | undefined, evidence: EvidenceRecord[], ctx: ValidateContext): ValidationResult {
  const analyzer = ctx.analyzer ?? mockPhotoAnalyzer;
  const checks: CheckResult[] = [];
  const add = (name: string, ok: boolean, detail: string, severity: 'fail' | 'flag' = 'fail') => checks.push({ name, ok, detail, severity });

  if (!spec) {
    return { outcome: 'PASS', checks, reasons: [], cv: { analyzer: analyzer.name, status: 'n/a' } };
  }

  for (const m of precheck(spec, evidence)) add('Required evidence', false, `Missing: ${m}`);

  const c = collect(evidence);

  if (spec.gps && c.gps && ctx.site.lat != null && ctx.site.lng != null) {
    const d = distanceMeters(c.gps.lat ?? 0, c.gps.lng ?? 0, ctx.site.lat, ctx.site.lng);
    add('GPS at site', d <= spec.gps.maxDistanceM,
      d <= spec.gps.maxDistanceM ? `${Math.round(d)} m from site` : `${d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'} from site (limit ${spec.gps.maxDistanceM} m)`);
  }

  // Timestamps: every item must belong to this visit and not come from the future.
  const maxAgeMs = (spec.maxAgeMinutes ?? 7 * 24 * 60) * 60_000;
  const skew = 5 * 60_000;
  const bad = evidence.filter(e => e.captured_at < ctx.windowStart - skew || e.captured_at > ctx.now + skew || ctx.now - e.captured_at > maxAgeMs);
  if (evidence.length > 0) {
    add('Timestamps plausible', bad.length === 0,
      bad.length === 0 ? 'All evidence captured during this task' : `${bad.length} item(s) captured outside the task window or in the future`);
  }

  if (spec.checklist && c.checklist) {
    const unchecked = spec.checklist.filter(item => c.checklist![item] !== true);
    add('Checklist complete', unchecked.length === 0, unchecked.length === 0 ? `${spec.checklist.length}/${spec.checklist.length} checked` : `Unchecked: ${unchecked.join(', ')}`);
  }

  if (spec.measurements && c.measurements) {
    for (const m of spec.measurements) {
      const v = c.measurements[m.key];
      if (typeof v !== 'number') continue;
      const ok = v >= m.min && v <= m.max;
      add(`${m.label} in tolerance`, ok, ok ? `${v} ${m.unit}` : `${v} ${m.unit} outside ${m.min}–${m.max} ${m.unit} — needs review`, 'flag');
    }
  }

  if (spec.fields?.some(f => f.key === 'trialRuns') && c.fields.trialRuns != null) {
    const runs = Number(c.fields.trialRuns);
    add('Trial runs ≥ 10', runs >= 10, `${runs} trial runs`);
  }
  if (spec.fields?.some(f => f.key === 'qcResult') && c.fields.qcResult != null) {
    const r = String(c.fields.qcResult).toLowerCase();
    add('QC result recorded', r === 'pass' || r === 'fail', `Result: ${r}`);
  }
  if (spec.fields?.some(f => f.key === 'rating') && c.fields.rating != null) {
    const r = Number(c.fields.rating);
    add('Rating 1–5', r >= 1 && r <= 5, `Rating ${r}`);
  }

  const cv = analyzer.analyze(c.photos);
  if (cv.status === 'suspicious') add('Photo analysis', false, cv.detail, 'flag');

  const failed = checks.filter(x => !x.ok && x.severity === 'fail');
  const flagged = checks.filter(x => !x.ok && x.severity === 'flag');
  const outcome: ValidationResult['outcome'] = failed.length ? 'FAIL' : flagged.length ? 'FLAG' : 'PASS';
  return {
    outcome,
    checks,
    reasons: [...failed, ...flagged].map(x => `${x.name}: ${x.detail}`),
    cv: { analyzer: analyzer.name, status: cv.status },
  };
}
