/**
 * მარაგის ძრავა — FIFO პარტიები (lots), აგრეგირებული ნაშთები (stockLevels)
 * და უცვლელი მოძრაობების ჟურნალი (stockMovements).
 *
 * ყველა ბიზნეს-ოპერაცია (შესყიდვა, წარმოება, გადატანა, გაყიდვა, დაბრუნება)
 * იყენებს `StockOperation`-ს ერთი Firestore ტრანზაქციის შიგნით:
 *   1) prepare()  — ტრანზაქციამდე ვპოულობთ შესაბამის ღია პარტიებს;
 *   2) read(tx)   — ტრანზაქციაში ვკითხულობთ პარტიებსა და ნაშთებს;
 *   3) plan()     — სუფთა გამოთვლა (FIFO ღირებულება, საკმარისობა);
 *   4) write(tx)  — ჩაწერა (პარტიები, ნაშთები, მოძრაობები).
 */
import {
  getDocs,
  query,
  where,
  type DocumentSnapshot,
  type Transaction
} from 'firebase/firestore';
import { businessDateOf } from '../lib/dates';
import { roundQty } from '../lib/money';
import type {
  AppUser,
  InventoryLot,
  ItemType,
  MovementType,
  StockLevel,
  StockLocation,
  StockMovement
} from '../types';
import { COL, clean, colRef, docRef, newId } from './db';

/* ------------------------------------------------------------------ */
/* გასაღებები                                                          */
/* ------------------------------------------------------------------ */

export function stockKey(itemType: ItemType, itemId: string, location: StockLocation): string {
  return `${itemType}__${itemId}__${location}`;
}

/* ------------------------------------------------------------------ */
/* სუფთა FIFO ლოგიკა (იტესტება ბაზის გარეშე)                            */
/* ------------------------------------------------------------------ */

export interface LotLike {
  id: string;
  quantityRemaining: number;
  remainingCostTetri: number;
  seq: number;
}

export interface Allocation {
  lotId: string;
  quantity: number;
  costTetri: number;
}

export interface FifoResult {
  allocations: Allocation[];
  totalCostTetri: number;
  /** რამდენი დარჩა დაუფარავი (მარაგი არ ეყო). */
  shortage: number;
}

/**
 * FIFO ჩამოწერა: ყველაზე ძველი პარტიიდან იწყება.
 * ღირებულება იჭრება `remainingCostTetri`-დან პროპორციულად, რაც drift-ს გამორიცხავს
 * (პარტიის ბოლო ერთეული იღებს ზუსტად დარჩენილ ღირებულებას).
 */
export function allocateFifo(lots: LotLike[], quantity: number): FifoResult {
  let left = roundQty(quantity);
  const allocations: Allocation[] = [];
  let totalCostTetri = 0;

  const sorted = [...lots].filter((l) => l.quantityRemaining > 0).sort((a, b) => a.seq - b.seq);

  for (const lot of sorted) {
    if (left <= 0.0000001) break;
    const take = roundQty(Math.min(lot.quantityRemaining, left));
    if (take <= 0) continue;
    const cost =
      take >= lot.quantityRemaining - 0.0000001
        ? Math.round(lot.remainingCostTetri)
        : Math.round((lot.remainingCostTetri * take) / lot.quantityRemaining);
    allocations.push({ lotId: lot.id, quantity: take, costTetri: cost });
    totalCostTetri += cost;
    left = roundQty(left - take);
  }

  return { allocations, totalCostTetri, shortage: left > 0.0000001 ? left : 0 };
}

/** ერთეულის თვითღირებულება waste-ის გათვალისწინებით. */
export function unitCostFromBatch(totalCostTetri: number, goodQty: number): number {
  if (goodQty <= 0) return 0;
  return Math.round(totalCostTetri / goodQty);
}

/* ------------------------------------------------------------------ */
/* ოპერაციის აღწერა                                                    */
/* ------------------------------------------------------------------ */

