import React from 'react';
import type { AppEnvironment } from '../lib/environment';

/**
 * Environment visibility badge — Phase 12.
 *
 * "Make environment state unmistakable... do not allow seeded demo data
 * to be mistaken for live records." Phase 04 built `AppEnvironment`
 * (demo/sandbox/production) and `environmentLabel()` but never rendered
 * it anywhere (documented as a gap in that phase's own doc, §5). This is
 * that badge, finally mounted.
 *
 * Deliberately small and unobtrusive for `sandbox`/`production` (a
 * corner tag, not an interruption) but visually loud for `demo` — a
 * persistent colored banner, since that's the one case where mistaking
 * the environment for something it isn't (real production data) could
 * lead someone to act on throwaway records as if they were real.
 */
export const EnvironmentBadge: React.FC<{ environment: AppEnvironment }> = ({ environment }) => {
  if (environment === 'demo') {
    return (
      <div className="w-full bg-[#B8873D] text-white text-center text-[11px] font-bold tracking-wide py-1 z-[90] relative">
        DEMO MODE — nothing here is saved to production. Data resets when this session ends.
      </div>
    );
  }
  const style = environment === 'production'
    ? 'bg-royalemerald/10 text-royalemerald border-royalemerald/30'
    : 'bg-[rgba(184,135,61,0.10)] text-[#B8873D] border-[rgba(184,135,61,0.30)]';
  return (
    <div className={`fixed bottom-2 right-2 z-[90] px-2 py-1 rounded-md border text-[9px] font-mono font-bold tracking-wide ${style}`}>
      {environment.toUpperCase()}
    </div>
  );
};
