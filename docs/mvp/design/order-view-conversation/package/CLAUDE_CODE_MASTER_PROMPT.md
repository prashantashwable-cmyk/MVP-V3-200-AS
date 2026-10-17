# CLAUDE CODE MASTER PROMPT — AIEC REFERENCE-MATCHED CONVERSATION-FIRST PROJECT UI

## ROLE
Act as a senior frontend engineer, product designer, accessibility engineer, and workflow integration engineer working directly in the EXISTING AIEC repository.

## MISSION
Implement the original reference image as a responsive, pixel-conscious, production-quality interface for the AIEC elevator project lifecycle. The visual experience should communicate the elevator business as a production line expressed through one chronological project conversation. Connect the UI to the existing AIEC canonical project records, domain services, repositories, authorization, audit history, and workflow engine.

This is an implementation task inside the existing application, not a greenfield rewrite, static image gallery, or new architecture proposal.

## SOURCE OF TRUTH
Repository: `prashantashwable-cmyk/MVP-V3-200-AS`
Default branch previously observed: `main`
Existing React/TypeScript/Vite application.
Primary known integration files:
- `src/components/ProjectOperatingView.tsx`
- `src/services/projectOperatingView.ts`
- `src/domain/entities.ts`
- `src/repository/entities.ts`
- `src/repository/types.ts`
- `src/lib/audit.ts`
- `src/lib/db.ts`
- `src/types.ts`
- `src/index.css`
- `src/App.tsx`
These paths are starting points only. Inspect the current checkout and discover the actual workflow services, event contracts, permission helpers, and test scripts before changing anything. Do not assume the repository has not changed since this handoff was prepared.

## NON-NEGOTIABLE RULES
1. Inspect first. Read project instructions, package scripts, the current branch, existing component, service, repositories, workflow/event code, authorization, and relevant tests before edits.
2. Work on a feature branch. Never commit directly to `main`; do not overwrite unrelated user changes.
3. The original reference image is the visual authority. If `reference/original-reference.png` is missing, explicitly report that pixel-level matching cannot be verified. Do not invent a substitute, silently use another screenshot, or claim exact matching.
4. Preserve existing domain architecture and APIs wherever possible. Prefer extending existing components/services over adding parallel systems.
5. No hard-coded demo project data in production paths. Demo fixtures may be used only where the app's existing demo/test environment explicitly supports them and must be labelled.
6. Do not invent new product features, roles, workflows, business rules, integrations, or fake live status.
7. Do not bypass authentication, authorization, audit, validation, workflow gates, idempotency, or environment safeguards for convenience.
8. No fake buttons. Every visible action must either execute a valid, permission-checked existing action or be clearly disabled with a reason.
9. Keep the change focused and maintainable. Do not refactor unrelated screens or introduce a new state-management framework, routing system, design system, database, or dependency without proving it is necessary.
10. Do not claim tests pass unless you ran them and captured their output.

## PHASE 0 — BASELINE REPORT (BEFORE EDITING)
Inspect:
- `git status --short`, current branch, and latest commit.
- package scripts and repository guidance files.
- current project view and its service.
- canonical project stage types and the allowed stage transition/workflow implementation.
- repository implementations for project, customer, site, payment, purchase order, delivery, installation, QC, handover, and audit records.
- role-based access and role-specific screen/navigation patterns.
- tests that cover project operating view, work queue, workflow transitions, authorization, audit, and mobile/responsive layout if present.
- available original reference image and its dimensions.

Then write a concise baseline report listing:
A. existing components/services to reuse;
B. exact data sources and action handlers;
C. visual measurements and tokens extracted from the reference (only if image is available);
D. risks and unknowns;
E. planned files to change;
F. tests to run.
Do not start unrelated tasks.

## PHASE 1 — REFERENCE IMAGE AUDIT
Use the original reference image as a measurement guide. Record:
- source image pixel dimensions and aspect ratio;
- viewport/frame dimensions and content bounds;
- outer margins, gutters, padding, card radii, component heights and gaps;
- typefaces (or closest existing loaded font), font sizes, weights, line heights, letter spacing;
- exact visible colors, border/overlay/shadow treatment;
- icon family, stroke weight, sizes, alignment and spacing;
- images/illustrations and crop/fit behavior;
- bottom navigation, header, safe areas, sticky regions and scroll behavior;
- responsive behavior inferable from the reference and existing app conventions.
Use a screenshot/visual comparison at the same viewport where feasible. Do not claim literal pixel identity across different rendering engines/fonts; report measurable deviations.

## PHASE 2 — IMPLEMENT THE CONVERSATION-FIRST PROJECT VIEW
The core interaction should present one project as a chronological operational conversation from lead to handover/service. Keep the visual hierarchy and details from the reference. Use real project-linked records and existing workflows.

Each timeline/conversation entry should be derived from actual data or an existing workflow/audit event. Potential event categories may include lead capture, site confirmation, quote creation/approval, negotiation, contract, payment milestone, purchase order, production, dispatch/delivery, installation, QC, handover and service—but only render categories that the current domain and actual record sources support. Do not manufacture events to fill empty states.

