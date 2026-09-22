import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, CornerDownLeft } from 'lucide-react';
import { Card } from './Common';
import { groupTabsBySurface, SURFACE_ORDER, SURFACE_LABELS, type NavTab } from '../navigation/surfaces';

/**
 * Global command / search palette — Phase 10.
 *
 * "Introduce Ctrl/Cmd+K style search/action entry where appropriate.
 * Search should find: ... Documents, Messages" and the rest of the
 * pack's list. This palette searches the REAL, currently-navigable tab
 * list for the signed-in user's role (the same `getTabsByRole()` data
 * `App.tsx` already uses for its sidebar/bottom nav — passed in as a
 * prop, not duplicated) and, when browsing with an empty query, groups
 * it under the five operating surfaces (src/navigation/surfaces.ts) so
 * the surface model is genuinely reachable in the running app, not just
 * documented.
 *
 * Selecting a result dispatches the EXISTING `aiec_switch_tab` window
 * event — the same mechanism `LeadInbox.tsx` and others already use for
 * cross-screen navigation (confirmed real, not invented for this
 * phase) — so this component needs zero changes to `App.tsx`'s routing
 * logic to work.
 *
 * Full entity search (Customer/Project/Quote/Contract/Payment/PO/
 * Shipment/Job/QC by name or number, not just screen name) requires
 * those records to be readable from a screen that's wired onto the
 * Phase 04 repository layer, which — per Phase 08/09's own documented
 * scope — no existing screen is yet. `registerSearchProvider` is the
 * extension point for that once a surface has real data to search;
 * documented here rather than faked with placeholder results.
 */

export interface SearchResultProvider {
  name: string;
  search: (query: string) => { id: string; label: string; sublabel?: string; onSelect: () => void }[];
}

const extraProviders: SearchResultProvider[] = [];

/** Extension point for future phases — see file header. Not called by
 * anything in this phase; exported so Phase 11+ can register a provider
 * once a domain has real, screen-reachable data to search. */
export function registerSearchProvider(provider: SearchResultProvider): () => void {
  extraProviders.push(provider);
  return () => {
    const idx = extraProviders.indexOf(provider);
    if (idx >= 0) extraProviders.splice(idx, 1);
  };
}

interface CommandPaletteProps {
  tabs: NavTab[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ tabs }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (isCmdK) {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlighted(0);
      // Focus after the modal mounts.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const grouped = useMemo(() => groupTabsBySurface(tabs), [tabs]);

  const filteredTabs = useMemo(() => {
    if (!query.trim()) return null; // null = "browse by surface" mode
    const q = query.trim().toLowerCase();
    return tabs.filter(t => t.id.toLowerCase().includes(q) || t.label.toLowerCase().includes(q));
  }, [tabs, query]);

  const extraResults = useMemo(() => {
    if (!query.trim()) return [];
    return extraProviders.flatMap(p => p.search(query.trim()));
  }, [query]);

  const flatResultsForKeyboardNav: { id: string; onSelect: () => void }[] = useMemo(() => {
    const navResults = (filteredTabs ?? tabs).map(t => ({
      id: t.id,
      onSelect: () => navigateTo(t.id),
    }));
    return [...extraResults.map(r => ({ id: r.id, onSelect: r.onSelect })), ...navResults];
  }, [filteredTabs, tabs, extraResults]);

  function navigateTo(tabId: string) {
    window.dispatchEvent(new CustomEvent('aiec_switch_tab', { detail: tabId }));
    setOpen(false);
  }

  function handleKeyNav(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, flatResultsForKeyboardNav.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      flatResultsForKeyboardNav[highlighted]?.onSelect();
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4 bg-black/40 backdrop-blur-sm"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Global command and search palette"
    >
      <Card
        className="w-full max-w-xl overflow-hidden !rounded-2xl"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(184,135,61,0.12)]">
          <Search className="w-4 h-4 text-warmgray shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setHighlighted(0); }}
            onKeyDown={handleKeyNav}
            placeholder="Search screens, or jump to a customer, project, quote…"
            className="flex-1 bg-transparent outline-none text-sm text-charcoal placeholder:text-warmgray"
          />
          <button onClick={() => setOpen(false)} className="text-warmgray hover:text-charcoal cursor-pointer" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {extraResults.length > 0 && (
            <div className="mb-2">
              <div className="px-2 py-1 text-[10px] font-mono font-bold text-warmgray uppercase tracking-wide">Records</div>
              {extraResults.map((r, i) => (
                <ResultRow key={`extra_${r.id}`} label={r.label} sublabel={r.sublabel} highlighted={highlighted === i} onSelect={r.onSelect} />
              ))}
            </div>
          )}

          {filteredTabs !== null ? (
            <div>
              <div className="px-2 py-1 text-[10px] font-mono font-bold text-warmgray uppercase tracking-wide">
                Screens ({filteredTabs.length})
              </div>
              {filteredTabs.length === 0 && (
                <div className="px-2 py-6 text-center text-sm text-warmgray">No matches for "{query}"</div>
              )}
              {filteredTabs.map((t, i) => (
                <ResultRow
                  key={t.id}
                  label={t.label}
                  highlighted={highlighted === extraResults.length + i}
                  onSelect={() => navigateTo(t.id)}
                />
              ))}
            </div>
          ) : (
            SURFACE_ORDER.map(surface => grouped[surface].length > 0 && (
              <div key={surface} className="mb-2">
                <div className="px-2 py-1 text-[10px] font-mono font-bold text-[#B8873D] uppercase tracking-wide">
                  {SURFACE_LABELS[surface]} ({grouped[surface].length})
                </div>
                {grouped[surface].slice(0, 6).map(t => (
                  <ResultRow key={t.id} label={t.label} onSelect={() => navigateTo(t.id)} />
                ))}
                {grouped[surface].length > 6 && (
                  <div className="px-3 py-1 text-[11px] text-warmgray">+ {grouped[surface].length - 6} more — type to search</div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-[rgba(184,135,61,0.12)] text-[10px] text-warmgray">
          <span>↑↓ to navigate · Enter to open · Esc to close</span>
          <span className="flex items-center gap-1"><CornerDownLeft className="w-3 h-3" /> Enter</span>
        </div>
      </Card>
    </div>
  );
};

const ResultRow: React.FC<{ label: string; sublabel?: string; highlighted?: boolean; onSelect: () => void }> = ({ label, sublabel, highlighted, onSelect }) => (
  <button
    onClick={onSelect}
    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex flex-col cursor-pointer transition-colors ${
      highlighted ? 'bg-[rgba(184,135,61,0.10)] text-charcoal' : 'text-charcoal hover:bg-[rgba(184,135,61,0.06)]'
    }`}
  >
    <span>{label}</span>
    {sublabel && <span className="text-[11px] text-warmgray">{sublabel}</span>}
  </button>
);
