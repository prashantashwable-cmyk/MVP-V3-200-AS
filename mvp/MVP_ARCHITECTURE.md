# MVP Architecture — AIEC Work Manager

> The app is not a collection of screens. It is a machine that moves work
> from one completed state to the next.

## Shape

```
 Browser tabs (one per user)                         Node process (npm run mvp:dev, port 3100)
 ┌──────────────────────────┐   HTTPS/JSON    ┌───────────────────────────────────────────────┐
 │ Admin: Control Tower     │ ─────────────▶  │ api.ts   session auth · role + ownership checks │
 │ Technician/Supplier:     │   poll /sync    │    │                                          │
 │   MY NEXT WORK           │ ◀─ every 2.5s   │    ▼                                          │
 │ Customer: my project     │                 │ workflow/engine.ts  (deterministic)           │
 │                          │                 │   lifecycle.ts  ← V3 WorkflowDefinition       │
 │ offline.ts ── V3 Outbox  │                 │   catalog.ts    rules as data                 │
 │   + V3 IndexedDB store   │                 │   evidence.ts   PASS / FAIL / FLAG gate       │
 └──────────────────────────┘                 │   money.ts      quote, margin floor, gateway  │
                                              │   gaps.ts       gap detector + invariants     │
                                              │   kpi.ts        automation + intervention KPIs│
                                              │   views.ts      role-scoped read models       │
                                              │ scheduler: engine.tick() every 5s (stateless) │
                                              │ demo.ts: DEMO BOT (plays users, never Admin)  │
                                              │    │                                          │
                                              │    ▼                                          │
                                              │ SQLite (node:sqlite) mvp/data/aiec-mvp.sqlite │
                                              └───────────────────────────────────────────────┘
```

## Decisions (and why)

| Decision | Why |
|---|---|
| Separate `mvp/` folder; V3 untouched | The prompt asks for a separate MVP. V3 keeps building and its `npm run lint` stays green |
| Reuse V3 `WorkflowDefinition`, `validateWorkflowDefinition`, `Outbox`, IndexedDB/memory stores | These are the clean, pure, tested V3 modules (see audit §2) |
| Server-authoritative state | V3's state lives in each browser (`localStorage`), so it cannot support multiple users (audit §4.1) |
| SQLite via built-in `node:sqlite` | No new dependency. Transactions serialize concurrent transitions, and the data survives restarts. Node prints an "experimental" warning, which is harmless |
| Rules as data (`catalog.ts`) | The engine executes them and the gap detector scores them: one source of truth |
| Stateless scheduler | `tick()` re-derives what is due from rows, so a restart or downtime catches up exactly |
| Polling `/api/sync` (change counter) | Cheap and robust. Changes show up for other users in ≤ 2.5 s. Websockets aren't needed at MVP scale |
| React + esbuild at server start | Both are already dependencies. No second Vite config or build step |
| No LLM in the engine | The workflow is deterministic. The "assistant" layer is the rule-based *why stuck* and *recommendations* output. An LLM can later *summarise* it but is never the source of truth |

## Data model (9 tables)

| Table | Purpose |
|---|---|
| `users` | 4 roles: admin, technician, customer, supplier. `active` flag, home GPS (for nearest assignment) |
| `sessions` | Bearer tokens. Deleted when access is removed |
| `projects` | Location ID `MH-PUN-KOT-LIFT-001`, `state`, quote, installer, child-ID counters, demo flags |
| `work_items` | **The core object**: type, status, owner, SLA timestamps (`accept_by`, `due_at`), ladder step, escalation level, `admin_required` + cause, retries, reassignments, exclusions, validation, earning, payout status, `version` |
| `evidence` | GPS, photo, measurement, checklist, signature and field records. Unique `idempotency_key`. `superseded` after rejection or reassignment |
| `payments` | One row per milestone (TOKEN / MATERIAL / FINAL). Status is changed **only** by the engine |
| `events` | Immutable audit log (SQLite triggers reject UPDATE/DELETE). `actor_type`, `kind` (transition / routing / info), intervention flag + cause |
| `notifications` | In-app inbox. SMS/WhatsApp are **MVP MOCK** (not sent) |
| `meta`, `idempotency` | Counters, change sequence, demo clock offset |

IDs: `MH-PUN-KOT-LIFT-001`, `…-W01` (work), `…-E001` (evidence), `…-P001` (payment), `…-EVT001` (event), `SYS-EVT000001` (events with no project).

## Security model
- Every `/api` route except `/health`, `/login-options` and `/login` requires a session token.
- Role gates live on routes. Ownership is re-checked inside the engine (`requireOwner`).
- Read models are built **per viewer**. A supplier never receives customer contact or money data. A customer only sees their own projects, and photos only after that work is completed. A technician only sees their own work.
- There is no endpoint that writes a project state, work status or payment status directly.
- Demo PIN login (`1234`) is a **demo-only** identity mechanism. Production would plug in V3's Firebase Auth. See `MVP_GAP_REGISTER.md`.

## MVP MOCKs (isolated behind interfaces)
| Mock | Interface | File |
|---|---|---|
| Payment gateway | `PaymentGateway` | `money.ts` (`mockGateway`) |
| Computer vision on photos | `PhotoAnalyzer` | `evidence.ts` (`mockPhotoAnalyzer`) |
| SMS/WhatsApp delivery | (in-app only) | `engine.notify` |
| Demo clock / demo bot / demo photos / "use site location" | Admin-only demo routes, labelled `DEMO` in the UI | `demo.ts`, `api.ts` |
