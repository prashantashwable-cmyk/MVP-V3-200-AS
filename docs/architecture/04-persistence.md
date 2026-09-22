# AIEC — Real Persistence and Repository Layer (Phase 04)

Implements: `src/lib/environment.ts`, `src/repository/{types,
firestoreRepository, demoRepository, index, entities}.ts`, extended
`firestore.rules`. Acceptance check: `scripts/repository-two-user-check.ts`
(`npm run repository:check`).

## 1. Architecture delivered

```
UI  ─────────────────────────────────────────────────────────────────►
        (unchanged in this phase — see §5)

Domain Service   src/repository/entities.ts
                    createProjectFromLead(), advanceProjectStage(), and
                    the 8 typed repository accessors (customerRepository,
                    siteRepository, projectRepository, quoteRepository,
                    quoteVersionRepository, contractRepository,
                    paymentScheduleRepository, paymentRepository)

Repository       src/repository/index.ts → getRepository(collection, ctx)
                    picks ONE of:
                    - src/repository/firestoreRepository.ts   (real)
                    - src/repository/demoRepository.ts         (isolated demo)
                    based on the EXPLICIT src/lib/environment.ts
                    AppEnvironment, never an implicit guess.

Firestore/server firestore.rules §7 (new): customers, sites, projects,
                    quotes, quote_versions, contracts_v2,
                    payment_schedules, payments
```

