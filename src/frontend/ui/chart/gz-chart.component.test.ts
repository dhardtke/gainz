import { beforeAll, expect, test } from 'bun:test';
import { find, mount, shadow, testId, useDom } from '../../testing.ts';
import type { ChartPoint, GzChartComponent } from './gz-chart.component.ts';

useDom();

beforeAll(async () => {
  await import('./gz-chart.component.ts');
});

function mountChart(series: ChartPoint[]): GzChartComponent {
  const chart = mount<GzChartComponent>('gz-chart');
  chart.series = series;
  return chart;
}

function dots(chart: HTMLElement): { left: number; top: number }[] {
  return Array.from(shadow(chart).querySelectorAll<HTMLElement>(testId('dot'))).map((dot) => ({
    left: Number.parseFloat(dot.style.left),
    top: Number.parseFloat(dot.style.top),
  }));
}

function linePoints(chart: HTMLElement): { x: number; y: number }[] {
  return (find(shadow(chart), testId('line')).getAttribute('points') ?? '').split(' ').map((pair) => {
    const [x, y] = pair.split(',').map(Number);
    return { x: x ?? Number.NaN, y: y ?? Number.NaN };
  });
}

test('spaces the dots evenly without dates', () => {
  const chart = mountChart([
    { label: 'a', value: 1 },
    { label: 'b', value: 2 },
    { label: 'c', value: 3 },
  ]);
  expect(dots(chart).map((dot) => dot.left)).toEqual([0, 50, 100]);
});

test('spaces the dots by date when every point has one', () => {
  const chart = mountChart([
    { label: 'Oct 1', value: 1, x: '2026-10-01' },
    { label: 'Oct 2', value: 2, x: '2026-10-02' },
    { label: 'Oct 11', value: 3, x: '2026-10-11' },
  ]);
  expect(dots(chart).map((dot) => dot.left)).toEqual([0, 10, 100]);
});

test('keeps index spacing when a point lacks a date', () => {
  const chart = mountChart([
    { label: 'Oct 1', value: 1, x: '2026-10-01' },
    { label: 'b', value: 2 },
    { label: 'Oct 11', value: 3, x: '2026-10-11' },
  ]);
  expect(dots(chart).map((dot) => dot.left)).toEqual([0, 50, 100]);
});

test('draws the line through the trend while the dots stay at the raw values', () => {
  const chart = mountChart([
    { label: 'a', value: 80, trend: 82 },
    { label: 'b', value: 84, trend: 82 },
    { label: 'c', value: 80, trend: 82 },
  ]);
  const line = linePoints(chart);
  expect(line).toHaveLength(3);
  expect(new Set(line.map((point) => point.y)).size).toBe(1);
  const tops = dots(chart).map((dot) => dot.top);
  expect(tops[0]).toBe(tops[2]);
  expect(tops[0]).not.toBe(tops[1]);
  // The plot is 220 units tall, so a top of 1% is 2.2 units; 82 lies halfway between 80 and 84.
  expect(line[0]?.y).toBeCloseTo((((tops[0] ?? 0) + (tops[1] ?? 0)) / 2) * 2.2, 0);
});

test('skips a point without a trend in the line', () => {
  const chart = mountChart([
    { label: 'a', value: 80, trend: null },
    { label: 'b', value: 84, trend: 82 },
    { label: 'c', value: 80, trend: 81 },
  ]);
  expect(linePoints(chart).map((point) => point.x)).toEqual([300, 600]);
});

test('renders the empty text it is given', () => {
  const chart = mountChart([]);
  expect(find(shadow(chart), testId('empty')).textContent).toBe('No sessions logged yet — add a set to start the curve.');
  chart.empty = 'No weigh-ins in this range.';
  chart.series = [];
  expect(find(shadow(chart), testId('empty')).textContent).toBe('No weigh-ins in this range.');
});

test('labels the plot', () => {
  const chart = mountChart([{ label: 'a', value: 1 }]);
  expect(find(shadow(chart), 'svg').getAttribute('aria-label')).toBe('Progress over the logged sessions');
  chart.label = 'Body weight over time';
  chart.series = [{ label: 'a', value: 1 }];
  expect(find(shadow(chart), 'svg').getAttribute('aria-label')).toBe('Body weight over time');
});

test('redraws only when the series is set', () => {
  const chart = mountChart([{ label: 'a', value: 1 }]);
  const dot = find(shadow(chart), testId('dot'));
  chart.unit = 'kg';
  chart.label = 'Body weight over time';
  chart.empty = 'No weigh-ins in this range.';
  expect(dot.isConnected).toBe(true);
  chart.series = [{ label: 'a', value: 1 }];
  expect(dot.isConnected).toBe(false);
  expect(find(shadow(chart), testId('dot')).getAttribute('title')).toBe('a: 1 kg');
});

test('centers a single point', () => {
  expect(dots(mountChart([{ label: 'a', value: 1, x: '2026-10-01' }]))[0]?.left).toBe(50);
  expect(dots(mountChart([{ label: 'a', value: 1 }]))[0]?.left).toBe(50);
});
