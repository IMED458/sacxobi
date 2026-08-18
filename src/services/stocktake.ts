/**
 * ინვენტარიზაცია / მარაგის კორექტირება.
 * მარაგი პირდაპირ არასდროს იცვლება — ყოველი განსხვავება ხდება
 * ADJUSTMENT მოძრაობით და პარტიების შესაბამისი კორექციით.
 */
import { runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { businessDateOf } from '../lib/dates';
import { roundQty, safeDiv } from '../lib/money';
import { assertPermission } from '../lib/permissions';
import type { AppSettings, AppUser, ItemType, StockLevel, StockLocation, Stocktake, StocktakeItem } from '../types';
import { COL, buildDocNo, clean, docRef, newId, readCounters } from './db';
import { logAuditTx } from './audit';
import { StockOperation } from './inventory';

export interface StocktakeLineInput {
  itemType: ItemType;
  itemId: string;
  itemName: string;
  unitSymbol: string;
  location: StockLocation;
  expectedQuantity: number;
  actualQuantity: number;
  /** არსებული ნაშთის ღირებულება — საშუალო ფასის დასათვლელად. */
  currentValueTetri: number;
}

export async function createStocktake(
  user: AppUser,
  settings: AppSettings,
  location: StockLocation,
  lines: StocktakeLineInput[],
  reason: string
): Promise<Stocktake> {
  assertPermission(user, 'inventory.adjust');
  const changed = lines.filter((l) => roundQty(l.actualQuantity) !== roundQty(l.expectedQuantity));
  if (!changed.length) throw new Error('განსხვავება ვერ მოიძებნა — კორექტირება საჭირო არ არის');
  if (!reason.trim()) throw new Error('მიუთითეთ ინვენტარიზაციის საფუძველი');
  if (lines.some((l) => l.actualQuantity < 0)) throw new Error('ფაქტობრივი რაოდენობა არ შეიძლება იყოს უარყოფითი');

  const date = new Date().toISOString();
  const businessDate = businessDateOf(date);
  const stocktakeId = newId('stk');

  const op = new StockOperation({
    user,
    referenceType: 'stocktake',
    referenceId: stocktakeId,
    date,
    allowNegativeStock: settings.allowNegativeStock
  });

  const items: StocktakeItem[] = [];
  for (const line of changed) {
    const diff = roundQty(line.actualQuantity - line.expectedQuantity);
    const avgUnitCost = Math.round(safeDiv(line.currentValueTetri, line.expectedQuantity || 1));
    items.push({
      itemType: line.itemType,
      itemId: line.itemId,
      itemName: line.itemName,
      unitSymbol: line.unitSymbol,
      location: line.location,
      expectedQuantity: roundQty(line.expectedQuantity),
      actualQuantity: roundQty(line.actualQuantity),
      diff,
      diffValueTetri: Math.round(avgUnitCost * diff)
    });

    if (diff < 0) {
      op.consume({
        itemType: line.itemType,
        itemId: line.itemId,
        itemName: line.itemName,
        unitSymbol: line.unitSymbol,
        location: line.location,
        quantity: Math.abs(diff),
        movementType: 'ADJUSTMENT',
        reason: reason.trim()
      });
    } else {
      op.receive({
        itemType: line.itemType,
        itemId: line.itemId,
        itemName: line.itemName,
        unitSymbol: line.unitSymbol,
        location: line.location,
        quantity: diff,
        totalCostTetri: Math.round(avgUnitCost * diff),
        movementType: 'ADJUSTMENT',
        sourceType: 'ADJUSTMENT',
        reason: reason.trim()
      });
    }
  }

  await op.prepare();

  return runTransaction(db, async (tx) => {
    const counters = await readCounters(tx);
    await op.read(tx);
    op.plan();
    const { no, counters: nextCounters } = buildDocNo(counters, 'stocktake');

    const stocktake: Stocktake = clean({
      id: stocktakeId,
      documentNo: no,
      date,
      businessDate,
      location,
      items,
      totalDiffValueTetri: items.reduce((s, i) => s + i.diffValueTetri, 0),
      status: 'completed',
      reason: reason.trim(),
      createdBy: user.id,
      createdByName: `${user.firstName} ${user.lastName}`.trim(),
      createdAt: date
    }) as Stocktake;

    op.write(tx);
    tx.set(docRef(COL.stocktakes, stocktake.id), stocktake);
    tx.set(docRef(COL.meta, 'counters'), nextCounters);
    logAuditTx(tx, user, {
      action: 'STOCK_ADJUSTED',
      entityType: 'stocktake',
      entityId: stocktake.id,
      summary: `ინვენტარიზაცია ${no}: ${items.length} პოზიცია (${location})`,
      after: stocktake,
      reason: reason.trim()
    });
    return stocktake;
  });
}

/** ერთეულის სწრაფი კორექტირება (მაგ. გაფუჭება/დანაკარგი). */
export async function adjustSingleItem(
  user: AppUser,
  settings: AppSettings,
  level: StockLevel,
  newQuantity: number,
  reason: string
): Promise<Stocktake> {
  return createStocktake(
    user,
    settings,
    level.location,
    [
      {
        itemType: level.itemType,
        itemId: level.itemId,
        itemName: level.itemName,
        unitSymbol: '',
        location: level.location,
        expectedQuantity: level.quantity,
        actualQuantity: newQuantity,
        currentValueTetri: level.valueTetri
      }
    ],
    reason
  );
}
