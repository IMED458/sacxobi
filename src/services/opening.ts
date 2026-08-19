/**
 * საწყისი მდგომარეობა და მარაგის პირდაპირი კორექტირება.
 *
 * პროგრამაზე გადმოსვლისას საჭიროა არსებული რეალობის შეტანა: ხელთ არსებული
 * თანხა, მომწოდებლებთან დაგროვილი ვალი და საწყობში/მაცივარში/სართულებზე
 * არსებული ნაშთები. ყველა ჩანაწერი ჩვეულებრივ მოძრაობად და Audit-ად ჯდება —
 * ე.ი. მოგვიანებით ყოველთვის ჩანს, საიდან გაჩნდა ესა თუ ის ნაშთი.
 */
import { deleteDoc, getDocs, query, runTransaction, setDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { roundQty } from '../lib/money';
import { assertPermission } from '../lib/permissions';
import type { AppSettings, AppUser, InventoryLot, ItemType, StockLocation, Supplier } from '../types';
import { COL, clean, colRef, docRef, newId } from './db';
import { logAudit, logAuditTx } from './audit';
import { StockOperation, stockKey } from './inventory';
import { addCashMovement } from './shifts';

/* ------------------------------------------------------------------ */
/* საწყისი თანხა (სალარო / ბრუნვა)                                     */
/* ------------------------------------------------------------------ */

export async function setOpeningCash(user: AppUser, amountTetri: number, comment?: string): Promise<void> {
  assertPermission(user, 'cash.access');
  if (amountTetri <= 0) throw new Error('თანხა უნდა იყოს 0-ზე მეტი');
  await addCashMovement(user, 'CASH_IN', amountTetri, comment?.trim() || 'საწყისი ნაშთი (პროგრამაზე გადმოსვლა)');
}

/* ------------------------------------------------------------------ */
/* მომწოდებლის საწყისი ვალი                                            */
/* ------------------------------------------------------------------ */

export async function setSupplierOpeningBalance(
  user: AppUser,
  supplier: Supplier,
  balanceTetri: number,
  comment?: string
): Promise<void> {
  assertPermission(user, 'supplier.manage');
  if (balanceTetri < 0) throw new Error('ვალი არ შეიძლება იყოს უარყოფითი');
  await setDoc(
    docRef(COL.suppliers, supplier.id),
    { balanceTetri: Math.round(balanceTetri), updatedAt: new Date().toISOString() },
    { merge: true }
  );
  await logAudit(user, {
    action: 'SUPPLIER_OPENING_BALANCE',
    entityType: 'supplier',
    entityId: supplier.id,
    summary: `${supplier.name}: ვალი დაყენდა ${(Math.round(balanceTetri) / 100).toFixed(2)} ₾-ზე`,
    before: { balanceTetri: supplier.balanceTetri },
    after: { balanceTetri: Math.round(balanceTetri) },
    reason: comment
  });
}

/* ------------------------------------------------------------------ */
/* მარაგის დაყენება / რედაქტირება                                      */
/* ------------------------------------------------------------------ */

export interface StockSetInput {
  itemType: ItemType;
  itemId: string;
  itemName: string;
  unitSymbol: string;
  location: StockLocation;
  /** სასურველი (ფაქტობრივი) რაოდენობა. */
  targetQuantity: number;
  /** ერთეულის ღირებულება — ახალი ნაშთის დამატებისას. */
  unitCostTetri: number;
  currentQuantity: number;
  reason: string;
  /** true — საწყისი ნაშთის შეტანა (INITIAL_STOCK), false — კორექტირება. */
  initial?: boolean;
}

/**
 * ნაშთის პირდაპირი დაყენება მითითებულ რიცხვზე.
 * ზრდა → ახალი პარტია მითითებული ფასით; კლება → FIFO ჩამოწერა.
 */
export async function setStockQuantity(user: AppUser, settings: AppSettings, input: StockSetInput): Promise<void> {
  assertPermission(user, 'inventory.adjust');
  if (!input.reason.trim()) throw new Error('მიუთითეთ საფუძველი');
  if (input.targetQuantity < 0) throw new Error('რაოდენობა არ შეიძლება იყოს უარყოფითი');

  const delta = roundQty(input.targetQuantity - input.currentQuantity);
  if (delta === 0) throw new Error('რაოდენობა არ შეცვლილა');

  const date = new Date().toISOString();
  const referenceId = newId('adj');
  const op = new StockOperation({
    user,
    referenceType: input.initial ? 'opening_stock' : 'stock_edit',
    referenceId,
    date,
    allowNegativeStock: settings.allowNegativeStock
  });

  if (delta > 0) {
    op.receive({
      itemType: input.itemType,
      itemId: input.itemId,
      itemName: input.itemName,
      unitSymbol: input.unitSymbol,
      location: input.location,
      quantity: delta,
      totalCostTetri: Math.round(input.unitCostTetri * delta),
      movementType: input.initial ? 'INITIAL_STOCK' : 'ADJUSTMENT',
      sourceType: input.initial ? 'INITIAL' : 'ADJUSTMENT',
      reason: input.reason.trim()
    });
  } else {
    op.consume({
      itemType: input.itemType,
      itemId: input.itemId,
      itemName: input.itemName,
      unitSymbol: input.unitSymbol,
      location: input.location,
      quantity: Math.abs(delta),
      movementType: 'ADJUSTMENT',
      reason: input.reason.trim()
    });
  }

  await op.prepare();

  await runTransaction(db, async (tx) => {
    await op.read(tx);
    op.plan();
    op.write(tx);
    logAuditTx(tx, user, {
      action: input.initial ? 'OPENING_STOCK_SET' : 'STOCK_EDITED',
      entityType: 'stock',
      entityId: stockKey(input.itemType, input.itemId, input.location),
      summary: `${input.itemName} (${input.location}): ${input.currentQuantity} → ${input.targetQuantity} ${input.unitSymbol}`,
      before: { quantity: input.currentQuantity },
      after: { quantity: input.targetQuantity, unitCostTetri: input.unitCostTetri },
      reason: input.reason.trim()
    });
  });
}

/** საწყისი ნაშთების ჯგუფური შეტანა. */
export async function setOpeningStockBatch(
  user: AppUser,
  settings: AppSettings,
  lines: StockSetInput[]
): Promise<number> {
  let done = 0;
  for (const line of lines) {
    if (roundQty(line.targetQuantity - line.currentQuantity) === 0) continue;
    await setStockQuantity(user, settings, { ...line, initial: true });
    done += 1;
  }
  if (!done) throw new Error('შესატანი ცვლილება ვერ მოიძებნა');
  return done;
}

/* ------------------------------------------------------------------ */
/* ნაშთის ჩანაწერის სრული წაშლა                                        */
/* ------------------------------------------------------------------ */

/**
 * წაშლის აგრეგირებულ ნაშთსა და მის ღია პარტიებს.
 * მოძრაობების ისტორია რჩება — ის ცალკე იშლება.
 */
export async function deleteStockRecord(
  user: AppUser,
  target: { itemType: ItemType; itemId: string; itemName: string; location: StockLocation },
  reason: string
): Promise<void> {
  assertPermission(user, 'admin.delete');
  if (!reason.trim()) throw new Error('მიუთითეთ წაშლის მიზეზი');

  const key = stockKey(target.itemType, target.itemId, target.location);
  const lotsSnap = await getDocs(query(colRef(COL.lots), where('key', '==', key)));
  const lots = lotsSnap.docs.map((d) => d.data() as InventoryLot);

  await Promise.all(lots.map((l) => deleteDoc(docRef(COL.lots, l.id))));
  await deleteDoc(docRef(COL.stockLevels, key));

  await logAudit(user, {
    action: 'STOCK_RECORD_DELETED',
    entityType: 'stock',
    entityId: key,
    summary: `წაიშალა ნაშთის ჩანაწერი: ${target.itemName} (${target.location}) — ${lots.length} პარტია`,
    before: clean({ lots: lots.map((l) => ({ id: l.id, quantityRemaining: l.quantityRemaining, totalCostTetri: l.totalCostTetri })) }),
    reason: reason.trim()
  });
}
