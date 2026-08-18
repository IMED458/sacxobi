import { describe, expect, it } from 'vitest';
import { buildDocNo, clean, DEFAULT_COUNTERS } from './db';
import { currentYear } from '../lib/dates';

describe('დოკუმენტის ნომრები', () => {
  it('წელი მიმდინარე ბიზნეს-წლიდან მოდის (არა hardcoded)', () => {
    const { no } = buildDocNo({ ...DEFAULT_COUNTERS }, 'sale');
    expect(no).toBe(`SAL-${currentYear()}-000001`);
  });

  it('ნუმერაცია იზრდება', () => {
    const first = buildDocNo({ ...DEFAULT_COUNTERS }, 'purchase');
    const second = buildDocNo(first.counters, 'purchase');
    expect(second.no).toBe(`PUR-${currentYear()}-000002`);
  });

  it('ახალ წელს ნუმერაცია იწყება თავიდან', () => {
    const stale = { ...DEFAULT_COUNTERS, sale: 42, year: currentYear() - 1 };
    const { no } = buildDocNo(stale, 'sale');
    expect(no).toBe(`SAL-${currentYear()}-000001`);
  });
});

describe('clean', () => {
  it('undefined-ს რეკურსიულად შლის (Firestore მას არ იღებს)', () => {
    expect(clean({ a: 1, b: undefined, c: { d: undefined, e: 2 }, f: [{ g: undefined, h: 3 }] })).toEqual({
      a: 1,
      c: { e: 2 },
      f: [{ h: 3 }]
    });
  });
});
