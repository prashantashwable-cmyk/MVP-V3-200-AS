/**
 * Order service: lead → qualification → survey → quote → booking →
 * payments → site readiness → PO → delivery (D-04, D-08, D-14, D-15, D-30).
 */
import { runIdempotent } from '../../lib/idempotency';
import { MVP_CONFIG } from '../config';
import { isOpenTask } from '../health';
import { defaultMilestoneAmounts, isBelowMinimum, marginMeasures, quotePricing } from '../money';
import { nextSequence, newId, type Order } from '../repo';
import { INSTALL_CHECKLIST_ITEMS } from '../types';
import type {
  Evidence, LeadStatus, MilestoneKind, MvpLead, MvpMilestone, MvpQuote, MvpSurvey, QuoteLines, SurveyResult,
} from '../types';
import {
  applyEvent, audit, createTaskFromSpec, isAdmin, loadOrder, loadSettings, loadTask, MvpError, notify, nowOf, orderTasks, tryGet,
  repos, requirePermission, requireRole, requireTaskOwner, resolveAssignee, setTaskStatus, type ServiceCtx,
} from './core';
import { addDays } from '../money';

const LEAD_STAGE_FOR: Record<LeadStatus, MvpLead['stage']> = {
  NEW: 'captured', CONTACTED: 'contacted', QUALIFIED: 'assigned', SURVEY: 'survey_done', QUOTE: 'quoted', WON: 'closed_won', LOST: 'closed_lost',
};

async function setLeadStatus(ctx: ServiceCtx, leadId: string | undefined, status: LeadStatus, extra: Partial<MvpLead> = {}): Promise<void> {
  if (!leadId) return;
  const r = repos(ctx).leads;
  const lead = await r.get(leadId);
  if (!lead || lead.mvpStatus === status) return;
  // Once won, a lead only becomes LOST through cancellation before booking (D-04).
  if (lead.mvpStatus === 'WON' && status !== 'WON') return;
  await r.update(leadId, { mvpStatus: status, stage: LEAD_STAGE_FOR[status], updatedAt: nowOf(ctx).toISOString(), ...extra }, lead.version ?? 0);
  await audit(ctx, 'LEAD_STATUS_CHANGED', 'Lead', leadId, lead.orderId, { status: lead.mvpStatus }, { status });
}

// ---------------------------------------------------------------- Leads (spec §13, §23)

export interface NewLeadInput {
  name: string; phone: string; location: string; source: string; siteType: string; floors: number;
  liftRequirement: string; constructionStage: string; notes: string; consent: boolean; sitePhotos: Evidence[];
  nextFollowup?: string;
}

export async function createLead(ctx: ServiceCtx, input: NewLeadInput): Promise<MvpLead> {
  requirePermission(ctx, 'lead.create');
  if (!input.name.trim() || !input.phone.trim()) throw new MvpError('invalid', 'Customer name and phone are required.');
  if (!input.consent) throw new MvpError('invalid', 'The customer must consent to being contacted. ⚖ VERIFY');
  const now = nowOf(ctx).toISOString();
  const lead: MvpLead = {
    id: newId('lead'), stage: 'captured', mvpStatus: 'NEW', ...input, salesOwnerId: ctx.actor.id,
    createdBy: ctx.actor.id, createdAt: now, updatedAt: now, version: 0,
  };
  await repos(ctx).leads.create(lead);
  await audit(ctx, 'LEAD_CREATED', 'Lead', lead.id, undefined, undefined, { name: lead.name, source: lead.source });
  const settings = await loadSettings(ctx);
  const spec = { type: 'QUALIFY_LEAD' as const, assignee: 'sales' as const, priority: 0, dueDate: addDays(nowOf(ctx), 2) };
  await createTaskFromSpec(ctx, { orderId: '', customerId: '', leadId: lead.id, label: lead.name }, spec, 'LEAD',
    resolveAssignee(spec.assignee, null, settings, nowOf(ctx), { salesOwnerId: lead.salesOwnerId }));
  return lead;
}

