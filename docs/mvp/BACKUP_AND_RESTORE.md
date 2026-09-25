# Backup and restore (Step 11)

This is documentation only — no script in this repo runs a backup or a restore. Every
action below is something the **Owner** runs from their own machine or the Firebase/
Google Cloud console, with their own credentials. No coding session (this one included)
should ever run these against the real project: D-19 ("never test against real data")
and CLAUDE.md's "never touch real data from this session" rule both apply here as much
as they do to any other write.

## What actually needs backing up

- **Firestore is the only store that matters for MVP data** (D-01: one shared source of
  truth). Every canonical entity — orders/projects, tasks, quotes, payments, audit
  events, notifications, invites, and so on — lives in Firestore.
- **Evidence photos and compliance PDFs are inline in Firestore too** (D-16), as
  compressed base64 inside `documents` records — not in Firebase Storage. This was a
  deliberate MVP tradeoff (no `(default)` Firestore database for cross-service rules,
  no server SDK for custom claims, so Storage rules couldn't enforce the same
  participant guarantee Firestore rules already do). **A Firestore backup already
  covers all MVP evidence.** Firebase Storage, if enabled, only holds files written by
  legacy (non-MVP) screens — it is not required for the lift-through-the-system flow
  this refactor covers, and is out of scope here.
- **firestore.rules and this repo's code are already backed up** — they live in git,
  pushed to GitHub. No separate action needed.
- **Firebase Auth users** (Google sign-in accounts) are Google's own record, not this
  project's; the Firestore `users/{uid}` documents (role, customerId, etc.) are what
  actually needs restoring — those are covered by the Firestore backup above.

Project: `dogwood-torus-v71nt` (the one and only Firebase project — REPO_FACTS.md: there
is no separate staging project, so treat every export as touching real data).

## Backing up

Two options; either is fine, and they are not mutually exclusive.

### Option A — Firebase console scheduled backups (recommended, least effort)
1. Firebase console → **Firestore Database → Backups**.
2. Create a **daily** backup schedule with at least 7 days of retention (raise this once
   real orders exist — 30 days is a reasonable target for a live business).
3. This needs no CLI, no local credentials, and nothing in this repo. It is the Owner's
   one-time setup, done once outside any coding session.

### Option B — Manual `gcloud` export (for an on-demand snapshot, e.g. before a risky
migration or a firestore.rules change)
```
gcloud auth login                                   # the Owner's own Google account
gcloud config set project dogwood-torus-v71nt
gcloud firestore export gs://dogwood-torus-v71nt-backups/$(date +%Y-%m-%d) \
  --project=dogwood-torus-v71nt
```
This needs a Cloud Storage bucket to export into (`gsutil mb gs://dogwood-torus-v71nt-backups`
once, if it doesn't already exist) and Owner/Editor access on the project.

## Restoring

**Never import directly into the live project without first verifying the snapshot.**
Since there is no staging Firebase project (REPO_FACTS.md), verify against the
**Firestore emulator** instead — it is free, local, and cannot touch real data:

```
# 1. Verify: does the export even load? (points the emulator at a temp local directory,
#    never at the real project)
npx -y firebase-tools@15.31.0 emulators:start --only firestore --import=./restore-check --export-on-exit=./restore-check

# 2. Only after that succeeds, the real restore (Owner-run, real project, real outage):
gcloud firestore import gs://dogwood-torus-v71nt-backups/2026-09-24 \
  --project=dogwood-torus-v71nt
```

A `gcloud firestore import` **overwrites existing documents with the same id** but does
not delete collections that aren't in the backup, and only restores collections that
were included in the corresponding export. For most real-world recovery (a botched
manual edit, an accidental delete, corrupted data from a bug) a full-project import is
rarely the right tool — restoring the Owner's own `git`-tracked audit trail
(`audit_logs`, already durable) plus manually correcting the affected document is
usually safer and faster than a project-wide import, since an import can also
resurrect other data that was correctly deleted since the backup.

## Restore drill (do this once, before go-live, and again after any major schema change)
1. Take a manual export (Option B) into a **new, disposable** GCS bucket.
2. Import it into the local Firestore emulator (never a second live project — there
   isn't one).
3. Run `npm run mvp:rules` against the imported data and confirm the acceptance
   scenarios in `docs/mvp/ACCEPTANCE_SCENARIOS.md` still hold on real-shaped data.
4. Note how long the export + import actually took, and write it here so the next
   restore isn't a guess:

   | Date | Order/task count | Export time | Import time | Notes |
   |---|---|---|---|---|
   | _(fill in after the first drill)_ | | | | |

## What's still blocked on the Owner (tracked in PROGRESS.md)
- Enabling the daily backup schedule itself (Option A) — this document explains how;
  actually clicking it in the Firebase console is an Owner action, not something this
  repo or a coding session can do.
- Deciding retention (7 vs. 30+ days) and who else on the team should have access to
  restore.
