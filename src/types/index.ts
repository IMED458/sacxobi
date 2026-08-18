/**
 * საცხობის მართვის სისტემა — დომენის ტიპები.
 *
 * ფულის ყველა ველი ინახება მთელ **თეთრში** (1.50 ₾ = 150) — floating-point
 * შეცდომების თავიდან ასაცილებლად. რაოდენობები decimal-ია (კგ, ლიტრი, ცალი).
 */

/* ------------------------------------------------------------------ */
/* მომხმარებლები, როლები, უფლებები                                     */
/* ------------------------------------------------------------------ */

export type UserRole = 'OWNER' | 'MANAGER' | 'CASHIER' | 'EMPLOYEE';

export type Floor = 'LOWER_FLOOR' | 'UPPER_FLOOR';

export type StorageLocation = 'WAREHOUSE' | 'FRIDGE';

/** ყველა ადგილი, სადაც შეიძლება მარაგი იდოს. */
export type StockLocation = StorageLocation | Floor;

export type Permission =
  | 'pos.access'
  | 'sale.create'
  | 'sale.cancel'
  | 'sale.return'
  | 'sale.view_all'
  | 'sale.view_profit'
  | 'production.create'
  | 'production.edit'
  | 'production.view_cost'
  | 'transfer.create_request'
  | 'transfer.fulfill'
  | 'inventory.view'
  | 'inventory.receive'
  | 'inventory.adjust'
  | 'purchase.create'
  | 'purchase.view_cost'
  | 'supplier.manage'
  | 'product.manage'
  | 'price.manage'
  | 'recipe.manage'
  | 'material.manage'
  | 'expense.manage'
  | 'cash.access'
  | 'shift.open'
  | 'shift.close'
  | 'shift.view_all'
  | 'user.manage'
  | 'password.reset'
  | 'report.sales'
  | 'report.production'
  | 'report.inventory'
  | 'report.profit'
  | 'audit.view'
  | 'day.close'
  | 'day.reopen'
  | 'settings.manage'
  | 'order.manage'
  | 'order.fulfill'
  | 'admin.delete';

