/**
 * MVP UI kit: small, scoped pieces built on the Owner's reference
 * (docs/mvp/design/order-view-conversation/DESIGN_NOTES.md): dark
 * surfaces, gold accents, coloured update cards. Tokens are local to MVP
 * screens; the global theme in src/index.css is untouched.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Circle, Loader2, Paperclip } from 'lucide-react';
import type { User } from '../../types';
import { resolveEnvironment } from '../../lib/environment';
import { MVP_STAGES, type Evidence, type Health, type MvpActor, type MvpRole, type MvpStage } from '../types';
import { STAGE_LABELS, stageIndex } from '../stage';
import type { ServiceCtx } from '../service';
import { evidenceUrl, uploadEvidence } from './evidence';

export const C = {
  page: '#060F14',
  deep: '#02090C',
  panel: '#0A131B',
  panel2: '#0E181F',
  line: 'rgba(230,196,115,0.18)',
  gold: '#E6C473',
  goldBtn: '#D9AC5C',
  goldTint: '#272112',
  green: '#099F66',
  text: '#E8ECEF',
  muted: '#93A1AD',
  card: { neutral: '#FAFAFA', info: '#DBE9FB', action: '#FABEC3', done: '#D2FBE7', money: '#FAEFD3', amc: '#F0EAFF' },
};
export type CardTone = keyof typeof C.card;

export function toActor(user: User): MvpActor {
  return {
    id: user.id,
    role: user.role as MvpRole,
    name: user.name,
    customerId: (user as any).customerId,
    isDemo: user.isDemo,
    authMethod: user.authMethod,
  };
}

/** Service context for the signed-in user; `customerOverride` is demo-only (see MvpOrders). */
export function useServiceCtx(user: User, customerOverride?: string): ServiceCtx {
  return useMemo(() => {
    const actor = toActor(user);
    if (customerOverride && user.isDemo) actor.customerId = customerOverride;
    return { repo: { environment: resolveEnvironment(user), actorUserId: user.id }, actor };
  }, [user, customerOverride]);
}

/** Runs one service command with pending/error state; blocks double submits. */
export function useAction(onDone?: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const run = useCallback(async (fn: () => Promise<unknown>, okMessage?: string) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone?.();
      if (okMessage) toast(okMessage);
      return true;
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setError(String((err as any)?.code ?? '').includes('permission-denied') ? 'You do not have access to do this.' : raw);
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [onDone]);
  return { busy, error, run, setError };
}

export function useLoader<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load().then(
      d => { if (!cancelled) { setData(d); setError(null); } },
      e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); },
    ).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick(t => t + 1) };
}

export function toast(message: string) {
  try { window.dispatchEvent(new CustomEvent('aiec_toast', { detail: message })); } catch { /* no window in checks */ }
}

export const Screen: React.FC<{ title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }> = ({ title, subtitle, right, children }) => (
  <div className="rounded-3xl p-3 sm:p-5 pb-24 space-y-4 min-h-[70vh]" style={{ background: C.page, color: C.text }}>
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h1 className="font-serif text-xl sm:text-2xl font-bold" style={{ color: C.text }}>{title}</h1>
        {subtitle && <p className="text-xs" style={{ color: C.muted }}>{subtitle}</p>}
      </div>
      {right}
    </div>
    {children}
  </div>
);

export const Panel: React.FC<{ title?: React.ReactNode; className?: string; children: React.ReactNode; right?: React.ReactNode }> = ({ title, className = '', children, right }) => (
  <section className={`rounded-2xl p-4 space-y-3 ${className}`} style={{ background: C.panel, border: `1px solid ${C.line}` }}>
    {(title || right) && (
      <div className="flex items-center justify-between gap-2">
        {title && <h2 className="text-sm font-bold tracking-wide" style={{ color: C.text }}>{title}</h2>}
        {right}
      </div>
    )}
    {children}
  </section>
);

