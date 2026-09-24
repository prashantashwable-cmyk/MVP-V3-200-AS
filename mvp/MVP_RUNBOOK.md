# MVP Runbook

## Run it

```bash
npm install          # once (repo root)
npm run mvp:dev      # → http://localhost:3100
```

- Data: `mvp/data/aiec-mvp.sqlite` (git-ignored). Start from scratch with `npm run mvp:reset` while the server is stopped.
- Env (optional): `MVP_PORT` (3100), `MVP_DB` (file path), `MVP_TICK_MS` (scheduler, 5000), `MVP_DEMO_STEP_MS` (demo bot pace, 2500).
- `npm run mvp:start` runs with a minified client (`NODE_ENV=production`).
- The V3 app is unchanged: `npm run dev` still starts it on port 3000.
- Node ≥ 22.5 is required (built-in `node:sqlite`). The "SQLite is an experimental feature" warning is expected.

## Phone demo (no server)

```bash
npm run mvp:build-web   # → mvp/dist/aiec-work-manager.html (one self-contained file, ~1.2 MB)
```

The whole MVP runs inside that one page: the same engine, routes and authorization, scheduler and demo bot, with SQLite compiled to WebAssembly (`sql.js`). Data is saved in that browser's storage. Every user lives on that one device, so use **Switch user** to change roles. **Reset demo data** on the login screen starts fresh. For several phones sharing one live system, run the Node server instead.

## Demo users (PIN `1234` for everyone)

| Role | User | Notes |
|---|---|---|
| Admin | Prashant Wable (`admin`) | Control Tower |
| Technician A | Rajesh Patel (`tech-rajesh`) | Kothrud |
| Technician B | Sunil Jadhav (`tech-sunil`) | Hadapsar |
| Technician C | Amol Kulkarni (`tech-amol`) | Aundh. Needed so QC ≠ installer even after a reassignment |
| Customer A | Rohan Deshmukh (`cust-rohan`) | Deshmukh Builders |
| Customer B | Priya Joshi (`cust-priya`) | Proves customers can't see each other |
| Supplier A | Sun Elevators Mfg. (`sup-sun`) | Chakan |
| Supplier B | Apex Lift Components (`sup-apex`) | Enables supplier reassignment |

**Each browser tab can be a different user** (the session lives in `sessionStorage`). Open 4–5 tabs side by side.

## Demo script (5 minutes)

1. Tab 1: log in as **Admin**. Click **▶ START DEMO**. A project `MH-PUN-KOT-LIFT-00x` is created, auto-qualified and auto-quoted, and the drawer shows *Why is this where it is?*
2. Tabs 2–4: log in as **Rohan** (customer), **Rajesh** and **Sunil** (technicians). Watch work appear, change and disappear. The demo bot is acting as them.
3. Watch the Control Tower: *Moving automatically* stays green and *Admin actions required* stays 0 until COMPLETED.
4. Click **▶ Demo with failures**. You'll see, with no Admin action:
   - the technician ignores clearance → the clock jumps 1h at a time → reminder → escalation (Admin gets an FYI saying no action is required) → reassigned
   - the customer's card is declined → the project holds at *Token payment due* → retry
   - installation evidence captured 3 km from the site → rejected → recaptured → passed
   - QC fails → rework assigned to the installer → re-inspection by another technician
5. Break it yourself (Demo controls tab, or act by hand in the user tabs):
   - Create a lead, **don't** answer as the customer, press **⏩ +1 day** three times → reminder → escalation → **Admin action required**. Open it, click **Extend deadline** and give a reason. That counts as 1 intervention, with its cause shown in *Automation improvement*.
   - **Fail next payment**, or pay with card `4000 0000 0000 0002`.
   - People → **Remove access** for the technician holding work → it moves to someone else immediately.
   - In a technician tab, turn off the network (DevTools → Offline), capture evidence → `PENDING SYNC`. Turn it back on → `SYNCED`.
   - Stop the server (Ctrl-C) and run `npm run mvp:dev` again → everything resumes. Overdue SLA steps run on startup.
6. Open **Workflow health** (gap detector) and **Automation improvement** (interventions by cause, with recommended automations).

## Doing it by hand (no bot)
Admin → Demo controls → **Create lead**. Then in each user's tab, press the one big button the screen shows: *ACCEPT QUOTATION*, *PAY*, *ACCEPT*, the evidence buttons (📍 / 📷 or the `DEMO` helpers), then *SUBMIT FOR VALIDATION*. The system decides who is next.

## Operating notes
- The scheduler is stateless and idempotent. Running `tick()` more often is safe.
- The audit log cannot be edited (database triggers).
- To find out why something is stuck: Control Tower → click the project → *Why is this where it is?*
- Headless check of the whole machine: `npm run mvp:simulate` (exit code 0 = pass).
