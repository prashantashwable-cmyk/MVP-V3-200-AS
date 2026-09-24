/**
 * Admin CONTROL TOWER — Admin manages exceptions, not tasks.
 */
import React, { useState } from 'react';
import { api, useLive } from './api';
import { ask, EvidenceImage, HealthPill, Notifications, Progress, StatusPill, inr, toast } from './ui';

type Tab = 'tower' | 'health' | 'improve' | 'users' | 'demo';

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('tower');
  const [open, setOpen] = useState<string | null>(null);
  const tower = useLive<any>('/admin/tower');
  const kpis = useLive<any>('/admin/kpis');
  const t = tower.data, k = kpis.data;
  return (
    <div className="wrap">
      <div className="row between">
        <div>
          <h1 style={{ margin: 0 }}>Control Tower</h1>
          <div className="muted small">Business time {t?.now ?? '…'}{t && t.clockOffset !== '0m' && <> · <span className="mock">DEMO CLOCK +{t.clockOffset}</span></>}</div>
        </div>
        <DemoQuickStart onStarted={id => setOpen(id)} />
      </div>

      <div className="grid kpis" style={{ marginTop: 12 }}>
        <Kpi v={t?.counts.active} l={`Active projects${t ? ` · ${t.counts.completed} completed` : ''}`} />
        <Kpi v={t?.counts.autoRunning} l="Moving automatically" tone="ok" />
        <Kpi v={t?.counts.waitingForUser} l="System recovering" tone="warn" />
        <Kpi v={t?.counts.adminActionsRequired} l="Admin actions required" tone={t?.counts.adminActionsRequired ? 'bad' : undefined} />
        <Kpi v={k ? `${k.automationRate}%` : undefined} l="Automation rate" />
        <Kpi v={k?.adminInterventionsPerProject} l="Admin interventions / project" />
      </div>

      <div className="tabs" role="tablist">
        {([['tower', 'Exceptions & projects'], ['health', 'Workflow health'], ['improve', 'Automation improvement'], ['users', 'People'], ['demo', 'Demo controls']] as [Tab, string][]).map(([id, l]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>

      {tab === 'tower' && t && <Tower t={t} onOpen={setOpen} />}
      {tab === 'health' && <Health />}
      {tab === 'improve' && k && <Improve k={k} />}
      {tab === 'users' && <People />}
      {tab === 'demo' && <DemoPanel projects={t?.projects ?? []} onOpen={setOpen} />}
      {open && <ProjectSheet id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Kpi({ v, l, tone }: { v: any; l: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone ? `var(--${tone})` : undefined;
  return <div className="card kpi"><div className="v" style={{ color }}>{v ?? '…'}</div><div className="l">{l}</div></div>;
}

function Tower({ t, onOpen }: { t: any; onOpen: (id: string) => void }) {
  return (
    <>
      <h2>Exceptions {t.exceptions.length === 0 && <span className="pill ok">None — everything is moving</span>}</h2>
      {t.violations.map((v: any) => <div key={v.projectId} className="card exc critical"><b>🔴 {v.detail}</b></div>)}
      {t.exceptions.map((x: any) => (
        <div key={x.id} className={`card exc ${x.health}`} style={{ cursor: 'pointer' }} onClick={() => onOpen(x.id)}>
          <div className="row between">
            <b>{x.health === 'critical' ? '🔴' : '🟠'} {x.id} — {x.why.workItem?.label ?? x.stateLabel}</b>
            <HealthPill health={x.health} />
          </div>
          <div className="muted small">{x.title}</div>
          <p style={{ margin: '6px 0' }}>{x.why.reason}</p>
          <dl className="why small">
            <dt>Owner</dt><dd>{x.why.owner ? `${x.why.owner.name} (${x.why.owner.role})` : 'ADMIN — nobody eligible'}</dd>
            <dt>Waiting</dt><dd>{x.why.waiting}</dd>
            <dt>Last system action</dt><dd>{x.why.lastSystemAction ? `${x.why.lastSystemAction.text} (${x.why.lastSystemAction.ago} ago)` : '—'}</dd>
            <dt>Next automatic action</dt><dd>{x.why.nextAutomaticAction ? `${x.why.nextAutomaticAction.text} in ${x.why.nextAutomaticAction.in}` : 'None — waiting for Admin'}</dd>
            <dt>Admin</dt><dd><b style={{ color: x.why.adminRequired ? 'var(--bad)' : 'var(--ok)' }}>{x.why.adminVerdict}</b></dd>
          </dl>
        </div>
      ))}

      <h2 style={{ marginTop: 20 }}>All projects</h2>
      <div className="card scroll-x" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Project</th><th>State</th><th className="hide-sm">Current work → owner</th><th className="hide-sm">Deadline</th><th className="hide-sm">System will</th><th>Health</th></tr></thead>
          <tbody>
            {t.projects.map((p: any) => (
              <tr key={p.id} className="click" onClick={() => onOpen(p.id)}>
                <td><b>{p.id}</b><div className="muted small">{p.title}</div></td>
                <td>{p.stateLabel}<div style={{ width: 90, marginTop: 4 }}><Progress value={p.progress} /></div></td>
                <td className="hide-sm">{p.current ? <>{p.current.label} <StatusPill status={p.current.status} /><div className="muted small">{p.current.owner}</div></> : '—'}</td>
                <td className="hide-sm small">{p.deadline ?? '—'}{p.deadlineIn && <div className="muted">{p.deadlineIn.startsWith('-') ? `${p.deadlineIn.slice(1)} late` : `in ${p.deadlineIn}`}</div>}</td>
                <td className="hide-sm small muted">{p.next ?? '—'}</td>
                <td><HealthPill health={p.health} /></td>
              </tr>
            ))}
            {t.projects.length === 0 && <tr><td colSpan={6} className="muted">No projects yet. Use ▶ START DEMO or Demo controls → Create project.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ProjectSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, reload } = useLive<any>(`/admin/projects/${encodeURIComponent(id)}`);
  const users = useLive<any[]>('/admin/users');
  if (!data) return <div className="modal" onClick={onClose}><div className="sheet"><p>Loading…</p></div></div>;
  const { project: p, why, items, payments, events } = data;
  return (
    <div className="modal" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label={`Project ${p.id}`}>
        <div className="row between"><h1 style={{ margin: 0 }}>{p.id}</h1><button className="btn" onClick={onClose}>Close</button></div>
        <div className="muted">{p.title} · {p.address}</div>
        <div className="small muted">Customer {p.customer?.name} {p.customer?.phone} · Quote {inr(p.quoteTotal)} · Installer {p.installer ?? '—'}</div>
        <div style={{ margin: '10px 0' }}><Progress value={p.progress} /></div>

        <div className={`card exc ${why.health}`}>
          <div className="row between"><h2 style={{ margin: 0 }}>Why is this where it is?</h2><HealthPill health={why.health} /></div>
          <dl className="why">
            <dt>Project</dt><dd>{p.id}</dd>
            <dt>Current state</dt><dd>{why.stateLabel}</dd>
            <dt>Current work item</dt><dd>{why.workItem ? <>{why.workItem.id} · {why.workItem.label} <StatusPill status={why.workItem.status} /></> : '—'}</dd>
            <dt>Owner</dt><dd>{why.owner ? `${why.owner.name} (${why.owner.role}) ${why.owner.phone ?? ''}` : 'ADMIN'}</dd>
            <dt>Expected action</dt><dd>{why.expectedAction}</dd>
            <dt>Time waiting</dt><dd>{why.waiting}{why.deadline && <> · deadline {why.deadline}</>}</dd>
            <dt>Last system action</dt><dd>{why.lastSystemAction ? `${why.lastSystemAction.text} — ${why.lastSystemAction.ago} ago` : '—'}</dd>
            <dt>Next automatic action</dt><dd>{why.nextAutomaticAction ? `${why.nextAutomaticAction.text} at ${why.nextAutomaticAction.at} (in ${why.nextAutomaticAction.in})` : 'None'}</dd>
            <dt>Escalation rule</dt><dd className="small">{why.escalationCondition ?? '—'}</dd>
            <dt>Reason</dt><dd><b>{why.reason}</b></dd>
            <dt>Admin</dt><dd><b style={{ color: why.adminRequired ? 'var(--bad)' : 'var(--ok)' }}>{why.adminVerdict}</b></dd>
          </dl>
          {why.adminOptions.length > 0 && <AdminActions why={why} users={users.data ?? []} projectId={p.id} onDone={reload} />}
        </div>

        <h2 style={{ marginTop: 16 }}>Work items</h2>
        {items.map((w: any) => (
          <details key={w.id} className="card">
            <summary className="row between"><span><b>{w.id}</b> {w.label}</span><span className="row"><StatusPill status={w.status} /><span className="small muted">{w.owner}</span></span></summary>
            <div className="small" style={{ marginTop: 8 }}>
              Created {w.createdAt}{w.completedAt && <> · completed {w.completedAt}</>} · retries {w.retryCount} · reassigned {w.reassignCount}
              {w.earning > 0 && <> · earning {inr(w.earning)} ({w.payout.replace(/_/g, ' ')})</>}
            </div>
            {w.validation && (
              <div style={{ marginTop: 8 }}>
                <StatusPill status={w.validation.outcome} /> <span className="small muted">validator: rules + {w.validation.cv.analyzer}</span>
                <ul className="small">{w.validation.checks.map((c: any, i: number) => <li key={i}>{c.ok ? '✓' : '✗'} {c.name}: {c.detail}</li>)}</ul>
              </div>
            )}
            {w.evidence.length > 0 && (
              <div className="small">
                <div className="thumbs">{w.evidence.filter((e: any) => e.kind === 'photo' || e.kind === 'signature').map((e: any) => <span key={e.id} style={{ opacity: e.superseded ? 0.35 : 1 }} title={e.superseded ? 'superseded' : ''}><EvidenceImage id={e.id} /></span>)}</div>
                {w.evidence.filter((e: any) => e.value !== undefined).map((e: any) => <div key={e.id} style={{ opacity: e.superseded ? 0.5 : 1 }}>{e.id} {e.kind}{e.superseded && ' (superseded)'}: <code>{JSON.stringify(e.value)}</code></div>)}
              </div>
            )}
          </details>
        ))}

        <h2 style={{ marginTop: 16 }}>Payments</h2>
        <div className="card"><table className="small"><tbody>
          {payments.map((x: any) => <tr key={x.id}><td>{x.id}</td><td>{x.milestone}</td><td>{inr(x.amount)}</td><td><StatusPill status={x.status} /></td><td className="muted">{x.gateway_ref ?? x.failure_reason ?? ''}</td></tr>)}
          {payments.length === 0 && <tr><td className="muted">No payment due yet.</td></tr>}
        </tbody></table>
          <p className="small muted" style={{ marginBottom: 0 }}>Payment status can only change through the gateway or an audited offline-payment record. There is no edit button, by design.</p>
        </div>

        <h2 style={{ marginTop: 16 }}>Audit trail <span className="muted small">(immutable)</span></h2>
        <ul className="timeline card">
          {events.map((e: any) => (
            <li key={e.id} className={e.actorType === 'ADMIN' ? 'admin' : ''}>
              <span className="muted">{e.at}</span>
              <span><b>{e.actorType === 'SYSTEM' ? 'SYSTEM' : e.actor}</b></span>
              <span>{e.detail}{e.intervention && <span className="pill warn" style={{ marginLeft: 6 }}>intervention: {e.cause}</span>}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AdminActions({ why, users, projectId, onDone }: { why: any; users: any[]; projectId: string; onDone: () => void }) {
  const [to, setTo] = useState('');
  const w = why.workItem;
  const run = async (path: string, body: unknown, ok: string) => {
    try { await api(path, 'POST', body); toast(ok); } catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { onDone(); }
  };
  const opts: string[] = why.adminOptions;
  return (
    <div className="card" style={{ marginTop: 12, background: 'var(--surface-2)' }}>
      <h3>Intervene <span className="muted small">(each action is counted as an Admin intervention)</span></h3>
      <div className="grid" style={{ gap: 8 }}>
        {opts.includes('assign') && (
          <div className="row">
            <select value={to} onChange={e => setTo(e.target.value)} style={{ maxWidth: 260 }}>
              <option value="">Assign to…</option>
              {why.candidates.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn" disabled={!to} onClick={async () => { const a = await ask('Assign work', [{ key: 'reason', label: 'Reason', value: 'Admin decision' }], { confirm: 'Assign' }); if (a) run(`/admin/work/${w.id}/assign`, { userId: to, reason: a.reason }, 'Assigned'); }}>Assign</button>
          </div>
        )}
        <div className="row">
          {opts.includes('extend') && <button className="btn" onClick={async () => { const a = await ask('Extend deadline', [{ key: 'hours', label: 'Extra hours', value: '24', type: 'number' }, { key: 'reason', label: 'Reason', value: 'Called customer' }], { confirm: 'Extend' }); if (a && Number(a.hours) > 0) run(`/admin/work/${w.id}/extend`, { minutes: Number(a.hours) * 60, reason: a.reason }, 'Deadline extended'); }}>Extend deadline</button>}
          {opts.includes('approve_flag') && <button className="btn primary" onClick={async () => { const a = await ask('Approve flagged evidence', [{ key: 'note', label: 'Approval note', value: '' }], { confirm: 'Approve' }); if (a) run(`/admin/work/${w.id}/review`, { approve: true, note: a.note }, 'Approved'); }}>Approve flagged evidence</button>}
          {opts.includes('reject_flag') && <button className="btn danger" onClick={async () => { const a = await ask('Reject evidence', [{ key: 'note', label: 'What must be redone?', value: '' }], { confirm: 'Send back' }); if (a) run(`/admin/work/${w.id}/review`, { approve: false, note: a.note }, 'Sent back'); }}>Reject evidence</button>}
          {opts.includes('offline_payment') && <button className="btn" onClick={async () => { const a = await ask('Record offline payment', [{ key: 'ref', label: 'NEFT / UTR / cheque reference', value: '' }], { confirm: 'Record payment' }); if (a?.ref.trim()) run(`/admin/work/${w.id}/offline-payment`, { reference: a.ref }, 'Offline payment recorded'); }}>Record offline payment</button>}
          {opts.includes('complete_lead') && <button className="btn" onClick={async () => {
            const a = await ask('Complete lead details', [
              { key: 'lat', label: 'Site latitude', value: '18.5204', type: 'number' },
              { key: 'lng', label: 'Site longitude', value: '73.8567', type: 'number' },
              { key: 'floors', label: 'Floors', value: '4', type: 'number' },
              { key: 'phone', label: 'Customer phone (if missing)', value: '' },
              { key: 'address', label: 'Site address (if missing)', value: '' },
            ], { confirm: 'Save' });
            if (a) run(`/admin/projects/${projectId}/lead`, { lat: Number(a.lat), lng: Number(a.lng), floors: Number(a.floors), customerPhone: a.phone || undefined, siteAddress: a.address || undefined }, 'Lead updated');
          }}>Complete lead details</button>}
        </div>
      </div>
    </div>
  );
}

function Health() {
  const { data } = useLive<any>('/admin/health');
  if (!data) return <p className="muted">Loading…</p>;
  const c = data.catalog;
  const tone = (s: string) => (s === 'ok' ? 'ok' : s === 'partial' ? 'warn' : s === 'missing' ? 'bad' : '');
  return (
    <>
      <div className="grid kpis">
        <Kpi v={`${c.overall}%`} l="Overall automation readiness" />
        {c.byGroup.map((g: any) => <React.Fragment key={g.group}><Kpi v={`${g.pct}%`} l={g.group} /></React.Fragment>)}
      </div>
      {(c.stateProblems.length > 0 || data.invariants.length > 0) && (
        <div className="card exc critical" style={{ marginTop: 12 }}>
          <b>Automation exceptions</b>
          <ul>{[...c.stateProblems, ...data.invariants.map((v: any) => v.detail)].map((s: string) => <li key={s}>{s}</li>)}</ul>
        </div>
      )}
      <h2 style={{ marginTop: 16 }}>Top workflow gaps</h2>
      <div className="card">
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          {c.topGaps.slice(0, 12).map((g: any, i: number) => <li key={i} style={{ margin: '4px 0' }}><span className={`pill ${tone(g.status)}`}>{g.status}</span> <b>{g.task}</b> — {g.check}: <span className="muted">{g.detail}</span></li>)}
        </ol>
      </div>
      <h2 style={{ marginTop: 16 }}>Automation readiness by work type <span className="muted small">(read from the same rules the engine executes)</span></h2>
      <div className="card scroll-x" style={{ padding: 0 }}>
        <table className="small">
          <thead><tr><th>Work type</th>{c.tasks[0]?.checks.map((ch: any) => <th key={ch.check} title={ch.check} style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 130 }}>{ch.check}</th>)}<th>Score</th></tr></thead>
          <tbody>
            {c.tasks.map((t: any) => (
              <tr key={t.type}>
                <td><b>{t.label}</b><div className="muted">{t.group}</div></td>
                {t.checks.map((ch: any) => <td key={ch.check} title={ch.detail} style={{ textAlign: 'center' }}>{ch.status === 'ok' ? '✓' : ch.status === 'partial' ? '◐' : ch.status === 'na' ? '–' : <b style={{ color: 'var(--bad)' }}>✗</b>}</td>)}
                <td><b>{t.ok}{t.partial ? `+${t.partial}½` : ''} / {t.applicable}</b><div className="muted">{t.pct}%</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">✓ automated · ◐ partial (ends with a human) · – not applicable (reason on hover) · ✗ missing. Lifecycle: {data.lifecycle.states} states, {data.lifecycle.transitions} transitions, validated with V3's validateWorkflowDefinition.</p>
    </>
  );
}

function Improve({ k }: { k: any }) {
  const rows: [string, any][] = [
    ['Automation rate', `${k.automationRate}% (${k.transitions.automatic}/${k.transitions.total} transitions; ${k.transitions.systemDriven} by SYSTEM)`],
    ['Admin interventions / project', k.adminInterventionsPerProject],
    ['Orphan work items', k.orphanWorkItems],
    ['Overdue work items', k.overdueWorkItems],
    ['Average task completion', `${k.avgTaskCompletionMins} min`],
    ['Average time to escalation', `${k.avgEscalationMins} min`],
    ['Automatic reassignment rate', `${k.automaticReassignmentRate}% (${k.reassignments.automatic}/${k.reassignments.total})`],
    ['Evidence rejection rate', `${k.evidenceRejectionRate}% of ${k.evidenceValidations} validations`],
    ['Payment failures / blocks', `${k.paymentFailures} / ${k.paymentBlocks}`],
    ['Workflow failures (no rule)', k.workflowFailures],
    ['Manual overrides', k.manualOverrides],
  ];
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
      <div className="card">
        <h2>Admin interventions per project, by week</h2>
        <table className="small"><thead><tr><th>Week of</th><th>Interventions</th><th>Projects</th><th>Per project</th></tr></thead><tbody>
          {k.weekly.map((w: any) => <tr key={w.week}><td>{w.week}</td><td>{w.interventions}</td><td>{w.projects}</td><td><b>{w.perProject}</b></td></tr>)}
          {k.weekly.length === 0 && <tr><td colSpan={4} className="muted">No data yet.</td></tr>}
        </tbody></table>
        <p className="small muted">The goal of every iteration: push this number down.</p>
      </div>
      <div className="card">
        <h2>Why Admin had to step in</h2>
        <p className="muted small">{k.improvement.interventions} manual interventions in total</p>
        <ol style={{ paddingLeft: 20 }}>{k.improvement.causes.map((c: any) => <li key={c.cause}><b>{c.label}</b> — {c.count}</li>)}</ol>
        {k.improvement.causes.length === 0 && <p className="pill ok">No interventions — nothing to automate yet.</p>}
        <h3>Recommended automations</h3>
        <ol style={{ paddingLeft: 20 }}>{k.improvement.causes.map((c: any) => <li key={c.cause}>{c.recommendation}</li>)}</ol>
      </div>
      <div className="card">
        <h2>Automation KPIs</h2>
        <table className="small"><tbody>{rows.map(([l, v]) => <tr key={l}><td>{l}</td><td style={{ textAlign: 'right' }}><b>{v}</b></td></tr>)}</tbody></table>
      </div>
    </div>
  );
}

function People() {
  const { data, reload } = useLive<any[]>('/admin/users');
  if (!data) return <p className="muted">Loading…</p>;
  return (
    <div className="card scroll-x" style={{ padding: 0 }}>
      <table>
        <thead><tr><th>Name</th><th>Role</th><th>Open work</th><th>Access</th></tr></thead>
        <tbody>
          {data.map(u => (
            <tr key={u.id}>
              <td><b>{u.name}</b><div className="muted small">{u.id} · {u.org}</div></td>
              <td>{u.role}</td>
              <td>{u.openWork}</td>
              <td>{u.role !== 'admin' && (
                <button className={`btn ${u.active ? 'danger' : ''}`} onClick={async () => {
                  try { await api(`/admin/users/${u.id}/active`, 'POST', { active: !u.active }); toast(u.active ? `${u.name}'s access removed — open work reassigned automatically` : `${u.name} restored`); } catch (e) { toast(String(e)); }
                  reload();
                }}>{u.active ? 'Remove access' : 'Restore access'}</button>
              )}{!u.active && <span className="pill bad" style={{ marginLeft: 6 }}>inactive</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DemoQuickStart({ onStarted }: { onStarted: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const start = async (scenario: 'happy' | 'failures') => {
    setBusy(true);
    try {
      const r = await api<{ projectId: string }>('/admin/demo/start', 'POST', { scenario });
      toast(`Demo running on ${r.projectId}. Open other tabs as Technician / Customer / Supplier to watch.`);
      onStarted(r.projectId);
    } catch (e) { toast(String(e)); } finally { setBusy(false); }
  };
  return (
    <div className="row">
      <button className="btn primary" disabled={busy} onClick={() => start('happy')}>▶ START DEMO</button>
      <button className="btn" disabled={busy} onClick={() => start('failures')}>▶ Demo with failures</button>
    </div>
  );
}

function DemoPanel({ projects, onOpen }: { projects: any[]; onOpen: (id: string) => void }) {
  const status = useLive<any[]>('/admin/demo/status', 2000);
  const sites = useLive<any[]>('/admin/sample-sites', 60000);
  const notes = useLive<any[]>('/notifications');
  const [site, setSite] = useState(0);
  const [pid, setPid] = useState('');
  const call = async (path: string, body: unknown, ok: string) => {
    try { const r = await api<any>(path, 'POST', body); toast(ok + (r?.actions?.length ? ` — ${r.actions.length} automatic action(s)` : '')); return r; } catch (e) { toast(e instanceof Error ? e.message : String(e)); }
  };
  const active = projects.filter(p => p.health !== 'done');
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
      <div className="card">
        <h2>1 · Create a project <span className="muted small">(manual lead entry)</span></h2>
        <select value={site} onChange={e => setSite(Number(e.target.value))}>
          {(sites.data ?? []).map((s: any, i: number) => <option key={i} value={i}>{s.title} — {s.customerId}</option>)}
        </select>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={async () => { const r = await call('/admin/leads', sites.data![site], 'Lead created — the system qualified, quoted and notified the customer'); if (r) onOpen(r.id); }}>Create lead</button>
          <button className="btn" onClick={async () => { const r = await call('/admin/leads', { ...sites.data![site], lat: null, lng: null }, 'Incomplete lead created → Admin task'); if (r) onOpen(r.id); }}>Create incomplete lead</button>
        </div>
        <p className="small muted">Then log in as the customer in another tab — or let the demo bot play the users.</p>
      </div>

      <div className="card">
        <h2>2 · Demo bot <span className="mock">DEMO</span></h2>
        <p className="small muted">Plays technicians, supplier and customer through the same API rules as a human. It never acts as Admin.</p>
        <select value={pid} onChange={e => setPid(e.target.value)}><option value="">New project</option>{active.map(p => <option key={p.id} value={p.id}>{p.id} · {p.stateLabel}</option>)}</select>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={async () => { const r = await call('/admin/demo/start', { projectId: pid || undefined, scenario: 'happy' }, 'Demo started'); if (r) onOpen(r.projectId); }}>Happy path</button>
          <button className="btn" onClick={async () => { const r = await call('/admin/demo/start', { projectId: pid || undefined, scenario: 'failures' }, 'Failure demo started'); if (r) onOpen(r.projectId); }}>With failures</button>
          {pid && <button className="btn" onClick={() => call('/admin/demo/stop', { projectId: pid }, 'Stopped')}>Stop</button>}
        </div>
        {(status.data ?? []).slice().reverse().map((r: any) => (
          <div key={r.projectId} style={{ marginTop: 10 }}>
            <div className="small"><b>{r.projectId}</b> · {r.scenario} {r.done && <span className="pill ok">done</span>}</div>
            <div className="log">{r.log.slice().reverse().map((l: any, i: number) => <div key={i}>{l.at} {l.text}</div>)}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>3 · Cause failures, watch the reaction</h2>
        <p className="small muted">Fast-forward business time so SLAs expire. The scheduler then reminds, escalates and reassigns by itself.</p>
        <div className="row">
          {[30, 120, 24 * 60].map(m => <button key={m} className="btn" onClick={() => call('/admin/demo/clock', { minutes: m }, `Clock +${m >= 60 ? m / 60 + 'h' : m + 'm'}`)}>⏩ +{m >= 1440 ? '1 day' : m >= 60 ? `${m / 60}h` : `${m}m`}</button>)}
          <button className="btn" onClick={() => call('/admin/demo/tick', {}, 'Scheduler ran')}>Run scheduler now</button>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <select value={pid} onChange={e => setPid(e.target.value)}><option value="">Choose project…</option>{active.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}</select>
          <button className="btn" disabled={!pid} onClick={() => call(`/admin/demo/flags/${pid}`, { failNextPayment: true }, 'Next payment on this project will be declined')}>Fail next payment</button>
        </div>
        <ul className="small muted">
          <li>Don't accept a technician task → +2h → reminder, escalation, then reassignment.</li>
          <li>Pay with card 4000 0000 0000 0002 → payment fails; project holds safely.</li>
          <li>Submit GPS from far away / old photos → evidence rejected → retry.</li>
          <li>People → Remove access → their open work moves to someone else.</li>
          <li>Stop the server and start it again → everything resumes.</li>
        </ul>
      </div>
      <Notifications items={notes.data ?? []} />
    </div>
  );
}
