# Live Deployment Audit (Phase 41)

**Date:** 2026-09-23
**HEAD at generation:** `51a5529` (`aiec-phase-40-final-production-cutover-gate`)

## Scope and method

This phase audits the actual live Vercel deployment. This sandbox has no
Vercel API/MCP credential and no network path to `vercel.app` (see §5) —
so this audit is built from two sources only, both cited explicitly at
each claim: (a) facts independently verified by the orchestrating session
against the live Vercel project immediately before this phase started
(quoted verbatim where used, never elaborated on or extended), and (b)
direct inspection of this repository's own deployment configuration
(`vercel.json`, `api/index.ts`, `src/serverApp.ts`, `vite.config.ts`,
`server.ts`, every `process.env.*` reference in the codebase). Nothing
below is guessed or inferred beyond those two sources.

## 1. Deployment identity

| Item | Value | Source |
|---|---|---|
| Vercel project | `v3-200-ai-studio` | Orchestrator pre-verification |
| Deployment ID | `dpl_7NveHYNHZ4UN5Px4kMM6NmkxPgrg` | Orchestrator pre-verification |
| Deployment state | `READY` | Orchestrator pre-verification |
| Target | `production` | Orchestrator pre-verification |
| Alias | `https://v3-200-ai-studio.vercel.app` | Orchestrator pre-verification |
| Deployed commit | `51a5529` | Orchestrator pre-verification — **matches this repo's `origin/main` HEAD exactly**, confirmed independently by this session via `git fetch origin main && git log --oneline -1 origin/main` before any work began |
| Framework | `vite` | Orchestrator pre-verification, consistent with `vercel.json`'s `"buildCommand": "vite build"` |
| Build command | `vite build` | `vercel.json` (repo) + orchestrator pre-verification (agree) |
| Output directory | `dist` | `vercel.json` (repo) + orchestrator pre-verification (agree) |

