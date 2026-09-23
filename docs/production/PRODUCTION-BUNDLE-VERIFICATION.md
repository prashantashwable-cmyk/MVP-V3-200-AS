# Production Bundle Verification (Phase 42)

**Date:** 2026-09-23
**HEAD at generation:** `be64f82` (Phase 41)

This phase re-verifies, with fresh evidence generated in this session
(not reused from Phase 32's report text), that a real
`VITE_APP_ENV=production` build of the current commit contains zero
demo/bypass/test/fake-credential material, and extends the check beyond
Phase 32's original scope (demo login literals) to the full category
list this phase's spec requires: demo bypass passwords, universal
credentials, test authentication shortcuts, development-only secrets,
hardcoded Firebase admin credentials, debug-only authorization bypasses,
fake payment credentials, fake production API keys.

## 1. Fresh production build (this session)

```
$ rm -rf dist && VITE_APP_ENV=production npx vite build
...
dist/assets/index-D2HmqBpU.js   2,789.69 kB │ gzip: 716.36 kB
✓ built in 14.81s
PWA v1.3.0 — precache 220 entries (6824.70 KiB)
```

212 output `.js` files (209 lazy route chunks + shared chunks, consistent
with Phase 23's code-splitting baseline).

## 2. Demo/bypass login literals (Phase 32's original scope) — re-run this session

`npx tsx scripts/production-bundle-bypass-check.ts` (real build + real
grep, executed fresh this session, not reused output):

```
OK: production bundle output does NOT contain "1234"
OK: demo/sandbox bundle output DOES contain "1234"           (positive control)
OK: production bundle output does NOT contain "123456"
OK: demo/sandbox bundle output DOES contain "123456"         (positive control)
OK: production bundle output does NOT contain "888888"
OK: demo/sandbox bundle output DOES contain "888888"         (positive control)
OK: production bundle output does NOT contain "password123"
OK: demo/sandbox bundle output DOES contain "password123"    (positive control)
OK: production bundle output does NOT contain admin@aiec.com
OK: demo/sandbox bundle output DOES contain admin@aiec.com   (positive control)
OK: production bundle output does NOT contain "4321"
OK: demo/sandbox bundle output DOES contain "4321"           (positive control)
OK: production bundle output does NOT contain "5541"
OK: demo/sandbox bundle output DOES contain "5541"           (positive control)

PASS: a real VITE_APP_ENV=production build contains zero demo login
bypass credentials in its bundle output; a real demo/sandbox build
genuinely still contains them (positive control proves the check can
actually detect what it claims to check for).
```

**Verdict: VERIFIED**, fresh evidence, same result as Phase 32.

## 3. Extended category sweep (this phase's own additional scope)

Run directly against this session's fresh `dist/assets/*.js` production
output:

| Category | Command (exact) | Result |
|---|---|---|
| Firebase Admin SDK / service-account material | `grep -rli 'service.account\|private_key\|BEGIN PRIVATE KEY\|firebase-admin\|FIREBASE_ADMIN' dist/assets/*.js dist/*.js` | **0 files matched** (exit 1 = no match) |
| Fake/test payment gateway secret or publishable keys (Stripe/Razorpay-shaped) | `grep -rlio 'sk_test_[A-Za-z0-9]\+\|sk_live_[A-Za-z0-9]\+\|pk_test_[A-Za-z0-9]\+\|pk_live_[A-Za-z0-9]\+' dist/assets/*.js` | **0 files matched** |
| `GEMINI_API_KEY` literal name/value leaking into client bundle | `grep -rl 'GEMINI_API_KEY' dist/assets/*.js` | **0 files matched** — confirms this secret never crosses the server/client boundary (it is read only in `src/serverApp.ts`, which never ships to the browser) |
| Debug-only authorization bypass flag names | `grep -rli '__DEMO_AUTH_ENABLED__\|isDemoOverride\|DEBUG_BYPASS\|skipAuth\|bypassAuth' dist/assets/*.js` | 1 file matched (`index-D2HmqBpU.js`) — **investigated below, false positive** |
| Firebase Web client config (expected, public by design) | `grep -l 'dogwood-torus-v71nt' dist/assets/*.js` | 1 file matched, expected — public client identifier, not a secret (see `docs/production/ENVIRONMENT-READINESS.md` §1) |

### 3a. Investigation of the one non-trivial match: `bypassAuthState`

The debug-bypass sweep matched on the substring `bypassAuth` inside
`bypassAuthState`. Traced to source:

```
$ grep -c '__DEMO_AUTH_ENABLED__' dist/assets/index-D2HmqBpU.js
0
```

The actual app-level constant `__DEMO_AUTH_ENABLED__` is **confirmed
absent** (0 occurrences) — the build-time dead-code-elimination described
in `vite.config.ts` worked as designed; there is no live app-level demo-
auth code path in this bundle at all, not just a gated one.

`bypassAuthState` itself was traced to its actual origin:

```
$ find node_modules/firebase -name "*.js" | xargs grep -l 'bypassAuthState'
node_modules/firebase/firebase-auth-cordova.js
node_modules/firebase/firebase-auth.js
node_modules/firebase/firebase-auth-compat.js
```

**This is genuine, unmodified Firebase Auth SDK internal code** (part of
its redirect-resolver/persistence-manager machinery, unrelated to this
app's own authentication logic) — confirmed by grepping the actual
`firebase` package source in `node_modules` directly, not assumed. A
false positive from the sweep pattern matching third-party library
internals, not a real finding.

**Verdict: VERIFIED — no real match.** Traced to source, confirmed
third-party SDK code, not an app-level bypass.

## 4. Summary

| Check | Method | Result |
|---|---|---|
| Demo login/OTP/password bypass literals (7 known) | Real build + grep, positive control | **VERIFIED absent** in production, present in demo (correct) |
| Firebase Admin/service-account credentials | Real build + grep | **VERIFIED absent** |
| Fake payment gateway keys | Real build + grep | **VERIFIED absent** |
| `GEMINI_API_KEY` value/name leak to client | Real build + grep | **VERIFIED absent** |
| Debug-only authorization bypass flags | Real build + grep + source trace | **VERIFIED absent** (one substring false-positive, traced and ruled out) |
| Firebase Web client config present | Real build + grep | Present, correctly so (public identifier by design, not a secret) |

**Expected result achieved, empirically, this session, not assumed from
Phase 32's prior report:** zero demo bypass literals or fake/leaked
credentials in the actual production bundle output; demo build
genuinely retains demo functionality (by design, not a bug).

This does NOT resolve Phase 41's open question of whether the
**currently live** Vercel deployment's own past build actually used
`VITE_APP_ENV=production` — that remains unknowable from this sandbox
(no build-log/API access to the live deployment). What this phase DOES
prove is that IF the live deployment's build pipeline invokes `vite
build` with `VITE_APP_ENV=production` (as `vercel.json`'s
`buildCommand` alone does not — that env var must be set as a Vercel
project-level build environment variable, which Phase 41 found to be
UNCONFIGURED, i.e. zero env vars of any kind), the resulting bundle is
clean. Since Phase 41 also found zero env vars configured project-wide,
the honest inference is that **the live deployment was almost certainly
built WITHOUT `VITE_APP_ENV=production` set** (no other mechanism could
have set it), meaning **the live bundle likely still contains demo
bypass functionality** — a real, concrete, actionable production
readiness gap this phase surfaces explicitly rather than glossing over.
This is a NEW finding this phase, more precise than Phase 41's "open
question" framing, and is carried into Phase 62's cutover decision.
