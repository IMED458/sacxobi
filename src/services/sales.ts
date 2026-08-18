/**
 * გაყიდვები (POS), გაუქმება და დაბრუნება.
 *
 * COGS ითვლება მზა პროდუქტის FIFO პარტიებიდან (თითოეული ცხობის რეალური
 * თვითღირებულებით) და ინახება გაყიდვაზე snapshot-ად, ამიტომ მოგვიანებით
 * ინგრედიენტის ფასის ცვლილება ძველ მოგებას აღარ ცვლის.
 */
import { getDoc, getDocs, query, runTransaction, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { businessDateOf } from '../lib/dates';
import { roundQty } from '../lib/money';
import { assertPermission } from '../lib/permissions';
import type {
  AppSettings,
  AppUser,
  CashierShift,
  FinishedProduct,
  PaymentMethod,
  ReturnItem,
  Sale,
  SaleItem,
  SaleReturn
} from '../types';
import { COL, buildDocNo, clean, colRef, docRef, newId, readCounters } from './db';
import { logAuditTx } from './audit';
import { StockOperation } from './inventory';
import { assertDayOpenTx } from './businessDays';

export interface CartLine {
  product: FinishedProduct;
  quantity: number;
  /** ფაქტობრივი გასაყიდი ფასი თეთრში (default = პროდუქტის ფასი). */
  priceTetri: number;
}

export interface SaleInput {
  lines: CartLine[];
  discountTetri: number;
  paymentMethod: PaymentMethod;
  paidTetri: number;
  receivedByName: string;
  receivedByPhone?: string;
  comment?: string;
  shiftId?: string;
  date?: string;
}

export function computeSaleTotals(lines: CartLine[], discountTetri: number) {
  const subtotalTetri = lines.reduce((s, l) => s + Math.round(l.priceTetri * l.quantity), 0);
  const grandTotalTetri = Math.max(0, subtotalTetri - Math.round(discountTetri || 0));
  return { subtotalTetri, grandTotalTetri };
}

export async function createSale(user: AppUser, settings: AppSettings, input: SaleInput): Promise<Sale> {
  assertPermission(user, 'sale.create');
  if (!input.lines.length) throw new Error('კალათა ცარიელია');
  if (input.lines.some((l) => l.quantity <= 0)) throw new Error('რაოდენობა უნდა იყოს 0-ზე მეტი');
  if (input.lines.some((l) => l.priceTetri < 0)) throw new Error('ფასი არ შეიძლება იყოს უარყოფითი');
  if (!settings.allowAnonymousSale && !input.receivedByName.trim()) {
    throw new Error('მიუთითეთ ვინ ჩაიბარებს პროდუქციას');
  }
  if (settings.requireShiftForSale && !input.shiftId) {
    throw new Error('გაყიდვამდე გახსენით ცვლა');
  }

  const date = input.date ?? new Date().toISOString();
  const businessDate = businessDateOf(date);
  const saleId = newId('sal');

  const op = new StockOperation({
    user,
    referenceType: 'sale',
    referenceId: saleId,
    date,
    allowNegativeStock: settings.allowNegativeStock
  });
  input.lines.forEach((l) =>
    op.consume({
      itemType: 'PRODUCT',
      itemId: l.product.id,
      itemName: l.product.name,
      unitSymbol: l.product.unitSymbol,
      location: l.product.salesLocation,
      quantity: l.quantity,
      movementType: 'SALE'
    })
  );
  await op.prepare();

  return runTransaction(db, async (tx) => {
    // ---- reads ----
    await assertDayOpenTx(tx, businessDate, settings.requireOpenBusinessDay);
    const counters = await readCounters(tx);
    if (input.shiftId) {
      const shiftSnap = await tx.get(docRef(COL.shifts, input.shiftId));
      if (!shiftSnap.exists()) throw new Error('ცვლა ვერ მოიძებნა');
      if ((shiftSnap.data() as CashierShift).status !== 'open') throw new Error('ცვლა დახურულია');
    }
    await op.read(tx);

    // ---- plan ----
    const outcomes = op.plan();
    const items: SaleItem[] = input.lines.map((l, idx) => {
      const lineTotalTetri = Math.round(l.priceTetri * l.quantity);
      const costTotalTetri = outcomes[idx].costTetri;
      return {
        id: newId('si'),
        productId: l.product.id,
        productName: l.product.name,
        productCode: l.product.code,
        unitSymbol: l.product.unitSymbol,
        quantity: roundQty(l.quantity),
        sellingPriceTetri: Math.round(l.priceTetri),
        listPriceTetri: l.product.sellingPriceTetri,
        lineTotalTetri,
        costTotalTetri,
        profitTetri: lineTotalTetri - costTotalTetri,
        location: l.product.salesLocation
      };
    });

    const { subtotalTetri, grandTotalTetri } = computeSaleTotals(input.lines, input.discountTetri);
    const costTotalTetri = items.reduce((s, i) => s + i.costTotalTetri, 0);
    const discountTetri = Math.round(input.discountTetri || 0);
    const paidTetri = input.paymentMethod === 'DEBT' ? Math.round(input.paidTetri || 0) : grandTotalTetri;
    const { no, counters: nextCounters } = buildDocNo(counters, 'sale');

    const sale: Sale = clean({
      id: saleId,
      saleNo: no,
      date,
      businessDate,
      shiftId: input.shiftId,
      soldByUserId: user.id,
      soldByName: `${user.firstName} ${user.lastName}`.trim(),
      receivedByName: input.receivedByName.trim() || 'ანონიმური',
      receivedByPhone: input.receivedByPhone,
      comment: input.comment,
      items,
      subtotalTetri,
      discountTetri,
      grandTotalTetri,
      costTotalTetri,
      grossProfitTetri: grandTotalTetri - costTotalTetri,
      paymentMethod: input.paymentMethod,
      paidTetri,
      balanceDueTetri: grandTotalTetri - paidTetri,
      status: 'active',
      createdAt: new Date().toISOString()
    }) as Sale;

    // ---- writes ----
    op.write(tx);
    tx.set(docRef(COL.sales, sale.id), sale);
    tx.set(docRef(COL.meta, 'counters'), nextCounters);
    logAuditTx(tx, user, {
      action: 'SALE_CREATED',
      entityType: 'sale',
      entityId: sale.id,
      summary: `გაყიდვა ${no}: ${items.length} პოზიცია — ჩაიბარა ${sale.receivedByName}`,
      after: sale
    });

    return sale;
  });
}

/* ------------------------------------------------------------------ */
/* გაუქმება                                                            */
/* ------------------------------------------------------------------ */

export async function cancelSale(
  user: AppUser,
  settings: AppSettings,
  saleId: string,
  reason: string,
  restock: boolean
): Promise<void> {
  assertPermission(user, 'sale.cancel');
  if (!reason.trim()) throw new Error('მიუთითეთ გაუქმების მიზეზი');

  const head = await getDoc(docRef(COL.sales, saleId));
  if (!head.exists()) throw new Error('გაყიდვა ვერ მოიძებნა');
  const original = head.data() as Sale;
  if (original.status !== 'active') throw new Error('გაყიდვა უკვე გაუქმებული/დაბრუნებულია');

  const date = new Date().toISOString();
  const op = new StockOperation({
    user,
    referenceType: 'sale_cancel',
    referenceId: saleId,
    referenceNo: original.saleNo,
    date,
    allowNegativeStock: settings.allowNegativeStock
  });
  if (restock) {
    original.items.forEach((it) =>
      op.receive({
        itemType: 'PRODUCT',
        itemId: it.productId,
        itemName: it.productName,
        unitSymbol: it.unitSymbol,
        location: it.location,
        quantity: it.quantity,
        totalCostTetri: it.costTotalTetri,
        movementType: 'RETURN',
        sourceType: 'RETURN',
        reason: reason.trim()
      })
    );
  }

  await runTransaction(db, async (tx) => {
    const ref = docRef(COL.sales, saleId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('გაყიდვა ვერ მოიძებნა');
    const sale = snap.data() as Sale;
    if (sale.status !== 'active') throw new Error('გაყიდვა უკვე გაუქმებული/დაბრუნებულია');
    if (op.hasWork()) await op.read(tx);
    if (op.hasWork()) op.plan();
    if (op.hasWork()) op.write(tx);

    tx.set(
      ref,
      { status: 'cancelled', cancelReason: reason.trim(), cancelledBy: user.id, cancelledAt: date },
      { merge: true }
    );
    logAuditTx(tx, user, {
      action: 'SALE_CANCELLED',
      entityType: 'sale',
      entityId: saleId,
      summary: `გაყიდვა ${sale.saleNo} გაუქმდა${restock ? ' (მარაგში დაბრუნებით)' : ' (ჩამოიწერა)'}`,
      before: { status: sale.status },
      after: { status: 'cancelled' },
      reason: reason.trim()
    });
  });
}

/* ------------------------------------------------------------------ */
/* დაბრუნება                                                           */
/* ------------------------------------------------------------------ */

export interface ReturnLineInput {
  saleItemId: string;
  quantity: number;
  disposition: 'RESTOCK' | 'WASTE';
}

export async function createReturn(
  user: AppUser,
  settings: AppSettings,
  saleId: string,
  lines: ReturnLineInput[],
  reason: string,
  paymentMethod: PaymentMethod
): Promise<SaleReturn> {
  assertPermission(user, 'sale.return');
  if (!reason.trim()) throw new Error('მიუთითეთ დაბრუნების მიზეზი');
  const active = lines.filter((l) => l.quantity > 0);
  if (!active.length) throw new Error('მიუთითეთ დასაბრუნებელი რაოდენობა');

  const head = await getDoc(docRef(COL.sales, saleId));
  if (!head.exists()) throw new Error('გაყიდვა ვერ მოიძებნა');
  const original = head.data() as Sale;
  if (original.status === 'cancelled') throw new Error('გაუქმებულ გაყიდვაზე დაბრუნება შეუძლებელია');

  // უკვე დაბრუნებული რაოდენობები
  const prevSnap = await getDocs(query(colRef(COL.returns), where('saleId', '==', saleId)));
  const returnedSoFar = new Map<string, number>();
  prevSnap.docs.forEach((d) => {
    (d.data() as SaleReturn).items.forEach((i) => {
      returnedSoFar.set(i.saleItemId, roundQty((returnedSoFar.get(i.saleItemId) ?? 0) + i.quantity));
    });
  });

  const date = new Date().toISOString();
  const businessDate = businessDateOf(date);
  const returnId = newId('ret');

  const items: ReturnItem[] = [];
  const op = new StockOperation({
    user,
    referenceType: 'return',
    referenceId: returnId,
    date,
    allowNegativeStock: settings.allowNegativeStock
  });

  for (const line of active) {
    const item = original.items.find((i) => i.id === line.saleItemId);
    if (!item) throw new Error('პოზიცია ვერ მოიძებნა');
    const already = returnedSoFar.get(item.id) ?? 0;
    const maxQty = roundQty(item.quantity - already);
    if (roundQty(line.quantity) > maxQty) {
      throw new Error(`${item.productName}: დასაბრუნებლად ხელმისაწვდომია მხოლოდ ${maxQty} ${item.unitSymbol}`);
    }
    const unitPriceTetri = item.sellingPriceTetri;
    const unitCostTetri = item.quantity ? Math.round(item.costTotalTetri / item.quantity) : 0;
    const refundTetri = Math.round(unitPriceTetri * line.quantity);
    const costTetri = Math.round(unitCostTetri * line.quantity);

    items.push({
      saleItemId: item.id,
      productId: item.productId,
      productName: item.productName,
      unitSymbol: item.unitSymbol,
      quantity: roundQty(line.quantity),
      unitPriceTetri,
      refundTetri,
      unitCostTetri,
      costTetri,
      disposition: line.disposition
    });

    if (line.disposition === 'RESTOCK') {
      op.receive({
        itemType: 'PRODUCT',
        itemId: item.productId,
        itemName: item.productName,
        unitSymbol: item.unitSymbol,
        location: item.location,
        quantity: line.quantity,
        totalCostTetri: costTetri,
        movementType: 'RETURN',
        sourceType: 'RETURN',
        reason: reason.trim()
      });
    }
  }

  const totalRefundTetri = items.reduce((s, i) => s + i.refundTetri, 0);
  const totalCostTetri = items.reduce((s, i) => s + i.costTetri, 0);

  return runTransaction(db, async (tx) => {
    // ---- reads ----
    await assertDayOpenTx(tx, businessDate, settings.requireOpenBusinessDay);
    const counters = await readCounters(tx);
    const saleRef = docRef(COL.sales, saleId);
    const saleSnap = await tx.get(saleRef);
    if (!saleSnap.exists()) throw new Error('გაყიდვა ვერ მოიძებნა');
    const sale = saleSnap.data() as Sale;
    if (op.hasWork()) await op.read(tx);

    // ---- plan ----
    if (op.hasWork()) op.plan();
    const { no, counters: nextCounters } = buildDocNo(counters, 'return');

    const doc: SaleReturn = clean({
      id: returnId,
      returnNo: no,
      saleId,
      saleNo: sale.saleNo,
      date,
      businessDate,
      items,
      totalRefundTetri,
      totalCostTetri,
      paymentMethod,
      reason: reason.trim(),
      createdBy: user.id,
      createdByName: `${user.firstName} ${user.lastName}`.trim(),
      createdAt: date
    }) as SaleReturn;

    const totalReturnedQty = new Map<string, number>(returnedSoFar);
    items.forEach((i) => totalReturnedQty.set(i.saleItemId, roundQty((totalReturnedQty.get(i.saleItemId) ?? 0) + i.quantity)));
    const fullyReturned = sale.items.every((i) => (totalReturnedQty.get(i.id) ?? 0) >= i.quantity - 0.0001);

    // ---- writes ----
    if (op.hasWork()) op.write(tx);
    tx.set(docRef(COL.returns, doc.id), doc);
    tx.set(saleRef, { status: fullyReturned ? 'returned' : 'partially_returned' }, { merge: true });
    tx.set(docRef(COL.meta, 'counters'), nextCounters);
    logAuditTx(tx, user, {
      action: 'SALE_RETURNED',
      entityType: 'return',
      entityId: doc.id,
      summary: `დაბრუნება ${no} (გაყიდვა ${sale.saleNo}) — ${items.length} პოზიცია`,
      after: doc,
      reason: reason.trim()
    });

    // waste-ად ჩამოწერილი პოზიციები
    items.filter((i) => i.disposition === 'WASTE').forEach((i) => {
      logAuditTx(tx, user, {
        action: 'RETURN_WASTE',
        entityType: 'return',
        entityId: doc.id,
        summary: `გაფუჭებულად ჩამოიწერა: ${i.productName} — ${i.quantity} ${i.unitSymbol}`,
        after: i
      });
    });

    return doc;
  });
}
