import { describe, expect, it } from 'vitest';
import { buildDaySummary, computeProfit, groupMaterialUsage, groupSales } from './reports';
import type { Expense, ProductionBatch, Purchase, Sale, SaleReturn, CashierShift, CashMovement } from '../types';

const sale = (over: Partial<Sale> = {}): Sale => ({
  id: 's1',
  saleNo: 'SAL-2026-000001',
  date: '2026-08-18T09:00:00.000Z',
  businessDate: '2026-08-18',
  soldByUserId: 'u1',
  soldByName: 'მოლარე',
  receivedByName: 'გიორგი',
  items: [
    {
      id: 'i1',
      productId: 'p1',
      productName: 'პური — პატარა',
      productCode: 'BRD-S',
      unitSymbol: 'ცალი',
      quantity: 3,
      sellingPriceTetri: 100,
      listPriceTetri: 100,
      lineTotalTetri: 300,
      costTotalTetri: 195,
      profitTetri: 105,
      location: 'UPPER_FLOOR'
    }
  ],
  subtotalTetri: 300,
  discountTetri: 0,
  grandTotalTetri: 300,
  costTotalTetri: 195,
  grossProfitTetri: 105,
  paymentMethod: 'CASH',
  paidTetri: 300,
  balanceDueTetri: 0,
  status: 'active',
  createdAt: '2026-08-18T09:00:00.000Z',
  ...over
});

const expense = (amount: number, method: Expense['paymentMethod'] = 'CASH'): Expense => ({
  id: 'e1',
  documentNo: 'EXP-2026-000001',
  categoryId: 'c1',
  categoryName: 'გაზი',
  amountTetri: amount,
  reason: 'გაზი',
  paymentMethod: method,
  date: '2026-08-18T10:00:00.000Z',
  businessDate: '2026-08-18',
  createdBy: 'u1',
  createdByName: 'მფლობელი',
  createdAt: '2026-08-18T10:00:00.000Z'
});

describe('computeProfit', () => {
  it('სუფთა მოგებას სწორად ითვლის (და არა sales − purchases)', () => {
    const res = computeProfit({ sales: [sale()], returns: [], expenses: [expense(50)] });
    expect(res.grossSalesTetri).toBe(300);
    expect(res.netSalesTetri).toBe(300);
    expect(res.cogsTetri).toBe(195);
    expect(res.grossProfitTetri).toBe(105);
    expect(res.expensesTetri).toBe(50);
    expect(res.netProfitTetri).toBe(55);
  });

  it('გაუქმებულ გაყიდვას არ ითვლის', () => {
    const res = computeProfit({ sales: [sale(), sale({ id: 's2', status: 'cancelled' })], returns: [], expenses: [] });
    expect(res.salesCount).toBe(1);
    expect(res.grossSalesTetri).toBe(300);
  });

  it('დაბრუნება ამცირებს წმინდა გაყიდვასაც და COGS-საც', () => {
    const ret: SaleReturn = {
      id: 'r1',
      returnNo: 'RET-2026-000001',
      saleId: 's1',
      saleNo: 'SAL-2026-000001',
      date: '2026-08-18T11:00:00.000Z',
      businessDate: '2026-08-18',
      items: [],
      totalRefundTetri: 100,
      totalCostTetri: 65,
      paymentMethod: 'CASH',
      reason: 'გაფუჭებული',
      createdBy: 'u1',
      createdByName: 'მფლობელი',
      createdAt: '2026-08-18T11:00:00.000Z'
    };
    const res = computeProfit({ sales: [sale()], returns: [ret], expenses: [] });
    expect(res.netSalesTetri).toBe(200);
    expect(res.cogsTetri).toBe(130);
    expect(res.grossProfitTetri).toBe(70);
  });

  it('ფასდაკლება აკლდება წმინდა გაყიდვას', () => {
    const res = computeProfit({ sales: [sale({ discountTetri: 40, grandTotalTetri: 260 })], returns: [], expenses: [] });
    expect(res.netSalesTetri).toBe(260);
  });
});

describe('groupSales', () => {
  it('პროდუქტების მიხედვით აჯგუფებს', () => {
    const rows = groupSales([sale(), sale({ id: 's2' })], 'product');
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(6);
    expect(rows[0].revenueTetri).toBe(600);
    expect(rows[0].profitTetri).toBe(210);
  });

  it('მიმღების მიხედვით აჯგუფებს', () => {
    const rows = groupSales([sale(), sale({ id: 's2', receivedByName: 'ნინო' })], 'receiver');
    expect(rows.map((r) => r.label).sort()).toEqual(['გიორგი', 'ნინო']);
  });
});

