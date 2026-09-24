/**
 * Server-side style validation shared by every MVP service (Step 11, plan §Step 11).
 * UI hiding is convenience only — every service call re-checks its own input here, the
 * same way firestore.rules re-checks access. `requireText`/`MvpError` were previously
 * copy-pasted identically into 4 service files (orderService, qcHandoverService,
 * emergencyService, invites); this is now their one home. Pure; no repository, no
 * clock, and no imports of its own, so every service can depend on it without risking
 * a circular import.
 */

export class MvpError extends Error {
  constructor(public code: 'forbidden' | 'invalid' | 'not_found' | 'gate', message: string) {
    super(message);
  }
}

export function requireText(value: string | undefined, what: string): string {
  const v = (value ?? '').trim();
  if (!v) throw new MvpError('invalid', `${what} is required.`);
  return v;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function requireEmail(value: string | undefined, what = 'Email'): string {
  const v = requireText(value, what).toLowerCase();
  if (!EMAIL_RE.test(v)) throw new MvpError('invalid', 'That does not look like an email address.');
  return v;
}
