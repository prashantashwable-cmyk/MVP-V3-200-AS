/** Quote and milestone maths (D-14, D-15). Amounts are whole rupees. */
import { MVP_CONFIG } from './config';
import type { QuoteLines } from './types';

export function formatInr(amount: number): string {
  return '₹' + Math.round(amount).toLocaleString('en-IN');
}

export function totalExclTax(lines: QuoteLines): number {
  return lines.baseLift + lines.installation + lines.freight + lines.other;
}

export function quotePricing(lines: QuoteLines, taxRatePct: number) {
  const exclTax = totalExclTax(lines);
  const taxAmount = Math.round(exclTax * taxRatePct / 100);
  return { totalExclTax: exclTax, taxAmount, sellingPrice: exclTax + taxAmount };
}

/** Gross margin % = (price excl. tax − cost) ÷ price excl. tax; markup % = (price excl. tax − cost) ÷ cost. One decimal. */
export function marginMeasures(priceExclTax: number, estimatedCost: number) {
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const gross = priceExclTax > 0 ? ((priceExclTax - estimatedCost) / priceExclTax) * 100 : 0;
  const markup = estimatedCost > 0 ? ((priceExclTax - estimatedCost) / estimatedCost) * 100 : 0;
  return { grossMarginPct: round1(gross), markupPct: round1(markup) };
}

export function isBelowMinimum(markupPct: number, minMarkupPct = MVP_CONFIG.MIN_MARKUP_PCT): boolean {
  return markupPct < minMarkupPct;
}

/** D-14 default milestones: token, delivery = 90% of selling price − token, final = the rest. */
export function defaultMilestoneAmounts(sellingPrice: number, token = MVP_CONFIG.BOOKING_TOKEN_INR) {
  const delivery = Math.round(sellingPrice * MVP_CONFIG.DELIVERY_PCT_OF_TOTAL / 100) - token;
  return { BOOKING_TOKEN: token, DELIVERY: delivery, FINAL: sellingPrice - token - delivery };
}

export function addDays(iso: Date | string, days: number): string {
  const d = typeof iso === 'string' ? new Date(iso) : new Date(iso.getTime());
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function addMinutes(iso: Date | string, minutes: number): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Date(d.getTime() + minutes * 60 * 1000).toISOString();
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}

/** Asia/Kolkata display, e.g. "25 Sep, 5:00 pm" (D-18). */
export function formatIst(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: MVP_CONFIG.TIME_ZONE, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}
