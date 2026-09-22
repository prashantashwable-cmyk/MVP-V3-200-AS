/**
 * Five Operating Surfaces — Phase 10.
 *
 * WORK / CUSTOMERS / OPERATIONS / FINANCE / CONTROL, per
 * 10_FIVE_SURFACES_AND_PROJECT_CENTRIC_UX.md.
 *
 * Deliberate design choice: this classifies the REAL, currently-live
 * navigation vocabulary — the `tab.id`/`label` pairs `App.tsx`'s
 * `getTabsByRole()` already returns and dispatches via the existing
 * `aiec_switch_tab` window event (see `LeadInbox.tsx` for a working
 * example of that mechanism) — not the Phase 03 `screenRegistry`'s
 * component-filename-keyed entries. The two use different ID
 * vocabularies (e.g. tab id `LeadPipeline` vs. component file
 * `LeadKanban.tsx`) because the tab list is a hand-curated, already
 * role-scoped subset/relabeling of the 189 components, built for actual
 * in-app navigation. Classifying THAT list is what makes the five
 * surfaces immediately real and navigable in the running app (via
 * `CommandPalette.tsx`), rather than a second, disconnected model that
 * describes navigation without being able to perform it.
 */

export type Surface = 'WORK' | 'CUSTOMERS' | 'OPERATIONS' | 'FINANCE' | 'CONTROL';

export const SURFACE_LABELS: Record<Surface, string> = {
  WORK: 'Work',
  CUSTOMERS: 'Customers',
  OPERATIONS: 'Operations',
  FINANCE: 'Finance',
  CONTROL: 'Control',
};

export const SURFACE_ORDER: Surface[] = ['WORK', 'CUSTOMERS', 'OPERATIONS', 'FINANCE', 'CONTROL'];

/**
 * Keyword classifier over a tab's `id`+`label`. Same intentionally
 * conservative, documented-as-heuristic approach as Phase 01's
 * screen-inventory classification and Phase 03's screen registry —
 * accurate enough that nothing is left unclassified, not claimed to be
 * a hand-verified judgment call on all ~250 real tab entries across 5
 * roles.
 */
export function classifyTabSurface(id: string, label: string): Surface {
  const idLower = id.toLowerCase();
  const s = `${idLower} ${label.toLowerCase()}`;

  // `idLower === 'home'` is checked separately from the combined-string
  // regex below: `${id} ${label}` is never literally "home" once the
  // label is appended, so a `^home$` pattern against `s` could never
  // match — caught by scripts/five-surfaces-check.ts, fixed here.
  if (idLower === 'home' ||
      (/(dashboard|task|alert|exception|approval|follow.?up|sos\b|waiting|notification)/.test(s) &&
       !/(payment|delivery|supplier|quote)/.test(s))) {
    return 'WORK';
  }
  if (/(quote|payment|invoice|loan|emi|refund|dispute|cashflow|revenue|profit|ledger|receipt|checkout|reconcil|commission)/.test(s)) {
    return 'FINANCE';
  }
  if (/(supplier|delivery|shipment|dispatch|procure|purchase|production|installation|install|qc\b|inspection|snag|handover|warranty|amc|sop|material|technician|job)/.test(s)) {
    return 'OPERATIONS';
  }
  if (/(lead|customer|deal|negotiat|contract|survey|site|referr|feedback|objection|battlecard|contact)/.test(s)) {
    return 'CUSTOMERS';
  }
  if (/(automation|security|permission|audit|setting|compliance|integration|report|user|role|backup|territory|route|geofence|heatmap|leaderboard|training|applicant)/.test(s)) {
    return 'CONTROL';
  }
  // Default: a tool nobody could confidently bucket stays reachable under
  // CONTROL (the "everything else" surface for admin/config-shaped
  // tools) rather than silently vanishing from the palette.
  return 'CONTROL';
}

export interface NavTab {
  id: string;
  label: string;
  icon?: unknown;
}

export function groupTabsBySurface<T extends NavTab>(tabs: T[]): Record<Surface, T[]> {
  const grouped: Record<Surface, T[]> = { WORK: [], CUSTOMERS: [], OPERATIONS: [], FINANCE: [], CONTROL: [] };
  for (const tab of tabs) {
    grouped[classifyTabSurface(tab.id, tab.label)].push(tab);
  }
  return grouped;
}
