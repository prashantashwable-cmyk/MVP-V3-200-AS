<!-- USE WHEN: before you merge any step PR (recommended for Steps 03, 06, 08, 09, 11). Paste into the SAME session that made the PR, or a new session on the PR branch. -->
---
# U3: Independent review before merge

Review this branch's diff as a skeptical senior reviewer. **Don't add features.**

1. Run the `mvp-scope-guard` subagent (in `.claude/agents/`). Show its table.
2. If the `/code-review` skill is available, run it at **high** effort on this branch's diff. Otherwise review it yourself for:
   - correctness bugs
   - race conditions on concurrent Firestore writes
   - missing `version` checks
   - missing idempotency
   - time-zone mistakes
   - rupee rounding
3. For Steps 03, 06, 08 and 11, also run `/security-review` if it is available, focusing on:
   - role checks
   - cost-field exposure
   - evidence access
   - rules changes
4. Check the step's acceptance criteria against the actual code and tests. **Don't take the PR description's word for it.**
5. **Fix** every confirmed defect in the smallest way, rerun the checks, update PROGRESS.md and push.

Report:
```
Scope guard: <result>
Findings: <n> (fixed <n>, not fixed <n> + why)
Acceptance criteria: met / not met (list)
Safe to merge: YES / NO (why)
```
