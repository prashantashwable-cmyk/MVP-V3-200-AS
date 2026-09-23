/**
 * Live entity search provider — Phase 12, expanded to full pack parity
 * in Phase 25.
 *
 * Fills Phase 10's `registerSearchProvider()` extension point now that
 * Phase 04's repository layer has real, persisted records to query.
 * Phase 12 deliberately scoped this to Project/Customer only, because
 * every OTHER named entity (Quote/Contract/Payment/PO/Shipment/Job/QC/
 * Handover) lacked "a dedicated detail screen a search result could
 * usefully land on." Phase 21's `ProjectOperatingView` — a real,
 * canonical-data-backed screen showing quote/contract/payment/
 * procurement/delivery/installation/QC/handover/warranty status for one
 * project, all in one place — closes exactly that gap: every one of
 * those entity types has a `projectId`, so a result for any of them can
 * now land somewhere real by deep-linking into that project's operating
 * view via the same `aiec_open_project` event Phase 22's Work Queue
 * already established, then switching to the `ProjectOperatingView` tab.
 *
 * Site/Lead/Invoice/Document/Message search remains out of scope: Site
 * has no standalone search-worthy identity beyond its Project; Lead's
 * dual Firestore/local storage split (see `src/lib/db.ts`) makes a
 * synchronous cache the wrong shape for it; Invoice/Document/Message
 * have no canonical repository-backed entity yet (Phase 02 never
 * modeled Invoice as canonical; Document metadata exists per Phase 11
 * but with no dedicated detail screen either) — reported here, not
 * silently promised and left unbuilt.
 */

import type { RepositoryContext } from '../repository/types';
import {
  customerRepository, projectRepository, quoteRepository, contractRepository, paymentRepository,
  purchaseOrderRepository, shipmentRepository, installationJobRepository, qcInspectionRepository, handoverRepository,
} from '../repository/entities';
import type { SearchResultProvider } from '../components/CommandPalette';

export function createProjectCustomerSearchProvider(ctx: RepositoryContext, navigateToTab: (tabId: string) => void): SearchResultProvider {
  return {
    name: 'entities',
    search(query) {
      // Synchronous interface (CommandPalette calls `search()` directly
      // on keystroke) over an async repository — results are populated
      // from a cache refreshed by `refreshEntitySearchCache()`, called
      // once when the provider is registered and on a light interval by
      // the caller. This keeps the palette's per-keystroke path free of
      // network/IO latency, matching how a real production
      // search-as-you-type implementation would work (query a local
      // cache/index, not the network, on every keystroke).
      const q = query.toLowerCase();
      return cache
        .filter(r => r.label.toLowerCase().includes(q) || (r.sublabel ?? '').toLowerCase().includes(q))
        .slice(0, 8)
        .map(r => ({
          ...r,
          onSelect: () => {
            if (r.projectId) {
              // Real, established Phase 22 mechanism — the same event
              // WorkQueueScreen already dispatches to deep-link a
              // specific project into Phase 21's operating view.
              window.dispatchEvent(new CustomEvent('aiec_open_project', { detail: r.projectId }));
              navigateToTab('ProjectOperatingView');
            } else {
              navigateToTab('ProjectStatusTracker');
            }
          },
        }));
    },
  };

  // (cache defined via closure below — see refresh())
}

interface CacheEntry { id: string; label: string; sublabel?: string; projectId?: string }
let cache: CacheEntry[] = [];

export async function refreshEntitySearchCache(ctx: RepositoryContext): Promise<void> {
  try {
    const [projects, customers, quotes, contracts, payments, pos, shipments, jobs, qcInspections, handovers] = await Promise.all([
      projectRepository(ctx).list(),
      customerRepository(ctx).list(),
      quoteRepository(ctx).list(),
      contractRepository(ctx).list(),
      paymentRepository(ctx).list(),
      purchaseOrderRepository(ctx).list(),
      shipmentRepository(ctx).list(),
      installationJobRepository(ctx).list(),
      qcInspectionRepository(ctx).list(),
      handoverRepository(ctx).list(),
    ]);

    const projectTitleById = new Map(projects.map(p => [p.id as string, p.title]));
    const titleFor = (projectId: string) => projectTitleById.get(projectId) ?? projectId;

    cache = [
      ...projects.map(p => ({ id: `project:${p.id}`, label: p.title, sublabel: `Project · ${p.stage}`, projectId: p.id as string })),
      ...customers.map(c => ({ id: `customer:${c.id}`, label: c.name, sublabel: `Customer · ${c.phone}` })),
      ...quotes.map(q => ({ id: `quote:${q.id}`, label: `Quote · ${titleFor(q.projectId)}`, sublabel: `Quote · ${q.status}`, projectId: q.projectId as string })),
      ...contracts.map(c => ({ id: `contract:${c.id}`, label: `Contract · ${titleFor(c.projectId)}`, sublabel: `Contract · ${c.status}`, projectId: c.projectId as string })),
      ...payments.map(p => ({ id: `payment:${p.id}`, label: `Payment · ${titleFor(p.projectId)}`, sublabel: `Payment · ₹${p.amount.toLocaleString('en-IN')} · ${p.status}`, projectId: p.projectId as string })),
      ...pos.map(po => ({ id: `po:${po.id}`, label: `PO · ${titleFor(po.projectId)}`, sublabel: `Purchase Order · ${po.status}`, projectId: po.projectId as string })),
      ...shipments.map(s => ({ id: `shipment:${s.id}`, label: `Shipment · ${titleFor(s.projectId)}`, sublabel: `Shipment · ${s.status}`, projectId: s.projectId as string })),
      ...jobs.map(j => ({ id: `job:${j.id}`, label: `Installation Job · ${titleFor(j.projectId)}`, sublabel: `Installation · ${j.status}`, projectId: j.projectId as string })),
      ...qcInspections.map(q => ({ id: `qc:${q.id}`, label: `QC · ${titleFor(q.projectId)}`, sublabel: `QC Inspection · ${q.result}`, projectId: q.projectId as string })),
      ...handovers.map(h => ({ id: `handover:${h.id}`, label: `Handover · ${titleFor(h.projectId)}`, sublabel: `Handover · ${h.status}`, projectId: h.projectId as string })),
    ];
  } catch (e) {
    // A non-admin real session's Firestore rules (Phase 04) permit only
    // scoped reads, not an unfiltered `list()` — that's correct,
    // expected behavior, not a bug. Search-cache population is a
    // best-effort convenience and must never surface as an app error;
    // it simply stays empty (falls back to screen-name search only).
    console.warn('[entitySearchProvider] could not refresh entity search cache (expected for scoped/non-admin sessions):', e);
  }
}
