# AIEC Workflow Integration Map (Starting Points, Verify in Current Checkout)

## Known existing pieces
| Concern | Known starting point | Expected use |
|---|---|---|
| Main application | `src/App.tsx` | Existing navigation, user session and role routers |
| Project UI | `src/components/ProjectOperatingView.tsx` | Existing selected-project view; extend or compose rather than duplicate |
| Canonical project service | `src/services/projectOperatingView.ts` | Existing project summary, timeline, next action, blockers, finance and audit assembly |
| Canonical entities | `src/domain/entities.ts` | Project stage and linked entity contracts |
| Repositories | `src/repository/entities.ts`, `src/repository/types.ts` | Canonical record access and repository context |
| Audit | `src/lib/audit.ts` | Existing audit history query |
| Legacy data access | `src/lib/db.ts` | Existing legacy records and compatibility paths; don't bypass architecture rules |
| Global styles/tokens | `src/index.css` | Existing fonts, theme tokens, light/dark variables |

## Existing canonical stage vocabulary previously observed
`lead → customer_site_confirmed → quoting → negotiation → contract → payment → procurement → production → delivery → installation → qc → handover → warranty_amc → service`
There is also `closed_lost`. Treat this list as a discovery hint, not permission to directly set stages. Read the actual transition guards and workflow service.

## Current project service fields previously observed
- project
- customer and site summary
- timeline steps with done/current/pending status
- next action derived from stage
- owner
- financial summary (confirmed payments, purchase-order value, active payment schedule)
- blockers derived from purchase orders, delivery receipts, QC/snags and handover conditions
- audit history

## Integration rules
- UI → existing domain/workflow service → repository/persistence.
- Never treat React state as persisted business truth.
- Never fabricate conversation messages from stage labels alone.
- Build chronological entries from actual source records/events and clearly identify the source type.
- Preserve actor, timestamp, project ID, role/audience and audit correlation where the domain supports them.
- Check authorization both for display and mutation.
- Keep internal/customer/supplier/technician visibility aligned with existing permissions.
- Do not create a parallel event store or messaging subsystem without a repository-backed requirement and explicit owner approval.
- If there is no canonical source for a requested chat message, task, notification or transition, document the gap rather than inventing an implementation.

## Discovery commands
```bash
git status --short
git branch --show-current
cat package.json
find . -maxdepth 3 -iname 'AGENTS.md' -o -iname 'CLAUDE.md' -o -iname 'README*'
grep -R \"ProjectOperatingView\\|getProjectOperatingView\\|NEXT_ACTION_BY_STAGE\" -n src
grep -R \"transition\\|workflow\\|audit\\|permission\" -n src/domain src/services src/workflows src/repository
```
Use tools available in the current environment; adapt commands to platform.
