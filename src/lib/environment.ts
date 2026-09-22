/**
 * Explicit application environment — Phase 04.
 *
 * Prior to this phase, "demo vs. real" was an implicit convention
 * (`User.isDemo`, checked ad-hoc at each Firestore call site — see
 * src/lib/firestoreUsers.ts / firestoreLeads.ts). This module makes it a
 * first-class, explicit concept so the repository layer (and, later,
 * every side-effecting UI action) can ask "what environment am I in?"
 * once, in one place, instead of re-deriving it — and so a production
 * deploy can assert it is actually configured for production rather than
 * silently running with demo/sandbox defaults.
 *
 * DEMO       — `currentUser.isDemo === true` ("Try as Role"). Never
 *              touches Firestore. Backed by the in-memory demo
 *              repository (src/repository/demoRepository.ts), itself
 *              seeded from DbManager where useful. Nothing here can ever
 *              read or write real company data.
 * SANDBOX    — a real, authenticated Firebase session (Google Sign-In /
 *              password), but the deploy has not been explicitly marked
 *              `VITE_APP_ENV=production`. This is the default for real
 *              sign-ins today, matching the single Firebase project this
 *              repo currently has (`dogwood-torus-v71nt`) with no
 *              separate staging project configured (Phase 01 §7/§11) —
 *              i.e. "sandbox" here means "real persistence, but not
 *              asserted production-ready," not "a second Firebase
 *              project." Writes go to the SAME Firestore project a
 *              production deploy would use, so treat sandbox data with
 *              the same care as production until a real second project
 *              is provisioned.
 * PRODUCTION — a real, authenticated Firebase session AND the deploy is
 *              explicitly configured `VITE_APP_ENV=production`. High-risk
 *              actions (Phase 05/12) require this.
 */

export type AppEnvironment = 'demo' | 'sandbox' | 'production';

interface EnvUser {
  isDemo?: boolean;
}

/** Read once from build-time config. Vite only exposes `VITE_`-prefixed
 * env vars to client code; unset (the common case today) is treated as
 * "not explicitly production" rather than defaulting to production —
 * per the pack's "never silently pretend" principle, the SAFE default on
 * missing configuration is the LOWER-trust environment, not the higher
 * one. */
const DEPLOY_ENV_FLAG: string | undefined =
  typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_APP_ENV : undefined;

export function resolveEnvironment(user: EnvUser | null | undefined): AppEnvironment {
  if (user?.isDemo) return 'demo';
  if (!user) return 'sandbox';
  return DEPLOY_ENV_FLAG === 'production' ? 'production' : 'sandbox';
}

export function isProductionDeploy(): boolean {
  return DEPLOY_ENV_FLAG === 'production';
}

/** Human-readable badge text — intended for a persistent UI indicator
 * (wired up in Phase 12's environment-visibility work) so nobody mistakes
 * demo/sandbox data for production records. */
export function environmentLabel(env: AppEnvironment): string {
  switch (env) {
    case 'demo': return 'DEMO — not persisted to production';
    case 'sandbox': return 'SANDBOX — real persistence, not production-asserted';
    case 'production': return 'PRODUCTION';
  }
}
