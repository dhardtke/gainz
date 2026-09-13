/**
 * Display helpers. Weights are stored as plain numbers, so switching the whole
 * app to pounds is a matter of changing UNIT here.
 */
import type { Iso8601Date } from '../shared/flavors.ts';

export const UNIT = 'kg';

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const SHORT_DATE_FORMAT = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

/** Drops trailing zeros: 62.50 -> "62.5", 60.00 -> "60". */
export function formatNumber(value: number | null | undefined, maxDecimals = 2): string {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return '–';
  }
  return num.toLocaleString(undefined, { maximumFractionDigits: maxDecimals });
}

export function formatWeight(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '–';
  }
  if (value === 0) {
    return `bodyweight`;
  }
  return `${formatNumber(value)} ${UNIT}`;
}

/** Total load moved; tonnes once the number stops being readable in kg. */
export function formatVolume(value: number | null | undefined): string {
  const num = value ?? 0;
  if (num >= 10000) {
    return `${formatNumber(num / 1000, 1)} t`;
  }
  return `${formatNumber(num, 0)} ${UNIT}`;
}

/** @param iso a `YYYY-MM-DD` date. */
export function formatDate(iso: Iso8601Date | null | undefined): string {
  if (!iso) {
    return '–';
  }
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : DATE_FORMAT.format(date);
}

/** @param iso a `YYYY-MM-DD` date. */
export function formatShortDate(iso: Iso8601Date | null | undefined): string {
  if (!iso) {
    return '–';
  }
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : SHORT_DATE_FORMAT.format(date);
}

/**
 * "today" / "yesterday" / "5 days ago" — a quick sense of recency.
 *
 * @param iso a `YYYY-MM-DD` date.
 * @returns empty when there is no usable date.
 */
export function relativeDay(iso: Iso8601Date | null | undefined): string {
  if (!iso) {
    return '';
  }
  const then = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(then.getTime())) {
    return '';
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - then.getTime()) / 86400000);

  if (days === 0) {
    return 'today';
  }
  if (days === 1) {
    return 'yesterday';
  }
  if (days < 0) {
    return `in ${plural(-days, 'day')}`;
  }
  if (days < 30) {
    return `${plural(days, 'day')} ago`;
  }
  if (days < 365) {
    return `${plural(Math.round(days / 30), 'month')} ago`;
  }
  return `${plural(Math.round(days / 365), 'year')} ago`;
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** @returns today as `YYYY-MM-DD`, in the visitor's own timezone. */
export function todayIso(): Iso8601Date {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

/**
 * Signed change between two numbers, for progress deltas.
 *
 * @returns empty when there is nothing to compare against.
 */
export function formatDelta(current: number, previous: number | null | undefined): string {
  if (previous === null || previous === undefined) {
    return '';
  }
  const diff = current - previous;
  if (Math.abs(diff) < 0.01) {
    return '±0';
  }
  return `${diff > 0 ? '+' : '−'}${formatNumber(Math.abs(diff))}`;
}
