/**
 * The order's update feed (the reference design's centre column), built
 * ONLY from stored records: tasks, survey, quote, payments, blockers,
 * checklist, QC, handover, compliance and emergencies. Nothing is made up
 * from stage labels. Sorted by real timestamps, ties broken by id.
 */
import { formatInr } from './money';
import { TASK_TITLES } from './rules';
import type { OrderBundle } from './views';
import type { Evidence, MvpRole } from './types';

export type FeedTone = 'neutral' | 'info' | 'action' | 'done' | 'money' | 'amc';

export interface FeedItem {
  id: string;
  at: string;
  /** Who did it, as a role (names are added by the screen when it may show them). */
  actorRole: MvpRole | 'system';
  actorId?: string;
  tone: FeedTone;
  title: string;
  body?: string;
  evidence?: Evidence[];
}

export function buildFeed(b: OrderBundle): FeedItem[] {
  const out: FeedItem[] = [];
  const push = (i: FeedItem) => { if (i.at) out.push(i); };
  const code = b.order.displayCode ?? b.order.id;

  push({ id: `order_${b.order.id}`, at: b.order.createdAt, actorRole: 'sales', tone: 'info', title: `Order ${code} created`, body: [b.customer?.name, b.site?.address].filter(Boolean).join(' · ') });

  for (const t of b.tasks) {
    // A finished task appears once, as "Done"; only still-open work shows its "New task" entry.
    if (t.status !== 'COMPLETED') push({ id: `tc_${t.id}`, at: t.createdAt, actorRole: 'system', tone: t.type === 'EMERGENCY_RESPONSE' ? 'action' : 'neutral', title: `New task: ${t.title || TASK_TITLES[t.type]}`, body: `Assigned to ${t.assigneeRole}` });
    if (t.startedAt) push({ id: `ts_${t.id}`, at: t.startedAt, actorRole: t.assigneeRole, actorId: t.assigneeId, tone: 'info', title: `Started: ${t.title}` });
    if (t.status === 'COMPLETED' && t.completedAt) push({ id: `td_${t.id}`, at: t.completedAt, actorRole: t.assigneeRole, actorId: t.assigneeId, tone: 'done', title: `Done: ${t.title}`, body: t.notes, evidence: t.evidence });
    if (t.status === 'CANCELLED') push({ id: `tx_${t.id}`, at: t.updatedAt, actorRole: 'admin', tone: 'neutral', title: `Cancelled: ${t.title}`, body: t.notes });
  }

  for (const s of b.surveys) {
    push({ id: `sv_${s.id}`, at: s.submittedAt, actorRole: 'surveyor', actorId: s.surveyorId, tone: s.result === 'FEASIBLE' ? 'done' : 'action',
      title: `Survey: ${s.result.replace(/_/g, ' ').toLowerCase()}`,
      body: `${s.floors} floors · ${s.stops} stops · shaft ${s.shaftWidthMm}×${s.shaftDepthMm} mm · pit ${s.pitMm} · headroom ${s.headroomMm}${s.remarks ? ` · ${s.remarks}` : ''}`, evidence: s.photos });
  }

  for (const q of b.quotes) {
    if (q.sentAt) push({ id: `qs_${q.id}`, at: q.sentAt, actorRole: 'admin', tone: 'info', title: 'Quotation sent', body: `${formatInr(q.sellingPrice)} incl. tax (${formatInr(q.totalExclTax)} + ${q.taxRatePct}% tax)` });
    if (q.decidedAt) push({ id: `qd_${q.id}`, at: q.decidedAt, actorRole: 'customer', actorId: q.decidedBy, tone: q.status === 'ACCEPTED' ? 'done' : 'action', title: q.status === 'ACCEPTED' ? 'Quote accepted' : 'Quote rejected' });
  }

  for (const m of b.milestones) {
    if (m.submittedAt) push({ id: `mp_${m.id}`, at: m.submittedAt, actorRole: 'customer', actorId: m.submittedBy, tone: 'money', title: `Payment proof: ${m.label}`, body: `${m.method ?? ''} ${m.reference ?? ''}`.trim() });
    if (m.verifiedAt && (m.status === 'PAID' || m.status === 'PARTIAL')) push({ id: `mv_${m.id}`, at: m.verifiedAt, actorRole: 'admin', tone: 'money', title: `${m.label}: ${m.status === 'PAID' ? 'paid' : 'part paid'}`, body: `${formatInr(m.amountPaid)} of ${formatInr(m.amount)}` });
  }

  for (const x of b.blockers) {
    push({ id: `bo_${x.id}`, at: x.createdAt, actorRole: x.createdByRole, actorId: x.createdBy, tone: 'action', title: `Blocker: ${x.reason.replace(/_/g, ' ').toLowerCase()}`, body: x.description, evidence: x.evidence });
    if (x.resolvedAt) push({ id: `br_${x.id}`, at: x.resolvedAt, actorRole: 'admin', tone: 'done', title: 'Blocker resolved', body: x.resolutionNote });
  }

  for (const i of b.checklist?.items ?? []) {
    if (i.done && i.completedAt) push({ id: `ci_${i.key}`, at: i.completedAt, actorRole: 'technician', actorId: i.completedBy, tone: 'done', title: i.label, body: i.note, evidence: i.photo ? [i.photo] : undefined });
  }

  for (const q of b.qcRecords) {
    push({ id: `qc_${q.id}`, at: q.createdAt, actorRole: 'qc', actorId: q.inspectorId, tone: q.decision === 'PASS' ? 'done' : 'action', title: `QC ${q.decision}`, body: [q.testResults, q.remarks].filter(Boolean).join(' · '), evidence: q.evidence });
  }

  if (b.handover?.customerApprovedAt) push({ id: 'ho_appr', at: b.handover.customerApprovedAt, actorRole: 'customer', actorId: b.handover.customerApprovedBy, tone: 'done', title: 'Customer approved the handover' });
  if (b.handover?.completedAt) push({ id: 'ho_done', at: b.handover.completedAt, actorRole: 'admin', tone: 'done', title: 'Handover completed', body: b.handover.overrides.length ? `Overrides: ${b.handover.overrides.map(o => `${o.gate} (${o.reason})`).join('; ')}` : b.handover.finalTest, evidence: b.handover.photos });
  if (b.amc) push({ id: 'amc', at: b.amc.createdAt, actorRole: 'system', tone: 'amc', title: 'Warranty and AMC tracking started', body: `Warranty ends ${new Date(b.amc.warrantyEnd).toLocaleDateString('en-IN')}` });

  for (const d of b.compliance) {
    if (d.status === 'DONE') push({ id: `cd_${d.id}`, at: d.updatedAt, actorRole: 'admin', tone: 'done', title: `Document done: ${d.type.replace(/_/g, ' ').toLowerCase()}`, body: d.note, evidence: d.file ? [d.file] : undefined });
  }

  for (const s of b.serviceCases) {
    push({ id: `sc_${s.id}`, at: s.createdAt, actorRole: 'customer', actorId: s.raisedBy, tone: 'action', title: `EMERGENCY: ${s.description}` });
    if (s.acknowledgedAt) push({ id: `sa_${s.id}`, at: s.acknowledgedAt, actorRole: 'technician', actorId: s.assigneeId, tone: 'info', title: 'Emergency acknowledged' });
    if (s.resolvedAt) push({ id: `ss_${s.id}`, at: s.resolvedAt, actorRole: 'technician', actorId: s.assigneeId, tone: 'done', title: 'Emergency resolved', body: s.resolutionNote, evidence: s.photo ? [s.photo] : undefined });
  }

  return out.sort((a, b2) => (a.at < b2.at ? -1 : a.at > b2.at ? 1 : a.id < b2.id ? -1 : 1));
}
