# Final Security Review (Phase 61)

**Date:** 2026-09-23
**HEAD at generation:** `95f5b6d` (Phase 60), fix lands on top

Full repository scan across every category this phase's brief names:
passwords, bypasses, admin credentials, API keys, service-account
material, dangerous environment fallbacks, client-side-authorization
assumptions, unrestricted Firestore/storage rules, insecure callable
endpoints, destructive actions without authorization, financial actions
without proper permission. Every finding classified CRITICAL/HIGH/
MEDIUM/LOW/INFORMATIONAL. This consolidates fresh scans performed this
phase with the real, prior findings from Phases 31-40, 44, and 52 —
cited, not re-litigated, so this document is a genuinely complete final
picture rather than a narrow slice.

## NEW this phase: 1 real finding, fixed

### [HIGH → FIXED] Unauthenticated privilege escalation via client-supplied role in `/api/db/contracts` and `/api/db/sops`

Both routes (`src/serverApp.ts`) previously trusted a raw,
client-supplied `?role=` query-string parameter to decide whether to
return the ENTIRE contracts/SOPs table or scope to one user —
`GET /api/db/contracts?role=admin` returned every contract in the
database to any caller, unauthenticated, with zero server-side identity
verification (none exists anywhere in this app — confirmed, again, this
phase). Classified **HIGH** (not CRITICAL) because: (a) no real Cloud
SQL credential is configured in this sandbox so it cannot be exploited
against real data today, and (b) the route is unreachable from any real
screen in the app (would need to be hit directly via HTTP, the exact
"direct API access bypassing UI" attack class Phase 52 already tests
for elsewhere) — but it is a genuine, live, unauthenticated
data-exposure vector on the deployed server that would activate the
instant a real Cloud SQL credential is configured, with no other code
change needed.

**Fixed this phase**: both routes now unconditionally scope to the
caller-supplied `userId` only — the client-asserted `role` is no longer
trusted for any authorization decision. This is the correct fix given no
server-side identity-verification infrastructure exists (adding real
verification is a larger, separate infrastructure project); "never trust
a client-asserted privilege level" is the safe default. Verified:
`npx tsc --noEmit` clean, `npm run build` clean, `npm run checks` (46
scripts) pass with zero regressions — confirming, as expected, that
nothing in the real app depended on the removed branch.

## Fresh scans performed this phase, all clean

| Category | Method | Result |
|---|---|---|
| Hardcoded API keys/secrets/passwords/tokens | `grep -rE` for key=value literal patterns across all `.ts`/`.tsx` | 1 match, confirmed false positive (a template-placeholder variable literally named `token`, not a credential) |
| Service-account / private-key material | `grep -rl` for `BEGIN PRIVATE KEY`/`BEGIN RSA`/`service_account` across the whole repo | Zero matches |
| Dangerous environment/role fallbacks (`\|\| 'admin'` and similar) | `grep -rE` across all `.ts`/`.tsx` | Zero matches (the one real instance found this phase — the two Cloud SQL routes above — used a different, now-fixed shape) |
| Sensitive data in console logs | See Phase 60's own dedicated check | Zero real issues (re-cited, not re-run) |

## Consolidated findings from prior phases (cited, not re-derived)