export const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'gold' | 'ghost' | 'danger' | 'green'; busy?: boolean }> = ({ tone = 'gold', busy, children, className = '', disabled, ...rest }) => {
  const styles: Record<string, React.CSSProperties> = {
    gold: { background: C.goldBtn, color: '#1A1206' },
    ghost: { background: 'transparent', color: C.text, border: `1px solid ${C.line}` },
    danger: { background: '#C0392B', color: 'white' },
    green: { background: C.green, color: 'white' },
  };
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={`min-h-[44px] px-4 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E6C473] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${className}`}
      style={styles[tone]}
    >
      {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
};

const inputStyle: React.CSSProperties = { background: C.deep, color: C.text, border: `1px solid ${C.line}` };

export const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
  <label className="block space-y-1">
    <span className="text-xs font-semibold" style={{ color: C.muted }}>{label}</span>
    {children}
    {hint && <span className="block text-[11px]" style={{ color: C.muted }}>{hint}</span>}
  </label>
);

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input {...props} className={`w-full min-h-[44px] rounded-xl px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E6C473] ${props.className ?? ''}`} style={inputStyle} />
);
export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => (
  <textarea rows={3} {...props} className={`w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E6C473] ${props.className ?? ''}`} style={inputStyle} />
);
export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
  <select {...props} className={`w-full min-h-[44px] rounded-xl px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E6C473] ${props.className ?? ''}`} style={inputStyle} />
);

export const ErrorText: React.FC<{ error: string | null }> = ({ error }) =>
  error ? (
    <div role="alert" className="flex items-start gap-2 rounded-xl px-3 py-2 text-sm" style={{ background: '#3B1418', color: '#FFC9CE' }}>
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> <span>{error}</span>
    </div>
  ) : null;

export const Loading: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div className="flex items-center gap-2 text-sm py-6 justify-center" style={{ color: C.muted }} role="status">
    <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> {label}
  </div>
);

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-sm text-center py-6" style={{ color: C.muted }}>{children}</p>
);

const HEALTH_STYLE: Record<Health, { bg: string; fg: string; label: string }> = {
  ON_TRACK: { bg: '#0B3D2A', fg: '#7BE3B0', label: 'On track' },
  AT_RISK: { bg: '#3D3110', fg: '#F5D27A', label: 'At risk' },
  OVERDUE: { bg: '#3D1414', fg: '#FF9A9A', label: 'Overdue' },
  BLOCKED: { bg: '#3D1414', fg: '#FF9A9A', label: 'Blocked' },
  ON_HOLD: { bg: '#25303A', fg: '#C5D0DA', label: 'On hold' },
};
export const HealthBadge: React.FC<{ health: Health }> = ({ health }) => {
  const s = HEALTH_STYLE[health];
  return <span className="text-[11px] font-bold px-2 py-1 rounded-full whitespace-nowrap" style={{ background: s.bg, color: s.fg }}>{s.label}</span>;
};

export const Pill: React.FC<{ children: React.ReactNode; tone?: 'green' | 'gold' | 'grey' | 'red' }> = ({ children, tone = 'green' }) => {
  const m = { green: ['#0B3D2A', '#7BE3B0'], gold: [C.goldTint, C.gold], grey: ['#25303A', '#C5D0DA'], red: ['#3D1414', '#FF9A9A'] }[tone];
  return <span className="text-[11px] font-bold px-2 py-1 rounded-full whitespace-nowrap" style={{ background: m[0], color: m[1] }}>{children}</span>;
};