export interface ConsumeSpec {
  itemType: ItemType;
  itemId: string;
  itemName: string;
  unitSymbol: string;
  location: StockLocation;
  quantity: number;
  movementType: MovementType;
  reason?: string;
}

export interface ReceiveSpec {
  itemType: ItemType;
  itemId: string;
  itemName: string;
  unitSymbol: string;
  location: StockLocation;
  quantity: number;
  totalCostTetri: number;
  movementType: MovementType;
  sourceType: InventoryLot['sourceType'];
  supplierId?: string;
  reason?: string;
}

export interface OperationMeta {
  user: Pick<AppUser, 'id' | 'firstName' | 'lastName'>;
  referenceType: string;
  referenceId: string;
  referenceNo?: string;
  date?: string;
  allowNegativeStock?: boolean;
}

export class InsufficientStockError extends Error {
  constructor(public itemName: string, public location: StockLocation, public shortage: number, unit: string) {
    super(`არასაკმარისი მარაგი: ${itemName} (${location}) — გაკლია ${roundQty(shortage)} ${unit}`);
    this.name = 'InsufficientStockError';
  }
}

interface PreparedConsume {
  spec: ConsumeSpec;
  lotIds: string[];
}

interface LevelState {
  id: string;
  itemType: ItemType;
  itemId: string;
  itemName: string;
  location: StockLocation;
  quantity: number;
  valueTetri: number;
  exists: boolean;
}

export interface ConsumeOutcome {
  spec: ConsumeSpec;
  costTetri: number;
  allocations: Allocation[];
}

/**
 * ერთი ატომური ოპერაციის მარაგის ნაწილი.
 */
export class StockOperation {
  private consumes: ConsumeSpec[] = [];
  private receives: ReceiveSpec[] = [];
  private prepared: PreparedConsume[] = [];
  private lotSnaps = new Map<string, InventoryLot>();
  private levels = new Map<string, LevelState>();
  private outcomes: ConsumeOutcome[] = [];
  private lotDeltas = new Map<string, { quantity: number; costTetri: number }>();
  private newLots: InventoryLot[] = [];
  private movements: StockMovement[] = [];
  private planned = false;

  constructor(private meta: OperationMeta) {}

  consume(spec: ConsumeSpec): this {
    if (spec.quantity <= 0) throw new Error(`${spec.itemName}: რაოდენობა უნდა იყოს 0-ზე მეტი`);
    this.consumes.push({ ...spec, quantity: roundQty(spec.quantity) });
    return this;
  }

  receive(spec: ReceiveSpec): this {
    if (spec.quantity <= 0) throw new Error(`${spec.itemName}: რაოდენობა უნდა იყოს 0-ზე მეტი`);
    this.receives.push({ ...spec, quantity: roundQty(spec.quantity) });
    return this;
  }

  hasWork(): boolean {
    return this.consumes.length > 0 || this.receives.length > 0;
  }

  /** ტრანზაქციამდე — ღია პარტიების მოძებნა (ტრანზაქციაში query არ შეიძლება). */
  async prepare(): Promise<void> {
    this.prepared = [];
    for (const spec of this.consumes) {
      const key = stockKey(spec.itemType, spec.itemId, spec.location);
      const snap = await getDocs(query(colRef(COL.lots), where('openKey', '==', key)));
      const lots = snap.docs
        .map((d) => d.data() as InventoryLot)
        .filter((l) => l.quantityRemaining > 0)
        .sort((a, b) => a.seq - b.seq);
      this.prepared.push({ spec, lotIds: lots.map((l) => l.id) });
    }
  }

