/**
 * Quote maths (spec §16, D-15). Pure. Tax comes from the rate the Admin enters (default from
 * config GST_RATE_PCT) and is never hard-coded here ⚖ VERIFY with the CA.
 *   Selling price = (Base + Installation + Freight + Other) + Tax
 *   Gross margin % = (price excl. tax − cost) ÷ price excl. tax
 *   Markup %       = (price excl. tax − cost) ÷ cost
 */

import { MIN_MARKUP_PCT, BOOKING_TOKEN_INR, DELIVERY_PAYMENT_PCT } from './config';

export interface QuoteLines { base: number; installation: number; freight: number; other: number }

export interface QuoteFigures {
  subtotalExclTax: number;
  taxAmount: number;
  sellingPrice: number;
  markupPct: number;
  grossMarginPct: number;
  belowMinimum: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function validateQuoteInput(lines: QuoteLines, taxRatePct: number | null, estimatedCost: number): string[] {
  const errors: string[] = [];
  for (const [k, v] of Object.entries(lines)) {
    if (!Number.isFinite(v) || v < 0) errors.push(`${k} must be a number of rupees, 0 or more.`);
  }
  if (!(lines.base > 0)) errors.push('The base lift price is required.');
  if (taxRatePct === null || !Number.isFinite(taxRatePct) || taxRatePct < 0 || taxRatePct > 50) {
    errors.push('Enter the tax rate % (⚖ confirm with your CA).');
  }
  if (!Number.isFinite(estimatedCost) || estimatedCost <= 0) errors.push('Enter the estimated cost (internal only).');
  return errors;
}

export function computeQuote(lines: QuoteLines, taxRatePct: number, estimatedCost: number): QuoteFigures {
  const subtotalExclTax = lines.base + lines.installation + lines.freight + lines.other;
  const taxAmount = Math.round((subtotalExclTax * taxRatePct) / 100);
  const markupPct = round2(((subtotalExclTax - estimatedCost) / estimatedCost) * 100);
  const grossMarginPct = round2(((subtotalExclTax - estimatedCost) / subtotalExclTax) * 100);
  return {
    subtotalExclTax, taxAmount, sellingPrice: subtotalExclTax + taxAmount,
    markupPct, grossMarginPct, belowMinimum: markupPct < MIN_MARKUP_PCT,
  };
}

/** D-14 default milestones. A paid survey fee (D-30) is credited against the booking token. */
export function defaultMilestoneAmounts(sellingPrice: number, surveyFeeCredit = 0): { BOOKING_TOKEN: number; DELIVERY: number; FINAL: number } {
  const token = Math.min(BOOKING_TOKEN_INR, sellingPrice);
  const delivery = Math.round((sellingPrice * DELIVERY_PAYMENT_PCT) / 100) - token;
  const final = sellingPrice - token - delivery;
  return { BOOKING_TOKEN: Math.max(0, token - surveyFeeCredit), DELIVERY: delivery, FINAL: final };
}
