import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  // Phase 32 — a real BUILD-TIME (not runtime) flag: true unless this is
  // an explicit `VITE_APP_ENV=production` build. Injected via `define`,
  // which is a literal esbuild text substitution applied to every module
  // BEFORE minification — so `if (!__DEMO_AUTH_ENABLED__) { ... }` in
  // src/lib/demoCredentials.ts becomes a compile-time-constant branch the
  // minifier's dead-code elimination removes entirely (unlike the Phase 23
  // runtime `isProductionDeploy()` check, which the minifier cannot see
  // through). See docs/production/ENVIRONMENT-READINESS.md and
  // src/lib/demoCredentials.ts's header for the full rationale.
  const isProductionDeployBuild = process.env.VITE_APP_ENV === 'production';
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon-32.png', 'apple-touch-icon.png'],
        manifest: {
          name: 'AIEC — All India Elevators',
          short_name: 'AIEC',
          description: 'Field operations, sales pipeline, and installation tracking for All India Elevators Company.',
          theme_color: '#0E4B3D',
          background_color: '#F8F6F1',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Only the built app shell (JS/CSS/HTML/fonts/images) is precached.
          // Firestore, Firebase Auth, Google Sign-In, and this app's own /api/*
          // (Gemini proxy) routes are never intercepted — they always hit the
          // network live, so field data and auth state can never go stale.
          navigateFallbackDenylist: [/^\/api\//],
          // The app ships as a single ~6.5MB bundle (no route-level code
          // splitting yet), well over Workbox's 2MiB default. Raised so the
          // whole shell still precaches; the real fix is splitting the bundle.
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        },
      }),
    ],
    define: {
      'process.env.GOOGLE_MAPS_PLATFORM_KEY': JSON.stringify(process.env.GOOGLE_MAPS_PLATFORM_KEY || ''),
      // Raw boolean literal (not JSON.stringify'd to a string) so
      // `!__DEMO_AUTH_ENABLED__` folds to a real `true`/`false` constant
      // expression esbuild's minifier can dead-code-eliminate.
      __DEMO_AUTH_ENABLED__: isProductionDeployBuild ? 'false' : 'true',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
