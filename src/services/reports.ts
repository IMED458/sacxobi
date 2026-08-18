/**
 * რეპორტები და ფინანსური აგრეგაცია.
 *
 * მოგება ითვლება სწორად:
 *   Net Sales    = Gross Sales − ფასდაკლებები − დაბრუნებები
 *   COGS         = გაყიდული მზა პროდუქციის რეალური საწარმოო თვითღირებულება
 *   Gross Profit = Net Sales − COGS
 *   Net Profit   = Gross Profit − საოპერაციო ხარჯები
 * შესყიდვები ცალკე ჩანს (Cash Flow / მარაგში ინვესტიცია) და პირდაპირ
 * მოგებას არ აკლდება.
 */
import { getDocs, orderBy, query, where, limit as fsLimit } from 'firebase/firestore';
import type {
  CashMovement,
  CashierShift,
  DaySummary,
  Expense,
  ProductionBatch,
  Purchase,
  Sale,
  SaleReturn,
  StockLevel,
  StockMovement
} from '../types';
import { COL, colRef } from './db';
import { calcExpectedCash } from './shifts';

async function rangeQuery<T>(name: string, from: string, to: string): Promise<T[]> {
  const snap = await getDocs(
    query(colRef(name), where('businessDate', '>=', from), where('businessDate', '<=', to))
  );
  return snap.docs.map((d) => d.data() as T);
}

export const fetchSalesRange = (from: string, to: string) => rangeQuery<Sale>(COL.sales, from, to);
export const fetchReturnsRange = (from: string, to: string) => rangeQuery<SaleReturn>(COL.returns, from, to);
export const fetchExpensesRange = (from: string, to: string) => rangeQuery<Expense>(COL.expenses, from, to);
export const fetchPurchasesRange = (from: string, to: string) => rangeQuery<Purchase>(COL.purchases, from, to);
export const fetchProductionRange = (from: string, to: string) =>
  rangeQuery<ProductionBatch>(COL.productionBatches, from, to);
export const fetchMovementsRange = (from: string, to: string) =>
  rangeQuery<StockMovement>(COL.stockMovements, from, to);
export const fetchShiftsRange = (from: string, to: string) => rangeQuery<CashierShift>(COL.shifts, from, to);
export const fetchCashMovementsRange = (from: string, to: string) =>
  rangeQuery<CashMovement>(COL.cashMovements, from, to);

export async function fetchStockLevels(): Promise<StockLevel[]> {
  const snap = await getDocs(colRef(COL.stockLevels));
  return snap.docs.map((d) => d.data() as StockLevel);
}

export async function fetchRecentMovements(max = 100): Promise<StockMovement[]> {
  const snap = await getDocs(query(colRef(COL.stockMovements), orderBy('seq', 'desc'), fsLimit(max)));
  return snap.docs.map((d) => d.data() as StockMovement);
}

/* ------------------------------------------------------------------ */
/* სუფთა (იტესტებადი) გამოთვლები                                       */
/* ------------------------------------------------------------------ */

export interface ProfitInput {
  sales: Sale[];
  returns: SaleReturn[];
  expenses: Expense[];
}

export interface ProfitResult {
  salesCount: number;
  soldUnits: number;
  grossSalesTetri: number;
  discountsTetri: number;
  returnsTetri: number;
  netSalesTetri: number;
  cogsTetri: number;
  grossProfitTetri: number;
  expensesTetri: number;
  netProfitTetri: number;
  cashTetri: number;
  cardTetri: number;
  transferTetri: number;
  debtTetri: number;
}

