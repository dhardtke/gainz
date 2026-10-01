import { beforeAll, expect, test } from 'bun:test';
import { mount, useDom } from '../../../testing.ts';
import type { SessionPointDto } from '../../../../shared/dto/exercise.ts';
import { session } from '../exercises.fixtures.ts';
import type { GzSessionTableComponent } from './gz-session-table.component.ts';

useDom();

beforeAll(async () => {
  await import('./gz-session-table.component.ts');
});

function mountTable(sessions: SessionPointDto[]): GzSessionTableComponent {
  const table = mount<GzSessionTableComponent>('gz-session-table');
  table.sessions = sessions;
  return table;
}

function rows(table: HTMLElement): Element[] {
  return Array.from(table.shadowRoot?.querySelectorAll('tbody tr') ?? []);
}

test('lists the sessions newest first', () => {
  const table = mountTable([
    session({ workoutId: 1, performedOn: '2026-09-01', estOneRepMax: 90 }),
    session({ workoutId: 2, performedOn: '2026-09-02', estOneRepMax: 95 }),
    session({ workoutId: 3, performedOn: '2026-09-03', estOneRepMax: 92.5 }),
  ]);
  expect(rows(table).map((row) => row.querySelector('a')?.getAttribute('href'))).toEqual(['/workouts/3', '/workouts/2', '/workouts/1']);
});

test('marks a rise in estimated 1RM up and a fall down, and the oldest session neither', () => {
  const table = mountTable([
    session({ workoutId: 1, performedOn: '2026-09-01', estOneRepMax: 90 }),
    session({ workoutId: 2, performedOn: '2026-09-02', estOneRepMax: 95 }),
    session({ workoutId: 3, performedOn: '2026-09-03', estOneRepMax: 92.5 }),
  ]);
  expect(rows(table).map((row) => row.querySelector('span.up, span.down')?.className ?? null)).toEqual(['down', 'up', null]);
});

test('says so when there are no sessions', () => {
  const table = mountTable([]);
  expect(table.shadowRoot?.querySelector('.empty')?.textContent).toBe('No sets logged for this exercise yet.');
  expect(table.shadowRoot?.querySelector('table')).toBeNull();
});

test('re-renders when given new sessions', () => {
  const table = mountTable([]);
  table.sessions = [session({ workoutId: 1, performedOn: '2026-09-01', estOneRepMax: 90 })];
  expect(rows(table)).toHaveLength(1);
});
