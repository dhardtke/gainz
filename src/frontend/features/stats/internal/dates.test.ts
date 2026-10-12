import { expect, test } from 'bun:test';
import { daysBefore } from './dates.ts';

test.each([
  ['2026-10-12', 10, '2026-10-02'],
  ['2026-10-12', 30, '2026-09-12'],
  ['2026-01-15', 30, '2025-12-16'],
  ['2028-03-10', 30, '2028-02-09'],
  ['2028-03-01', 1, '2028-02-29'],
])('%s minus %d days is %s', (date, days, expected) => {
  expect(daysBefore(date, days)).toBe(expected);
});
