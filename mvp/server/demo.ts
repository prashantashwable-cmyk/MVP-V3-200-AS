/**
 * DEMO BOT — plays the field users (technicians, supplier, customer) so
 * one person can watch the whole lifecycle run. It goes through the SAME
 * engine methods, with the SAME authorization checks, as a human clicking
 * in the app, acting as whichever user the system assigned the work to.
 *
 * It NEVER acts as Admin. If the workflow needs Admin, the bot stops and
 * waits: that is the point of the demo.
 *
 * Scenario "failures" deliberately misbehaves once at each of several
 * points (ignores a task, bad card, off-site GPS, QC fail) and moves the
 * demo clock forward, so you can watch the system remind, escalate,
 * reassign, reject and retry by itself.
 */
import type { Engine, EvidenceInput, WorkItemRow } from './workflow/engine';
import { SYSTEM } from './workflow/engine';
import type { EvidenceSpec, TaskTypeDef } from './workflow/catalog';

export type Scenario = 'happy' | 'failures';

export function demoPhoto(label: string, color = '#1f6feb'): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="100%" height="100%" fill="${color}"/>` +
    `<text x="50%" y="45%" fill="#fff" font-family="sans-serif" font-size="18" text-anchor="middle">DEMO PHOTO</text>` +
    `<text x="50%" y="62%" fill="#fff" font-family="sans-serif" font-size="14" text-anchor="middle">${label.replace(/[<&>]/g, '')}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export interface EvidenceVariant { offSite?: boolean; qcFail?: boolean; badMeasurement?: boolean; keyPrefix?: string }

/** Complete, valid evidence for a spec (or deliberately bad, per variant). */
export function demoEvidence(def: TaskTypeDef, site: { lat: number | null; lng: number | null }, now: number, v: EvidenceVariant = {}): EvidenceInput[] {
  const spec: EvidenceSpec = def.evidence ?? {};
  const out: EvidenceInput[] = [];
  const key = (s: string) => (v.keyPrefix ? `${v.keyPrefix}:${s}` : undefined);
  if (spec.gps) {
    const lat = (site.lat ?? 18.52) + (v.offSite ? 0.03 : 0.0002);
    const lng = (site.lng ?? 73.85) + (v.offSite ? 0.01 : 0.0002);
    out.push({ kind: 'gps', label: 'Check-in', data: { lat, lng, accuracyM: 8 }, lat, lng, capturedAt: now, idempotencyKey: key('gps') });
  }
  for (let i = 0; i < (spec.photos?.min ?? 0); i++) {
    out.push({ kind: 'photo', label: `${def.label} ${i + 1}`, data: { dataUrl: demoPhoto(`${def.label} #${i + 1}`) }, capturedAt: now, idempotencyKey: key(`photo${i}`) });
  }
  if (spec.measurements) {
    const m: Record<string, number> = {};
    for (const x of spec.measurements) m[x.key] = Math.round((x.min + x.max) / 2);
    if (v.badMeasurement) m[spec.measurements[0].key] = spec.measurements[0].min - 200;
    out.push({ kind: 'measurement', label: 'Measurements', data: m, capturedAt: now, idempotencyKey: key('measure') });
  }
  if (spec.checklist) {
    out.push({ kind: 'checklist', label: 'Checklist', data: Object.fromEntries(spec.checklist.map(c => [c, true])), capturedAt: now, idempotencyKey: key('checklist') });
  }
  if (spec.signature) {
    out.push({ kind: 'signature', label: 'Customer signature', data: { dataUrl: demoPhoto('signature', '#444') }, capturedAt: now, idempotencyKey: key('sig') });
  }
  if (spec.fields?.length) {
    const f: Record<string, string> = {};
    for (const x of spec.fields) {
      f[x.key] = ({
        lrNumber: 'LR-PUN-88213', vehicleNumber: 'MH12 AB 1234', trialRuns: '10', rating: '5',
        qcResult: v.qcFail ? 'fail' : 'pass', missing: '',
      } as Record<string, string>)[x.key] ?? 'ok';
    }
    if (v.qcFail) f.snags = 'Landing door 3 gap 8mm; Car levelling +7mm at floor 2';
    out.push({ kind: 'field', label: 'Details', data: f, capturedAt: now, idempotencyKey: key('fields') });
  }
  return out;
}

interface Run {
  projectId: string;
  scenario: Scenario;
  done: boolean;
  log: { at: string; text: string }[];
  misbehaved: Set<string>;
}

export class DemoDirector {
  private runs = new Map<string, Run>();
  private busy = false;

  constructor(private engine: Engine) {}

  start(projectId: string, scenario: Scenario): void {
    this.engine.project(projectId);
    this.runs.set(projectId, { projectId, scenario, done: false, log: [], misbehaved: new Set() });
    this.log(this.runs.get(projectId)!, `Demo started (${scenario === 'failures' ? 'with failures' : 'happy path'}). The bot plays technicians, supplier and customer — never Admin.`);
  }

