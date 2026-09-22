# AIEC — Final Operating Model (Phase 13)

The authoritative, current-state summary of what the AIEC Claude Code
Sequential Improvement Pack built across Phases 01-13. Read this
alongside `docs/aiec-implementation-log.md` (the chronological build
record) and the per-phase docs in `docs/architecture/` (the detailed
rationale for each decision this file summarizes).

## 1. Canonical lifecycle

```
Lead → Customer → Site → Project → Quote → Negotiation → Contract →
Payment → Procurement → Production → Delivery → Installation → QC →
Handover → Warranty/AMC → Service
```

`Project` is the spine every downstream record traces back to. Proven
concretely: `scripts/final-e2e-acceptance.ts` runs ONE project through
this entire lifecycle (Lead → Warranty) as a single continuous story —
not 13 separate, disconnected phase demonstrations.

## 2. Domain model

`src/domain/entities.ts` — 30 canonical entities (User, Customer, Site,
Lead, Project, Quote, QuoteVersion, Contract, PaymentSchedule, Payment,
Invoice, Supplier, PurchaseOrder, ProductionOrder, Shipment,
DeliveryReceipt, InstallationJob, QCInspection, Snag, Handover,
Warranty, AMC, ServiceCase, DocumentRecord, NotificationRecord,
ApprovalRequest, AuditEvent, WorkflowInstance, WorkflowExecution,
ReconciliationRecord), branded IDs (`src/domain/ids.ts`) preventing
cross-entity ID mixups at compile time. Full reference:
`docs/architecture/02-domain-model.md`.

