/**
 * Authorization decision function — Phase 05.
 *
 * This is the SINGLE function that decides "may this actor do X." Every
 * other authorization check in the codebase (existing `currentUser.role
 * === 'admin'` UI conditionals, and any future repository/service-layer
 * guard) should route through this rather than re-deriving the answer,
 * so a security review only has to audit one function.
 *
 * IMPORTANT — this module runs in the browser. Per non-negotiable
 * principle #8 ("never use client-side UI hiding as the only
 * authorization mechanism"), calling `can()`/`assertPermission()` from a
 * screen is UI CONVENIENCE ONLY (hide a button, show a friendly error
 * before attempting the action). The actual enforcement boundary for
 * any entity migrated onto the Phase 04 repository layer is
 * firestore.rules (server-side, cannot be bypassed by a modified
 * client). Where no server-side check exists yet for a given mutation
 * (most of `DbManager`'s 124+ screens — Phase 01 §10 item 2), calling
 * `assertPermission()` before the mutation is a real improvement over
 * calling nothing, but is not a substitute for a server-side check and
 * must not be described as one. See docs/architecture/05-authorization.md.
 */

import type { User } from '../types';
import type { Permission } from '../domain/permissions';
import { roleHasPermission, HIGH_RISK_PERMISSIONS } from '../domain/permissions';

export class AuthorizationError extends Error {
  code = 'unauthorized' as const;
  constructor(public permission: Permission, public reason: string) {
    super(`Not authorized for "${permission}": ${reason}`);
  }
}

/**
 * True only for a session backed by a real, server-verifiable Firebase
 * Auth ID token (today: Google Sign-In — see src/App.tsx
 * handleGoogleSignIn). Demo sessions and this app's client-side-only
 * OTP/email login flows are explicitly NOT verified, regardless of the
 * role they carry — see src/types.ts's `AuthMethod` doc comment for why.
 */
export function isVerifiedIdentity(user: Pick<User, 'isDemo' | 'authMethod'> | null | undefined): boolean {
  if (!user) return false;
  if (user.isDemo) return false;
  return user.authMethod === 'firebase_auth';
}

export interface AuthzResult {
  allowed: boolean;
  reason: string;
}

/** The core decision. Pure function, no I/O, easy to unit-test (see
 * scripts/authz-check.ts) and easy to reuse from a future server-side
 * check without pulling in any browser API. */
export function evaluatePermission(
  user: Pick<User, 'role' | 'isDemo' | 'authMethod'> | null | undefined,
  permission: Permission,
): AuthzResult {
  if (!user) {
    return { allowed: false, reason: 'No authenticated user in context.' };
  }
  const role = user.role;
  if (role === ('pending_selection' as any)) {
    return { allowed: false, reason: 'User has not completed role selection yet.' };
  }
  if (!roleHasPermission(role as any, permission)) {
    return { allowed: false, reason: `Role "${role}" does not carry permission "${permission}".` };
  }
  if (HIGH_RISK_PERMISSIONS.has(permission) && !isVerifiedIdentity(user)) {
    return {
      allowed: false,
      reason:
        `"${permission}" is high-risk (refund/payout/large-discount/permission-change/` +
        `credential-change/automation-publish/destructive-deletion class) and requires a ` +
        `verified Firebase Auth identity; this session's authMethod is "${user.authMethod ?? 'unknown'}".`,
    };
  }
  return { allowed: true, reason: 'Role carries permission' + (HIGH_RISK_PERMISSIONS.has(permission) ? ' and identity is verified.' : '.') };
}

export function can(user: Pick<User, 'role' | 'isDemo' | 'authMethod'> | null | undefined, permission: Permission): boolean {
  return evaluatePermission(user, permission).allowed;
}

/** Throws `AuthorizationError` instead of returning a boolean — use at
 * the top of a mutation handler so a denied action fails loudly instead
 * of silently doing nothing (a UX trap the pack implicitly warns
 * against by requiring authorized actions to "work normally" and
 * unauthorized ones to "fail safely," not fail silently). */
export function assertPermission(
  user: Pick<User, 'role' | 'isDemo' | 'authMethod'> | null | undefined,
  permission: Permission,
): void {
  const result = evaluatePermission(user, permission);
  if (!result.allowed) {
    throw new AuthorizationError(permission, result.reason);
  }
}
