import { afterAll, beforeAll, expect, setSystemTime, test } from 'bun:test';
import { find, mount, shadow, testId, text, useDom } from '../../testing.ts';
import type { WeighInListDto } from '../../../shared/dto/weight.ts';
import { formatBodyWeight, formatShortDate } from '../../ui/format.ts';
import type { GzWeightTileComponent } from './gz-weight-tile.component.ts';

useDom();

beforeAll(async () => {
  setSystemTime(new Date(2026, 9, 13, 12));
  await import('./gz-weight-tile.component.ts');
});

afterAll(() => {
  setSystemTime();
});

function tileOf(list: WeighInListDto | null): HTMLElement {
  const host = mount<GzWeightTileComponent>('gz-weight-tile');
  host.list = list;
  return find(shadow(host), testId('tile'));
}

test('links to the weight page', () => {
  expect(find(shadow(tileOf(null)), testId('label')).getAttribute('href')).toBe('/weight');
});

test('asks for a weigh-in when there are none', () => {
  const tile = tileOf({ since: '2026-09-07', items: [], latest: null });
  expect(text(tile, testId('value'))).toBe('–');
  expect(text(tile, testId('hint'))).toBe('Log your weight');
});

test('shows the latest weigh-in and its date when it lies outside the loaded window', () => {
  const tile = tileOf({ since: '2026-09-07', items: [], latest: { measuredOn: '2026-08-02', weight: 84 } });
  expect(text(tile, testId('value'))).toBe(formatBodyWeight(84));
  expect(text(tile, testId('hint'))).toBe(formatShortDate('2026-08-02'));
});

test('shows the 30-day change when both windows hold weigh-ins', () => {
  const items = [
    { measuredOn: '2026-09-13', weight: 83 },
    { measuredOn: '2026-10-13', weight: 83.3 },
  ];
  const tile = tileOf({ since: '2026-09-07', items, latest: { measuredOn: '2026-10-13', weight: 83.3 } });
  expect(text(tile, testId('value'))).toBe(formatBodyWeight(83.3));
  expect(text(tile, testId('hint'))).toBe(`▲ ${formatBodyWeight(0.3)} in 30 days`);
});

test('shows a dash without a hint after a failed load', () => {
  const tile = tileOf(null);
  expect(text(tile, testId('value'))).toBe('–');
  expect(shadow(tile).querySelector(testId('hint'))).toBeNull();
});
