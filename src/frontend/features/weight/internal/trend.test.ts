import { describe, expect, test } from 'bun:test';
import type { WeighInDto } from '../../../../shared/dto/weight.ts';
import type { Iso8601Date } from '../../../../shared/flavors.ts';
import { formatBodyWeight } from '../../../ui/format.ts';
import { averageAt, change, formatChange, trendHint, trendPoints } from './trend.ts';

function weighIn(measuredOn: Iso8601Date, weight: number): WeighInDto {
  return { measuredOn, weight };
}

describe('averageAt', () => {
  test('averages the weigh-ins of the 7 days ending on the date, gaps included', () => {
    const items = [weighIn('2026-10-01', 90), weighIn('2026-10-08', 82), weighIn('2026-10-10', 84), weighIn('2026-10-13', 80)];
    expect(averageAt(items, '2026-10-13')).toBe(82);
  });

  test('counts day −6 and leaves out day −7', () => {
    expect(averageAt([weighIn('2026-10-07', 80)], '2026-10-13')).toBe(80);
    expect(averageAt([weighIn('2026-10-06', 80)], '2026-10-13')).toBeNull();
  });

  test('leaves out later days', () => {
    expect(averageAt([weighIn('2026-10-12', 80), weighIn('2026-10-14', 90)], '2026-10-13')).toBe(80);
  });
});

describe('trendPoints', () => {
  test('plots from `from` on, averaging over the items before it too', () => {
    const items = [weighIn('2026-10-01', 84), weighIn('2026-10-03', 82)];
    expect(trendPoints(items, '2026-10-02')).toEqual([{ date: '2026-10-03', value: 82, average: 83 }]);
  });

  test('plots everything without `from`', () => {
    expect(trendPoints([weighIn('2026-10-01', 84)], null)).toEqual([{ date: '2026-10-01', value: 84, average: 84 }]);
  });
});

describe('change', () => {
  test('subtracts the average 30 days ago from the average today', () => {
    const items = [weighIn('2026-09-12', 83), weighIn('2026-09-13', 83.2), weighIn('2026-10-12', 82.5), weighIn('2026-10-13', 82.5)];
    expect(change(items, '2026-10-13')).toBeCloseTo(-0.6);
  });

  test('is null when either window is empty', () => {
    expect(change([weighIn('2026-10-13', 82)], '2026-10-13')).toBeNull();
    expect(change([weighIn('2026-09-13', 82)], '2026-10-13')).toBeNull();
  });
});

describe('formatChange', () => {
  test('marks a loss, a gain and no change', () => {
    expect(formatChange(-0.6)).toBe(`▼ ${formatBodyWeight(0.6)} in 30 days`);
    expect(formatChange(0.3)).toBe(`▲ ${formatBodyWeight(0.3)} in 30 days`);
  });

  test.each([0, 0.049, -0.049])('reads %p as no change', (value) => {
    expect(formatChange(value)).toBe('± 0 kg in 30 days');
  });

  test('reads 0.05 as a change', () => {
    expect(formatChange(0.05)).toStartWith('▲');
  });
});

describe('trendHint', () => {
  test('falls back to the date of the latest weigh-in, then to nothing', () => {
    const latest = weighIn('2026-08-02', 82);
    expect(trendHint([], latest, '2026-10-13')).toBe(new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(2026, 7, 2)));
    expect(trendHint([], null, '2026-10-13')).toBeNull();
  });
});