  stop(projectId: string): void {
    const r = this.runs.get(projectId);
    if (r) { r.done = true; this.log(r, 'Demo stopped.'); }
  }

  status() {
    return [...this.runs.values()].map(r => ({ projectId: r.projectId, scenario: r.scenario, done: r.done, log: r.log.slice(-40) }));
  }

  private log(r: Run, text: string) {
    r.log.push({ at: new Date(this.engine.now()).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }), text });
  }

  /** Advance every active demo one action. Called on a timer by the server. */
  async stepAll(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      for (const r of this.runs.values()) {
        if (r.done) continue;
        try {
          await this.step(r);
        } catch (e) {
          this.log(r, `⚠ ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } finally {
      this.busy = false;
    }
  }

  private once(r: Run, key: string): boolean {
    if (r.scenario !== 'failures' || r.misbehaved.has(key)) return false;
    r.misbehaved.add(key);
    return true;
  }

  async step(r: Run): Promise<void> {
    const e = this.engine;
    const p = e.project(r.projectId);
    if (p.state === 'COMPLETED' || p.state === 'CLOSED_LOST') {
      r.done = true;
      this.log(r, `🏁 Project ${p.state}. Demo finished.`);
      return;
    }
    const w = e.currentItem(p.id);
    if (!w) { this.log(r, 'No current work item — see Control Tower (automation exception).'); return; }
    const def = e.def(w.type);
    if (w.admin_required || w.status === 'FLAGGED' || w.status === 'UNASSIGNED' || def.ownerRole === 'admin') {
      this.log(r, `⏸ ${def.label}: waiting for ADMIN (the bot never acts as Admin).`);
      return;
    }
    const owner = e.user(w.assigned_user_id!)!;
    const actor = { id: owner.id, role: owner.role, name: owner.name };
    const as = `${owner.name} (${owner.role})`;

    // Scripted misbehaviour for the "failures" scenario.
    if (w.type === 'TECHNICAL_CLEARANCE' && w.status === 'ASSIGNED' && w.reassign_count === 0 && r.scenario === 'failures') {
      const res = e.advanceClock(SYSTEM, 60);
      this.log(r, `😴 ${as} ignores the clearance task. ⏩ demo clock +60 min → ${res.actions.length ? res.actions.join(', ') : 'waiting'}`);
      return;
    }

    switch (w.status) {
      case 'ASSIGNED':
        e.acceptTask(actor, w.id);
        this.log(r, `✅ ${as} accepted “${def.label}”.`);
        return;
      case 'OPEN':
        if (def.completion === 'decision') {
          e.decideQuote(actor, w.id, true);
          this.log(r, `✍ ${as} accepted the quotation.`);
          return;
        }
        if (def.completion === 'payment') {
          const failNow = this.once(r, `pay:${w.type}`) && w.type === 'TOKEN_PAYMENT';
          const res = await e.pay(actor, w.id, { method: 'card', cardNumber: failNow ? '4000 0000 0000 0002' : '4111 1111 1111 1111' });
          this.log(r, res.ok ? `💳 ${as} paid ${def.label}.` : `❌ ${as}'s payment failed (${res.reason}). Workflow held — customer will retry.`);
          return;
        }
        break;
    }

    // Evidence tasks: capture on one step, submit on the next (so you can watch).
    const captured = e.evidenceFor(w.id);
    if (captured.length === 0) {
      const variant: EvidenceVariant = {};
      if (w.type === 'INSTALLATION' && this.once(r, 'offsite')) variant.offSite = true;
      if (w.type === 'QC_INSPECTION' && this.once(r, 'qcfail')) variant.qcFail = true;
      for (const ev of demoEvidence(def, p, e.now(), variant)) e.addEvidence(actor, w.id, ev);
      this.log(r, `📸 ${as} captured evidence for “${def.label}”${variant.offSite ? ' — from 3 km away (bad GPS)' : ''}${variant.qcFail ? ' — inspection FAILED' : ''}.`);
      return;
    }
    const res = e.submitTask(actor, w.id);
    const msg = res.outcome === 'PASS' ? `✔ evidence PASSED → ${e.project(p.id).state}`
      : res.outcome === 'FAIL' ? `✖ evidence REJECTED (${res.validation?.reasons.join('; ')}) → must resubmit`
        : res.outcome === 'FLAG' ? '⚑ evidence FLAGGED for Admin review'
          : `… submission refused, missing ${res.missing?.join(', ')}`;
    this.log(r, `📤 ${as} submitted “${def.label}”: ${msg}.`);
  }
}

export function isActionable(w: WorkItemRow | undefined): boolean {
  return !!w && !w.admin_required && w.status !== 'FLAGGED' && w.status !== 'UNASSIGNED';
}
