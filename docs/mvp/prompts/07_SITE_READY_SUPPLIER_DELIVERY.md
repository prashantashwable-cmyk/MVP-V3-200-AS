<!-- HOW TO RUN: merge the Step 06 PR → NEW session → paste below the line. -->
---
# MVP STEP 07: Site readiness (the 2-week rule), supplier PO, and delivery tracking

Follow the **Step protocol in CLAUDE.md**. Confirm Step 06 is DONE.

Read:
- **Step 07** in `docs/mvp/MVP_REFACTOR_PLAN.md`
- MVP_SPEC §14 (customer actions) and §24
- DECISIONS D-08, D-14, D-24 and D-25
- ACCEPTANCE_SCENARIOS S1 steps 8–12, S2 and S5

## Goal
- The customer proves the site is ready with photos, and the Admin confirms it.
- The Admin tracks the supplier PO and the delivery.
- Marking the material received starts INSTALLATION.
- Delays show up on the Admin dashboard automatically.

## Build
**Reuse first (D-31).** Open the **Step 07** rows in `docs/mvp/REUSE_MAP.md`.
- ◆ canonical code: use it as-is.
- ★ bridged screens: switch their reads to canonical. Don't rebuild them.
- ○ legacy screens over about 600 lines: build a thin new screen that reuses their components.

Put a one-line "why not reuse" in the PR for anything new.

Reuse or simplify: `SupplierDirectory`, `PurchaseOrderGenerator`, `SupplierOrderStatusTracking`, `SiteDeliveryChecklistScreen`, `MaterialReceivedConfirmationScreen`, and the canonical `Supplier`, `PurchaseOrder`, `Shipment` and `DeliveryReceipt` entities. **Rewire to canonical.** Keep a supplier portal only if the audit says it works; the default is Admin-managed.

1. **Customer: site readiness.**
   - A short checklist, each item with a photo:
     - shaft complete
     - pit dry
     - power available (or a date)
     - access for material
     - storage space
     - a free-text note
   - Submit → VERIFY_SITE_READY task for the Admin.
   - The 14-day SITE_READINESS due date is shown to the customer as "Please complete by <date>".
2. **Admin: verify readiness.** Confirm, or return with a reason (the customer task reopens).
   - **Confirm:**
     - stage becomes DELIVERY
     - the TRACK_DELIVERY and COLLECT_DELIVERY_PAYMENT tasks are created
3. **Suppliers and POs (Admin).**
   - **Supplier:** name, contact, phone.
   - **PO:** order, supplier, items (free text is fine), amount (admin-only), expected delivery date.
   - **Material status:** ORDERED, DISPATCHED, DELIVERED or DELAYED, with a delay reason.
   - **RAISE_PO** completes when the PO is created.
   - **TRACK_DELIVERY's due date** follows the PO's expected delivery date. Changing that date is audited, and a delay makes the "supplier delay" attention bucket show the order.
4. **Material received.**
   - The Admin (or supplier) marks it received, with a photo and a short count note, optionally damaged/missing via `DeliveryReceipt`.
   - The stage becomes INSTALLATION and an INSTALLATION task is created for a technician chosen by the Admin. If no technician is chosen, the task goes to the Admin with a "choose technician" prompt.
5. **Hold, resume and extend** (D-24) is used by S2. Check that it works end-to-end from the Order View built in Step 04.

## Checks
- S1 steps 8–12. S2 (customer delay → OVERDUE → hold → resume, all audited).
- S5 up to material received (the INSTALLATION START gate is tested in Step 08).
- A delayed PO puts the order in the supplier-delay bucket.
- A customer can't see PO amounts or supplier cost.

## Report back (exactly this, then STOP)
```
## Step 07 report
1. Done  2. Files changed  3. Data changes  4. Checks  5. Scope guard
6. How to see it (Customer readiness → Admin confirm → PO → received; screenshots)
7. Deviations  8. Questions
PR: <link>
Next: prompts/08_TECHNICIAN_INSTALLATION_BLOCKERS.md
```
