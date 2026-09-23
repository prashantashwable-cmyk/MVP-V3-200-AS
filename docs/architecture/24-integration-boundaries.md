# Phase 24 — External Integration Boundaries

## 1. What already existed (not rebuilt)

Firebase Auth (Google Sign-In), object storage
(`src/offline/mediaUpload.ts`'s `UploadTransport`/`FirebaseStorageTransport`),
and email/WhatsApp/SMS (`src/services/notificationService.ts`'s
`ChannelTransport`) already had real interfaces from Phases 04/05/11 —
investigated first, confirmed still real and current, left untouched.
The genuine gaps against the pack's target list were **payment
provider**, **accounting/ERP**, and **logistics** — none of which had a
formal provider interface anywhere in the codebase (the reconciliation
service's `ExternalRecordSource` is a bare `fetch()`, not the fuller
health/retry/webhook/audit contract this phase asks for).

## 2. `src/integrations/` — the shared contract

- **`types.ts`**: `IntegrationStatus` (`unconfigured`/`healthy`/
  `degraded`/`down`), `IntegrationProvider` (every concrete provider's
  base shape), `UnconfiguredIntegrationError` (thrown by every action
  method on an unconfigured provider — never a silent no-op, never a
  fabricated success), `DEFAULT_RETRY_POLICY` (documents the retry model
  a real implementation should follow — 3 attempts, exponential backoff,
  only for retryable failures), `WebhookEnvelope` (the shape any real
  inbound webhook — payment or logistics — carries, reusing Phase 06/07's
  idempotency/audit model rather than inventing a second one).
- **`paymentGateway.ts`** / **`accountingErp.ts`** / **`logistics.ts`**:
  one real TypeScript interface each (`charge`/`refund`/
  `verifyWebhookSignature`; `syncInvoice`/`syncPaymentReceipt`;
  `createShipment`/`getTrackingUpdates`/`verifyWebhookSignature`), plus
  an honest `unconfigured*` default export — `healthCheck()` reports
  `'unconfigured'` with a specific, actionable note (what real
  credential/configuration is actually missing), every action method
  throws `UnconfiguredIntegrationError`, and both webhook signature
  checks return `false` unconditionally — an integration with no real
  secret to check against must fail closed, never trust an unverifiable
  webhook by accident.
- **`registry.ts`**: `getIntegrationRegistryHealth()` — calls each of
  the 3 providers' real `healthCheck()` and returns the live result. Real
  providers get wired in here (one `export const paymentGateway = ...`
  line each) once real credentials exist; nothing else in the codebase
  needs to change.

## 3. Wired into observability, additively

`src/lib/observability.ts`'s `getObservabilitySummary()` now spreads
`getIntegrationRegistryHealth()`'s real, computed result into its
`integrationHealth` list, replacing the one hardcoded "Payment gateway /
bank feed" line (now a real, specific entry per provider) while leaving
every other Phase 12 entry (Firestore, object storage, email/WhatsApp/
SMS, server auth) exactly as it was — additive, not a rewrite of
already-tested code. `scripts/control-tower-check.ts` (Phase 12, unchanged)
still passes with this real data flowing through it.

## 4. Regression test

`scripts/integration-boundaries-check.ts` (`npm run
integration-boundaries:check`, wired into `npm run checks`) — 16
assertions: every provider's health check honestly reports
`'unconfigured'` with a real explanatory note; every action method
throws the specific `UnconfiguredIntegrationError` type (not a generic
error, not a silent success); both webhook signature checks fail closed
even when a (fake) signature is present; the registry reports exactly 3
distinct, honestly-unhealthy entries computed live.

## 5. Acceptance

- `npx tsc --noEmit` — pass.
- `npm run integration-boundaries:check` — pass, 16/16 assertions.
- `npm run checks` (all 28 scripts) — pass, zero regressions in the
  prior 493 assertions.
- `npm run build` — pass.

## 6. What real configuration each one needs (the honest "how to unblock")

- **Payment gateway**: a real provider account (Razorpay/Stripe/PayU/…),
  its API key/secret as a server-side environment variable (never
  client-exposed), and a real webhook endpoint registered with the
  provider so `verifyWebhookSignature` has a real secret to check
  against.
- **Accounting/ERP**: a chosen provider (Tally/Zoho Books/QuickBooks/…),
  its API credentials, and a real chart-of-accounts/GSTIN mapping agreed
  with finance before the first real sync — this is a business decision
  this sandbox cannot make on its own.
- **Logistics**: a chosen carrier/aggregator (Delhivery/Shiprocket/…) or
  the in-house fleet system's real API, its credentials, and a real
  webhook endpoint for tracking-milestone push updates.

None of these can be provisioned from this sandbox — no live credentials
exist for any of them (consistent with every other documented
integration gap since Phase 01). The real, callable, honestly-unconfigured
interface is what this phase delivers; a follow-up with real credentials
swaps one `export const` per provider and needs no other code change.

## 7. Next phase

Phase 25 — Global Search + Control Tower Completion.
