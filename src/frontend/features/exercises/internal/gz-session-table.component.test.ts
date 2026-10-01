import { beforeAll, expect, test } from 'bun:test';
import { useDom } from '../../../testing.ts';
import type { SessionPointDto } from '../../../../shared/dto/exercise.ts';
import type { GzSessionTableComponent } from './gz-session-table.component.ts';

useDom();

beforeAll(async () => {
  await import('./gz-session-table.component.ts');
});

function session(workoutId: number, estOneRepMax: number): SessionPointDto {
  return { workoutId, performedOn: `2026-09-0${workoutId}`, setCount: 3, totalReps: 15, totalVolume: 1200, topWeight: 80, estOneRepMax };
}

function mount(sessions: SessionPointDto[]): GzSessionTableComponent {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- registered in beforeAll
  const table = document.createElement('gz-session-table') as GzSessionTableComponent;
  document.body.append(table);
  table.sessions = sessions;
  return table;
}

function rows(table: HTMLElement): Element[] {
  return Array.from(table.shadowRoot?.querySelectorAll('tbody tr') ?? []);
}

test('lists the sessions newest first', () => {
  const table = mount([session(1, 90), session(2, 95), session(3, 92.5)]);
  expect(rows(table).map((row) => row.querySelector('a')?.getAttribute('href'))).toEqual(['/workouts/3', '/workouts/2', '/workouts/1']);
});

test('marks a rise in estimated 1RM up and a fall down, and the oldest session neither', () => {
  const table = mount([session(1, 90), session(2, 95), session(3, 92.5)]);
  expect(rows(table).map((row) => row.querySelector('span.up, span.down')?.className ?? null)).toEqual(['down', 'up', null]);
});

test('says so when there are no sessions', () => {
  const table = mount([]);
  expect(table.shadowRoot?.querySelector('.empty')?.textContent).toBe('No sets logged for this exercise yet.');
  expect(table.shadowRoot?.querySelector('table')).toBeNull();
});

test('re-renders when given new sessions', () => {
  const table = mount([]);
  table.sessions = [session(1, 90)];
  expect(rows(table)).toHaveLength(1);
});