  /** ტრანზაქციაში — ყველა საჭირო დოკუმენტის წაკითხვა (writes-მდე). */
  async read(tx: Transaction): Promise<void> {
    this.lotSnaps.clear();
    this.levels.clear();

    const lotIds = new Set<string>();
    this.prepared.forEach((p) => p.lotIds.forEach((id) => lotIds.add(id)));
    for (const id of lotIds) {
      const snap: DocumentSnapshot = await tx.get(docRef(COL.lots, id));
      if (snap.exists()) this.lotSnaps.set(id, snap.data() as InventoryLot);
    }

    const levelKeys = new Map<string, { itemType: ItemType; itemId: string; itemName: string; location: StockLocation }>();
    [...this.consumes, ...this.receives].forEach((s) => {
      levelKeys.set(stockKey(s.itemType, s.itemId, s.location), {
        itemType: s.itemType,
        itemId: s.itemId,
        itemName: s.itemName,
        location: s.location
      });
    });

    for (const [id, info] of levelKeys) {
      const snap = await tx.get(docRef(COL.stockLevels, id));
      const data = snap.exists() ? (snap.data() as StockLevel) : null;
      this.levels.set(id, {
        id,
        itemType: info.itemType,
        itemId: info.itemId,
        itemName: data?.itemName || info.itemName,
        location: info.location,
        quantity: data?.quantity ?? 0,
        valueTetri: data?.valueTetri ?? 0,
        exists: !!data
      });
    }
  }

  /** სუფთა გამოთვლა — FIFO ღირებულება და საკმარისობის შემოწმება. */
  plan(): ConsumeOutcome[] {
    this.outcomes = [];
    this.lotDeltas.clear();
    this.newLots = [];
    this.movements = [];

    const now = this.meta.date ?? new Date().toISOString();
    const businessDate = businessDateOf(now);
    const userName = `${this.meta.user.firstName} ${this.meta.user.lastName}`.trim();
    const runningLevels = new Map<string, { quantity: number; valueTetri: number }>();
    for (const [id, lvl] of this.levels) runningLevels.set(id, { quantity: lvl.quantity, valueTetri: lvl.valueTetri });
    let seq = Date.now();

    // --- ჩამოწერები ---
    for (const p of this.prepared) {
      const spec = p.spec;
      const lots: LotLike[] = p.lotIds
        .map((id) => this.lotSnaps.get(id))
        .filter((l): l is InventoryLot => !!l)
        .map((l) => {
          const d = this.lotDeltas.get(l.id);
          return {
            id: l.id,
            quantityRemaining: roundQty(l.quantityRemaining - (d?.quantity ?? 0)),
            remainingCostTetri: l.remainingCostTetri - (d?.costTetri ?? 0),
            seq: l.seq
          };
        });

      const res = allocateFifo(lots, spec.quantity);
      if (res.shortage > 0 && !this.meta.allowNegativeStock) {
        throw new InsufficientStockError(spec.itemName, spec.location, res.shortage, spec.unitSymbol);
      }

      for (const a of res.allocations) {
        const cur = this.lotDeltas.get(a.lotId) ?? { quantity: 0, costTetri: 0 };
        this.lotDeltas.set(a.lotId, {
          quantity: roundQty(cur.quantity + a.quantity),
          costTetri: cur.costTetri + a.costTetri
        });
      }

      const key = stockKey(spec.itemType, spec.itemId, spec.location);
      const run = runningLevels.get(key)!;
      const previousQuantity = run.quantity;
      run.quantity = roundQty(run.quantity - spec.quantity);
      run.valueTetri = Math.max(0, run.valueTetri - res.totalCostTetri);

      this.movements.push(
        clean({
          id: newId('mov'),
          itemType: spec.itemType,
          itemId: spec.itemId,
          itemName: spec.itemName,
          unitSymbol: spec.unitSymbol,
          location: spec.location,
          movementType: spec.movementType,
          quantity: -spec.quantity,
          previousQuantity,
          newQuantity: run.quantity,
          unitCostTetri: spec.quantity ? Math.round(res.totalCostTetri / spec.quantity) : 0,
          totalCostTetri: res.totalCostTetri,
          referenceType: this.meta.referenceType,
          referenceId: this.meta.referenceId,
          referenceNo: this.meta.referenceNo,
          userId: this.meta.user.id,
          userName,
          timestamp: now,
          businessDate,
          reason: spec.reason,
          seq: seq++
        }) as StockMovement
      );

      this.outcomes.push({ spec, costTetri: res.totalCostTetri, allocations: res.allocations });
    }

    // --- შემოსვლები ---
    for (const spec of this.receives) {
      const key = stockKey(spec.itemType, spec.itemId, spec.location);
      const run = runningLevels.get(key)!;
      const previousQuantity = run.quantity;
      run.quantity = roundQty(run.quantity + spec.quantity);
      run.valueTetri = run.valueTetri + spec.totalCostTetri;

      const lot: InventoryLot = clean({
        id: newId('lot'),
        itemType: spec.itemType,
        itemId: spec.itemId,
        itemName: spec.itemName,
        location: spec.location,
        sourceType: spec.sourceType,
        sourceId: this.meta.referenceId,
        supplierId: spec.supplierId,
        quantityReceived: spec.quantity,
        quantityRemaining: spec.quantity,
        totalCostTetri: spec.totalCostTetri,
        remainingCostTetri: spec.totalCostTetri,
        createdAt: now,
        seq: seq++
      }) as InventoryLot;
      this.newLots.push(lot);

      this.movements.push(
        clean({
          id: newId('mov'),
          itemType: spec.itemType,
          itemId: spec.itemId,
          itemName: spec.itemName,
          unitSymbol: spec.unitSymbol,
          location: spec.location,
          movementType: spec.movementType,
          quantity: spec.quantity,
          previousQuantity,
          newQuantity: run.quantity,
          unitCostTetri: spec.quantity ? Math.round(spec.totalCostTetri / spec.quantity) : 0,
          totalCostTetri: spec.totalCostTetri,
          referenceType: this.meta.referenceType,
          referenceId: this.meta.referenceId,
          referenceNo: this.meta.referenceNo,
          userId: this.meta.user.id,
          userName,
          timestamp: now,
          businessDate,
          reason: spec.reason,
          seq: seq++
        }) as StockMovement
      );
    }

    for (const [id, run] of runningLevels) {
      const lvl = this.levels.get(id)!;
      lvl.quantity = run.quantity;
      lvl.valueTetri = Math.round(run.valueTetri);
    }

    this.planned = true;
    return this.outcomes;
  }

