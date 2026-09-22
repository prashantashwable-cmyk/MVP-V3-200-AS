/**
 * Live entity search provider — Phase 12.
 *
 * Fills Phase 10's `registerSearchProvider()` extension point (left
 * deliberately unused in that phase, gated on real data existing to
 * search) now that Phase 04's repository layer has real, persisted
 * `Project`/`Customer` records to query. Searches by title/name
 * substring and navigates via the same `aiec_switch_tab` mechanism the
 * palette already uses — to the closest real, existing screen for that
 * entity type (`ProjectStatusTracker`, a confirmed-real admin tab id).
 *
 * Full parity with the pack's search list (Quote/Contract/Payment/PO/
 * Shipment/Job/QC/Documents/Messages by number, not just Project/
 * Customer by name) is deferred: those entities don't yet have a
 * dedicated detail screen a search result could usefully land on (that
 * screen-level work is Phase 10's explicitly-deferred nav-chrome
 * replacement) — searching them without anywhere real to send the user
 * would be a search result that goes nowhere, which is worse than not
 * offering it yet.
 */

import type { RepositoryContext } from '../repository/types';
import { customerRepository, projectRepository } from '../repository/entities';
import type { SearchResultProvider } from '../components/CommandPalette';

export function createProjectCustomerSearchProvider(ctx: RepositoryContext, navigateToTab: (tabId: string) => void): SearchResultProvider {
  return {
    name: 'projects-customers',
    search(query) {
      // Synchronous interface (CommandPalette calls `search()` directly
      // on keystroke) over an async repository — results are populated
      // from a cache refreshed by `refresh()`, called once when the
      // provider is registered and on a light interval by the caller.
      // This keeps the palette's per-keystroke path free of network/IO
      // latency, matching how a real production search-as-you-type
      // implementation would work (query a local cache/index, not the
      // network, on every keystroke).
      const q = query.toLowerCase();
      return cache
        .filter(r => r.label.toLowerCase().includes(q) || (r.sublabel ?? '').toLowerCase().includes(q))
        .slice(0, 8)
        .map(r => ({ ...r, onSelect: () => navigateToTab('ProjectStatusTracker') }));
    },
  };

  // (cache defined via closure below — see refresh())
}

interface CacheEntry { id: string; label: string; sublabel?: string }
let cache: CacheEntry[] = [];

export async function refreshEntitySearchCache(ctx: RepositoryContext): Promise<void> {
  try {
    const [projects, customers] = await Promise.all([projectRepository(ctx).list(), customerRepository(ctx).list()]);
    cache = [
      ...projects.map(p => ({ id: `project:${p.id}`, label: p.title, sublabel: `Project · ${p.stage}` })),
      ...customers.map(c => ({ id: `customer:${c.id}`, label: c.name, sublabel: `Customer · ${c.phone}` })),
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
