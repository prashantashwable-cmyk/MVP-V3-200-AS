# MVP IMPLEMENTATION REPORT (Step 13, Phase F)

> **Branch:** `claude/new-session-zfamue`. **PR:** #27 (draft).
> **Scope:** Phase 1 only: ONE LIFT THROUGH THE SYSTEM.
> **Built on:** the approved audit (`MVP_SIMPLIFICATION_AUDIT.md`) and plan (`MVP_REFACTOR_PLAN.md`), in one session, at the Owner's instruction to continue without stopping.

## 1. What existed
- **App shell:** a React/Vite installable web app with 194 screens.
- **Data:** 142 screens kept their data only in the browser (`DbManager`). A solid canonical Firestore layer existed (entities, repositories, audit, idempotency, permissions, commercial and operations workflows), but only 3 screens read it.
- **Login:** Google sign-in was the only real login. Phone OTP and email/password were simulated.
- **Missing pieces:** no tasks, no blockers, no MVP stages, no shared photo storage. A new user's chosen role was stored only in their own browser, and the Firestore rules let any user self-claim the surveyor role.

## 2. What was kept (reused as is or extended)
- Canonical entities, repositories, `audit.ts`, `idempotency.ts`, `authz.ts` and the permission map.
- `commercialWorkflow`/`operationsWorkflow` (kept for the legacy screens).
- `ProjectOperatingView` and its service, extended: in MVP mode it opens the new Order View, and the service gained `getMvpOrderSummary`.
- `Common.tsx` patterns and the Tailwind setup; `language.ts` (en/mr/hi) and the app's language switch.
- Google sign-in and `users/{uid}`; the demo-credential build guard; the in-memory demo repository ("Try as Role").

## 3. What was simplified
- **Navigation:** about 100 Admin tabs and 5 surfaces become 4–7 MVP tabs per role (`src/mvp/navigation.ts`), behind `MVP_MODE` (default on).
- **Work:** 16 bridged and about 20 browser-only workflow screens are replaced by **one task-driven Order View**. Each open task shows a small action panel (survey, quote, decision, payments, PO, site readiness, delivery, installation, blocker, QC, rework, handover, licence, AMC, hold review, emergency).
- **Workflow:** 14 project stages become 10 MVP stages (`toMvpStage`). The 7 workflow definitions and the event bus are replaced, for MVP flows, by one pure rules table (`src/mvp/rules.ts`).
- **Roles:** set by Admin invite instead of a self-service wizard.

