/**
 * ავტორიზაცია — მომხმარებლის სახელი + პაროლი, სრულად პროგრამის შიგნით.
 *
 * • მომხმარებლებს ქმნის Owner „მომხმარებლები" გვერდიდან — ელფოსტა არ არის
 *   საჭირო.
 * • პაროლი არასდროს ინახება ღიად: Firestore-ში წერია მხოლოდ bcrypt-hash
 *   (`passwordHash`), რომელიც არასდროს ბრუნდება UI-ში და არასდროს ხვდება
 *   Audit Log-ში.
 * • სესია ინახება ბრაუზერის localStorage-ში (მხოლოდ userId).
 */
import bcrypt from 'bcryptjs';
import { getDocs, query, setDoc, where } from 'firebase/firestore';
import { ALL_PERMISSIONS } from '../lib/permissions';
import type { AppUser } from '../types';
import { COL, bootstrapRef, clean, colRef, docRef, newId } from './db';
import { getDoc } from 'firebase/firestore';
import { logAudit } from './audit';

const SESSION_KEY = 'sacxobi_session_user';
const BCRYPT_ROUNDS = 10;

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export function authMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return 'უცნობი შეცდომა';
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, passwordHash?: string): boolean {
  if (!passwordHash) return false;
  return bcrypt.compareSync(password, passwordHash);
}

/** `passwordHash`-ის ამოშლა — UI-ში და ლოგებში ის არასდროს უნდა მოხვდეს. */
export function stripSecret(user: AppUser): AppUser {
  const copy = { ...user };
  delete (copy as { passwordHash?: string }).passwordHash;
  return copy;
}

export async function findUserByUsername(username: string): Promise<AppUser | null> {
  const key = normalizeUsername(username);
  if (!key) return null;
  const snap = await getDocs(query(colRef(COL.users), where('username', '==', key)));
  return snap.empty ? null : (snap.docs[0].data() as AppUser);
}

export async function fetchProfile(userId: string): Promise<AppUser | null> {
  const snap = await getDoc(docRef(COL.users, userId));
  return snap.exists() ? (snap.data() as AppUser) : null;
}

/* ------------------------------------------------------------------ */
/* შესვლა / გასვლა                                                     */
/* ------------------------------------------------------------------ */

export async function login(username: string, password: string): Promise<AppUser> {
  const found = await findUserByUsername(username);
  if (!found || !verifyPassword(password, found.passwordHash)) {
    throw new AuthError('მომხმარებლის სახელი ან პაროლი არასწორია');
  }
  if (found.status !== 'active') throw new AuthError('თქვენი ანგარიში გათიშულია');

  const now = new Date().toISOString();
  await setDoc(docRef(COL.users, found.id), { lastLoginAt: now }, { merge: true });
  saveSession(found.id);

  const profile = stripSecret({ ...found, lastLoginAt: now });
  await logAudit(profile, { action: 'LOGIN', entityType: 'user', entityId: profile.id, summary: 'შესვლა სისტემაში' });
  return profile;
}

export async function logout(user: AppUser | null): Promise<void> {
  if (user) {
    try {
      await logAudit(user, { action: 'LOGOUT', entityType: 'user', entityId: user.id, summary: 'სისტემიდან გასვლა' });
    } catch {
      /* გასვლას ლოგის შეცდომა არ უნდა აფერხებდეს */
    }
  }
  clearSession();
}

/* ------------------------------------------------------------------ */
/* სესია                                                               */
/* ------------------------------------------------------------------ */

export function saveSession(userId: string): void {
  try {
    localStorage.setItem(SESSION_KEY, userId);
  } catch {
    /* ignore */
  }
}

export function readSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* პირველი Owner-ის შექმნა (ერთჯერადი)                                  */
/* ------------------------------------------------------------------ */

export async function isBootstrapped(): Promise<boolean> {
  const snap = await getDoc(bootstrapRef);
  return snap.exists();
}

export interface BootstrapInput {
  firstName: string;
  lastName: string;
  username: string;
  password: string;
  phone?: string;
}

export async function bootstrapOwner(input: BootstrapInput): Promise<AppUser> {
  if (await isBootstrapped()) throw new AuthError('სისტემა უკვე ინიციალიზებულია');
  const username = normalizeUsername(input.username);
  if (!/^[a-z0-9._-]{3,}$/.test(username)) {
    throw new AuthError('username უნდა შეიცავდეს მინიმუმ 3 სიმბოლოს (ლათინური ასოები, ციფრები, . _ -)');
  }
  if (input.password.length < 6) throw new AuthError('პაროლი უნდა შეიცავდეს მინიმუმ 6 სიმბოლოს');

  const now = new Date().toISOString();
  const owner: AppUser = clean({
    id: newId('usr'),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    username,
    phone: input.phone,
    position: 'მფლობელი',
    role: 'OWNER',
    permissions: [...ALL_PERMISSIONS],
    status: 'active',
    mustChangePassword: false,
    passwordHash: hashPassword(input.password),
    createdAt: now,
    updatedAt: now
  }) as AppUser;

  await setDoc(docRef(COL.users, owner.id), owner);
  await setDoc(bootstrapRef, { initializedAt: now, ownerUid: owner.id });
  saveSession(owner.id);

  const profile = stripSecret(owner);
  await logAudit(profile, {
    action: 'OWNER_BOOTSTRAPPED',
    entityType: 'user',
    entityId: owner.id,
    summary: `სისტემის პირველი მფლობელი შეიქმნა: ${owner.username}`
  });
  return profile;
}

/* ------------------------------------------------------------------ */
/* პაროლები                                                            */
/* ------------------------------------------------------------------ */

/** მომხმარებელი ცვლის საკუთარ პაროლს. */
export async function changeOwnPassword(user: AppUser, currentPassword: string, newPassword: string): Promise<void> {
  if (newPassword.length < 6) throw new AuthError('ახალი პაროლი უნდა შეიცავდეს მინიმუმ 6 სიმბოლოს');
  const stored = await fetchProfile(user.id);
  if (!stored) throw new AuthError('მომხმარებელი ვერ მოიძებნა');
  if (!verifyPassword(currentPassword, stored.passwordHash)) throw new AuthError('მიმდინარე პაროლი არასწორია');

  await setDoc(
    docRef(COL.users, user.id),
    { passwordHash: hashPassword(newPassword), mustChangePassword: false, updatedAt: new Date().toISOString() },
    { merge: true }
  );
  await logAudit(user, {
    action: 'PASSWORD_CHANGED',
    entityType: 'user',
    entityId: user.id,
    summary: 'მომხმარებელმა შეიცვალა საკუთარი პაროლი'
  });
}
