/**
 * PDF-ების გენერაცია (jsPDF) — ქართული Unicode-ის სრული მხარდაჭერით.
 * ფონტი (Noto Sans Georgian) იტვირთება `public/fonts/`-იდან და ჩაეშენება
 * PDF-ში, ამიტომ ასოები კვადრატებად არასდროს გამოჩნდება.
 */
import { jsPDF } from 'jspdf';
import { formatDateTime } from './dates';
import { formatMoney, formatQty } from './money';
import type { AppSettings, ProductionBatch, Sale, TransferRequest } from '../types';

const FONT_REGULAR = 'NotoSansGeorgian';
let fontCache: { regular: string; bold: string } | null = null;

async function fetchFontBase64(file: string): Promise<string> {
  const res = await fetch(`${import.meta.env.BASE_URL}fonts/${file}`);
  if (!res.ok) throw new Error('ქართული ფონტის ჩატვირთვა ვერ მოხერხდა');
  const buf = await res.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadFonts(): Promise<{ regular: string; bold: string }> {
  if (fontCache) return fontCache;
  const [regular, bold] = await Promise.all([
    fetchFontBase64('NotoSansGeorgian-Regular.ttf'),
    fetchFontBase64('NotoSansGeorgian-Bold.ttf')
  ]);
  fontCache = { regular, bold };
  return fontCache;
}

async function createDoc(format: 'a4' | 'receipt'): Promise<jsPDF> {
  const doc =
    format === 'a4'
      ? new jsPDF({ unit: 'mm', format: 'a4' })
      : new jsPDF({ unit: 'mm', format: [80, 297] });

  const fonts = await loadFonts();
  doc.addFileToVFS('NotoSansGeorgian-Regular.ttf', fonts.regular);
  doc.addFont('NotoSansGeorgian-Regular.ttf', FONT_REGULAR, 'normal');
  doc.addFileToVFS('NotoSansGeorgian-Bold.ttf', fonts.bold);
  doc.addFont('NotoSansGeorgian-Bold.ttf', FONT_REGULAR, 'bold');
  doc.setFont(FONT_REGULAR, 'normal');
  return doc;
}

function fileDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'ნაღდი',
  CARD: 'ბარათი',
  BANK_TRANSFER: 'საბანკო გადარიცხვა',
  DEBT: 'დავალიანება'
};

/* ------------------------------------------------------------------ */
/* A4 ზედნადები                                                        */
/* ------------------------------------------------------------------ */

