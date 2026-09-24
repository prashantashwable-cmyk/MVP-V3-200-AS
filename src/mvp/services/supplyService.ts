/**
 * Site readiness, supplier POs and delivery (spec §14 customer actions, §24; D-08, D-14).
 * The customer's checklist is recorded on their own SITE_READINESS task; the Admin confirms
 * or returns it. POs reuse the canonical PurchaseOrder and the existing idempotent
 * createPurchaseOrderIdempotent; PO amounts are Admin/Owner-only (rules). Material received
 * creates a DeliveryReceipt and an InstallationJob and moves the order to INSTALLATION.
 */

import type { DeliveryReceipt, InstallationJob, PurchaseOrder, Supplier, Task } from '../../domain/entities';
import {
  createPurchaseOrderIdempotent, deliveryReceiptRepository, installationJobRepository, projectRepository,
  purchaseOrderRepository, supplierRepository, taskRepository,
} from '../../repository/entities';
import { createIfAbsent } from '../../repository/transactions';
import { recordAuditEvent, newCorrelationId } from '../../lib/audit';
import { assertGate } from '../gates';
import { addDays } from '../format';
import { DUE_DAYS } from '../config';
import { isOpenTask } from '../health';
import { notify } from './notify';
import { setMilestoneDueDate } from './paymentService';
import {
  applyEvent, changeDueDate, customerToken, isAssignee, listOrderTasks, MvpError, nowOf, type MvpActor, type MvpCtx,
} from './orderService';

function requireAdmin(actor: MvpActor, what: string) {
  if (actor.role !== 'admin') throw new MvpError('forbidden', `Only the Admin can ${what}.`);
}

async function audit(ctx: MvpCtx, actor: MvpActor, action: string, entityType: string, entityId: string, orderId: string | undefined, before: unknown, after: unknown, reason?: string) {
  await recordAuditEvent(ctx, {
    actorId: actor.userId, actorRole: actor.role, action, entityType, entityId, projectId: orderId,
    before, after, reason, source: 'ui', correlationId: newCorrelationId(),
  });
}

async function openTask(ctx: MvpCtx, orderId: string, type: Task['type']): Promise<Task | undefined> {
  return (await listOrderTasks(ctx, orderId)).find(t => t.type === type && isOpenTask(t));
}

// ---------------------------------------------------------------------------
// Site readiness (the 2-week rule)
// ---------------------------------------------------------------------------

export const READINESS_ITEMS = [
  { key: 'shaftComplete', label: 'Lift shaft complete' },
  { key: 'pitDry', label: 'Pit dry and clean' },
  { key: 'powerAvailable', label: 'Power available (or date it will be)' },
  { key: 'accessForMaterial', label: 'Access for material delivery' },
  { key: 'storageSpace', label: 'Storage space for material' },
] as const;

export type ReadinessKey = typeof READINESS_ITEMS[number]['key'];

export interface ReadinessInput {
  items: Record<ReadinessKey, { ok: boolean; photoId?: string }>;
  powerDate?: string;
  note?: string;
}

/** Customer submits the readiness checklist; every item needs a photo (power may give a date instead). */
export async function submitReadiness(ctx: MvpCtx, actor: MvpActor, orderId: string, input: ReadinessInput): Promise<void> {
  const task = await openTask(ctx, orderId, 'SITE_READINESS');
  if (!task) throw new MvpError('invalid', 'Site readiness is not requested for this order right now.');
  if (actor.role !== 'admin' && !isAssignee(task, actor)) throw new MvpError('forbidden', 'Only the customer of this order can submit site readiness.');
  const missing = READINESS_ITEMS.filter(i => {
    const it = input.items?.[i.key];
    if (i.key === 'powerAvailable' && !it?.ok && input.powerDate) return false;
    return !it?.ok || !it.photoId;
  });
  if (missing.length) throw new MvpError('invalid', `Please confirm with a photo: ${missing.map(m => m.label).join(', ')}.`);
  const photos = READINESS_ITEMS.map(i => input.items[i.key].photoId).filter(Boolean) as string[];
  await taskRepository(ctx).update(task.id, {
    data: { readiness: input.items, powerDate: input.powerDate ?? null, note: input.note ?? '' },
    evidenceIds: photos, notes: input.note ?? '', updatedAt: nowOf(ctx).toISOString(),
  }, task.version ?? 0);
  await applyEvent(ctx, actor, orderId, { type: 'READINESS_SUBMITTED' });
  await audit(ctx, actor, 'SITE_READINESS_SUBMITTED', 'Task', task.id, orderId, undefined, { photos: photos.length, powerDate: input.powerDate });
}

