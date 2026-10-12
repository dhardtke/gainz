import type { Iso8601Date } from '../../../../shared/flavors.ts';

export const RECENT_DAYS = 30;

export function daysBefore(date: Iso8601Date, days: number): Iso8601Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) - days)).toISOString().slice(0, 10);
}
