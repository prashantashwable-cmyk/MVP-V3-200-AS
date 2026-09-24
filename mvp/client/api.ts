/** Thin API client. Session token lives in sessionStorage so each browser
 * TAB can be a different user (Admin in one tab, Technician in another). */
import { useCallback, useEffect, useRef, useState } from 'react';

const TOKEN_KEY = 'aiec-mvp-token';
const USER_KEY = 'aiec-mvp-user';

export interface Me { id: string; name: string; role: 'admin' | 'technician' | 'customer' | 'supplier'; org?: string }

function store(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}

export function getSession(): { token: string; user: Me } | null {
  try {
    const s = store();
    const token = s?.getItem(TOKEN_KEY);
    const user = s?.getItem(USER_KEY);
    return token && user ? { token, user: JSON.parse(user) } : null;
  } catch { return null; }
}

export function setSession(token: string, user: Me): void {
  try { store()?.setItem(TOKEN_KEY, token); store()?.setItem(USER_KEY, JSON.stringify(user)); } catch { /* private mode: session lasts until reload */ }
  memToken = token;
}

export function clearSession(): void {
  try { store()?.removeItem(TOKEN_KEY); store()?.removeItem(USER_KEY); } catch { /* ignore */ }
  memToken = null;
}

let memToken: string | null = null;
const token = () => memToken ?? getSession()?.token ?? null;

export class ApiError extends Error {
  constructor(public status: number, public body: any) { super(body?.message ?? `HTTP ${status}`); }
}

/** Returns status + body without throwing on 4xx (for submit/pay, where 422/402 are outcomes). */
export async function apiRaw<T = any>(path: string, method = 'GET', body?: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;
  if (res.status === 401 && path !== '/login') {
    clearSession();
    window.dispatchEvent(new Event('aiec-logout'));
  }
  return { status: res.status, body: parsed };
}

export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await apiRaw<T>(path, method, body);
  if (r.status >= 400) throw new ApiError(r.status, r.body);
  return r.body;
}

export async function fetchBlobUrl(path: string): Promise<string> {
  const res = await fetch(`/api${path}`, { headers: token() ? { Authorization: `Bearer ${token()}` } : {} });
  if (!res.ok) throw new ApiError(res.status, null);
  return URL.createObjectURL(await res.blob());
}

/**
 * Live data: polls the cheap /api/sync change counter every 2.5s and
 * refetches only when something changed anywhere. Multi-user updates
 * appear within a few seconds without a manual refresh.
 */
export function useLive<T>(path: string | null, intervalMs = 2500): { data: T | undefined; error: string | null; reload: () => Promise<void> } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const seq = useRef<number>(-1);
  const load = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [path]);

  useEffect(() => {
    seq.current = -1;
    let alive = true;
    const poll = async () => {
      try {
        const s = await api<{ seq: number }>('/sync');
        if (alive && s.seq !== seq.current) { seq.current = s.seq; await load(); }
      } catch { /* offline: keep last data */ }
    };
    poll();
    const t = setInterval(poll, intervalMs);
    return () => { alive = false; clearInterval(t); };
  }, [load, intervalMs]);

  return { data, error, reload: load };
}