export interface AppUser {
  id: string; // === Firebase Auth uid
  firstName: string;
  lastName: string;
  username: string;
  /** bcrypt-hash — UI-ში არასდროს ბრუნდება. */
  passwordHash?: string;
  phone?: string;
  position?: string;
  role: UserRole;
  assignedFloor?: Floor;
  permissions: Permission[];
  status: 'active' | 'disabled';
  mustChangePassword?: boolean;
  comment?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

/* ------------------------------------------------------------------ */
/* კატალოგი                                                            */
/* ------------------------------------------------------------------ */

export interface Unit {
  id: string;
  name: string; // კილოგრამი
  symbol: string; // კგ
  allowsDecimal: boolean;
  active: boolean;
}

/** მზა (გასაყიდი) პროდუქტი. */
export interface FinishedProduct {
  id: string;
  name: string;
  code: string;
  /** PRODUCED — ჩვენ ვაცხობთ; RESALE — ვყიდულობთ და ვყიდით (წვენი, წყალი…). */
  kind: 'PRODUCED' | 'RESALE';
  /** მხოლოდ PRODUCED-ისთვის. */
  productionFloor?: Floor;
  /** მარაგის ადგილი, საიდანაც POS ყიდის (სართული, საწყობი ან მაცივარი). */
  salesLocation: StockLocation;
  /** სურათის ბმული (მაგ. Google-დან) — POS-ის ბარათზე გამოჩნდება. */
  imageUrl?: string;
  unitSymbol: string;
  /** გრამაჟი — production batch-ში ინახება snapshot-ად. */
  weightGrams?: number;
  /** გრამაჟი პარამეტრებიდან: 'SMALL_BREAD' | 'LARGE_BREAD' | undefined */
  weightSettingKey?: 'smallBreadWeightGrams' | 'largeBreadWeightGrams';
  sellingPriceTetri: number;
  categoryId?: string;
  color?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  color?: string;
  sortOrder: number;
  active: boolean;
}

/** ნედლეული / მასალა. */
export interface Material {
  id: string;
  name: string;
  code: string;
  imageUrl?: string;
  unitSymbol: string;
  defaultStorageLocation: StorageLocation;
  minStock: number;
  description?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeIngredient {
  materialId: string;
  materialName: string;
  unitSymbol: string;
  quantity: number;
  location: StorageLocation;
}

export interface Recipe {
  id: string;
  productId: string;
  productName: string;
  outputQuantity: number;
  ingredients: RecipeIngredient[];
  version: number;
  active: boolean;
  createdAt: string;
  createdBy: string;
}

/* ------------------------------------------------------------------ */
/* მომწოდებლები & შესყიდვები                                           */
/* ------------------------------------------------------------------ */

export interface Supplier {
  id: string;
  name: string;
  taxId?: string;
  contactPerson?: string;
  phone?: string;
  address?: string;
  comment?: string;
  /** დადებითი = ჩვენ გვმართებს მომწოდებელს (თეთრი). */
  balanceTetri: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ItemType = 'MATERIAL' | 'PRODUCT';

export interface PurchaseItem {
  id: string;
  itemType: ItemType;
  itemId: string;
  itemName: string;
  itemCode: string;
  unitSymbol: string;
  quantity: number;
  unitCostTetri: number;
  totalCostTetri: number;
  location: StockLocation;
}

export interface Purchase {
  id: string;
  documentNo: string; // PUR-2026-000001
  supplierId: string;
  supplierName: string;
  date: string; // ISO
  businessDate: string; // YYYY-MM-DD (Asia/Tbilisi)
  items: PurchaseItem[];
  totalTetri: number;
  paidTetri: number;
  balanceTetri: number;
  paymentMethod: PaymentMethod;
  comment?: string;
  status: 'completed' | 'cancelled';
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* მარაგი                                                              */
/* ------------------------------------------------------------------ */

/** მარაგის პარტია — FIFO თვითღირებულებისთვის. */
export interface InventoryLot {
  id: string;
  itemType: ItemType;
  itemId: string;
  itemName: string;
  location: StockLocation;
  sourceType: 'PURCHASE' | 'PRODUCTION' | 'TRANSFER' | 'RETURN' | 'ADJUSTMENT' | 'INITIAL';
  sourceId: string;
  supplierId?: string;
  quantityReceived: number;
  quantityRemaining: number;
  /** მიღებული პარტიის სრული ღირებულება (თეთრი). */
  totalCostTetri: number;
  /** ჯერ კიდევ დარჩენილი ღირებულება (თეთრი) — drift-ის გარეშე. */
  remainingCostTetri: number;
  createdAt: string;
  /** სორტირებისთვის — რიცხვითი timestamp. */
  seq: number;
}

/** მიმდინარე ნაშთი item+location-ზე (აგრეგატი). */
export interface StockLevel {
  id: string; // `${itemType}__${itemId}__${location}`
  itemType: ItemType;
  itemId: string;
  itemName: string;
  location: StockLocation;
  quantity: number;
  valueTetri: number;
  updatedAt: string;
}

export type MovementType =
  | 'PURCHASE'
  | 'PRODUCTION_CONSUMPTION'
  | 'PRODUCTION_OUTPUT'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'SALE'
  | 'RETURN'
  | 'WASTE'
  | 'ADJUSTMENT'
  | 'INITIAL_STOCK';

export interface StockMovement {
  id: string;
  itemType: ItemType;
  itemId: string;
  itemName: string;
  unitSymbol: string;
  location: StockLocation;
  movementType: MovementType;
  quantity: number; // ნიშნიანი: + შემოსვლა, − გასვლა
  previousQuantity: number;
  newQuantity: number;
  unitCostTetri: number;
  totalCostTetri: number;
  referenceType: string;
  referenceId: string;
  referenceNo?: string;
  userId: string;
  userName: string;
  timestamp: string;
  businessDate: string;
  reason?: string;
  seq: number;
}

export interface StocktakeItem {
  itemType: ItemType;
  itemId: string;
  itemName: string;
  unitSymbol: string;
  location: StockLocation;
  expectedQuantity: number;
  actualQuantity: number;
  diff: number;
  diffValueTetri: number;
}

export interface Stocktake {
  id: string;
  documentNo: string;
  date: string;
  businessDate: string;
  location: StockLocation;
  items: StocktakeItem[];
  totalDiffValueTetri: number;
  status: 'completed';
  reason?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* წარმოება                                                            */
/* ------------------------------------------------------------------ */

export interface ProductionConsumption {
  materialId: string;
  materialName: string;
  unitSymbol: string;
  location: StorageLocation;
  quantity: number;
  costTetri: number;
}

export interface ProductionBatch {
  id: string;
  batchNo: string; // PRD-2026-000001
  productId: string;
  productName: string;
  floor: Floor;
  bakerId: string;
  bakerName: string;
  producedGoodQty: number;
  wasteQty: number;
  weightGramsSnapshot?: number;
  recipeId?: string;
  recipeVersionSnapshot?: number;
  consumptions: ProductionConsumption[];
  totalMaterialCostTetri: number;
  unitProductionCostTetri: number;
  note?: string;
  date: string;
  businessDate: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* სართულებს შორის გადატანა                                            */
/* ------------------------------------------------------------------ */

export type TransferStatus = 'PENDING' | 'PARTIAL' | 'COMPLETED' | 'CANCELLED';

export interface TransferFulfillment {
  id: string;
  quantity: number;
  costTetri: number;
  byUserId: string;
  byUserName: string;
  at: string;
  note?: string;
}

export interface TransferRequest {
  id: string;
  requestNo: string; // TRF-2026-000001
  fromLocation: Floor;
  toLocation: Floor;
  productId: string;
  productName: string;
  unitSymbol: string;
  requestedQuantity: number;
  deliveredQuantity: number;
  remainingQuantity: number;
  status: TransferStatus;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  businessDate: string;
  fulfillments: TransferFulfillment[];
  completedBy?: string;
  completedByName?: string;
  completedAt?: string;
  cancelReason?: string;
  note?: string;
}

/* ------------------------------------------------------------------ */
/* გაყიდვები                                                           */
/* ------------------------------------------------------------------ */

export type PaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'DEBT';

export interface SaleItem {
  id: string;
  productId: string;
  productName: string;
  productCode: string;
  unitSymbol: string;
  quantity: number;
  sellingPriceTetri: number; // ფაქტობრივი ფასი
  listPriceTetri: number; // რეგისტრირებული ფასი
  lineTotalTetri: number;
  costTotalTetri: number;
  profitTetri: number;
  location: StockLocation;
}

export interface Sale {
  id: string;
  saleNo: string; // SAL-2026-000001
  date: string;
  businessDate: string;
  shiftId?: string;
  soldByUserId: string;
  soldByName: string;
  receivedByName: string;
  receivedByPhone?: string;
  comment?: string;
  items: SaleItem[];
  subtotalTetri: number;
  discountTetri: number;
  grandTotalTetri: number;
  costTotalTetri: number;
  grossProfitTetri: number;
  paymentMethod: PaymentMethod;
  paidTetri: number;
  balanceDueTetri: number;
  status: 'active' | 'cancelled' | 'returned' | 'partially_returned';
  cancelReason?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  createdAt: string;
}

export interface ReturnItem {
  saleItemId: string;
  productId: string;
  productName: string;
  unitSymbol: string;
  quantity: number;
  unitPriceTetri: number;
  refundTetri: number;
  unitCostTetri: number;
  costTetri: number;
  disposition: 'RESTOCK' | 'WASTE';
}

export interface SaleReturn {
  id: string;
  returnNo: string; // RET-2026-000001
  saleId: string;
  saleNo: string;
  date: string;
  businessDate: string;
  items: ReturnItem[];
  totalRefundTetri: number;
  totalCostTetri: number;
  paymentMethod: PaymentMethod;
  reason: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* შეკვეთები                                                           */
/* ------------------------------------------------------------------ */

export type OrderStatus = 'NEW' | 'PREPARING' | 'READY' | 'FULFILLED' | 'CANCELLED';

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  unitSymbol: string;
  quantity: number;
  priceTetri: number;
  lineTotalTetri: number;
}

export interface OrderPayment {
  id: string;
  amountTetri: number;
  paymentMethod: PaymentMethod;
  date: string;
  byUserId: string;
  byUserName: string;
  comment?: string;
}

export interface Order {
  id: string;
  orderNo: string; // ORD-2026-000001
  customerName: string;
  customerPhone?: string;
  date: string;
  businessDate: string;
  /** როდის უნდა იყოს მზად. */
  dueDate?: string;
  items: OrderItem[];
  totalTetri: number;
  paidTetri: number;
  balanceDueTetri: number;
  payments: OrderPayment[];
  status: OrderStatus;
  comment?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  fulfilledAt?: string;
  fulfilledBy?: string;
  fulfilledByName?: string;
  saleId?: string;
  saleNo?: string;
  cancelReason?: string;
}

/* ------------------------------------------------------------------ */
/* ხარჯები & სალარო                                                    */
/* ------------------------------------------------------------------ */

export interface ExpenseCategory {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
}

export interface Expense {
  id: string;
  documentNo: string; // EXP-2026-000001
  categoryId: string;
  categoryName: string;
  amountTetri: number;
  reason: string;
  recipient?: string;
  paymentMethod: PaymentMethod;
  comment?: string;
  date: string;
  businessDate: string;
  shiftId?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface CashMovement {
  id: string;
  type: 'CASH_IN' | 'CASH_OUT';
  amountTetri: number;
  reason: string;
  shiftId?: string;
  date: string;
  businessDate: string;
  createdBy: string;
  createdByName: string;
}

export interface CashierShift {
  id: string;
  userId: string;
  userName: string;
  openedAt: string;
  closedAt?: string;
  businessDate: string;
  openingCashTetri: number;
  expectedClosingCashTetri?: number;
  actualClosingCashTetri?: number;
  differenceTetri?: number;
  salesCountSnapshot?: number;
  salesTotalTetri?: number;
  cashSalesTetri?: number;
  cardSalesTetri?: number;
  transferSalesTetri?: number;
  debtSalesTetri?: number;
  cashExpensesTetri?: number;
  cashRefundsTetri?: number;
  cashInTetri?: number;
  cashOutTetri?: number;
  comment?: string;
  status: 'open' | 'closed';
}

/* ------------------------------------------------------------------ */
/* დღის დახურვა                                                        */
/* ------------------------------------------------------------------ */

export interface DaySummary {
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
  purchasesTetri: number;
  productionBatches: number;
  producedUnits: number;
  wasteUnits: number;
  materialCostTetri: number;
  expectedCashTetri: number;
  actualCashTetri: number;
  cashDifferenceTetri: number;
}

export interface BusinessDay {
  id: string; // YYYY-MM-DD
  businessDate: string;
  status: 'OPEN' | 'CLOSED';
  summarySnapshot?: DaySummary;
  closedBy?: string;
  closedByName?: string;
  closedAt?: string;
  reopenedBy?: string;
  reopenedByName?: string;
  reopenedAt?: string;
  reopenReason?: string;
}

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

export interface AuditLog {
  id: string;
  timestamp: string;
  businessDate: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  metadata?: Record<string, unknown>;
  seq: number;
}

/* ------------------------------------------------------------------ */
/* ფასების ისტორია                                                     */
/* ------------------------------------------------------------------ */

export interface PriceHistory {
  id: string;
  productId: string;
  productName: string;
  oldPriceTetri: number;
  newPriceTetri: number;
  changedBy: string;
  changedByName: string;
  reason?: string;
  date: string;
}

/* ------------------------------------------------------------------ */
/* პარამეტრები                                                         */
/* ------------------------------------------------------------------ */

export interface AppSettings {
  companyName: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
  bankName?: string;
  iban?: string;
  logo?: string;
  documentHeader?: string;
  documentFooter?: string;

  smallBreadWeightGrams: number;
  largeBreadWeightGrams: number;

  allowNegativeStock: boolean;
  allowAnonymousSale: boolean;
  requireShiftForSale: boolean;
  requireOpenBusinessDay: boolean;
  currencySymbol: string;
}

export interface Counters {
  sale: number;
  order: number;
  purchase: number;
  production: number;
  transfer: number;
  return: number;
  expense: number;
  stocktake: number;
  year: number;
}
