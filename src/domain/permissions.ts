/**
 * Permission model — Phase 05.
 *
 * The exact permission vocabulary from
 * 05_AUTHORIZATION_AND_ROLE_PERMISSIONS.md, plus a small number of
 * direct siblings needed to cover the same risk categories the pack
 * names (e.g. `payment.payout` alongside `payment.refund`,
 * `document.delete` for "destructive deletion"). Roles map to
 * permissions here, not the other way around, so "can this role do X"
 * is always a single lookup instead of scattered `role === 'admin'`
 * checks across 189 screens.
 */

import type { CanonicalUserRole } from './entities';

export type Permission =
  | 'project.read'
  | 'project.update'
  | 'quote.create'
  | 'quote.discount'
  | 'quote.approve'
  | 'contract.approve'
  | 'payment.read'
  | 'payment.create'
  | 'payment.refund'
  | 'payment.payout'
  | 'supplier.manage'
  | 'po.approve'
  | 'job.execute'
  | 'qc.approve'
  | 'handover.approve'
  | 'automation.publish'
  | 'user.manage'
  | 'security.manage'
  | 'document.delete'
  // MVP additions (D-12)
  | 'lead.manage'
  | 'order.manage'
  | 'report.read';

/**
 * High-risk permissions per Phase 05's explicit list: "refunds, payouts,
 * large discounts, bank/payment changes, permission changes, credential
 * changes, automation publishing, destructive deletion." These require
 * BOTH the role-permission mapping below AND a verified identity (see
 * src/lib/authz.ts) — the role check alone is not sufficient.
 */
export const HIGH_RISK_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>([
  'payment.refund',
  'payment.payout',
  'quote.discount',
  'user.manage',
  'security.manage',
  'automation.publish',
  'document.delete',
]);

const ADMIN_ALL: Permission[] = [
  'project.read', 'project.update',
  'quote.create', 'quote.discount', 'quote.approve',
  'contract.approve',
  'payment.read', 'payment.create', 'payment.refund', 'payment.payout',
  'supplier.manage', 'po.approve',
  'job.execute', 'qc.approve', 'handover.approve',
  'automation.publish',
  'user.manage', 'security.manage', 'document.delete',
  'lead.manage', 'order.manage', 'report.read',
];

/** Base role → permission mapping. Admin gets everything (still subject
 * to the high-risk identity-verification gate in authz.ts — being admin
 * does not bypass that). Other roles get only what their day-to-day work
 * requires, matching the pack's scoped examples. */
export const ROLE_PERMISSIONS: Record<CanonicalUserRole, Permission[]> = {
  admin: ADMIN_ALL,
  surveyor: [
    'project.read', 'project.update',
    'quote.create',
    'payment.read',
  ],
  technician: [
    'project.read',
    'job.execute',
    // Existing firestore.rules already treats "qc_inspector" as a
    // technician-shaped role tag (Phase 01 §5); qc.approve is granted
    // to the technician role here rather than inventing a 6th
    // CanonicalUserRole not present in src/types.ts's UserRole union —
    // Phase 09's per-inspection `discipline` field plus a future
    // `skillTags`/assignment check is how a specific technician gets
    // scoped to QC duty, not a distinct role.
    'qc.approve',
    'handover.approve',
  ],
  supplier: [
    'project.read', // scoped to their own POs at the repository/rules level
  ],
  customer: [
    'project.read', // scoped to their own project at the repository/rules level
    'payment.read',
    'payment.create', // initiating their own payment only — see PaymentAttemptStatus flow
  ],
  // MVP roles (D-12). Owner is read-only; money approvals stay with the Admin.
  owner: ['project.read', 'payment.read', 'report.read'],
  sales: ['project.read', 'lead.manage'],
  qc: ['project.read', 'qc.approve'],
};

export function permissionsForRole(role: CanonicalUserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHasPermission(role: CanonicalUserRole, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}
