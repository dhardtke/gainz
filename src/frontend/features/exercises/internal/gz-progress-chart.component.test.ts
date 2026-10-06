import { beforeAll, expect, test } from 'bun:test';
import { collect, find, mount, shadow, testId, useDom } from '../../../testing.ts';
import { session } from '../exercises.fixtures.ts';
import type { GzChartComponent } from './gz-chart.component.ts';
import type { GzProgressChartComponent } from './gz-progress-chart.component.ts';

useDom();

beforeAll(async () => {
  await import('./gz-progress-chart.component.ts');
});

const SESSIONS = [
  session({ workoutId: 1, performedOn: '2026-09-01', estOneRepMax: 90 }),
  session({ workoutId: 2, performedOn: '2026-09-08', setCount: 4, totalReps: 20, totalVolume: 1700, topWeight: 85, estOneRepMax: 95 }),
];

function mountChart(metric?: string): GzProgressChartComponent {
  const chart = mount<GzProgressChartComponent>('gz-progress-chart');
  if (metric !== undefined) {
    chart.metric = metric;
  }
  chart.sessions = SESSIONS;
  return chart;
}

function heading(chart: HTMLElement): string | undefined {
  return chart.shadowRoot?.querySelector(testId('heading'))?.textContent;
}

function button(chart: HTMLElement, metric: string): HTMLButtonElement {
  return find<HTMLButtonElement>(shadow(chart), testId(`metric-${metric}`));
}

function plotted(chart: HTMLElement): number[] {
  const inner = chart.shadowRoot?.querySelector<GzChartComponent>(testId('chart'));
  return inner?.series.map((point) => point.value) ?? [];
}

test('charts the estimated 1RM by default', () => {
  const chart = mountChart();
  expect(heading(chart)).toBe('Estimated 1RM');
  expect(button(chart, 'estOneRepMax').getAttribute('aria-pressed')).toBe('true');
  expect(plotted(chart)).toEqual([90, 95]);
});

test('switches metric on a click and says so with metric-change', () => {
  const changes = collect('metric-change');
  const chart = mountChart();
  const hint = chart.shadowRoot?.querySelector(testId('hint'))?.textContent;
  button(chart, 'totalVolume').click();
  expect(heading(chart)).toBe('Volume');
  expect(chart.shadowRoot?.querySelector(testId('hint'))?.textContent).not.toBe(hint);
  expect(button(chart, 'totalVolume').getAttribute('aria-pressed')).toBe('true');
  expect(button(chart, 'estOneRepMax').getAttribute('aria-pressed')).not.toBe('true');
  expect(changes).toEqual(['totalVolume']);
});

test('shows a metric set before the sessions', () => {
  const chart = mountChart('topWeight');
  expect(heading(chart)).toBe('Top set');
  expect(plotted(chart)).toEqual([80, 85]);
});

test('falls back to the estimated 1RM for an unknown metric', () => {
  expect(heading(mountChart('bogus'))).toBe('Estimated 1RM');
});

test('plots one point per session with the chosen metric', () => {
  const chart = mountChart();
  button(chart, 'totalVolume').click();
  expect(plotted(chart)).toEqual([1200, 1700]);
});
