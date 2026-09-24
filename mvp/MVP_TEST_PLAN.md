# MVP Test Plan

Run everything:

```bash
npm run mvp:typecheck   # strict TS for server/tests; client under V3's settings
npm run mvp:test        # 21 automated tests (node:test via tsx)
npm run mvp:simulate    # 3 concurrent projects, prints audit trail + KPIs, exits non-zero on failure
npm run lint            # V3's own typecheck still passes with mvp/ present
```

## Automated tests (`mvp/test/`)

| # | Test | Proves | File |
|---|---|---|---|
| S | Happy path lead → COMPLETED | Every hand-off is created and assigned by the system. 0 Admin interventions, 100% automation. Invariant holds at every step. QC ≠ installer. Milestone amounts sum to the quote. Payouts only after evidence | `lifecycle.test.ts` |
| – | Margin floor | Quote ≥ 20% margin; below-floor prices throw | `lifecycle.test.ts` |
| – | Incomplete lead | Becomes an Admin work item; after Admin fixes it, the flow runs itself; counted as 1 intervention | `lifecycle.test.ts` |
| – | Quote declined | CLOSED_LOST, no orphan work | `lifecycle.test.ts` |
| F1 | Technician does not accept | Reminder at 1h, escalation at 2h (Admin FYI, "no action required"), auto-reassign at 3h; the old owner is locked out | `failures.test.ts` |
| F2 | Accepts but misses deadline | Reminder → overdue/escalated (at_risk) → reassigned; the old owner's evidence doesn't count | `failures.test.ts` |
| F3 | Evidence missing | Submit refused, status unchanged, no retry consumed, no payout | `failures.test.ts` |
| F4 | Evidence invalid | Off-site GPS → REJECTED → retry. Stale timestamps → REJECTED. 2 rejections → reassigned. New owner completes | `failures.test.ts` |
| F4b | Out-of-tolerance evidence | FLAGGED, never auto-approved; Admin approval counted with cause EVIDENCE_REVIEW | `failures.test.ts` |
| F5 | Customer does not approve | Reminder → escalation → Admin required (CUSTOMER_NO_RESPONSE); Admin extends; flow resumes; automation < 100% | `failures.test.ts` |
| F6 | Payment fails | Project held at TOKEN_REQUIRED; no clearance work created; retry succeeds. 3 failures → PAYMENT_BLOCKED → audited offline payment; paying twice refused | `failures.test.ts` |
| F7 | Concurrent same transition | Two simultaneous `pay()`: one succeeds, gateway charged once, next work created once. Stale-version double accept refused | `failures.test.ts` |
| F8 | Network disappears | V3 Outbox holds evidence while offline; syncs later; a lost HTTP response + retry creates **no duplicate** (idempotency key) | `failures.test.ts` |
| F9 | User loses access | Sessions revoked, open work reassigned. No technicians left → explicit Admin exception (still "owned"). Restoring access auto-assigns | `failures.test.ts` |
| F10 | System restarts | File DB closed and reopened after 4h "downtime": scheduler catches up (remind → escalate → reassign), project completes, audit log is immutable (UPDATE/DELETE rejected) | `failures.test.ts` |
| QC | QC fail loop | QC FAIL → rework to installer → new QC by a different technician → pass | `failures.test.ts` |
| G1 | Shipped rules | No MISSING checks, no orphan states, readiness ≥ 90%, honest partials visible | `gaps.test.ts` |
| G2 | Rules removed | Owner, SLA, next action, failure policy, evidence and escalation removed → each detected | `gaps.test.ts` |
| G3 | Runtime orphan | Rule for MATERIAL_DISPATCH removed → project arrives with no work → AUTOMATION EXCEPTION in invariants and Control Tower | `gaps.test.ts` |
| G4 | Lost owner/deadline | A work item without owner or deadline is detected | `gaps.test.ts` |
| E2E | 8 users, real HTTP | Each user logs in separately. Full lifecycle via API only. 403 for non-owners and cross-customer access. Suppliers get no customer/money data. 422 on premature submit. Duplicate evidence deduplicated. Client can't set the payment amount. No endpoint can set payment/state (404). Deactivation kills sessions (401) | `e2e-http.test.ts` |

## Manual verification done during build (headless Chromium, Playwright)
- Admin, technician and customer in separate browser contexts; the demo bot ran; no page errors.
- The customer accepted the quote and paid in the UI. The technician accepted in the UI, then **went offline**: GPS, 2 photos, measurements and checklist showed `PENDING SYNC`. Back online, all became `SYNCED`. Submit passed and "✓ COMPLETED ₹1,500 earned" was shown.
- This run found a real bug: offline retries used up the 5-attempt budget and showed `SYNC FAILED`. Fixed: attempts are only counted against real server rejections.
- Live server killed and restarted on the same DB: project state, current work item, owner and the Admin session were all intact.

## Not tested (see gap register)
Real payment gateway, real CV, real SMS/WhatsApp, real GPS hardware accuracy, load beyond a few dozen users.
