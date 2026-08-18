/**
 * ბიზნეს-დღე (Asia/Tbilisi). დახურული დღის ფინანსური ჩანაწერების შექმნა
 * იბლოკება; Owner-ს შეუძლია დღის ხელახლა გახსნა მიზეზის მითითებით.
 */
import { getDoc, getDocs, query, runTransaction, where, type Transaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { todayBusinessDate } from '../lib/dates';
import type { AppUser, BusinessDay, CashierShift, DaySummary } from '../types';
import { COL, clean, colRef, docRef } from './db';
import { logAudit, logAuditTx } from './audit';
import { assertPermission } from '../lib/permissions';
import { computeDaySummary } from './reports';

export class BusinessDayClosedError extends Error {
  constructor(date: string) {
    super(`${date} — ბიზნეს-დღე დახურულია. ჩანაწერის დამატება შეუძლებელია.`);
    this.name = 'BusinessDayClosedError';
  }
}

/** ტრანზაქციაში: ვამოწმებთ, დღე ხომ არ არის დახურული (write-ებამდე). */
export async function assertDayOpenTx(
  tx: Transaction,
  businessDate: string,
  required: boolean
): Promise<void> {
  if (!required) return;
  const snap = await tx.get(docRef(COL.businessDays, businessDate));
  if (snap.exists() && (snap.data() as BusinessDay).status === 'CLOSED') {
    throw new BusinessDayClosedError(businessDate);
  }
}

export async function fetchBusinessDay(businessDate: string): Promise<BusinessDay | null> {
  const snap = await getDoc(docRef(COL.businessDays, businessDate));
  return snap.exists() ? (snap.data() as BusinessDay) : null;
}

export async function fetchOpenShifts(businessDate: string): Promise<CashierShift[]> {
  const snap = await getDocs(query(colRef(COL.shifts), where('status', '==', 'open')));
  return snap.docs.map((d) => d.data() as CashierShift).filter((s) => s.businessDate <= businessDate);
}

export async function closeBusinessDay(
  user: AppUser,
  businessDate: string,
  actualCashTetri: number,
  comment?: string
): Promise<{ day: BusinessDay; summary: DaySummary }> {
  assertPermission(user, 'day.close');
  const summary = await computeDaySummary(businessDate);
  summary.actualCashTetri = Math.round(actualCashTetri);
  summary.cashDifferenceTetri = summary.actualCashTetri - summary.expectedCashTetri;

  const day = await runTransaction(db, async (tx) => {
    const ref = docRef(COL.businessDays, businessDate);
    const snap = await tx.get(ref);
    const existing = snap.exists() ? (snap.data() as BusinessDay) : null;
    if (existing?.status === 'CLOSED') throw new Error(`${businessDate} უკვე დახურულია`);

    const next: BusinessDay = clean({
      id: businessDate,
      businessDate,
      status: 'CLOSED',
      summarySnapshot: summary,
      closedBy: user.id,
      closedByName: `${user.firstName} ${user.lastName}`.trim(),
      closedAt: new Date().toISOString()
    }) as BusinessDay;

    tx.set(ref, next);
    logAuditTx(tx, user, {
      action: 'DAY_CLOSED',
      entityType: 'businessDay',
      entityId: businessDate,
      summary: `დღე დაიხურა: ${businessDate}`,
      after: { summary, comment },
      reason: comment
    });
    return next;
  });

  return { day, summary };
}

export async function reopenBusinessDay(user: AppUser, businessDate: string, reason: string): Promise<void> {
  assertPermission(user, 'day.reopen');
  if (!reason.trim()) throw new Error('დღის გახსნისთვის მიზეზის მითითება სავალდებულოა');

  await runTransaction(db, async (tx) => {
    const ref = docRef(COL.businessDays, businessDate);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('ასეთი ბიზნეს-დღე არ არსებობს');
    const existing = snap.data() as BusinessDay;
    if (existing.status !== 'CLOSED') throw new Error('დღე უკვე ღიაა');

    tx.set(
      ref,
      clean({
        ...existing,
        status: 'OPEN',
        reopenedBy: user.id,
        reopenedByName: `${user.firstName} ${user.lastName}`.trim(),
        reopenedAt: new Date().toISOString(),
        reopenReason: reason.trim()
      }),
      { merge: true }
    );

    logAuditTx(tx, user, {
      action: 'DAY_REOPENED',
      entityType: 'businessDay',
      entityId: businessDate,
      summary: `დღე ხელახლა გაიხსნა: ${businessDate}`,
      before: existing,
      reason: reason.trim()
    });
  });
}

export async function markDayOpen(user: AppUser, businessDate = todayBusinessDate()): Promise<void> {
  const existing = await fetchBusinessDay(businessDate);
  if (existing) return;
  const day: BusinessDay = { id: businessDate, businessDate, status: 'OPEN' };
  await runTransaction(db, async (tx) => {
    tx.set(docRef(COL.businessDays, businessDate), clean(day));
  });
  await logAudit(user, {
    action: 'DAY_OPENED',
    entityType: 'businessDay',
    entityId: businessDate,
    summary: `ბიზნეს-დღე გაიხსნა: ${businessDate}`
  });
}
