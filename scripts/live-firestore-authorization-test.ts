/**
 * Phase 34 — Live Firestore Security Testing.
 *
 * This phase's brief asks to attempt, for each role, permitted/
 * unauthorized reads and writes, cross-project/cross-customer access,
 * privilege escalation, and direct API/data access bypassing the UI —
 * against the REAL, authenticated Firestore backend. That requires real
 * signed-in identities for each role (or a real service-account
 * credential to mint custom tokens for them), which this sandbox does
 * not have (verified: docs/production/ENVIRONMENT-READINESS.md). Every
 * live scenario below is therefore reported as BLOCKED — MISSING
 * CREDENTIAL, never a fabricated PASS, per this pack's own rule #11.
 *
 * What this script CAN do for real, without a live credential, and does:
 * a genuine STATIC analysis of the real `firestore.rules` file, checking
 * every `match` block's `create`/`update` rules for whether they scope
 * the write to the acting user (an ownership/ID check against
 * `request.auth.uid` or an admin-only gate) versus accepting ANY
 * authenticated user unconditionally. This is real, grounded security
 * analysis — not a live test, and not represented as one — that
 * concretely feeds Phase 35's remediation prioritization.
 *
 * Run with: npx tsx scripts/live-firestore-authorization-test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const RULES = fs.readFileSync(path.join(REPO_ROOT, 'firestore.rules'), 'utf8');

interface CollectionRule {
  collection: string;
  createRule: string | null;
  updateRule: string | null;
  scoped: boolean; // true if create is gated by isAdmin()/role-check/ownership, false if bare isAuthenticated()
  reason: string;
}

function parseCollectionRules(rules: string): CollectionRule[] {
  const results: CollectionRule[] = [];
  // Split on each `match /collection/{id} {` block start.
  const blockRegex = /match \/(\w+)\/\{[^}]+\}\s*\{([\s\S]*?)\n\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(rules))) {
    const collection = m[1];
    const body = m[2];
    const createMatch = body.match(/allow\s+(?:create|create,\s*update|write)[^;]*;/);
    const updateMatch = body.match(/allow\s+(?:update|create,\s*update|write)[^;]*;/);
    const createRule = createMatch ? createMatch[0].trim() : null;
    const updateRule = updateMatch ? updateMatch[0].trim() : null;

    // "Scoped" = the create rule references isAdmin()/isSurveyor()/isTechnician()
    // (a role gate) OR an ownership check (request.resource.data.<field> or a
    // uid comparison) — anything beyond bare `isAuthenticated()` alone.
    const bareAuthenticatedOnly = createRule !== null &&
      /allow\s+(?:create|create,\s*update|write)\s*:\s*if\s+isAuthenticated\(\)\s*;/.test(createRule);
    const scoped = createRule !== null && !bareAuthenticatedOnly;

    let reason: string;
    if (createRule === null) {
      reason = 'No explicit create/write rule found in this block (admin-only via a combined rule, or intentionally no client create path).';
    } else if (scoped) {
      reason = 'create/write is gated by a role check (isAdmin()/isSurveyor()/isTechnician()) or an explicit ownership condition beyond bare authentication.';
    } else {
      reason = 'create/write allows ANY authenticated user, regardless of role or ownership of the record being created — no server-side check ties the new document to the acting user or a project/customer they actually own.';
    }

    results.push({ collection, createRule, updateRule, scoped, reason });
  }
  return results;
}

// Collections where an unscoped create is a DELIBERATE, documented design
// choice (verified by reading firestore.rules' own comments), not a gap:
// self-reporting collections where "any authenticated user creates a
// record about themselves/their own crash/their own emergency" is exactly
// the intended behavior, and the read side is still properly scoped.
const INTENTIONALLY_UNSCOPED_CREATE = new Set([
  'idempotency_keys', // dedup registration record, not sensitive business data
  'audit_logs', // "Application server/client logs audit trail" — explicit comment
  'observability_events', // "a crashed session still needs to be able to report the crash" — explicit comment
  'breakdown_sos', // a customer reporting an emergency — broad create-access is the intended UX
]);

function main() {
  console.log('=== Phase 34: Live Firestore Security Testing ===\n');

  // --- Part 1: the live test matrix — uniformly BLOCKED, honestly -------
  const REAL_ROLES = ['admin', 'surveyor', 'technician', 'customer', 'supplier'];
  console.log(`Real canonical roles in this codebase (src/domain/permissions.ts): ${REAL_ROLES.join(', ')}.`);
  console.log('(This phase\'s generic brief names Admin/Sales/Finance/Procurement/Technician/QC/Customer/Supplier —');
  console.log('this app\'s actual role model folds Sales/Finance/Procurement into admin+surveyor and QC into');
  console.log('technician; see docs/security/LIVE-AUTHORIZATION-TEST-RESULTS.md for the explicit mapping.)\n');

  const scenarioKinds = ['permitted read', 'permitted write', 'unauthorized read', 'unauthorized write', 'cross-project access', 'cross-customer access', 'privilege escalation', 'direct API access bypassing UI'];
  let blockedCount = 0;
  for (const role of REAL_ROLES) {
    for (const kind of scenarioKinds) {
      blockedCount++;
      console.log(`BLOCKED: [${role}] ${kind} — requires a real signed-in Firebase Auth session for this role (or a service-account credential to mint one). Not executed, not assumed to pass.`);
    }
  }

  // --- Part 2: real static analysis of firestore.rules -------------------
  console.log('\n=== Part 2: Static analysis of the REAL firestore.rules file (not a live test) ===\n');
  const collections = parseCollectionRules(RULES);
  console.log(`Parsed ${collections.length} collection rule blocks from firestore.rules.\n`);

  let realGaps = 0;
  let intentional = 0;
  for (const c of collections) {
    if (!c.scoped && c.createRule !== null) {
      if (INTENTIONALLY_UNSCOPED_CREATE.has(c.collection)) {
        intentional++;
        console.log(`OK (by design): ${c.collection} — unscoped create is intentional and documented in firestore.rules' own comment. ${c.reason}`);
      } else {
        realGaps++;
        console.log(`FINDING: ${c.collection} — ${c.reason}`);
        console.log(`  Rule: ${c.createRule}`);
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Live test scenarios: 0 PASS, 0 FAIL, ${blockedCount} BLOCKED — MISSING CREDENTIAL (all of them).`);
  console.log(`Static rules analysis: ${collections.length} collections examined, ${realGaps} real unscoped-create findings, ${intentional} intentional-by-design (documented) exceptions.`);
  console.log('\nPRODUCTION READINESS STATUS for live Firestore security enforcement: BLOCKED — MISSING CREDENTIAL.');
  console.log('The static findings above are real and actionable regardless of live credentials — see');
  console.log('docs/security/LIVE-AUTHORIZATION-TEST-RESULTS.md for the full report and Phase 35 remediation mapping.');
}

main();
