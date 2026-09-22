# AIEC — Canonical Domain Model (Phase 02)

Implements: `src/domain/ids.ts`, `src/domain/entities.ts`,
`src/domain/adapters.ts`. Acceptance check: `scripts/domain-graph-check.ts`
(run via `npm run domain:check`).

## 1. Canonical lifecycle

```
Lead → Customer → Site → Project → Quote → Negotiation → Contract →
Payment → Procurement → Production → Delivery → Installation → QC →
Handover → Warranty/AMC → Service
```

`Project` is the spine. Every entity below carries a `projectId` (or is
reachable from one) so the full history of a deal can be reconstructed by
querying on a single ID, per the pack's stated management requirement
(current state / next action / blocker / owner / financial state /
project history / who-changed-what, reconstructible without manual
assembly).

## 2. Why adapters, not a rewrite

`src/types.ts` already has 229 exported types with real screens
depending on them (Phase 01 found 124+ screens reading `DbManager`
directly). Rewriting all of them in this phase would violate
non-negotiable principle #1 ("do not rewrite the application wholesale")
and principle #10 ("every phase must leave the repository buildable").

Instead:

- `src/domain/entities.ts` defines the **target** shape for each entity
  named in `RUN_ALL.md`.
- `src/domain/adapters.ts` provides pure functions that convert the
  existing `Lead` / `Deal` / `Payment` shapes into the canonical graph,
  deriving stable, deterministic child IDs (e.g. `Project` id
  `proj_<leadId>`) so the same legacy record always adapts to the same
  canonical ID — critical so Phase 04's repository layer can treat this
  as a safe, idempotent read-time (and eventually write-time) migration
  path rather than a one-off script.
- No existing component was changed in this phase. Phase 04
  (repository layer) and Phases 08/09 (workflow implementation) are
  where screens progressively adopt these types, per the pack's own
  phase ordering.

## 3. Entity reference

Each entity's canonical shape lives in `src/domain/entities.ts`; this
table records the non-negotiable metadata the pack requires (owner,
source of truth, mutation rights, immutability, audit) that a TypeScript
`interface` cannot express by itself.

