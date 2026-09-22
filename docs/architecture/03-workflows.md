# AIEC — Workflow State Machines and Screen Registry (Phase 03)

Implements: `src/workflows/types.ts` (reusable state-machine primitives),
`src/workflows/definitions/{sales,quote,payment,procurement,installation,qc,handover}.ts`
(the 7 required skeletons), `src/workflows/screenRegistry.ts` (all 189
screens classified). Acceptance check: `scripts/workflow-validate.ts`
(`npm run workflow:validate`).

## 1. Reusable primitives (`src/workflows/types.ts`)

- `WorkflowDefinition<State>` — `{ key, label, states[], transitions[], initialState }`.
- `WorkflowTransition<State>` — `{ from, to, allowedRoles, event, entryCondition?, isException? }`.
  `event` is drawn from the canonical event vocabulary Phase 07 formalizes
  (`LEAD_CREATED`, `QUOTE_ACCEPTED`, `QC_FAILED`, ... — this phase already
  uses the exact event names Phase 07's skeleton lists, so Phase 07 wires
  directly into what's defined here rather than inventing a second
  vocabulary).
- `isException: true` marks a transition as a loop/exception path (snag →
  rework → re-inspection, payment retry, PO rejection, etc.) rather than
  the happy path — this is how "snag/rework/reinspection must support
  controlled loops" and "payment/loan must be alternative paths" (Phase
  03's "Important" section) are represented as data instead of ad-hoc
  per-screen logic.
- `validateWorkflowDefinition()` checks: every `from`/`to` references a
  real state, every transition has at least one allowed role, and every
  non-terminal state has at least one outgoing transition (no silent dead
  ends a project could get permanently stuck in).
- `ScreenDefinition` — the exact shape Phase 03 specifies: `screenId`,
  `surface`, `workflow`, `stage`, `roles`, `purpose`, `entryCondition`,
  `primaryAction`, `completionEvent`, `nextStages`, `exceptionStages`,
  plus `file`/`dataSource` carried over from the Phase 01 inventory for
  traceability, and `kind` (one of the 7 required screen classifications).

## 2. The 7 workflow skeletons

All 7 are implemented exactly as specified in
`03_WORKFLOW_STATE_MACHINE_AND_SCREEN_REGISTRY.md`, each with real role
assignments and explicit exception/loop transitions:

