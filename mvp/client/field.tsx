/**
 * "MY NEXT WORK" — the only screen a technician, supplier or customer
 * needs. The system decides what is next; the screen shows it, what proof
 * is required, by when, what it pays, and what happens if nothing happens.
 */
import React, { useState } from 'react';
import { api, apiRaw, useLive } from './api';
import type { Me } from './api';
import { queueEvidence, retryFailed, useOutbox, labelOf } from './offline';
import { ask, EvidenceImage, Notifications, Progress, SignaturePad, StatusPill, compressImage, demoPhotoDataUrl, inr, toast } from './ui';

export interface WorkView {
  id: string; version: number; type: string; label: string; status: string; nextAction: string;
  requiresAcceptance: boolean; completion: 'evidence' | 'decision' | 'payment' | 'admin_resolution';
  deadline: string | null; deadlineIn: string | null; overdue: boolean;
  project: { id: string; title: string; address: string | null; lat: number | null; lng: number | null; floors: number | null; customer?: { name: string; phone?: string }; quote?: { total: number; TOKEN: number; MATERIAL: number; FINAL: number } };
  evidenceSpec: any; evidence: { id: string; kind: string; label: string | null; capturedAt: string; value?: any }[];
  lastValidation: { outcome: string; reasons: string[] } | null; failureReason: string | null; retryCount: number; maxRetries: number;
  earning?: number; payment?: { id: string; milestone: string; amount: number; status: string; attempts: number; failureReason: string | null };
  snags?: string[]; systemWill: string | null; offlineCapable: boolean;
}
export interface MyWork {
  user: Me; now: string; work: WorkView[]; completed: { id: string; label: string; projectId: string; completedAt: string; earning?: number; payout: string }[];
  earnings?: number; notifications: any[];
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function MyWorkPage({ me }: { me: Me }) {
  const { data, reload, error } = useLive<MyWork>('/my/work');
  const [done, setDone] = useState<{ label: string; earning?: number } | null>(null);
  if (!data) return <div className="wrap narrow">{error ? <p className="muted">{error}</p> : <p className="muted">Loading your work…</p>}</div>;
  const [next, ...rest] = data.work;
  return (
    <div className="wrap narrow">
      <div className="card hero">
        <div className="muted small">{greeting()}</div>
        <h1 style={{ margin: '2px 0' }}>{me.name}</h1>
        <div>You have <b>{data.work.length}</b> task{data.work.length === 1 ? '' : 's'}{data.earnings != null && <> · Earned (evidence-verified): <b>{inr(data.earnings)}</b></>}</div>
      </div>

      {done && (
        <div className="card" style={{ borderColor: 'var(--ok)' }}>
          <h2 style={{ color: 'var(--ok)' }}>✓ COMPLETED — {done.label}</h2>
          {!!done.earning && <p><b>{inr(done.earning)}</b> earned (evidence passed validation).</p>}
          <p className="muted">{next ? <>Next: <b>{next.label}</b> — {next.project.title}</> : 'No more work right now. The system will notify you when something new is assigned.'}</p>
          <button className="btn primary" onClick={() => setDone(null)}>CONTINUE</button>
        </div>
      )}

      {!next && !done && (
        <div className="card"><h2>Nothing to do right now</h2><p className="muted">When the system assigns you work, it appears here automatically.</p></div>
      )}

      {next && !done && (
        <>
          <div className="muted small" style={{ margin: '14px 0 6px', fontWeight: 600, letterSpacing: '.4px' }}>NEXT</div>
          <WorkCard w={next} me={me} onChange={reload} onDone={(label, earning) => setDone({ label, earning })} />
        </>
      )}

      {rest.length > 0 && (
        <>
          <div className="muted small" style={{ margin: '14px 0 6px', fontWeight: 600 }}>ALSO ASSIGNED TO YOU</div>
          {rest.map(w => (
            <details key={w.id} className="card">
              <summary className="row between"><span><b>{w.label}</b> · {w.project.title}</span><span className="row"><StatusPill status={w.status} /><span className="small muted">{w.deadlineIn && `due in ${w.deadlineIn}`}</span></span></summary>
              <div style={{ marginTop: 12 }}><WorkCard w={w} me={me} onChange={reload} onDone={(label, earning) => setDone({ label, earning })} /></div>
            </details>
          ))}
        </>
      )}

      {data.completed.length > 0 && (
        <details className="card">
          <summary><b>Completed</b> <span className="muted small">({data.completed.length})</span></summary>
          <table className="small"><tbody>
            {data.completed.map(c => <tr key={c.id}><td>{c.label}<div className="muted">{c.projectId}</div></td><td>{c.completedAt}</td>{c.earning != null && <td>{inr(c.earning)}<div className="muted">{c.payout.replace(/_/g, ' ')}</div></td>}</tr>)}
          </tbody></table>
        </details>
      )}
      <Notifications items={data.notifications} />
    </div>
  );
}

export function WorkCard({ w, me, onChange, onDone }: { w: WorkView; me: Me; onChange: () => void; onDone: (label: string, earning?: number) => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); onChange(); }
  };
  return (
    <div className="card">
      <div className="row between">
        <h2 style={{ margin: 0 }}>{w.label}</h2>
        <StatusPill status={w.status} />
      </div>
      <div className="muted">{w.project.title} · <span className="small">{w.project.id}</span></div>
      <dl className="why">
        {w.project.address && <><dt>Location</dt><dd>{w.project.address} {w.project.lat != null && <a href={`https://maps.google.com/?q=${w.project.lat},${w.project.lng}`} target="_blank" rel="noreferrer">Navigate ↗</a>}</dd></>}
        {w.project.customer && <><dt>Customer</dt><dd>{w.project.customer.name}{w.project.customer.phone && <> · <a href={`tel:${w.project.customer.phone}`}>{w.project.customer.phone}</a></>}</dd></>}
        {w.deadline && <><dt>{w.status === 'ASSIGNED' ? 'Accept by' : 'Due'}</dt><dd style={{ color: w.overdue ? 'var(--bad)' : undefined }}>{w.deadline} {w.deadlineIn && <span className="muted">({w.overdue ? `${w.deadlineIn.replace('-', '')} overdue` : `in ${w.deadlineIn}`})</span>}</dd></>}
        {w.earning != null && w.earning > 0 && <><dt>You earn</dt><dd><b>{inr(w.earning)}</b> <span className="muted small">when evidence passes</span></dd></>}
      </dl>
      <p style={{ margin: '10px 0' }}><b>What to do:</b> {w.nextAction}</p>
      {w.systemWill && <p className="small muted" style={{ marginTop: 0 }}>⏱ If nothing happens: {w.systemWill}.</p>}
      {w.status === 'REJECTED' && <div className="card" style={{ background: 'var(--warn-bg)', borderColor: 'var(--warn)' }}><b>Resubmit needed ({w.retryCount}/{w.maxRetries}).</b> {w.failureReason}</div>}
      {w.snags?.length ? <div className="card" style={{ background: 'var(--warn-bg)' }}><b>Snags to fix:</b><ul>{w.snags.map(s => <li key={s}>{s}</li>)}</ul></div> : null}

      {w.status === 'ASSIGNED' && (
        <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', marginTop: 12 }}>
          <button className="btn primary big" disabled={busy} onClick={() => act(() => api(`/work/${w.id}/accept`, 'POST', { version: w.version }))}>ACCEPT</button>
          <button className="btn" disabled={busy} onClick={async () => { const a = await ask('Decline this work?', [{ key: 'reason', label: 'Reason', value: '' }], { note: 'The system will reassign it immediately.', confirm: 'Decline' }); if (a) act(() => api(`/work/${w.id}/decline`, 'POST', { reason: a.reason })); }}>Decline</button>
        </div>
      )}
      {w.completion === 'decision' && w.status === 'OPEN' && <QuoteDecision w={w} busy={busy} act={act} onDone={onDone} />}
      {w.completion === 'payment' && w.status === 'OPEN' && <PaymentAction w={w} onChange={onChange} onDone={onDone} />}
      {w.completion === 'evidence' && ['OPEN', 'ACCEPTED', 'IN_PROGRESS', 'REJECTED'].includes(w.status) && <EvidenceForm w={w} me={me} onChange={onChange} onDone={onDone} />}
      {w.status === 'FLAGGED' && <p className="pill warn">Submitted — waiting for Admin review of out-of-tolerance values</p>}
    </div>
  );
}