describe('buildDaySummary', () => {
  const batch: ProductionBatch = {
    id: 'b1',
    batchNo: 'PRD-2026-000001',
    productId: 'p1',
    productName: 'პური — პატარა',
    floor: 'LOWER_FLOOR',
    bakerId: 'u2',
    bakerName: 'მცხობელი',
    producedGoodQty: 40,
    wasteQty: 2,
    consumptions: [
      { materialId: 'm1', materialName: 'ფქვილი', unitSymbol: 'კგ', location: 'WAREHOUSE', quantity: 20, costTetri: 3000 }
    ],
    totalMaterialCostTetri: 3000,
    unitProductionCostTetri: 75,
    date: '2026-08-18T06:00:00.000Z',
    businessDate: '2026-08-18',
    createdAt: '2026-08-18T06:00:00.000Z'
  };

  const shift: CashierShift = {
    id: 'sh1',
    userId: 'u1',
    userName: 'მოლარე',
    openedAt: '2026-08-18T05:00:00.000Z',
    businessDate: '2026-08-18',
    openingCashTetri: 5000,
    status: 'closed',
    actualClosingCashTetri: 5250
  };

  const purchase: Purchase = {
    id: 'pu1',
    documentNo: 'PUR-2026-000001',
    supplierId: 'sup1',
    supplierName: 'მომწოდებელი',
    date: '2026-08-18T04:00:00.000Z',
    businessDate: '2026-08-18',
    items: [],
    totalTetri: 15000,
    paidTetri: 15000,
    balanceTetri: 0,
    paymentMethod: 'CASH',
    status: 'completed',
    createdBy: 'u1',
    createdByName: 'მფლობელი',
    createdAt: '2026-08-18T04:00:00.000Z'
  };

  const cashMovements: CashMovement[] = [];

  it('შესყიდვას ცალკე აჩვენებს და მოგებას არ აკლებს', () => {
    const s = buildDaySummary({
      sales: [sale()],
      returns: [],
      expenses: [expense(50)],
      purchases: [purchase],
      production: [batch],
      shifts: [shift],
      cashMovements
    });
    expect(s.purchasesTetri).toBe(15000);
    expect(s.netProfitTetri).toBe(55);
    expect(s.producedUnits).toBe(40);
    expect(s.wasteUnits).toBe(2);
    expect(s.materialCostTetri).toBe(3000);
  });

  it('მოსალოდნელ ნაღდს სწორად ითვლის', () => {
    const s = buildDaySummary({
      sales: [sale()],
      returns: [],
      expenses: [expense(50)],
      purchases: [],
      production: [],
      shifts: [shift],
      cashMovements
    });
    // 5000 საწყისი + 300 ნაღდი გაყიდვა − 50 ნაღდი ხარჯი = 5250
    expect(s.expectedCashTetri).toBe(5250);
    expect(s.actualCashTetri).toBe(5250);
    expect(s.cashDifferenceTetri).toBe(0);
  });
});

describe('groupMaterialUsage', () => {
  it('მასალის ხარჯვას პროდუქტებისა და მცხობლების ჭრილში აჯგუფებს', () => {
    const batch: ProductionBatch = {
      id: 'b1',
      batchNo: 'PRD-1',
      productId: 'p1',
      productName: 'პური',
      floor: 'LOWER_FLOOR',
      bakerId: 'u2',
      bakerName: 'ნიკა',
      producedGoodQty: 10,
      wasteQty: 0,
      consumptions: [
        { materialId: 'm1', materialName: 'ფქვილი', unitSymbol: 'კგ', location: 'WAREHOUSE', quantity: 5, costTetri: 750 }
      ],
      totalMaterialCostTetri: 750,
      unitProductionCostTetri: 75,
      date: '2026-08-18T06:00:00.000Z',
      businessDate: '2026-08-18',
      createdAt: '2026-08-18T06:00:00.000Z'
    };
    const usage = groupMaterialUsage([batch, { ...batch, id: 'b2' }]);
    expect(usage).toHaveLength(1);
    expect(usage[0].quantity).toBe(10);
    expect(usage[0].costTetri).toBe(1500);
    expect(usage[0].bakers['ნიკა']).toBe(10);
  });
});
