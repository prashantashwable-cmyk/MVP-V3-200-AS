/**
 * Phase 05 acceptance check: "Attempt unauthorized actions directly
 * against the data/API layer, not just the UI. They must fail safely.
 * Authorized actions must work normally."
 *
 * This exercises `evaluatePermission`/`can`/`assertPermission`
 * (src/lib/authz.ts) directly — the actual decision function, not a UI
 * button's disabled state — for every role/permission/identity
 * combination the pack calls out. It also statically verifies
 * firestore.rules contains the Phase 05 privilege-escalation fix on the
 * `users` collection (live rules-engine execution needs the Firebase
 * Emulator Suite, not available in this sandbox — see
 * docs/architecture/04-persistence.md §6 for the same, already-documented
 * credential gap; this static check is the honest substitute).
 *
 * Run with: npx tsx scripts/authz-check.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { can, assertPermission, AuthorizationError } from '../src/lib/authz';
import type { User } from '../src/types';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`OK: ${msg}`);
}

function makeUser(over: Partial<User>): User {
  return {
    id: 'u1', role: 'customer', name: 'Test', phone: '0000000000', status: 'active', ...over,
  } as User;
}

// --- Scenario G (13_FINAL_END_TO_END_ACCEPTANCE.md) style checks -----------

const customer = makeUser({ role: 'customer', authMethod: 'firebase_auth' });
assert(!can(customer, 'quote.discount'), 'customer cannot apply a quote discount (unauthorized quote discount denied)');

const technicianOtp = makeUser({ role: 'technician', authMethod: 'otp_unverified' });
assert(!can(technicianOtp, 'payment.refund'), 'technician cannot refund a payment (unauthorized payment action denied)');

const adminOtp = makeUser({ role: 'admin', authMethod: 'otp_unverified' });
assert(!can(adminOtp, 'payment.refund'), 'admin via UNVERIFIED login cannot refund a payment (high-risk action requires verified identity, role alone is not enough)');
assert(!can(adminOtp, 'user.manage'), 'admin via UNVERIFIED login cannot change permissions (unauthorized permission change denied)');

const adminGoogle = makeUser({ role: 'admin', authMethod: 'firebase_auth' });
assert(can(adminGoogle, 'payment.refund'), 'admin via VERIFIED Google Sign-In CAN refund a payment (authorized action works normally)');
assert(can(adminGoogle, 'user.manage'), 'admin via verified identity CAN manage permissions');
assert(can(adminGoogle, 'automation.publish'), 'admin via verified identity CAN publish automation');

const supplier = makeUser({ role: 'supplier', authMethod: 'firebase_auth' });
assert(!can(supplier, 'document.delete'), 'supplier cannot perform destructive document deletion (unauthorized document access denied)');

const surveyor = makeUser({ role: 'surveyor', authMethod: 'firebase_auth' });
assert(can(surveyor, 'quote.create'), 'surveyor CAN create a quote (authorized action works normally)');
assert(!can(surveyor, 'quote.approve'), 'surveyor cannot self-approve a quote');

const demoAdmin = makeUser({ role: 'admin', isDemo: true, authMethod: 'demo' });
assert(!can(demoAdmin, 'security.manage'), 'a DEMO admin session cannot change security settings, regardless of role');
assert(can(demoAdmin, 'project.read'), 'a DEMO admin session can still read projects (normal-risk actions are not blocked by demo mode)');

const pending = makeUser({ role: 'pending_selection' as any, authMethod: 'firebase_auth' });
assert(!can(pending, 'project.read'), 'a user who has not completed role selection has no permissions yet');

// assertPermission throws, doesn't silently no-op
let threw = false;
try {
  assertPermission(customer, 'automation.publish');
} catch (e) {
  threw = e instanceof AuthorizationError;
}
assert(threw, 'assertPermission throws AuthorizationError (fails loudly, not silently) for a denied action');

// --- Static rules regression guard ------------------------------------------

const rulesPath = path.join(__dirname, '..', 'firestore.rules');
const rules = fs.readFileSync(rulesPath, 'utf8');
assert(
  /request\.resource\.data\.role == resource\.data\.role/.test(rules),
  'firestore.rules still contains the Phase 05 fix: self-update cannot change role',
);
assert(
  /request\.resource\.data\.role != 'admin'/.test(rules),
  "firestore.rules still contains the Phase 05 fix: self-create cannot claim role 'admin' unless owner email",
);

console.log('\nPASS: authorization decision function denies every unauthorized scenario tested and allows every authorized one.');
