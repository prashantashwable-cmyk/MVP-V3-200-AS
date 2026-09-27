# Steps only the Owner can do (Google / GitHub account access)

Claude cannot do these from its session: they need your own Google or GitHub login. Each one takes a few minutes.

## 1. Put the fixes on the phone link (about 2 min)
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

## Decisions already taken (change any of them by telling Claude)
- **Marathi and Hindi for field screens:** done for the technician, surveyor, QC and customer screens and the shared order screen. Admin screens stay English. A native speaker should review the wording (`src/mvp/i18nUi.ts`).
- **Access after a person finishes their last task:** kept as it is. Staff see an order only while they have an open task on it; Admin and Owner always see everything. This keeps customer data visible to the fewest people.
