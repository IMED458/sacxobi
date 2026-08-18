/**
 * ფული ინახება მთელ თეთრში. აქ თავმოყრილია ყველა კონვერტაცია/დამრგვალება.
 */

export const CURRENCY = '₾';

/** ლარი (რიცხვი ან ტექსტი) → მთელი თეთრი. */
export function toTetri(gel: number | string): number {
  const n = typeof gel === 'string' ? parseFloat(gel.replace(',', '.')) : gel;
  if (!isFinite(n as number)) return 0;
  return Math.round((n as number) * 100);
}

/** თეთრი → ლარი (number). */
export function toGel(tetri: number): number {
  return Math.round(tetri) / 100;
}

/** თეთრი → ფორმატირებული ტექსტი: „1 234.50 ₾". */
export function formatMoney(tetri: number | undefined | null, withSymbol = true): string {
  const v = toGel(Number(tetri) || 0);
  const s = v.toLocaleString('ka-GE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return withSymbol ? `${s} ${CURRENCY}` : s;
}

/** თეთრი → input-ისთვის ვარგისი ტექსტი (სიმბოლოს გარეშე). */
export function tetriToInput(tetri: number | undefined | null): string {
  return (Math.round(Number(tetri) || 0) / 100).toFixed(2);
}

/** რაოდენობის დამრგვალება — 3 ათწილადი (გრამი/მილილიტრი საკმარისია). */
export function roundQty(q: number): number {
  return Math.round((Number(q) || 0) * 1000) / 1000;
}

export function formatQty(q: number | undefined | null, unit?: string): string {
  const v = roundQty(Number(q) || 0);
  const s = v.toLocaleString('ka-GE', { maximumFractionDigits: 3 });
  return unit ? `${s} ${unit}` : s;
}

/** უსაფრთხო გაყოფა — 0-ზე გაყოფისას აბრუნებს 0-ს. */
export function safeDiv(a: number, b: number): number {
  if (!b) return 0;
  return a / b;
}

/** პროცენტი (მარჟა) — 1 ათწილადით. */
export function marginPercent(profitTetri: number, revenueTetri: number): number {
  if (!revenueTetri) return 0;
  return Math.round((profitTetri / revenueTetri) * 1000) / 10;
}
