/**
 * Phase 09 acceptance check — Scenarios C, D, E from
 * 13_FINAL_END_TO_END_ACCEPTANCE.md, run early against the orchestration
 * layer (src/services/operationsWorkflow.ts), same approach as Phase 08.
 *
 * C: Dispatch -> Tracking -> Arrival -> Material Receipt -> Installation
 *    Job -> Check-in -> SOP -> Evidence -> Completion
 * D: Installation Complete -> QC -> Fail -> Snag -> Rework ->
 *    Reinspection -> Pass
 * E: QC Pass -> Compliance -> Checklist -> Walkthrough -> Acceptance ->
 *    Certificate -> Warranty/AMC
 *
 * Plus the two hard-gate checks Phase 09 explicitly requires:
 *   - a technician cannot bypass check-in/readiness controls
 *   - handover cannot be reached / completed without a real QC pass and
 *     recorded customer acceptance
 *
 * Run with: npx tsx scripts/operations-workflow-check.ts
 */
import {
  scheduleDelivery, markShipmentArrived, recordMaterialReceipt,
  assignInstallationJob, confirmSiteReadiness, checkIn, progressToEvidenceCapture, completeInstallation, requestQC,
  recordQCResult, completeRework,
  confirmCompliance, completeFinalChecklist, recordCustomerAcceptance, issueCertificate,
} from '../src/services/operationsWorkflow';
import { projectRepository, handoverRepository, warrantyRepository, installationJobRepository } from '../src/repository/entities';
import type { RepositoryContext } from '../src/repository/types';
import { asId } from '../src/domain/ids';
import type { ProjectId, CustomerId, SiteId, UserId } from '../src/domain/ids';
import type { Project } from '../src/domain/entities';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`OK: ${msg}`);
}

const ctx: RepositoryContext = { environment: 'demo', actorUserId: 'user-ops-1' };
const technician = { userId: 'user-tech-1', role: 'technician' as const, authMethod: 'firebase_auth' };
const inspector = { userId: 'user-tech-2', role: 'technician' as const, authMethod: 'firebase_auth' }; // QC done by technician role, per Phase 05's permission mapping
const admin = { userId: 'user-admin-1', role: 'admin' as const, authMethod: 'firebase_auth' };
const customer = { userId: 'user-customer-1', role: 'customer' as const, authMethod: 'firebase_auth' };

