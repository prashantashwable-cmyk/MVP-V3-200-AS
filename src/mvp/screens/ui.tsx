/** Small shared pieces for MVP screens. Reuses the app's Card/Button kit and tokens. */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, OctagonAlert, PauseCircle, Loader2 } from 'lucide-react';
import type { User } from '../../types';
import { resolveEnvironment } from '../../lib/environment';
import type { MvpActor, MvpCtx } from '../services/orderService';
import type { Health } from '../health';
import { useLanguage } from '../../lib/language';
import { translateHealth, type Lang } from '../i18n';
import { tr } from '../i18nUi';

export function toMvpActor(user: User): MvpActor {
  return {
    userId: user.id, role: user.role as MvpActor['role'], isDemo: user.isDemo, authMethod: user.authMethod,
    customerId: user.customerId, name: user.name,
  };
}

export function useMvpCtx(user: User): { ctx: MvpCtx; actor: MvpActor } {
  return useMemo(() => ({
    ctx: { environment: resolveEnvironment(user), actorUserId: user.id },
    actor: toMvpActor(user),
  }), [user]);
}

/**
 * Multi-user freshness. Several people work on the same order, so screens must not stay stale:
 * every `useLoad` reloads when the person comes back to the app (tab visible again, network
 * back) and on a timer while the app is visible. Heavy screens (dashboard, owner, reports read
 * whole collections) poll less often via `every` to keep Firestore reads — and the bill — low.
 */
export const AUTO_REFRESH_MS = 60_000;
const RefreshContext = React.createContext<{ returned: number; poll: number; at: number }>({ returned: 0, poll: 0, at: 0 });

export const MvpAutoRefresh: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState({ returned: 0, poll: 0, at: Date.now() });
  useEffect(() => {
    let last = Date.now();
    const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
    const onReturn = () => {
      if (!visible() || Date.now() - last < 5_000) return; // one reload per return, not per event
      last = Date.now();
      setState(s => ({ ...s, returned: s.returned + 1, at: last }));
    };
    const timer = setInterval(() => {
      if (!visible()) return;
      last = Date.now();
      setState(s => ({ ...s, poll: s.poll + 1, at: last }));
    }, AUTO_REFRESH_MS);
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('online', onReturn);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onReturn); window.removeEventListener('online', onReturn); };
  }, []);
  return <RefreshContext.Provider value={state}>{children}</RefreshContext.Provider>;
};

/**
 * Default poll interval (in minutes) for every `useLoad` below it. The order screen sets 3:
 * it carries the photos and the full history, so reloading it every minute would cost
 * megabytes of mobile data; lists and the bell stay at 1 so hand-offs still arrive quickly.
 */
const RefreshEveryContext = React.createContext(1);
export const RefreshEvery: React.FC<{ minutes: number; children: React.ReactNode }> = ({ minutes, children }) => (
  <RefreshEveryContext.Provider value={minutes}>{children}</RefreshEveryContext.Provider>
);

/** When the shared auto-refresh last fired (for the "Updated …" label). */
export function useLastRefresh(): number {
  return React.useContext(RefreshContext).at;
}

/**
 * Loads async data with loading/error state and a `reload()` for after an action. Also reloads
 * with the shared auto-refresh: on every return to the app, and every `every` minutes while
 * visible (default 1; 0 = only on return).
 */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[], opts: { every?: number } = {}): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const refresh = React.useContext(RefreshContext);
  const scopeEvery = React.useContext(RefreshEveryContext);
  const every = opts.every ?? scopeEvery;
  const pollStep = every > 0 ? Math.floor(refresh.poll / every) : 0;
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .then(d => { if (!cancelled) { setData(d); setError(null); } })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, refresh.returned, pollStep]);
  const reload = useCallback(() => setTick(t => t + 1), []);
  return { data, error, loading, reload };
}

const HEALTH_STYLE: Record<Health, { cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  ON_TRACK: { cls: 'bg-royalemerald/10 text-royalemerald', icon: CheckCircle2 },
  AT_RISK: { cls: 'bg-[#B8873D]/15 text-[#8a6224]', icon: Clock },
  OVERDUE: { cls: 'bg-error/10 text-error', icon: AlertTriangle },
  BLOCKED: { cls: 'bg-error/15 text-error', icon: OctagonAlert },
  ON_HOLD: { cls: 'bg-charcoal/10 text-charcoal', icon: PauseCircle },
};

/** D-18: the current language, reactive to the same switch the legacy app uses. */
export function useMvpLang(): Lang {
  return useLanguage().language;
}

/** Screen text in the viewer's language (field-staff and customer screens), English fallback. */
export function useT(): (english: string) => string {
  const lang = useMvpLang();
  return useCallback((english: string) => tr(lang, english), [lang]);
}

export const HealthBadge: React.FC<{ health: Health }> = ({ health }) => {
  const lang = useMvpLang();
  const s = HEALTH_STYLE[health];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${s.cls}`}>
      <Icon className="w-3.5 h-3.5" />{translateHealth(lang, health)}
    </span>
  );
};

export const Loading: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div className="p-6 text-sm text-warmgray flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{label}</div>
);

export const ErrorNote: React.FC<{ message: string }> = ({ message }) => (
  <div role="alert" className="p-3 bg-error/10 border border-error/20 text-error text-xs rounded-xl font-medium">{message}</div>
);

export const SectionTitle: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <div className="flex items-center justify-between gap-2 mb-2">
    <h3 className="text-xs font-bold uppercase tracking-wider text-warmgray">{children}</h3>
    {right}
  </div>
);

export const ProgressBar: React.FC<{ value: number }> = ({ value }) => (
  <div className="h-2 w-full bg-alabaster rounded-full overflow-hidden" aria-label={`Progress ${value}%`}>
    <div className="h-full bg-royalemerald rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>
);

/** Runs an action, surfacing its error text; returns true on success. */
export function useAction(): { run: (fn: () => Promise<unknown>) => Promise<boolean>; busy: boolean; error: string | null; clear: () => void } {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { run, busy, error, clear: () => setError(null) };
}

export const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-[#e6dfd4] bg-white text-sm focus:outline-none focus:border-[#B8873D]';
export const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-warmgray mb-1';
