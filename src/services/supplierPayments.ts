/**
 * მომწოდებელთან ანგარიშსწორება.
 *
 * გადახდა შეიძლება დაიშალოს კონკრეტულ შესყიდვის დოკუმენტებზე/პროდუქტებზე —
 * ე.ი. ჩანს, რომელი საქონლისთვის რამდენი გადაიხადა. დოკუმენტზე მიბმული
 * თანხა ავტომატურად ამცირებს იმ შესყიდვის დავალიანებას.
 */
import { getDocs, query, runTransaction, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { businessDateOf } from '../lib/dates';
import { assertPermission } from '../lib/permissions';
import type { AppUser, PaymentMethod, Purchase, Supplier, SupplierPayment, SupplierPaymentLine } from '../types';
import { COL, clean, colRef, docRef, newId } from './db';
import { logAuditTx } from './audit';

/** მომწოდებლის დაუფარავი შესყიდვები. */
export async function fetchOpenPurchases(supplierId: string): Promise<Purchase[]> {
  const snap = await getDocs(query(colRef(COL.purchases), where('supplierId', '==', supplierId)));
  return snap.docs
    .map((d) => d.data() as Purchase)
    .filter((p) => p.status === 'completed' && p.balanceTetri > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchSupplierPayments(supplierId: string): Promise<SupplierPayment[]> {
  const snap = await getDocs(query(colRef(COL.supplierPayments), where('supplierId', '==', supplierId)));
  return snap.docs.map((d) => d.data() as SupplierPayment).sort((a, b) => b.date.localeCompare(a.date));
}

export interface SupplierPaymentInput {
  supplierId: string;
  lines: SupplierPaymentLine[];
  paymentMethod: PaymentMethod;
  comment?: string;
  date?: string;
}

export async function paySupplier(user: AppUser, input: SupplierPaymentInput): Promise<SupplierPayment> {
  assertPermission(user, 'supplier.manage');
  const lines = input.lines.filter((l) => l.amountTetri > 0);
  if (!lines.length) throw new Error('მიუთითეთ გადასახდელი თანხა');

  const totalTetri = lines.reduce((s, l) => s + Math.round(l.amountTetri), 0);
  const date = input.date ?? new Date().toISOString();

  return runTransaction(db, async (tx) => {
    // ---- reads ----
    const supplierRef = docRef(COL.suppliers, input.supplierId);
    const supplierSnap = await tx.get(supplierRef);
    if (!supplierSnap.exists()) throw new Error('მომწოდებელი ვერ მოიძებნა');
    const supplier = supplierSnap.data() as Supplier;

    const purchaseIds = [...new Set(lines.map((l) => l.purchaseId).filter((id): id is string => !!id))];
    const purchases = new Map<string, Purchase>();
    for (const id of purchaseIds) {
      const snap = await tx.get(docRef(COL.purchases, id));
      if (snap.exists()) purchases.set(id, snap.data() as Purchase);
    }

    // ---- plan ----
    const perPurchase = new Map<string, number>();
    lines.forEach((l) => {
      if (!l.purchaseId) return;
      perPurchase.set(l.purchaseId, (perPurchase.get(l.purchaseId) ?? 0) + Math.round(l.amountTetri));
    });
    for (const [id, amount] of perPurchase) {
      const purchase = purchases.get(id);
      if (!purchase) continue;
      if (amount > purchase.balanceTetri) {
        throw new Error(`${purchase.documentNo}: გადახდა (${(amount / 100).toFixed(2)} ₾) აღემატება დავალიანებას`);
      }
    }

    const payment: SupplierPayment = clean({
      id: newId('spay'),
      supplierId: supplier.id,
      supplierName: supplier.name,
      date,
      businessDate: businessDateOf(date),
      lines: lines.map((l) => ({ ...l, amountTetri: Math.round(l.amountTetri) })),
      totalTetri,
      paymentMethod: input.paymentMethod,
      comment: input.comment,
      createdBy: user.id,
      createdByName: `${user.firstName} ${user.lastName}`.trim()
    }) as SupplierPayment;

    // ---- writes ----
    for (const [id, amount] of perPurchase) {
      const purchase = purchases.get(id);
      if (!purchase) continue;
      tx.set(
        docRef(COL.purchases, id),
        { paidTetri: purchase.paidTetri + amount, balanceTetri: purchase.balanceTetri - amount },
        { merge: true }
      );
    }
    tx.set(supplierRef, { balanceTetri: supplier.balanceTetri - totalTetri, updatedAt: date }, { merge: true });
    tx.set(docRef(COL.supplierPayments, payment.id), payment);

    logAuditTx(tx, user, {
      action: 'SUPPLIER_PAYMENT',
      entityType: 'supplier',
      entityId: supplier.id,
      summary: `${supplier.name}: გადაიხადა ${(totalTetri / 100).toFixed(2)} ₾ (${lines.length} პოზიცია)`,
      before: { balanceTetri: supplier.balanceTetri },
      after: { balanceTetri: supplier.balanceTetri - totalTetri, lines: payment.lines },
      reason: input.comment
    });

    return payment;
  });
}
