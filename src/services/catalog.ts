/**
 * კატალოგი: მზა პროდუქტები, კატეგორიები, ერთეულები, ნედლეული, რეცეპტები,
 * მომწოდებლები. ისტორიული დოკუმენტები snapshot-ებით მუშაობს, ამიტომ აქ
 * ცვლილება ძველ ჩანაწერებს არ ეხება.
 */
import { deleteDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  AppUser,
  StockLocation,
  ExpenseCategory,
  FinishedProduct,
  Floor,
  Material,
  PriceHistory,
  ProductCategory,
  Recipe,
  RecipeIngredient,
  StorageLocation,
  Supplier,
  Unit
} from '../types';
import { COL, clean, colRef, docRef, newId } from './db';
import { logAudit } from './audit';

/* ----------------------------- ერთეულები ----------------------------- */

export const SEED_UNITS: Unit[] = [
  { id: 'u_kg', name: 'კილოგრამი', symbol: 'კგ', allowsDecimal: true, active: true },
  { id: 'u_g', name: 'გრამი', symbol: 'გ', allowsDecimal: true, active: true },
  { id: 'u_l', name: 'ლიტრი', symbol: 'ლ', allowsDecimal: true, active: true },
  { id: 'u_ml', name: 'მილილიტრი', symbol: 'მლ', allowsDecimal: true, active: true },
  { id: 'u_pcs', name: 'ცალი', symbol: 'ცალი', allowsDecimal: false, active: true },
  { id: 'u_pack', name: 'შეკვრა', symbol: 'შეკვრა', allowsDecimal: false, active: true }
];

export async function saveUnit(user: AppUser, unit: Unit): Promise<void> {
  await setDoc(docRef(COL.units, unit.id), clean(unit));
  await logAudit(user, {
    action: 'UNIT_SAVED',
    entityType: 'unit',
    entityId: unit.id,
    summary: `ერთეული: ${unit.name} (${unit.symbol})`,
    after: unit
  });
}

/* --------------------------- კატეგორიები ----------------------------- */

export async function saveProductCategory(user: AppUser, cat: ProductCategory): Promise<void> {
  await setDoc(docRef(COL.productCategories, cat.id), clean(cat));
  await logAudit(user, {
    action: 'PRODUCT_CATEGORY_SAVED',
    entityType: 'productCategory',
    entityId: cat.id,
    summary: `პროდუქტის კატეგორია: ${cat.name}`,
    after: cat
  });
}

/* -------------------------- მზა პროდუქტები --------------------------- */

export interface ProductInput {
  id?: string;
  name: string;
  code: string;
  kind: 'PRODUCED' | 'RESALE';
  productionFloor?: Floor;
  salesLocation: StockLocation;
  imageUrl?: string;
  unitSymbol: string;
  weightGrams?: number;
  weightSettingKey?: FinishedProduct['weightSettingKey'];
  sellingPriceTetri: number;
  wholesalePriceTetri?: number;
  categoryId?: string;
  color?: string;
  active: boolean;
}

export async function saveProduct(user: AppUser, input: ProductInput, before?: FinishedProduct): Promise<FinishedProduct> {
  if (!input.name.trim()) throw new Error('პროდუქტის დასახელება სავალდებულოა');
  if (input.sellingPriceTetri < 0) throw new Error('ფასი არ შეიძლება იყოს უარყოფითი');

  const now = new Date().toISOString();
  const product: FinishedProduct = clean({
    id: input.id ?? newId('prd'),
    name: input.name.trim(),
    code: input.code.trim() || input.name.trim().slice(0, 12).toUpperCase(),
    kind: input.kind,
    productionFloor: input.kind === 'PRODUCED' ? input.productionFloor : undefined,
    salesLocation: input.salesLocation,
    imageUrl: input.imageUrl?.trim() || undefined,
    unitSymbol: input.unitSymbol,
    weightGrams: input.weightGrams,
    weightSettingKey: input.weightSettingKey,
    sellingPriceTetri: Math.round(input.sellingPriceTetri),
    wholesalePriceTetri: input.wholesalePriceTetri != null ? Math.round(input.wholesalePriceTetri) : undefined,
    categoryId: input.categoryId,
    color: input.color,
    active: input.active,
    createdAt: before?.createdAt ?? now,
    updatedAt: now
  }) as FinishedProduct;

  await setDoc(docRef(COL.products, product.id), product);

  if (before && before.sellingPriceTetri !== product.sellingPriceTetri) {
    const hist: PriceHistory = {
      id: newId('ph'),
      productId: product.id,
      productName: product.name,
      oldPriceTetri: before.sellingPriceTetri,
      newPriceTetri: product.sellingPriceTetri,
      changedBy: user.id,
      changedByName: `${user.firstName} ${user.lastName}`.trim(),
      date: now
    };
    await setDoc(docRef(COL.priceHistories, hist.id), clean(hist));
    await logAudit(user, {
      action: 'PRODUCT_PRICE_CHANGED',
      entityType: 'product',
      entityId: product.id,
      summary: `${product.name}: ფასი შეიცვალა`,
      before: { sellingPriceTetri: before.sellingPriceTetri },
      after: { sellingPriceTetri: product.sellingPriceTetri }
    });
  }

  await logAudit(user, {
    action: before ? 'PRODUCT_UPDATED' : 'PRODUCT_CREATED',
    entityType: 'product',
    entityId: product.id,
    summary: `${before ? 'რედაქტირდა' : 'დაემატა'} პროდუქტი: ${product.name}`,
    before,
    after: product
  });

  return product;
}

