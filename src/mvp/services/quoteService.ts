/**
 * Quote (spec §16, D-15) on the canonical Quote/QuoteVersion. Every save is a new, immutable
 * QuoteVersion with customer-visible prices only; the estimated cost and margin go to
 * `quote_costs` (Admin/Owner only, I-5). Below MIN_MARKUP_PCT the quote cannot be sent until
 * the Admin approves the margin (ApprovalRequest + APPROVE_MARGIN task, audited).
 */

import type { ApprovalRequest, Quote, QuoteCost, QuoteVersion } from '../../domain/entities';
import {
  approvalRequestRepository, projectRepository, quoteCostRepository, quoteRepository, quoteVersionRepository,
} from '../../repository/entities';
import { recordAuditEvent, newCorrelationId } from '../../lib/audit';
import { runIdempotent } from '../../lib/idempotency';
import { GST_RATE_CONFIRMED } from '../config';
import { computeQuote, validateQuoteInput, type QuoteLines } from '../quoteMath';
import { toMvpStage } from '../stage';
import { notify } from './notify';
import { prepareMilestones } from './paymentService';
import { applyEvent, customerToken, MvpError, nowOf, type MvpActor, type MvpCtx } from './orderService';

type Q = Quote & { version?: number };

export const quoteIdFor = (orderId: string) => `quote_${orderId}`;

function requireAdmin(actor: MvpActor, what: string) {
  if (actor.role !== 'admin') throw new MvpError('forbidden', `Only the Admin can ${what}.`);
}

async function audit(ctx: MvpCtx, actor: MvpActor, action: string, entityId: string, orderId: string, before: unknown, after: unknown, reason?: string) {
  await recordAuditEvent(ctx, {
    actorId: actor.userId, actorRole: actor.role, action, entityType: 'Quote', entityId, projectId: orderId,
    before, after, reason, source: 'ui', correlationId: newCorrelationId(),
  });
}

export interface QuoteDraftInput { lines: QuoteLines; taxRatePct: number | null; estimatedCost: number; note?: string }

export interface QuoteForViewer {
  quote: Q | null;
  version: QuoteVersion | null;
  versions: QuoteVersion[];
  /** Admin/Owner only. Never loaded for anyone else (I-5). */
  cost?: QuoteCost | null;
  approval?: ApprovalRequest | null;
}

export async function getQuoteForViewer(ctx: MvpCtx, viewer: MvpActor, orderId: string): Promise<QuoteForViewer> {
  const quote = (await quoteRepository(ctx).get(quoteIdFor(orderId))) as Q | null;
  if (!quote) return { quote: null, version: null, versions: [] };
  // Query by projectId: that is the field firestore.rules checks for participant reads.
  const versions = (await quoteVersionRepository(ctx).query({ projectId: orderId } as Partial<QuoteVersion>))
    .sort((a, b) => b.versionNumber - a.versionNumber);
  const version = versions.find(v => v.id === quote.currentVersionId) ?? versions[0] ?? null;
  const internal = viewer.role === 'admin' || viewer.role === 'owner';
  return {
    quote, version,
    versions: viewer.role === 'customer' ? versions.filter(v => v.id === version?.id) : versions,
    cost: internal && version ? await quoteCostRepository(ctx).get(version.id) : undefined,
    approval: internal && version ? await approvalRequestRepository(ctx).get(`apr_${version.id}`) : undefined,
  };
}

