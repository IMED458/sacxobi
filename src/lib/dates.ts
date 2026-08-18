/**
 * თარიღები — ბიზნეს-დღე ყოველთვის Asia/Tbilisi-ის მიხედვით ითვლება,
 * ხოლო ბაზაში timestamp ინახება ISO/UTC-ად.
 */

export const TZ = 'Asia/Tbilisi';

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/** ISO/Date → ბიზნეს-დღე „YYYY-MM-DD" თბილისის დროით. */
export function businessDateOf(input: string | Date = new Date()): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return dayFormatter.format(new Date());
  return dayFormatter.format(d);
}

/** მიმდინარე ბიზნეს-დღე. */
export function todayBusinessDate(): string {
  return businessDateOf(new Date());
}

/** მიმდინარე წელი თბილისის დროით (დოკუმენტის ნომრისთვის). */
export function currentYear(): number {
  return Number(todayBusinessDate().slice(0, 4));
}

/** „YYYY-MM-DD" + n დღე. */
export function addDays(businessDate: string, days: number): string {
  const [y, m, d] = businessDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function startOfWeek(businessDate: string): string {
  const [y, m, d] = businessDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // ორშაბათი = 0
  return addDays(businessDate, -dow);
}

export function startOfMonth(businessDate: string): string {
  return businessDate.slice(0, 8) + '01';
}

export function endOfMonth(businessDate: string): string {
  const [y, m] = businessDate.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${businessDate.slice(0, 8)}${String(last).padStart(2, '0')}`;
}

export function startOfYear(businessDate: string): string {
  return businessDate.slice(0, 4) + '-01-01';
}

export function endOfYear(businessDate: string): string {
  return businessDate.slice(0, 4) + '-12-31';
}

export type RangePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'last_year'
  | 'custom';

export const RANGE_LABELS: Record<RangePreset, string> = {
  today: 'დღეს',
  yesterday: 'გუშინ',
  this_week: 'ეს კვირა',
  last_week: 'წინა კვირა',
  this_month: 'ეს თვე',
  last_month: 'წინა თვე',
  this_year: 'ეს წელი',
  last_year: 'წინა წელი',
  custom: 'პერიოდი'
};

export function resolveRange(preset: RangePreset, today = todayBusinessDate()): { from: string; to: string } {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case 'this_week':
      return { from: startOfWeek(today), to: today };
    case 'last_week': {
      const s = addDays(startOfWeek(today), -7);
      return { from: s, to: addDays(s, 6) };
    }
    case 'this_month':
      return { from: startOfMonth(today), to: today };
    case 'last_month': {
      const prev = addDays(startOfMonth(today), -1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    }
    case 'this_year':
      return { from: startOfYear(today), to: today };
    case 'last_year': {
      const prev = `${Number(today.slice(0, 4)) - 1}-06-15`;
      return { from: startOfYear(prev), to: endOfYear(prev) };
    }
    default:
      return { from: today, to: today };
  }
}

const dateTimeFormatter = new Intl.DateTimeFormat('ka-GE', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
});

const timeFormatter = new Intl.DateTimeFormat('ka-GE', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit'
});

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return dateTimeFormatter.format(d);
}

export function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return timeFormatter.format(d);
}

export function formatDate(businessDateOrIso?: string | null): string {
  if (!businessDateOrIso) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(businessDateOrIso)) {
    const [y, m, d] = businessDateOrIso.split('-');
    return `${d}.${m}.${y}`;
  }
  const bd = businessDateOf(businessDateOrIso);
  const [y, m, d] = bd.split('-');
  return `${d}.${m}.${y}`;
}
