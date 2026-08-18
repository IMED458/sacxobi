import { describe, expect, it } from 'vitest';
import { allocateFifo, stockKey, unitCostFromBatch, type LotLike } from './inventory';

const lot = (id: string, qty: number, cost: number, seq: number): LotLike => ({
  id,
  quantityRemaining: qty,
  remainingCostTetri: cost,
  seq
});

describe('allocateFifo', () => {
  it('ყველაზე ძველი პარტიიდან იწყებს ჩამოწერას', () => {
    const lots = [lot('b', 50, 8500, 2), lot('a', 100, 15000, 1)];
    const res = allocateFifo(lots, 60);
    expect(res.shortage).toBe(0);
    expect(res.allocations).toEqual([{ lotId: 'a', quantity: 60, costTetri: 9000 }]);
    expect(res.totalCostTetri).toBe(9000);
  });

  it('რამდენიმე პარტიას კვეთს და ღირებულებას სწორად ითვლის', () => {
    // 100კგ × 1.50₾ და 50კგ × 1.70₾
    const lots = [lot('a', 100, 15000, 1), lot('b', 50, 8500, 2)];
    const res = allocateFifo(lots, 120);
    expect(res.shortage).toBe(0);
    expect(res.allocations).toEqual([
      { lotId: 'a', quantity: 100, costTetri: 15000 },
      { lotId: 'b', quantity: 20, costTetri: 3400 }
    ]);
    expect(res.totalCostTetri).toBe(18400); // 150₾ + 34₾
  });

  it('პარტიის სრულად ამოწურვისას ზუსტად დარჩენილ ღირებულებას იღებს (drift-ის გარეშე)', () => {
    const lots = [lot('a', 3, 1000, 1)]; // 1000 თეთრი / 3 — არ იყოფა მთლიანად
    const first = allocateFifo(lots, 1);
    expect(first.totalCostTetri).toBe(333);
    const remaining = [lot('a', 2, 1000 - 333, 1)];
    const second = allocateFifo(remaining, 2);
    expect(second.totalCostTetri).toBe(667); // ჯამში ზუსტად 1000
  });

  it('დეფიციტს აბრუნებს, როცა მარაგი არ ყოფნის', () => {
    const res = allocateFifo([lot('a', 5, 500, 1)], 8);
    expect(res.shortage).toBeCloseTo(3);
    expect(res.totalCostTetri).toBe(500);
  });

  it('ცარიელი მარაგი — სრული დეფიციტი', () => {
    const res = allocateFifo([], 4);
    expect(res.allocations).toHaveLength(0);
    expect(res.shortage).toBe(4);
  });
});

describe('unitCostFromBatch', () => {
  it('waste-ის ღირებულებას კარგ პროდუქციაზე ანაწილებს', () => {
    // 4000 თეთრი მასალა → 40 კარგი ცალი (10 გაფუჭდა)
    expect(unitCostFromBatch(4000, 40)).toBe(100);
  });

  it('0 გამოსავალზე 0-ს აბრუნებს', () => {
    expect(unitCostFromBatch(4000, 0)).toBe(0);
  });
});

describe('stockKey', () => {
  it('სტაბილურ გასაღებს აწარმოებს', () => {
    expect(stockKey('MATERIAL', 'm1', 'FRIDGE')).toBe('MATERIAL__m1__FRIDGE');
    expect(stockKey('PRODUCT', 'p1', 'UPPER_FLOOR')).toBe('PRODUCT__p1__UPPER_FLOOR');
  });
});