export function computeProfit({ sales, returns, expenses }: ProfitInput): ProfitResult {
  const active = sales.filter((s) => s.status !== 'cancelled');
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

  const grossSalesTetri = sum(active.map((s) => s.subtotalTetri));
  const discountsTetri = sum(active.map((s) => s.discountTetri));
  const returnsTetri = sum(returns.map((r) => r.totalRefundTetri));
  const returnedCostTetri = sum(returns.map((r) => r.totalCostTetri));
  const soldCostTetri = sum(active.map((s) => s.costTotalTetri));

  const netSalesTetri = grossSalesTetri - discountsTetri - returnsTetri;
  const cogsTetri = soldCostTetri - returnedCostTetri;
  const grossProfitTetri = netSalesTetri - cogsTetri;
  const expensesTetri = sum(expenses.map((e) => e.amountTetri));

  const byMethod = (m: Sale['paymentMethod']) =>
    sum(active.filter((s) => s.paymentMethod === m).map((s) => s.grandTotalTetri));

  return {
    salesCount: active.length,
    soldUnits: sum(active.flatMap((s) => s.items.map((i) => i.quantity))),
    grossSalesTetri,
    discountsTetri,
    returnsTetri,
    netSalesTetri,
    cogsTetri,
    grossProfitTetri,
    expensesTetri,
    netProfitTetri: grossProfitTetri - expensesTetri,
    cashTetri: byMethod('CASH'),
    cardTetri: byMethod('CARD'),
    transferTetri: byMethod('BANK_TRANSFER'),
    debtTetri: byMethod('DEBT')
  };
}

export interface DaySummaryInput extends ProfitInput {
  purchases: Purchase[];
  production: ProductionBatch[];
  shifts: CashierShift[];
  cashMovements: CashMovement[];
}

export function buildDaySummary(input: DaySummaryInput): DaySummary {
  const profit = computeProfit(input);
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

  const cashExpensesTetri = sum(input.expenses.filter((e) => e.paymentMethod === 'CASH').map((e) => e.amountTetri));
  const cashRefundsTetri = sum(input.returns.filter((r) => r.paymentMethod === 'CASH').map((r) => r.totalRefundTetri));
  const cashInTetri = sum(input.cashMovements.filter((c) => c.type === 'CASH_IN').map((c) => c.amountTetri));
  const cashOutTetri = sum(input.cashMovements.filter((c) => c.type === 'CASH_OUT').map((c) => c.amountTetri));
  const openingCashTetri = sum(input.shifts.map((s) => s.openingCashTetri));

  const expectedCashTetri = calcExpectedCash(openingCashTetri, {
    salesCount: profit.salesCount,
    salesTotalTetri: profit.grossSalesTetri,
    cashSalesTetri: profit.cashTetri,
    cardSalesTetri: profit.cardTetri,
    transferSalesTetri: profit.transferTetri,
    debtSalesTetri: profit.debtTetri,
    cashRefundsTetri,
    cashExpensesTetri,
    cashInTetri,
    cashOutTetri
  });

  const actualCashTetri = sum(
    input.shifts.filter((s) => s.status === 'closed').map((s) => s.actualClosingCashTetri ?? 0)
  );

  return {
    ...profit,
    purchasesTetri: sum(input.purchases.filter((p) => p.status === 'completed').map((p) => p.totalTetri)),
    productionBatches: input.production.length,
    producedUnits: sum(input.production.map((p) => p.producedGoodQty)),
    wasteUnits: sum(input.production.map((p) => p.wasteQty)),
    materialCostTetri: sum(input.production.map((p) => p.totalMaterialCostTetri)),
    expectedCashTetri,
    actualCashTetri,
    cashDifferenceTetri: actualCashTetri - expectedCashTetri
  };
}

export async function computeDaySummary(businessDate: string): Promise<DaySummary> {
  const [sales, returns, expenses, purchases, production, shifts, cashMovements] = await Promise.all([
    fetchSalesRange(businessDate, businessDate),
    fetchReturnsRange(businessDate, businessDate),
    fetchExpensesRange(businessDate, businessDate),
    fetchPurchasesRange(businessDate, businessDate),
    fetchProductionRange(businessDate, businessDate),
    fetchShiftsRange(businessDate, businessDate),
    fetchCashMovementsRange(businessDate, businessDate)
  ]);
  return buildDaySummary({ sales, returns, expenses, purchases, production, shifts, cashMovements });
}