/** Lead tasks are always the sales owner's, so the query names the assignee (rule-provable). */
function leadTasks(ctx: ServiceCtx, lead: MvpLead) {
  return repos(ctx).tasks.queryWhere([['leadId', '==', lead.id], ['assigneeId', '==', lead.salesOwnerId]]);
}

function requireLeadAccess(ctx: ServiceCtx, lead: MvpLead): void {
  if (isAdmin(ctx)) return;
  if (ctx.actor.role === 'sales' && lead.salesOwnerId === ctx.actor.id) return;
  throw new MvpError('forbidden', 'Only the lead\'s sales owner or the Admin can change it.');
}

export async function logFollowUp(ctx: ServiceCtx, leadId: string, note: string, nextFollowup?: string): Promise<void> {
  const lead = await repos(ctx).leads.get(leadId);
  if (!lead) throw new MvpError('not_found', 'Lead not found.');
  requireLeadAccess(ctx, lead);
  const notes = `${lead.notes ? lead.notes + '\n' : ''}[${nowOf(ctx).toISOString().slice(0, 10)}] ${note}`;
  await repos(ctx).leads.update(leadId, { notes, nextFollowup, updatedAt: nowOf(ctx).toISOString() }, lead.version ?? 0);
  if (lead.mvpStatus === 'NEW') await setLeadStatus(ctx, leadId, 'CONTACTED');
  await audit(ctx, 'LEAD_FOLLOW_UP', 'Lead', leadId, undefined, { nextFollowup: lead.nextFollowup }, { nextFollowup, note });
}

export async function markLeadLost(ctx: ServiceCtx, leadId: string, reason: string): Promise<void> {
  const lead = await repos(ctx).leads.get(leadId);
  if (!lead) throw new MvpError('not_found', 'Lead not found.');
  requireLeadAccess(ctx, lead);
  if (lead.orderId) throw new MvpError('invalid', 'This lead is already an order. Cancel the order instead.');
  await setLeadStatus(ctx, leadId, 'LOST', { lostReason: reason });
  for (const t of (await leadTasks(ctx, lead)).filter(isOpenTask)) await setTaskStatus(ctx, t, 'CANCELLED', { notes: reason });
}

/**
 * Qualify a lead (D-04): Customer + Site + Order with an `AE-####` code.
 * The three records get ids derived from the lead and the whole command
 * runs under one idempotency key, so a retry after a partial failure
 * finishes the same records instead of creating a second order.
 */
