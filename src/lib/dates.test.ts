import { describe, expect, it } from 'vitest';
import { addDays, businessDateOf, endOfMonth, resolveRange, startOfMonth, startOfWeek } from './dates';

describe('ბიზნეს-დღე (Asia/Tbilisi)', () => {
  it('UTC-ის შუაღამის შემდეგ თბილისში უკვე მომდევნო დღეა', () => {
    // 2026-08-18 21:30 UTC = 2026-08-19 01:30 თბილისში
    expect(businessDateOf('2026-08-18T21:30:00.000Z')).toBe('2026-08-19');
  });

  it('UTC-ის დილა იმავე დღეს რჩება', () => {
    expect(businessDateOf('2026-08-18T06:00:00.000Z')).toBe('2026-08-18');
  });

  it('addDays სწორად ითვლის თვის საზღვარზე', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('კვირა ორშაბათიდან იწყება', () => {
    // 2026-08-19 — ოთხშაბათი
    expect(startOfWeek('2026-08-19')).toBe('2026-08-17');
  });

  it('თვის საზღვრები', () => {
    expect(startOfMonth('2026-08-19')).toBe('2026-08-01');
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
  });

  it('პრესეტები', () => {
    expect(resolveRange('today', '2026-08-19')).toEqual({ from: '2026-08-19', to: '2026-08-19' });
    expect(resolveRange('yesterday', '2026-08-19')).toEqual({ from: '2026-08-18', to: '2026-08-18' });
    expect(resolveRange('this_month', '2026-08-19')).toEqual({ from: '2026-08-01', to: '2026-08-19' });
  });
});