export async function changeProductPrice(
  user: AppUser,
  product: FinishedProduct,
  newPriceTetri: number,
  reason?: string
): Promise<void> {
  if (newPriceTetri < 0) throw new Error('ფასი არ შეიძლება იყოს უარყოფითი');
  const now = new Date().toISOString();
  const hist: PriceHistory = clean({
    id: newId('ph'),
    productId: product.id,
    productName: product.name,
    oldPriceTetri: product.sellingPriceTetri,
    newPriceTetri: Math.round(newPriceTetri),
    changedBy: user.id,
    changedByName: `${user.firstName} ${user.lastName}`.trim(),
    reason,
    date: now
  }) as PriceHistory;

  const batch = writeBatch(db);
  batch.set(docRef(COL.products, product.id), { sellingPriceTetri: Math.round(newPriceTetri), updatedAt: now }, { merge: true });
  batch.set(docRef(COL.priceHistories, hist.id), hist);
  await batch.commit();

  await logAudit(user, {
    action: 'PRODUCT_PRICE_CHANGED',
    entityType: 'product',
    entityId: product.id,
    summary: `${product.name}: ფასი შეიცვალა`,
    before: { sellingPriceTetri: product.sellingPriceTetri },
    after: { sellingPriceTetri: Math.round(newPriceTetri) },
    reason
  });
}

/* ----------------------------- ნედლეული ------------------------------ */

export interface MaterialInput {
  id?: string;
  name: string;
  code: string;
  unitSymbol: string;
  defaultStorageLocation: StorageLocation;
  minStock: number;
  description?: string;
  imageUrl?: string;
  active: boolean;
}

export async function saveMaterial(user: AppUser, input: MaterialInput, before?: Material): Promise<Material> {
  if (!input.name.trim()) throw new Error('მასალის დასახელება სავალდებულოა');
  if (input.minStock < 0) throw new Error('მინიმალური ნაშთი არ შეიძლება იყოს უარყოფითი');
  const now = new Date().toISOString();
  const material: Material = clean({
    id: input.id ?? newId('mat'),
    name: input.name.trim(),
    code: input.code.trim() || input.name.trim().slice(0, 12).toUpperCase(),
    unitSymbol: input.unitSymbol,
    defaultStorageLocation: input.defaultStorageLocation,
    minStock: input.minStock,
    description: input.description,
    imageUrl: input.imageUrl?.trim() || undefined,
    active: input.active,
    createdAt: before?.createdAt ?? now,
    updatedAt: now
  }) as Material;

  await setDoc(docRef(COL.materials, material.id), material);
  await logAudit(user, {
    action: before ? 'MATERIAL_UPDATED' : 'MATERIAL_CREATED',
    entityType: 'material',
    entityId: material.id,
    summary: `${before ? 'რედაქტირდა' : 'დაემატა'} მასალა: ${material.name}`,
    before,
    after: material
  });
  return material;
}

/* ----------------------------- რეცეპტები ----------------------------- */

