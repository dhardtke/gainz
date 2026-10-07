import { afterEach, beforeEach, describe, expect, setSystemTime, test } from 'bun:test';
import { formatDate, formatDelta, formatNumber, formatShortDate, formatVolume, formatWeight, plural, relativeDay, todayIso } from './format.ts';

// Bun ignores LANG on Windows, so the locale is the OS's; avoid thousands separators.
const decimal = new Intl.NumberFormat().formatToParts(1.5).find((part) => part.type === 'decimal')?.value ?? '.';

const local = (text: string): string => text.replace('.', decimal);

describe('formatNumber', () => {
  test('drops trailing zeros and caps the decimals', () => {
    expect(formatNumber(62.5)).toBe(local('62.5'));
    expect(formatNumber(60)).toBe('60');
    expect(formatNumber(1.23456)).toBe(local('1.23'));
    expect(formatNumber(1.25, 0)).toBe('1');
  });

  test.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY])('shows a dash for %p', (value) => {
    expect(formatNumber(value)).toBe('–');
  });
});

describe('formatWeight', () => {
  test('calls zero bodyweight rather than 0 kg', () => {
    expect(formatWeight(0)).toBe('bodyweight');
  });

  test('appends the unit', () => {
    expect(formatWeight(62.5)).toBe(local('62.5 kg'));
  });

  test.each([null, undefined])('shows a dash for %p', (value) => {
    expect(formatWeight(value)).toBe('–');
  });
});

describe('formatVolume', () => {
  test('stays in kg below ten tonnes, without decimals', () => {
    expect(formatVolume(512.6)).toBe('513 kg');
    expect(formatVolume(9999)).toEndWith(' kg');
    expect(formatVolume(0)).toBe('0 kg');
    expect(formatVolume(null)).toBe('0 kg');
  });

  test('switches to tonnes at ten thousand, with one decimal', () => {
    expect(formatVolume(10000)).toBe('10 t');
    expect(formatVolume(12345)).toBe(local('12.3 t'));
  });
});

describe('dates', () => {
  test.each([null, undefined, ''])('formatDate and formatShortDate show a dash for %p', (value) => {
    expect(formatDate(value)).toBe('–');
    expect(formatShortDate(value)).toBe('–');
  });

  test('an unparseable date is shown as it came rather than as "Invalid Date"', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
    expect(formatShortDate('2024-13-45')).toBe('2024-13-45');
  });

  test('a YYYY-MM-DD day is read as local midnight, so it never shifts to the day before', () => {
    const expected = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(2024, 0, 1));

    expect(formatShortDate('2024-01-01')).toBe(expected);
  });
});

describe('relative time', () => {
  beforeEach(() => {
    // Half past midnight: in any timezone east of UTC, the UTC date is still the 14th.
    setSystemTime(new Date(2024, 5, 15, 0, 30));
  });

  afterEach(() => {
    setSystemTime();
  });

  test.each([
    ['2024-06-15', 'today'],
    ['2024-06-14', 'yesterday'],
    ['2024-06-16', 'in 1 day'],
    ['2024-06-20', 'in 5 days'],
    ['2024-06-10', '5 days ago'],
    ['2024-05-17', '29 days ago'],
    ['2024-05-16', '1 month ago'],
    ['2023-06-17', '12 months ago'],
    ['2023-06-16', '1 year ago'],
    ['2021-06-15', '3 years ago'],
  ])('relativeDay(%s) is "%s"', (iso, expected) => {
    expect(relativeDay(iso)).toBe(expected);
  });

  test.each([null, undefined, '', 'garbage'])('relativeDay(%p) is empty', (value) => {
    expect(relativeDay(value)).toBe('');
  });

  test('todayIso is the local day, not the UTC one', () => {
    expect(todayIso()).toBe('2024-06-15');
  });
});

describe('plural', () => {
  test('uses the singular only for exactly one', () => {
    expect(plural(1, 'set')).toBe('1 set');
    expect(plural(0, 'set')).toBe('0 sets');
    expect(plural(2, 'rep')).toBe('2 reps');
  });

  test('takes an irregular plural', () => {
    expect(plural(3, 'person', 'people')).toBe('3 people');
  });
});

describe('formatDelta', () => {
  test.each([null, undefined])('is empty with nothing to compare against (%p)', (previous) => {
    expect(formatDelta(100, previous)).toBe('');
  });

  test('signs the change with a plus or a true minus sign', () => {
    expect(formatDelta(102.5, 100)).toBe('+2.5');
    expect(formatDelta(97.5, 100)).toBe('−2.5');
  });

  test('treats a change below a hundredth as none, which float arithmetic would otherwise show', () => {
    expect(formatDelta(0.1 + 0.2, 0.3)).toBe('±0');
    expect(formatDelta(100, 100)).toBe('±0');
  });
});
