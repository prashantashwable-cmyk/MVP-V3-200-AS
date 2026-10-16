# Order View: conversation-style design reference (input for Step 04)

**Status:** reference only. Owner decision, 2026-10-16: keep this as **design input for Step 04** (Universal Order View). Don't build it before Step 04. Step 04 builds its layout on top of Step 03's data foundation.

| File | What it is |
|---|---|
| `original-reference.png` | The Owner's approved reference image (941 × 1672 px, about 9:16, dark theme) |
| `package/` | The Owner's handoff package, unchanged: master prompt, checklists, integration map, acceptance tests |

**Precedence:** `CLAUDE.md`, `DECISIONS.md` and the approved `MVP_REFACTOR_PLAN.md` win over `package/`. The package was written before the MVP plan. Where they disagree, follow the filter below.

## What the image shows
1. **Header:** order photo, code, title, site, lift summary, and a status pill.
2. **Stage rail:** 10 numbered stage icons. The current stage has a gold ring, done stages are joined by a gold line, and pending stages are grey.
3. **Centre: a chronological feed.** Each row has:
   - an actor avatar, role name and time
   - a content card with text, photo thumbnails and PDF chips
   - an outcome chip on the right (done, needs action, pending)
4. **Right panel:** project details (customer, contact, floors, lift type, finish), Quick Actions, and the project team with call buttons.
5. **Left rail:** module navigation. The active item is gold.
6. **Bottom:** a message composer with attach, photo and voice buttons.

## Phase 1 filter: keep, adapt, drop
| Element in the image | Phase 1 decision | Why |
|---|---|---|
| Chronological feed per order | **Keep.** Build entries only from real records: audit events, payments, tasks, survey and QC results, evidence photos | The package's own rule: no events made up from stage labels |
| Stage rail | **Adapt** to the 10 MVP stages (`LEAD … AMC`, CLAUDE.md), not the image's labels (Lead, Sales, Quotation, Agreement, Site Ready, Material, …) | MVP vocabulary is binding |
| Outcome chips (done / action required / pending) | **Keep.** Map them to task status, `health` and the 8 blocker reasons | Spec §8 and §12 |
| Right panel: details and team | **Keep.** Phone links (`tel:`) only where the role may see the number | Step 04 role filtering |
| Quick Actions | **Keep only the Step 04 admin actions**, each going through the Step 03 order service. Disable or hide the rest | No fake buttons |
| Payment cards (token, final 10% balance) | **Keep**, using payment milestones. Never show cost or margin to non-admins | Step 04 rule |
| "Quotation Bot … can negotiate upto 30%" and the "Margin" lines | **Drop** | ❌ AI negotiation. Margin is admin-only |
| "AIEC OS" AI actor rows | **Adapt:** show these as plain *System* entries for automatic task creation. No AI persona | ❌ AI manager |
| "Live Tracking / Container GPS Active" | **Drop.** Show the delivery status from the record instead | ❌ IoT containers |
| "Auto-detected address" and site GPS | **Drop** unless an existing, working field already holds it | Not in spec |
| WhatsApp "marketing message sent" | **Only** if WhatsApp already works end-to-end and the customer has consented ⚖ VERIFY | D-10 / notifications rules |
| Bottom message composer | **Drop for Step 04.** The repo has no message or communication record, and nothing defines who can see what. If wanted later, an "Add note" action writes an audited note, and the plan must define it (internal vs customer-visible) | The package says a new messaging subsystem needs Owner approval |
| Photo thumbnails | **Keep**, using the Step 04 evidence gallery and real stored files only | No placeholder images |

## Measured tokens (sampled from `original-reference.png`)
These are a starting point only. Reuse existing `src/index.css` tokens where they are close, and add scoped tokens only where needed.

| Use | Hex |
|---|---|
| Page and centre background | `#02090C` to `#060F14` |
| Side panel surface | `#0A131B` |
| Composer surface | `#0E181F` |
| Gold accent (active stage ring) | `#E6C473` |
| Gold button | `#D9AC5C` |
| Active nav tint | `#272112` |
| Status pill green | `#099F66` |
| Card: neutral | `#FAFAFA` |
| Card: system / info (blue) | `#DBE9FB` |
| Card: needs action (red) | `#FABEC3` |
| Card: done (green) | `#D2FBE7` |
| Card: money (yellow) | `#FAEFD3` |
| Card: AMC (lavender) | `#F0EAFF` |

The fonts and exact spacing are not measured yet. Step 04 records them using `package/REFERENCE_MATCH_CHECKLIST.md`.

**Mobile:** the image is a wide three-column layout at phone height. Step 04 must stay one column on a phone (spec §29). On a phone the right panel moves under the header, and the left rail becomes the existing app navigation.

## For Step 04
- Extend `ProjectOperatingView.tsx` and `services/projectOperatingView.ts`, as `REUSE_MAP.md` says. Don't build a parallel screen.
- Use `package/ACCEPTANCE_TESTS.md` (data integrity, role visibility, no made-up events) as extra Step 04 checks.
- Take a screenshot at 941 × 1672 and at phone width (390 px), and compare them with `original-reference.png`. Report measured differences. Don't claim pixel-perfect.
