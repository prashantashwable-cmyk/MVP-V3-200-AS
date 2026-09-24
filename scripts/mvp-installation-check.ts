/**
 * Step 08 check (demo repository): S1 13a/13b through the real installation service,
 * S3 (technician blocker → resolved), S5 (START refused until the delivery payment or an
 * audited override), S7 (reassign + due date, audited; the job follows the technician),
 * plus the checklist, check-in and rework guards.
 * Run with: npx tsx scripts/mvp-installation-check.ts
 */
import { check, done, Clock, demoCtx, USERS, customerActor, assertInvariants } from './mvp/fixtures';
import { runS1, TINY_JPEG } from './mvp/scenario';
import {
  assignQcInspector, assignTechnician, checkInAtSite, CHECKLIST_ITEMS, completeWork, getJob, setChecklistItem, startWork,
} from '../src/mvp/services/installationService';
import { markMaterialReceived } from '../src/mvp/services/supplyService';
import { overrideGate } from '../src/mvp/gates';
import { saveEvidence } from '../src/mvp/services/evidenceService';
import { applyEvent, changeDueDate, listOpenBlockers, listOrderTasks, MvpError, raiseBlocker, reassignTask, resolveBlocker } from '../src/mvp/services/orderService';
import { buildOrderView, bucketsFor } from '../src/mvp/services/readModels';
import { getMvpTaskQueue } from '../src/services/workQueue';
import { blockerRepository, projectRepository } from '../src/repository/entities';
import { getRepository } from '../src/repository';
import { listAuditEventsForEntity } from '../src/lib/audit';
import { isOpenTask } from '../src/mvp/health';

async function expectError(p: Promise<unknown>, code: MvpError['code'], msg: string, text?: string) {
  try { await p; check(false, msg); } catch (e: any) {
    check(e instanceof MvpError && e.code === code && (!text || e.message.includes(text)), `${msg} (${e.message})`);
  }
}