export async function generateWaybillPdf(sale: Sale, settings: AppSettings): Promise<{ blob: Blob; fileName: string }> {
  const doc = await createDoc('a4');
  const W = 210;
  const M = 14;
  let y = 18;

  doc.setFont(FONT_REGULAR, 'bold');
  doc.setFontSize(15);
  doc.text(settings.companyName || 'საცხობი', M, y);

  doc.setFont(FONT_REGULAR, 'normal');
  doc.setFontSize(9);
  y += 6;
  const companyLines = [
    settings.taxId ? `ს/კ: ${settings.taxId}` : '',
    settings.address,
    settings.phone ? `ტელ: ${settings.phone}` : '',
    settings.email
  ].filter(Boolean);
  companyLines.forEach((line) => {
    doc.text(String(line), M, y);
    y += 4.5;
  });

  doc.setFont(FONT_REGULAR, 'bold');
  doc.setFontSize(13);
  doc.text('სასაქონლო ზედნადები', W - M, 18, { align: 'right' });
  doc.setFont(FONT_REGULAR, 'normal');
  doc.setFontSize(10);
  doc.text(`№ ${sale.saleNo}`, W - M, 25, { align: 'right' });
  doc.text(formatDateTime(sale.date), W - M, 30.5, { align: 'right' });

  y = Math.max(y, 38);
  doc.setDrawColor(180);
  doc.line(M, y, W - M, y);
  y += 7;

  doc.setFontSize(9.5);
  doc.text(`გამყიდველი / მოლარე: ${sale.soldByName}`, M, y);
  doc.text(`გადახდა: ${PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod}`, W - M, y, { align: 'right' });
  y += 5.5;
  doc.text(`ჩაიბარა: ${sale.receivedByName}`, M, y);
  if (sale.receivedByPhone) doc.text(`ტელ: ${sale.receivedByPhone}`, W - M, y, { align: 'right' });
  y += 5.5;
  if (sale.comment) {
    doc.text(`კომენტარი: ${sale.comment}`, M, y);
    y += 5.5;
  }

  y += 3;
  // ცხრილის თავსართი
  const cols = [M, M + 10, M + 92, M + 118, M + 148, W - M];
  doc.setFillColor(241, 245, 249);
  doc.rect(M, y - 5, W - 2 * M, 8, 'F');
  doc.setFont(FONT_REGULAR, 'bold');
  doc.setFontSize(8.5);
  doc.text('#', cols[0] + 2, y);
  doc.text('დასახელება', cols[1], y);
  doc.text('რაოდ.', cols[2], y);
  doc.text('ერთეული', cols[3], y);
  doc.text('ფასი', cols[4], y);
  doc.text('ჯამი', cols[5] - 2, y, { align: 'right' });
  y += 7;

  doc.setFont(FONT_REGULAR, 'normal');
  sale.items.forEach((item, idx) => {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.text(String(idx + 1), cols[0] + 2, y);
    doc.text(item.productName.slice(0, 40), cols[1], y);
    doc.text(formatQty(item.quantity), cols[2], y);
    doc.text(item.unitSymbol, cols[3], y);
    doc.text(formatMoney(item.sellingPriceTetri, false), cols[4], y);
    doc.text(formatMoney(item.lineTotalTetri, false), cols[5] - 2, y, { align: 'right' });
    y += 6;
    doc.setDrawColor(226, 232, 240);
    doc.line(M, y - 4, W - M, y - 4);
  });

  y += 4;
  const totalsX = W - M - 60;
  doc.setFontSize(9.5);
  doc.text('ჯამი:', totalsX, y);
  doc.text(formatMoney(sale.subtotalTetri), W - M, y, { align: 'right' });
  y += 5.5;
  if (sale.discountTetri > 0) {
    doc.text('ფასდაკლება:', totalsX, y);
    doc.text(`− ${formatMoney(sale.discountTetri)}`, W - M, y, { align: 'right' });
    y += 5.5;
  }
  doc.setFont(FONT_REGULAR, 'bold');
  doc.setFontSize(11.5);
  doc.text('სულ გადასახდელი:', totalsX, y);
  doc.text(formatMoney(sale.grandTotalTetri), W - M, y, { align: 'right' });

  y += 18;
  doc.setFont(FONT_REGULAR, 'normal');
  doc.setFontSize(9);
  doc.text('გაცემულია:', M, y);
  doc.line(M + 22, y + 1, M + 80, y + 1);
  doc.text('ჩაბარებულია:', W - M - 80, y);
  doc.line(W - M - 55, y + 1, W - M, y + 1);
  y += 6;
  doc.setFontSize(7.5);
  doc.setTextColor(120);
  doc.text(sale.soldByName, M + 22, y);
  doc.text(sale.receivedByName, W - M - 55, y);

  if (settings.documentFooter) {
    doc.setTextColor(100);
    doc.setFontSize(8);
    doc.text(String(settings.documentFooter), M, 285);
  }

  const fileName = `waybill-${fileDate(sale.date)}-${sale.saleNo}.pdf`;
  return { blob: doc.output('blob'), fileName };
}

/* ------------------------------------------------------------------ */
/* 80mm ქვითარი                                                        */
/* ------------------------------------------------------------------ */

