/**
 * ადმინისტრატორის (მფლობელის) სრული უფლებები — ჩანაწერების წაშლა.
 *
 * ⚠️ წაშლა არის „მძიმე" ოპერაცია: დოკუმენტი ქრება, მაგრამ მარაგი ავტომატურად
 * არ ბრუნდება. მარაგზე მოქმედი დოკუმენტების უკან დასაბრუნებლად სწორია
 * გაუქმება / დაბრუნება. ყოველი წაშლა აისახება Audit Log-ში.
 */
import { deleteDoc, getDoc } from 'firebase/firestore';
import { assertPermission } from '../lib/permissions';
import type { AppUser } from '../types';
import { docRef } from './db';
import { logAudit } from './audit';

export interface DeleteTarget {
  collection: string;
  id: string;
  /** რა დაიწერება Audit Log-ში, მაგ. „გაყიდვა SAL-2026-000012". */
  label: string;
  entityType?: string;
}

export async function adminDelete(user: AppUser, target: DeleteTarget, reason: string): Promise<void> {
  assertPermission(user, 'admin.delete');
  if (!reason.trim()) throw new Error('მიუთითეთ წაშლის მიზეზი');

  const ref = docRef(target.collection, target.id);
  const snap = await getDoc(ref);
  const before = snap.exists() ? snap.data() : undefined;

  await deleteDoc(ref);
  await logAudit(user, {
    action: 'RECORD_DELETED',
    entityType: target.entityType ?? target.collection,
    entityId: target.id,
    summary: `წაიშალა: ${target.label}`,
    before,
    reason: reason.trim()
  });
}
