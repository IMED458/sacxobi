/** მომხმარებლების ადმინისტრირება (Owner / user.manage უფლებით). */
import { getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { assertPermission, DEFAULT_ROLE_PERMISSIONS } from '../lib/permissions';
import type { AppUser, Floor, Permission, UserRole } from '../types';
import { COL, clean, colRef, docRef } from './db';
import { logAudit } from './audit';
import { normalizeUsername, provisionAuthAccount, requestPasswordReset } from './auth';

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  phone?: string;
  position?: string;
  role: UserRole;
  assignedFloor?: Floor;
  permissions?: Permission[];
  comment?: string;
  mustChangePassword?: boolean;
}

export async function fetchUsers(): Promise<AppUser[]> {
  const snap = await getDocs(colRef(COL.users));
  return snap.docs.map((d) => d.data() as AppUser).sort((a, b) => a.username.localeCompare(b.username));
}

export async function createUser(actor: AppUser, input: CreateUserInput): Promise<AppUser> {
  assertPermission(actor, 'user.manage');
  const username = normalizeUsername(input.username);
  if (!username) throw new Error('მომხმარებლის სახელი სავალდებულოა');
  if (!/^[a-z0-9._-]{3,}$/.test(username)) {
    throw new Error('username უნდა შეიცავდეს მინიმუმ 3 სიმბოლოს (ლათინური ასოები, ციფრები, . _ -)');
  }
  if (!input.email.trim()) throw new Error('ელფოსტა სავალდებულოა (პაროლის აღდგენისთვის)');
  if (input.password.length < 8) throw new Error('პაროლი უნდა შეიცავდეს მინიმუმ 8 სიმბოლოს');
  if (input.role === 'EMPLOYEE' && !input.assignedFloor) throw new Error('თანამშრომელს სართული უნდა მიენიჭოს');

  const existing = await getDoc(docRef(COL.usernames, username));
  if (existing.exists()) throw new Error('ასეთი username უკვე გამოყენებულია');

  const uid = await provisionAuthAccount(input.email, input.password);
  const now = new Date().toISOString();
  const user: AppUser = clean({
    id: uid,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    username,
    email: input.email.trim(),
    phone: input.phone,
    position: input.position,
    role: input.role,
    assignedFloor: input.assignedFloor,
    permissions: input.permissions ?? DEFAULT_ROLE_PERMISSIONS[input.role],
    status: 'active',
    mustChangePassword: input.mustChangePassword ?? true,
    comment: input.comment,
    createdAt: now,
    updatedAt: now
  }) as AppUser;

  const batch = writeBatch(db);
  batch.set(docRef(COL.users, uid), user);
  batch.set(docRef(COL.usernames, username), { username, email: user.email, uid });
  await batch.commit();

  await logAudit(actor, {
    action: 'USER_CREATED',
    entityType: 'user',
    entityId: uid,
    summary: `დაემატა მომხმარებელი: ${user.username} (${user.role})`,
    after: user
  });
  return user;
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

  const next: AppUser = clean({
    ...target,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    phone: input.phone,
    position: input.position,
    role: input.role,
    assignedFloor: input.role === 'EMPLOYEE' ? input.assignedFloor : input.assignedFloor,
    permissions: input.permissions,
    comment: input.comment,
    updatedAt: new Date().toISOString()
  }) as AppUser;

  await setDoc(docRef(COL.users, target.id), next);
  await logAudit(actor, {
    action: 'USER_UPDATED',
    entityType: 'user',
    entityId: target.id,
    summary: `რედაქტირდა მომხმარებელი: ${target.username}`,
    before: target,
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

/** Owner აგზავნის პაროლის აღდგენის ბმულს მომხმარებლის ელფოსტაზე. */
export async function resetUserPassword(actor: AppUser, target: AppUser): Promise<void> {
  assertPermission(actor, 'password.reset');
  if (!target.email) throw new Error('მომხმარებელს ელფოსტა არ აქვს მითითებული');
  await requestPasswordReset(target.email, actor, target);
}