The interface must:
- show a single chronological history per selected project;
- clearly distinguish system events, user messages, tasks, approvals and blockers;
- show role/audience-specific items only through established authorization and visibility rules;
- preserve ordering and timestamps from source records;
- show actionable next step from existing domain/work queue service where available;
- show blocker state from the existing blocker computation;
- use project/customer/site/finance records already linked by canonical IDs;
- display loading, empty, error, offline/refreshing, and permission-denied states consistently with the existing app;
- work at the mobile-first viewport represented by the reference and remain usable on larger screens;
- retain accessibility: keyboard operation, focus visibility, semantic controls, readable contrast, screen-reader labels and reduced-motion respect.

## PHASE 3 — CONNECT UI ACTIONS TO THE EXISTING WORKFLOW ENGINE
For every action displayed in the new interface:
1. Find the existing domain service, command, workflow, or authorized mutation that performs it.
2. Confirm required role/permission, stage preconditions, business validation, audit logging, idempotency and failure behavior.
3. Call the existing action through its intended layer; do not mutate UI-only state and pretend the record changed.
4. Refresh/reconcile the canonical project view after success.
5. Show pending, success, validation error, permission denial and retryable failure states.
6. Prevent double-submit and stale updates.
7. Do not make an action available merely because a button is visible; verify authorization at the trusted service/API layer as well.
8. If the repository has no safe implementation for an action, do not invent one. Leave it clearly unavailable and document the missing capability.

Do not use a custom browser event or local component state as a substitute for a real business workflow mutation. Existing navigation events may be retained for navigation if that is the established pattern, but business changes must go through the proper service/repository/workflow boundary.

## PHASE 4 — ROLE-SPECIFIC VISIBILITY
Project conversation is shared by project, but not every event/message/task is visible to every role. Reuse existing role/permission checks. Respect internal-only notes, customer-visible messages, supplier-relevant records, technician instructions and admin-only financial/approval information where the existing permission model defines them.

Do not create a new visibility matrix from assumptions. If the current system lacks a policy for a type of information, report the gap and default to the least-privileged safe behavior rather than exposing internal content.

## PHASE 5 — PIXEL-CONSCIOUS RESPONSIVE POLISH
Match the reference at its exact reference viewport first. Use existing CSS tokens and loaded fonts where they match. If a new token is necessary, add the smallest possible scoped token instead of replacing the entire global theme. Avoid broad global CSS overrides.

Compare:
- outer frame and safe areas;
- header and navigation positions;
- column widths and content edges;
- vertical rhythm and line wrapping;
- font size, weight, line height;
- icon dimensions and baseline;
- borders, radii, shadows, gold accents and dark surfaces;
- message/task/status alignment;
- scroll and sticky behavior;
- breakpoint changes and touch target sizes.
Use actual assets from the repository. Do not replace real assets with emoji or generated placeholders.

## PHASE 6 — TEST AND VERIFY
Run the smallest focused tests first, then the applicable project checks. Inspect `package.json` for the actual scripts; likely candidates in the known checkout include `npm run lint`, `npm run project-operating-view:check`, `npm run work-queue:check`, `npm run workflow:validate`, `npm run authz:check`, `npm run e2e:check`, and `npm run build`. Use only scripts that actually exist in the current checkout.

Add/extend tests for:
- chronological sorting and stable ordering;
- project isolation (no cross-project messages or events);
- visibility by role, including internal-only content;
- valid action dispatch through existing workflow/service;
- denied/invalid transition;
- success and failure refresh/reconciliation;
- duplicate action/idempotency where relevant;
- loading, empty and error states;
- responsive/mobile layout and keyboard-accessible controls;
- no fabricated timeline events.
Do not weaken or delete existing tests to make the change pass.

If browser screenshot tooling exists, capture before/after at the same viewport and compare. If it does not exist, do not add a large testing stack just for screenshots; document the manual verification steps.

## PHASE 7 — FINISH AND REPORT
Stop when this scoped feature is implemented and verified. Do not start another feature.

Provide:
1. branch name and changed-file list;
2. summary of the reference-image measurements used;
3. how each UI action maps to an existing workflow/service;
4. how role-based visibility is enforced;
5. tests actually run, with pass/fail results;
6. any unresolved blockers, especially missing reference image, missing event source, missing permission rule, or workflow gap;
7. screenshot paths if captured;
8. commit SHA and PR URL only if actually created successfully.
Never claim the work is merged, deployed, live, or pixel-perfect without evidence.

## DEFINITION OF DONE
- Existing application architecture preserved.
- Reference image used as visual guide; missing reference explicitly called out.
- Real canonical project data displayed.
- Conversation/timeline reflects actual records/events only.
- Every enabled business action routes through existing authorized workflow services.
- Role visibility is enforced and internal information is not leaked.
- Mobile layout matches the reference dimensions as closely as measurable.
- Tests/build pass or failures are documented without concealment.
- Work remains scoped and is ready for owner review.
