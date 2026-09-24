<!-- USE WHEN: a PR's checks, build or type check fail, or something broke after a merge. Paste into the session that owns the PR, or a NEW session on that branch. Add the failing output below if you have it. -->
---
# U2: Fix failing checks (no new features)

Follow the **Step protocol in CLAUDE.md**.

1. **Reproduce first.** Run the failing command(s) exactly and capture the first real error.
2. **Classify each failure:**
   - **Caused by the current step** → fix it.
   - **Pre-existing at baseline** (check the Baseline in PROGRESS.md) → leave it, unless it blocks an MVP path.
   - **Environment** (missing Java, emulator, browser, network) → don't paper over it. Give me the exact setup-script line or network allowance needed.
   - **A flaky test** is not a root cause. Find why it is flaky.
3. Make the **smallest** fix, then rerun the failing check **and** the full set: type check, build, `mvp:checks`.
4. **Never:**
   - skip, disable or delete a check to make things green
   - weaken a security rule
   - add a dependency just to silence an error
5. Update PROGRESS.md (Open issues or step note), commit `mvp(fix): <root cause>`, and push.

Report:
```
Failure → root cause → fix (1 line each)
Now: lint · build · mvp:checks results
Anything left + who must act
```

Failing output (optional, pasted by Owner):
```
<paste here>
```