export async function qualifyLead(ctx: ServiceCtx, leadId: string, lift: Order['lift'] = {}): Promise<Order> {
  const r = repos(ctx);
  const lead = await r.leads.get(leadId);
  if (!lead) throw new MvpError('not_found', 'Lead not found.');
  requireLeadAccess(ctx, lead);
  const { result } = await runIdempotent(ctx.repo, 'mvp.qualifyLead', leadId, async () => {
    const existing = await tryGet(r.orders.get(`ord_${leadId}`));
    if (existing) return existing.id;
    const now = nowOf(ctx).toISOString();
    const customerId = `cust_${leadId}`;
    const siteId = `site_${leadId}`;
    // `orderId` lets the order's participants read these two records (rules).
    await r.customers.create({ id: customerId as any, name: lead.name, phone: lead.phone, sourceLeadId: leadId as any, orderId: `ord_${leadId}`, createdAt: now, updatedAt: now } as any);
    await r.sites.create({ id: siteId as any, customerId: customerId as any, address: lead.location, floors: lead.floors, orderId: `ord_${leadId}`, createdAt: now, updatedAt: now } as any);
    const seq = await nextSequence(ctx.repo, 'orders');
    const order: Order = {
      id: `ord_${leadId}` as any,
      customerId: customerId as any,
      siteId: siteId as any,
      sourceLeadId: leadId as any,
      stage: 'lead',
      ownerUserId: lead.salesOwnerId as any,
      salesUserId: lead.salesOwnerId,
      title: `${lead.name} — ${lead.location}`,
      displayCode: `AE-${seq}`,
      status: 'ACTIVE',
      participantIds: [lead.salesOwnerId],
      lift: { floors: lead.floors, type: lead.liftRequirement, ...lift },
      displaySummary: { customerName: lead.name, siteAddress: lead.location },
      createdAt: now,
      updatedAt: now,
      version: 0,
    };
    await r.orders.create(order);
    await audit(ctx, 'ORDER_CREATED', 'Project', order.id, order.id, undefined, { displayCode: order.displayCode, leadId });
    return order.id;
  });
  const orderId = result as string;
  let order = await loadOrder(ctx, orderId);
  if (order.stage === 'lead') {
    const settings = await loadSettings(ctx);
    const fee = settings.surveyFeeInr ?? MVP_CONFIG.SURVEY_FEE_INR;
    if (fee > 0 && !(await tryGet(r.milestones.get(`ms_${orderId}_SURVEY_FEE`)))) {
      await createMilestone(ctx, order, 'SURVEY_FEE', 'Survey fee', fee, addDays(nowOf(ctx), 2));
    }
    for (const t of (await leadTasks(ctx, lead)).filter(isOpenTask)) await setTaskStatus(ctx, t, 'COMPLETED');
    order = (await applyEvent(ctx, order, { type: 'LEAD_QUALIFIED', surveyFeeInr: fee })).order;
    await r.leads.update(leadId, { orderId, updatedAt: nowOf(ctx).toISOString() }, (await r.leads.get(leadId))!.version ?? 0);
    await setLeadStatus(ctx, leadId, 'QUALIFIED');
  }
  return order;
}

// ---------------------------------------------------------------- Survey (spec §15, D-30)

export async function assignSurveyor(ctx: ServiceCtx, orderId: string, surveyorId: string, scheduledFor: string): Promise<Order> {
  requireRole(ctx, ['admin'], 'assign a surveyor');
  const order = await loadOrder(ctx, orderId);
  const fee = await tryGet(repos(ctx).milestones.get(`ms_${orderId}_SURVEY_FEE`));
  if (fee && fee.status !== 'PAID' && fee.status !== 'WAIVED') {
    throw new MvpError('gate', 'Survey fee not paid. Record it as PAID or waive it first.');
  }
  const res = await applyEvent(ctx, order, { type: 'SURVEYOR_ASSIGNED', surveyorId, scheduledFor });
  await setLeadStatus(ctx, order.sourceLeadId, 'SURVEY');
  return res.order;
}

export async function waiveSurveyFee(ctx: ServiceCtx, orderId: string, reason: string): Promise<void> {
  requireRole(ctx, ['admin'], 'waive the survey fee');
  if (!reason.trim()) throw new MvpError('invalid', 'A reason is required to waive the fee.');
  const m = await repos(ctx).milestones.get(`ms_${orderId}_SURVEY_FEE`);
  if (!m) throw new MvpError('not_found', 'This order has no survey fee.');
  await repos(ctx).milestones.update(m.id, { status: 'WAIVED', notes: reason, updatedAt: nowOf(ctx).toISOString() }, m.version ?? 0);
  await audit(ctx, 'PAYMENT_WAIVED', 'PaymentMilestone', m.id, orderId, { status: m.status }, { status: 'WAIVED' }, reason);
  const order = await loadOrder(ctx, orderId);
  await applyEvent(ctx, order, { type: 'PAYMENT_PAID', kind: 'SURVEY_FEE' }, {}, 'Survey fee waived');
}

export type SurveyInput = Omit<MvpSurvey, 'id' | 'orderId' | 'customerId' | 'surveyorId' | 'submittedAt' | 'createdAt' | 'updatedAt' | 'version'>;