This matches the pack's target `UI → Domain Service → Repository →
Firestore/server` architecture exactly, for the vertical slice
`Lead → Customer/Site → Project → Quote → Contract → Payment`.

## 2. Demo mode is now explicit, not implicit

`src/lib/environment.ts` introduces `AppEnvironment = 'demo' | 'sandbox' |
'production'`:

- **DEMO** — `currentUser.isDemo === true` (the existing "Try as Role"
  signal, unchanged). Repositories resolve to `demoRepository.ts`: a
  module-scoped in-memory `Map`, explicitly NOT `localStorage`, so it
  cannot be mistaken for durable storage (Phase 04's "never silently
  pretend localStorage is production persistence" and Phase 11's "do not
  use localStorage as the primary offline database").
- **SANDBOX** — a real, authenticated Firebase session, but the deploy is
  not explicitly flagged `VITE_APP_ENV=production`. This is the default
  for real sign-ins today because the repo has exactly one Firebase
  project (`dogwood-torus-v71nt`, Phase 01 §4/§7) — there is no separate
  staging project to point "sandbox" at yet. The doc comment in
  `environment.ts` is explicit that sandbox writes land in the SAME
  Firestore project production would use, so it must be treated with
  production-level care until a real second project exists.
- **PRODUCTION** — real session AND `VITE_APP_ENV=production` explicitly
  set. Missing configuration defaults to the LOWER-trust environment
  (sandbox), never silently escalates to production — the safe default
  direction.

`environmentLabel()` provides the human-readable badge text Phase 12's
"make environment state unmistakable" work should surface in the UI; not
wired into a visible UI badge yet in this phase (see §5 limitations).

## 3. Repository layer

`Repository<T extends {id: string}>` (`src/repository/types.ts`):
`get`, `list`, `query`, `create`, `update` (with optional optimistic
`expectedVersion` — rejects with a typed `StaleWriteError` instead of
silently overwriting a concurrent change), `subscribe` (live updates).

Two implementations of the identical interface:

- **`firestoreRepository.ts`** — real Firestore Web SDK calls
  (`getDoc`/`setDoc`/`updateDoc`/`onSnapshot`/`query`+`where`) against
  the existing `db` instance from `src/lib/firebase.ts`, the same
  pattern already proven live by `firestoreUsers.ts`/`firestoreLeads.ts`.
- **`demoRepository.ts`** — in-memory only, one store per collection per
  session, `subscribe()` re-invoked synchronously on every local write.

`getRepository()` (`src/repository/index.ts`) is the single place that
decides which implementation to hand back, based on
`RepositoryContext.environment`. No other code branches on environment
to pick a backing store — this is deliberate, so a future audit only has
to check one file.

## 4. Firestore rules extended (not weakened)

Added to `firestore.rules` (§7): `customers`, `sites`, `projects`,
`quotes`, `quote_versions`, `contracts_v2`, `payment_schedules`,
`payments`. All 6 pre-existing collections/rules are untouched.

Deliberately conservative pending Phase 05's full permission model:
Admin has full access everywhere; the creating/owning internal user
(surveyor/sales) can read/update their own `projects`/`quotes` records.
**Customer/supplier roles get no direct access to these new collections
yet** — not because they shouldn't ultimately have it, but because
scoping it correctly requires a `Customer ↔ Firebase-Auth-uid` link this
phase's canonical `Customer` entity does not yet carry, and a real
permission model (Phase 05) rather than another guessed ownership check.
Denying by default until that exists is the safe direction, and is not a
regression — none of these 8 collections existed (or had any access at
all) before this phase.

`contracts_v2` (not `contracts`): the pre-existing `contracts` collection
already has a different shape and its own rule (Phase 01 §5, keyed by
customer for elevator/AMC contract documents). Reusing the name for the
new canonical `Contract` entity would let two different shapes collide
under one collection with one rule guarding both — a real risk of
weakening effective security by ambiguity, which principle #7 forbids.
Kept separate; Phase 08+ can decide whether/how to consolidate once the
commercial workflow is actually wired to real contract creation.

## 5. What was deliberately NOT done in this phase

- **No existing screen was rewired** to call the new repository layer.
  Per Phase 04's own "do NOT rewrite every component at once" and the
  pack's phase ordering, this phase builds the boundary; Phases 08/09
  progressively move the sales/quote/payment/procurement screens onto
  it as those workflows are implemented for real.
- **No environment badge is rendered in the UI yet** — `environmentLabel()`
  exists and is ready to use; wiring it into the shell is Phase 12's
  "make environment state unmistakable" job, done once more of the app
  is reading `AppEnvironment` anyway.
- **Idempotency is not yet enforced** on `Payment.create()` even though
  the canonical `Payment` type has carried an `idempotencyKey` field since
  Phase 02 — Phase 06 is where duplicate-request deduplication is built
  and tested, deliberately sequenced after this phase per `RUN_ALL.md`.

## 6. Known integration gap (documented, not hidden)

Verified directly in this session: `curl` from this sandbox to
`https://firestore.googleapis.com/v1/projects/dogwood-torus-v71nt/...`
returns a real `403 PERMISSION_DENIED` JSON body — i.e. **the network
path to Firestore is open**, and the request reaches Google's servers
and gets a real rules-based decision. What this sandbox does NOT have is
any Firebase Auth credential: no service account key, no OAuth browser
flow, no signed-in user session of any kind (`env | grep -i firebase`
and a repo-wide search for `*service-account*`/`*firebase-adminsdk*`
both came back empty).

Consequence: `firestoreRepository.ts` is real, production-shaped code —
identical Firestore SDK calls to the already-shipped
`firestoreUsers.ts`/`firestoreLeads.ts` — but this environment cannot
exercise it end-to-end as an authenticated user to directly confirm the
new rules behave as written against a live signed-in session. The
acceptance check (`repository-two-user-check.ts`) instead verifies the
full `Repository<T>` contract (shared state across independent call
sites, live `subscribe()` propagation, optimistic-concurrency rejection
of stale writes) against the demo implementation, which exercises the
exact same interface and the exact same call sites a Firestore-backed
screen would use. **This is not claimed as an end-to-end production
test — that gap is explicit, both here and in the phase log.** A
follow-up with real Firebase Auth credentials (or the Firebase Emulator
Suite, not available in this sandbox's package set) should run
`repository-two-user-check.ts`'s scenario again with
`environment: 'sandbox'` against the live project before this is
considered production-verified.

## 7. Build/typecheck

`npx tsc --noEmit` passes. `npm run repository:check` passes (6/6
assertions). `npx vite build` passes, bundle size unchanged (no existing
screen imports the new modules yet).
