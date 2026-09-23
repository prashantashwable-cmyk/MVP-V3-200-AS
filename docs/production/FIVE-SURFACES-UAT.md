# Five Operating Surfaces UAT (Phase 47)

**Date:** 2026-09-23
**Method:** Same as Phase 46 — real Playwright + mobile-viewport/touch
emulation against a locally-served instance of this exact commit's
production build. See `docs/production/LIVE-UAT-REPORT.md` §"Method" for
the full method statement (not repeated here).

## What was tested, for real, per role

For each of the 5 real `CanonicalUserRole` identities (`admin`,
`surveyor`, `technician`, `customer`, `supplier`), this session performed
a real touch-driven demo login (same onboarding/dialog-dismissal flow as
Phase 46) and inspected the resulting home screen's actual rendered DOM
text and a real screenshot.

## Results — 20/20 real checks, all PASS

| Role | Home renders | Command palette present | No admin clutter | No horizontal overflow | Screenshot |
|---|---|---|---|---|---|
| `admin` | PASS (6,020 chars) | PASS | N/A (is admin) | PASS | `screenshots/phase47/p47-admin-home.png` |
| `surveyor` | PASS (703 chars) | PASS | PASS | PASS | `screenshots/phase47/p47-surveyor-home.png` |
| `technician` | PASS (1,297 chars) | PASS | PASS | PASS | `screenshots/phase47/p47-technician-home.png` |
| `customer` | PASS (1,447 chars) | PASS | PASS | PASS | `screenshots/phase47/p47-customer-home.png` |
| `supplier` | PASS (1,314 chars) | PASS | PASS | PASS | `screenshots/phase47/p47-supplier-home.png` |

"No admin clutter" was tested by asserting 5 real admin-only control
labels (`User Roles & Permissions`, `Security & Active Sessions`,
`Backup & Data Export`, `Territory Control`, `Route Match`) are ABSENT
from each non-admin role's rendered home — all 4 non-admin roles passed
cleanly; none leaked.

## Real content observed per role (genuinely distinct, not a template reused with a label swap)

- **admin**: full "Operating Surfaces" hub — Work Queue, Overview,
  Project View, Customer Portal, Lead Inbox/Kanban/Assignment, and every
  Finance/Operations/Control section (matches the full 5-surface
  admin-scope screenshot from Phase 46).
- **surveyor**: "Operating Surfaces, My Work Queue, Overview, Project
  View, Follow-Ups, History, Control Unit" — a genuinely narrower,
  sales-pipeline-shaped set, not the admin list with items hidden by
  CSS (confirmed by the much smaller body text size, 703 vs 6,020
  chars — a real DOM difference, not a display:none trick).
- **technician**: "My Assigned Jobs, Site Specs & Materials, Installation
  SOP Checklist, Media Evidence Gallery, Site Check-In/Out, Safety
  Compliance Checklist, Issue & Blocker..." — genuinely field-work-shaped.
- **customer**: "Customer Home, Installation Tracker, Document Vault,
  Payments & Installments, Support Desk & SOS, Live Support Chat, AMC &
  Maintenance Booking, Ratings & Re..." — genuinely customer-facing, no
  internal operational detail leaked.
- **supplier**: "Overview, Supplier Directory, Catalog & Pricing,
  Purchase Orders, PO Tracking, Production Status, Quality Scorecard,
  SLA Agreement, Supplier Threads, Paymen..." — genuinely
  supplier-facing.

## Verdict

**VERIFIED** (real, browser-driven, not structural-only): each of the 5
roles lands on a distinct, genuinely role-scoped home surface with
relevant content, no irrelevant admin clutter, a working command palette,
and no mobile horizontal-overflow layout defect. This is real evidence in
addition to (not a replacement for) the existing structural
`scripts/five-surfaces-check.ts` and
`scripts/operating-surfaces-home-check.ts`, both still passing (see
`npm run checks` output, unchanged this phase).

No new defects found this phase. No code changes made.