/** The 10 MVP stages as a numbered rail: done in gold, current with a gold ring (reference image). */
export const StageRail: React.FC<{ stage: MvpStage; completed?: boolean }> = ({ stage, completed }) => {
  const current = stageIndex(stage);
  return (
    <ol className="flex gap-1 overflow-x-auto pb-1" aria-label="Order stages">
      {MVP_STAGES.map((s, i) => {
        const done = i < current || (completed && i === current);
        const isCurrent = i === current && !completed;
        return (
          <li key={s} className="flex flex-col items-center min-w-[64px] flex-1" aria-current={isCurrent ? 'step' : undefined}>
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
              style={{
                background: done ? C.gold : isCurrent ? C.goldTint : C.panel2,
                color: done ? '#1A1206' : isCurrent ? C.gold : C.muted,
                border: isCurrent ? `2px solid ${C.gold}` : `1px solid ${C.line}`,
              }}
            >
              {done ? <CheckCircle2 className="w-4 h-4" aria-hidden /> : i + 1}
            </span>
            <span className="text-[10px] mt-1 text-center leading-tight" style={{ color: isCurrent ? C.gold : C.muted }}>{STAGE_LABELS[s]}</span>
          </li>
        );
      })}
    </ol>
  );
};

export const ProgressBar: React.FC<{ value: number }> = ({ value }) => (
  <div className="h-2 rounded-full overflow-hidden" style={{ background: C.panel2 }} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
    <div className="h-full rounded-full" style={{ width: `${value}%`, background: C.gold }} />
  </div>
);

/** Camera/file picker that uploads one photo (or PDF) and hands back the stored Evidence. */
export const PhotoInput: React.FC<{ ctx: ServiceCtx; orderKey: string; onAdd: (e: Evidence) => void; label?: string; accept?: string }> = ({ ctx, orderKey, onAdd, label = 'Add photo', accept = 'image/*' }) => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const id = useMemo(() => `ph_${Math.random().toString(36).slice(2)}`, []);
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="min-h-[44px] px-3 rounded-xl text-sm inline-flex items-center gap-2 cursor-pointer" style={{ border: `1px dashed ${C.gold}`, color: C.gold }}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : accept.includes('pdf') ? <Paperclip className="w-4 h-4" aria-hidden /> : <Camera className="w-4 h-4" aria-hidden />}
        {busy ? 'Uploading…' : label}
      </label>
      <input
        id={id}
        type="file"
        accept={accept}
        capture={accept === 'image/*' ? 'environment' : undefined}
        className="sr-only"
        onChange={async e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          setErr(null);
          try {
            onAdd(await uploadEvidence(ctx.repo.environment, orderKey, ctx.actor.id, file));
          } catch (x) {
            setErr(x instanceof Error ? x.message : String(x));
          } finally {
            setBusy(false);
          }
        }}
      />
      <ErrorText error={err} />
    </div>
  );
};

export const EvidenceThumbs: React.FC<{ items: Evidence[] }> = ({ items }) => {
  if (!items?.length) return null;
  return (
    <div className="flex gap-2 flex-wrap">
      {items.map(e => <Thumb key={e.path} e={e} />)}
    </div>
  );
};

const Thumb: React.FC<{ e: Evidence }> = ({ e }) => {
  const [url, setUrl] = useState<string | null>(e.dataUrl ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (url) return;
    evidenceUrl(e).then(setUrl, () => setFailed(true));
  }, [e, url]);
  if (e.contentType === 'application/pdf') {
    return <a href={url ?? '#'} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: C.gold }}>📄 {e.name ?? 'Document'}</a>;
  }
  if (failed) return <span className="text-[10px]" style={{ color: C.muted }}>photo unavailable</span>;
  return url ? (
    <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={e.name ?? 'Evidence photo'} className="w-16 h-16 object-cover rounded-lg" loading="lazy" /></a>
  ) : <span className="w-16 h-16 rounded-lg inline-block" style={{ background: C.panel2 }} aria-label="Loading photo" />;
};

export const Check: React.FC<{ done: boolean }> = ({ done }) =>
  done ? <CheckCircle2 className="w-5 h-5" style={{ color: '#2ECC71' }} aria-label="done" /> : <Circle className="w-5 h-5" style={{ color: C.muted }} aria-label="not done" />;

/** Date input value (local) ↔ ISO helpers. */
export const toDateInput = (iso?: string) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
export const fromDateInput = (v: string, hourIst = 18) => new Date(`${v}T${String(hourIst).padStart(2, '0')}:00:00+05:30`).toISOString();
