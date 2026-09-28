# Owner pack: everything ready to send or tap (2026-09-28)

Claude has done everything that can be done without your own logins. This page gives you ready-to-send text and the exact taps for the rest. Items are in order of value.

| # | What | Time | Who |
|---|---|---|---|
| A | Send the MahaRERA permission e-mail (below) | 2 min | You: copy, paste, send |
| B | Send the CA the TDS question (below) | 2 min | You: copy, paste, send |
| C | Fill in the lift-window table (below) from 3 past orders and send it to Claude | 5 min | You |
| D | Switch on the 9 AM / 5 PM robot | 10 min | You, in Firebase and GitHub: `OWNER_STEPS.md` §5 |
| E | Add staff mobiles and invite riders | 5 min each | You, in the app: More → Users (`OWNER_STEPS.md` §6) |
| F | At go-live: publish the rules and restrict the keys | 10 min | You, in Firebase and Google Cloud: `OWNER_STEPS.md` §2–3 |

**Why Claude can't do D and F:** they need your Google and GitHub passwords. This build session is not allowed to touch production or credentials, which protects your live customer data.

---

## A. E-mail to MahaRERA: permission to use the registered-project list

**Where to send it:** use the e-mail address on MahaRERA's **Contact** page (https://maharera.maharashtra.gov.in/contact). Check the address there before sending.

**Subject:** Request for permission to use MahaRERA registered-project information (project name, location, proposed completion date)

> To,
> The Secretary,
> Maharashtra Real Estate Regulatory Authority
>
> Sir / Madam,
>
> We are ALL INDIA ELEVATORS, a lift supply and installation company in Pune. We request your permission to use the public project information on the MahaRERA website for our internal sales planning:
>
> - project name
> - registration number
> - promoter name
> - project address / location
> - proposed completion date
>
> **How we will use it:** only inside our own company, to plan when our staff should visit a registered project to offer lift supply and installation. We will not publish, resell or redistribute the data. We will always acknowledge MahaRERA as the source. We will not collect or store any personal phone numbers or e-mail addresses from the website.
>
> **How we will access it:** we will not scrape the website automatically. Our staff will copy search results by hand, in small numbers.
>
> Please let us know if this use is permitted, and on what conditions. If MahaRERA offers an official data download or API, please share the procedure.
>
> Thanking you,
> [Your name]
> [Designation], ALL INDIA ELEVATORS
> [Address, Pune] · [Mobile] · [E-mail] · [GSTIN, if you want to add it]

**Until they reply:** you can already paste lists you own, such as builder brochures, newspaper launch ads, projects you hear about, and your old enquiries.

---

## B. E-mail to your CA: TDS on rider commission

**Subject:** TDS / payroll treatment of per-lead commission to field riders

> Dear [CA name],
>
> We have started paying field riders who find construction sites for us:
> - ₹50 for each site our Sales team confirms
> - ₹1,000 when that site becomes a booked lift order
>
> One rider may earn roughly ₹[amount] a month. The app produces a monthly commission sheet per rider.
>
> Please advise:
>
> 1. Should riders be treated as **employees** (salary and incentive, TDS under s.192, PF/ESI if applicable), or as **commission agents** (s.194H)? They use their own bike, choose their own routes, and are paid only per result.
> 2. If s.194H applies, what are the **current rate and yearly threshold**, and do we need the rider's PAN before the first payment?
> 3. Does any **GST** registration or reverse charge arise for these payments?
> 4. What records should we keep: the monthly sheet, bank transfer proof, and a signed agreement?
>
> Regards,
> [Your name], ALL INDIA ELEVATORS

⚖ Claude has not set any tax rate in the app. The commission sheet shows gross amounts only, until your CA decides.

---

## C. Lift window: check it with 3 past orders

The app currently assumes a lift is ordered **15 to 4 months before** a building's completion. Fill in 3–5 of your past orders and send the table to Claude. Claude will set the window from your real numbers.

| Building | Its completion / possession month | Month you got the lift order | Floors |
|---|---|---|---|
| | | | |
| | | | |
| | | | |

(For example: "Sai Heights, possession Mar 2025, lift ordered Jun 2024, 12 floors" means the order came 9 months before completion.)

---

## D–F. Console steps

These are already written step by step in `docs/mvp/OWNER_STEPS.md`:
- **§5:** the robot login and the 2 GitHub secrets
- **§6:** riders and staff mobiles
- **§2:** publish the database rules, on go-live day only
- **§3:** restrict the public keys
- **§4:** the optional staging project for Lift Day

When you finish D, just tell Claude "robot done". Claude will then check its first dry run in the Actions log.
