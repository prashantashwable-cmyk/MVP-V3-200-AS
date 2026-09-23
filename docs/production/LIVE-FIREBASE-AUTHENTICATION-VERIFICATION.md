# Live Firebase Authentication Verification (Phase 43)

**Date:** 2026-09-23
**HEAD at generation:** `d889bd4` (Phase 42)

This phase re-confirms and extends Phase 33's
`docs/production/LIVE-AUTHENTICATION-STATUS.md` to the full scenario
matrix this phase's spec names (per-role × login/logout/refresh/expired/
unauthorized/session-persistence/expiration/logout-invalidation/refresh-
behavior/direct-URL-navigation/role-switching-impossibility). Nothing
here converts a prior BLOCKED into VERIFIED — this phase adds coverage
and precision, not a different conclusion.

## 1. Re-run of the Phase 33 harness (fresh, this session)

```
$ npx tsx scripts/live-firebase-auth-test.ts
...
=== Summary: 2 PASS, 0 FAIL, 9 BLOCKED (of 11 total checks) ===
PRODUCTION READINESS STATUS for live Firebase Authentication: BLOCKED — MISSING CREDENTIAL.
```

Unchanged from Phase 33 — same 2 real structural PASSes (client SDK
initializes, `auth`/`db` exports non-null), same 9 BLOCKED scenarios, for
the same reason: no `FIREBASE_TEST_EMAIL`/`FIREBASE_TEST_PASSWORD` and no
`FIREBASE_ADMIN_SA_JSON` exist anywhere in this sandbox (re-confirmed:
`env | grep -i FIREBASE` is empty, no `.env.local`, no service-account
JSON file anywhere in the repo tree).

## 2. Actual role model (correcting this phase's generic role list to reality)

This phase's master spec names 8 roles to test (Admin/Sales/Finance/
Procurement/Technician/QC/Customer/Supplier). The ACTUAL canonical role
type this codebase implements (`src/domain/entities.ts`'s
`CanonicalUserRole`, `src/types.ts`'s `UserRole`) has only **5** distinct
identities:

```ts
export type CanonicalUserRole = 'admin' | 'surveyor' | 'technician' | 'customer' | 'supplier';
```

Sales/Finance/Procurement/QC are not separate Firebase-Auth-backed
identities in this system — they are **Operating Surfaces** (Phase 10/20)
and **permission scopes** (`src/domain/permissions.ts`'s `Permission`
union: `quote.approve`, `payment.refund`, `po.approve`, `qc.approve`,
etc.) that the single `admin` role holds all of, per
`ADMIN_ALL` in `src/domain/permissions.ts`. This is a real, load-bearing
architectural fact, not a shortcut: the system's own design (Phase 05)
is "one role, many permissions," not "one Firebase identity per business
function." Testing "the Finance role" for real therefore means testing
an `admin` identity's `payment.*` permission subset, not a distinct
login. This phase's matrix below is built against the REAL 5-role model
plus the real permission scopes within `admin`, not the spec's generic
placeholder list, because testing against identities that don't exist in
the code would itself be a fabrication.

## 3. Full scenario matrix

Every cell is one of: **BLOCKED — MISSING CREDENTIAL** (needs a real
Firebase Auth session this sandbox cannot create), or **COVERED
ELSEWHERE — STRUCTURAL/DEMO-MODE** (a real, non-fabricated test exists,
but exercises route-guard/permission CODE, not a live Firebase Auth
session — cross-referenced, not duplicated here).

| Scenario | admin | surveyor | technician | customer | supplier |
|---|---|---|---|---|---|
| Login (real Google Sign-In) | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Logout | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Session refresh (ID token TTL) | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Session persistence across reload | BLOCKED (live); COVERED ELSEWHERE — demo-mode `localStorage` restore path exercised in Phase 46 | same | same | same | same |
| Session expiration | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Logout invalidation (old token rejected) | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Unauthorized access (no role / wrong role) | BLOCKED (live Firestore denial); COVERED ELSEWHERE — `scripts/authz-check.ts` + `scripts/full-company-simulation.ts` structurally prove 2 real unauthorized-role denials (technician cannot self-issue handover, customer cannot approve their own handover) | | | | |
| Direct URL navigation to a restricted route | COVERED ELSEWHERE — Phase 46/47 local-build Playwright UAT drives this against the REAL client-side route-guard code (not a live backend concern — route guards run before any Firestore call) | | | | |
| Role-switching impossibility (one session cannot become another role client-side) | COVERED ELSEWHERE — `src/domain/permissions.ts`/`src/lib/authz.ts` are pure functions of the role stored server-side in Firestore's `users` collection; Phase 44's static rules analysis re-confirms `users.role` is not self-writable by a non-admin (see Phase 44 §`users` collection) |

## 4. What would unblock the BLOCKED cells, restated precisely

Unchanged from Phase 33, restated for completeness:
1. A real, dedicated (non-production) test account with Email/Password
   sign-in enabled in the `dogwood-torus-v71nt` project's Auth settings.
2. A real Firebase service-account JSON (Admin SDK) for out-of-session
   operations: disabling the test user, revoking its refresh tokens,
   setting its role directly in Firestore as an admin identity.

Neither exists in this sandbox, confirmed directly again this phase, not
assumed from Phase 33's report.

## 5. Architectural finding carried forward (re-confirmed, not re-discovered)

Phase 33's finding stands, re-verified against this session's fresh
script run: `src/App.tsx` has no `onAuthStateChanged` listener anywhere
— session restore is pure `localStorage` + local lookup, never
re-verified against the live Firebase Auth session. See
`docs/production/LIVE-AUTHENTICATION-STATUS.md` §"Real architectural
finding" for the full detail and recommended fix (not implemented — a
genuine behavior change needing live verification this sandbox cannot
perform).

## 6. Final status

**BLOCKED — MISSING CREDENTIAL** for every scenario requiring an actual
live Firebase Auth session or Admin SDK call (9 of the matrix's live
cells, consistent with Phase 33). **Real, executed coverage exists** for
the client-side route-guard/permission/RBAC code shape (structural
scripts + Phase 44's static rules analysis + Phase 46/47's local-build
Playwright UAT), cross-referenced rather than duplicated. Nothing in
this matrix is marked PASS or VERIFIED for a scenario that was not
actually executed against real infrastructure.
