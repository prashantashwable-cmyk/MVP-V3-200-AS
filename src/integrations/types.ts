/**
 * External integration boundary — shared vocabulary — Phase 24.
 *
 * "For integrations that lack production credentials, implement:
 * provider interface, configuration boundary, health check, retry
 * model, webhook contract, idempotency, audit, explicit unavailable/
 * unconfigured status." This is the shared shape every concrete
 * provider in this directory implements, so a caller (or the Control
 * Tower / observability summary) can treat any of them uniformly
 * without knowing which one it is.
 *
 * Real, honest defaults live in `unconfigured.ts` — never a fake
 * "success" response. A provider only becomes real when real
 * credentials/configuration are wired in (out of this sandbox's reach —
 * see docs/architecture/24-integration-boundaries.md for exactly what
 * each one needs).
 */

export type IntegrationStatus = 'unconfigured' | 'healthy' | 'degraded' | 'down';

export interface IntegrationHealthCheck {
  status: IntegrationStatus;
  detail: string;
  checkedAt: string;
}

/** Every concrete provider implements at least this. */
export interface IntegrationProvider {
  readonly name: string;
  readonly kind: 'payment_gateway' | 'accounting_erp' | 'logistics';
  healthCheck(): Promise<IntegrationHealthCheck>;
}

/** Thrown by every unconfigured provider's action methods — never a
 * silent no-op, never a fabricated success. Callers (domain services)
 * catch this the same way they already treat any other real failure
 * (report it, audit it, do not pretend the external call happened). */
export class UnconfiguredIntegrationError extends Error {
  constructor(public readonly integration: string, public readonly action: string) {
    super(`${integration}.${action}() called, but no real ${integration} is configured in this environment. See docs/architecture/24-integration-boundaries.md for what real configuration this needs.`);
    this.name = 'UnconfiguredIntegrationError';
  }
}

/** Standard retry model every provider action should honor once real
 * (documented here so a real implementation has one contract to follow,
 * not invented ad hoc per provider): up to 3 attempts, exponential
 * backoff, only for retryable failures (network/5xx), never for a
 * provider's explicit business-logic rejection (e.g. "card declined"). */
export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: (attempt: number) => number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoffMs: (attempt: number) => Math.min(1000 * 2 ** attempt, 8000),
};

/** The shape every provider's inbound webhook contract carries — a real
 * external system's webhook and an internal automation/event both need
 * these same three things (Phase 06/07's idempotency + audit model
 * applies here too, not a separate one). */
export interface WebhookEnvelope<TPayload = unknown> {
  eventId: string; // the PROVIDER's event id — the idempotency key
  eventType: string;
  receivedAt: string;
  payload: TPayload;
  /** Raw body + signature are kept separate from the parsed payload so a
   * real provider's HMAC/signature check can run against the exact bytes
   * that were signed, not a re-serialized copy. */
  rawBody: string;
  signature?: string;
}
