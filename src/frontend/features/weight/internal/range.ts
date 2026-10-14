import type { Iso8601Date } from '../../../../shared/flavors.ts';
import { daysBefore } from '../../../ui/format.ts';
import { AVERAGE_DAYS } from './trend.ts';

export type RangeKey = '30d' | '90d' | '1y' | 'all';

export interface Range {
  key: RangeKey;
  label: string;
  days: number | null;
}

export const RANGES: readonly Range[] = [
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
  { key: '1y', label: '1y', days: 365 },
  { key: 'all', label: 'All', days: null },
];

export const DEFAULT_RANGE: RangeKey = '90d';

function daysOf(range: RangeKey): number | null {
  return RANGES.find((candidate) => candidate.key === range)?.days ?? null;
}

export function parseRange(search: string): RangeKey {
  const raw = new URLSearchParams(search).get('range');
  return RANGES.find((candidate) => candidate.key === raw)?.key ?? DEFAULT_RANGE;
}

export function rangePath(range: RangeKey): string {
  return range === DEFAULT_RANGE ? '/weight' : `/weight?range=${range}`;
}

// The first date shown.
export function rangeFrom(range: RangeKey, today: Iso8601Date): Iso8601Date | null {
  const days = daysOf(range);
  return days === null ? null : daysBefore(today, days);
}

// The first date loaded: the days before the range let the average start complete at its left edge.
export function loadSince(range: RangeKey, today: Iso8601Date): Iso8601Date | null {
  const days = daysOf(range);
  return days === null ? null : daysBefore(today, days + AVERAGE_DAYS - 1);
}
