# AIEC Work Manager — workflow automation MVP

A small, runnable, multi-user MVP built from the V3 repository. It proves that AIEC's day-to-day work can run through the software, with the software acting as the manager of work completion.

```bash
npm install
npm run mvp:dev        # http://localhost:3100 — log in as Admin, click ▶ START DEMO (PIN 1234)
npm run mvp:test       # 21 tests: lifecycle, 10 failure scenarios, gap detector, multi-user HTTP
npm run mvp:simulate   # 3 concurrent projects + KPIs
```

| Document | What it covers |
|---|---|
| [MVP_WORKFLOW_AUDIT.md](MVP_WORKFLOW_AUDIT.md) | What V3 has, what was reused, where the workflow broke |
| [MVP_ARCHITECTURE.md](MVP_ARCHITECTURE.md) | Architecture, data model, security, mocks |
| [MVP_WORKFLOW_MAP.md](MVP_WORKFLOW_MAP.md) | State machine, work items, SLA ladders, payment gates |
| [MVP_GAP_REGISTER.md](MVP_GAP_REGISTER.md) | Known gaps and the automation that would close each one |
| [MVP_TEST_PLAN.md](MVP_TEST_PLAN.md) | Every test and what it proves |
| [MVP_RUNBOOK.md](MVP_RUNBOOK.md) | How to run it, demo users, the demo script |