export async function generateReceiptPdf(sale: Sale, settings: AppSettings): Promise<{ blob: Blob; fileName: string }> {
  const doc = await createDoc('receipt');
  const W = 80;
  const M = 5;
  let y = 10;

  doc.setFont(FONT_REGULAR, 'bold');
  doc.setFontSize(11);
  doc.text(settings.companyName || 'საცხობი', W / 2, y, { align: 'center' });
  doc.setFont(FONT_REGULAR, 'normal');
  doc.setFontSize(7.5);
  y += 5;
  if (settings.address) {
    doc.text(String(settings.address), W / 2, y, { align: 'center' });
    y += 4;
  }
  if (settings.phone) {
    doc.text(`ტელ: ${settings.phone}`, W / 2, y, { align: 'center' });
    y += 4;
  }

  doc.setDrawColor(150);
  doc.line(M, y, W - M, y);
  y += 5;
  doc.setFontSize(8);
  doc.text(`ქვითარი № ${sale.saleNo}`, M, y);
  y += 4;
  doc.text(formatDateTime(sale.date), M, y);
  y += 4;
  doc.text(`მოლარე: ${sale.soldByName}`, M, y);
  y += 4;
  doc.text(`ჩაიბარა: ${sale.receivedByName}`, M, y);
  y += 3;
  doc.line(M, y, W - M, y);
  y += 5;

  sale.items.forEach((item) => {
    doc.text(item.productName.slice(0, 30), M, y);
    y += 4;
    doc.text(`${formatQty(item.quantity)} ${item.unitSymbol} × ${formatMoney(item.sellingPriceTetri, false)}`, M + 2, y);
    doc.text(formatMoney(item.lineTotalTetri, false), W - M, y, { align: 'right' });
    y += 5;
  });

  doc.line(M, y, W - M, y);
  y += 5;
  if (sale.discountTetri > 0) {
    doc.text('ფასდაკლება', M, y);
    doc.text(`− ${formatMoney(sale.discountTetri, false)}`, W - M, y, { align: 'right' });
    y += 4.5;
  }
  doc.setFont(FONT_REGULAR, 'bold');
  doc.setFontSize(10);
  doc.text('სულ', M, y);
  doc.text(formatMoney(sale.grandTotalTetri), W - M, y, { align: 'right' });
  y += 6;
  doc.setFont(FONT_REGULAR, 'normal');
  doc.setFontSize(8);
  doc.text(`გადახდა: ${PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod}`, M, y);
  y += 7;
  doc.setFontSize(7.5);
  doc.text(settings.documentFooter || 'გმადლობთ!', W / 2, y, { align: 'center' });

  const fileName = `receipt-${fileDate(sale.date)}-${sale.saleNo}.pdf`;
  return { blob: doc.output('blob'), fileName };
}

/* ------------------------------------------------------------------ */
/* შიდა გადატანის ფურცელი                                              */
/* ------------------------------------------------------------------ */

export async function generateTransferSheetPdf(
  request: TransferRequest,
  settings: AppSettings
): Promise<{ blob: Blob; fileName: string }> {
  const doc = await createDoc('a4');
  const W = 210;
  const M = 16;
  let y = 20;

  doc.setFont(FONT_REGULAR, 'bold');
  doc.setFontSize(14);
  doc.text(settings.companyName || 'საცხობი', M, y);
  doc.setFontSize(13);
  doc.text('შიდა გადატანის ფურცელი', W - M, y, { align: 'right' });
  y += 10;

  doc.setFont(FONT_REGULAR, 'normal');
  doc.setFontSize(10);
  doc.text(`დოკუმენტი: ${request.requestNo}`, M, y);
  doc.text(formatDateTime(request.requestedAt), W - M, y, { align: 'right' });
  y += 7;
  doc.text(`საიდან: ${request.fromLocation === 'LOWER_FLOOR' ? 'ქვედა სართული' : 'ზედა სართული'}`, M, y);
  doc.text(`სად: ${request.toLocation === 'UPPER_FLOOR' ? 'ზედა სართული' : 'ქვედა სართული'}`, W / 2, y);
  y += 7;
  doc.text(`მოითხოვა: ${request.requestedByName}`, M, y);
  y += 10;

  doc.setFillColor(241, 245, 249);
  doc.rect(M, y - 5, W - 2 * M, 8, 'F');
  doc.setFont(FONT_REGULAR, 'bold');
  doc.setFontSize(9);
  doc.text('პროდუქტი', M + 2, y);
  doc.text('მოთხოვნილი', M + 90, y);
  doc.text('ატანილი', M + 125, y);
  doc.text('დარჩენილი', M + 155, y);
  y += 8;

  doc.setFont(FONT_REGULAR, 'normal');
  doc.text(request.productName, M + 2, y);
  doc.text(`${formatQty(request.requestedQuantity)} ${request.unitSymbol}`, M + 90, y);
  doc.text(`${formatQty(request.deliveredQuantity)} ${request.unitSymbol}`, M + 125, y);
  doc.text(`${formatQty(request.remainingQuantity)} ${request.unitSymbol}`, M + 155, y);
  y += 12;

  if (request.fulfillments.length) {
    doc.setFont(FONT_REGULAR, 'bold');
    doc.text('შესრულებები:', M, y);
    y += 6;
    doc.setFont(FONT_REGULAR, 'normal');
    doc.setFontSize(9);
    request.fulfillments.forEach((f) => {
      doc.text(`• ${formatDateTime(f.at)} — ${f.byUserName}: ${formatQty(f.quantity)} ${request.unitSymbol}`, M + 2, y);
      y += 5.5;
    });
  }

  y += 14;
  doc.setFontSize(9);
  doc.text('გასცა:', M, y);
  doc.line(M + 16, y + 1, M + 75, y + 1);
  doc.text('მიიღო:', W - M - 75, y);
  doc.line(W - M - 58, y + 1, W - M, y + 1);

  const fileName = `transfer-${fileDate(request.requestedAt)}-${request.requestNo}.pdf`;
  return { blob: doc.output('blob'), fileName };
}

