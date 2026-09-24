<!-- USE WHEN: you want to change something mid-way (a field, a rule, a screen, a decision). Fill in the request, then paste into a NEW session. -->
---
# U4: Change request (keep the plan honest)

**My change request:**
```
<describe what you want changed and why — in plain words>
```

Follow the **Step protocol in CLAUDE.md**. Before writing any code:
1. **Impact analysis.** Answer these:
   - Which D-xx decisions, plan steps, screens, collections and checks does this touch?
   - Is it in Phase 1 scope? If it's on the "Do NOT build" list, say so, and suggest the smallest Phase 1 alternative, or park it in the roadmap.
   - What is the smallest version of it that meets the need?
   - What is the risk to data, access and existing flows?
   - Which already-merged steps need follow-up edits?
2. Propose one of:
   - **(a)** do it now as a small step `NN.x`
   - **(b)** fold it into the next step
   - **(c)** defer it to the roadmap

   Give an estimate in files and lines.
3. **Wait for my "APPROVED (a/b/c)".**
4. Once approved:
   - update DECISIONS.md, and log the change in PROGRESS → Decision changes
   - update the plan section
   - if (a): implement it with the normal protocol, checks and PR