export async function saveRecipe(
  user: AppUser,
  input: { id?: string; productId: string; productName: string; outputQuantity: number; ingredients: RecipeIngredient[] },
  before?: Recipe
): Promise<Recipe> {
  if (input.outputQuantity <= 0) throw new Error('გამოსავალი რაოდენობა უნდა იყოს 0-ზე მეტი');
  if (!input.ingredients.length) throw new Error('რეცეპტს სჭირდება მინიმუმ ერთი ინგრედიენტი');
  if (input.ingredients.some((i) => i.quantity <= 0)) throw new Error('ინგრედიენტის რაოდენობა უნდა იყოს 0-ზე მეტი');

  const now = new Date().toISOString();
  const recipe: Recipe = clean({
    id: input.id ?? newId('rec'),
    productId: input.productId,
    productName: input.productName,
    outputQuantity: input.outputQuantity,
    ingredients: input.ingredients,
    version: (before?.version ?? 0) + 1,
    active: true,
    createdAt: now,
    createdBy: user.id
  }) as Recipe;

  await setDoc(docRef(COL.recipes, recipe.id), recipe);
  await logAudit(user, {
    action: 'RECIPE_SAVED',
    entityType: 'recipe',
    entityId: recipe.id,
    summary: `რეცეპტი: ${recipe.productName} (ვერსია ${recipe.version})`,
    before,
    after: recipe
  });
  return recipe;
}

/* --------------------------- მომწოდებლები ---------------------------- */

export async function saveSupplier(
  user: AppUser,
  input: Omit<Supplier, 'createdAt' | 'updatedAt' | 'balanceTetri'> & { balanceTetri?: number },
  before?: Supplier
): Promise<Supplier> {
  if (!input.name.trim()) throw new Error('მომწოდებლის დასახელება სავალდებულოა');
  const now = new Date().toISOString();
  const supplier: Supplier = clean({
    ...input,
    id: input.id || newId('sup'),
    name: input.name.trim(),
    balanceTetri: before?.balanceTetri ?? input.balanceTetri ?? 0,
    createdAt: before?.createdAt ?? now,
    updatedAt: now
  }) as Supplier;
  await setDoc(docRef(COL.suppliers, supplier.id), supplier);
  await logAudit(user, {
    action: before ? 'SUPPLIER_UPDATED' : 'SUPPLIER_CREATED',
    entityType: 'supplier',
    entityId: supplier.id,
    summary: `${before ? 'რედაქტირდა' : 'დაემატა'} მომწოდებელი: ${supplier.name}`,
    before,
    after: supplier
  });
  return supplier;
}

/* ------------------------- ხარჯის კატეგორიები ------------------------ */

export const SEED_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: 'exp_power', name: 'ელექტროენერგია', active: true, sortOrder: 1 },
  { id: 'exp_gas', name: 'გაზი', active: true, sortOrder: 2 },
  { id: 'exp_water', name: 'წყალი', active: true, sortOrder: 3 },
  { id: 'exp_salary', name: 'ხელფასი', active: true, sortOrder: 4 },
  { id: 'exp_transport', name: 'ტრანსპორტი', active: true, sortOrder: 5 },
  { id: 'exp_rent', name: 'ქირა', active: true, sortOrder: 6 },
  { id: 'exp_repair', name: 'რემონტი', active: true, sortOrder: 7 },
  { id: 'exp_other', name: 'სხვა', active: true, sortOrder: 8 }
];

export async function saveExpenseCategory(user: AppUser, cat: ExpenseCategory): Promise<void> {
  await setDoc(docRef(COL.expenseCategories, cat.id), clean(cat));
  await logAudit(user, {
    action: 'EXPENSE_CATEGORY_SAVED',
    entityType: 'expenseCategory',
    entityId: cat.id,
    summary: `ხარჯის კატეგორია: ${cat.name}`,
    after: cat
  });
}

export async function deleteExpenseCategory(user: AppUser, cat: ExpenseCategory): Promise<void> {
  await deleteDoc(docRef(COL.expenseCategories, cat.id));
  await logAudit(user, {
    action: 'EXPENSE_CATEGORY_DELETED',
    entityType: 'expenseCategory',
    entityId: cat.id,
    summary: `წაიშალა ხარჯის კატეგორია: ${cat.name}`,
    before: cat
  });
}

/* ------------------------------- Seed -------------------------------- */

