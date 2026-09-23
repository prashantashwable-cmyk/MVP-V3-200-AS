/**
 * Payment gateway provider boundary — Phase 24.
 *
 * No payment gateway (Razorpay/Stripe/PayU/…) is configured anywhere in
 * this repository — confirmed at Phase 01 baseline and unchanged since
 * (`OnlinePaymentCheckout.tsx`'s "gateway" remains the documented
 * `setTimeout`-based simulation, Phase 15 §7). This is the real
 * interface a configured provider would implement, and the honest
 * `unconfigured` default every caller gets until one is.
 */

import type { IntegrationProvider, IntegrationHealthCheck, WebhookEnvelope } from './types';
import { UnconfiguredIntegrationError } from './types';

export interface PaymentChargeRequest {
  amountPaise: number; // smallest currency unit, avoids float rounding
  currency: 'INR';
  idempotencyKey: string;
  description: string;
}

export interface PaymentChargeResult {
  providerRef: string;
  status: 'succeeded' | 'failed' | 'pending';
}

export interface PaymentGatewayProvider extends IntegrationProvider {
  kind: 'payment_gateway';
  charge(req: PaymentChargeRequest): Promise<PaymentChargeResult>;
  refund(providerRef: string, amountPaise: number, idempotencyKey: string): Promise<PaymentChargeResult>;
  /** Real providers sign webhook bodies (e.g. Razorpay's `X-Razorpay-
   * Signature` HMAC). An unconfigured provider has no secret to check
   * against, so it must return `false` — treating every inbound webhook
   * as unverified is the safe default, never treating one as trusted by
   * accident. */
  verifyWebhookSignature(envelope: WebhookEnvelope): boolean;
}

export const unconfiguredPaymentGateway: PaymentGatewayProvider = {
  name: 'Payment Gateway',
  kind: 'payment_gateway',
  async healthCheck(): Promise<IntegrationHealthCheck> {
    return {
      status: 'unconfigured',
      detail: 'No payment gateway API key configured. Needs: a real provider account (e.g. Razorpay/Stripe/PayU), its API key/secret as a server-side environment variable, and a real webhook endpoint registered with the provider.',
      checkedAt: new Date().toISOString(),
    };
  },
  async charge(): Promise<PaymentChargeResult> {
    throw new UnconfiguredIntegrationError('payment_gateway', 'charge');
  },
  async refund(): Promise<PaymentChargeResult> {
    throw new UnconfiguredIntegrationError('payment_gateway', 'refund');
  },
  verifyWebhookSignature(): boolean {
    return false;
  },
};