function QuoteDecision({ w, busy, act, onDone }: { w: WorkView; busy: boolean; act: (fn: () => Promise<unknown>) => void; onDone: (l: string) => void }) {
  const q = w.project.quote;
  return (
    <div>
      {q && (
        <table className="small" style={{ margin: '8px 0' }}><tbody>
          <tr><td>Lift for {w.project.floors} floors</td><td style={{ textAlign: 'right' }}><b>{inr(q.total)}</b></td></tr>
          <tr><td className="muted">1. Booking token (now)</td><td style={{ textAlign: 'right' }}>{inr(q.TOKEN)}</td></tr>
          <tr><td className="muted">2. When material reaches your site (90%)</td><td style={{ textAlign: 'right' }}>{inr(q.MATERIAL)}</td></tr>
          <tr><td className="muted">3. After handover (10%)</td><td style={{ textAlign: 'right' }}>{inr(q.FINAL)}</td></tr>
        </tbody></table>
      )}
      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <button className="btn primary big" disabled={busy} onClick={() => act(async () => { await api(`/work/${w.id}/decide`, 'POST', { accept: true }); onDone('Quotation accepted'); })}>ACCEPT QUOTATION</button>
        <button className="btn" disabled={busy} onClick={async () => { const a = await ask('Decline the quotation?', [{ key: 'reason', label: 'Reason', value: '' }], { note: 'This closes the project.', confirm: 'Decline quotation' }); if (a) act(() => api(`/work/${w.id}/decide`, 'POST', { accept: false, reason: a.reason })); }}>Decline</button>
      </div>
    </div>
  );
}

