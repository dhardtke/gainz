import { beforeAll, expect, test } from 'bun:test';
import { useDom } from '../../../testing.ts';
import type { SessionPointDto } from '../../../../shared/dto/exercise.ts';
import type { GzChartComponent } from './gz-chart.component.ts';
import type { GzProgressChartComponent } from './gz-progress-chart.component.ts';

useDom();

beforeAll(async () => {
  await import('./gz-progress-chart.component.ts');
});

const SESSIONS: SessionPointDto[] = [
  { workoutId: 1, performedOn: '2026-09-01', setCount: 3, totalReps: 15, totalVolume: 1200, topWeight: 80, estOneRepMax: 90 },
  { workoutId: 2, performedOn: '2026-09-08', setCount: 4, totalReps: 20, totalVolume: 1700, topWeight: 85, estOneRepMax: 95 },
];

function mount(metric?: string): GzProgressChartComponent {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- registered in beforeAll
  const chart = document.createElement('gz-progress-chart') as GzProgressChartComponent;
  document.body.append(chart);
  if (metric !== undefined) {
    chart.metric = metric;
  }
  chart.sessions = SESSIONS;
  return chart;
}

function heading(chart: HTMLElement): string | undefined {
  return chart.shadowRoot?.querySelector('h2')?.textContent;
}

function button(chart: HTMLElement, metric: string): HTMLButtonElement {
  const found = chart.shadowRoot?.querySelector<HTMLButtonElement>(`button[data-metric='${metric}']`);
  if (!found) {
    throw new Error(`no ${metric} button`);
  }
  return found;
}

function plotted(chart: HTMLElement): number[] {
  const inner = chart.shadowRoot?.querySelector<GzChartComponent>('gz-chart');
  return inner?.series.map((point) => point.value) ?? [];
}

test('charts the estimated 1RM by default', () => {
  const chart = mount();
  expect(heading(chart)).toBe('Estimated 1RM');
  expect(button(chart, 'estOneRepMax').getAttribute('aria-pressed')).toBe('true');
  expect(plotted(chart)).toEqual([90, 95]);
});

test('switches metric on a click and says so with metric-change', () => {
  const changes: unknown[] = [];
  document.body.addEventListener('metric-change', (event) => {
    if (event instanceof CustomEvent) {
      changes.push(event.detail);
    }
  });
  const chart = mount();
  const hint = chart.shadowRoot?.querySelector('p.text-light')?.textContent;
  button(chart, 'totalVolume').click();
  expect(heading(chart)).toBe('Volume');
  expect(chart.shadowRoot?.querySelector('p.text-light')?.textContent).not.toBe(hint);
  expect(button(chart, 'totalVolume').getAttribute('aria-pressed')).toBe('true');
  expect(button(chart, 'estOneRepMax').getAttribute('aria-pressed')).not.toBe('true');
  expect(changes).toEqual(['totalVolume']);
});

test('shows a metric set before the sessions', () => {
  const chart = mount('topWeight');
  expect(heading(chart)).toBe('Top set');
  expect(plotted(chart)).toEqual([80, 85]);
});

test('falls back to the estimated 1RM for an unknown metric', () => {
  expect(heading(mount('bogus'))).toBe('Estimated 1RM');
});

test('plots one point per session with the chosen metric', () => {
  const chart = mount();
  button(chart, 'totalVolume').click();
  expect(plotted(chart)).toEqual([1200, 1700]);
});
