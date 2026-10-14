import { afterAll, beforeAll, expect, setSystemTime, test } from 'bun:test';
import { find, mount, settle, shadow, testId, text, useDom, useFetch, useToasts } from '../../testing.ts';
import type { SummaryDto } from '../../../shared/dto/stats.ts';
import type { WeighInListDto } from '../../../shared/dto/weight.ts';
import type { WorkoutPageDto } from '../../../shared/dto/workout.ts';
import { formatBodyWeight } from '../../ui/format.ts';

useDom();
const fake = useFetch();
const toasts = useToasts();

const SUMMARY_URL = 'GET /api/stats/summary?since=2026-09-13';
const WORKOUTS_URL = 'GET /api/workouts?limit=5&offset=0';
// 30 days back plus the 6 before them, so the 30-day change has both of its windows.
const WEIGH_INS_URL = 'GET /api/weigh-ins?since=2026-09-07';

beforeAll(async () => {
  setSystemTime(new Date(2026, 9, 13, 12));
  await import('./gz-dashboard.component.ts');
});

afterAll(() => {
  setSystemTime();
});

function answer(): void {
  const summary: SummaryDto = {
    workoutCount: 42,
    setCount: 318,
    totalReps: 4120,
    totalVolume: 182000,
    exerciseCount: 14,
    lastPerformedOn: '2026-10-12',
    workoutsSince: 9,
    volumeSince: 31000,
  };
  const page: WorkoutPageDto = { items: [], total: 0, limit: 5, offset: 0 };
  fake.respondTo(SUMMARY_URL, 200, JSON.stringify(summary));
  fake.respondTo(WORKOUTS_URL, 200, JSON.stringify(page));
}

async function open(): Promise<ShadowRoot> {
  const view = mount('gz-dashboard');
  await settle();
  return shadow(view);
}

function labels(root: ShadowRoot): (string | undefined)[] {
  return Array.from(root.querySelectorAll('gz-tile, gz-weight-tile')).map((tile) =>
    tile.localName === 'gz-weight-tile' ? text(find(shadow(tile), testId('tile')), testId('label')) : text(tile, testId('label')),
  );
}

test('shows the four tiles, the workouts hinting at sets and reps', async () => {
  answer();
  fake.respondTo(WEIGH_INS_URL, 200, JSON.stringify({ since: '2026-09-07', items: [], latest: null } satisfies WeighInListDto));
  const root = await open();
  expect(labels(root)).toEqual(['Workouts', 'Total volume', 'Last 30 days', 'Body weight']);
  const workouts = root.querySelector('gz-tile');
  expect(workouts?.getAttribute('hint')).toMatch(/^318 sets · 4.?120 reps$/);
});

test('hands the weight tile the loaded weigh-ins', async () => {
  answer();
  const list: WeighInListDto = { since: '2026-09-07', items: [{ measuredOn: '2026-10-13', weight: 82.4 }], latest: { measuredOn: '2026-10-13', weight: 82.4 } };
  fake.respondTo(WEIGH_INS_URL, 200, JSON.stringify(list));
  const root = await open();
  const tile = find(shadow(find(root, testId('weight-tile'))), testId('tile'));
  expect(text(tile, testId('value'))).toBe(formatBodyWeight(82.4));
});

test('still shows the dashboard when the weigh-ins fail, and toasts', async () => {
  answer();
  fake.respondTo(WEIGH_INS_URL, 500, '{"error":"Database is locked"}');
  const root = await open();
  expect(labels(root)).toEqual(['Workouts', 'Total volume', 'Last 30 days', 'Body weight']);
  expect(text(find(shadow(find(root, testId('weight-tile'))), testId('tile')), testId('value'))).toBe('–');
  expect(toasts).toEqual(['Database is locked']);
});
