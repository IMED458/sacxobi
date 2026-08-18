/**
 * შეკვეთები — წინასწარი შეკვეთის მიღება, ავანსი და გაცემა.
 *
 * შეკვეთა მარაგს არ ხარჯავს; მარაგი ჩამოიწერება მხოლოდ გაცემისას,
 * როცა შეკვეთა გაყიდვად გარდაიქმნება.
 */
import { getDoc, runTransaction, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { businessDateOf } from '../lib/dates';
import { assertPermission } from '../lib/permissions';
import type {
  AppSettings,
  AppUser,
  FinishedProduct,
  Order,
  OrderItem,
  OrderPayment,
  OrderStatus,
  PaymentMethod
} from '../types';
import { COL, buildDocNo, clean, docRef, newId, readCounters } from './db';
import { logAudit, logAuditTx } from './audit';
import { createSale, resolveSaleLocation } from './sales';
import { getDocs } from 'firebase/firestore';
import { colRef } from './db';
import type { StockLevel } from '../types';

export interface OrderLineInput {
  productId: string;
  productName: string;
  unitSymbol: string;
  quantity: number;
  priceTetri: number;
}

export interface OrderInput {
  customerName: string;
  customerPhone?: string;
  dueDate?: string;
  lines: OrderLineInput[];
  prepaidTetri: number;
  paymentMethod: PaymentMethod;
  comment?: string;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'ახალი',
  PREPARING: 'მზადდება',
  READY: 'მზადაა',
  FULFILLED: 'გაცემული',
  CANCELLED: 'გაუქმებული'
};

export async function createOrder(user: AppUser, input: OrderInput): Promise<Order> {
  assertPermission(user, 'order.manage');
  if (!input.customerName.trim()) throw new Error('მიუთითეთ შემკვეთის სახელი');
  if (!input.lines.length) throw new Error('დაამატეთ მინიმუმ ერთი პოზიცია');
  if (input.lines.some((l) => l.quantity <= 0)) throw new Error('რაოდენობა უნდა იყოს 0-ზე მეტი');

  const now = new Date().toISOString();
  const items: OrderItem[] = input.lines.map((l) => ({
    id: newId('oi'),
    productId: l.productId,
    productName: l.productName,
    unitSymbol: l.unitSymbol,
    quantity: l.quantity,
    priceTetri: Math.round(l.priceTetri),
    lineTotalTetri: Math.round(l.priceTetri * l.quantity)
  }));
  const totalTetri = items.reduce((s, i) => s + i.lineTotalTetri, 0);
  const paidTetri = Math.max(0, Math.round(input.prepaidTetri));

  return runTransaction(db, async (tx) => {
    const counters = await readCounters(tx);
    const { no, counters: nextCounters } = buildDocNo(counters, 'order');

    const payments: OrderPayment[] = paidTetri
      ? [
          {
            id: newId('op'),
            amountTetri: paidTetri,
            paymentMethod: input.paymentMethod,
            date: now,
            byUserId: user.id,
            byUserName: `${user.firstName} ${user.lastName}`.trim(),
            comment: 'ავანსი'
          }
        ]
      : [];

    const order: Order = clean({
      id: newId('ord'),
      orderNo: no,
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone,
      date: now,
      businessDate: businessDateOf(now),
      dueDate: input.dueDate,
      items,
      totalTetri,
      paidTetri,
      balanceDueTetri: totalTetri - paidTetri,
      payments,
      status: 'NEW',
      comment: input.comment,
      createdBy: user.id,
      createdByName: `${user.firstName} ${user.lastName}`.trim(),
      createdAt: now
    }) as Order;

    tx.set(docRef(COL.orders, order.id), order);
    tx.set(docRef(COL.meta, 'counters'), nextCounters);
    logAuditTx(tx, user, {
      action: 'ORDER_CREATED',
      entityType: 'order',
      entityId: order.id,
      summary: `შეკვეთა ${no}: ${order.customerName} — ${items.length} პოზიცია`,
      after: order
    });
    return order;
  });
}

export async function updateOrderStatus(user: AppUser, order: Order, status: OrderStatus): Promise<void> {
  assertPermission(user, 'order.manage');
  if (order.status === 'FULFILLED') throw new Error('გაცემული შეკვეთის სტატუსი აღარ იცვლება');
  await setDoc(docRef(COL.orders, order.id), { status }, { merge: true });
  await logAudit(user, {
    action: 'ORDER_STATUS_CHANGED',
    entityType: 'order',
    entityId: order.id,
    summary: `${order.orderNo}: სტატუსი — ${ORDER_STATUS_LABELS[status]}`,
    before: { status: order.status },
    after: { status }
  });
}

export async function addOrderPayment(
  user: AppUser,
  orderId: string,
  amountTetri: number,
  paymentMethod: PaymentMethod,
  comment?: string
): Promise<void> {
  assertPermission(user, 'order.manage');
  if (amountTetri <= 0) throw new Error('თანხა უნდა იყოს 0-ზე მეტი');

  await runTransaction(db, async (tx) => {
    const ref = docRef(COL.orders, orderId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('შეკვეთა ვერ მოიძებნა');
    const order = snap.data() as Order;
    if (order.status === 'CANCELLED') throw new Error('გაუქმებულ შეკვეთაზე გადახდა შეუძლებელია');

    const payment: OrderPayment = clean({
      id: newId('op'),
      amountTetri: Math.round(amountTetri),
      paymentMethod,
      date: new Date().toISOString(),
      byUserId: user.id,
      byUserName: `${user.firstName} ${user.lastName}`.trim(),
      comment
    }) as OrderPayment;

    const paidTetri = order.paidTetri + payment.amountTetri;
    tx.set(
      ref,
      { payments: [...order.payments, payment], paidTetri, balanceDueTetri: order.totalTetri - paidTetri },
      { merge: true }
    );
    logAuditTx(tx, user, {
      action: 'ORDER_PAYMENT',
      entityType: 'order',
      entityId: orderId,
      summary: `${order.orderNo}: გადახდა ${(payment.amountTetri / 100).toFixed(2)} ₾`,
      after: payment
    });
  });
}

export async function cancelOrder(user: AppUser, order: Order, reason: string): Promise<void> {
  assertPermission(user, 'order.manage');
  if (!reason.trim()) throw new Error('მიუთითეთ გაუქმების მიზეზი');
  if (order.status === 'FULFILLED') throw new Error('გაცემული შეკვეთის გაუქმება შეუძლებელია');
  await setDoc(docRef(COL.orders, order.id), { status: 'CANCELLED', cancelReason: reason.trim() }, { merge: true });
  await logAudit(user, {
    action: 'ORDER_CANCELLED',
    entityType: 'order',
    entityId: order.id,
    summary: `${order.orderNo}: შეკვეთა გაუქმდა`,
    before: { status: order.status },
    reason: reason.trim()
  });
}

/**
 * შეკვეთის გაცემა — იქმნება რეალური გაყიდვა (მარაგი ჩამოიწერება,
 * COGS და მოგება ითვლება), შეკვეთა კი ხდება „გაცემული".
 */
export async function fulfillOrder(
  user: AppUser,
  settings: AppSettings,
  order: Order,
  products: FinishedProduct[],
  options: { receivedByName: string; receivedByPhone?: string; paymentMethod: PaymentMethod; shiftId?: string }
): Promise<{ saleNo: string }> {
  assertPermission(user, 'order.fulfill');
  if (order.status === 'FULFILLED') throw new Error('შეკვეთა უკვე გაცემულია');
  if (order.status === 'CANCELLED') throw new Error('შეკვეთა გაუქმებულია');

  const levelsSnap = await getDocs(colRef(COL.stockLevels));
  const levels = levelsSnap.docs.map((d) => d.data() as StockLevel);
  const qtyAt = (productId: string, location: string) =>
    levels.find((l) => l.id === `PRODUCT__${productId}__${location}`)?.quantity ?? 0;

  const lines = order.items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    if (!product) throw new Error(`პროდუქტი ვერ მოიძებნა: ${item.productName}`);
    return {
      product,
      quantity: item.quantity,
      priceTetri: item.priceTetri,
      location: resolveSaleLocation(product, (loc) => qtyAt(product.id, loc))
    };
  });

  const sale = await createSale(user, settings, {
    lines,
    discountTetri: 0,
    paymentMethod: options.paymentMethod,
    paidTetri: order.paidTetri,
    receivedByName: options.receivedByName || order.customerName,
    receivedByPhone: options.receivedByPhone ?? order.customerPhone,
    comment: `შეკვეთა ${order.orderNo}`,
    shiftId: options.shiftId
  });

  const now = new Date().toISOString();
  await setDoc(
    docRef(COL.orders, order.id),
    clean({
      status: 'FULFILLED',
      fulfilledAt: now,
      fulfilledBy: user.id,
      fulfilledByName: `${user.firstName} ${user.lastName}`.trim(),
      saleId: sale.id,
      saleNo: sale.saleNo,
      paidTetri: order.totalTetri,
      balanceDueTetri: 0
    }),
    { merge: true }
  );

  await logAudit(user, {
    action: 'ORDER_FULFILLED',
    entityType: 'order',
    entityId: order.id,
    summary: `${order.orderNo} გაიცა — გაყიდვა ${sale.saleNo}, ჩაიბარა ${sale.receivedByName}`,
    after: { saleNo: sale.saleNo }
  });

  return { saleNo: sale.saleNo };
}

export async function fetchOrder(orderId: string): Promise<Order | null> {
  const snap = await getDoc(docRef(COL.orders, orderId));
  return snap.exists() ? (snap.data() as Order) : null;
}
