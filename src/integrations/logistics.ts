/**
 * Logistics/delivery-partner provider boundary — Phase 24.
 *
 * No real logistics/courier API (Delhivery/Shiprocket/an in-house fleet
 * system/…) is configured — `LiveShipmentTrackingScreen.tsx`'s "GPS
 * tracking" is simulated milestone advancement (Phase 17), not a real
 * carrier integration. This is the real interface such an integration
 * would implement, and the honest `unconfigured` default every caller
 * gets until one is.
 */

import type { IntegrationProvider, IntegrationHealthCheck, WebhookEnvelope } from './types';
import { UnconfiguredIntegrationError } from './types';

export interface CreateShipmentRequest {
  purchaseOrderId: string;
  originAddress: string;
  destinationAddress: string;
  idempotencyKey: string;
}

export interface CreateShipmentResult {
  externalTrackingRef: string;
  status: 'created' | 'failed';
}

export interface TrackingUpdate {
  externalTrackingRef: string;
  milestone: 'dispatched' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception';
  occurredAt: string;
}

export interface LogisticsProvider extends IntegrationProvider {
  kind: 'logistics';
  createShipment(req: CreateShipmentRequest): Promise<CreateShipmentResult>;
  getTrackingUpdates(externalTrackingRef: string): Promise<TrackingUpdate[]>;
  /** Same honest-default rule as the payment gateway: no configured
   * secret means every inbound webhook is unverified, so this always
   * returns `false` until a real provider is wired in. */
  verifyWebhookSignature(envelope: WebhookEnvelope): boolean;
}

export const unconfiguredLogistics: LogisticsProvider = {
  name: 'Logistics/Delivery Partner',
  kind: 'logistics',
  async healthCheck(): Promise<IntegrationHealthCheck> {
    return {
      status: 'unconfigured',
      detail: 'No logistics/courier API configured. Needs: a chosen carrier/aggregator (e.g. Delhivery/Shiprocket) or the in-house fleet system\'s real API, its credentials, and a real webhook endpoint for tracking-milestone push updates.',
      checkedAt: new Date().toISOString(),
    };
  },
  async createShipment(): Promise<CreateShipmentResult> {
    throw new UnconfiguredIntegrationError('logistics', 'createShipment');
  },
  async getTrackingUpdates(): Promise<TrackingUpdate[]> {
    throw new UnconfiguredIntegrationError('logistics', 'getTrackingUpdates');
  },
  verifyWebhookSignature(): boolean {
    return false;
  },
};
