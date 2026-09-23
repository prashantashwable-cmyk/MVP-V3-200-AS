/**
 * Phase 26 acceptance check: proves the 8 new data-quality checks this
 * phase added — Customer without Site, Site without Project, Project
 * missing Quote/Contract, orphaned InstallationJobs, QC without
 * Installation, Handover without QC Pass, orphaned Documents, duplicate
 * Projects — each find a real, deliberately-seeded problem, and (for the
 * ones with a clean counterpart) correctly find NOTHING wrong with a
 * properly-linked graph.
 *
 * Run with: npx tsx scripts/data-quality-phase26-check.ts
 */
import {
  findCustomersWithoutSite, findSitesWithoutProject, findProjectsMissingQuoteOrContract,
  findOrphanedInstallationJobs, findQcWithoutInstallation, findHandoverWithoutQcPass,
  findOrphanedDocuments, findDuplicateProjects, runAllDataQualityChecks,
} from '../src/services/dataQuality';
import {
  customerRepository, siteRepository, projectRepository, quoteRepository,
  installationJobRepository, qcInspectionRepository, handoverRepository,
} from '../src/repository/entities';
import { getRepository } from '../src/repository';
import type { RepositoryContext } from '../src/repository/types';
import { asId } from '../src/domain/ids';
import type {
  CustomerId, SiteId, ProjectId, UserId, InstallationJobId, QCInspectionId, HandoverId, DocumentId, QuoteVersionId,
} from '../src/domain/ids';
import type { Customer, Site, Project, InstallationJob, QCInspection, Handover, DocumentRecord } from '../src/domain/entities';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`OK: ${msg}`);
}

const ctx: RepositoryContext = { environment: 'demo', actorUserId: 'user-dq-1' };
const now = new Date().toISOString();

