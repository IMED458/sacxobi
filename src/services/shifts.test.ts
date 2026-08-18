import { describe, expect, it } from 'vitest';
import { calcExpectedCash, summarizeShift } from './shifts';
import type { CashMovement, CashierShift, Expense, Sale, SaleReturn } from '../types';

const shift: CashierShift = {
  id: 'sh1',
  userId: 'u1',
  userName: 'მოლარე',
  openedAt: '2026-08-18T05:00:00.000Z',
  businessDate: '2026-08-18',
  openingCashTetri: 10000,
  status: 'open'
};

describe('calcExpectedCash', () => {
  it('ფორმულას სწორად იყენებს', () => {
    const expected = calcExpectedCash(10000, {
      salesCount: 2,
      salesTotalTetri: 5000,
      cashSalesTetri: 3000,
      cardSalesTetri: 2000,
      transferSalesTetri: 0,
      debtSalesTetri: 0,
      cashRefundsTetri: 500,
      cashExpensesTetri: 800,
      cashInTetri: 200,
      cashOutTetri: 100
    });
    // 10000 + 3000 − 500 − 800 + 200 − 100
    expect(expected).toBe(11800);
  });
});

describe('summarizeShift', () => {
  const base: Sale = {
    id: 's1',
    saleNo: 'SAL-1',
    date: '2026-08-18T09:00:00.000Z',
    businessDate: '2026-08-18',
    soldByUserId: 'u1',
    soldByName: 'მოლარე',
    receivedByName: 'ნინო',
    items: [],
    subtotalTetri: 1000,
    discountTetri: 0,
    grandTotalTetri: 1000,
    costTotalTetri: 600,
    grossProfitTetri: 400,
    paymentMethod: 'CASH',
    paidTetri: 1000,
    balanceDueTetri: 0,
    status: 'active',
    createdAt: '2026-08-18T09:00:00.000Z'
  };

  it('ბარათსა და ნაღდს ცალ-ცალკე ითვლის და გაუქმებულს გამორიცხავს', () => {
    const sales: Sale[] = [
      base,
      { ...base, id: 's2', paymentMethod: 'CARD' },
      { ...base, id: 's3', status: 'cancelled' }
    ];
    const expenses: Expense[] = [];
    const returns: SaleReturn[] = [];
    const cash: CashMovement[] = [
      { id: 'c1', type: 'CASH_OUT', amountTetri: 300, reason: 'ხურდა', date: '', businessDate: '2026-08-18', createdBy: 'u1', createdByName: 'მოლარე' }
    ];
    const totals = summarizeShift(shift, sales, returns, expenses, cash);
    expect(totals.salesCount).toBe(2);
    expect(totals.cashSalesTetri).toBe(1000);
    expect(totals.cardSalesTetri).toBe(1000);
    expect(totals.cashOutTetri).toBe(300);
    expect(totals.expectedCashTetri).toBe(10000 + 1000 - 300);
  });
});