## 4. What was disabled (hidden, not deleted)
- **Hidden:** 139 legacy screens: AI/bots and negotiation, automation builders, lead scoring, maps and GPS, messaging consoles, quote extras, advanced finance and loans, supplier-portal extras, delivery extras, recruitment and training, gamification, misc settings, online checkout. With `MVP_MODE` off (`VITE_MVP_MODE=false`, or the Admin's per-browser switch in Team & settings) the legacy navigation returns unchanged.
- **Deleted:** no screen. `CustomReportBuilder` (proven unreachable) was left in place: it is harmless, and deleting it is the Owner's call.

## 5. What was built
| Area | Files | Notes |
|---|---|---|
| Pure core | `src/mvp/{types,config,stage,progress,health,money,rules,feed}.ts` | D-03, D-06, D-08, D-09, D-10, D-11, D-14, D-15 |
| Order service | `src/mvp/service/{core,sales,field,admin}.ts` | The only code that changes an order. Every command: permission, rules, canonical writes, AuditEvent, notifications, idempotency |
| Read models | `src/mvp/views.ts`, `src/mvp/repo.ts` | Spec §8 summary, role-scoped lists, dashboard buckets, reports |
| UI | `src/components/mvp/*`, `src/mvp/ui/*` | Order View (Owner's reference style), Dashboard, Orders, Leads, My work, Alerts, Reports/Owner view, Team & settings |
| Evidence | `src/mvp/ui/evidence.ts`, `storage.rules` | Firebase Storage in real sessions (on-device compression, 10 MB, images/PDF); data URL in demo |
| Access | `firestore.rules` (17 new collections), `storage.rules`, invite flow in `firestoreUsers.ts` | Per-role scoping; cost readable only by Admin/Owner |
| Ops | `scripts/mvp/backfill.ts`, `src/lib/firebase.ts` emulator switch | Backfill is dry-run, idempotent, demo/emulator only |
| Docs | `MVP_SIMPLIFICATION_AUDIT.md`, `MVP_REFACTOR_PLAN.md`, `OWNER_UAT_SCRIPT.md`, `design/order-view-conversation/` | |

## 6. What remains manual
- **Payments:** verified by the Admin from the customer's UTR. There is no payment gateway.
- **Suppliers:** they have no login. The Admin records the PO, expected date, delays and receipt.
- **Messaging:** notifications are in-app only. No WhatsApp, SMS or email is sent.
- **Overdue detection:** happens when the dashboard loads (no scheduler).
- **Admin settings:** the on-call technician (daily) and the confirmed GST rate (⚖ VERIFY with a CA).
- **Statutory licence:** the Admin uploads the file and marks it done (⚖ VERIFY the process).
- **Roles:** invites by the Admin; anyone who signs in uninvited waits for a role.

## 7. What remains for V4
Everything in `docs/mvp/future/`, plus these follow-ups found during the build:
1. Move `orderService` behind Cloud Functions, so the client is no longer trusted to apply the rules (today the Firestore rules limit which fields each role can write, but a participant could still write allowed fields directly).
2. Serve evidence through a Cloud Function issuing short-lived signed URLs, so Storage reads are checked per order.
3. A daily digest and overdue notifications through a scheduler.
4. WhatsApp/SMS once a provider and consent flow exist (⚖ VERIFY).
5. A second Firebase project for staging.

## 8. Database changes (all additive)
- **New collections:** `tasks`, `blockers`, `canonical_leads`, `surveys`, `order_quotes`, `quote_costs`, `payment_milestones`, `suppliers`, `install_checklists`, `qc_records`, `order_handovers`, `amcs`, `compliance_docs`, `service_cases`, `approval_requests`, `mvp_settings`, `counters`, `user_invites`.
- **Reused:**
  - `projects` gains optional fields: `displayCode`, `status`, `participantIds`, `salesUserId`, `lift`, `holdReason`, `holdReviewDate`, `cancelReason`, `completedAt`, `version`.
  - `customers` and `sites` gain `orderId`.
  - `purchase_orders`, `snags`, `warranties`, `notifications` (gains `title`, `body`, `read`), `audit_logs`, `idempotency_keys`.
- **`ProjectStage`:** gains `survey` and `site_ready`.
- **Roles:** `owner`, `sales` and `qc`.
- **Deprecated, not removed:** the old stage values (still mapped) and the legacy `leads` collection (used by the hidden screens).
- **Backfill:** `npx tsx scripts/mvp/backfill.ts` (dry run) on the emulator before any real use. It sets missing `status`/`displayCode` and gives an order with no open task a "Set next task" task.

## 9. API changes
- No new server endpoints; the MVP runs on the client SDK and Firestore/Storage rules.
- The repository gained `queryWhere` (equality and array-contains). Firestore `update` is now transactional and returns the merged record.

## 10. Tests performed
| Command | What it covers | Result |
|---|---|---|
| `npm run lint` | TypeScript | PASS |
| `npm run build` | Production bundle | PASS |
| `npm run mvp:checks` | Pure functions (52), D-08 table (30), scenarios S1–S7, S9, S10 with invariants I-1..I-6 after every step (753), navigation (17) | 852/852 PASS |
| `npm run mvp:emulator` | S8 Firestore rules (39), S1 through the real service + real rules + real sign-ins (44), Storage rules (16) | 99/99 PASS |
| 42 non-live legacy checks | Regression | 42/42 PASS |
| `scripts/mvp/ui-drive.cjs` (Chromium, demo build) | S1 end to end through the UI as 7 different people, plus S9 emergency, S3 blocker, S6 cancel, I-5 on the customer screen | 17/17 steps PASS |

## 11. Known issues
- **Storage reads use capability links:** see §7 item 2 and `storage.rules`. Re-test on the live project after deploy.
- **Login in production builds:** Google sign-in only. "Try as Role" and the simulated OTP and password logins appear only in demo builds (`VITE_APP_ENV` not `production`).
- **Step size:** Steps 03 and 04 exceeded the "~25 files / 1,500 lines" guideline. They were kept whole at the Owner's request not to stop.
- **Not tested against the real project:** nothing ran against `dogwood-torus-v71nt` (D-19). The Firestore and Storage rules must be deployed by the Owner and then smoke-tested with test logins (go-live checklist).
- **Translations:** Marathi and Hindi MVP strings cover the field and customer actions and need native review. Admin screens are English.

## 12. Recommended next 10 features
1. Server-side order commands (Cloud Functions) with the same rules table.
2. Signed-URL evidence access per order.
3. A daily digest notification for the Admin (overdue, due today, payments due).
4. WhatsApp quote and payment links (after consent ⚖ VERIFY).
5. A printable quote/agreement PDF from the stored quote.
6. Customer OTP/e-signature at handover, once a provider is chosen.
7. A Supplier login for PO status updates (D-12 currently says none).
8. AMC visit scheduling with service checklists.
9. Offline mode for technicians (reuse `src/offline/outbox.ts` with the Storage transport).
10. Simple charts on the Owner view (monthly booked and collected).

## 13. Go-live checklist (Step 14, Owner-run)
1. **Answer the audit §8 questions.** The defaults apply until then. In particular, confirm the live deployment (Vercel `v3-200-ai-studio`?) and Firebase admin access.
2. **Back up:** export Firestore from the Firebase console.
3. **Deploy the rules to `dogwood-torus-v71nt`:** `firestore.rules` and `storage.rules`, with the Firebase CLI from a trusted machine, never from an automated session.
4. **Build for production:** set `VITE_APP_ENV=production` in the live build. Confirm the login screen shows only Google, and run `npm run production-bundle-bypass:check`.
5. **Settings:** in *Team & settings*, invite the real staff (Admin, Owner, sales, surveyor, technicians, QC). Set the emergency number ⚖. Leave GST empty until a CA confirms it ⚖. Choose the survey fee (0 = off).
6. **Backfill old orders:** dry run first (`npx tsx scripts/mvp/backfill.ts --emulator` on an emulator export), then apply only if needed.
7. **Smoke test with test logins:**
   - Each role sees only its tabs.
   - A customer sees only their own order, with no cost.
   - A technician can upload a photo, and QC can open it (this verifies Storage on the live project).
8. **Rehearse:** run `OWNER_UAT_SCRIPT.md` part B with a test order, then cancel it ("UAT test").
9. **First real lift:** create the real lead, and watch the dashboard's Needs Attention every morning.