export async function submitSurvey(ctx: ServiceCtx, orderId: string, input: SurveyInput): Promise<Order> {
  const order = await loadOrder(ctx, orderId);
  const task = (await orderTasks(ctx, orderId)).find(t => t.type === 'SURVEY' && isOpenTask(t));
  if (!task) throw new MvpError('invalid', 'There is no open survey task on this order.');
  requireTaskOwner(ctx, task);
  if (!input.photos?.length) throw new MvpError('invalid', 'Add at least one site photo.');
  const now = nowOf(ctx).toISOString();
  const survey: MvpSurvey = {
    ...input, id: newId('srv'), orderId, customerId: order.customerId, surveyorId: task.assigneeId,
    submittedAt: now, createdAt: now, updatedAt: now, version: 0,
  };
  await repos(ctx).surveys.create(survey);
  await audit(ctx, 'SURVEY_SUBMITTED', 'Survey', survey.id, orderId, undefined, { result: survey.result });
  // Lead status first: once the survey task closes, the surveyor is no longer one of the order's readers.
  if (input.result === 'FEASIBLE') await setLeadStatus(ctx, order.sourceLeadId, 'QUOTE');
  const res = await applyEvent(ctx, order, { type: 'SURVEY_SUBMITTED', result: input.result as SurveyResult }, {
    lift: { ...order.lift, floors: input.floors, stops: input.stops, capacity: input.capacity },
  });
  return res.order;
}

export async function completeSiteCorrection(ctx: ServiceCtx, taskId: string, evidence: Evidence[], note = ''): Promise<Order> {
  const task = await loadTask(ctx, taskId);
  if (task.type !== 'SITE_CORRECTION') throw new MvpError('invalid', 'Not a site-correction task.');
  requireTaskOwner(ctx, task);
  const order = await loadOrder(ctx, task.orderId);
  const lastSurvey = (await repos(ctx).surveys.query({ orderId: task.orderId } as any)).sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))[0];
  await repos(ctx).tasks.update(task.id, { evidence: [...task.evidence, ...evidence], notes: note }, task.version ?? 0);
  return (await applyEvent(ctx, order, { type: 'SITE_CORRECTION_DONE', surveyorId: lastSurvey?.surveyorId ?? 'role:surveyor' })).order;
}

// ---------------------------------------------------------------- Quote (spec §16, D-15)

export async function prepareQuote(ctx: ServiceCtx, orderId: string, lines: QuoteLines, taxRatePct: number, estimatedCost: number): Promise<MvpQuote> {
  requirePermission(ctx, 'quote.create');
  requireRole(ctx, ['admin'], 'prepare a quote');
  const order = await loadOrder(ctx, orderId);
  if (Object.values(lines).some(v => !(v >= 0)) || !(estimatedCost > 0) || !(taxRatePct >= 0)) {
    throw new MvpError('invalid', 'Enter every quote line, the tax rate and the estimated cost.');
  }
  const settings = await loadSettings(ctx);
  const confirmedRate = settings.gstRatePct ?? MVP_CONFIG.GST_RATE_PCT;
  const price = quotePricing(lines, taxRatePct);
  const measures = marginMeasures(price.totalExclTax, estimatedCost);
  const belowMin = isBelowMinimum(measures.markupPct);
  const now = nowOf(ctx).toISOString();
  const r = repos(ctx);
  // A new quote supersedes any earlier unsent one.
  for (const q of await r.quotes.query({ orderId } as any)) {
    if (q.status === 'DRAFT' || q.status === 'PENDING_APPROVAL' || q.status === 'APPROVED') {
      await r.quotes.update(q.id, { status: 'REJECTED', updatedAt: now }, q.version ?? 0);
    }
  }
  const quote: MvpQuote = {
    id: newId('quote'), orderId, customerId: order.customerId, lines, ...price, taxRatePct,
    taxRateConfirmed: confirmedRate !== null && confirmedRate === taxRatePct,
    status: belowMin ? 'PENDING_APPROVAL' : 'APPROVED', approvalRequired: belowMin,
    createdBy: ctx.actor.id, createdAt: now, updatedAt: now, version: 0,
  };
  await r.quotes.create(quote);
  await r.quoteCosts.create({ id: quote.id, quoteId: quote.id, orderId, customerId: order.customerId, estimatedCost, ...measures, createdAt: now, updatedAt: now, version: 0 });
  await audit(ctx, 'QUOTE_PREPARED', 'Quote', quote.id, orderId, undefined, { sellingPrice: quote.sellingPrice, markupPct: measures.markupPct, approvalRequired: belowMin });
  if (belowMin) {
    await r.approvals.create({
      id: `apr_${quote.id}` as any, projectId: orderId as any, entityType: 'Quote', entityId: quote.id, requestedBy: ctx.actor.id as any,
      requiredPermission: 'quote.approve', status: 'pending', createdAt: now,
    });
  }
  await applyEvent(ctx, order, { type: 'QUOTE_PREPARED', belowMinimum: belowMin });
  return quote;
}