/** Admin returns the readiness with a reason; the customer task reopens (+7 days). */
export async function returnReadiness(ctx: MvpCtx, actor: MvpActor, orderId: string, reason: string): Promise<void> {
  requireAdmin(actor, 'return site readiness');
  if (!reason?.trim()) throw new MvpError('invalid', 'Tell the customer what is still missing.');
  if (!(await openTask(ctx, orderId, 'VERIFY_SITE_READY'))) throw new MvpError('invalid', 'There is no site readiness to verify.');
  await applyEvent(ctx, actor, orderId, { type: 'READINESS_RETURNED' }, { reason });
  await audit(ctx, actor, 'SITE_READINESS_RETURNED', 'Project', orderId, orderId, undefined, undefined, reason);
  const order = await projectRepository(ctx).get(orderId);
  if (order) await notify(ctx, customerToken(order.customerId), 'mvp_task_due', orderId, `readiness-returned:${nowOf(ctx).getTime()}`);
}

/** Admin confirms the site is ready → DELIVERY (soft gate: token paid, D-14). */
export async function confirmSiteReady(ctx: MvpCtx, actor: MvpActor, orderId: string): Promise<void> {
  requireAdmin(actor, 'confirm site readiness');
  await assertGate(ctx, orderId, 'SITE_READY_ENTRY');
  const po = await latestPo(ctx, orderId);
  const expected = po?.expectedDeliveryDate;
  await applyEvent(ctx, actor, orderId, { type: 'SITE_READY_CONFIRMED', poExpectedDate: expected });
  const deliveryDate = expected ? new Date(expected) : addDays(nowOf(ctx), DUE_DAYS.TRACK_DELIVERY);
  await setMilestoneDueDate(ctx, actor, orderId, 'DELIVERY', addDays(deliveryDate, DUE_DAYS.COLLECT_DELIVERY_PAYMENT).toISOString());
  await audit(ctx, actor, 'SITE_READY_CONFIRMED', 'Project', orderId, orderId, undefined, { poExpectedDate: expected ?? null });
  const order = await projectRepository(ctx).get(orderId);
  if (order) await notify(ctx, customerToken(order.customerId), 'mvp_payment_due', orderId, `delivery-payment:${orderId}`);
}

// ---------------------------------------------------------------------------
// Suppliers and purchase orders (Admin-managed, D-12 default)
// ---------------------------------------------------------------------------

export async function listSuppliers(ctx: MvpCtx): Promise<Supplier[]> {
  return (await supplierRepository(ctx).list()).filter(s => s.status === 'active').sort((a, b) => a.name.localeCompare(b.name));
}

export async function createSupplier(ctx: MvpCtx, actor: MvpActor, input: { name: string; contactName?: string; phone?: string; gstin?: string }): Promise<Supplier> {
  requireAdmin(actor, 'manage suppliers');
  if (!input.name?.trim()) throw new MvpError('invalid', 'Supplier name is required.');
  const s: Supplier = {
    id: `sup_${nowOf(ctx).getTime().toString(36)}_${Math.random().toString(36).slice(2, 6)}` as Supplier['id'],
    name: input.name.trim(), contactName: input.contactName, phone: input.phone, gstin: input.gstin, status: 'active',
  };
  await supplierRepository(ctx).create(JSON.parse(JSON.stringify(s)));
  await audit(ctx, actor, 'SUPPLIER_CREATED', 'Supplier', s.id, undefined, undefined, { name: s.name });
  return s;
}

