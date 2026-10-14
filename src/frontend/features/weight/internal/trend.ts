import type { WeighInDto } from '../../../../shared/dto/weight.ts';
import type { Iso8601Date } from '../../../../shared/flavors.ts';
import { daysBefore, formatBodyWeight, formatShortDate } from '../../../ui/format.ts';

export const AVERAGE_DAYS = 7;
export const CHANGE_DAYS = 30;

export interface TrendPoint {
  date: Iso8601Date;
  value: number;
  average: number | null;
}

// The mean of the weigh-ins in the 7 calendar days ending on `date`.
export function averageAt(items: readonly WeighInDto[], date: Iso8601Date): number | null {
  const start = daysBefore(date, AVERAGE_DAYS - 1);
  const window = items.filter((item) => item.measuredOn >= start && item.measuredOn <= date);
  return window.length === 0 ? null : window.reduce((sum, item) => sum + item.weight, 0) / window.length;
}

// Items before `from` are not plotted but still feed the averages at its left edge.
export function trendPoints(items: readonly WeighInDto[], from: Iso8601Date | null): TrendPoint[] {
  return items
    .filter((item) => from === null || item.measuredOn >= from)
    .map((item) => ({ date: item.measuredOn, value: item.weight, average: averageAt(items, item.measuredOn) }));
}

export function change(items: readonly WeighInDto[], today: Iso8601Date, days = CHANGE_DAYS): number | null {
  const now = averageAt(items, today);
  const then = averageAt(items, daysBefore(today, days));
  return now === null || then === null ? null : now - then;
}

export function formatChange(value: number, days = CHANGE_DAYS): string {
  if (Math.abs(value) < 0.05) {
    return `± 0 kg in ${days} days`;
  }
  return `${value < 0 ? '▼' : '▲'} ${formatBodyWeight(Math.abs(value))} in ${days} days`;
}

// The 30-day change, else the latest weigh-in's date, else nothing to say.
export function trendHint(items: readonly WeighInDto[], latest: WeighInDto | null, today: Iso8601Date): string | null {
  const value = change(items, today);
  if (value !== null) {
    return formatChange(value);
  }
  return latest === null ? null : formatShortDate(latest.measuredOn);
}