function PaymentAction({ w, onChange, onDone }: { w: WorkView; onChange: () => void; onDone: (l: string) => void }) {
  const [card, setCard] = useState('4111 1111 1111 1111');
  const [busy, setBusy] = useState(false);
  const p = w.payment;
  return (
    <div>
      <div className="row between" style={{ margin: '8px 0' }}>
        <span>{p?.milestone} milestone</span><b style={{ fontSize: 22 }}>{inr(p?.amount)}</b>
      </div>
      {p?.failureReason && <p className="pill bad">Last attempt failed: {p.failureReason} (attempt {p.attempts})</p>}
      <label className="small muted">Card number <span className="mock">MVP MOCK gateway — no real money</span></label>
      <input type="text" inputMode="numeric" value={card} onChange={e => setCard(e.target.value)} />
      <p className="small muted">Test cards: 4111 1111 1111 1111 succeeds · 4000 0000 0000 0002 is declined.</p>
      <button className="btn primary big" disabled={busy} onClick={async () => {
        setBusy(true);
        try {
          const r = await apiRaw<any>(`/work/${w.id}/pay`, 'POST', { method: 'card', cardNumber: card });
          if (r.status === 200) onDone(`${w.label} — payment received`);
          else toast(r.body?.reason ?? r.body?.message ?? 'Payment failed');
        } finally { setBusy(false); onChange(); }
      }}>PAY {inr(p?.amount)}</button>
    </div>
  );
}

function hasKind(w: WorkView, kind: string) { return w.evidence.some(e => e.kind === kind); }

