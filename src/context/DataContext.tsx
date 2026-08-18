/**
 * ცოცხალი (real-time) master data. მცირე კოლექციები Firestore-ის
 * onSnapshot-ით ვირჩევთ, დიდი ისტორიული ცხრილები კი გვერდებზე
 * პერიოდის მიხედვით იტვირთება.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  AppSettings,
  AppUser,
  CashierShift,
  ExpenseCategory,
  FinishedProduct,
  Material,
  ProductCategory,
  Recipe,
  StockLevel,
  Supplier,
  TransferRequest,
  Unit
} from '../types';
import { COL, settingsRef } from '../services/db';
import { DEFAULT_SETTINGS } from '../services/settings';
import { seedMasterDataIfEmpty } from '../services/catalog';
import { useAuth } from './AuthContext';

interface DataState {
  ready: boolean;
  settings: AppSettings;
  products: FinishedProduct[];
  productCategories: ProductCategory[];
  materials: Material[];
  units: Unit[];
  recipes: Recipe[];
  suppliers: Supplier[];
  stockLevels: StockLevel[];
  transferRequests: TransferRequest[];
  expenseCategories: ExpenseCategory[];
  users: AppUser[];
  myShift: CashierShift | null;
  stockOf: (itemType: 'PRODUCT' | 'MATERIAL', itemId: string, location: string) => StockLevel | undefined;
}

const DataContext = createContext<DataState | null>(null);

function useCollection<T>(name: string, enabled: boolean): T[] {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    if (!enabled) {
      setItems([]);
      return;
    }
    const unsub = onSnapshot(
      collection(db, name),
      (snap) => setItems(snap.docs.map((d) => d.data() as T)),
      (err) => {
        if ((err as { code?: string }).code !== 'permission-denied') console.error(name, err);
        setItems([]);
      }
    );
    return unsub;
  }, [name, enabled]);
  return items;
}

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, can } = useAuth();
  const signedIn = !!user;
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);
  const [myShift, setMyShift] = useState<CashierShift | null>(null);

  // ერთჯერადი seed — მხოლოდ არასაიდუმლო master data.
  useEffect(() => {
    if (!user || !can('settings.manage')) return;
    void seedMasterDataIfEmpty().catch(() => undefined);
  }, [user, can]);

  useEffect(() => {
    if (!signedIn) return;
    const unsub = onSnapshot(
      settingsRef,
      (snap) => {
        setSettings(snap.exists() ? { ...DEFAULT_SETTINGS, ...(snap.data() as AppSettings) } : DEFAULT_SETTINGS);
        setSettingsReady(true);
      },
      () => setSettingsReady(true)
    );
    return unsub;
  }, [signedIn]);

  useEffect(() => {
    if (!user) {
      setMyShift(null);
      return;
    }
    const unsub = onSnapshot(
      // მხოლოდ ერთი ტოლობა — კომპოზიტური ინდექსი არ სჭირდება.
      query(collection(db, COL.shifts), where('userId', '==', user.id)),
      (snap) => {
        const open = snap.docs
          .map((d) => d.data() as CashierShift)
          .filter((s) => s.status === 'open')
          .sort((a, b) => b.openedAt.localeCompare(a.openedAt));
        setMyShift(open[0] ?? null);
      },
      () => setMyShift(null)
    );
    return unsub;
  }, [user?.id]);

  const products = useCollection<FinishedProduct>(COL.products, signedIn);
  const productCategories = useCollection<ProductCategory>(COL.productCategories, signedIn);
  const materials = useCollection<Material>(COL.materials, signedIn);
  const units = useCollection<Unit>(COL.units, signedIn);
  const recipes = useCollection<Recipe>(COL.recipes, signedIn);
  const suppliers = useCollection<Supplier>(COL.suppliers, signedIn && can('inventory.view'));
  const stockLevels = useCollection<StockLevel>(COL.stockLevels, signedIn);
  const transferRequests = useCollection<TransferRequest>(COL.transferRequests, signedIn);
  const expenseCategories = useCollection<ExpenseCategory>(COL.expenseCategories, signedIn);
  const users = useCollection<AppUser>(COL.users, signedIn && can('user.manage'));

  const value = useMemo<DataState>(() => {
    const levelIndex = new Map(stockLevels.map((l) => [l.id, l]));
    return {
      ready: settingsReady,
      settings,
      products: [...products].sort((a, b) => a.name.localeCompare(b.name, 'ka')),
      productCategories: [...productCategories].sort((a, b) => a.sortOrder - b.sortOrder),
      materials: [...materials].sort((a, b) => a.name.localeCompare(b.name, 'ka')),
      units,
      recipes,
      suppliers: [...suppliers].sort((a, b) => a.name.localeCompare(b.name, 'ka')),
      stockLevels,
      transferRequests: [...transferRequests].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
      expenseCategories: [...expenseCategories].sort((a, b) => a.sortOrder - b.sortOrder),
      users,
      myShift,
      stockOf: (itemType, itemId, location) => levelIndex.get(`${itemType}__${itemId}__${location}`)
    };
  }, [
    settingsReady,
    settings,
    products,
    productCategories,
    materials,
    units,
    recipes,
    suppliers,
    stockLevels,
    transferRequests,
    expenseCategories,
    users,
    myShift
  ]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData უნდა გამოიყენოთ DataProvider-ის შიგნით');
  return ctx;
}
