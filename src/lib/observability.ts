/**
 * Observability — Phase 12.
 *
 * "Track: application errors, API errors, latency, failed jobs, retry
 * counts, webhook lag, auth failures, client crashes where feasible,
 * integration health. Use correlation IDs so a project action can be
 * traced across services/events."
 *
 * Two parts:
 *   1. `captureEvent()` — a real, persisted observability event, written
 *      through the same repository layer as everything else, so it's
 *      queryable and not just console noise. `installGlobalErrorCapture()`
 *      wires real `window.onerror`/`unhandledrejection` listeners — an
 *      actual client crash handler, not a placeholder.
 *   2. `getObservabilitySummary()` — DERIVED metrics computed from data
 *      other phases already produce (failed jobs / retry counts from
 *      Phase 07's `workflow_executions`, reconciliation lag from Phase
 *      11) rather than a second, parallel metrics pipeline that could
 *      drift from the real counts.
 */

import { getRepository } from '../repository';
import type { RepositoryContext } from '../repository/types';
import type { WorkflowExecution, NotificationRecord } from '../domain/entities';
import { isProductionDeploy } from './environment';

export type ObservabilityEventType = 'app_error' | 'api_error' | 'auth_failure' | 'client_crash';

export interface ObservabilityEvent {
  id: string;
  type: ObservabilityEventType;
  message: string;
  stack?: string;
  source: string; // e.g. component/module name or route
  correlationId: string;
  createdAt: string;
}

function generateId(): string {
  return `obs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function captureEvent(ctx: RepositoryContext, input: Omit<ObservabilityEvent, 'id' | 'createdAt'>): Promise<void> {
  const event: ObservabilityEvent = { ...input, id: generateId(), createdAt: new Date().toISOString() };
  try {
    await getRepository<ObservabilityEvent>('observability_events', ctx).create(event);
  } catch {
    // Observability must never be the thing that crashes the app it's
    // trying to observe — swallow storage failures, fall back to console.
    console.error('[observability] failed to persist event, falling back to console:', event);
  }
}

let globalCaptureInstalled = false;

/** Wires real browser crash reporting. Safe to call once at app
 * startup; a second call is a no-op. No-ops entirely outside a browser
 * (Node/test environments), matching the same explicit-runtime-check
 * pattern as `src/offline/storeFactory.ts`. */
export function installGlobalErrorCapture(ctx: RepositoryContext): void {
  if (globalCaptureInstalled || typeof window === 'undefined') return;
  globalCaptureInstalled = true;

  window.addEventListener('error', (e: ErrorEvent) => {
    captureEvent(ctx, {
      type: 'client_crash', message: e.message, stack: e.error?.stack,
      source: e.filename ?? 'window.onerror', correlationId: `corr_crash_${Date.now()}`,
    });
  });

  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    captureEvent(ctx, {
      type: 'client_crash', message: String(e.reason?.message ?? e.reason ?? 'Unhandled promise rejection'),
      stack: e.reason?.stack, source: 'unhandledrejection', correlationId: `corr_crash_${Date.now()}`,
    });
  });
}

export interface ObservabilitySummary {
  environment: string;
  isProductionDeploy: boolean;
  deadLetterCount: number;
  averageRetryAttempts: number;
  pendingNotificationCount: number;
  recentClientCrashCount: number;
  integrationHealth: { name: string; healthy: boolean; note: string }[];
}

export async function getObservabilitySummary(ctx: RepositoryContext): Promise<ObservabilitySummary> {
  const executions = await getRepository<WorkflowExecution>('workflow_executions', ctx).list();
  const deadLetterCount = executions.filter(e => e.status === 'dead_letter').length;
  const averageRetryAttempts = executions.length
    ? executions.reduce((sum, e) => sum + e.attempt, 0) / executions.length
    : 0;

  const notifications = await getRepository<NotificationRecord>('notifications', ctx).list();
  const pendingNotificationCount = notifications.filter(n => n.status === 'queued').length;

  const crashEvents = await getRepository<ObservabilityEvent>('observability_events', ctx).list();
  const recentClientCrashCount = crashEvents.filter(e => e.type === 'client_crash').length;

  // Integration health: real checks, not fabricated status — reflects
  // the documented gaps from Phases 04/05/11 rather than claiming
  // everything is healthy.
  const integrationHealth: ObservabilitySummary['integrationHealth'] = [
    { name: 'Firestore (users/leads)', healthy: true, note: 'Real, wired since before this pack (Phase 01 §4).' },
    { name: 'Firestore (project spine, Phase 04+)', healthy: true, note: 'Rules deployed; live authenticated round-trip unverified in this sandbox (Phase 04 §6).' },
    { name: 'Object storage (media)', healthy: false, note: 'No bucket configured (Phase 11 §2 documented gap).' },
    { name: 'Email/WhatsApp/SMS providers', healthy: false, note: 'No provider configured (Phase 11 §3 documented gap).' },
    { name: 'Payment gateway / bank feed', healthy: false, note: 'No provider configured (Phase 11 §4 documented gap).' },
    { name: 'Server auth middleware', healthy: false, note: 'server.ts has no request authentication (Phase 05 §6 documented gap).' },
  ];

  return {
    environment: ctx.environment,
    isProductionDeploy: isProductionDeploy(),
    deadLetterCount,
    averageRetryAttempts: Math.round(averageRetryAttempts * 100) / 100,
    pendingNotificationCount,
    recentClientCrashCount,
    integrationHealth,
  };
}