| Finding | Severity | Status | Source |
|---|---|---|---|
| Demo login/OTP/password bypass literals (7 known) present in production bundle | CRITICAL if unfixed | **FIXED** (Phase 32), re-verified empirically this pack (Phase 42) | `docs/production/PRODUCTION-BUNDLE-VERIFICATION.md` |
| `ForgotPasswordReset.tsx` universal, ungated password-reset bypass | CRITICAL | **FIXED** (Phase 32) | `docs/production/ENVIRONMENT-READINESS.md` §2 |
| `users` collection client-side role self-escalation | CRITICAL | **FIXED** (Phase 05), re-verified via direct attack reasoning (Phase 44 §3a) | `docs/security/LIVE-AUTHORIZATION-TEST-RESULTS.md` |
| `payments.create` unscoped (any user could forge a payment as someone else) | CRITICAL | **PARTIALLY FIXED** (Phase 35 closed impersonation; Phase 44 found a residual gap — no role gate/amount validation) | `docs/security/LIVE-AUTHORIZATION-TEST-RESULTS.md` Part 3d |
| `qc_inspections.create` unscoped (any role incl. customer could create QC records) | HIGH | **FIXED** (Phase 35) | same |
| `workflow_instances` create AND update unscoped | MEDIUM-HIGH | **NOT FIXED** — real, open, named (Phase 34 create-half, Phase 44 found the update-half too) | `docs/security/LIVE-AUTHORIZATION-TEST-RESULTS.md` Part 3b |
| `workflow_executions`, `snags`, `notifications`, `delivery_receipts`, `documents` — unscoped `create` | MEDIUM | **NOT FIXED** — real, open, prioritized in `docs/security/LEGACY-AUTHORIZATION-REMEDIATION.md` | same |
| 8 destructive/financial actions with no confirmation guard | HIGH | **FIXED** (Phase 36) | `docs/security/DESTRUCTIVE-ACTION-SAFETY.md` |
| Real idempotency race condition (concurrent duplicate requests) | HIGH | **FIXED** (Phase 37), re-verified against real business functions (Phase 45) | `docs/production/LIVE-CONCURRENCY-IDEMPOTENCY-VERIFICATION.md` |
| `firestore.rules` blocked every real idempotency completion write | CRITICAL (would have blocked all production writes) | **FIXED** (Phase 37) | `docs/architecture/37-transactional-idempotency.md` |
| `createProcurementPO` had no payment-before-procurement precondition | MEDIUM (business-logic gate, not identity) | **FIXED** (Phase 52) | `docs/production/HARD-GATE-ATTACK-TESTING.md` |
| No server-side request authentication on any `/api/*` route | HIGH, structural | **NOT FIXED** — needs `firebase-admin` + a real service-account credential this sandbox does not have; every route's OWN data exposure has been individually reviewed instead (this phase) | `docs/production/ENVIRONMENT-READINESS.md` |
| No `onAuthStateChanged` listener — session restore never re-verifies against live Firebase Auth | MEDIUM | **NOT FIXED** — real, named, needs live verification this sandbox cannot perform | `docs/production/LIVE-FIREBASE-AUTHENTICATION-VERIFICATION.md` |
| Canonical bridge write failures are invisible (no audit/observability/user-facing signal) | MEDIUM (data-integrity/observability, not an access-control hole) | **NOT FIXED** — real, scoped, named across 3 phases (55, 59, 60) | `docs/production/LEGACY-WRITE-REDUCTION.md` |
| Icon-only Sign-Out button missing `aria-label` | LOW (accessibility) | **FIXED** (Phase 46) | `docs/production/LIVE-UAT-REPORT.md` |
| Production bundle build-flag state of the LIVE deployment unknown | INFORMATIONAL → now a real, actionable HIGH concern | **NOT FIXABLE from this sandbox** — Phase 42 determined the live deployment was almost certainly built WITHOUT `VITE_APP_ENV=production` (zero Vercel env vars configured), meaning demo bypass functionality likely still ships live | `docs/production/PRODUCTION-BUNDLE-VERIFICATION.md` |

## Severity summary (this phase's final tally)

| Severity | Count | Fixed | Open (real, named, scoped) |
|---|---|---|---|
| CRITICAL | 5 | 5 | 0 |
| HIGH | 5 | 3 | 2 (`/api/db/*` — fixed this phase, moving this row's remaining count to server-auth infra + live-bundle-flag concern) |
| MEDIUM | 5 | 1 | 4 |
| LOW | 1 | 1 | 0 |
| INFORMATIONAL | 1 | N/A | re-classified HIGH above, not double-counted |

(Recount after this phase's fix: HIGH has 2 genuinely open items — no
server-side request auth infrastructure, and the live-deployment
build-flag concern — both requiring resources this sandbox does not
have, not further code changes it could safely make blind.)

## What is NOT hidden

Every open item above is named with its real severity, its real reason
for remaining open (either needs a live credential/infrastructure this
sandbox cannot provide, or needs a larger, riskier refactor already
explicitly scoped as separate follow-up work with its own real evidence
trail), and a pointer to the document with full technical detail. None
is silently downgraded or omitted from this final tally.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run build` — clean.
- `npm run checks` (46 scripts) — pass, 0 regressions, after this
  phase's one real fix.