export async function approveMargin(ctx: ServiceCtx, quoteId: string, reason: string): Promise<void> {
  requirePermission(ctx, 'quote.approve');
  requireRole(ctx, ['admin'], 'approve a below-minimum margin');
  const r = repos(ctx);
  const q = await r.quotes.get(quoteId);
  if (!q || q.status !== 'PENDING_APPROVAL') throw new MvpError('invalid', 'This quote is not waiting for approval.');
  const now = nowOf(ctx).toISOString();
  await r.quotes.update(quoteId, { status: 'APPROVED', approvedBy: ctx.actor.id, approvedAt: now, updatedAt: now }, q.version ?? 0);
  const apr = await r.approvals.get(`apr_${quoteId}`);
  if (apr) await r.approvals.update(apr.id, { status: 'approved', decidedBy: ctx.actor.id as any, decidedAt: now, reason } as any);
  await audit(ctx, 'QUOTE_APPROVED', 'Quote', quoteId, q.orderId, { status: q.status }, { status: 'APPROVED' }, reason);
  await applyEvent(ctx, await loadOrder(ctx, q.orderId), { type: 'MARGIN_APPROVED' });
}

export async function sendQuote(ctx: ServiceCtx, quoteId: string): Promise<void> {
  requireRole(ctx, ['admin'], 'send a quote');
  const r = repos(ctx);
  const q = await r.quotes.get(quoteId);
  if (!q) throw new MvpError('not_found', 'Quote not found.');
  if (q.status === 'PENDING_APPROVAL') throw new MvpError('gate', 'Margin is below the minimum: the Admin must approve it before sending.');
  if (q.status !== 'APPROVED') throw new MvpError('invalid', `A ${q.status} quote cannot be sent.`);
  const now = nowOf(ctx).toISOString();
  await r.quotes.update(quoteId, { status: 'SENT', sentAt: now, updatedAt: now }, q.version ?? 0);
  await audit(ctx, 'QUOTE_SENT', 'Quote', quoteId, q.orderId, { status: q.status }, { status: 'SENT' });
  await applyEvent(ctx, await loadOrder(ctx, q.orderId), { type: 'QUOTE_SENT' });
}

async function createMilestone(ctx: ServiceCtx, order: Order, kind: MilestoneKind, label: string, amount: number, dueDate?: string): Promise<MvpMilestone> {
  const now = nowOf(ctx).toISOString();
  const m: MvpMilestone = {
    id: `ms_${order.id}_${kind}`, orderId: order.id, customerId: order.customerId, kind, label, amount, amountPaid: 0,
    dueDate, status: 'PENDING', createdAt: now, updatedAt: now, version: 0,
  };
  await repos(ctx).milestones.create(m);
  await audit(ctx, 'PAYMENT_MILESTONE_CREATED', 'PaymentMilestone', m.id, order.id, undefined, { kind, amount, dueDate });
  return m;
}

