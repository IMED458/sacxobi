/**
 * ავტორიზაცია — Firebase Authentication (email/password).
 *
 * • პაროლი არასდროს ინახება Firestore-ში (არც plaintext, არც hash) — მას
 *   მთლიანად Firebase Auth მართავს.
 * • მომხმარებელი შედის **username**-ით: `usernames/{username}` დოკუმენტი
 *   შეიცავს მხოლოდ email-ს და uid-ს (login-მდე წასაკითხად).
 * • უფლებებს რეალურად Firestore Security Rules ამოწმებს, ამიტომ პირდაპირი
 *   API გამოძახებაც ვერ გვერდს ავლის შეზღუდვებს.
 */
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  type User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { auth, db, getSecondaryAuth } from '../lib/firebase';
import { DEFAULT_ROLE_PERMISSIONS, ALL_PERMISSIONS } from '../lib/permissions';
import type { AppUser } from '../types';
import { COL, bootstrapRef, clean, docRef } from './db';
import { logAudit } from './audit';

export class AuthError extends Error {}

const AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'მომხმარებლის სახელი ან პაროლი არასწორია',
  'auth/wrong-password': 'მომხმარებლის სახელი ან პაროლი არასწორია',
  'auth/user-not-found': 'მომხმარებლის სახელი ან პაროლი არასწორია',
  'auth/invalid-email': 'ელფოსტის ფორმატი არასწორია',
  'auth/too-many-requests': 'ძალიან ბევრი მცდელობა — სცადეთ ცოტა ხანში',
  'auth/email-already-in-use': 'ეს ელფოსტა უკვე გამოყენებულია',
  'auth/weak-password': 'პაროლი უნდა შეიცავდეს მინიმუმ 6 სიმბოლოს',
  'auth/network-request-failed': 'ქსელთან კავშირი ვერ დამყარდა',
  'auth/requires-recent-login': 'უსაფრთხოებისთვის ხელახლა შედით სისტემაში'
};

export function authMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  return AUTH_MESSAGES[code] ?? (err as Error)?.message ?? 'უცნობი შეცდომა';
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export async function lookupEmailByUsername(username: string): Promise<string | null> {
  const key = normalizeUsername(username);
  if (key.includes('@')) return key;
  const snap = await getDoc(doc(db, COL.usernames, key));
  return snap.exists() ? ((snap.data() as { email: string }).email ?? null) : null;
}

export async function login(username: string, password: string): Promise<AppUser> {
  const email = await lookupEmailByUsername(username);
  if (!email) throw new AuthError('მომხმარებლის სახელი ან პაროლი არასწორია');

  const cred = await signInWithEmailAndPassword(auth, email, password);
  const profile = await fetchProfile(cred.user.uid);
  if (!profile) {
    await signOut(auth);
    throw new AuthError('მომხმარებლის პროფილი ვერ მოიძებნა — მიმართეთ ადმინისტრატორს');
  }
  if (profile.status !== 'active') {
    await signOut(auth);
    throw new AuthError('თქვენი ანგარიში გათიშულია');
  }

  const now = new Date().toISOString();
  await setDoc(docRef(COL.users, profile.id), { lastLoginAt: now }, { merge: true });
  await logAudit(profile, { action: 'LOGIN', entityType: 'user', entityId: profile.id, summary: 'შესვლა სისტემაში' });
  return { ...profile, lastLoginAt: now };
}

export async function logout(user: AppUser | null): Promise<void> {
  if (user) {
    try {
      await logAudit(user, { action: 'LOGOUT', entityType: 'user', entityId: user.id, summary: 'სისტემიდან გასვლა' });
    } catch {
      /* გასვლას ლოგის შეცდომა არ უნდა აფერხებდეს */
    }
  }
  await signOut(auth);
}

export async function fetchProfile(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(docRef(COL.users, uid));
  return snap.exists() ? (snap.data() as AppUser) : null;
}