/** Admin saves a new quote version (Base + Installation + Freight + Other + Tax). */
export async function saveQuote(ctx: MvpCtx, actor: MvpActor, orderId: string, input: QuoteDraftInput): Promise<QuoteForViewer> {
  requireAdmin(actor, 'prepare quotes');
  const order = await projectRepository(ctx).get(orderId);
  if (!order) throw new MvpError('not_found', 'Order not found.');
  if (toMvpStage(order.stage) !== 'QUOTE') throw new MvpError('invalid', 'A quote can only be prepared at the QUOTE stage.');
  const errors = validateQuoteInput(input.lines, input.taxRatePct, input.estimatedCost);
  if (errors.length) throw new MvpError('invalid', errors.join(' '));
  const fig = computeQuote(input.lines, input.taxRatePct!, input.estimatedCost);
  const now = nowOf(ctx).toISOString();

  const qRepo = quoteRepository(ctx);
  let quote = (await qRepo.get(quoteIdFor(orderId))) as Q | null;
  if (quote && (quote.status === 'sent' || quote.status === 'accepted')) {
    throw new MvpError('invalid', quote.status === 'accepted' ? 'The customer has accepted this quote.' : 'Wait for the customer’s decision, or cancel the order.');
  }
  const versions = quote ? await quoteVersionRepository(ctx).query({ projectId: orderId } as Partial<QuoteVersion>) : [];
  const n = versions.length + 1;
  const versionId = `qv_${orderId}_${n}`;
  const version: QuoteVersion = {
    id: versionId as QuoteVersion['id'], quoteId: quoteIdFor(orderId) as QuoteVersion['quoteId'], projectId: orderId as QuoteVersion['projectId'],
    versionNumber: n,
    lineItems: [
      { description: 'Base lift', qty: 1, unitPrice: input.lines.base },
      { description: 'Installation', qty: 1, unitPrice: input.lines.installation },
      { description: 'Freight', qty: 1, unitPrice: input.lines.freight },
      { description: 'Other charges', qty: 1, unitPrice: input.lines.other },
    ],
    totalAmount: fig.sellingPrice, lines: input.lines, subtotalExclTax: fig.subtotalExclTax, taxRatePct: input.taxRatePct!,
    taxRateConfirmed: GST_RATE_CONFIRMED, taxAmount: fig.taxAmount, sellingPrice: fig.sellingPrice,
    createdAt: now, createdBy: actor.userId as QuoteVersion['createdBy'],
  };
  await quoteVersionRepository(ctx).create(JSON.parse(JSON.stringify(version)));
  const cost: QuoteCost = {
    id: versionId, orderId: orderId as QuoteCost['orderId'], quoteId: quoteIdFor(orderId) as QuoteCost['quoteId'],
    estimatedCost: input.estimatedCost, markupPct: fig.markupPct, grossMarginPct: fig.grossMarginPct, belowMinimum: fig.belowMinimum, createdAt: now,
  };
  if (fig.belowMinimum) {
    const apr: ApprovalRequest = {
      id: `apr_${versionId}` as ApprovalRequest['id'], projectId: orderId as ApprovalRequest['projectId'], entityType: 'QuoteVersion', entityId: versionId,
      requestedBy: actor.userId as ApprovalRequest['requestedBy'], requiredPermission: 'quote.approve', status: 'pending', createdAt: now,
    };
    await approvalRequestRepository(ctx).create(apr);
    cost.approvalRequestId = apr.id;
  }
  await quoteCostRepository(ctx).create(JSON.parse(JSON.stringify(cost)));

  const status: Quote['status'] = fig.belowMinimum ? 'pending_approval' : 'approved';
  if (!quote) {
    quote = { id: quoteIdFor(orderId) as Quote['id'], projectId: orderId as Quote['projectId'], status, currentVersionId: version.id, createdBy: actor.userId as Quote['createdBy'], createdAt: now, updatedAt: now };
    await qRepo.create(quote);
  } else {
    await qRepo.update(quote.id, { status, currentVersionId: version.id, updatedAt: now });
  }
  await audit(ctx, actor, 'QUOTE_VERSION_SAVED', quoteIdFor(orderId), orderId,
    { status: quote.status }, { status, version: n, sellingPrice: fig.sellingPrice, belowMinimum: fig.belowMinimum }, input.note);
  await applyEvent(ctx, actor, orderId, { type: 'QUOTE_PREPARED', belowMinimum: fig.belowMinimum });
  return getQuoteForViewer(ctx, actor, orderId);
}

/** Admin approves a below-minimum margin with a reason (audited), which unlocks Send. */
export async function approveMargin(ctx: MvpCtx, actor: MvpActor, orderId: string, reason: string): Promise<void> {
  requireAdmin(actor, 'approve margins');
  if (!reason?.trim()) throw new MvpError('invalid', 'A reason is required to approve a low margin.');
  const quote = (await quoteRepository(ctx).get(quoteIdFor(orderId))) as Q | null;
  if (!quote || quote.status !== 'pending_approval' || !quote.currentVersionId) throw new MvpError('invalid', 'There is no quote waiting for margin approval.');
  const apr = await approvalRequestRepository(ctx).get(`apr_${quote.currentVersionId}`);
  const now = nowOf(ctx).toISOString();
  if (apr) await approvalRequestRepository(ctx).update(apr.id, { status: 'approved', decidedBy: actor.userId as any, decidedAt: now, reason });
  await quoteRepository(ctx).update(quote.id, { status: 'approved', updatedAt: now });
  await audit(ctx, actor, 'QUOTE_MARGIN_APPROVED', quote.id, orderId, { status: 'pending_approval' }, { status: 'approved', version: quote.currentVersionId }, reason);
  await applyEvent(ctx, actor, orderId, { type: 'MARGIN_APPROVED' });
}

