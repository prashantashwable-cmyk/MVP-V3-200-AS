# Phase 14 — Screen Migration Factory

Builds the reusable infrastructure Phases 15-27 will use to actually
migrate the 189 legacy screens off `DbManager` and onto the Phase 04-12
repository/domain-service/workflow stack, one business workflow at a
time — without ever having to hand-edit the Phase 03 `screenRegistry.ts`
(2001 lines, generator-owned) to track migration progress.

## 1. Why a separate registry, not a field on `screenRegistry.ts`

`src/workflows/screenRegistry.ts` (Phase 03) classifies each screen's
STRUCTURE — kind, surface, workflow/stage — and does not change as
migration proceeds. Migration STATUS changes constantly, phase over
phase, screen by screen. Mixing the two would mean hand-editing a
2001-line generated file on every single screen migration. Instead:

- `src/migration/types.ts` — the pack's exact 7-value `MigrationStatus`
  vocabulary (`MIGRATED` / `PARTIALLY_MIGRATED` / `LEGACY` / `CONTEXTUAL`
  / `COMMAND_ONLY` / `CONTROL_ONLY` / `RETIRED`) plus the
  `MigrationMatrixRow` shape used by the generated report.
- `src/migration/registry.ts` — browser-safe (no `fs`), imports the
  static `screenRegistry` data. `migrationOverrides` is a hand-maintained
  map: `{ screenId: { status, targetDataSource, notes } }`, populated one
  entry at a time, in the SAME commit that actually migrates that screen
  — never in advance. Anything not in `migrationOverrides` falls through
  to `defaultStatusFor(dataSource)`, an honest default derived from the
  real Phase 01/03 `dataSource` finding (`DbManager(...)` → `LEGACY`,
  `localStorage` → `LEGACY`, `Firestore` → `PARTIALLY_MIGRATED` — a
  screen already bypassing DbManager but still making a direct Firestore
  call, exactly the anti-pattern rule #8 forbids adding MORE of, so it is
  never reported as fully done — `props-only/none-detected` →
  `CONTEXTUAL`).

## 2. Live legacy usage detection

`scripts/dbmanager-usage-scan.ts` is a Node-only (`fs`-based) scanner —
not a re-read of the Phase 01 CSV snapshot, which can drift from reality.
It walks every `.ts`/`.tsx` file under `src/` (not just
`src/components/`), and for each one records whether it imports
`DbManager` and every distinct method it calls
(`DbManager\.([A-Za-z0-9_]+)\(`). Run standalone with
`npm run migration:scan`. As of this phase: **149 files** reference
`DbManager` (144 inside `src/components/`, plus 5 outside it —
`src/App.tsx`, `src/lib/language.ts`, `src/lib/theme.ts`,
`src/routers/AdminRouter.tsx`, `src/routers/SurveyorRouter.tsx` — a real
finding this phase's live scan produced that the Phase 01 CSV, scoped
only to `src/components/*.tsx`, could not have caught), **689 total call
sites**.

## 3. The generated matrix

`scripts/generate-migration-matrix.ts` (`npm run migration:matrix`)
builds `docs/migration/screen-migration-matrix.md` from three real
sources — the Phase 03 registry, the Phase 14 migration registry, and the
live scan — never hand-typed. For each of the 189 screens plus the 2
Phase 10-12 infrastructure additions (`CommandPalette`, `EnvironmentBadge`)
it records: screen, role, surface, workflow, entity (inferred from a
keyword table, e.g. `quote|contract|payment|installation|qc|handover`),
current data source, target data source, migration status, authorization
status (cross-referenced against the real `firestore.rules` collections
that got server-side enforcement in Phases 04-12), test status (whether a
scripted acceptance check — `e2e:check`/`commercial:check`/
`operations:check` — actually exercises that entity), and remaining risk.
Re-run it after every future screen migration; it is never hand-edited.

## 4. Regression guard: zero drift

`scripts/migration-factory-check.ts` (`npm run migration:check`, wired
into `npm run checks`) is the acceptance script for this phase. Its most
important assertion is the one that makes rule #6 ("no new direct
DbManager usage in migrated domains") enforceable going forward: for
every screen the registry claims is `MIGRATED`, the LIVE scan must show
it no longer imports `DbManager` at all. If a future phase's edit
regresses a migrated screen back onto `DbManager`, this assertion fails
loudly instead of the matrix silently going stale. It also asserts the
build is never blocked purely by legacy screens remaining (`LEGACY` is a
valid, expected status for most of the 189 today) — the check measures,
it does not gate.

## 5. Current baseline (measured, not estimated)

| Status | Count |
|---|---|
| LEGACY | 155 |
| CONTEXTUAL | 33 |
| PARTIALLY_MIGRATED | 1 |
| MIGRATED | 0 |
| COMMAND_ONLY | 1 |
| CONTROL_ONLY | 1 |
| RETIRED | 0 |

(155 + 33 + 1 + 0 = 189 legacy screens; +2 infrastructure = 191 total.)
The 1 `PARTIALLY_MIGRATED` entry is whichever screen Phase 01 already
found talking to Firestore directly (`dataSource: "Firestore"`) — flagged
for cleanup once its workflow migrates properly through the repository
layer, not treated as done. Full per-screen detail:
`docs/migration/screen-migration-matrix.md`.

## 6. Acceptance

- `npx tsc --noEmit` — pass.
- `npm run migration:check` — pass (all assertions, zero drift).
- `npm run checks` (all 15 scripts) — pass, zero regressions.
- `npm run build` — pass, bundle unaffected (no screen's JSX or import
  graph was touched this phase — pure additive infrastructure).
- Legacy usage is now measurable on demand (`npm run migration:scan`) and
  the matrix is regenerable on demand (`npm run migration:matrix`) —
  satisfies Phase 14's stated acceptance criteria exactly.

## 7. Known limitations

- Entity inference in the matrix is a keyword heuristic (same honesty
  standard as Phase 03's kind classification) — accurate for the large
  majority of screen names, occasionally coarse (e.g. a screen matching
  both "payment" and "supplier" keywords resolves to whichever keyword is
  listed first) — refined screen-by-screen as each is actually migrated
  and its `migrationOverrides` entry is added with an authoritative
  target.
- `RETIRED` is not assigned to any screen automatically — the 5
  router-unreferenced components Phase 01 found remain `CONTEXTUAL`/
  `LEGACY` per their real `dataSource`, not silently marked `RETIRED`; a
  product decision to actually retire them is out of this phase's scope
  (Phase 13 made the same call).
- No screen's actual behavior changed in this phase — purely additive
  measurement/classification infrastructure, per this phase's own
  acceptance criteria ("do not block the build simply because legacy
  screens remain").

## 8. Next phase

Phase 15 — Migrate Commercial Core (Lead → Quote → Contract → Payment).