| Workflow | States | Happy-path length | Exception/loop transitions |
|---|---|---|---|
| `sales` | lead_created → qualification → assignment → follow_up → site_survey → customer_site_confirmed → quote_started | 6 | lost (from any pre-quote stage), follow_up self-loop (re-attempt) |
| `quote` | requirements → configuration → pricing_margin → internal_approval → preview → sent → negotiation → counter_approval → customer_acceptance → contract → e_sign → closure | 11 | rejected (from sent/negotiation), negotiation self-loop, counter_approval → negotiation on rejection |
| `payment` | schedule_created → installment_due → **{direct_payment_initiated \| loan_application_in_progress}** → payment_confirmed → receipt_issued → ledger_posted → reconciled | 6-7 (branches) | payment_failed → retry to installment_due, disputed ↔ payment_confirmed, ledger reconciliation_mismatch → disputed, installment_due overdue self-loop |
| `procurement` | need_identified → supplier_selected → rfq_priced → po_drafted → po_approval → supplier_acceptance → production → dispatch → delivery → receipt → reconciliation_payable | 10 | po_rejected (from po_approval), receipt → incident → supplier_selected (Supplier Resolution) or back to receipt |
| `installation` | assigned → job_brief → site_readiness → checked_in → safety_confirmed → sop_execution → material_usage_logged → evidence_captured → completion → qc_requested | 9 | blocked_site_not_ready ↔ site_readiness (strictly sequential otherwise — enforces Phase 09's "cannot mark complete without check-in/readiness") |
| `qc` | assigned → inspection → **{passed \| snag_raised}** → rework → reinspection → **{passed \| snag_raised}** (loop) → compliance → handover_ready | 6-8 (loops) | inspection/reinspection → snag_raised is the exception branch; reinspection can loop back to snag_raised indefinitely — never auto-promoted to pass |
| `handover` | qc_pass_confirmed → compliance → final_checklist → customer_walkthrough → customer_acceptance → certificate_issued → warranty_amc_active | 6 | none — deliberately: Phase 09 requires QC failure can never reach handover, so this workflow's very first state name (`qc_pass_confirmed`) and its only entry transition's `entryCondition` (`qcPassed === true`) are the hard gate; there is no path into this workflow except through a passed QC |

Validated by `npm run workflow:validate`: all 7 definitions pass
`validateWorkflowDefinition` (no unknown states, no roleless transitions,
no non-terminal dead ends).

## 3. Screen registry (`src/workflows/screenRegistry.ts`)

All 189 `src/components/*.tsx` screens are classified into exactly one of
the 7 required kinds:

| Kind | Count | Meaning |
|---|---|---|
| `supporting_tool` | 76 | Used in context of a workflow but not itself a required step |
| `workflow_step` | 49 | Directly executes one stage of one of the 7 workflows above |
| `configuration` | 19 | Rules/templates/settings other steps read |
| `report` | 14 | Read-only analytics/aggregation |
| `document_detail` | 13 | Document/record detail or history view |
| `dashboard_control` | 11 | Overview/control surface for a role |
| `exception_handling` | 7 | Escalation/dispute/incident/SOS handling |

Workflow-step coverage by workflow (screens directly mapped to a named
stage): `procurement` 10, `payment` 9, `quote` 9, `sales` 7, `handover` 6,
`installation` 5, `qc` 3 — 49 total. Every `workflow_step` entry's
`entryCondition` / `completionEvent` / `nextStages` / `exceptionStages`
are pulled directly from that stage's actual transitions in
`src/workflows/definitions/*.ts` (via the generator described below), so
the registry cannot silently drift from the state machines it describes.

### How the registry was built (and how to regenerate it)

The registry is produced by cross-referencing
`docs/architecture/screen-inventory.csv` (Phase 01) against:

1. A hand-curated `workflowStepMap` (component name → `[workflow, stage]`)
   built from the actual component filenames that correspond to each
   pack-specified stage (e.g. `PurchaseOrderGenerator` → `procurement` /
   `po_drafted`, `DefectSnagListScreen` → `qc` / `snag_raised`,
   `HandoverCompletionCertificateScreen` → `handover` /
   `certificate_issued`).
2. A name-based heuristic for every other screen's `kind`
   (`config|setup|settings|rules|template` → configuration;
   `analytics|report|scorecard|leaderboard` → report;
   `escalation|dispute|incident|alert|sos` → exception_handling;
   `detail|repository|vault|certificate|checklist|history` →
   document_detail; `dashboard|home|kanban|tracker` → dashboard_control;
   else → supporting_tool).

This is an explicit, intentionally conservative first pass — accurate
enough that no screen is left unclassified and every workflow-step
mapping is a real, verifiable filename match, but not a hand-verified
read of all 189 files' internals. Phases 08-10 refine individual
`workflow_step` assignments as each surface is actually rebuilt against
the real engine; regenerating from the CSV + curated map keeps this
tractable at 189-screen scale without claiming false precision.

## 4. Important constraints honored

- **No forced linearity**: `payment` and `qc` both model real branches
  (direct vs. loan path; pass vs. snag) as actual alternate transitions
  from the same state, not a single linear chain with UI-level branching
  bolted on.
- **Controlled loops**: `qc`'s `reinspection → snag_raised` transition
  keeps the rework cycle open-ended rather than a fixed retry count, per
  Phase 09's explicit requirement.
- **Payment/loan as alternative paths, not accidental screen jumps**: both
  `direct_payment_initiated` and `loan_application_in_progress` converge
  back into the same `payment_confirmed` state via the same
  `PAYMENT_RECEIVED` event, so downstream stages (receipt, ledger,
  reconciliation) do not need to know which path was taken.

## 5. Build/typecheck

`npx tsc --noEmit` passes with `src/workflows/` added (49 KB across 10
new files). `npm run workflow:validate` passes (7/7 definitions valid,
189/189 registry entries resolve). No existing screen, router, or
`DbManager` code was modified.
