# MVP Workflow Map

Source of truth: `server/workflow/lifecycle.ts` (states) and `server/workflow/catalog.ts` (work rules).

## Project state machine

```
LEAD ──(data complete: SYSTEM)──▶ QUALIFIED ──(auto-quote ≥20% margin)──▶ QUOTE_SENT
  │ (data missing → QUALIFY_LEAD, Admin)                                    │
  │                                                     customer declines ─┴─▶ CLOSED_LOST
  ▼                                                     customer accepts
TOKEN_REQUIRED ──(gateway PAID)──▶ TOKEN_PAID ─SYSTEM─▶ TECHNICAL_CLEARANCE
                                                              │ evidence PASS (FLAG → Admin review)
                                                              ▼
CLEARANCE_APPROVED ─SYSTEM─▶ MATERIAL_DISPATCH ──(dispatch proof PASS)──▶ MATERIAL_DISPATCHED
                                                              │ site receipt PASS
                                                              ▼
MATERIAL_RECEIVED ─SYSTEM─▶ MATERIAL_PAYMENT_REQUIRED ──(PAID)──▶ MATERIAL_PAYMENT_RECEIVED
                                                              │ SYSTEM (money gate passed)
                                                              ▼
INSTALLATION ──(SOP evidence PASS)──▶ QC ──PASS──▶ QC_PASSED ─SYSTEM─▶ HANDOVER
                                       ▲  │ FAIL
                                       │  ▼
                                     REWORK (installer fixes snags)
HANDOVER ──(customer signature + checklist + rating)──▶ FINAL_PAYMENT_REQUIRED ──(PAID)──▶
FINAL_PAYMENT_RECEIVED ─SYSTEM─▶ COMPLETED
```

Every arrow is written to the audit log. Transient states (`TOKEN_PAID`, `CLEARANCE_APPROVED`, `MATERIAL_RECEIVED`, `MATERIAL_PAYMENT_RECEIVED`, `QC_PASSED`, `FINAL_PAYMENT_RECEIVED`) are milestones the SYSTEM records and then passes through immediately.

## Work items

| State entered | Work item | Owner (strategy) | Accept SLA | Done SLA | Proof | Pays |
|---|---|---|---|---|---|---|
| LEAD (incomplete) | QUALIFY_LEAD | Admin | – | 8h | Missing fields filled | – |
| QUOTE_SENT | CUSTOMER_QUOTE_DECISION | Customer | – | 48h | Authenticated decision | – |
| TOKEN_REQUIRED | TOKEN_PAYMENT ₹10,000 | Customer | – | 24h | Gateway receipt | – |
| TECHNICAL_CLEARANCE | TECHNICAL_CLEARANCE | Technician (least loaded, then nearest) | 2h | 24h | GPS ≤500 m, 2 photos, 4 measurements, 4-item checklist | ₹1,500 |
| MATERIAL_DISPATCH | SUPPLIER_DISPATCH | Supplier (least loaded) | 4h | 72h | Photo, LR no., vehicle no., 3-item checklist | – |
| MATERIAL_DISPATCHED | MATERIAL_RECEIPT | Technician (becomes the installer) | 4h | 72h | GPS, photo, checklist | ₹500 |
| MATERIAL_PAYMENT_REQUIRED | MATERIAL_PAYMENT (90% − token) | Customer | – | 72h | Gateway receipt | – |
| INSTALLATION | INSTALLATION | The installer | 4h | 14d | GPS, 3 photos, 6-step SOP checklist | ₹12,000 |
| QC | QC_INSPECTION | Technician ≠ installer | 4h | 48h | GPS, 2 photos, ≥10 trial runs, PASS/FAIL, checklist | ₹1,500 |
| REWORK | REWORK | The installer | 4h | 72h | GPS, photo, checklist | – |
| HANDOVER | HANDOVER_ACCEPTANCE | Customer | – | 72h | Signature, rating, checklist | – |
| FINAL_PAYMENT_REQUIRED | FINAL_PAYMENT (10%) | Customer | – | 7d | Gateway receipt | – |

## Work item lifecycle

```
UNASSIGNED ──assign──▶ ASSIGNED ──accept──▶ ACCEPTED ──evidence──▶ IN_PROGRESS ──submit──▶ validate
   ▲  (nobody eligible → Admin)   │ decline / timeout → REASSIGN (next eligible, exclusion list)   │
   │                              │                                                               ├─PASS─▶ COMPLETED ─▶ next state ─▶ next work item
   └──────────────────────────────┘                                                               ├─FAIL─▶ REJECTED (retry; after max → REASSIGN)
customer/payment tasks start at OPEN (no acceptance step)                                         └─FLAG─▶ FLAGGED (Admin approves / rejects)
Missing evidence on submit → refused (422); status unchanged; no retry consumed.
```

## SLA ladder (no silent failure)

Percentages are of the current window (accept window, or completion window).

| Owner | Ladder |
|---|---|
| Technician / supplier | 50% (accept) or 75% (complete) **remind** → 100% **escalate** (owner + Admin FYI: "no action required") → 150% **reassign** automatically. When reassignments are exhausted or nobody is eligible → **Admin required** |
| Customer | 50% **remind** → 100% **escalate** → 150% **Admin required** (a human must phone the customer) |
| Evidence | FAIL → retry. Fails `maxEvidenceRetries` (2) times → reassign + Admin FYI |
| Payment | FAIL → project held in `*_REQUIRED`, customer retries. 3 failures → `PAYMENT_BLOCKED`, Admin required (can record an audited offline payment) |
| Lost access | Deactivating a user revokes their sessions and reassigns all their open work immediately |

## Payment gates
- Payments exist only for `TOKEN`, `MATERIAL` and `FINAL`. Amounts come from the stored quote: token ₹10,000, material = 90% of total − token, final = the remainder.
- `pay()` is allowed only when the project is in that milestone's `*_REQUIRED` state and the payment is `REQUIRED` or `FAILED`. It claims `PROCESSING` first, so a double click cannot charge twice.
- Installation cannot be created before the material payment is `PAID`, because the `INSTALLATION` state is only reachable from `MATERIAL_PAYMENT_RECEIVED`.
- Technician earnings become `ELIGIBLE` only when their work item COMPLETES after evidence PASS. Disbursement itself is out of MVP scope.
