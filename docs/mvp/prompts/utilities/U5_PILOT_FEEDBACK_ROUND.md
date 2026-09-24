<!-- USE WHEN: weekly during the pilot (first 10–20 real lifts). Paste your notes, and export the numbers from the Reports screen if you can. NEW session. -->
---
# U5: Pilot feedback round (turn real use into small improvements)

**What happened this week** (Owner/Admin notes: complaints, workarounds, things done outside the app, confusion from any role):
```
<paste notes here — Marathi/Hindi is fine>
```
**Numbers from the Reports screen** (if available): active orders, overdue tasks, blocked tasks by reason, rework count, collected vs outstanding.
```
<paste here>
```

Follow the **Step protocol in CLAUDE.md**. **No code in the first reply.**
1. Group the feedback into:
   - **Bug**: the app is wrong
   - **Friction**: too many taps, or confusing
   - **Gap**: a real workflow the app doesn't cover
   - **Out-of-scope wish**: belongs to Phase 2+
2. Cross-check against real data where possible, **read-only**: the Order Views and reports. **Never write to production.**
3. Rank by *Admin minutes saved per order × how often it happens*. Safety and money bugs always go first.
4. Propose **at most 5** small changes for this week. For each, give files, size and risk.
   Also say what we should measure next week to know it worked.
5. Update `docs/mvp/PILOT_LOG.md` with: week, orders by stage, top blockers by reason, and the decisions taken.
6. **Wait for "APPROVED 1,3,…"**, then implement the approved items with the normal protocol, one PR each, or one PR if they are tiny.

**Phase 2 trigger check.** Compare against the Phase 2 entry criteria in MVP_IMPLEMENTATION_REPORT. Tell me if we have reached them, and which V4 automation to add first, **based on this data**.