function EvidenceForm({ w, me, onChange, onDone }: { w: WorkView; me: Me; onChange: () => void; onDone: (l: string, e?: number) => void }) {
  const spec = w.evidenceSpec ?? {};
  const outbox = useOutbox(w.id);
  // Start from what the server already has, so saved answers stay visible.
  const latest = (kind: string) => [...w.evidence].reverse().find(e => e.kind === kind)?.value ?? {};
  const [checks, setChecks] = useState<Record<string, boolean>>(() => latest('checklist'));
  const [measure, setMeasure] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(latest('measurement')).map(([k, v]) => [k, String(v)])));
  const [fields, setFields] = useState<Record<string, string>>(() => latest('field'));
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  React.useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const q = (kind: string, data: unknown, extra: { label?: string; lat?: number | null; lng?: number | null } = {}) =>
    queueEvidence({ workId: w.id, kind, data, capturedAt: Date.now(), ...extra }).then(() => setTimeout(onChange, 600));

  const pending = outbox.items.filter(i => labelOf(i) !== 'SYNCED');
  const photos = w.evidence.filter(e => e.kind === 'photo');
  const reqs: [string, boolean][] = [];
  if (spec.gps) reqs.push(['GPS check-in at site', hasKind(w, 'gps')]);
  if (spec.photos) reqs.push([`${spec.photos.min} photo(s): ${spec.photos.hint} (${photos.length}/${spec.photos.min})`, photos.length >= spec.photos.min]);
  if (spec.measurements) reqs.push(['Measurements', hasKind(w, 'measurement')]);
  if (spec.checklist) reqs.push([`Checklist (${spec.checklist.length} items)`, hasKind(w, 'checklist')]);
  if (spec.fields?.length) reqs.push([spec.fields.map((f: any) => f.label).join(', '), hasKind(w, 'field')]);
  if (spec.signature) reqs.push(['Signature', hasKind(w, 'signature')]);

  const gps = () => {
    if (!navigator.geolocation) return toast('No GPS on this device — use the demo button');
    navigator.geolocation.getCurrentPosition(
      p => q('gps', { accuracyM: p.coords.accuracy }, { label: 'Check-in', lat: p.coords.latitude, lng: p.coords.longitude }),
      err => toast(`GPS failed: ${err.message}. Use the demo button in the demo.`),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const saveDetails = async () => {
    if (spec.measurements) {
      const m: Record<string, number> = {};
      for (const x of spec.measurements) if (measure[x.key] !== undefined && measure[x.key] !== '') m[x.key] = Number(measure[x.key]);
      if (Object.keys(m).length) await q('measurement', m, { label: 'Measurements' });
    }
    if (spec.checklist) await q('checklist', Object.fromEntries(spec.checklist.map((c: string) => [c, !!checks[c]])), { label: 'Checklist' });
    if (spec.fields?.length) await q('field', fields, { label: 'Details' });
    toast('Saved on this device — syncing');
  };

  const fillDemo = () => {
    setChecks(Object.fromEntries((spec.checklist ?? []).map((c: string) => [c, true])));
    setMeasure(Object.fromEntries((spec.measurements ?? []).map((m: any) => [m.key, String(Math.round((m.min + m.max) / 2))])));
    setFields(Object.fromEntries((spec.fields ?? []).map((f: any) => [f.key, ({ lrNumber: 'LR-PUN-88213', vehicleNumber: 'MH12 AB 1234', trialRuns: '10', qcResult: 'pass', rating: '5' } as any)[f.key] ?? ''])));
  };

  const submit = async () => {
    setBusy(true);
    try {
      const r = await apiRaw<any>(`/work/${w.id}/submit`, 'POST', { version: w.version });
      if (r.status >= 400 && r.status !== 422) { toast(r.body?.message ?? 'Submit failed'); return; }
      setResult(r.body);
      if (r.body.outcome === 'PASS') onDone(w.label, w.earning);
    } finally { setBusy(false); onChange(); }
  };

  return (
    <div style={{ marginTop: 8 }}>
      <h3>Required proof</h3>
      {reqs.map(([label, ok]) => <div key={label} className="req"><span className={`tick ${ok ? 'on' : ''}`}>{ok ? '✓' : ''}</span><span>{label}</span></div>)}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 10 }}>
        {spec.gps && <button className="btn" onClick={gps}>📍 Check in with GPS</button>}
        {spec.gps && w.project.lat != null && <button className="btn" onClick={() => q('gps', { accuracyM: 10, demo: true }, { label: 'Check-in (demo)', lat: w.project.lat! + 0.0002, lng: w.project.lng! + 0.0002 })}>📍 Use site location <span className="mock">DEMO</span></button>}
        {spec.photos && (
          <label className="btn" style={{ textAlign: 'center' }}>📷 Take photo
            <input type="file" accept="image/*" capture="environment" hidden onChange={async e => { const f = e.target.files?.[0]; if (f) await q('photo', { dataUrl: await compressImage(f) }, { label: spec.photos.hint }); e.target.value = ''; }} />
          </label>
        )}
        {spec.photos && <button className="btn" onClick={() => q('photo', { dataUrl: demoPhotoDataUrl(`${w.label} ${photos.length + 1}`) }, { label: `${spec.photos.hint} (demo)` })}>🖼 Add demo photo <span className="mock">DEMO</span></button>}
      </div>

      {(spec.measurements || spec.checklist || spec.fields?.length) && (
        <div className="card" style={{ marginTop: 12, background: 'var(--surface-2)' }}>
          <div className="row between"><h3 style={{ margin: 0 }}>Checklist & details</h3><button className="btn small" onClick={fillDemo}>Fill demo values <span className="mock">DEMO</span></button></div>
          {spec.measurements?.map((m: any) => (
            <div key={m.key} style={{ marginTop: 8 }}>
              <label className="small">{m.label} ({m.unit}, expected {m.min}–{m.max})</label>
              <input type="number" inputMode="numeric" value={measure[m.key] ?? ''} onChange={e => setMeasure({ ...measure, [m.key]: e.target.value })} />
            </div>
          ))}
          {spec.checklist?.map((c: string) => (
            <label key={c} className="chk"><input type="checkbox" checked={!!checks[c]} onChange={e => setChecks({ ...checks, [c]: e.target.checked })} /><span>{c}</span></label>
          ))}
          {spec.fields?.map((f: any) => (
            <div key={f.key} style={{ marginTop: 8 }}>
              <label className="small">{f.label}</label>
              {f.key === 'qcResult' ? (
                <select value={fields[f.key] ?? ''} onChange={e => setFields({ ...fields, [f.key]: e.target.value })}><option value="">Choose…</option><option value="pass">PASS</option><option value="fail">FAIL</option></select>
              ) : f.key === 'rating' ? (
                <select value={fields[f.key] ?? ''} onChange={e => setFields({ ...fields, [f.key]: e.target.value })}><option value="">Choose…</option>{[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{'★'.repeat(n)}</option>)}</select>
              ) : (
                <input type="text" value={fields[f.key] ?? ''} onChange={e => setFields({ ...fields, [f.key]: e.target.value })} />
              )}
            </div>
          ))}
          {fields.qcResult === 'fail' && (
            <div style={{ marginTop: 8 }}><label className="small">Snags found (one per line)</label><textarea rows={3} value={fields.snags ?? ''} onChange={e => setFields({ ...fields, snags: e.target.value })} /></div>
          )}
          <button className="btn primary" style={{ marginTop: 10 }} onClick={saveDetails}>Save checklist & details</button>
        </div>
      )}

      {spec.signature && !hasKind(w, 'signature') && (
        <div style={{ marginTop: 12 }}><h3>Sign here</h3><SignaturePad onDone={d => q('signature', { dataUrl: d }, { label: `Signed by ${me.name}` })} /></div>
      )}

      {photos.length > 0 && <div className="thumbs" style={{ marginTop: 10 }}>{photos.map(p => <React.Fragment key={p.id}><EvidenceImage id={p.id} alt={p.label ?? ''} /></React.Fragment>)}</div>}

      {(pending.length > 0 || !online) && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="row between"><b>On this device</b>{!online && <span className="pill warn">OFFLINE — evidence is saved and will sync</span>}</div>
          {pending.map(i => <div key={i.id} className="row between small" style={{ padding: '4px 0' }}><span>{i.payload.kind}{i.payload.label ? ` · ${i.payload.label}` : ''}</span><StatusPill status={labelOf(i)} /></div>)}
          {outbox.failed > 0 && <button className="btn" onClick={() => retryFailed()}>Retry failed sync</button>}
        </div>
      )}
      {w.evidence.length > 0 && <p className="small muted">{w.evidence.length} item(s) <StatusPill status="SYNCED" /></p>}

      {result && result.outcome !== 'PASS' && (
        <div className="card" style={{ marginTop: 12, background: result.outcome === 'FLAG' ? 'var(--warn-bg)' : 'var(--bad-bg)' }}>
          <b>{result.outcome === 'INCOMPLETE' ? 'Not submitted — still missing:' : result.outcome === 'FAIL' ? 'Evidence rejected:' : 'Flagged for review:'}</b>
          <ul>{(result.missing ?? result.validation?.reasons ?? []).map((x: string) => <li key={x}>{x}</li>)}</ul>
        </div>
      )}
      <button className="btn primary big" style={{ marginTop: 12 }} disabled={busy || outbox.pending > 0 || !online} onClick={submit}>
        {outbox.pending > 0 ? `Waiting for ${outbox.pending} item(s) to sync…` : !online ? 'Submit when back online' : 'SUBMIT FOR VALIDATION'}
      </button>
    </div>
  );
}

