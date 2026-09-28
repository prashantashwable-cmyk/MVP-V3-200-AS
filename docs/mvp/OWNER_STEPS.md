# Steps only the Owner can do (Google / GitHub account access)

Claude cannot do these from its session: they need your own Google or GitHub login. Each one takes a few minutes.

**Start here:** `docs/mvp/OWNER_PACK.md` has ready-to-send e-mails (MahaRERA permission, CA on TDS) and the short list of what is left.

## 1. Put the fixes on the phone link. DONE on 2026-09-27 (Claude merged #16 and #17 and redeployed)
1. Open https://github.com/prashantashwable-cmyk/MVP-V3-200-AS/pull/16. Click **Ready for review**, then **Merge pull request**, then **Confirm**.
2. Do the same for https://github.com/prashantashwable-cmyk/MVP-V3-200-AS/pull/17.
   Its base changes automatically once #16 is merged. If GitHub asks, set the base to `claude/mvp-step-11-security-hardening`.
3. Go to **Actions**, choose **Mobile preview (GitHub Pages)**, then **Run workflow**. Pick branch `claude/mvp-step-11-security-hardening` and click **Run**.
4. After about 2 minutes, open https://prashantashwable-cmyk.github.io/MVP-V3-200-AS/ on your phone and **reload twice**. The app keeps the old version until the second reload.

## 2. Deploy the database rules together with the live build (about 5 min, at go-live)
The new build needs the new `firestore.rules`: the photo-file rule and the "order busy" fields. Deploy the rules on the same day as the live build, not before.
1. Open https://console.firebase.google.com and select project **dogwood-torus-v71nt**.
2. Go to **Firestore Database**, then **Rules**. Choose the named database `ai-studio-buildit-…`.
3. Replace the text with the contents of `firestore.rules` from the repository, then click **Publish**.

## 3. Restrict the public keys (about 5 min)
1. Open https://console.cloud.google.com/apis/credentials and select project **dogwood-torus-v71nt**.
2. Open the **Browser key** (it starts with `AIzaSyDef…`).
3. Under **Application restrictions**, choose **Websites**. Add your live address (for example `https://your-app.vercel.app/*`) and `https://prashantashwable-cmyk.github.io/*`.
4. Click **Save**. Do the same for the Google Maps key if you use one.

## 4. Staging project for Lift Day (about 15 min)
This is a separate test copy, so testers never touch real customer data.
1. Go to https://console.firebase.google.com, click **Add project**, and name it `aie-staging`. Analytics is not needed.
2. Go to **Build**, then **Authentication**, then **Get started**. Enable **Google** and save.
3. In **Authentication**, go to **Settings**, then **Authorised domains**. Add `prashantashwable-cmyk.github.io`.
4. Go to **Build**, then **Firestore Database**, then **Create database**. Choose **Production mode** and location **asia-south1 (Mumbai)**.
5. In **Rules**, paste `firestore.rules` from the repository and click **Publish**.
6. Go to **Project settings** (gear icon), then **Your apps**, and add a **Web app**. Copy the `firebaseConfig` values and send them to Claude.
   These values are public web settings, not secrets. Claude will then build a staging link from them.
7. Send Claude the 8 testers' Gmail addresses and the date for Lift Day.

## 5. Switch on the 9 AM / 5 PM follow-up robot (about 10 min)
The app already chases people whenever anyone opens it. The robot does the same at 9:00 and 17:00 even when nobody does.
1. **Create the robot's login.**
   - In https://console.firebase.google.com (project **dogwood-torus-v71nt**), go to **Authentication**, then **Sign-in method**.
   - Enable **Email/Password**. This is needed only for the robot; everyone else keeps signing in with Google.
   - Go to **Authentication**, then **Users**, then **Add user**.
   - Email: `followup-robot@allindiaelevators.in` (any address you own). Choose a long random password and keep it safe.
2. **Make it an Admin.** In the app, go to **More**, then **Users**, then **Invite someone**. Enter that email, name `Follow-up robot`, role **admin**, and tap **Send invite**.
3. **Give GitHub the login.**
   - Go to https://github.com/prashantashwable-cmyk/MVP-V3-200-AS/settings/secrets/actions and click **New repository secret**.
   - Add `FOLLOWUP_ROBOT_EMAIL` (the email) and `FOLLOWUP_ROBOT_PASSWORD` (the password).
4. **Try it once.**
   - Go to **Actions**, then **MVP follow-up robot**, then **Run workflow**. Keep **dry run** ticked and click **Run**.
   - The log lists what it would chase and sends nothing. After that it runs by itself every day.
   - GitHub runs schedules only from the `main` branch. If **MVP follow-up robot** is not in the Actions list, ask Claude to register it on `main`, the same way the phone-link workflow was.

Also on the **Users** screen: tap **Add mobile** next to each staff member. The chase list needs this for its WhatsApp and Call buttons.

## 6. Start a field rider (about 5 min per rider)
1. **Invite the rider:** More → Users → Invite someone. Enter their Gmail and name, and role **sales**. Then tap **Add mobile**.
2. **On the rider's phone:** open the app link, sign in with Google, and tap **Allow** when asked for location. Then tap ⋮ → **Add to Home screen**, so it opens like an app.
3. **Daily routine:**
   - Open **Scout sites** → **Start day**.
   - At each site, tap **New site: take photo**, then take the board photo, then **Next site**.
   - Tap **End day** when done.
   - Keep the screen open on the bike mount; it stays awake by itself.
4. **Sales** sees every new site in **Sightings**, calls the number on the board photo, and taps **Make it a lead** once the builder agrees.
5. **Commission** amounts are ₹50 per confirmed site and ₹1,000 when it is booked. Tell Claude if you want different amounts. Check TDS with your CA before the first payout (Reports → Rider commission).

## 7. Add planned building projects (about 10 min per list)
1. **Permission first (⚖):** MahaRERA's lists may be reused only with its permission. Write to MahaRERA, or ask your lawyer, before copying its search results in. Lists you already own (brochures, newspaper launches, your own contacts' projects) can go in any time.
2. **In a spreadsheet**, keep these columns with a header line: **Project name, Registration no, Promoter, Address, PIN code, Proposed completion date, Floors**. Latitude and Longitude are optional but make it exact. Phone numbers and e-mails are ignored.
3. **In the app** (as Admin): **Sightings** → **Planned projects** → copy the cells and paste them → **Check the list**.
   - The app finds each address on the map (about one per second) and shows what will be added or updated.
   - Fix any "not found" rows by adding latitude/longitude, then tap **Save**.
4. **Check the lift window** (currently 15 to 4 months before completion) against your last few orders, and tell Claude if it should change.
5. **Repeat monthly:** re-pasting the same list only updates changed dates; nothing is duplicated.

## Decisions already taken (change any of them by telling Claude)
- **Marathi and Hindi for field screens:** done for the technician, surveyor, QC and customer screens and the shared order screen. Admin screens stay English. A native speaker should review the wording (`src/mvp/i18nUi.ts`).
- **Access after a person finishes their last task:** kept as it is. Staff see an order only while they have an open task on it; Admin and Owner always see everything. This keeps customer data visible to the fewest people.
