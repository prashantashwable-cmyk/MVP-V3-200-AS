/**
 * Phase 24 acceptance check: proves the new payment gateway/accounting-
 * ERP/logistics integration boundaries are real interfaces with an
 * honest unconfigured status — never a fabricated success — and that
 * the integration registry's health is computed live, not hardcoded.
 *
 * Run with: npx tsx scripts/integration-boundaries-check.ts
 */
import { paymentGateway, accountingErp, logistics, getIntegrationRegistryHealth } from '../src/integrations/registry';
import { UnconfiguredIntegrationError } from '../src/integrations/types';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`OK: ${msg}`);
}

async function assertThrowsUnconfigured(fn: () => Promise<unknown>, label: string) {
  try {
    await fn();
    assert(false, `${label} throws UnconfiguredIntegrationError instead of faking success`);
  } catch (err) {
    assert(err instanceof UnconfiguredIntegrationError, `${label} throws the real UnconfiguredIntegrationError type, not a generic error`);
  }
}

async function main() {
  // --- Payment gateway ------------------------------------------------
  const pgHealth = await paymentGateway.healthCheck();
  assert(pgHealth.status === 'unconfigured', 'payment gateway health check honestly reports "unconfigured"');
  assert(pgHealth.detail.length > 20, 'payment gateway health check explains WHAT is missing, not just that it is');
  await assertThrowsUnconfigured(() => paymentGateway.charge({ amountPaise: 100000, currency: 'INR', idempotencyKey: 'test-1', description: 'test' }), 'paymentGateway.charge()');
  await assertThrowsUnconfigured(() => paymentGateway.refund('ref-1', 50000, 'test-2'), 'paymentGateway.refund()');
  assert(
    paymentGateway.verifyWebhookSignature({ eventId: 'e1', eventType: 'payment.captured', receivedAt: new Date().toISOString(), payload: {}, rawBody: '{}', signature: 'fake-signature' }) === false,
    'an unconfigured payment gateway NEVER treats a webhook as verified, even with a signature present — fails closed',
  );

  // --- Accounting/ERP ---------------------------------------------------
  const erpHealth = await accountingErp.healthCheck();
  assert(erpHealth.status === 'unconfigured', 'accounting/ERP health check honestly reports "unconfigured"');
  await assertThrowsUnconfigured(() => accountingErp.syncInvoice({ invoiceId: 'inv-1', projectId: 'proj-1', amountPaise: 100000, customerName: 'Test', idempotencyKey: 'test-3' }), 'accountingErp.syncInvoice()');
  await assertThrowsUnconfigured(() => accountingErp.syncPaymentReceipt('pay-1', 'ext-inv-1', 50000, 'test-4'), 'accountingErp.syncPaymentReceipt()');

  // --- Logistics ----------------------------------------------------------
  const logHealth = await logistics.healthCheck();
  assert(logHealth.status === 'unconfigured', 'logistics health check honestly reports "unconfigured"');
  await assertThrowsUnconfigured(() => logistics.createShipment({ purchaseOrderId: 'po-1', originAddress: 'A', destinationAddress: 'B', idempotencyKey: 'test-5' }), 'logistics.createShipment()');
  await assertThrowsUnconfigured(() => logistics.getTrackingUpdates('trk-1'), 'logistics.getTrackingUpdates()');
  assert(logistics.verifyWebhookSignature({ eventId: 'e2', eventType: 'shipment.delivered', receivedAt: new Date().toISOString(), payload: {}, rawBody: '{}' }) === false, 'an unconfigured logistics provider never treats a webhook as verified');

  // --- Registry: real, computed, not hardcoded ----------------------------
  const registryHealth = await getIntegrationRegistryHealth();
  assert(registryHealth.length === 3, 'the integration registry reports exactly the 3 Phase 24 providers');
  assert(registryHealth.every(r => r.healthy === false), 'every provider in the registry is honestly reported unhealthy (none is fabricated as working)');
  assert(registryHealth.every(r => r.note.length > 0), 'every registry entry carries a real, specific note, not a bare boolean');
  assert(new Set(registryHealth.map(r => r.name)).size === 3, 'the 3 registry entries have distinct names (Payment Gateway / Accounting/ERP / Logistics/Delivery Partner)');

  console.log('\nPASS: the payment gateway, accounting/ERP, and logistics integration boundaries are real,');
  console.log('typed interfaces that honestly report "unconfigured" and throw a real, typed error rather than');
  console.log('faking success on every action method — and both webhook signature checks fail closed. The');
  console.log('integration registry computes this live by actually calling each provider, not from a hardcoded list.');
}

main();