export async function decideQuote(ctx: ServiceCtx, quoteId: string, accept: boolean, note = ''): Promise<Order> {
  requirePermission(ctx, 'quote.decide');
  const r = repos(ctx);
  const q = await r.quotes.get(quoteId);
  if (!q) throw new MvpError('not_found', 'Quote not found.');
  if (ctx.actor.role === 'customer' && ctx.actor.customerId !== q.customerId) throw new MvpError('forbidden', 'This is not your quote.');
  if (q.status !== 'SENT') throw new MvpError('invalid', 'Only a sent quote can be accepted or rejected.');
  const now = nowOf(ctx).toISOString();
  const status = accept ? 'ACCEPTED' : 'REJECTED';
  await r.quotes.update(quoteId, { status, decidedAt: now, decidedBy: ctx.actor.id, updatedAt: now }, q.version ?? 0);
  await audit(ctx, accept ? 'QUOTE_ACCEPTED' : 'QUOTE_REJECTED', 'Quote', quoteId, q.orderId, { status: q.status }, { status }, note);
  const order = await loadOrder(ctx, q.orderId);
  if (!accept) return (await applyEvent(ctx, order, { type: 'QUOTE_REJECTED' })).order;
  const fee = await tryGet(r.milestones.get(`ms_${order.id}_SURVEY_FEE`));
  const feeCredit = fee && fee.status === 'PAID' ? fee.amountPaid : 0; // D-30: the fee is credited against the token
  const amounts = defaultMilestoneAmounts(q.sellingPrice);
  await createMilestone(ctx, order, 'BOOKING_TOKEN', 'Booking token', Math.max(0, amounts.BOOKING_TOKEN - feeCredit), addDays(nowOf(ctx), 3));
  await createMilestone(ctx, order, 'DELIVERY', 'Delivery payment', amounts.DELIVERY);
  await createMilestone(ctx, order, 'FINAL', 'Final handover payment', amounts.FINAL);
  return (await applyEvent(ctx, order, { type: 'QUOTE_ACCEPTED' })).order;
}

// ---------------------------------------------------------------- Payments (spec §17, D-14)

export async function submitPaymentProof(ctx: ServiceCtx, milestoneId: string, reference: string, method: string, proofNote = ''): Promise<void> {
  const r = repos(ctx);
  const m = await r.milestones.get(milestoneId);
  if (!m) throw new MvpError('not_found', 'Payment not found.');
  if (ctx.actor.role === 'customer' && ctx.actor.customerId !== m.customerId) throw new MvpError('forbidden', 'This is not your payment.');
  if (!['admin', 'customer'].includes(ctx.actor.role)) throw new MvpError('forbidden', 'Only the customer or the Admin can submit payment proof.');
  if (!reference.trim()) throw new MvpError('invalid', 'Enter the UTR or reference number.');
  const now = nowOf(ctx).toISOString();
  await r.milestones.update(m.id, { reference, method, proofNote, submittedAt: now, submittedBy: ctx.actor.id, updatedAt: now }, m.version ?? 0);
  await audit(ctx, 'PAYMENT_PROOF_SUBMITTED', 'PaymentMilestone', m.id, m.orderId, { reference: m.reference }, { reference, method });
  await notify(ctx, 'role:admin', 'payment_proof', 'Payment proof to verify', `${m.label}: ${reference}`, m.orderId, `${m.id}_${reference}`);
}

/** The Admin verifies a payment (D-14). Amount defaults to the remaining balance. */
export async function markPaymentPaid(ctx: ServiceCtx, milestoneId: string, opts: { amount?: number; reference?: string; method?: string } = {}): Promise<MvpMilestone> {
  requireRole(ctx, ['admin'], 'verify a payment');
  const r = repos(ctx);
  const m = await r.milestones.get(milestoneId);
  if (!m) throw new MvpError('not_found', 'Payment not found.');
  if (m.status === 'PAID' || m.status === 'WAIVED') throw new MvpError('invalid', 'This payment is already settled.');
  const amount = opts.amount ?? m.amount - m.amountPaid;
  if (!(amount > 0)) throw new MvpError('invalid', 'Enter a positive amount.');
  const amountPaid = m.amountPaid + amount;
  const status = amountPaid >= m.amount ? 'PAID' : 'PARTIAL';
  const now = nowOf(ctx).toISOString();
  const updated = await r.milestones.update(m.id, {
    amountPaid, status, reference: opts.reference ?? m.reference, method: opts.method ?? m.method,
    verifiedBy: ctx.actor.id, verifiedAt: now, updatedAt: now,
  }, m.version ?? 0);
  await audit(ctx, 'PAYMENT_STATUS_CHANGED', 'PaymentMilestone', m.id, m.orderId, { status: m.status, amountPaid: m.amountPaid }, { status, amountPaid });
  if (status === 'PAID') {
    const order = await loadOrder(ctx, m.orderId);
    await applyEvent(ctx, order, { type: 'PAYMENT_PAID', kind: m.kind });
    if (m.kind === 'BOOKING_TOKEN') await setLeadStatus(ctx, order.sourceLeadId, 'WON');
  }
  return updated;
}