/** Admin sends the approved quote: sets the selling price, prepares the 3 milestones (D-14),
 * creates QUOTE_DECISION for the customer and sends "quote ready". */
export async function sendQuote(ctx: MvpCtx, actor: MvpActor, orderId: string): Promise<void> {
  requireAdmin(actor, 'send quotes');
  const quote = (await quoteRepository(ctx).get(quoteIdFor(orderId))) as Q | null;
  if (!quote?.currentVersionId) throw new MvpError('invalid', 'Prepare the quote first.');
  if (quote.status === 'pending_approval') throw new MvpError('gate', 'This quote is below the minimum margin. Approve the margin before sending it.');
  if (quote.status !== 'approved') throw new MvpError('invalid', `The quote cannot be sent from status "${quote.status}".`);
  const version = await quoteVersionRepository(ctx).get(quote.currentVersionId);
  if (!version?.sellingPrice) throw new MvpError('invalid', 'The quote has no selling price.');
  const order = await projectRepository(ctx).get(orderId);
  if (!order) throw new MvpError('not_found', 'Order not found.');
  const now = nowOf(ctx).toISOString();
  await projectRepository(ctx).update(orderId, { sellingPrice: version.sellingPrice, updatedAt: now } as any, (order as any).version ?? 0);
  await prepareMilestones(ctx, actor, orderId, version.sellingPrice);
  await quoteRepository(ctx).update(quote.id, { status: 'sent', updatedAt: now });
  await audit(ctx, actor, 'QUOTE_SENT', quote.id, orderId, { status: quote.status, sellingPrice: order.sellingPrice }, { status: 'sent', sellingPrice: version.sellingPrice, version: version.versionNumber });
  await applyEvent(ctx, actor, orderId, { type: 'QUOTE_SENT' });
  await notify(ctx, customerToken(order.customerId), 'mvp_quote_ready', orderId, `${quote.id}:${version.id}`);
}

/** The customer (or the Admin on their behalf) accepts the sent quote, or asks for changes. */
export async function decideQuote(ctx: MvpCtx, actor: MvpActor, orderId: string, decision: 'accept' | 'changes', note?: string): Promise<void> {
  const order = await projectRepository(ctx).get(orderId);
  if (!order) throw new MvpError('not_found', 'Order not found.');
  const isCustomer = actor.role === 'customer' && actor.customerId === order.customerId;
  if (!isCustomer && actor.role !== 'admin') throw new MvpError('forbidden', 'Only the customer can decide on the quote.');
  if (decision === 'changes' && !note?.trim()) throw new MvpError('invalid', 'Tell us what you would like changed.');
  const quote = (await quoteRepository(ctx).get(quoteIdFor(orderId))) as Q | null;
  if (!quote) throw new MvpError('invalid', 'There is no quote for this order yet.');
  if (quote.status === 'accepted' && decision === 'accept') return; // double-tap: already accepted
  if (quote.status !== 'sent') throw new MvpError('invalid', 'This quote is not waiting for your decision.');

  await runIdempotent(ctx, 'mvp.quote.decide', `${quote.id}:${quote.currentVersionId}:${decision}`, async () => {
    const now = nowOf(ctx).toISOString();
    await quoteRepository(ctx).update(quote.id, { status: decision === 'accept' ? 'accepted' : 'negotiating', decisionNote: note ?? '', decidedAt: now, updatedAt: now });
    await audit(ctx, actor, decision === 'accept' ? 'QUOTE_ACCEPTED' : 'QUOTE_CHANGES_REQUESTED', quote.id, orderId,
      { status: 'sent' }, { status: decision === 'accept' ? 'accepted' : 'negotiating', version: quote.currentVersionId }, note);
    await applyEvent(ctx, actor, orderId, decision === 'accept' ? { type: 'QUOTE_ACCEPTED' } : { type: 'QUOTE_CHANGES_REQUESTED' }, { reason: note });
    return true;
  });
}
