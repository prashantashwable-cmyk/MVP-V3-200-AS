/**
 * D-32 follow-up robot: runs the same follow-up scan the Admin's app runs
 * (`scanTaskNotifications`), so reminders and escalations go out at 9:00 and 17:00 IST
 * even when nobody has the app open. Scheduled by .github/workflows/mvp-followup.yml.
 *
 * Signs in as a dedicated "robot" Admin account (email + password from the environment),
 * so the Firestore rules apply exactly as they do to a person. No firebase-admin, no
 * service-account key.
 *
 *   FOLLOWUP_ROBOT_EMAIL / FOLLOWUP_ROBOT_PASSWORD   the robot's login (GitHub secrets)
 *   VITE_FIREBASE_*                                   optional: another Firebase project
 *   --dry-run                                         list what would be sent; send nothing
 *
 * Exits 0 with a notice (not a failure) when the robot login isn't configured yet, so the
 * schedule stays green until the Owner sets it up (docs/mvp/OWNER_STEPS.md).
 */
import './polyfillBrowserGlobals';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../src/lib/firebase';
import { getOrCreateFirestoreUser } from '../src/lib/firestoreUsers';
import { loadFollowUps, scanTaskNotifications } from '../src/mvp/services/notify';
import { notificationsFor, digestCounts } from '../src/mvp/followUp';
import type { MvpCtx } from '../src/mvp/services/orderService';

const dryRun = process.argv.includes('--dry-run');
const email = process.env.FOLLOWUP_ROBOT_EMAIL ?? '';
const password = process.env.FOLLOWUP_ROBOT_PASSWORD ?? '';

async function main(): Promise<number> {
  if (!email || !password) {
    console.log('Follow-up robot is not set up yet (FOLLOWUP_ROBOT_EMAIL / FOLLOWUP_ROBOT_PASSWORD missing). Nothing sent.');
    return 0;
  }
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const user = await getOrCreateFirestoreUser(cred.user);
  if (user.role !== 'admin') {
    console.error(`The robot account must have the Admin role (it has "${user.role}"). Invite it as Admin in the app first.`);
    return 1;
  }
  const ctx: MvpCtx = { environment: process.env.VITE_APP_ENV === 'production' ? 'production' : 'sandbox', actorUserId: user.id };

  if (dryRun) {
    const items = await loadFollowUps(ctx);
    const now = new Date();
    const notices = items.flatMap(f => notificationsFor(f, now));
    console.log(`DRY RUN: ${items.length} follow-ups, ${notices.length} reminders would be sent (already-sent ones are skipped when run for real).`);
    for (const f of items) console.log(`  L${f.level} ${f.kind} → ${f.personId} · ${f.what}${f.orderId ? ` · order ${f.orderId}` : ''}`);
    console.log('Digest:', JSON.stringify(digestCounts(items)));
  } else {
    const result = await scanTaskNotifications(ctx);
    console.log(`Follow-up run done: ${result.items} follow-ups, ${result.sent} reminders checked/sent. Digest: ${JSON.stringify(result.digest)}`);
  }
  await signOut(auth);
  return 0;
}

main()
  .then(code => process.exit(code))
  .catch(err => { console.error('Follow-up robot failed:', err?.message ?? err); process.exit(1); });