async function main() {
  const clock = new Clock();
  const ctx = demoCtx(clock, USERS.admin);
  const names = { [USERS.tech1.userId]: 'Technician Rahul', [USERS.tech2.userId]: 'Technician Vikas', [USERS.qc.userId]: 'QC Meera' };
  const view = async (id: string) => (await buildOrderView(ctx, USERS.admin, id, names))!;
  const openTask = async (orderId: string, type: string) => (await listOrderTasks(ctx, orderId)).find(t => t.type === type && isOpenTask(t))!;
  const photo = async (orderId: string, who: any, c: string) => (await saveEvidence(ctx, who, { dataUrl: TINY_JPEG, contentType: 'image/jpeg', orderId, caption: c })).id;
  const notes = async (audience: string, orderId: string, templateId: string) =>
    (await getRepository<any>('notifications', ctx).query({ audienceUserId: audience } as any)).filter(n => n.projectId === orderId && n.templateId === templateId);

  // Guards before the happy path: CHECK IN / checklist need START; checklist needs CHECK IN; photos required.
  const g = await runS1(ctx, clock, 12);
  const gt = await openTask(g.orderId, 'INSTALLATION');
  await expectError(checkInAtSite(ctx, USERS.tech1, gt.id), 'invalid', 'CHECK IN needs START first');
  await expectError(startWork(ctx, USERS.tech2, gt.id), 'forbidden', 'another technician cannot START tech1’s job');
  await startWork(ctx, USERS.tech1, gt.id);
  await expectError(setChecklistItem(ctx, USERS.tech1, gt.id, 'materialReceived', { done: true, documentId: 'x' }), 'invalid', 'the checklist needs CHECK IN first');
  await checkInAtSite(ctx, USERS.tech1, gt.id, { lat: 18.52, lng: 73.85, accuracyM: 12 });
  await expectError(setChecklistItem(ctx, USERS.tech1, gt.id, 'railsInstalled', { done: true }), 'invalid', 'a checklist item needs a photo');
  check(await setChecklistItem(ctx, USERS.tech1, gt.id, 'siteCleaned', { done: true }) === 1, '"Site cleaned" may be ticked without a photo');
  await expectError(completeWork(ctx, USERS.tech1, gt.id), 'invalid', 'COMPLETE needs all 11 items', '1 done');
  check(!!(await getJob(ctx, g.orderId))?.checkInLocation, 'GPS is stored when the phone gives it');

  // S1 13a: START, CHECK IN, 6 of 11 → 71 %.
  const s = await runS1(ctx, clock, 13.5);
  let v = await view(s.orderId);
  check(v.stage === 'INSTALLATION' && v.currentTask?.type === 'INSTALLATION' && v.currentTask.status === 'IN_PROGRESS' && v.currentOwner === 'Technician Rahul', 'S1.13a INSTALLATION → tech1 IN_PROGRESS');
  check(v.progress === 71, `S1.13a progress 71 (got ${v.progress})`);
  const job = (await getJob(ctx, s.orderId))!;
  check(!!job.startedAt && !!job.checkedInAt && Object.values(job.checklist ?? {}).filter((i: any) => i.done && i.documentId).length === 6, 'S1.13a job started, checked in, 6 items with photos');
  check((await listAuditEventsForEntity(ctx, 'InstallationJob', job.id)).filter(e => e.action === 'CHECKLIST_ITEM_DONE').length === 6, 'each checklist item is audited');
  await assertInvariants(ctx, s.orderId, 'S1.13a');

  // S1 13b: the remaining 5 + COMPLETE → QC_HANDOVER, QC_INSPECTION → qc, 90 %, "QC required".
  const t13 = await openTask(s.orderId, 'INSTALLATION');
  for (const item of CHECKLIST_ITEMS.slice(6)) await setChecklistItem(ctx, USERS.tech1, t13.id, item.key, { done: true, documentId: await photo(s.orderId, USERS.tech1, item.label) });
  await expectError(assignQcInspector(ctx, USERS.tech1, s.orderId, USERS.qc.userId), 'forbidden', 'only the Admin sets the QC inspector');
  await assignQcInspector(ctx, USERS.admin, s.orderId, USERS.qc.userId);
  await completeWork(ctx, USERS.tech1, t13.id, { note: 'Ready for QC' });
  v = await view(s.orderId);
  check(v.stage === 'QC_HANDOVER' && v.currentTask?.type === 'QC_INSPECTION' && v.currentTask.assigneeId === USERS.qc.userId && v.progress === 90, `S1.13b QC_HANDOVER, QC_INSPECTION → qc, 90 (got ${v.stage} ${v.currentTask?.type} ${v.progress})`);
  check((await notes(USERS.qc.userId, s.orderId, 'mvp_qc_required')).length === 1, 'S1.13b "QC required" notification to QC');
  check((await getJob(ctx, s.orderId))?.completedAt != null, 'the job is marked completed');
  await assertInvariants(ctx, s.orderId, 'S1.13b');
  const s13 = await runS1(ctx, clock, 13.9);
  check((await view(s13.orderId)).progress === 90, 'runS1(13b) drives the same path');

  // QC inspector set later: the QC task waiting on the Admin moves to them.
  const late = await runS1(ctx, clock, 13.5);
  const lt = await openTask(late.orderId, 'INSTALLATION');
  for (const item of CHECKLIST_ITEMS.slice(6)) await setChecklistItem(ctx, USERS.tech1, lt.id, item.key, { done: true, documentId: await photo(late.orderId, USERS.tech1, item.label) });
  await completeWork(ctx, USERS.tech1, lt.id);
  check((await openTask(late.orderId, 'QC_INSPECTION')).assigneeId === 'role:admin', 'no QC inspector yet → the QC task waits on the Admin');
  await assignQcInspector(ctx, USERS.admin, late.orderId, USERS.qc.userId);
  check((await openTask(late.orderId, 'QC_INSPECTION')).assigneeId === USERS.qc.userId, 'setting the inspector moves the QC task to them');

  // Rework (the Step 09 QC decision is driven by its event here): needs a photo → new QC task.
  await applyEvent(ctx, USERS.qc, late.orderId, { type: 'QC_DECISION', decision: 'REWORK', technicianId: USERS.tech1.userId }, { reason: 'Door gap uneven, floor 4' });
  const rw = await openTask(late.orderId, 'REWORK');
  check(!!rw && rw.assigneeId === USERS.tech1.userId, 'REWORK → tech1');
  await startWork(ctx, USERS.tech1, rw.id);
  await expectError(completeWork(ctx, USERS.tech1, rw.id), 'invalid', 'rework needs a photo of the fixed work');
  await completeWork(ctx, USERS.tech1, rw.id, { documentId: await photo(late.orderId, USERS.tech1, 'fixed'), note: 'Gap adjusted' });
  check((await openTask(late.orderId, 'QC_INSPECTION'))?.assigneeId === USERS.qc.userId && !(await openTask(late.orderId, 'REWORK')), 'rework done → a new QC_INSPECTION → qc');

  // S3: technician blocker.
  const s3 = await runS1(ctx, clock, 13.5);
  const t3 = await openTask(s3.orderId, 'INSTALLATION');
  const blk = await raiseBlocker(ctx, USERS.tech1, { orderId: s3.orderId, taskId: t3.id, reason: 'MATERIAL_MISSING', description: 'Brackets for floor 5 missing', evidence: [await photo(s3.orderId, USERS.tech1, 'missing')] });
  let v3 = await view(s3.orderId);
  check((await openTask(s3.orderId, 'INSTALLATION')).status === 'BLOCKED', 'S3 the INSTALLATION task is BLOCKED');
  check(blk.status === 'OPEN' && blk.ownerUserId === 'role:admin' && v3.health === 'BLOCKED', 'S3 blocker OPEN, owned by admin, health BLOCKED');
  check((await notes('role:admin', s3.orderId, 'mvp_blocker_raised')).length === 1, 'S3 the Admin is notified');
  const b3 = bucketsFor((await projectRepository(ctx).get(s3.orderId))!, await listOrderTasks(ctx, s3.orderId), await listOpenBlockers(ctx, s3.orderId), [], [], clock.now());
  check(b3.buckets.includes('blocked') && b3.buckets.includes('technician_waiting'), 'S3 Needs Attention → Blocked / Technician waiting');
  await expectError(setChecklistItem(ctx, USERS.tech1, t3.id, 'doorsInstalled', { done: true, documentId: 'x' }), 'invalid', 'a BLOCKED job cannot tick items');
  await expectError(completeWork(ctx, USERS.tech1, t3.id), 'gate', 'a BLOCKED job cannot complete');
  await expectError(resolveBlocker(ctx, USERS.tech1, blk.id, 'done'), 'forbidden', 'the technician cannot resolve an Admin-owned blocker');
  await resolveBlocker(ctx, USERS.admin, blk.id, 'brackets dispatched');
  v3 = await view(s3.orderId);
  const r3 = (await blockerRepository(ctx).get(blk.id))!;
  check((await openTask(s3.orderId, 'INSTALLATION')).status === 'IN_PROGRESS' && v3.health === 'ON_TRACK', 'S3 resolved → task IN_PROGRESS, ON_TRACK');
  check(r3.status === 'RESOLVED' && !!r3.resolvedAt, 'S3 blocker RESOLVED with resolvedAt');
  await assertInvariants(ctx, s3.orderId, 'S3');

  // S5: START refused until the delivery payment; Admin override audited, then allowed.
  const s5 = await runS1(ctx, clock, 10);
  await markMaterialReceived(ctx, USERS.admin, s5.orderId, { note: 'All boxes', photoIds: [await photo(s5.orderId, USERS.admin, 'm')], technicianId: USERS.tech1.userId });
  const t5 = await openTask(s5.orderId, 'INSTALLATION');
  await expectError(startWork(ctx, USERS.tech1, t5.id), 'gate', 'S5 START refused', 'Waiting for delivery payment');
  await expectError(overrideGate(ctx, USERS.tech1, s5.orderId, 'INSTALLATION_START', 'please'), 'forbidden', 'only the Admin overrides a gate');
  await overrideGate(ctx, USERS.admin, s5.orderId, 'INSTALLATION_START', 'Customer paying on Friday; owner approved');
  check((await listAuditEventsForEntity(ctx, 'Project', s5.orderId)).some(e => e.action === 'GATE_OVERRIDDEN'), 'S5 the override is audited');
  await startWork(ctx, USERS.tech1, t5.id);
  check((await openTask(s5.orderId, 'INSTALLATION')).status === 'IN_PROGRESS', 'S5 after the override tech1 can START');

  // S7: reassign tech1 → tech2 and due −3 days; 2 audits, tech2 notified, tech1 loses it.
  const s7 = await runS1(ctx, clock, 12);
  const t7 = await openTask(s7.orderId, 'INSTALLATION');
  const before = (await listAuditEventsForEntity(ctx, 'Task', t7.id)).length;
  await reassignTask(ctx, USERS.admin, t7.id, { id: USERS.tech2.userId, role: 'technician' }, 'tech1 on leave');
  const earlier = new Date(new Date(t7.dueDate).getTime() - 3 * 86_400_000).toISOString();
  await changeDueDate(ctx, USERS.admin, t7.id, earlier, 'Customer asked to start sooner');
  const a7 = (await listAuditEventsForEntity(ctx, 'Task', t7.id)).slice(before);
  check(a7.length === 2 && a7.every(e => e.before != null && e.after != null), 'S7 two audit events with before/after');
  check((await getRepository<any>('notifications', ctx).query({ audienceUserId: USERS.tech2.userId } as any)).some(n => n.projectId === s7.orderId), 'S7 tech2 is notified');
  check(!(await getMvpTaskQueue(ctx, USERS.tech1)).some(t => t.id === t7.id) && (await getMvpTaskQueue(ctx, USERS.tech2)).some(t => t.id === t7.id), 'S7 tech1 no longer sees the task; tech2 does');
  const order7 = (await projectRepository(ctx).get(s7.orderId))!;
  check(!(order7.participantIds ?? []).includes(USERS.tech1.userId) && (order7.participantIds ?? []).includes(USERS.tech2.userId), 'S7 tech1 loses participation, tech2 gains it');
  check((await getJob(ctx, s7.orderId))?.technicianId === USERS.tech2.userId, 'S7 the installation job follows the new technician');
  const v7 = await view(s7.orderId);
  check(v7.currentOwner === 'Technician Vikas' && v7.currentTask?.dueDate === earlier, 'S7 the Order View shows the new owner and due date');
  await assertInvariants(ctx, s7.orderId, 'S7');

  // assignTechnician (material received without one) creates the job for them.
  const s8 = await runS1(ctx, clock, 11);
  await markMaterialReceived(ctx, USERS.admin, s8.orderId, { note: 'All boxes', photoIds: [await photo(s8.orderId, USERS.admin, 'm')] });
  check((await openTask(s8.orderId, 'INSTALLATION')).assigneeId === 'role:admin', 'no technician chosen → INSTALLATION waits on the Admin');
  await expectError(assignTechnician(ctx, customerActor(s8.customerId), s8.orderId, USERS.tech2.userId), 'forbidden', 'a customer cannot assign technicians');
  await assignTechnician(ctx, USERS.admin, s8.orderId, USERS.tech2.userId);
  check((await openTask(s8.orderId, 'INSTALLATION')).assigneeId === USERS.tech2.userId && (await getJob(ctx, s8.orderId))?.technicianId === USERS.tech2.userId, 'assignTechnician moves the task and creates the job');

  done('mvp-installation-check');
}

main().catch(err => { console.error(err); process.exitCode = 1; });