  /** ჩაწერა — მხოლოდ plan()-ის შემდეგ. */
  write(tx: Transaction): void {
    if (!this.planned) throw new Error('StockOperation: plan() უნდა გამოიძახოთ write()-მდე');
    const now = this.meta.date ?? new Date().toISOString();

    for (const [lotId, delta] of this.lotDeltas) {
      const lot = this.lotSnaps.get(lotId);
      if (!lot) continue;
      const quantityRemaining = roundQty(lot.quantityRemaining - delta.quantity);
      const remainingCostTetri = Math.max(0, lot.remainingCostTetri - delta.costTetri);
      tx.set(
        docRef(COL.lots, lotId),
        {
          quantityRemaining,
          remainingCostTetri: quantityRemaining <= 0 ? 0 : remainingCostTetri,
          openKey: quantityRemaining > 0 ? stockKey(lot.itemType, lot.itemId, lot.location) : null
        },
        { merge: true }
      );
    }

    for (const lot of this.newLots) {
      tx.set(docRef(COL.lots, lot.id), {
        ...lot,
        key: stockKey(lot.itemType, lot.itemId, lot.location),
        openKey: stockKey(lot.itemType, lot.itemId, lot.location)
      });
    }

    for (const [, lvl] of this.levels) {
      tx.set(
        docRef(COL.stockLevels, lvl.id),
        clean({
          id: lvl.id,
          itemType: lvl.itemType,
          itemId: lvl.itemId,
          itemName: lvl.itemName,
          location: lvl.location,
          quantity: lvl.quantity,
          valueTetri: lvl.valueTetri,
          updatedAt: now
        } as StockLevel)
      );
    }

    for (const mv of this.movements) {
      tx.set(docRef(COL.stockMovements, mv.id), mv);
    }
  }

  getOutcome(index: number): ConsumeOutcome {
    return this.outcomes[index];
  }

  getMovements(): StockMovement[] {
    return this.movements;
  }
}
