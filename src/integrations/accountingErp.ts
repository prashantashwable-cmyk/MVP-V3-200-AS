/**
 * Accounting/ERP provider boundary — Phase 24.
 *
 * No accounting/ERP system (Tally/Zoho Books/QuickBooks/SAP/…) is
 * configured anywhere in this repository. `InvoiceGenerator.tsx` and
 * related screens produce invoice records entirely within `DbManager` —
 * there is no real sync to an external books-of-record system. This is
 * the real interface such a sync would implement, and the honest
 * `unconfigured` default every caller gets until one is.
 */

import type { IntegrationProvider, IntegrationHealthCheck } from './types';
import { UnconfiguredIntegrationError } from './types';

export interface InvoiceSyncRequest {
  invoiceId: string;
  projectId: string;
  amountPaise: number;
  customerName: string;
  idempotencyKey: string;
}

export interface InvoiceSyncResult {
  externalInvoiceRef: string;
  status: 'synced' | 'failed';
}

export interface AccountingErpProvider extends IntegrationProvider {
  kind: 'accounting_erp';
  syncInvoice(req: InvoiceSyncRequest): Promise<InvoiceSyncResult>;
  syncPaymentReceipt(paymentId: string, invoiceExternalRef: string, amountPaise: number, idempotencyKey: string): Promise<InvoiceSyncResult>;
}

export const unconfiguredAccountingErp: AccountingErpProvider = {
  name: 'Accounting/ERP',
  kind: 'accounting_erp',
  async healthCheck(): Promise<IntegrationHealthCheck> {
    return {
      status: 'unconfigured',
      detail: 'No accounting/ERP integration configured. Needs: a chosen provider (e.g. Tally/Zoho Books/QuickBooks), its API credentials, and a real chart-of-accounts/GSTIN mapping agreed with finance before the first real sync.',
      checkedAt: new Date().toISOString(),
    };
  },
  async syncInvoice(): Promise<InvoiceSyncResult> {
    throw new UnconfiguredIntegrationError('accounting_erp', 'syncInvoice');
  },
  async syncPaymentReceipt(): Promise<InvoiceSyncResult> {
    throw new UnconfiguredIntegrationError('accounting_erp', 'syncPaymentReceipt');
  },
};
