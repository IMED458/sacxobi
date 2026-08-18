/**
 * მოლარის ცვლა — გახსნა, სალაროს მოძრაობა, დახურვა.
 * მოსალოდნელი ნაღდი = საწყისი + ნაღდი გაყიდვები − ნაღდი დაბრუნებები
 *                      − ნაღდი ხარჯები + შემოტანა − გატანა
 */
import { getDocs, query, runTransaction, setDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { businessDateOf, todayBusinessDate } from '../lib/dates';
import { assertPermission } from '../lib/permissions';
import type { AppUser, CashMovement, CashierShift, Expense, Sale, SaleReturn } from '../types';
import { COL, clean, colRef, docRef, newId } from './db';
import { logAudit, logAuditTx } from './audit';

export interface ShiftTotals {
  salesCount: number;
  salesTotalTetri: number;
  cashSalesTetri: number;
  cardSalesTetri: number;
  transferSalesTetri: number;
  debtSalesTetri: number;
  cashRefundsTetri: number;
  cashExpensesTetri: number;
  cashInTetri: number;
  cashOutTetri: number;
  expectedCashTetri: number;
}

/** სუფთა გამოთვლა — იტესტება ბაზის გარეშე. */
export function calcExpectedCash(openingCashTetri: number, t: Omit<ShiftTotals, 'expectedCashTetri'>): number {
  return (
    openingCashTetri +
    t.cashSalesTetri -
    t.cashRefundsTetri -
    t.cashExpensesTetri +
    t.cashInTetri -
    t.cashOutTetri
  );
}

export function summarizeShift(
  shift: CashierShift,
  sales: Sale[],
  returns: SaleReturn[],
  expenses: Expense[],
  cashMovements: CashMovement[]
): ShiftTotals {
  const active = sales.filter((s) => s.status !== 'cancelled');
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

  const base = {
    salesCount: active.length,
    salesTotalTetri: sum(active.map((s) => s.grandTotalTetri)),
    cashSalesTetri: sum(active.filter((s) => s.paymentMethod === 'CASH').map((s) => s.grandTotalTetri)),
    cardSalesTetri: sum(active.filter((s) => s.paymentMethod === 'CARD').map((s) => s.grandTotalTetri)),
    transferSalesTetri: sum(active.filter((s) => s.paymentMethod === 'BANK_TRANSFER').map((s) => s.grandTotalTetri)),
    debtSalesTetri: sum(active.filter((s) => s.paymentMethod === 'DEBT').map((s) => s.grandTotalTetri)),
    cashRefundsTetri: sum(returns.filter((r) => r.paymentMethod === 'CASH').map((r) => r.totalRefundTetri)),
    cashExpensesTetri: sum(expenses.filter((e) => e.paymentMethod === 'CASH').map((e) => e.amountTetri)),
    cashInTetri: sum(cashMovements.filter((c) => c.type === 'CASH_IN').map((c) => c.amountTetri)),
    cashOutTetri: sum(cashMovements.filter((c) => c.type === 'CASH_OUT').map((c) => c.amountTetri))
  };

  return { ...base, expectedCashTetri: calcExpectedCash(shift.openingCashTetri, base) };
}

async function loadShiftData(shift: CashierShift) {
  const [salesSnap, expSnap, cashSnap, retSnap] = await Promise.all([
    getDocs(query(colRef(COL.sales), where('shiftId', '==', shift.id))),
    getDocs(query(colRef(COL.expenses), where('shiftId', '==', shift.id))),
    getDocs(query(colRef(COL.cashMovements), where('shiftId', '==', shift.id))),
    getDocs(query(colRef(COL.returns), where('businessDate', '==', shift.businessDate)))
  ]);
  const from = shift.openedAt;
  const to = shift.closedAt ?? new Date().toISOString();
  return {
    sales: salesSnap.docs.map((d) => d.data() as Sale),
    expenses: expSnap.docs.map((d) => d.data() as Expense),
    cashMovements: cashSnap.docs.map((d) => d.data() as CashMovement),
    returns: retSnap.docs.map((d) => d.data() as SaleReturn).filter((r) => r.date >= from && r.date <= to)
  };
}

export async function computeShiftTotals(shift: CashierShift): Promise<ShiftTotals> {
  const data = await loadShiftData(shift);
  return summarizeShift(shift, data.sales, data.returns, data.expenses, data.cashMovements);
}

export async function findOpenShift(userId: string): Promise<CashierShift | null> {
  const snap = await getDocs(query(colRef(COL.shifts), where('userId', '==', userId)));
  const open = snap.docs.map((d) => d.data() as CashierShift).filter((s) => s.status === 'open');
  open.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  return open[0] ?? null;
}

export async function openShift(user: AppUser, openingCashTetri: number): Promise<CashierShift> {
  assertPermission(user, 'shift.open');
  if (openingCashTetri < 0) throw new Error('საწყისი ნაღდი არ შეიძლება იყოს უარყოფითი');
  const existing = await findOpenShift(user.id);
  if (existing) throw new Error('თქვენ უკვე გაქვთ გახსნილი ცვლა');

  const now = new Date().toISOString();
  const shift: CashierShift = clean({
    id: newId('shf'),
    userId: user.id,
    userName: `${user.firstName} ${user.lastName}`.trim(),
    openedAt: now,
    businessDate: businessDateOf(now),
    openingCashTetri: Math.round(openingCashTetri),
    status: 'open'
  }) as CashierShift;

  await setDoc(docRef(COL.shifts, shift.id), shift);
  await logAudit(user, {
    action: 'SHIFT_OPENED',
    entityType: 'shift',
    entityId: shift.id,
    summary: `ცვლა გაიხსნა (საწყისი ნაღდი ${(shift.openingCashTetri / 100).toFixed(2)} ₾)`,
    after: shift
  });
  return shift;
}

export async function closeShift(
  user: AppUser,
  shift: CashierShift,
  actualCashTetri: number,
  comment?: string
): Promise<CashierShift> {
  assertPermission(user, 'shift.close');
  if (shift.userId !== user.id && user.role !== 'OWNER' && user.role !== 'MANAGER') {
    throw new Error('სხვისი ცვლის დახურვა შეუძლიათ მხოლოდ მფლობელს/მენეჯერს');
  }
  const totals = await computeShiftTotals(shift);
  const now = new Date().toISOString();
  const difference = Math.round(actualCashTetri) - totals.expectedCashTetri;

  const next: CashierShift = clean({
    ...shift,
    closedAt: now,
    expectedClosingCashTetri: totals.expectedCashTetri,
    actualClosingCashTetri: Math.round(actualCashTetri),
    differenceTetri: difference,
    salesCountSnapshot: totals.salesCount,
    salesTotalTetri: totals.salesTotalTetri,
    cashSalesTetri: totals.cashSalesTetri,
    cardSalesTetri: totals.cardSalesTetri,
    transferSalesTetri: totals.transferSalesTetri,
    debtSalesTetri: totals.debtSalesTetri,
    cashExpensesTetri: totals.cashExpensesTetri,
    cashRefundsTetri: totals.cashRefundsTetri,
    cashInTetri: totals.cashInTetri,
    cashOutTetri: totals.cashOutTetri,
    comment,
    status: 'closed'
  }) as CashierShift;

  await runTransaction(db, async (tx) => {
    const ref = docRef(COL.shifts, shift.id);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('ცვლა ვერ მოიძებნა');
    if ((snap.data() as CashierShift).status === 'closed') throw new Error('ცვლა უკვე დახურულია');
    tx.set(ref, next);
    logAuditTx(tx, user, {
      action: 'SHIFT_CLOSED',
      entityType: 'shift',
      entityId: shift.id,
      summary: `ცვლა დაიხურა — სხვაობა ${(difference / 100).toFixed(2)} ₾`,
      after: next,
      reason: comment
    });
  });

  return next;
}

export async function addCashMovement(
  user: AppUser,
  type: CashMovement['type'],
  amountTetri: number,
  reason: string,
  shiftId?: string
): Promise<CashMovement> {
  assertPermission(user, 'cash.access');
  if (amountTetri <= 0) throw new Error('თანხა უნდა იყოს 0-ზე მეტი');
  if (!reason.trim()) throw new Error('მიუთითეთ საფუძველი');
  const now = new Date().toISOString();
  const mv: CashMovement = clean({
    id: newId('csh'),
    type,
    amountTetri: Math.round(amountTetri),
    reason: reason.trim(),
    shiftId,
    date: now,
    businessDate: businessDateOf(now),
    createdBy: user.id,
    createdByName: `${user.firstName} ${user.lastName}`.trim()
  }) as CashMovement;

  await setDoc(docRef(COL.cashMovements, mv.id), mv);
  await logAudit(user, {
    action: type === 'CASH_IN' ? 'CASH_IN' : 'CASH_OUT',
    entityType: 'cashMovement',
    entityId: mv.id,
    summary: `${type === 'CASH_IN' ? 'თანხის შეტანა' : 'თანხის გატანა'}: ${(mv.amountTetri / 100).toFixed(2)} ₾`,
    after: mv
  });
  return mv;
}

export async function fetchShiftsForDate(businessDate = todayBusinessDate()): Promise<CashierShift[]> {
  const snap = await getDocs(query(colRef(COL.shifts), where('businessDate', '==', businessDate)));
  return snap.docs.map((d) => d.data() as CashierShift).sort((a, b) => b.openedAt.localeCompare(a.openedAt));
}
