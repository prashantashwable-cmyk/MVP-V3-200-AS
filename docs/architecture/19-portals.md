# Phase 19 — Customer, Supplier, Technician Portals

## 1. Investigated first: are these portals actually module-oriented today?

Before writing any code, the real routers and tab lists were read
directly — not assumed from the admin experience.

`src/routers/{Customer,Supplier,Technician}Router.tsx` are 71/17/29
lines respectively (vs. the admin surface's much larger footprint) —
most of each portal's real navigation happens through each role's `Home`
screen (`CustomerHomeDashboardScreen`/`SupplierDashboard`/
`TechnicianHomeMyJobsScreen`) dispatching the same `aiec_switch_tab`
event Phase 10 already verified is the app's one real navigation
mechanism, not a second one.

`getTabsByRole()` in `src/App.tsx` already gives each of these three
roles a SEPARATE, much smaller tab list than admin's 100+-tab flat menu
— 17 tabs for customer, 16 for supplier, 13 for technician, each
genuinely scoped to that role's work. Comparing them against this
phase's named target categories:

| Portal | Target categories | Already covered | Genuinely missing |
|---|---|---|---|
| CUSTOMER | My Projects, Timeline, Quote, Contract, Payments, Production, Delivery, Installation, QC, Handover, Warranty, AMC, Service | Home(=My Projects), Installation Tracker(=Timeline), Quote Preview, Payments, Delivery tracking, Material receipt, AMC Booking, Support(=Service) | **Contract** (no post-sale contract view — `DigitalContractGenerator` is deal-flow only), **Warranty** (no dedicated tab — data now exists via Phase 19's summary, see §2), raw Production/Installation/QC/Handover screens (deliberately NOT exposed to customers — see §3) |
| SUPPLIER | My Orders, Production, Deliveries, Documents, Payments, Issues | PO Generator+Tracking(=My Orders), Production Status, Delivery Scheduling+Tracking(=Deliveries), Invoice Matching(=Documents), Payment Terms+History(=Payments), Dispute Desk(=Issues) | Already well covered structurally |
| TECHNICIAN | My Jobs, Today, Job Brief, Check-in, SOP, Evidence, Materials, Issues, Completion | My Jobs, Site Info(=Job Brief), Check-in/out, SOP Checklist, Evidence Gallery, Material Usage(=Materials), Issue Reports | **"Today"** (no daily-agenda view — every job is shown flat, not filtered/sorted by date), **"Completion"** (folded into the SOP checklist, no standalone confirmation step) |

Conclusion: the pack's underlying worry ("Do not expose internal
administrative architecture unnecessarily") was largely already true
here — nobody in the customer/supplier/technician role sees the admin's
giant module list. The REAL gap, confirmed by directly reading every
portal screen's `DbManager` usage, is different from what the phase name
suggests: **none of the three portals had any real canonical-data view**
— every screen reads/writes only legacy `DbManager` shapes (Lead/Deal/
Job/PurchaseOrder), even though Phases 15-18 have been populating a real
canonical Project/Quote/Contract/Payment/PurchaseOrder/Shipment/
InstallationJob/Handover/Warranty graph for exactly these same
customers/suppliers/technicians all along.

## 2. `src/services/portalWorkSummary.ts`

Three functions, one per portal, each read-only and repository-backed:

- `getCustomerPortalSummary(ctx, projectId)` — quote/contract/payments/
  procurement/delivery/installation/QC/handover/warranty status for ONE
  customer's project, in one call.
- `getSupplierPortalSummary(ctx, supplierId)` — aggregated PO counts by
  status, total order value, active deliveries, across EVERY project a
  supplier is involved in (unlike the customer summary, correctly
  cross-project).
- `getTechnicianPortalSummary(ctx, technicianId)` — assigned job counts
  bucketed by real `InstallationJobStatus` (awaiting check-in / in
  progress / awaiting QC / completed).

These are exactly the "My Projects" / "My Orders" / "My Jobs" experience
the pack's target category lists name — built from the real canonical
records, not a second parallel mock.

## 3. What was NOT done this phase, and why

- **Not wired into any of the 189 screens' rendering.** Same reasoning
  as every dual-write bridge phase (15-18): this sandbox has no browser
  to visually re-verify a rendering change against real screen layouts.
  The service is built, real, and independently proven correct
  (§4) — ready for a follow-up phase to actually render it, per this
  pack's own established, repeatedly-accepted pattern of "real service
  layer now, screen wiring once verified safe."
- **Raw Production/Installation/QC/Handover screens were NOT added to
  the customer tab list.** These are internal operational tools
  (SOP checklists, QC inspection forms) — exposing them directly to a
  customer would violate rule #8 ("do not expose internal administrative
  architecture unnecessarily"). The customer-appropriate view of that
  same data is exactly what `getCustomerPortalSummary()`'s
  `installation`/`qc`/`handover` fields already summarize — status only,
  not the raw internal tool.
- **No new "Today" or "Completion" tab was added for technicians** — the
  underlying `InstallationJob` canonical entity carries no scheduled-date
  field to sort "Today" by (Phase 02's domain model doesn't define one),
  so a real "Today" view needs that data modeled first, not fabricated
  from nothing; flagged as a genuine, named gap rather than invented.

## 4. Regression test

`scripts/portal-summary-check.ts` (`npm run portal-summary:check`, wired
into `npm run checks`) — 15 assertions. Unlike every other Phase 15-18
check (which builds one narrow fixture), this one runs a REALISTIC slice
of the ENTIRE story through the real bridges — lead → quote → contract →
payment → PO → delivery → installation → QC pass → handover certificate
→ warranty — then asserts all three portal summaries report exactly what
that real history produced: correct payment totals, correct PO/shipment/
receipt status, correct QC result, a real issued certificate, and a real
active warranty (created by the Phase 09 `HANDOVER_COMPLETED` event
handler, not synthesized by this test).

## 5. Acceptance

- `npx tsc --noEmit` — pass.
- `npm run portal-summary:check` — pass, 15/15 assertions.
- `npm run checks` (all 21 scripts) — pass, zero regressions in the prior
  408 assertions.
- `npm run build` — pass, bundle unchanged (no screen imports the new
  service yet).

## 6. Next phase

Phase 20 — Make the Five Operating Surfaces Primary.