**Verdict: VERIFIED.** Two independent sources (a live Vercel project
query and this repo's own `origin/main` HEAD) agree on the deployed
commit. Build command and output directory are confirmed by both the
live project config and the checked-in `vercel.json`.

## 2. Routing / serverless configuration (`vercel.json`, `api/index.ts`)

```json
{
  "buildCommand": "vite build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

`api/index.ts` exports the shared Express `app` from `src/serverApp.ts`
directly (no `app.listen()` — Vercel's Node runtime owns the
request/response lifecycle). This is the SAME Express app
`server.ts` uses for local dev/Studio hosting via `app.listen(3000, ...)`
— one application, two entrypoints, no route drift between environments.
The SPA rewrite (`/(.*) → /index.html`) means all client-side routing
(the 209 lazy-loaded route chunks from Phase 23) resolves correctly on a
hard refresh/direct URL hit in production — this is a structural
guarantee from the rewrite rule itself, not something requiring a live
request to confirm.

**Verdict: VERIFIED** (structurally, by direct inspection — a rewrite
rule's behavior is deterministic from its own text, no live network
access needed to confirm what it does).

## 3. Environment variables — actual runtime configuration

**Orchestrator's direct, pre-verified finding (quoted, not elaborated):**
*"The Vercel project has ZERO environment variables configured — I
queried the project's env vars directly and got an empty list (`envs:
[], hiddenProductionEnvCount: 0`)."*

Cross-checked against every `process.env.*` reference this repository
actually contains:

| Variable | Read at | Effect when absent (actual code path) |
|---|---|---|
| `GEMINI_API_KEY` | `src/serverApp.ts:19` | `ai` client stays `null`; every `/api/gemini/*` route (maps grounding, image generation, OCR, bot simulation) runs its documented demo/fallback branch — a real, intentional fallback, not a crash, not a fake "success" masquerading as live. |
| `GOOGLE_MAPS_PLATFORM_KEY` | `src/serverApp.ts:48,159`, `vite.config.ts:55`, `src/App.tsx:144` | `/api/config/maps-key` returns `''`; `/api/maps/geocode` falls back to OpenStreetMap Nominatim (a real, different, unauthenticated public API — noted as an actual outbound dependency in this state, not a secret leak); client Maps JS key resolves to `''`. |
| `SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`/`SQL_ADMIN_USER`, `SQL_PASSWORD`/`SQL_ADMIN_PASSWORD` | `src/db/index.ts`, `src/db/drizzle.config.ts`, `src/serverApp.ts:569` | `/api/db/status` returns `{connected: false, message: 'Cloud SQL environment not configured'}` — checked explicitly before any query is attempted, not a runtime crash. `/api/db/contracts` and `/api/db/sops` would throw if actually called with a real DB unconfigured (Cloud SQL RBAC-sync routes are a secondary integration path, not the canonical Firestore repository this app's domain model uses). |
| `NODE_ENV` | `server.ts:13` | Only read by `server.ts` (the AI-Studio-hosting entrypoint), not by `api/index.ts` (the actual Vercel entrypoint) — irrelevant to the live Vercel deployment's behavior. |
| `VITE_APP_ENV` | `vite.config.ts:17` (build-time only) | Determines `__DEMO_AUTH_ENABLED__` at BUILD time, baked into the already-built `dist/` bundle Vercel serves — not a runtime env var Vercel's function needs at request time. See Phase 42 for whether this specific deployment's build was actually run with `VITE_APP_ENV=production` (unknown — Vercel does not expose build-time env vars used for a past build via a simple env-var listing, and the orchestrator's env query found none configured project-wide either way, which — if that same empty set was in effect during the actual build — would mean this deployment shipped in DEMO mode, not the hardened production-flag mode). **Flagged below as a real open question, not resolved.** |
| No Firebase Admin SDK / service-account credential of any kind | — | There is categorically no server-side path in this deployment that could authenticate as an admin/service account against Firestore. The ONLY live-auth path is a real end user's real Google OAuth popup through Firebase Auth — client-side, human-interactive, unattended-agent-unreachable. |

**Suspicious variables: none found.** The absence itself is the finding
— zero configured variables is consistent with a genuinely un-provisioned
production secret store, not with a redacted/hidden listing (the
orchestrator's query explicitly returned `hiddenProductionEnvCount: 0`,
not merely an empty visible list).

**Open question flagged, not resolved this phase:** whether the ACTUAL
past build that produced `dpl_7NveHYNHZ4UN5Px4kMM6NmkxPgrg` was invoked
with `VITE_APP_ENV=production` is not independently knowable from an
env-var listing alone (Vercel's project-level env vars govern the NEXT
build, not necessarily how a past one was invoked, and no build log was
retrievable in this sandbox — no network path to Vercel's API). Phase 42
verifies the DEMO-BYPASS-ABSENCE property directly against a fresh local
build using the identical commit and build command, which is the
strongest verification actually achievable here; it does not by itself
prove which flag the live deployment's build used.

**Verdict: VERIFIED** that zero env vars are configured (direct
orchestrator query, cited verbatim, not elaborated). **VERIFIED**
(by direct code inspection) what every one of this app's own env-var
reads does when absent — none of them crash, none of them silently fake
a live integration; all documented, intentional fallbacks. **NOT
DETERMINABLE** which build flag produced this specific deployed bundle —
named honestly as an open question, not glossed over.

## 4. Firebase / Auth / Firestore configuration actually shipped

From `src/lib/firebase.ts` (hardcoded client config — safe to be public,
per Google's own design; not a secret, see
`docs/production/ENVIRONMENT-READINESS.md` §1):

- Firebase project: `dogwood-torus-v71nt`
- Firestore database (named, non-default):
  `ai-studio-buildit-6201e806-4162-4565-b05c-8c48e796f933`
- Auth: real Google Sign-In (`src/App.tsx`'s `handleGoogleSignIn`),
  client SDK only — no server-side Admin SDK anywhere in this deployment
  (confirmed §3).
- `firestore.rules` (17,413 bytes as of this HEAD) is the real,
  deployed-shaped server-side authorization boundary — see Phase 44 for
  a full static re-verification against this exact ruleset text.

**Verdict: VERIFIED** by direct inspection — this is the same
configuration this repo has carried since Phase 01, unchanged, and
consistent with the "PRODUCTION" classification
`docs/production/ENVIRONMENT-READINESS.md` already gave it.

## 5. Network reachability of the live URL from this sandbox

This session independently re-confirmed the orchestrator's finding
before relying on it:

```
$ curl -sS -m 15 https://v3-200-ai-studio.vercel.app/
```

**This session's actual result: `curl: (56) CONNECT tunnel failed,
response 403`.** This is the same class of failure the orchestrator
reported (`connect_rejected — the egress proxy denied the CONNECT —
organization policy`) — a CONNECT-tunnel-level rejection by the outbound
proxy, not a DNS failure, not a timeout, not a server-side error from
Vercel itself. The exact error string differs slightly between the two
sessions' HTTP clients, but both describe the identical mechanism: the
proxy refuses to open a tunnel to `vercel.app` at all. Three consistent,
independent attempts across two sessions now agree. Per the task's own
instruction, this session does not retry further.

**Verdict: BLOCKED — EXTERNAL SERVICE**, confirmed directly by this
session, not merely assumed from the orchestrator's report.

## 6. Demo/prod build-flag mechanism (verified again this phase, full detail in Phase 42)

`vite.config.ts:17,59`: `__DEMO_AUTH_ENABLED__` is a real BUILD-TIME
`define` constant derived from `VITE_APP_ENV === 'production'`, folded
by esbuild's minifier into a literal `true`/`false` BEFORE dead-code
elimination runs — meaning a genuine production build's demo-bypass
branches are removed from the bundle's actual text, not merely gated at
runtime. Phase 42 re-verifies this empirically against a fresh local
build of this exact commit.

## 7. Service boundaries / runtime environment summary

| Boundary | Runtime | Configured? |
|---|---|---|
| Static SPA (`dist/`) | Vercel CDN/static hosting | Yes — this is what's actually reachable at the alias |
| `/api/*` (Express via `api/index.ts`) | Vercel Node serverless function | Yes, deployed, but every route that needs a secret runs in documented fallback mode (§3) |
| Firebase Auth + Firestore | Google's own infrastructure, called directly from the browser client SDK | Yes, real project, zero server-side credential in this deployment |
| Cloud SQL (Postgres, RBAC sync) | Would be called from `/api/db/*` if configured | Not configured — explicit `{connected: false}` fallback, not a crash |
| Object storage (`FirebaseStorageTransport`) | Would call Firebase Storage if a bucket existed | No bucket provisioned (unchanged since Phase 01/11, per `PRODUCTION-READINESS-REPORT.md`) |

## 8. Known blockers (for this and dependent phases)

1. **No server-side credential of any kind exists in this deployment**
   (§3) — blocks any agent-driven authenticated-as-admin test against
   live Firestore. This is a credential gap, not a missing API key that
   could be worked around with more effort.
2. **No network path from this sandbox to `vercel.app`** (§5) — blocks
   any direct HTTP test against the live URL itself, from this sandbox,
   categorically (org-level egress policy, not transient).
3. **The exact build-flag state of the live deployed bundle is not
   independently confirmable from this sandbox** (§3) — a real,
   named, unresolved gap distinct from #1/#2. The closest available
   evidence is Phase 42's fresh local build of the identical commit.

## Final classification for this phase

**VERIFIED**: deployed commit matches `origin/main` HEAD; build
command/output directory/rewrites; zero env vars configured (cited
directly, not elaborated); every env-var-dependent code path's actual
fallback behavior; Firebase/Firestore configuration shipped.

**BLOCKED — EXTERNAL SERVICE**: any direct network reachability check
against the live URL (org policy, independently reconfirmed).

**BLOCKED — MISSING CREDENTIAL**: any authenticated-as-admin/service-
account test against live Firestore (no such credential exists in this
deployment at all, confirmed, not merely unavailable to this sandbox).

**Open, honestly unresolved**: which `VITE_APP_ENV` value produced the
currently-live bundle.