async function main() {
  const projectId = 'proj_ops_check';
  const project: Project = {
    id: asId<ProjectId>(projectId),
    customerId: asId<CustomerId>('cust_ops'),
    siteId: asId<SiteId>('site_ops'),
    stage: 'delivery',
    ownerUserId: asId<UserId>('user-sales-1'),
    title: 'Operations workflow check project',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await projectRepository(ctx).create({ ...project, version: 0 } as any);

  // --- Scenario C: Delivery -----------------------------------------------
  const shipment = await scheduleDelivery(ctx, 'po_ops_check', projectId);
  assert(shipment.status === 'scheduled', 'shipment scheduled');
  await markShipmentArrived(ctx, shipment.id);
  const receipt = await recordMaterialReceipt(ctx, technician, shipment.id, projectId, 'ok');
  assert(receipt.status === 'ok', 'material received in good condition');

  // --- Scenario C continued: Installation, with hard-gate enforcement -----
  const job = await assignInstallationJob(ctx, admin, projectId, technician.userId);
  assert(job.status === 'assigned', 'installation job assigned');

  let bypassBlocked = false;
  try {
    await checkIn(ctx, technician, job.id); // site readiness never confirmed
  } catch (e: any) {
    bypassBlocked = /site readiness/i.test(e.message);
  }
  assert(bypassBlocked, 'HARD GATE: technician cannot check in without confirmed site readiness');

  await confirmSiteReadiness(ctx, technician, job.id, true);
  const checkedIn = await checkIn(ctx, technician, job.id);
  assert(checkedIn.status === 'checked_in' && !!checkedIn.checkedInAt, 'check-in succeeds once site readiness is confirmed');

  let completeBlocked = false;
  try {
    await completeInstallation(ctx, technician, job.id); // no evidence captured yet
  } catch (e: any) {
    completeBlocked = /evidence/i.test(e.message);
  }
  assert(completeBlocked, 'HARD GATE: cannot mark installation complete without evidence capture');

  await progressToEvidenceCapture(ctx, technician, job.id, 3);
  const completed = await completeInstallation(ctx, technician, job.id);
  assert(completed.status === 'completed' && !!completed.completedAt, 'installation completes once check-in AND evidence are both satisfied');

  const qcInspection1 = await requestQC(ctx, technician, job.id, inspector.userId);
  assert(qcInspection1.result === 'pending', 'QC inspection requested');

  // --- Scenario D: QC fail -> snag -> rework -> reinspection -> pass ------
  const failed = await recordQCResult(ctx, inspector, qcInspection1.id, 'fail', { defectDescription: 'Door sensor misaligned', technicianId: technician.userId });
  assert(failed.result === 'fail', 'QC inspection recorded as failed');

  const handoverAfterFail = await handoverRepository(ctx).get(`handover_${projectId}` as any);
  assert(handoverAfterFail?.qcPassed === false && handoverAfterFail?.status === 'blocked_qc_not_passed', 'Handover is explicitly blocked after QC fail');

  let handoverBlockedByFailedQC = false;
  try {
    await confirmCompliance(ctx, admin, projectId);
  } catch (e: any) {
    handoverBlockedByFailedQC = /QC has not passed/i.test(e.message);
  }
  assert(handoverBlockedByFailedQC, 'HARD GATE: handover cannot proceed to compliance while QC has not passed — cannot accidentally reach handover');

  // Find the snag created by the QC_FAILED handler and rework it.
  const { snagId, qcInspectionId } = await (async () => {
    const { getRepository } = await import('../src/repository');
    const snagRepo = getRepository<any>('snags', ctx);
    const snags = await snagRepo.list();
    const snag = snags.find((s: any) => s.qcInspectionId === qcInspection1.id);
    return { snagId: snag.id, qcInspectionId: snag.qcInspectionId };
  })();
  await completeRework(ctx, technician, snagId);
  const reinspected = await recordQCResult(ctx, inspector, qcInspectionId, 'pass', {});
  assert(reinspected.result === 'pass', 'reinspection after rework passes — controlled loop, not a fixed retry count');

  const handoverAfterPass = await handoverRepository(ctx).get(`handover_${projectId}` as any);
  assert(handoverAfterPass?.qcPassed === true && handoverAfterPass?.status === 'compliance_pending', 'Handover is unblocked (qcPassed=true) only after a real QC pass');

  // --- Scenario E: Handover -------------------------------------------------
  await confirmCompliance(ctx, admin, projectId);
  await completeFinalChecklist(ctx, admin, projectId);

  let certificateBlockedBeforeAcceptance = false;
  try {
    await issueCertificate(ctx, admin, projectId);
  } catch (e: any) {
    certificateBlockedBeforeAcceptance = /customer acceptance/i.test(e.message);
  }
  assert(certificateBlockedBeforeAcceptance, 'HARD GATE: certificate cannot be issued before customer acceptance is recorded');

  await recordCustomerAcceptance(ctx, customer, projectId);
  const finalHandover = await issueCertificate(ctx, admin, projectId, 12);
  assert(finalHandover.status === 'certificate_issued', 'handover certificate issued after customer acceptance recorded');

  const warranty = await warrantyRepository(ctx).get(`warranty_${projectId}` as any);
  assert(!!warranty, 'Warranty automatically started on handover completion via the event bus');

  const finalProject = await projectRepository(ctx).get(projectId);
  assert(finalProject?.stage === 'warranty_amc', 'Project reaches the final warranty_amc lifecycle stage');

  console.log('\nPASS: delivery -> installation -> QC (fail/rework/reinspect/pass) -> handover all work end-to-end,');
  console.log('with both Phase 09 hard gates (check-in/readiness, QC-pass-before-handover) enforced in code, not convention.');
}

main();
