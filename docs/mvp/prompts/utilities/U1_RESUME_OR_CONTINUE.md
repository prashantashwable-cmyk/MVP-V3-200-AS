<!-- USE WHEN: a session ended mid-step, ran out of space, or you are unsure where things stand. Paste into a NEW session. -->
---
# U1: Resume the MVP build safely

Follow the **Step protocol in CLAUDE.md**.
1. Read `docs/mvp/PROGRESS.md`.
2. Run `git log --oneline -15` and `git status`.
3. List the open branches or PRs named `MVP Step …`, if your tools allow.
4. Work out:
   - the last step that is **fully DONE**, meaning its PR is merged and PROGRESS says DONE
   - which step is in progress, and what is already committed for it
   - whether there is unmerged work on another branch for that step. If so, **don't redo it.** Tell me the branch and PR, and whether it should be merged first.
5. Report:
```
Last DONE: NN · In progress: NN (committed: …; missing: …)
Unmerged work elsewhere: <branch/PR or none>
Recommended action: <continue step NN here | merge PR X first | restart step NN>
```
6. **Wait for my reply.** Then continue the in-progress step from where it stopped, following that step's prompt in `docs/mvp/prompts/`. Never skip ahead.