/* ------------------------------------------------------------------ */
/* წარმოების ფურცელი                                                   */
/* ------------------------------------------------------------------ */

export async function generateProductionSheetPdf(
  batch: ProductionBatch,
  settings: AppSettings,
  showCost: boolean
): Promise<{ blob: Blob; fileName: string }> {
  const doc = await createDoc('a4');
  const W = 210;
  const M = 16;
  let y = 20;

  doc.setFont(FONT_REGULAR, 'bold');
  doc.setFontSize(14);
  doc.text(settings.companyName || 'საცხობი', M, y);
  doc.setFontSize(13);
  doc.text('წარმოების ფურცელი', W - M, y, { align: 'right' });
  y += 10;

  doc.setFont(FONT_REGULAR, 'normal');
  doc.setFontSize(10);
  doc.text(`დოკუმენტი: ${batch.batchNo}`, M, y);
  doc.text(formatDateTime(batch.date), W - M, y, { align: 'right' });
  y += 7;
  doc.text(`პროდუქტი: ${batch.productName}`, M, y);
  y += 6;
  doc.text(`სართული: ${batch.floor === 'LOWER_FLOOR' ? 'ქვედა' : 'ზედა'}`, M, y);
  doc.text(`მცხობელი: ${batch.bakerName}`, W / 2, y);
  y += 6;
  doc.text(`გამოცხვა: ${formatQty(batch.producedGoodQty)} | დანაკარგი: ${formatQty(batch.wasteQty)}`, M, y);
  if (batch.weightGramsSnapshot) doc.text(`გრამაჟი: ${batch.weightGramsSnapshot} გ`, W / 2, y);
  y += 10;

  doc.setFont(FONT_REGULAR, 'bold');
  doc.text('დახარჯული მასალები', M, y);
  y += 7;
  doc.setFont(FONT_REGULAR, 'normal');
  doc.setFontSize(9);
  batch.consumptions.forEach((c) => {
    doc.text(`• ${c.materialName} — ${formatQty(c.quantity)} ${c.unitSymbol} (${c.location === 'FRIDGE' ? 'მაცივარი' : 'საწყობი'})`, M + 2, y);
    if (showCost) doc.text(formatMoney(c.costTetri), W - M, y, { align: 'right' });
    y += 5.5;
  });

  if (showCost) {
    y += 5;
    doc.setFont(FONT_REGULAR, 'bold');
    doc.setFontSize(10);
    doc.text('სულ მასალის ღირებულება:', M, y);
    doc.text(formatMoney(batch.totalMaterialCostTetri), W - M, y, { align: 'right' });
    y += 6;
    doc.text('ერთეულის თვითღირებულება:', M, y);
    doc.text(formatMoney(batch.unitProductionCostTetri), W - M, y, { align: 'right' });
  }

  const fileName = `production-${fileDate(batch.date)}-${batch.batchNo}.pdf`;
  return { blob: doc.output('blob'), fileName };
}

/* ------------------------------------------------------------------ */

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
