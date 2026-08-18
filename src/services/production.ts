/**
 * წარმოება / ცხობა — ატომური ტრანზაქცია:
 * ინგრედიენტების FIFO ჩამოწერა → რეალური თვითღირებულება → მზა პროდუქტის
 * პარტია სართულის მარაგში → მოძრაობები → audit.
 *
 * Waste-ის ღირებულება მთლიანად კარგ პროდუქციაზე ნაწილდება:
 *   unitCost = totalMaterialCost / producedGoodQty
 */
import { runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { businessDateOf } from '../lib/dates';
import { assertPermission } from '../lib/permissions';
import type {
  AppSettings,
  AppUser,
  FinishedProduct,
  Floor,
  ProductionBatch,
  ProductionConsumption,
  Recipe,
  StorageLocation
} from '../types';
import { COL, buildDocNo, clean, docRef, newId, readCounters } from './db';
import { logAuditTx } from './audit';
import { StockOperation, unitCostFromBatch } from './inventory';
import { assertDayOpenTx } from './businessDays';

export interface ConsumptionInput {
  materialId: string;
  materialName: string;
  unitSymbol: string;
  location: StorageLocation;
  quantity: number;
}

export interface ProductionInput {
  productId: string;
  floor: Floor;
  producedGoodQty: number;
  wasteQty: number;
  consumptions: ConsumptionInput[];
  recipeId?: string;
  recipeVersion?: number;
  note?: string;
  date?: string;
}

/** გრამაჟის snapshot — პარამეტრებიდან ან პროდუქტიდან. */
export function resolveWeightGrams(product: FinishedProduct, settings: AppSettings): number | undefined {
  if (product.weightSettingKey) return settings[product.weightSettingKey];
  return product.weightGrams;
}

/** რეცეპტიდან ინგრედიენტების წინასწარი შევსება მოცემულ გამოსავალზე. */
export function scaleRecipe(recipe: Recipe, targetQuantity: number): ConsumptionInput[] {
  const factor = recipe.outputQuantity > 0 ? targetQuantity / recipe.outputQuantity : 0;
  return recipe.ingredients.map((ing) => ({
    materialId: ing.materialId,
    materialName: ing.materialName,
    unitSymbol: ing.unitSymbol,
    location: ing.location,
    quantity: Math.round(ing.quantity * factor * 1000) / 1000
  }));
}

export async function createProductionBatch(
  user: AppUser,
  settings: AppSettings,
  input: ProductionInput
): Promise<ProductionBatch> {
  assertPermission(user, 'production.create');
  if (input.producedGoodQty <= 0) throw new Error('გამომცხვარი რაოდენობა უნდა იყოს 0-ზე მეტი');
  if (input.wasteQty < 0) throw new Error('გაფუჭებული რაოდენობა არ შეიძლება იყოს უარყოფითი');
  if (!input.consumptions.length) throw new Error('მიუთითეთ დახარჯული მასალები');
  if (input.consumptions.some((c) => c.quantity <= 0)) throw new Error('მასალის რაოდენობა უნდა იყოს 0-ზე მეტი');
  if (user.role === 'EMPLOYEE' && user.assignedFloor && user.assignedFloor !== input.floor) {
    throw new Error('თქვენ მხოლოდ თქვენს სართულზე შეგიძლიათ წარმოების დამატება');
  }

  const date = input.date ?? new Date().toISOString();
  const businessDate = businessDateOf(date);
  const batchId = newId('prb');

  const op = new StockOperation({
    user,
    referenceType: 'production',
    referenceId: batchId,
    date,
    allowNegativeStock: settings.allowNegativeStock
  });

  input.consumptions.forEach((c) =>
    op.consume({
      itemType: 'MATERIAL',
      itemId: c.materialId,
      itemName: c.materialName,
      unitSymbol: c.unitSymbol,
      location: c.location,
      quantity: c.quantity,
      movementType: 'PRODUCTION_CONSUMPTION'
    })
  );
  await op.prepare();

  return runTransaction(db, async (tx) => {
    // ---- reads ----
    await assertDayOpenTx(tx, businessDate, settings.requireOpenBusinessDay);
    const counters = await readCounters(tx);
    const productSnap = await tx.get(docRef(COL.products, input.productId));
    if (!productSnap.exists()) throw new Error('პროდუქტი ვერ მოიძებნა');
    const product = productSnap.data() as FinishedProduct;
    if (!product.active) throw new Error('პროდუქტი გათიშულია');
    if (product.kind !== 'PRODUCED') throw new Error('ეს პროდუქტი წარმოებადი არ არის');
    await op.read(tx);

    // ---- plan ----
    const outcomes = op.plan();
    const consumptions: ProductionConsumption[] = outcomes.map((o) => ({
      materialId: o.spec.itemId,
      materialName: o.spec.itemName,
      unitSymbol: o.spec.unitSymbol,
      location: o.spec.location as StorageLocation,
      quantity: o.spec.quantity,
      costTetri: o.costTetri
    }));
    const totalMaterialCostTetri = consumptions.reduce((s, c) => s + c.costTetri, 0);
    const unitProductionCostTetri = unitCostFromBatch(totalMaterialCostTetri, input.producedGoodQty);

    // მზა პროდუქტი შედის იმ სართულის მარაგში, სადაც გამოცხვა.
    const receiveOp = new StockOperation({
      user,
      referenceType: 'production',
      referenceId: batchId,
      date,
      allowNegativeStock: settings.allowNegativeStock
    });
    receiveOp.receive({
      itemType: 'PRODUCT',
      itemId: product.id,
      itemName: product.name,
      unitSymbol: product.unitSymbol,
      location: input.floor,
      quantity: input.producedGoodQty,
      totalCostTetri: totalMaterialCostTetri,
      movementType: 'PRODUCTION_OUTPUT',
      sourceType: 'PRODUCTION'
    });
    await receiveOp.read(tx);
    receiveOp.plan();

    const { no, counters: nextCounters } = buildDocNo(counters, 'production');

    const batch: ProductionBatch = clean({
      id: batchId,
      batchNo: no,
      productId: product.id,
      productName: product.name,
      floor: input.floor,
      bakerId: user.id,
      bakerName: `${user.firstName} ${user.lastName}`.trim(),
      producedGoodQty: input.producedGoodQty,
      wasteQty: input.wasteQty,
      weightGramsSnapshot: resolveWeightGrams(product, settings),
      recipeId: input.recipeId,
      recipeVersionSnapshot: input.recipeVersion,
      consumptions,
      totalMaterialCostTetri,
      unitProductionCostTetri,
      note: input.note,
      date,
      businessDate,
      createdAt: new Date().toISOString()
    }) as ProductionBatch;

    // ---- writes ----
    op.write(tx);
    receiveOp.write(tx);
    tx.set(docRef(COL.productionBatches, batch.id), batch);
    tx.set(docRef(COL.meta, 'counters'), nextCounters);
    logAuditTx(tx, user, {
      action: 'PRODUCTION_CREATED',
      entityType: 'production',
      entityId: batch.id,
      summary: `წარმოება ${no}: ${product.name} — ${input.producedGoodQty} ${product.unitSymbol} (${input.floor})`,
      after: batch
    });
    if (input.wasteQty > 0) {
      logAuditTx(tx, user, {
        action: 'PRODUCTION_WASTE',
        entityType: 'production',
        entityId: batch.id,
        summary: `დანაკარგი: ${product.name} — ${input.wasteQty} ${product.unitSymbol}`,
        after: { wasteQty: input.wasteQty }
      });
    }

    return batch;
  });
}