export async function computeRangeReport(from: string, to: string) {
  const [sales, returns, expenses, purchases, production, movements] = await Promise.all([
    fetchSalesRange(from, to),
    fetchReturnsRange(from, to),
    fetchExpensesRange(from, to),
    fetchPurchasesRange(from, to),
    fetchProductionRange(from, to),
    fetchMovementsRange(from, to)
  ]);
  return { sales, returns, expenses, purchases, production, movements, profit: computeProfit({ sales, returns, expenses }) };
}

/* -------------------------- დაჯგუფებები ------------------------------ */

export interface Grouped {
  key: string;
  label: string;
  quantity: number;
  revenueTetri: number;
  costTetri: number;
  profitTetri: number;
  count: number;
}

export function groupSales(sales: Sale[], by: 'product' | 'cashier' | 'receiver' | 'payment'): Grouped[] {
  const map = new Map<string, Grouped>();
  const active = sales.filter((s) => s.status !== 'cancelled');

  const push = (key: string, label: string, quantity: number, revenue: number, cost: number, countOnce: boolean) => {
    const cur = map.get(key) ?? { key, label, quantity: 0, revenueTetri: 0, costTetri: 0, profitTetri: 0, count: 0 };
    cur.quantity += quantity;
    cur.revenueTetri += revenue;
    cur.costTetri += cost;
    cur.profitTetri = cur.revenueTetri - cur.costTetri;
    if (countOnce) cur.count += 1;
    map.set(key, cur);
  };

  if (by === 'product') {
    active.forEach((s) =>
      s.items.forEach((i) => push(i.productId, i.productName, i.quantity, i.lineTotalTetri, i.costTotalTetri, true))
    );
  } else if (by === 'cashier') {
    active.forEach((s) =>
      push(s.soldByUserId, s.soldByName, s.items.reduce((a, i) => a + i.quantity, 0), s.grandTotalTetri, s.costTotalTetri, true)
    );
  } else if (by === 'receiver') {
    active.forEach((s) =>
      push(s.receivedByName || '—', s.receivedByName || '—', s.items.reduce((a, i) => a + i.quantity, 0), s.grandTotalTetri, s.costTotalTetri, true)
    );
  } else {
    const labels: Record<string, string> = {
      CASH: 'ნაღდი',
      CARD: 'ბარათი',
      BANK_TRANSFER: 'გადარიცხვა',
      DEBT: 'დავალიანება'
    };
    active.forEach((s) =>
      push(s.paymentMethod, labels[s.paymentMethod] ?? s.paymentMethod, s.items.reduce((a, i) => a + i.quantity, 0), s.grandTotalTetri, s.costTotalTetri, true)
    );
  }

  return [...map.values()].sort((a, b) => b.revenueTetri - a.revenueTetri);
}

export interface MaterialUsage {
  materialId: string;
  materialName: string;
  unitSymbol: string;
  quantity: number;
  costTetri: number;
  products: Record<string, number>;
  bakers: Record<string, number>;
  floors: Record<string, number>;
}

export function groupMaterialUsage(batches: ProductionBatch[]): MaterialUsage[] {
  const map = new Map<string, MaterialUsage>();
  batches.forEach((b) => {
    b.consumptions.forEach((c) => {
      const cur =
        map.get(c.materialId) ??
        ({
          materialId: c.materialId,
          materialName: c.materialName,
          unitSymbol: c.unitSymbol,
          quantity: 0,
          costTetri: 0,
          products: {},
          bakers: {},
          floors: {}
        } as MaterialUsage);
      cur.quantity += c.quantity;
      cur.costTetri += c.costTetri;
      cur.products[b.productName] = (cur.products[b.productName] ?? 0) + c.quantity;
      cur.bakers[b.bakerName] = (cur.bakers[b.bakerName] ?? 0) + c.quantity;
      cur.floors[b.floor] = (cur.floors[b.floor] ?? 0) + c.quantity;
      map.set(c.materialId, cur);
    });
  });
  return [...map.values()].sort((a, b) => b.costTetri - a.costTetri);
}