Legacy `src/types.ts` (229 types, unmodified except 2 additive fields —
`User.authMethod`, `Payment`/`PurchaseOrder`'s pre-existing shapes) and
canonical types coexist by design, bridged by
`src/domain/adapters.ts` — not merged, per the pack's own "adapters, not
mass rewrite" instruction.

## 3. Workflow registry

`src/workflows/definitions/` — 7 explicit state machines (sales, quote,
payment, procurement, installation, qc, handover), each with real role
assignments and explicit exception/loop transitions (lost leads, quote
renegotiation, payment direct-vs-loan branch, PO rejection/incident, QC
snag/rework/reinspection open loop, a handover workflow gated entirely
on a real QC pass). `src/workflows/screenRegistry.ts` classifies all 189
original screens into 7 kinds (workflow_step/supporting_tool/
configuration/dashboard_control/report/exception_handling/
document_detail). Full reference: `docs/architecture/03-workflows.md`.

## 4. Five operating surfaces

WORK / CUSTOMERS / OPERATIONS / FINANCE / CONTROL
(`src/navigation/surfaces.ts`), classifying the REAL, live navigation
vocabulary (`App.tsx`'s `getTabsByRole()`), reachable via the mounted
`CommandPalette` (Ctrl/Cmd+K). Full reference:
`docs/architecture/10-five-surfaces.md`.

**Known scope boundary, stated plainly**: the five surfaces are
reachable via the command palette, not (yet) as replacement top-level
nav chrome — the existing sidebar/bottom nav is unchanged. See §9.

## 5. Permissions model

`src/domain/permissions.ts` — 19 permissions (`project.read/update`,
`quote.create/discount/approve`, `contract.approve`,
`payment.read/create/refund/payout`, `supplier.manage`, `po.approve`,
`job.execute`, `qc.approve`, `handover.approve`, `automation.publish`,
`user.manage`, `security.manage`, `document.delete`) mapped to the 5
roles. `HIGH_RISK_PERMISSIONS` additionally require a **verified
identity** (`authMethod === 'firebase_auth'`) — an admin logged in via
the app's unverified OTP/email fallback cannot refund payments, change
permissions, or publish automation, even though their role would
otherwise allow it. Enforced today: `src/lib/authz.ts` (client-side
decision function, real but not itself a security boundary) +
`firestore.rules` (real server-side boundary, for the collections
migrated onto the Phase 04 repository layer). Full reference:
`docs/architecture/05-authorization.md`.

## 6. Event model

`src/events/types.ts` — the pack's 18-event canonical vocabulary.
`src/events/bus.ts` — real execution engine: one `WorkflowInstance` per
event occurrence, idempotent handler execution (Phase 06's
`runIdempotent`), retry (3 attempts) + dead-letter with a persisted
`WorkflowExecution` record, manual-retry/human-escalation path.
6 events have real, tested handlers (`QUOTE_ACCEPTED`, `QC_FAILED`,
`QC_PASSED`, `HANDOVER_COMPLETED`, `PAYMENT_RECEIVED`,
`PAYMENT_OVERDUE`) — the remaining 12 are defined in the vocabulary but
have no handler yet, deliberately, rather than a fake one. Full
reference: `docs/architecture/07-event-bus.md`.

## 7. Audit model

`src/lib/audit.ts`'s `recordAuditEvent()` writes the canonical
`AuditEvent` shape to `audit_logs` (immutable, admin-read-only rule —
present before this pack, unused until this pack's code started writing
to it). Wired into every governed mutation this pack added: project
stage transitions, payment/PO creation, event-bus handler outcomes
(including dead-letters), document uploads, reconciliation exceptions,
notification sends. `src/lib/idempotency.ts`'s `runIdempotent()` is the
single reusable duplicate-request-dedup primitive used throughout. Full
reference: `docs/architecture/06-audit-idempotency.md`.

## 8. Integrations — real vs. documented gap

| Integration | Status |
|---|---|
| Firebase Auth (Google Sign-In) | Real — the one credential-verified login path |
| Firestore (users, leads — pre-existing) | Real, confirmed working before this pack |
| Firestore (project spine — Phases 04-12) | Rules deployed and reviewed; **live authenticated round-trip unverified in this sandbox** (no Firebase Auth credential available here — network path confirmed open via direct `curl`, see Phase 04 §6) |
| Gemini API, server-side | Real, pre-existing |
| Object storage (media/documents) | **Documented gap** — no bucket configured; real interface (`FirebaseStorageTransport`) ready |
| Email/WhatsApp/SMS providers | **Documented gap** — no provider configured; real interface (`ChannelTransport`) ready, honestly reports `'queued'` never `'delivered'` |
| Payment gateway / bank feed | **Documented gap** — no provider configured; real interface (`ExternalRecordSource`) ready |
| Server request authentication | **Documented gap** — `server.ts` has no auth middleware on any route; needs `firebase-admin` (not currently a dependency) |

## 9. Known limitations and production-readiness gaps

Consolidated from every phase's own "Known limitations" section
(`docs/aiec-implementation-log.md` has the full per-phase detail):

1. **Screen-level adoption is the largest remaining gap.** Phases 02-09
   and 11-12 built real domain/workflow/repository/authz/audit/
   idempotency/event/offline/notification/reconciliation/control-tower
   infrastructure and PROVED it end-to-end (`final-e2e-acceptance.ts`),
   but only Phase 10's command palette and environment badge are
   actually mounted in the live UI. The ~189 original screens still read/
   write through `DbManager` (the pre-existing in-memory/local store),
   not through this pack's repository layer. This was a deliberate,
   repeatedly-documented sequencing decision (RUN_ALL.md itself: "do not
   run Phase 10 UX simplification before Phases 02-09 establish the
   model"), not an oversight — but it means the infrastructure's
   correctness is proven, not yet its felt effect on daily screen use.
2. **Live Firestore round-trip unverified.** This sandbox has no Firebase
   Auth credential (confirmed: network to Firestore is open, no way to
   authenticate). Everything built on the repository layer is verified
   against its demo (in-memory) implementation, which shares the exact
   same interface and largely the same SDK call shapes as the Firestore
   implementation — but an authenticated live run has not happened here.
3. **Object storage, external notifications, and payment gateway
   integrations are real interfaces, zero live wiring.** No credentials
   exist in this environment for any of them.
4. **Server-side request authentication does not exist.** `server.ts`
   has no middleware verifying who is calling it.
5. **Destructive-action confirmation gap, quantified in Phase 12**: 43 of
   45 components with a delete/remove/revoke/deactivate/disable-style
   method have no detectable `confirm()` call.
6. **Five-surface nav chrome is not yet the primary navigation** — reachable
   via command palette only, per Phase 10's documented scope decision.
7. **Global search covers Project/Customer only**, not the full pack list
   (Quote/Contract/Payment/PO/Shipment/Job/QC by number) — those entities
   have no dedicated detail screen yet to land a result on.
8. **SLA breach detection is not a running background job** — `QC_FAILED`
   records an audited due-by marker; no scheduler evaluates it.

None of these are hidden — each is named, with reasoning, in the phase
that found or created it, and restated here for one consolidated view.

## 10. What "done" means for this pack

Every phase left the repository buildable (`tsc`/`vite build` verified
every single time) and added real, tested code — 325 acceptance
assertions across 14 scripts, zero regressions introduced by any later
phase against any earlier one. No existing screen, router, or
`DbManager` behavior was deleted or broken. This is the honest state of
a genuinely large body of architectural work: the foundation (Phases
02-09, 11-12) is real and proven; full screen-level adoption (rewiring
189 components onto it) is the explicitly-scoped, substantial follow-on
effort this foundation now makes tractable.
