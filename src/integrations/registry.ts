/**
 * Integration registry — Phase 24.
 *
 * One place to ask "what external integrations exist, and what's their
 * real status" — computed by actually calling each provider's own
 * `healthCheck()`, never a hardcoded guess. Feeds
 * `src/lib/observability.ts`'s `integrationHealth` list for the 3
 * providers this phase added formal interfaces for (payment gateway,
 * accounting/ERP, logistics); the other, earlier-built integrations
 * (object storage, email/WhatsApp/SMS, Firestore, server auth) keep
 * their existing Phase 12 entries there — additive, not a rewrite of
 * already-tested code.
 */

import { unconfiguredPaymentGateway, type PaymentGatewayProvider } from './paymentGateway';
import { unconfiguredAccountingErp, type AccountingErpProvider } from './accountingErp';
import { unconfiguredLogistics, type LogisticsProvider } from './logistics';
import type { IntegrationHealthCheck } from './types';

/**
 * Real providers get wired in here once real credentials exist — e.g.
 * `export const paymentGateway: PaymentGatewayProvider = isConfigured()
 * ? createRealRazorpayProvider() : unconfiguredPaymentGateway;`. Until
 * then, every export below is the honest unconfigured default.
 */
export const paymentGateway: PaymentGatewayProvider = unconfiguredPaymentGateway;
export const accountingErp: AccountingErpProvider = unconfiguredAccountingErp;
export const logistics: LogisticsProvider = unconfiguredLogistics;

export async function getIntegrationRegistryHealth(): Promise<{ name: string; healthy: boolean; note: string }[]> {
  const providers = [paymentGateway, accountingErp, logistics];
  const checks: IntegrationHealthCheck[] = await Promise.all(providers.map(p => p.healthCheck()));
  return providers.map((p, i) => ({
    name: p.name,
    healthy: checks[i].status === 'healthy',
    note: checks[i].detail,
  }));
}
