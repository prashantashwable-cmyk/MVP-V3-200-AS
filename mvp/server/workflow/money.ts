/**
 * Money rules — deterministic, never AI (prompt §14).
 *
 *   WORKFLOW → EVIDENCE → VALIDATION → PAYMENT ELIGIBILITY → PAYMENT
 *
 * - Quote: cost-plus 60% list margin; a hard floor of 20% margin that
 *   no code path can go below (`assertMarginFloor`).
 * - Milestones: ₹10,000 token → 90% (less token) when material is at
 *   site → final 10% after handover. Amounts are computed here from the
 *   stored quote; a client never sends an amount.
 * - Gateway: `PaymentGateway` interface. The only implementation is an
 *   MVP MOCK. It can be told to fail (card 4000 0000 0000 0002, or the
 *   per-project "fail next payment" demo switch) so the failure path can
 *   be shown and tested.
 */

export const LIST_MARGIN = 0.60;
export const MARGIN_FLOOR = 0.20;
export const TOKEN_AMOUNT = 10_000;

export interface QuoteInput { floors: number; doorType: 'automatic' | 'manual'; finish: 'SS' | 'MS' }

export function costEstimate(q: QuoteInput): number {
  const base = 420_000;
  const perFloor = 38_000 * Math.max(2, q.floors);
  const doors = q.doorType === 'automatic' ? 22_000 * Math.max(2, q.floors) : 0;
  const finish = q.finish === 'SS' ? 45_000 : 0;
  return base + perFloor + doors + finish;
}

export function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

export function marginOf(price: number, cost: number): number {
  return (price - cost) / cost;
}

export function assertMarginFloor(price: number, cost: number): void {
  if (marginOf(price, cost) < MARGIN_FLOOR - 1e-9) {
    throw new Error(`Price ₹${price} is below the ${MARGIN_FLOOR * 100}% margin floor for cost ₹${cost}`);
  }
}

export function buildQuote(q: QuoteInput): { cost: number; total: number; marginPct: number } {
  const cost = costEstimate(q);
  const total = roundTo(cost * (1 + LIST_MARGIN), 1000);
  assertMarginFloor(total, cost);
  return { cost, total, marginPct: Math.round(marginOf(total, cost) * 1000) / 10 };
}

export type Milestone = 'TOKEN' | 'MATERIAL' | 'FINAL';

export function milestoneAmounts(total: number): Record<Milestone, number> {
  const material = roundTo(total * 0.9, 1) - TOKEN_AMOUNT;
  return { TOKEN: TOKEN_AMOUNT, MATERIAL: material, FINAL: total - TOKEN_AMOUNT - material };
}

export interface ChargeRequest { reference: string; amount: number; method: string; cardNumber?: string; forceFail?: boolean }
export interface ChargeResult { ok: boolean; gatewayRef?: string; reason?: string }

export interface PaymentGateway {
  name: string;
  charge(req: ChargeRequest): Promise<ChargeResult>;
}

/** MVP MOCK gateway. No real money moves. */
export const mockGateway: PaymentGateway = {
  name: 'MVP MOCK gateway',
  async charge(req) {
    if (req.forceFail || (req.cardNumber ?? '').replace(/\s/g, '') === '4000000000000002') {
      return { ok: false, reason: 'Card declined by issuing bank (MVP MOCK)' };
    }
    return { ok: true, gatewayRef: `MOCK-${req.reference}-${Date.now().toString(36).toUpperCase()}` };
  },
};

export function inr(n: number): string {
  return '₹' + n.toLocaleString('en-IN');
}
