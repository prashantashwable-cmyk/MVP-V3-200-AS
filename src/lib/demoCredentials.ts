import type { UserRole, UserStatus } from '../types';

/**
 * Phase 32 — demo/bypass login credentials, isolated behind a BUILD-TIME
 * (not runtime) constant.
 *
 * Phase 23 gated these bypasses at RUNTIME (`isProductionDeploy()`
 * reading `import.meta.env.VITE_APP_ENV` inside `src/App.tsx`) — a real,
 * verified behavioral gate (a production build genuinely cannot log in
 * with these codes/passwords). But, as that phase's own comments
 * honestly documented, the literal strings ('1234', '123456', '888888',
 * 'password123', the demo email->role map) still sat in the BUNDLE TEXT
 * of a production build, because the runtime `if (!isProductionDeploy())`
 * check can only be resolved once the bundle is running in a browser —
 * Vite's default esbuild minifier does not fold across that function-call
 * boundary at build time, so it cannot prove the branch is dead and strip
 * it.
 *
 * This module closes that specific gap with a real BUILD-TIME constant,
 * `__DEMO_AUTH_ENABLED__`, injected by `vite.config.ts`'s `define` from
 * `process.env.VITE_APP_ENV` — i.e. substituted as a literal `true`/
 * `false` token BEFORE esbuild's minifier ever runs dead-code
 * elimination. `if (!__DEMO_AUTH_ENABLED__) return ...` is then a
 * compile-time-constant branch; the minifier removes the unreachable
 * branch ENTIRELY, literal strings included. This is not assumed —
 * `scripts/production-bundle-bypass-check.ts` builds a real
 * `VITE_APP_ENV=production` bundle and greps the actual output files for
 * every one of these literals, asserting none are present, and builds a
 * real non-production bundle asserting they ARE present there (proving
 * demo behavior remains available in an explicitly-identified demo
 * build, not silently deleted everywhere).
 *
 * Nothing in this file's PUBLIC API changes behavior versus Phase 23 —
 * `isProductionDeploy()` still ultimately decides everything. What
 * changed is WHERE the literals live and HOW the branch is resolved.
 */
declare const __DEMO_AUTH_ENABLED__: boolean;

export interface DemoEmailIdentity {
  role: UserRole;
  name: string;
  phone: string;
  status: UserStatus;
}

/**
 * The OTP bypass codes that short-circuit real 6-digit verification in a
 * demo/sandbox build. Returns an empty array — not merely a falsy check
 * a caller might forget to honor — in a production build, and the array
 * literal itself does not exist in production bundle output (see header).
 */
export function getDemoOtpBypassCodes(): string[] {
  if (!__DEMO_AUTH_ENABLED__) return [];
  return ['1234', '123456', '888888'];
}

/** True only for demo/sandbox builds — mirrors `!isProductionDeploy()` but resolved at build time. */
export function isDemoAuthBuild(): boolean {
  return __DEMO_AUTH_ENABLED__;
}

/**
 * The demo email -> seeded-identity map used by the email/password
 * fallback login. Returns null in a production build; the map object
 * itself (all 6 privileged demo identities, including the admin one)
 * does not exist in production bundle output.
 */
export function getDemoEmailIdentities(): Record<string, DemoEmailIdentity> | null {
  if (!__DEMO_AUTH_ENABLED__) return null;
  return {
    'admin@aiec.com': { role: 'admin', name: 'Mr. Prashant Vasant Wable', phone: '+91 98765 43210', status: 'active' },
    'surveyor@aiec.com': { role: 'surveyor', name: 'Amit Sharma', phone: '+91 98765 43211', status: 'active' },
    'technician@aiec.com': { role: 'technician', name: 'Rajesh Patel', phone: '+91 98765 43212', status: 'active' },
    'supplier@aiec.com': { role: 'supplier', name: 'Sun Elevators Manufacturing', phone: '+91 98765 43213', status: 'active' },
    'customer@aiec.com': { role: 'customer', name: 'Rohan Deshmukh', phone: '+91 98765 43214', status: 'active' },
    'pending@aiec.com': { role: 'surveyor', name: 'Rahul Joshi (Pending)', phone: '+91 98765 43299', status: 'pending' },
  };
}

/**
 * The demo password fallback check. Always returns false in a production
 * build; the 'password123' literal does not exist in production bundle
 * output.
 */
export function checkDemoPassword(password: string): boolean {
  if (!__DEMO_AUTH_ENABLED__) return false;
  return password === 'password123';
}

export interface DemoQuickFillOption {
  value: string;
  method: 'whatsapp' | 'sms' | 'email';
  label: string;
}

/**
 * Phase 32 — a second, independently-discovered demo affordance found
 * while auditing the codebase for this phase (not part of Phase 23's
 * original scope, which covered only src/App.tsx's own login form):
 * `ForgotPasswordReset.tsx`'s "Developer Rapid Testing Sandbox" panel,
 * which reveals the privileged admin identity's email as a one-tap
 * quick-fill. Returns null in a production build; the panel and its
 * literal contents do not exist in production bundle output.
 */
export function getDemoQuickFillOptions(): DemoQuickFillOption[] | null {
  if (!__DEMO_AUTH_ENABLED__) return null;
  return [
    { value: 'admin@aiec.com', method: 'email', label: '👑 Admin Email' },
    { value: '+91 98765 43214', method: 'whatsapp', label: '👤 Client Phone (WhatsApp)' },
    { value: 'legacy', method: 'sms', label: '⚠️ Legacy Stub (Admin-assisted Recovery)' },
  ];
}

/**
 * Phase 31/32 — two more simulated-OTP verification steps found during
 * the audit, in `ESignatureCapture.tsx` (customer e-signature ceremony)
 * and `OfferOnboardingAgreementScreen.tsx` (offer-letter e-sign). Neither
 * is a real differential secret the way the login/password-reset
 * bypasses are (both accept ANY sufficiently-long code, not just one
 * magic value — there is no real SMS/OTP backend behind either, the
 * same long-documented gap as the main login flow, Phase 05). Routed
 * through here anyway so: (a) the "here's the demo code" hint literals
 * ('4321'/'1234'/'5541') do not sit in production bundle text implying a
 * fabricated authenticity, and (b) in a real production build, with no
 * real backend to verify against, these honestly always reject rather
 * than silently accepting anything — consistent with how the main OTP
 * login flow already behaves in production (see getDemoOtpBypassCodes).
 */
export function isDemoEsignOtpAccepted(value: string): boolean {
  if (!__DEMO_AUTH_ENABLED__) return false;
  return value === '4321' || value === '1234' || value.length === 4;
}

export function isDemoAgreementOtpAccepted(value: string): boolean {
  if (!__DEMO_AUTH_ENABLED__) return false;
  return value === '5541' || value.length >= 4;
}

/** The demo auto-fill OTP for the offer-agreement e-sign flow, or null in production. */
export function getDemoAgreementOtp(): string | null {
  if (!__DEMO_AUTH_ENABLED__) return null;
  return '5541';
}

/**
 * Display-only hint text for the login screen's email/password fallback
 * field. Returns null in a production build — critically, the caller
 * must not embed this literal ITSELF anywhere in its own source (that
 * would reintroduce exactly the residual gap this phase closes); it
 * must always route the string through this function so the dead branch
 * — and the literal inside it — is eliminated at THIS module's own
 * build time, not left for a cross-module inlining the minifier cannot
 * be relied on to perform.
 */
export function getDemoPasswordHint(): string | null {
  if (!__DEMO_AUTH_ENABLED__) return null;
  return 'admin@aiec.com / password123';
}