| Entity | ID | Owner (who creates) | Source of truth | Key relationships | Lifecycle field | Who may mutate | Immutable fields | Audit requirement |
|---|---|---|---|---|---|---|---|---|
| `CanonicalUser` | `UserId` | admin (invite) / self (signup) | Firebase Auth + `users/{uid}` (Phase 05) | — | `status` | admin; self (name/phone only) | `id`, `role` (role change is an elevated action, Phase 05) | role/status changes audited |
| `Customer` | `CustomerId` | surveyor/admin, from a converted `Lead` | Firestore `customers/{id}` (target, Phase 04) | `sourceLeadId` → Lead | n/a (customers don't have a stage) | admin, surveyor (own leads), sales owner | `id`, `sourceLeadId` | profile edits audited |
| `Site` | `SiteId` | surveyor/admin, from `Lead.buildingInfo` | Firestore `sites/{id}` (target) | `customerId` → Customer | n/a | admin, surveyor, sales owner | `id`, `customerId` | address/geo changes audited |
| `CanonicalLead` | `LeadId` | surveyor (capture) | Firestore `leads/{id}` (already real, Phase 01 §4) | `projectId` → Project (set on conversion) | `stage` | assigned surveyor; admin | `id` | stage transitions audited (Phase 03/06) |
| `Project` | `ProjectId` | system, on lead conversion / project creation | Firestore `projects/{id}` (target, Phase 04) | `customerId`, `siteId`, `sourceLeadId`; parent of all downstream entities | `stage` (`ProjectStage`) | sales owner, admin; stage advances mostly via workflow events (Phase 07), not direct edits | `id`, `customerId`, `siteId` | every stage transition audited; this is the primary audit trail management reconstructs project history from |
| `Quote` | `QuoteId` | sales owner | Firestore `quotes/{id}` (target) | `projectId` → Project; `currentVersionId` → QuoteVersion | `status` | sales owner (draft/send); approver (approve); customer action recorded via `status` | `id`, `projectId` | approvals, sends, and status changes audited |
| `QuoteVersion` | `QuoteVersionId` | sales owner, on each negotiation round | same as Quote | `quoteId` → Quote | n/a (append-only) | nobody after creation — new terms = new version | entire record after creation | creation is itself the audit record |
| `Contract` | `ContractId` | system, on quote acceptance | Firestore `contracts/{id}` (rules already exist, Phase 01 §5) | `projectId`, `quoteVersionId` | `status` | admin/ops approver for status; customer signature recorded via `signedAt`/`signedByCustomer` | `id`, `projectId`, `quoteVersionId` | signature event always audited |
| `PaymentSchedule` | `PaymentScheduleId` | system, on contract signature | Firestore `payment_schedules/{id}` (target) | `projectId`, `contractId` | `status` | finance role | `id`, `projectId`, `contractId` | schedule edits audited |
| `Payment` | `PaymentId` | customer action / finance recording | Firestore `payments/{id}` (target) | `projectId`, `paymentScheduleId` | `status` (`PaymentAttemptStatus`) | finance role; customer (initiate only) | `id`, `projectId`, `idempotencyKey` | **every** payment mutation audited (Phase 06 — idempotency-critical) |
| `Invoice` | `InvoiceId` | finance | Firestore `invoices/{id}` (target) | `projectId`, optional `paymentId` | `status` | finance role | `id`, `projectId` | issuance/void audited |
| `Supplier` | `SupplierId` | procurement/admin | Firestore `suppliers/{id}` (target) | — | `status` | procurement role, admin | `id` | status changes audited |
| `PurchaseOrder` | `PurchaseOrderId` | procurement | Firestore `purchase_orders/{id}` (target) | `projectId`, `supplierId` | `status` | procurement (create); approver (approve) | `id`, `projectId`, `supplierId`, `idempotencyKey` | creation + approval audited (Phase 06) |
| `ProductionOrder` | `ProductionOrderId` | system, on PO acceptance | target | `projectId`, `purchaseOrderId` | `status` | supplier portal, procurement | `id` | status changes audited |
| `Shipment` | `ShipmentId` | supplier/logistics | target | `projectId`, `purchaseOrderId` | `status` | logistics role, supplier | `id` | dispatch/arrival audited |
| `DeliveryReceipt` | `DeliveryReceiptId` | receiving technician/site contact | target | `projectId`, `shipmentId` | `status` | receiver at time of receipt (immutable after) | entire record after creation | creation is the audit record; disputes create a linked incident, not an edit |
| `InstallationJob` | `InstallationJobId` | ops, on project reaching installation | target | `projectId`, `technicianId` | `status` | assigned technician; ops for reassignment | `id`, `projectId` | check-in/completion audited |
| `QCInspection` | `QCInspectionId` | QC inspector | target | `projectId`, `installationJobId` | `result` | assigned inspector | `id`, `projectId`, `installationJobId` | pass/fail always audited (gates Handover) |
| `Snag` | `SnagId` | QC inspector, on fail | target | `projectId`, `qcInspectionId` | `status` | assigned technician (rework), QC (re-inspect) | `id`, `qcInspectionId` | every rework loop iteration audited |
| `Handover` | `HandoverId` | ops, once QC passes | target | `projectId`; `qcPassed` derived from linked `QCInspection` | `status` | ops/admin; customer acceptance recorded, not self-service | `id`, `projectId`, `qcPassed` (system-set only) | acceptance + certificate issuance audited — this is the hard gate Phase 09 enforces |
| `Warranty` | `WarrantyId` | system, on handover certificate | target | `projectId`, `handoverId` | (date range) | admin | `id`, `handoverId` | n/a beyond creation |
| `AMC` | `AMCId` | sales/customer success | target | `projectId` | `status` | admin, sales | `id` | renewal/cancellation audited |
| `ServiceCase` | `ServiceCaseId` | customer/technician | target | `projectId` | `status` | assigned technician, admin | `id`, `reportedBy` | resolution audited |
| `DocumentRecord` | `DocumentId` | uploader | object storage + metadata (Phase 11) | optional `projectId`; polymorphic `ownerEntityType/Id` | `version` | uploader; admin | `id`, `storagePath` history | access audited (Phase 11/12) |
| `NotificationRecord` | `NotificationId` | system (from events, Phase 07) | target | optional `projectId` | `status` | system only | `id`, `idempotencyKey` | delivery status audited |
| `ApprovalRequest` | `ApprovalRequestId` | system, when a permission-gated action needs elevation | target | optional `projectId`; `entityType/entityId` | `status` | designated approver only | `id`, `requiredPermission` | decision always audited |
| `AuditEvent` | `AuditEventId` | system, on every governed mutation | target (append-only, Phase 06) | optional `projectId`; `entityType/entityId` | n/a (append-only) | nobody — immutable | entire record | is itself the audit mechanism |
| `WorkflowInstance` | `WorkflowInstanceId` | event bus (Phase 07) | target | optional `projectId` | `status` | system | `id`, `workflowKey` | every status change audited |
| `WorkflowExecution` | `WorkflowExecutionId` | event bus, per step attempt | target | `workflowInstanceId` | `status` | system | `id`, `idempotencyKey` | retries/failures audited (Phase 06/07) |

"Target" in the Source-of-truth column means: not yet backed by a real
Firestore collection as of this phase — that migration is Phase 04's
job. This phase defines the shape and ID graph; it does not claim these
collections exist in production yet (Phase 01 confirmed only `users`,
`leads`, `contracts`, `site_sops`, `breakdown_sos`, `audit_logs`,
`help_articles` currently have Firestore rules).

## 4. Project spine demonstration (acceptance criterion)

`scripts/domain-graph-check.ts` builds a full
`Customer → Site → Project → Quote → Contract → Payment` graph from a
realistic legacy `Lead` + `Deal` + `Payment[]` fixture (the exact shapes
`DbManager` produces today) using the adapters, then asserts every
foreign-key-style ID reference resolves correctly, including:

- `Site.customerId === Customer.id`
- `Project.customerId === Customer.id`, `Project.siteId === Site.id`
- `Quote.projectId === Project.id`
- `QuoteVersion.quoteId === Quote.id`, `Quote.currentVersionId === QuoteVersion.id`
- `Contract.projectId === Project.id`, `Contract.quoteVersionId === QuoteVersion.id`
- `PaymentSchedule.projectId === Project.id`, `.contractId === Contract.id`
- Each `Payment.projectId === Project.id` and `.paymentScheduleId === PaymentSchedule.id`
- Legacy payment status → canonical status mapping (`paid` → `confirmed`,
  `pending`/others → `initiated`)
- Every converted `Payment` carries a non-empty `idempotencyKey`

Run: `npm run domain:check`. All 16 assertions pass as of this commit.

## 5. Build/typecheck

`npx tsc --noEmit` passes with the new `src/domain/` module added; no
existing file was modified except `package.json` (two new npm scripts).