export async function listOrderPos(ctx: MvpCtx, orderId: string): Promise<PurchaseOrder[]> {
  return (await purchaseOrderRepository(ctx).query({ projectId: orderId } as Partial<PurchaseOrder>)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function latestPo(ctx: MvpCtx, orderId: string): Promise<PurchaseOrder | undefined> {
  const list = (await listOrderPos(ctx, orderId)).filter(p => p.status !== 'cancelled');
  return list[list.length - 1];
}

export async function raisePo(
  ctx: MvpCtx, actor: MvpActor, orderId: string,
  input: { supplierId: string; items: string; amount: number; expectedDeliveryDate: string },
): Promise<PurchaseOrder> {
  requireAdmin(actor, 'raise purchase orders');
  if (!input.supplierId) throw new MvpError('invalid', 'Choose a supplier.');
  if (!input.items?.trim()) throw new MvpError('invalid', 'Describe the items.');
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new MvpError('invalid', 'Enter the PO amount.');
  if (Number.isNaN(new Date(input.expectedDeliveryDate).getTime())) throw new MvpError('invalid', 'Enter the expected delivery date.');
  const n = (await listOrderPos(ctx, orderId)).length + 1;
  const id = `po_${orderId}_${n}`;
  const po: PurchaseOrder = {
    id: id as PurchaseOrder['id'], projectId: orderId as PurchaseOrder['projectId'], supplierId: input.supplierId as PurchaseOrder['supplierId'],
    status: 'sent_to_supplier', amount: input.amount, createdAt: nowOf(ctx).toISOString(), createdBy: actor.userId as PurchaseOrder['createdBy'],
    idempotencyKey: id, items: input.items.trim(), expectedDeliveryDate: input.expectedDeliveryDate, materialStatus: 'ORDERED', version: 0,
  };
  const { purchaseOrder } = await createPurchaseOrderIdempotent(ctx, po);
  await applyEvent(ctx, actor, orderId, { type: 'PO_RAISED' });
  // If delivery is already being tracked, its due date follows this PO's expected date.
  await syncDeliveryDue(ctx, actor, orderId, input.expectedDeliveryDate, 'PO raised');
  return purchaseOrder;
}

async function syncDeliveryDue(ctx: MvpCtx, actor: MvpActor, orderId: string, expected: string, reason: string) {
  const track = await openTask(ctx, orderId, 'TRACK_DELIVERY');
  if (track && track.dueDate !== expected) await changeDueDate(ctx, actor, track.id, expected, reason);
  if (track) await setMilestoneDueDate(ctx, actor, orderId, 'DELIVERY', addDays(new Date(expected), DUE_DAYS.COLLECT_DELIVERY_PAYMENT).toISOString());
}

/** Admin updates the PO's material status / expected date. DELAYED needs a reason; date changes are audited. */
export async function updatePo(
  ctx: MvpCtx, actor: MvpActor, poId: string,
  input: { materialStatus?: PurchaseOrder['materialStatus']; delayReason?: string; expectedDeliveryDate?: string },
): Promise<PurchaseOrder> {
  requireAdmin(actor, 'update purchase orders');
  const repo = purchaseOrderRepository(ctx);
  const po = await repo.get(poId);
  if (!po) throw new MvpError('not_found', 'Purchase order not found.');
  if (input.materialStatus === 'DELAYED' && !input.delayReason?.trim()) throw new MvpError('invalid', 'Give the delay reason.');
  if (input.expectedDeliveryDate && Number.isNaN(new Date(input.expectedDeliveryDate).getTime())) throw new MvpError('invalid', 'Enter a valid date.');
  const patch: Partial<PurchaseOrder> = {};
  if (input.materialStatus) {
    patch.materialStatus = input.materialStatus;
    patch.status = input.materialStatus === 'DISPATCHED' ? 'dispatched' : input.materialStatus === 'DELIVERED' ? 'delivered' : po.status;
  }
  if (input.delayReason !== undefined) patch.delayReason = input.delayReason;
  if (input.expectedDeliveryDate) patch.expectedDeliveryDate = input.expectedDeliveryDate;
  const updated = await repo.update(poId, patch);
  await audit(ctx, actor, 'PO_UPDATED', 'PurchaseOrder', poId, po.projectId,
    { materialStatus: po.materialStatus, expectedDeliveryDate: po.expectedDeliveryDate }, patch, input.delayReason);
  if (input.expectedDeliveryDate && input.expectedDeliveryDate !== po.expectedDeliveryDate) {
    await syncDeliveryDue(ctx, actor, po.projectId, input.expectedDeliveryDate, input.delayReason || 'Supplier changed the delivery date');
  }
  return updated;
}

/**
 * Material received at site (spec §24, D-08) → INSTALLATION. Allowed even before the delivery
 * payment (D-14: that payment gates the technician's START, not receipt). If no technician is
 * chosen, the INSTALLATION task goes to the Admin with "choose a technician".
 */
export async function markMaterialReceived(
  ctx: MvpCtx, actor: MvpActor, orderId: string,
  input: { note: string; photoIds: string[]; condition?: DeliveryReceipt['status']; technicianId?: string; poId?: string },
): Promise<void> {
  requireAdmin(actor, 'record material received');
  if (!(await openTask(ctx, orderId, 'TRACK_DELIVERY'))) throw new MvpError('invalid', 'Delivery is not being tracked for this order.');
  if (!input.photoIds?.length) throw new MvpError('invalid', 'Add at least one photo of the material at site.');
  if (!input.note?.trim()) throw new MvpError('invalid', 'Add a short count note (e.g. "all 14 boxes received").');
  const now = nowOf(ctx).toISOString();
  const receipt: DeliveryReceipt = {
    id: `rcpt_${orderId}` as DeliveryReceipt['id'], projectId: orderId as DeliveryReceipt['projectId'], status: input.condition ?? 'ok',
    receivedBy: actor.userId as DeliveryReceipt['receivedBy'], receivedAt: now, note: input.note.trim(), documentIds: input.photoIds,
  };
  await createIfAbsent(ctx, 'delivery_receipts', JSON.parse(JSON.stringify(receipt)));
  const po = input.poId ? await purchaseOrderRepository(ctx).get(input.poId) : await latestPo(ctx, orderId);
  if (po && po.materialStatus !== 'DELIVERED') await updatePo(ctx, actor, po.id, { materialStatus: 'DELIVERED' });
  if (input.technicianId) {
    const job: InstallationJob = {
      id: `job_${orderId}` as InstallationJob['id'], projectId: orderId as InstallationJob['projectId'],
      technicianId: input.technicianId as InstallationJob['technicianId'], status: 'assigned', siteReadinessConfirmed: true, checklist: {}, version: 0,
    };
    await createIfAbsent(ctx, 'installation_jobs', job);
  }
  await applyEvent(ctx, actor, orderId, { type: 'MATERIAL_RECEIVED', technicianId: input.technicianId });
  await audit(ctx, actor, 'MATERIAL_RECEIVED', 'Project', orderId, orderId, undefined, { condition: receipt.status, photos: input.photoIds.length, technicianId: input.technicianId ?? null });
  const order = await projectRepository(ctx).get(orderId);
  if (input.technicianId) await notify(ctx, input.technicianId, 'mvp_installation_scheduled', orderId, `install:${orderId}:${input.technicianId}`);
  if (order) await notify(ctx, customerToken(order.customerId), 'mvp_installation_scheduled', orderId, `install:${orderId}`);
}

export async function getReceipt(ctx: MvpCtx, orderId: string): Promise<DeliveryReceipt | null> {
  return deliveryReceiptRepository(ctx).get(`rcpt_${orderId}`);
}

export async function getInstallationJob(ctx: MvpCtx, orderId: string): Promise<InstallationJob | null> {
  return installationJobRepository(ctx).get(`job_${orderId}`);
}
