/**
 * შესყიდვები / მარაგის შემოსვლა — ერთი ატომური ტრანზაქცია:
 * დოკუმენტი + პარტიები + ნაშთები + მოძრაობები + მომწოდებლის დავალიანება + audit.
 */
import { runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { businessDateOf } from '../lib/dates';
import { assertPermission } from '../lib/permissions';
import type { AppSettings, AppUser, PaymentMethod, Purchase, PurchaseItem, StockLocation, Supplier, ItemType } from '../types';
import { COL, buildDocNo, clean, docRef, newId, readCounters } from './db';
import { logAuditTx } from './audit';
import { StockOperation } from './inventory';
import { assertDayOpenTx } from './businessDays';

export interface PurchaseItemInput {
  itemType: ItemType;
  itemId: string;
  itemName: string;
  itemCode: string;
  unitSymbol: string;
  quantity: number;
  unitCostTetri: number;
  location: StockLocation;
}

export interface PurchaseInput {
  supplierId: string;
  supplierName: string;
  date?: string;
  items: PurchaseItemInput[];
  paidTetri: number;
  paymentMethod: PaymentMethod;
  comment?: string;
}

export async function createPurchase(
  user: AppUser,
  settings: AppSettings,
  input: PurchaseInput
): Promise<Purchase> {
  assertPermission(user, 'purchase.create');
  if (!input.supplierId) throw new Error('აირჩიეთ მომწოდებელი');
  if (!input.items.length) throw new Error('დაამატეთ მინიმუმ ერთი პოზიცია');
  for (const it of input.items) {
    if (it.quantity <= 0) throw new Error(`${it.itemName}: რაოდენობა უნდა იყოს 0-ზე მეტი`);
    if (it.unitCostTetri < 0) throw new Error(`${it.itemName}: ფასი არ შეიძლება იყოს უარყოფითი`);
  }

  const date = input.date ?? new Date().toISOString();
  const businessDate = businessDateOf(date);
  const purchaseId = newId('pur');

  const items: PurchaseItem[] = input.items.map((it) => ({
    id: newId('pi'),
    itemType: it.itemType,
    itemId: it.itemId,
    itemName: it.itemName,
    itemCode: it.itemCode,
    unitSymbol: it.unitSymbol,
    quantity: it.quantity,
    unitCostTetri: Math.round(it.unitCostTetri),
    totalCostTetri: Math.round(it.unitCostTetri * it.quantity),
    location: it.location
  }));

  const totalTetri = items.reduce((s, i) => s + i.totalCostTetri, 0);
  const paidTetri = Math.max(0, Math.round(input.paidTetri));
  const balanceTetri = totalTetri - paidTetri;

  const op = new StockOperation({
    user,
    referenceType: 'purchase',
    referenceId: purchaseId,
    date,
    allowNegativeStock: settings.allowNegativeStock
  });
  items.forEach((it) =>
    op.receive({
      itemType: it.itemType,
      itemId: it.itemId,
      itemName: it.itemName,
      unitSymbol: it.unitSymbol,
      location: it.location,
      quantity: it.quantity,
      totalCostTetri: it.totalCostTetri,
      movementType: 'PURCHASE',
      sourceType: 'PURCHASE',
      supplierId: input.supplierId
    })
  );
  await op.prepare();

  return runTransaction(db, async (tx) => {
    // ---- reads ----
    await assertDayOpenTx(tx, businessDate, settings.requireOpenBusinessDay);
    const counters = await readCounters(tx);
    const supplierSnap = await tx.get(docRef(COL.suppliers, input.supplierId));
    if (!supplierSnap.exists()) throw new Error('მომწოდებელი ვერ მოიძებნა');
    const supplier = supplierSnap.data() as Supplier;
    await op.read(tx);

    // ---- plan ----
    const { no, counters: nextCounters } = buildDocNo(counters, 'purchase');
    op.plan();

    const purchase: Purchase = clean({
      id: purchaseId,
      documentNo: no,
      supplierId: supplier.id,
      supplierName: supplier.name,
      date,
      businessDate,
      items,
      totalTetri,
      paidTetri,
      balanceTetri,
      paymentMethod: input.paymentMethod,
      comment: input.comment,
      status: 'completed',
      createdBy: user.id,
      createdByName: `${user.firstName} ${user.lastName}`.trim(),
      createdAt: new Date().toISOString()
    }) as Purchase;

    // ---- writes ----
    op.write(tx);
    tx.set(docRef(COL.purchases, purchase.id), purchase);
    tx.set(docRef(COL.suppliers, supplier.id), { balanceTetri: supplier.balanceTetri + balanceTetri, updatedAt: date }, { merge: true });
    tx.set(docRef(COL.meta, 'counters'), nextCounters);
    logAuditTx(tx, user, {
      action: 'PURCHASE_CREATED',
      entityType: 'purchase',
      entityId: purchase.id,
      summary: `შესყიდვა ${no}: ${supplier.name} — ${items.length} პოზიცია`,
      after: purchase
    });

    return purchase;
  });
}

/** მომწოდებლისთვის თანხის გადახდა (დავალიანების დაფარვა). */
export async function paySupplier(user: AppUser, supplierId: string, amountTetri: number, comment?: string): Promise<void> {
  assertPermission(user, 'supplier.manage');
  if (amountTetri <= 0) throw new Error('თანხა უნდა იყოს 0-ზე მეტი');
  await runTransaction(db, async (tx) => {
    const ref = docRef(COL.suppliers, supplierId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('მომწოდებელი ვერ მოიძებნა');
    const supplier = snap.data() as Supplier;
    tx.set(ref, { balanceTetri: supplier.balanceTetri - Math.round(amountTetri), updatedAt: new Date().toISOString() }, { merge: true });
    logAuditTx(tx, user, {
      action: 'SUPPLIER_PAYMENT',
      entityType: 'supplier',
      entityId: supplierId,
      summary: `მომწოდებელს გადაერიცხა: ${supplier.name}`,
      before: { balanceTetri: supplier.balanceTetri },
      after: { balanceTetri: supplier.balanceTetri - Math.round(amountTetri) },
      reason: comment
    });
  });
}
