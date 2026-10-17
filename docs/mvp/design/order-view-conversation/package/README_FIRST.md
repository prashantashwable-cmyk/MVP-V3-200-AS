# AIEC Reference-Matched Project Conversation UI — Claude Code Handoff

## Purpose
Use this package with Claude Code inside the existing AIEC repository. The goal is to implement the approved reference-image design as a real, responsive, conversation-first project workflow—not a static mockup—while preserving the existing application architecture and records.

## Before starting
1. Open the existing repository in Claude Code. Intended repo: `prashantashwable-cmyk/MVP-V3-200-AS`.
2. Check out a separate feature branch locally (do not work directly on `main`).
3. Copy the original reference image into `reference/original-reference.png` in the repository or attach it to Claude Code. The image was not available as a file in this ZIP, so the package deliberately does not fabricate or substitute one.
4. Open `CLAUDE_CODE_MASTER_PROMPT.md` and give it to Claude Code as the task specification.
5. Let Claude inspect the repository before editing. The prompt requires a short baseline report, scoped implementation, and verification.

## What this package contains
- `CLAUDE_CODE_MASTER_PROMPT.md` — main executable task prompt and guardrails.
- `REFERENCE_MATCH_CHECKLIST.md` — pixel-level visual comparison checklist.
- `WORKFLOW_INTEGRATION_MAP.md` — known existing project data/service integration points.
- `ACCEPTANCE_TESTS.md` — implementation and regression acceptance criteria.
- `reference/README.md` — how to supply the original visual reference.

## Repository facts already identified
The existing app is a React + TypeScript + Vite application. The existing project operating view is:
`src/components/ProjectOperatingView.tsx`

Its current canonical data service is:
`src/services/projectOperatingView.ts`

The component already reads canonical project records and displays customer/site details, next action, blockers, financial state, timeline and audit history. Build on these existing layers. Do not replace them with hard-coded demo records or create a parallel data model.

## Important
This ZIP is a Claude Code implementation handoff, not a claim that code changes have already been made. Claude Code must inspect the current checkout, make changes on a feature branch, run relevant checks, and report exact evidence.
