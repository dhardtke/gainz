import { expect, test } from 'bun:test';
import { loadSince, parseRange, rangeFrom, rangePath } from './range.ts';

test.each([
  ['', '90d'],
  ['?range=30d', '30d'],
  ['?range=1y', '1y'],
  ['?range=all', 'all'],
  ['?range=7d', '90d'],
  ['?range=ALL', '90d'],
] as const)('reads %p as %p', (search, range) => {
  expect(parseRange(search)).toBe(range);
});

test.each([
  ['30d', '2026-09-13', '2026-09-07'],
  ['90d', '2026-07-15', '2026-07-09'],
  ['1y', '2025-10-13', '2025-10-07'],
] as const)('%s shows from %s and loads 6 days more, from %s', (range, from, since) => {
  expect(rangeFrom(range, '2026-10-13')).toBe(from);
  expect(loadSince(range, '2026-10-13')).toBe(since);
});

test('all has no start', () => {
  expect(rangeFrom('all', '2026-10-13')).toBeNull();
  expect(loadSince('all', '2026-10-13')).toBeNull();
});

test('the default range is the bare path', () => {
  expect(rangePath('90d')).toBe('/weight');
  expect(rangePath('all')).toBe('/weight?range=all');
});