export function watchAuth(cb: (fbUser: FirebaseUser | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

/* ------------------------------------------------------------------ */
/* პირველი Owner-ის შექმნა (ერთჯერადი bootstrap)                        */
/* ------------------------------------------------------------------ */

export async function isBootstrapped(): Promise<boolean> {
  const snap = await getDoc(bootstrapRef);
  return snap.exists();
}

export interface BootstrapInput {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  phone?: string;
}

/**
 * პირველი მფლობელის შექმნა. Security Rules უშვებს ამ ჩაწერას მხოლოდ მაშინ,
 * როცა `meta/bootstrap` ჯერ არ არსებობს — ანუ ზუსტად ერთხელ.
 * პაროლი მხოლოდ Firebase Auth-ში მიდის; ბაზაში არ იწერება.
 */
export async function bootstrapOwner(input: BootstrapInput): Promise<AppUser> {
  if (await isBootstrapped()) throw new AuthError('სისტემა უკვე ინიციალიზებულია');
  if (input.password.length < 8) throw new AuthError('პაროლი უნდა შეიცავდეს მინიმუმ 8 სიმბოლოს');

  const { createUserWithEmailAndPassword } = await import('firebase/auth');
  const cred = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
  const uid = cred.user.uid;
  const now = new Date().toISOString();
  const username = normalizeUsername(input.username);

  const owner: AppUser = clean({
    id: uid,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    username,
    email: input.email.trim(),
    phone: input.phone,
    position: 'მფლობელი',
    role: 'OWNER',
    permissions: [...ALL_PERMISSIONS],
    status: 'active',
    mustChangePassword: false,
    createdAt: now,
    updatedAt: now
  }) as AppUser;

  const batch = writeBatch(db);
  batch.set(docRef(COL.users, uid), owner);
  batch.set(docRef(COL.usernames, username), { username, email: owner.email, uid });
  batch.set(bootstrapRef, { initializedAt: now, ownerUid: uid });
  await batch.commit();

  await logAudit(owner, {
    action: 'OWNER_BOOTSTRAPPED',
    entityType: 'user',
    entityId: uid,
    summary: `სისტემის პირველი მფლობელი შეიქმნა: ${owner.username}`
  });
  return owner;
}

/* ------------------------------------------------------------------ */
/* პაროლები                                                            */
/* ------------------------------------------------------------------ */

/** მომხმარებელი ცვლის საკუთარ პაროლს. */
export async function changeOwnPassword(user: AppUser, currentPassword: string, newPassword: string): Promise<void> {
  if (newPassword.length < 8) throw new AuthError('ახალი პაროლი უნდა შეიცავდეს მინიმუმ 8 სიმბოლოს');
  const fbUser = auth.currentUser;
  if (!fbUser?.email) throw new AuthError('სესია ვერ მოიძებნა — შედით ხელახლა');

  await reauthenticateWithCredential(fbUser, EmailAuthProvider.credential(fbUser.email, currentPassword));
  await updatePassword(fbUser, newPassword);
  await setDoc(docRef(COL.users, user.id), { mustChangePassword: false, updatedAt: new Date().toISOString() }, { merge: true });
  await logAudit(user, {
    action: 'PASSWORD_CHANGED',
    entityType: 'user',
    entityId: user.id,
    summary: 'მომხმარებელმა შეიცვალა საკუთარი პაროლი'
  });
}

/** პაროლის აღდგენის ბმულის გაგზავნა (login გვერდიდან ან Owner-ისგან). */
export async function requestPasswordReset(email: string, actor?: AppUser, targetUser?: AppUser): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
  if (actor && targetUser) {
    await setDoc(docRef(COL.users, targetUser.id), { mustChangePassword: true, updatedAt: new Date().toISOString() }, { merge: true });
    await logAudit(actor, {
      action: 'PASSWORD_RESET',
      entityType: 'user',
      entityId: targetUser.id,
      summary: `პაროლის აღდგენა მოთხოვნილია: ${targetUser.username} (ბმული გაიგზავნა ${email}-ზე)`
    });
  }
}

/* ------------------------------------------------------------------ */
/* ახალი მომხმარებლის ავტორიზაციის ანგარიში                             */
/* ------------------------------------------------------------------ */

/**
 * ქმნის Firebase Auth ანგარიშს **მეორად** აპლიკაციაში, რათა მიმდინარე
 * (Owner-ის) სესია არ დაიკარგოს. აბრუნებს ახალ uid-ს.
 */
export async function provisionAuthAccount(email: string, password: string): Promise<string> {
  const { createUserWithEmailAndPassword, signOut: secondarySignOut } = await import('firebase/auth');
  const secondary = getSecondaryAuth();
  const cred = await createUserWithEmailAndPassword(secondary, email.trim(), password);
  const uid = cred.user.uid;
  await secondarySignOut(secondary);
  return uid;
}

export const DEFAULT_PERMISSIONS_BY_ROLE = DEFAULT_ROLE_PERMISSIONS;
