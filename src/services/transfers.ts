/**
 * სართულებს შორის გადატანა (ქვედა → ზედა).
 * ეს არ არის გაყიდვა — კომპანიის მარაგის ჯამური ღირებულება არ იცვლება,
 * მხოლოდ ადგილმდებარეობა და პარტიის ღირებულება გადმოდის.
 */
import { getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { businessDateOf } from '../lib/dates';
import { roundQty } from '../lib/money';
import { assertPermission } from '../lib/permissions';
import type { AppSettings, AppUser, FinishedProduct, Floor, TransferRequest } from '../types';
import { COL, buildDocNo, clean, docRef, newId, readCounters } from './db';
import { logAuditTx } from './audit';
import { StockOperation } from './inventory';

export interface TransferRequestInput {
  productId: string;
  quantity: number;
  fromLocation?: Floor;
  toLocation?: Floor;
  note?: string;
}

export async function createTransferRequest(user: AppUser, input: TransferRequestInput): Promise<TransferRequest> {
  assertPermission(user, 'transfer.create_request');
  if (input.quantity <= 0) throw new Error('რაოდენობა უნდა იყოს 0-ზე მეტი');

  const now = new Date().toISOString();
  return runTransaction(db, async (tx) => {
    const counters = await readCounters(tx);
    const productSnap = await tx.get(docRef(COL.products, input.productId));
    if (!productSnap.exists()) throw new Error('პროდუქტი ვერ მოიძებნა');
    const product = productSnap.data() as FinishedProduct;

    const { no, counters: nextCounters } = buildDocNo(counters, 'transfer');
    const request: TransferRequest = clean({
      id: newId('trf'),
      requestNo: no,
      fromLocation: input.fromLocation ?? 'LOWER_FLOOR',
      toLocation: input.toLocation ?? 'UPPER_FLOOR',
      productId: product.id,
      productName: product.name,
      unitSymbol: product.unitSymbol,
      requestedQuantity: roundQty(input.quantity),
      deliveredQuantity: 0,
      remainingQuantity: roundQty(input.quantity),
      status: 'PENDING',
      requestedBy: user.id,
      requestedByName: `${user.firstName} ${user.lastName}`.trim(),
      requestedAt: now,
      businessDate: businessDateOf(now),
      fulfillments: [],
      note: input.note
    }) as TransferRequest;

    tx.set(docRef(COL.transferRequests, request.id), request);
    tx.set(docRef(COL.meta, 'counters'), nextCounters);
    logAuditTx(tx, user, {
      action: 'TRANSFER_REQUESTED',
      entityType: 'transferRequest',
      entityId: request.id,
      summary: `მოთხოვნა ${no}: ${product.name} — ${request.requestedQuantity} ${product.unitSymbol} ზედა სართულზე`,
      after: request
    });
    return request;
  });
}

export async function fulfillTransferRequest(
  user: AppUser,
  settings: AppSettings,
  requestId: string,
  quantity: number,
  note?: string
): Promise<TransferRequest> {
  assertPermission(user, 'transfer.fulfill');
  if (quantity <= 0) throw new Error('რაოდენობა უნდა იყოს 0-ზე მეტი');

  // მოთხოვნის საწყისი წაკითხვა — პარტიების მოსამზადებლად ტრანზაქციამდე.
  // საბოლოო შემოწმება მაინც ტრანზაქციაში ხდება.
  const head = await getDoc(docRef(COL.transferRequests, requestId));
  if (!head.exists()) throw new Error('მოთხოვნა ვერ მოიძებნა');
  const preSnap = head.data() as TransferRequest;

  const date = new Date().toISOString();
  const outOp = new StockOperation({
    user,
    referenceType: 'transfer',
    referenceId: requestId,
    referenceNo: preSnap.requestNo,
    date,
    allowNegativeStock: false
  });
  outOp.consume({
    itemType: 'PRODUCT',
    itemId: preSnap.productId,
    itemName: preSnap.productName,
    unitSymbol: preSnap.unitSymbol,
    location: preSnap.fromLocation,
    quantity,
    movementType: 'TRANSFER_OUT'
  });
  await outOp.prepare();

  return runTransaction(db, async (tx) => {
    // ---- reads ----
    const ref = docRef(COL.transferRequests, requestId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('მოთხოვნა ვერ მოიძებნა');
    const request = snap.data() as TransferRequest;
    if (request.status === 'COMPLETED') throw new Error('მოთხოვნა უკვე შესრულებულია');
    if (request.status === 'CANCELLED') throw new Error('მოთხოვნა გაუქმებულია');
    if (roundQty(quantity) > request.remainingQuantity) {
      throw new Error(`მოთხოვნაში დარჩენილია მხოლოდ ${request.remainingQuantity} ${request.unitSymbol}`);
    }
    await outOp.read(tx);

    // ---- plan ----
    const [outcome] = outOp.plan();
    const costTetri = outcome.costTetri;

    const inOp = new StockOperation({
      user,
      referenceType: 'transfer',
      referenceId: requestId,
      referenceNo: request.requestNo,
      date,
      allowNegativeStock: settings.allowNegativeStock
    });
    inOp.receive({
      itemType: 'PRODUCT',
      itemId: request.productId,
      itemName: request.productName,
      unitSymbol: request.unitSymbol,
      location: request.toLocation,
      quantity,
      totalCostTetri: costTetri,
      movementType: 'TRANSFER_IN',
      sourceType: 'TRANSFER'
    });
    await inOp.read(tx);
    inOp.plan();

    const delivered = roundQty(request.deliveredQuantity + quantity);
    const remaining = roundQty(request.requestedQuantity - delivered);
    const status: TransferRequest['status'] = remaining <= 0 ? 'COMPLETED' : 'PARTIAL';

    const next: TransferRequest = clean({
      ...request,
      deliveredQuantity: delivered,
      remainingQuantity: Math.max(0, remaining),
      status,
      fulfillments: [
        ...request.fulfillments,
        {
          id: newId('ff'),
          quantity: roundQty(quantity),
          costTetri,
          byUserId: user.id,
          byUserName: `${user.firstName} ${user.lastName}`.trim(),
          at: date,
          note
        }
      ],
      completedBy: status === 'COMPLETED' ? user.id : request.completedBy,
      completedByName: status === 'COMPLETED' ? `${user.firstName} ${user.lastName}`.trim() : request.completedByName,
      completedAt: status === 'COMPLETED' ? date : request.completedAt
    }) as TransferRequest;

    // ---- writes ----
    outOp.write(tx);
    inOp.write(tx);
    tx.set(ref, next);
    logAuditTx(tx, user, {
      action: status === 'COMPLETED' ? 'TRANSFER_COMPLETED' : 'TRANSFER_PARTIALLY_FULFILLED',
      entityType: 'transferRequest',
      entityId: requestId,
      summary: `${request.requestNo}: აიტანა ${roundQty(quantity)} ${request.unitSymbol} — ${request.productName}`,
      before: { deliveredQuantity: request.deliveredQuantity, status: request.status },
      after: { deliveredQuantity: delivered, status },
      reason: note
    });
    return next;
  });
}

export async function cancelTransferRequest(user: AppUser, requestId: string, reason: string): Promise<void> {
  assertPermission(user, 'transfer.create_request');
  if (!reason.trim()) throw new Error('მიუთითეთ გაუქმების მიზეზი');
  await runTransaction(db, async (tx) => {
    const ref = docRef(COL.transferRequests, requestId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('მოთხოვნა ვერ მოიძებნა');
    const request = snap.data() as TransferRequest;
    if (request.status === 'COMPLETED') throw new Error('შესრულებული მოთხოვნის გაუქმება შეუძლებელია');
    tx.set(ref, { status: 'CANCELLED', cancelReason: reason.trim(), remainingQuantity: 0 }, { merge: true });
    logAuditTx(tx, user, {
      action: 'TRANSFER_CANCELLED',
      entityType: 'transferRequest',
      entityId: requestId,
      summary: `${request.requestNo}: მოთხოვნა გაუქმდა`,
      before: request,
      reason: reason.trim()
    });
  });
}
