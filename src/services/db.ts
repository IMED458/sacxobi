/**
 * Firestore-ის საერთო შრე: კოლექციების სახელები, ID-ების გენერაცია,
 * დოკუმენტის ნომრები, undefined-ის გასუფთავება და მცირე დამხმარეები.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryConstraint,
  type Transaction
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { currentYear } from '../lib/dates';
import type { Counters } from '../types';

export const COL = {
  users: 'users',
  products: 'products',
  productCategories: 'productCategories',
  materials: 'materials',
  units: 'units',
  recipes: 'recipes',
  suppliers: 'suppliers',
  purchases: 'purchases',
  lots: 'lots',
  stockLevels: 'stockLevels',
  stockMovements: 'stockMovements',
  stocktakes: 'stocktakes',
  productionBatches: 'productionBatches',
  transferRequests: 'transferRequests',
  sales: 'sales',
  orders: 'orders',
  returns: 'returns',
  expenses: 'expenses',
  expenseCategories: 'expenseCategories',
  cashMovements: 'cashMovements',
  shifts: 'shifts',
  businessDays: 'businessDays',
  auditLogs: 'auditLogs',
  priceHistories: 'priceHistories',
  meta: 'meta'
} as const;

export const settingsRef = doc(db, COL.meta, 'settings');
export const countersRef = doc(db, COL.meta, 'counters');
export const bootstrapRef = doc(db, COL.meta, 'bootstrap');

export function colRef(name: string) {
  return collection(db, name);
}

export function docRef(name: string, id: string) {
  return doc(db, name, id);
}

/** ახალი დოკუმენტის ID (Firestore-ის ავტო-ID-ს ტოლფასი). */
export function newId(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const t = Date.now().toString(36);
  return `${prefix}${prefix ? '_' : ''}${t}${rand}`;
}

/** Firestore `undefined`-ს არ იღებს — რეკურსიულად ვასუფთავებთ. */
export function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => clean(v)) as unknown as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: DocumentData = {};
    for (const [k, v] of Object.entries(value as DocumentData)) {
      if (v === undefined) continue;
      out[k] = clean(v);
    }
    return out as T;
  }
  return value;
}

export const DEFAULT_COUNTERS: Counters = {
  sale: 0,
  order: 0,
  purchase: 0,
  production: 0,
  transfer: 0,
  return: 0,
  expense: 0,
  stocktake: 0,
  year: currentYear()
};

const PREFIX: Record<keyof Omit<Counters, 'year'>, string> = {
  sale: 'SAL',
  order: 'ORD',
  purchase: 'PUR',
  production: 'PRD',
  transfer: 'TRF',
  return: 'RET',
  expense: 'EXP',
  stocktake: 'STK'
};

export type CounterKind = keyof typeof PREFIX;

/**
 * დოკუმენტის ნომრის გამოთვლა counters-ის მიმდინარე მდგომარეობიდან.
 * წელი ავტომატურად მიმდინარე ბიზნეს-წლიდან მოდის (არასდროს hardcoded).
 */
export function buildDocNo(counters: Counters, kind: CounterKind): { no: string; counters: Counters } {
  const year = currentYear();
  const base: Counters = counters.year === year ? { ...counters } : { ...DEFAULT_COUNTERS, year };
  const next = (base[kind] ?? 0) + 1;
  base[kind] = next;
  base.year = year;
  return { no: `${PREFIX[kind]}-${year}-${String(next).padStart(6, '0')}`, counters: base };
}

/** ტრანზაქციაში counters-ის წაკითხვა (ყოველთვის writes-მდე). */
export async function readCounters(tx: Transaction): Promise<Counters> {
  const snap = await tx.get(countersRef);
  return snap.exists() ? ({ ...DEFAULT_COUNTERS, ...(snap.data() as Counters) }) : { ...DEFAULT_COUNTERS };
}

export async function readCountersOnce(): Promise<Counters> {
  const snap = await getDoc(countersRef);
  return snap.exists() ? ({ ...DEFAULT_COUNTERS, ...(snap.data() as Counters) }) : { ...DEFAULT_COUNTERS };
}

/** მარტივი კითხვა: კოლექცია + შეზღუდვები → მასივი. */
export async function fetchAll<T>(name: string, ...constraints: QueryConstraint[]): Promise<T[]> {
  const snap = await getDocs(query(colRef(name), ...constraints));
  return snap.docs.map((d) => d.data() as T);
}

export { where, orderBy, fsLimit as limit, query };
