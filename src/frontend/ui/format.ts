import type { Iso8601Date } from '../../shared/flavors.ts';

export const UNIT = 'kg';

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const SHORT_DATE_FORMAT = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

export function formatNumber(value: number | null | undefined, maxDecimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '–';
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: maxDecimals });
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

export function formatVolume(value: number | null | undefined): string {
  const num = value ?? 0;
  if (num >= 10000) {
    return `${formatNumber(num / 1000, 1)} t`;
  }
  return `${formatNumber(num, 0)} ${UNIT}`;
}

export function formatDate(iso: Iso8601Date | null | undefined): string {
  if (!iso) {
    return '–';
  }
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : DATE_FORMAT.format(date);
}

export function formatShortDate(iso: Iso8601Date | null | undefined): string {
  if (!iso) {
    return '–';
  }
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : SHORT_DATE_FORMAT.format(date);
}

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

export function todayIso(): Iso8601Date {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

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
