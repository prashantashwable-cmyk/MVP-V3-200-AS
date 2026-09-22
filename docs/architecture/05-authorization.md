# AIEC — Identity, RBAC, and Server-Side Authorization (Phase 05)

Implements: `src/types.ts` (`AuthMethod`), `src/domain/permissions.ts`,
`src/lib/authz.ts`, `firestore.rules` (users-collection fix), 4 small
additive edits in `src/App.tsx`. Acceptance check: `scripts/authz-check.ts`
(`npm run authz:check`).

## 1. What Phase 01 found, re-examined precisely

Phase 01 flagged the `aiec_session_token` (`session_<userId>`) as a
"forgeable identity mechanism." Investigating precisely which login paths
actually use it, before changing anything (per the pack's own execution
rule):

| Login path | Calls Firebase Auth? | `request.auth` at Firestore for this session |
|---|---|---|
| Google Sign-In (`handleGoogleSignIn`) | **Yes** — `signInWithPopup` | Real, non-null — genuine Firebase ID token |
| Email/password (`handleEmailSubmit`) | No — checks a hardcoded 6-account map + literal password `'password123'` entirely client-side | **null** — Firestore already treats this as unauthenticated |
| OTP/phone (`triggerInstantVerification`) | No — accepts literal codes `'123456'`/`'1234'`/`'888888'`, no SMS provider | **null** — same as above |
| "Try as Role" demo bypass | No | **null** |

**Finding:** the forgeable `aiec_session_token` was never actually a
threat to Firestore data — 3 of the 4 login paths never call Firebase
Auth at all, so `firestore.rules`' `isAuthenticated()` (which reads
`request.auth`) was already `false` for all of them, before this phase.
The real, separate problems this phase found and fixed:

1. **A genuine, live privilege-escalation hole** in the `users`
   collection rule (see §2) — this one DID affect real, Firebase-Auth
   sessions.
2. **The app has no permission model at all** — every one of the 189
   screens' "authorization" is a `currentUser.role === '...'` conditional
   with no shared vocabulary, no server-side equivalent, and no way to
   express "this role, but only with a verified identity" for high-risk
   actions. This is what most of this phase's new code addresses.
3. **Three of four login paths silently present themselves as
   equally trustworthy** (`isDemo: false`) despite having no real
   credential verification behind them — addressed by the new
   `AuthMethod` field (§3), without changing any of their existing,
   working behavior.

## 2. Fixed: `users` collection privilege escalation

Before this phase, `firestore.rules`:

```
allow write: if isAdmin() || (isAuthenticated() && request.auth.uid == userId);
```

Any real, Firebase-Auth-signed-in user could write **any field of their
own user document**, including `role`, directly via the Firestore SDK —
bypassing the "owner email → admin, else pending_selection" logic that
only existed in client JS (`src/lib/firestoreUsers.ts`). A non-owner
Google account could set its own `role` to `'admin'` with a single
`setDoc` call the app's own UI never needed to expose.

Fixed (rule now split into `create`/`update`/`delete`):

- **create**: a document may self-claim `role: 'admin'` only if the
  token's email is the designated owner email (`isOwnerEmail()`) —
  matching, and now actually enforcing, the existing intended logic.
- **update**: `role` and `status` may only change via `isAdmin()`; a
  user's own update to their own document cannot alter either field.
- **delete**: admin only (was already implied, now explicit).

Verified non-breaking: `updateFirestoreUser` (the only function that
could self-update a Firestore user doc) is imported in `App.tsx` but
**never called anywhere in the current codebase** (confirmed by repo-wide
search), and `RoleSelectionWizard.tsx`'s role-selection flow only calls
`DbManager.updateUser` (the local demo store), never touches the
Firestore `users` doc. So this fix closes a real hole with zero impact on
any currently-working flow.

## 3. `AuthMethod` — honest labeling of identity strength

`src/types.ts` adds `AuthMethod = 'firebase_auth' | 'otp_unverified' |
'password_unverified' | 'demo'` (optional field on `User`, fully
additive — no existing field removed or renamed). Set at each of
`App.tsx`'s 4 session-creation sites, with **zero change to their
existing control flow, UI, or stored data** — this is purely a new label
attached to the same objects that were already being created:

- Google Sign-In → `'firebase_auth'` (the one real credential today)
- Email/password fallback → `'password_unverified'`
- OTP/phone fallback → `'otp_unverified'`
- "Try as Role" → `'demo'` (in addition to the pre-existing `isDemo: true`)

This does not restrict who can log in or what they can do day-to-day —
it only feeds the high-risk gate in `authz.ts` (§4).

## 4. Permission model

