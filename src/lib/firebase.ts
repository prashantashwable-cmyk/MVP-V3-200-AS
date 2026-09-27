import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

/**
 * Which Firebase project the app talks to. The live project is the default, so a build with
 * no settings behaves exactly as before. A staging build sets VITE_FIREBASE_* at build time
 * (multi-user testing, never real customer data — D-19). Node scripts read the same names
 * from process.env.
 */
function setting(key: string): string | undefined {
  const viteEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
  const fromVite = viteEnv?.[key];
  if (fromVite) return fromVite;
  return typeof process !== 'undefined' ? process.env?.[key] : undefined;
}

const LIVE_CONFIG = {
  projectId: "dogwood-torus-v71nt",
  appId: "1:967038691092:web:fad69deb0535e388814401",
  apiKey: "AIzaSyDefOJLPRU_n7wpJBsHUVMSMJeg6CEK6DY",
  authDomain: "dogwood-torus-v71nt.firebaseapp.com",
  storageBucket: "dogwood-torus-v71nt.firebasestorage.app",
  messagingSenderId: "967038691092"
};
// The live project's Firestore database is a named (non-default) database, per
// firebase-applet-config.json. getFirestore(app) alone connects to "(default)", which the live
// project never provisioned.
const LIVE_DATABASE_ID = 'ai-studio-buildit-6201e806-4162-4565-b05c-8c48e796f933';

const overrideProject = setting('VITE_FIREBASE_PROJECT_ID');
const firebaseConfig = overrideProject
  ? {
      projectId: overrideProject,
      appId: setting('VITE_FIREBASE_APP_ID') ?? '',
      apiKey: setting('VITE_FIREBASE_API_KEY') ?? 'fake-api-key',
      authDomain: setting('VITE_FIREBASE_AUTH_DOMAIN') ?? `${overrideProject}.firebaseapp.com`,
      storageBucket: setting('VITE_FIREBASE_STORAGE_BUCKET') ?? '',
      messagingSenderId: setting('VITE_FIREBASE_MESSAGING_SENDER_ID') ?? '',
    }
  : LIVE_CONFIG;
const FIRESTORE_DATABASE_ID = overrideProject ? (setting('VITE_FIREBASE_DATABASE_ID') ?? '(default)') : LIVE_DATABASE_ID;

// Emulators only ever for a `demo-*` project, so a stray setting can never point the live
// project at a local emulator (or the other way round).
const firestoreEmulator = setting('VITE_FIRESTORE_EMULATOR_HOST') ?? setting('FIRESTORE_EMULATOR_HOST');
const authEmulator = setting('VITE_FIREBASE_AUTH_EMULATOR_HOST') ?? setting('FIREBASE_AUTH_EMULATOR_HOST');
const useEmulators = !!overrideProject && overrideProject.startsWith('demo-') && !!firestoreEmulator;

let app;
let db: any = null;
let auth: any = null;

try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  db = getFirestore(app, FIRESTORE_DATABASE_ID);
  auth = getAuth(app);
  if (useEmulators) {
    const [host, port] = firestoreEmulator!.split(':');
    connectFirestoreEmulator(db, host, Number(port));
    if (authEmulator) connectAuthEmulator(auth, `http://${authEmulator}`, { disableWarnings: true });
  }
} catch (error) {
  console.error("Failed to initialize Firebase services:", error);
}

// Phase 33: `app`/`firebaseConfig` exported too (previously private to this
// module) so the live-auth test harness and observability code can verify
// the real project identity is wired correctly, without duplicating this
// config in a second place.
export { db, auth, app, firebaseConfig };