/** Customer: their project(s), current stage, next milestone, money, proof. */
export function CustomerPage({ me }: { me: Me }) {
  const { data } = useLive<{ projects: any[] }>('/my/projects');
  const work = useLive<MyWork>('/my/work');
  if (!data || !work.data) return <div className="wrap narrow"><p className="muted">Loading…</p></div>;
  return (
    <div className="wrap narrow">
      <div className="card hero"><div className="muted small">{greeting()}</div><h1 style={{ margin: 0 }}>{me.name}</h1><div className="muted">{me.org}</div></div>
      {work.data.work.map(w => (
        <div key={w.id} style={{ marginTop: 12 }}>
          <div className="muted small" style={{ fontWeight: 600, margin: '6px 0' }}>YOUR ACTION NEEDED</div>
          <WorkCard w={w} me={me} onChange={() => { work.reload(); }} onDone={l => toast(`✓ ${l}`)} />
        </div>
      ))}
      {data.projects.map(p => (
        <div key={p.id} className="card" style={{ marginTop: 12 }}>
          <div className="row between"><h2 style={{ margin: 0 }}>{p.title}</h2><span className="pill info">{p.stateLabel}</span></div>
          <div className="muted small">{p.id} · {p.address}</div>
          <div style={{ margin: '12px 0 4px' }}><Progress value={p.progress} /></div>
          <div className="small muted">{p.progress}% complete{p.nextMilestone && <> · Next milestone: <b>{p.nextMilestone}</b></>}</div>
          {p.currentStep && <p><b>Now:</b> {p.currentStep.label} — {p.currentStep.by}{p.currentStep.deadline && <span className="muted"> · by {p.currentStep.deadline}</span>}</p>}
          {p.quote && (
            <>
              <h3 style={{ marginTop: 12 }}>Payments</h3>
              <table className="small"><tbody>
                <tr><td>Contract value</td><td style={{ textAlign: 'right' }}><b>{inr(p.quote.total)}</b></td><td /></tr>
                {p.payments.map((x: any) => <tr key={x.id}><td>{x.milestone}</td><td style={{ textAlign: 'right' }}>{inr(x.amount)}</td><td><StatusPill status={x.status} /></td></tr>)}
              </tbody></table>
            </>
          )}
          {p.evidence.length > 0 && (
            <>
              <h3 style={{ marginTop: 12 }}>Work proof</h3>
              <div className="thumbs">{p.evidence.map((e: any) => <React.Fragment key={e.id}><EvidenceImage id={e.id} alt={`${e.stage}: ${e.label}`} /></React.Fragment>)}</div>
            </>
          )}
          <details style={{ marginTop: 12 }}>
            <summary>Timeline ({p.timeline.length})</summary>
            <ul className="timeline">{p.timeline.slice().reverse().map((t: any, i: number) => <li key={i}><span className="muted">{t.at}</span><span>{t.who}</span><span>{t.text}</span></li>)}</ul>
          </details>
        </div>
      ))}
      {data.projects.length === 0 && <div className="card"><p className="muted">No projects yet.</p></div>}
      <Notifications items={work.data.notifications} />
    </div>
  );
}