async function main() {
  // --- Customer without Site ----------------------------------------------
  await customerRepository(ctx).create({ id: asId<CustomerId>('cust_dq26_orphan'), name: 'DQ26 Orphan Customer', phone: '9990002020', createdAt: now, updatedAt: now });
  const custIssues = await findCustomersWithoutSite(ctx);
  assert(custIssues.some(i => i.entityId === 'cust_dq26_orphan'), 'finds a real customer with no linked Site');

  // A properly linked customer+site pair produces no issue for that pair.
  await customerRepository(ctx).create({ id: asId<CustomerId>('cust_dq26_linked'), name: 'DQ26 Linked Customer', phone: '9990002021', createdAt: now, updatedAt: now });
  await siteRepository(ctx).create({ id: asId<SiteId>('site_dq26_linked'), customerId: asId<CustomerId>('cust_dq26_linked'), address: '1 Linked St', createdAt: now, updatedAt: now });
  const custIssuesAfterLink = await findCustomersWithoutSite(ctx);
  assert(!custIssuesAfterLink.some(i => i.entityId === 'cust_dq26_linked'), 'a customer with a real linked Site produces no issue');

  // --- Site without Project ------------------------------------------------
  // A dedicated site that never gets a project for the rest of this
  // script's run — `site_dq26_linked` below goes on to get several real
  // Projects, so checking against IT after those are created would be
  // checking a moving target, not a real orphan.
  await siteRepository(ctx).create({ id: asId<SiteId>('site_dq26_never_projected'), customerId: asId<CustomerId>('cust_dq26_linked'), address: '2 Never Projected Rd', createdAt: now, updatedAt: now });
  const siteIssues = await findSitesWithoutProject(ctx);
  assert(siteIssues.some(i => i.entityId === 'site_dq26_never_projected'), 'finds a real site with no linked Project');

  // --- Project missing Quote/Contract ---------------------------------------
  await projectRepository(ctx).create({
    id: asId<ProjectId>('proj_dq26_no_quote'), customerId: asId<CustomerId>('cust_dq26_linked'), siteId: asId<SiteId>('site_dq26_linked'),
    stage: 'contract', ownerUserId: asId<UserId>('user-dq-1'), title: 'DQ26 project missing quote', createdAt: now, updatedAt: now,
  } as Project);
  const missingQuoteContract = await findProjectsMissingQuoteOrContract(ctx);
  assert(missingQuoteContract.some(i => i.entityId === 'proj_dq26_no_quote' && i.check === 'project_missing_quote'), 'finds a real project at "contract" stage with no Quote record');

  // A project with a real Quote produces no missing-quote issue.
  await projectRepository(ctx).create({
    id: asId<ProjectId>('proj_dq26_with_quote'), customerId: asId<CustomerId>('cust_dq26_linked'), siteId: asId<SiteId>('site_dq26_linked'),
    stage: 'contract', ownerUserId: asId<UserId>('user-dq-1'), title: 'DQ26 project with quote', createdAt: now, updatedAt: now,
  } as Project);
  await quoteRepository(ctx).create({
    id: asId('quote_dq26_1'), projectId: asId<ProjectId>('proj_dq26_with_quote'), status: 'accepted',
    currentVersionId: asId<QuoteVersionId>('qv_dq26_1'), createdBy: asId<UserId>('user-dq-1'), createdAt: now, updatedAt: now,
  } as any);
  const afterQuoteAdded = await findProjectsMissingQuoteOrContract(ctx);
  assert(!afterQuoteAdded.some(i => i.entityId === 'proj_dq26_with_quote' && i.check === 'project_missing_quote'), 'a project with a real Quote produces no missing-quote issue');

  // --- Orphaned InstallationJob --------------------------------------------
  await installationJobRepository(ctx).create({ id: asId<InstallationJobId>('job_dq26_orphan'), projectId: asId<ProjectId>('proj_does_not_exist_dq26'), technicianId: asId<UserId>('user-tech-dq'), status: 'assigned' } as InstallationJob);
  const jobIssues = await findOrphanedInstallationJobs(ctx);
  assert(jobIssues.some(i => i.entityId === 'job_dq26_orphan'), 'finds a real InstallationJob referencing a non-existent project');

  // --- QC without Installation ----------------------------------------------
  await qcInspectionRepository(ctx).create({ id: asId<QCInspectionId>('qc_dq26_orphan'), projectId: asId<ProjectId>('proj_dq26_with_quote'), installationJobId: asId<InstallationJobId>('job_does_not_exist_dq26'), inspectorId: asId<UserId>('user-inspector-dq'), result: 'pending' } as QCInspection);
  const qcIssues = await findQcWithoutInstallation(ctx);
  assert(qcIssues.some(i => i.entityId === 'qc_dq26_orphan'), 'finds a real QCInspection referencing a non-existent InstallationJob');

  // --- Handover without QC Pass (defensive check) --------------------------
  await handoverRepository(ctx).create({ id: asId<HandoverId>('handover_dq26_bad'), projectId: asId<ProjectId>('proj_dq26_with_quote'), status: 'customer_accepted', qcPassed: false } as Handover);
  const handoverIssues = await findHandoverWithoutQcPass(ctx);
  assert(handoverIssues.some(i => i.entityId === 'handover_dq26_bad'), 'finds a real Handover past compliance whose qcPassed is not true (the hard gate should have prevented this)');

  // A correctly-gated Handover (qcPassed true) produces no issue.
  await handoverRepository(ctx).create({ id: asId<HandoverId>('handover_dq26_good'), projectId: asId<ProjectId>('proj_dq26_no_quote'), status: 'customer_accepted', qcPassed: true } as Handover);
  const handoverIssuesAfter = await findHandoverWithoutQcPass(ctx);
  assert(!handoverIssuesAfter.some(i => i.entityId === 'handover_dq26_good'), 'a correctly-gated Handover (real qcPassed=true) produces no issue');

  // --- Orphaned documents -----------------------------------------------
  await getRepository<DocumentRecord>('documents', ctx).create({
    id: asId<DocumentId>('doc_dq26_orphan'), projectId: asId<ProjectId>('proj_does_not_exist_dq26'), ownerEntityType: 'Project', ownerEntityId: 'proj_does_not_exist_dq26',
    storagePath: 'x', contentType: 'application/pdf', sizeBytes: 100, uploadedBy: asId<UserId>('user-dq-1'), uploadedAt: now, version: 1,
  } as DocumentRecord);
  const docIssues = await findOrphanedDocuments(ctx);
  assert(docIssues.some(i => i.entityId === 'doc_dq26_orphan'), 'finds a real Document referencing a non-existent project');

  // --- Duplicate projects (same customer+site) ------------------------------
  await projectRepository(ctx).create({
    id: asId<ProjectId>('proj_dq26_dup_1'), customerId: asId<CustomerId>('cust_dq26_linked'), siteId: asId<SiteId>('site_dq26_linked'),
    stage: 'lead', ownerUserId: asId<UserId>('user-dq-1'), title: 'DQ26 duplicate 1', createdAt: now, updatedAt: now,
  } as Project);
  await projectRepository(ctx).create({
    id: asId<ProjectId>('proj_dq26_dup_2'), customerId: asId<CustomerId>('cust_dq26_linked'), siteId: asId<SiteId>('site_dq26_linked'),
    stage: 'lead', ownerUserId: asId<UserId>('user-dq-1'), title: 'DQ26 duplicate 2', createdAt: now, updatedAt: now,
  } as Project);
  const dupIssues = await findDuplicateProjects(ctx);
  assert(dupIssues.some(i => i.entityId.includes('proj_dq26_dup_1') && i.entityId.includes('proj_dq26_dup_2')), 'finds two real Projects sharing the same customer+site as duplicates');

  // --- All 8 new checks are wired into the combined runner -----------------
  const all = await runAllDataQualityChecks(ctx);
  const newCheckNames = ['customer_without_site', 'site_without_project', 'project_missing_quote', 'orphaned_installation_jobs', 'qc_without_installation', 'handover_without_qc_pass', 'orphaned_documents', 'duplicate_projects'];
  for (const name of newCheckNames) {
    assert(all.some(i => i.check === name), `runAllDataQualityChecks() includes the new "${name}" check's real findings, not just the Phase 12 originals`);
  }

  console.log('\nPASS: all 8 new Phase 26 data-quality checks find real, deliberately-seeded problems (and correctly');
  console.log('find NOTHING wrong with a properly-linked counterpart, where one was seeded), and are wired into the');
  console.log('combined runAllDataQualityChecks() alongside the Phase 12 originals.');
}

main();
