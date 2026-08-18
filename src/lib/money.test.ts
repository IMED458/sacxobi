import { describe, expect, it } from 'vitest';
import { marginPercent, roundQty, toGel, toTetri } from './money';

describe('money', () => {
  it('ლარს მთელ თეთრად გარდაქმნის (floating-point-ის გარეშე)', () => {
    expect(toTetri(1.5)).toBe(150);
    expect(toTetri('1,62')).toBe(162);
    expect(toTetri(0.1 + 0.2)).toBe(30);
    expect(toTetri('')).toBe(0);
  });

  it('უკან ლარად აბრუნებს', () => {
    expect(toGel(150)).toBe(1.5);
    expect(toGel(1)).toBe(0.01);
  });

  it('რაოდენობას 3 ათწილადამდე ამრგვალებს', () => {
    expect(roundQty(1.23456)).toBe(1.235);
  });

  it('მარჟას პროცენტებში ითვლის', () => {
    expect(marginPercent(105, 300)).toBe(35);
    expect(marginPercent(10, 0)).toBe(0);
  });
});