export const SEED_PRODUCTS: ProductInput[] = [
  {
    id: 'p_bread_small',
    name: 'პური — პატარა',
    code: 'BRD-S',
    kind: 'PRODUCED',
    productionFloor: 'LOWER_FLOOR',
    salesLocation: 'UPPER_FLOOR',
    unitSymbol: 'ცალი',
    weightSettingKey: 'smallBreadWeightGrams',
    sellingPriceTetri: 0,
    color: '#f59e0b',
    active: true
  },
  {
    id: 'p_bread_large',
    name: 'პური — დიდი',
    code: 'BRD-L',
    kind: 'PRODUCED',
    productionFloor: 'LOWER_FLOOR',
    salesLocation: 'UPPER_FLOOR',
    unitSymbol: 'ცალი',
    weightSettingKey: 'largeBreadWeightGrams',
    sellingPriceTetri: 0,
    color: '#d97706',
    active: true
  },
  { id: 'p_shoti_white', name: 'შოთი — თეთრი', code: 'SHT-W', kind: 'PRODUCED', productionFloor: 'UPPER_FLOOR', salesLocation: 'UPPER_FLOOR', unitSymbol: 'ცალი', sellingPriceTetri: 0, color: '#fbbf24', active: true },
  { id: 'p_shoti_gray', name: 'შოთი — სერი', code: 'SHT-G', kind: 'PRODUCED', productionFloor: 'UPPER_FLOOR', salesLocation: 'UPPER_FLOOR', unitSymbol: 'ცალი', sellingPriceTetri: 0, color: '#a16207', active: true },
  { id: 'p_buhanka_white', name: 'ბუხანკა — თეთრი', code: 'BUH-W', kind: 'PRODUCED', productionFloor: 'UPPER_FLOOR', salesLocation: 'UPPER_FLOOR', unitSymbol: 'ცალი', sellingPriceTetri: 0, color: '#f97316', active: true },
  { id: 'p_buhanka_gray', name: 'ბუხანკა — სერი', code: 'BUH-G', kind: 'PRODUCED', productionFloor: 'UPPER_FLOOR', salesLocation: 'UPPER_FLOOR', unitSymbol: 'ცალი', sellingPriceTetri: 0, color: '#c2410c', active: true },
  { id: 'p_khachapuri', name: 'ხაჭაპური', code: 'KHA', kind: 'PRODUCED', productionFloor: 'UPPER_FLOOR', salesLocation: 'UPPER_FLOOR', unitSymbol: 'ცალი', sellingPriceTetri: 0, color: '#eab308', active: true },
  { id: 'p_lobiani', name: 'ლობიანი', code: 'LOB', kind: 'PRODUCED', productionFloor: 'UPPER_FLOOR', salesLocation: 'UPPER_FLOOR', unitSymbol: 'ცალი', sellingPriceTetri: 0, color: '#84cc16', active: true },
  { id: 'p_kartofilis_gvezeli', name: 'კარტოფილის ღვეზელი', code: 'KRT', kind: 'PRODUCED', productionFloor: 'UPPER_FLOOR', salesLocation: 'UPPER_FLOOR', unitSymbol: 'ცალი', sellingPriceTetri: 0, color: '#22c55e', active: true },
  { id: 'p_ponchiki', name: 'პონჩიკი', code: 'PON', kind: 'PRODUCED', productionFloor: 'UPPER_FLOOR', salesLocation: 'UPPER_FLOOR', unitSymbol: 'ცალი', sellingPriceTetri: 0, color: '#ec4899', active: true }
];

/**
 * საბაზო (არასაიდუმლო) master data-ს seed პირველ გაშვებაზე.
 * პაროლები/მომხმარებლები აქ არ იქმნება.
 */
export async function seedMasterDataIfEmpty(): Promise<void> {
  const [unitsSnap, productsSnap, expCatSnap] = await Promise.all([
    getDocs(colRef(COL.units)),
    getDocs(colRef(COL.products)),
    getDocs(colRef(COL.expenseCategories))
  ]);

  const batch = writeBatch(db);
  let dirty = false;
  const now = new Date().toISOString();

  if (unitsSnap.empty) {
    SEED_UNITS.forEach((u) => batch.set(docRef(COL.units, u.id), clean(u)));
    dirty = true;
  }
  if (productsSnap.empty) {
    SEED_PRODUCTS.forEach((p) => {
      const product: FinishedProduct = clean({
        ...p,
        id: p.id!,
        sellingPriceTetri: p.sellingPriceTetri,
        createdAt: now,
        updatedAt: now
      }) as FinishedProduct;
      batch.set(docRef(COL.products, product.id), product);
    });
    dirty = true;
  }
  if (expCatSnap.empty) {
    SEED_EXPENSE_CATEGORIES.forEach((c) => batch.set(docRef(COL.expenseCategories, c.id), clean(c)));
    dirty = true;
  }

  if (dirty) await batch.commit();
}
