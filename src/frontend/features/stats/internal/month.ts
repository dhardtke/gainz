import type { Iso8601Date, Iso8601Month } from '../../../../shared/flavors.ts';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

function parts(month: Iso8601Month): [number, number] {
  return [Number(month.slice(0, 4)), Number(month.slice(5, 7))];
}

export function parseMonth(search: string, today: Iso8601Date): Iso8601Month {
  const value = new URLSearchParams(search).get('month') ?? '';
  return MONTH.test(value) ? value : today.slice(0, 7);
}

export function shiftMonth(month: Iso8601Month, delta: number): Iso8601Month {
  const [year, monthOfYear] = parts(month);
  const index = year * 12 + monthOfYear - 1 + delta;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function monthGrid(month: Iso8601Month): (Iso8601Date | null)[] {
  const [year, monthOfYear] = parts(month);
  const mondayBased = (new Date(Date.UTC(year, monthOfYear - 1, 1)).getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, monthOfYear, 0)).getUTCDate();
  return [...Array.from({ length: mondayBased }, () => null), ...Array.from({ length }, (_, day) => `${month}-${String(day + 1).padStart(2, '0')}`)];
}

export function formatMonth(month: Iso8601Month): string {
  const [year, monthOfYear] = parts(month);
  return MONTH_FORMAT.format(new Date(Date.UTC(year, monthOfYear - 1, 1)));
}