export async function markPaymentFailed(ctx: ServiceCtx, milestoneId: string, note: string, refunded = false): Promise<void> {
  requireRole(ctx, ['admin'], 'change a payment status');
  const m = await repos(ctx).milestones.get(milestoneId);
  if (!m) throw new MvpError('not_found', 'Payment not found.');
  const status = refunded ? 'REFUNDED' : 'FAILED';
  await repos(ctx).milestones.update(m.id, { status, notes: note, updatedAt: nowOf(ctx).toISOString() }, m.version ?? 0);
  await audit(ctx, 'PAYMENT_STATUS_CHANGED', 'PaymentMilestone', m.id, m.orderId, { status: m.status }, { status }, note);
}

export async function editMilestoneAmount(ctx: ServiceCtx, milestoneId: string, amount: number, reason: string): Promise<void> {
  requireRole(ctx, ['admin'], 'edit a payment amount');
  const m = await repos(ctx).milestones.get(milestoneId);
  if (!m) throw new MvpError('not_found', 'Payment not found.');
  if (!(amount >= 0) || !reason.trim()) throw new MvpError('invalid', 'Enter an amount and a reason.');
  await repos(ctx).milestones.update(m.id, { amount, updatedAt: nowOf(ctx).toISOString() }, m.version ?? 0);
  await audit(ctx, 'PAYMENT_AMOUNT_CHANGED', 'PaymentMilestone', m.id, m.orderId, { amount: m.amount }, { amount }, reason);
}

// ---------------------------------------------------------------- Site readiness, PO, delivery (D-08, spec §24)

export async function raisePurchaseOrder(
  ctx: ServiceCtx, orderId: string, po: { supplierId: string; supplierName: string; amount: number; expectedDeliveryDate: string },
): Promise<void> {
  requirePermission(ctx, 'supplier.manage');
  const order = await loadOrder(ctx, orderId);
  if (!po.supplierName.trim() || !po.expectedDeliveryDate) throw new MvpError('invalid', 'Choose the supplier and the expected delivery date.');
  const now = nowOf(ctx).toISOString();
  const id = newId('po');
  await repos(ctx).purchaseOrders.create({
    id, orderId, customerId: order.customerId, projectId: orderId, supplierId: po.supplierId, supplierName: po.supplierName,
    amount: po.amount, expectedDeliveryDate: po.expectedDeliveryDate, materialStatus: 'ORDERED', status: 'sent_to_supplier',
    idempotencyKey: id, createdBy: ctx.actor.id, createdAt: now, updatedAt: now, version: 0,
  } as any);
  await audit(ctx, 'PO_CREATED', 'PurchaseOrder', id, orderId, undefined, { supplier: po.supplierName, amount: po.amount, expectedDeliveryDate: po.expectedDeliveryDate });
  await applyEvent(ctx, order, { type: 'PO_RAISED' });
}

