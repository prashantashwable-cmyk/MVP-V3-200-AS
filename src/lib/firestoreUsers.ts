import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth';
import { db } from './firebase';
import { User } from '../types';

// Real (non-demo) user persistence, backed by Firestore `users/{uid}` — uid is the
// Firebase Auth uid, matching the firestore.rules check `request.auth.uid == userId`.
// Demo-mode sessions never call this: they stay on DbManager's local fake store,
// so a demo "Try as Admin" click can never read or write real production data.

const stripUndefined = <T extends object>(obj: T): T => JSON.parse(JSON.stringify(obj));

export async function getOrCreateFirestoreUser(firebaseUser: FirebaseUser): Promise<User> {
  if (!db) {
    throw new Error('Firestore is not initialized.');
  }
  const email = firebaseUser.email?.toLowerCase() || '';
  const ref = doc(db, 'users', firebaseUser.uid);
  const snap = await getDoc(ref);

  // MVP (D-13 as changed in Step 02): the Admin's invite decides the role. A self-created
  // profile is only ever the pending placeholder, the invited role, or the owner's admin
  // profile — firestore.rules enforce the same thing server-side.
  const invite = await readInvite(email, firebaseUser.emailVerified);

  if (snap.exists()) {
    const existing = snap.data() as User;
    if (existing.role === ('pending_selection' as any) && invite) {
      const upgraded: User = stripUndefined({ ...existing, role: invite.role, status: 'active', customerId: invite.customerId, name: existing.name || invite.name });
      await setDoc(ref, upgraded, { merge: true });
      return upgraded;
    }
    return existing;
  }

  // Owner/Founder email auto-maps to the admin role on first real sign-in.
  const isOwner = email === 'prashantashwable@gmail.com';

  const newUser: User = stripUndefined({
    id: firebaseUser.uid,
    role: isOwner ? 'admin' : invite ? invite.role : ('pending_selection' as any),
    name: firebaseUser.displayName || invite?.name || 'Google User',
    phone: firebaseUser.phoneNumber || '',
    email,
    status: isOwner || invite ? 'active' : 'pending',
    customerId: isOwner ? undefined : invite?.customerId,
    avatarUrl: firebaseUser.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
  });

  await setDoc(ref, newUser);
  return newUser;
}

/** The Admin's invite for this email (MVP). Admin invites are applied by an Admin, never self-claimed. */
async function readInvite(email: string, emailVerified: boolean): Promise<{ role: User['role']; name: string; customerId?: string } | null> {
  if (!email || !emailVerified) return null;
  try {
    const inv = await getDoc(doc(db, 'invites', email));
    if (!inv.exists()) return null;
    const data = inv.data() as { role: User['role']; name: string; customerId?: string };
    return data.role === 'admin' ? null : data;
  } catch (err) {
    console.error('Invite lookup failed:', err);
    return null;
  }
}

export async function updateFirestoreUser(user: User): Promise<void> {
  if (!db) {
    throw new Error('Firestore is not initialized.');
  }
  const ref = doc(db, 'users', user.id);
  await setDoc(ref, stripUndefined(user), { merge: true });
}