`src/domain/permissions.ts` defines the exact permission vocabulary from
`05_AUTHORIZATION_AND_ROLE_PERMISSIONS.md` (`project.read/update`,
`quote.create/discount/approve`, `contract.approve`,
`payment.read/create/refund`, `supplier.manage`, `po.approve`,
`job.execute`, `qc.approve`, `handover.approve`, `automation.publish`,
`user.manage`, `security.manage`) plus two direct siblings the pack's own
risk categories imply (`payment.payout`, `document.delete` for
"destructive deletion"). `ROLE_PERMISSIONS` maps each of the 5
`CanonicalUserRole`s to its permission set — admin gets everything,
others get exactly what their described day-to-day work needs.

`HIGH_RISK_PERMISSIONS` — exactly the pack's list (refunds, payouts,
large discounts → `quote.discount`, permission changes → `user.manage`,
credential/security changes → `security.manage`, automation publishing,
destructive deletion) — additionally requires `isVerifiedIdentity()`
(§3/§5), on top of the role check.

`src/lib/authz.ts` — `evaluatePermission()` / `can()` /
`assertPermission()` is the single decision function. Documented plainly
in its own header as **UI convenience only** where no server-side
equivalent exists yet — per non-negotiable principle #8, this file does
not claim to be enforcement by itself; §6 explains exactly where real
enforcement does and does not exist today.

## 5. High-risk action enforcement, concretely

| Action class (pack's list) | Permission | Extra gate |
|---|---|---|
| refunds | `payment.refund` | verified identity required |
| payouts | `payment.payout` | verified identity required |
| large discounts | `quote.discount` | verified identity required |
| permission changes | `user.manage` | verified identity required |
| credential/bank changes | `security.manage` | verified identity required |
| automation publishing | `automation.publish` | verified identity required |
| destructive deletion | `document.delete` | verified identity required |

Concrete, tested result: an admin who logged in through the (unverified)
OTP or email fallback **cannot** refund a payment, manage users, or
publish automation through `authz.ts` — even though their `role` is
`'admin'` — until they authenticate via the one real credential path
(Google Sign-In). A demo admin session is blocked from every high-risk
action outright, while normal-risk actions (`project.read`, etc.) remain
available so demo mode stays usable for its purpose (product
walkthroughs).

## 6. Where enforcement is real vs. where it is UI-convenience-only

- **Real (server-side, cannot be bypassed by a modified client):**
  Firestore rules — the `users` fix above, plus the Phase 04 rules for
  `customers`/`sites`/`projects`/`quotes`/`quote_versions`/
  `contracts_v2`/`payment_schedules`/`payments` (already admin-scoped for
  writes as of Phase 04, which happens to already match this phase's
  high-risk gate for those collections).
- **Not yet real (documented gap, not hidden):** the other ~124+ screens
  that read/write through `DbManager` have no server at all in front of
  them — there is no Express endpoint or Firestore document backing that
  data (Phase 01 §10 item 2). `authz.ts`'s `assertPermission()` calls,
  wherever added, are a real improvement (fail loudly instead of nothing)
  but are enforced only by the client actually running that code — a
  determined attacker modifying the client bypasses them. Closing this
  fully requires either (a) migrating each of those domains onto the
  Phase 04 repository + Firestore rules (the pack's own stated long-term
  plan, continued in Phases 08/09), or (b) a real backend service with
  its own auth. Neither is a one-phase-05 task at 189-screen scale; this
  phase's job was the model and the one currently-live hole, which are
  now both done.
- **`server.ts`** still has no authentication/authorization middleware on
  any route (Phase 01 §10 item 5, unchanged in this phase). Adding real
  server-side Firebase ID-token verification requires the
  `firebase-admin` package (not currently a dependency) and a live token
  to test against — which this sandbox cannot obtain (same documented gap
  as Phase 04 §6). Not attempted here rather than added untested;
  flagged for a follow-up phase with real credentials.

## 7. Acceptance

`npm run authz:check` (`scripts/authz-check.ts`) — 16/16 assertions pass,
directly exercising the decision function (not a UI button state) for:
unauthorized quote discount, unauthorized payment refund/payout,
unauthorized permission change, unauthorized destructive document access
— all denied; authorized equivalents with a verified admin identity — all
allowed; plus a static regression guard confirming `firestore.rules`
still contains the Phase 05 `users`-collection fix.

Firestore rules cannot be executed live in this sandbox (same Firebase
Emulator Suite / live-credential gap documented in
`docs/architecture/04-persistence.md` §6) — the static text check above
is the honest substitute; a follow-up with real credentials or the
Emulator Suite should run the Firestore Rules Unit Testing library
against `firestore.rules` directly.

## 8. Build/typecheck

`npx tsc --noEmit` passes. `npm run checks` (lint + domain + workflow +
repository + authz) passes in full. `npx vite build` passes, bundle size
effectively unchanged. The only existing-file edits were the 4
one-line-each `authMethod` additions in `src/App.tsx` and the `users`
rule split in `firestore.rules` — no existing screen, router, or
`DbManager` behavior was changed.
