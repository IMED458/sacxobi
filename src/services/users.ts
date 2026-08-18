/** მომხმარებლების ადმინისტრირება (Owner / user.manage უფლებით). */
import { getDocs, setDoc } from 'firebase/firestore';
import { assertPermission, DEFAULT_ROLE_PERMISSIONS } from '../lib/permissions';
import type { AppUser, Floor, Permission, UserRole } from '../types';
import { COL, clean, colRef, docRef, newId } from './db';
import { logAudit } from './audit';
import { findUserByUsername, hashPassword, normalizeUsername, stripSecret } from './auth';

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  username: string;
  password: string;
  phone?: string;
  position?: string;
  role: UserRole;
  assignedFloor?: Floor;
  permissions?: Permission[];
  comment?: string;
  mustChangePassword?: boolean;
}

/** ყველა მომხმარებელი — passwordHash-ის გარეშე. */
export async function fetchUsers(): Promise<AppUser[]> {
  const snap = await getDocs(colRef(COL.users));
  return snap.docs
    .map((d) => stripSecret(d.data() as AppUser))
    .sort((a, b) => a.username.localeCompare(b.username));
}

export async function createUser(actor: AppUser, input: CreateUserInput): Promise<AppUser> {
  assertPermission(actor, 'user.manage');
  const username = normalizeUsername(input.username);
  if (!username) throw new Error('მომხმარებლის სახელი სავალდებულოა');
  if (!/^[a-z0-9._-]{3,}$/.test(username)) {
    throw new Error('username უნდა შეიცავდეს მინიმუმ 3 სიმბოლოს (ლათინური ასოები, ციფრები, . _ -)');
  }
  if (input.password.length < 6) throw new Error('პაროლი უნდა შეიცავდეს მინიმუმ 6 სიმბოლოს');
  if (input.role === 'EMPLOYEE' && !input.assignedFloor) throw new Error('თანამშრომელს სართული უნდა მიენიჭოს');

  const existing = await findUserByUsername(username);
  if (existing) throw new Error('ასეთი მომხმარებლის სახელი უკვე გამოყენებულია');

  const now = new Date().toISOString();
  const user: AppUser = clean({
    id: newId('usr'),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    username,
    phone: input.phone,
    position: input.position,
    role: input.role,
    assignedFloor: input.assignedFloor,
    permissions: input.permissions ?? DEFAULT_ROLE_PERMISSIONS[input.role],
    status: 'active',
    mustChangePassword: input.mustChangePassword ?? true,
    passwordHash: hashPassword(input.password),
    comment: input.comment,
    createdAt: now,
    updatedAt: now
  }) as AppUser;

  await setDoc(docRef(COL.users, user.id), user);

  const safe = stripSecret(user);
  await logAudit(actor, {
    action: 'USER_CREATED',
    entityType: 'user',
    entityId: user.id,
    summary: `დაემატა მომხმარებელი: ${user.username} (${user.role})`,
    after: safe
  });
  return safe;
}

export interface UpdateUserInput {
  firstName: string;
  lastName: string;
  phone?: string;
  position?: string;
  role: UserRole;
  assignedFloor?: Floor;
  permissions: Permission[];
  comment?: string;
}

export async function updateUser(actor: AppUser, target: AppUser, input: UpdateUserInput): Promise<AppUser> {
  assertPermission(actor, 'user.manage');
  if (actor.id === target.id && (input.role !== target.role || input.permissions.length !== target.permissions.length)) {
    throw new Error('საკუთარი როლის/უფლებების შეცვლა დაუშვებელია');
  }
  if (input.role === 'EMPLOYEE' && !input.assignedFloor) throw new Error('თანამშრომელს სართული უნდა მიენიჭოს');

  const patch = clean({
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    phone: input.phone ?? null,
    position: input.position ?? null,
    role: input.role,
    assignedFloor: input.assignedFloor ?? null,
    permissions: input.permissions,
    comment: input.comment ?? null,
    updatedAt: new Date().toISOString()
  });

  // merge — `passwordHash` ხელუხლებელი რჩება.
  await setDoc(docRef(COL.users, target.id), patch, { merge: true });

  const next = stripSecret({ ...target, ...patch } as AppUser);
  await logAudit(actor, {
    action: 'USER_UPDATED',
    entityType: 'user',
    entityId: target.id,
    summary: `რედაქტირდა მომხმარებელი: ${target.username}`,
    before: stripSecret(target),
    after: next
  });
  if (JSON.stringify(target.permissions) !== JSON.stringify(input.permissions) || target.role !== input.role) {
    await logAudit(actor, {
      action: 'PERMISSIONS_CHANGED',
      entityType: 'user',
      entityId: target.id,
      summary: `შეიცვალა უფლებები: ${target.username}`,
      before: { role: target.role, permissions: target.permissions },
      after: { role: input.role, permissions: input.permissions }
    });
  }
  return next;
}

export async function setUserStatus(actor: AppUser, target: AppUser, status: 'active' | 'disabled'): Promise<void> {
  assertPermission(actor, 'user.manage');
  if (actor.id === target.id) throw new Error('საკუთარი ანგარიშის გათიშვა შეუძლებელია');
  await setDoc(docRef(COL.users, target.id), { status, updatedAt: new Date().toISOString() }, { merge: true });
  await logAudit(actor, {
    action: status === 'active' ? 'USER_ENABLED' : 'USER_DISABLED',
    entityType: 'user',
    entityId: target.id,
    summary: `${target.username}: ${status === 'active' ? 'გააქტიურდა' : 'გაითიშა'}`,
    before: { status: target.status },
    after: { status }
  });
}

/**
 * Owner აყენებს ახალ (დროებით) პაროლს.
 * Audit Log-ში ჩაიწერება მხოლოდ ის, რომ reset მოხდა — არასდროს თვითონ პაროლი.
 */
export async function resetUserPassword(
  actor: AppUser,
  target: AppUser,
  newPassword: string,
  forceChange = true
): Promise<void> {
  assertPermission(actor, 'password.reset');
  if (newPassword.length < 6) throw new Error('პაროლი უნდა შეიცავდეს მინიმუმ 6 სიმბოლოს');

  await setDoc(
    docRef(COL.users, target.id),
    { passwordHash: hashPassword(newPassword), mustChangePassword: forceChange, updatedAt: new Date().toISOString() },
    { merge: true }
  );
  await logAudit(actor, {
    action: 'PASSWORD_RESET',
    entityType: 'user',
    entityId: target.id,
    summary: `პაროლი განულდა: ${target.username}${forceChange ? ' (შესვლისას შეცვლა სავალდებულოა)' : ''}`
  });
}
