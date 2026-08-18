/** საოპერაციო ხარჯები — სუფთა მოგების გამოსათვლელად. */
import { runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { businessDateOf } from '../lib/dates';
import { assertPermission } from '../lib/permissions';
import type { AppSettings, AppUser, Expense, PaymentMethod } from '../types';
import { COL, buildDocNo, clean, docRef, newId, readCounters } from './db';
import { logAuditTx } from './audit';
import { assertDayOpenTx } from './businessDays';

export interface ExpenseInput {
  categoryId: string;
  categoryName: string;
  amountTetri: number;
  reason: string;
  recipient?: string;
  paymentMethod: PaymentMethod;
  comment?: string;
  shiftId?: string;
  date?: string;
}

export async function createExpense(user: AppUser, settings: AppSettings, input: ExpenseInput): Promise<Expense> {
  assertPermission(user, 'expense.manage');
  if (input.amountTetri <= 0) throw new Error('თანხა უნდა იყოს 0-ზე მეტი');
  if (!input.reason.trim()) throw new Error('მიუთითეთ ხარჯის საფუძველი');
  if (!input.categoryId) throw new Error('აირჩიეთ კატეგორია');

  const date = input.date ?? new Date().toISOString();
  const businessDate = businessDateOf(date);

  return runTransaction(db, async (tx) => {
    await assertDayOpenTx(tx, businessDate, settings.requireOpenBusinessDay);
    const counters = await readCounters(tx);
    const { no, counters: nextCounters } = buildDocNo(counters, 'expense');

    const expense: Expense = clean({
      id: newId('exp'),
      documentNo: no,
      categoryId: input.categoryId,
      categoryName: input.categoryName,
      amountTetri: Math.round(input.amountTetri),
      reason: input.reason.trim(),
      recipient: input.recipient,
      paymentMethod: input.paymentMethod,
      comment: input.comment,
      date,
      businessDate,
      shiftId: input.shiftId,
      createdBy: user.id,
      createdByName: `${user.firstName} ${user.lastName}`.trim(),
      createdAt: new Date().toISOString()
    }) as Expense;

    tx.set(docRef(COL.expenses, expense.id), expense);
    tx.set(docRef(COL.meta, 'counters'), nextCounters);
    logAuditTx(tx, user, {
      action: 'EXPENSE_CREATED',
      entityType: 'expense',
      entityId: expense.id,
      summary: `ხარჯი ${no}: ${expense.categoryName} — ${(expense.amountTetri / 100).toFixed(2)} ₾`,
      after: expense
    });
    return expense;
  });
}