export async function updatePurchaseOrder(ctx: ServiceCtx, poId: string, patch: { materialStatus?: 'ORDERED' | 'DISPATCHED' | 'DELAYED' | 'RECEIVED'; expectedDeliveryDate?: string; delayNote?: string }): Promise<void> {
  requirePermission(ctx, 'supplier.manage');
  const po = await repos(ctx).purchaseOrders.get(poId);
  if (!po) throw new MvpError('not_found', 'PO not found.');
  await repos(ctx).purchaseOrders.update(poId, { ...patch, updatedAt: nowOf(ctx).toISOString() } as any, po.version ?? 0);
  await audit(ctx, 'PO_UPDATED', 'PurchaseOrder', poId, po.orderId, { materialStatus: po.materialStatus, expectedDeliveryDate: po.expectedDeliveryDate }, patch);
}

export async function submitSiteReadiness(ctx: ServiceCtx, orderId: string, photos: Evidence[], note = ''): Promise<Order> {
  const order = await loadOrder(ctx, orderId);
  const task = (await orderTasks(ctx, orderId)).find(t => t.type === 'SITE_READINESS' && isOpenTask(t));
  if (!task) throw new MvpError('invalid', 'There is no open site-readiness task.');
  requireTaskOwner(ctx, task);
  if (!photos.length) throw new MvpError('invalid', 'Upload at least one photo of the ready site.');
  await repos(ctx).tasks.update(task.id, { evidence: [...task.evidence, ...photos], notes: note, updatedAt: nowOf(ctx).toISOString() }, task.version ?? 0);
  return (await applyEvent(ctx, await loadOrder(ctx, order.id), { type: 'READINESS_SUBMITTED' })).order;
}

export async function confirmSiteReady(ctx: ServiceCtx, orderId: string): Promise<Order> {
  requireRole(ctx, ['admin'], 'confirm the site is ready');
  const order = await loadOrder(ctx, orderId);
  const token = await repos(ctx).milestones.get(`ms_${orderId}_BOOKING_TOKEN`);
  if (!token || token.status !== 'PAID') throw new MvpError('gate', 'Booking token not paid.');
  const pos = await repos(ctx).purchaseOrders.query({ orderId } as any);
  const expected = pos.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]?.expectedDeliveryDate;
  const res = await applyEvent(ctx, order, { type: 'SITE_CONFIRMED', expectedDeliveryDate: expected });
  const delivery = await repos(ctx).milestones.get(`ms_${orderId}_DELIVERY`);
  const payTask = res.created.find(t => t.type === 'COLLECT_DELIVERY_PAYMENT');
  if (delivery && payTask) await repos(ctx).milestones.update(delivery.id, { dueDate: payTask.dueDate, updatedAt: nowOf(ctx).toISOString() }, delivery.version ?? 0);
  return res.order;
}

export async function markMaterialReceived(ctx: ServiceCtx, orderId: string, technicianId: string, photos: Evidence[]): Promise<Order> {
  requireRole(ctx, ['admin'], 'mark material received');
  if (!technicianId) throw new MvpError('invalid', 'Choose the installing technician.');
  const order = await loadOrder(ctx, orderId);
  const r = repos(ctx);
  for (const po of await r.purchaseOrders.query({ orderId } as any)) {
    if (po.materialStatus !== 'RECEIVED') await r.purchaseOrders.update(po.id, { materialStatus: 'RECEIVED', status: 'delivered', updatedAt: nowOf(ctx).toISOString() } as any, po.version ?? 0);
  }
  const now = nowOf(ctx).toISOString();
  if (!(await r.checklists.get(orderId))) {
    await r.checklists.create({
      id: orderId, orderId, customerId: order.customerId,
      items: INSTALL_CHECKLIST_ITEMS.map(([key, label]) => ({ key, label, done: false })),
      createdAt: now, updatedAt: now, version: 0,
    });
  }
  const res = await applyEvent(ctx, order, { type: 'MATERIAL_RECEIVED', technicianId });
  const inst = res.created.find(t => t.type === 'INSTALLATION');
  if (inst && photos.length) await r.tasks.update(inst.id, { evidence: photos, notes: 'Material received photos' }, inst.version ?? 0);
  await audit(ctx, 'MATERIAL_RECEIVED', 'Project', orderId, orderId, undefined, { technicianId, photos: photos.length });
  return res.order;
}

