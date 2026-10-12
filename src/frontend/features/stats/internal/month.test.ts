import { describe, expect, test } from 'bun:test';
import { formatMonth, monthGrid, parseMonth, shiftMonth } from './month.ts';

describe('parseMonth', () => {
  test("defaults to today's month", () => {
    expect(parseMonth('', '2026-10-12')).toBe('2026-10');
  });

  test('reads a valid month', () => {
    expect(parseMonth('?month=2025-02', '2026-10-12')).toBe('2025-02');
  });

  test.each(['?month=2026-13', '?month=2026-1', '?month=abc', '?month='])('falls back on %p', (search) => {
    expect(parseMonth(search, '2026-10-12')).toBe('2026-10');
  });
});

describe('shiftMonth', () => {
  test('moves within a year', () => {
    expect(shiftMonth('2026-10', 1)).toBe('2026-11');
    expect(shiftMonth('2026-10', -1)).toBe('2026-09');
  });

  test('crosses year boundaries both ways', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('monthGrid', () => {
  test('starts a month beginning on Monday without blanks', () => {
    const grid = monthGrid('2026-06');
    expect(grid[0]).toBe('2026-06-01');
    expect(grid).toHaveLength(30);
  });

  test('pads a month beginning on Sunday with six blanks', () => {
    const grid = monthGrid('2026-11');
    expect(grid.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(grid.at(-1)).toBe('2026-11-30');
  });

  test('knows leap years', () => {
    expect(monthGrid('2028-02').filter((date) => date !== null)).toHaveLength(29);
    expect(monthGrid('2026-02').filter((date) => date !== null)).toHaveLength(28);
  });
});

test('formatMonth names the month and year', () => {
  expect(formatMonth('2026-10')).toContain('2026');
});
