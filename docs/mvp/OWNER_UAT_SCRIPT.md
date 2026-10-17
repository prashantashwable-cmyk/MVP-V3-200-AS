# OWNER UAT SCRIPT: one lift through the system

> **Who:** the Owner, or the Admin, in a demo session (safe) or in the pilot with test people.
> **Time:** about 30 minutes.
> **Data:** use the fixtures in `ACCEPTANCE_SCENARIOS.md`.
> **Rule:** never type a real customer's details into a demo session. Never test against real customers in the live project (D-19).

## A. Demo session (nothing is saved)
1. Open the app. Choose **TRY DEMO MODE**. Everything below happens in one browser tab: the demo data lives only in that tab and disappears on reload.
2. To switch person, press **Log Out**, then pick the next person:

   | Person | Role |
   |---|---|
   | Sales Sameer (demo) | Sales |
   | Master Admin Control | Admin |
   | Amit Sharma | Surveyor |
   | Rohan Deshmukh | Customer |
   | Rajesh Patel | Technician |
   | QC Meera (demo) | QC |
   | Owner (demo) | Owner |

| # | Who | Do this | You should see |
|---|---|---|---|
| 1 | Sales | **Leads → New lead**: ABC Builders, 9800000001, Baner, Pune, 8 floors, a site photo, tick consent, **Save lead** | The lead appears in *My leads* as NEW |
| 2 | Sales | **Qualify → create order** | "Open order"; the order gets a code AE-1001 |
| 3 | Admin | **Dashboard** | TODAY counts, PIPELINE shows 1 Qualified, the order listed |
| 4 | Admin | Open the order, **Assign surveyor** (Amit Sharma, date in 2 days) | Next action "Do the site survey", owner Amit Sharma |
| 5 | Surveyor | **My work** → the survey → fill stops, capacity, shaft, pit, headroom, power, 2 photos, *Feasible* → **Submit** | Stage QUOTE, 20% |
| 6 | Admin | Quote: 7,80,000 / 1,40,000 / 50,000 / 30,000, GST 18 (fixture only ⚖), cost 8,00,000 → **Prepare quote** → **Send to customer** | Selling price ₹11,80,000; margin 20% / markup 25% |
| 7 | Customer | **Orders** → (demo: choose the order) → **Accept quote**, enter UTR TEST123, **Submit payment proof** | Three payments: ₹10,000 / ₹10,52,000 / ₹1,18,000 |
| 8 | Admin | **Verify & record payment** on the token; raise a PO (supplier name, amount, date) | Stage SITE READY; payment ₹10,000 / ₹11,80,000 |
| 9 | Customer | Add 2 photos → **My site is ready** | "Verify the site is ready" for the Admin |
| 10 | Admin | **Confirm site is ready**; record the delivery payment; pick the technician, add a photo → **Mark material received** | Stage INSTALLATION, 55% |
| 11 | Technician | **My work** → installation → **START**, **CHECK IN**, tick 6 items | Progress 71% |
| 12 | Technician | Tick the rest → **COMPLETE** | Stage QC & Handover, 90% |
| 13 | QC | **PASS** with test results | 95%; handover, final payment and licence tasks open |
| 14 | Admin | Record the final payment; *Lift licence*: attach a file, DONE, **Save**; **Record customer approval**; **Complete handover** | Status COMPLETED, stage AMC, 100%, warranty ends in 12 months |
| 15 | Customer | Open the order | No cost or margin anywhere; the EMERGENCY button and phone number are shown |
| 16 | Owner | **Reports** | Booked, collected, outstanding, estimated margin, completed lifts |

**Exceptions to try:**
- **Technician blocker:** press **BLOCKED** → material missing. The Admin resolves it in the *Blockers* panel.
- **QC rework:** choose **REWORK** with a remark. The technician fixes it with a photo, then QC inspects again.
- **Hold and resume:** use *Admin actions*. A reason and a review date are required.
- **Cancel:** use *Admin actions* with a reason. Nothing is deleted.
- **Emergency:** *Team & settings* → set today's on-call technician. Customer → **EMERGENCY**. The technician acknowledges, then resolves.
- **Licence pending:** skip the licence and complete the handover with an override reason. The order shows under *Licence pending*.

## B. Pilot with real logins (after Step 14 sign-off)
1. *Team & settings* → **Invite people** with their Google email and role. For a customer, choose their customer record, which exists once their lead is qualified.
2. Each person signs in with **Google**. They get exactly the invited role. Anyone who signs in uninvited waits under *Waiting for a role*.
3. Repeat part A with test people and a test order. Then cancel that order with the reason "UAT test", which keeps the history.
