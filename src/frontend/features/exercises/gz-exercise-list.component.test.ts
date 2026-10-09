import { beforeAll, beforeEach, expect, test } from 'bun:test';
import { choose, find, mount, settle, shadow, submit, testId, text, useDom, useFetch, useToasts } from '../../testing.ts';
import type { ExercisePageDto, ExerciseWithStatsDto } from '../../../shared/dto/exercise.ts';
import { exercise } from './exercises.fixtures.ts';

useDom();
const fake = useFetch();
useToasts();

beforeAll(async () => {
  await import('./gz-exercise-list.component.ts');
});

// Adding an exercise navigates, and the location outlives the test.
beforeEach(() => {
  history.replaceState(null, '', '/exercises');
});

const listed = (overrides: Partial<ExerciseWithStatsDto> = {}): ExerciseWithStatsDto => ({
  ...exercise(overrides),
  setCount: 0,
  workoutCount: 0,
  lastPerformedOn: null,
  bestWeight: null,
  ...overrides,
});

function page(items: ExerciseWithStatsDto[], all = items.length): string {
  const dto: ExercisePageDto = { items, total: items.length, all, limit: 10, offset: 0 };
  return JSON.stringify(dto);
}

test('opens "Add an exercise" while there are no exercises', async () => {
  fake.respondTo('GET /api/exercises?limit=10&offset=0', 200, page([]));
  const view = mount('gz-exercise-list');
  await settle();
  expect(find<HTMLDetailsElement>(shadow(view), testId('add')).open).toBe(true);
});

const GROUP_LABELS = ['None', 'Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Full body'];

async function mountAdding(): Promise<HTMLElement> {
  fake.respondTo('GET /api/exercises?limit=10&offset=0', 200, page([]));
  const view = mount('gz-exercise-list');
  await settle();
  return view;
}

function addExercise(view: HTMLElement, name: string, muscleGroup: string): void {
  find<HTMLInputElement>(shadow(view), '#name').value = name;
  choose(find<HTMLSelectElement>(shadow(view), testId('muscleGroup')), muscleGroup);
  submit(find(shadow(view), 'form[data-action="create"]'));
}

test('offers "None" and the seven muscle groups when adding', async () => {
  const view = await mountAdding();
  const options = Array.from(find<HTMLSelectElement>(shadow(view), testId('muscleGroup')).options);
  expect(options.map((option) => option.textContent)).toEqual(GROUP_LABELS);
  expect(options.map((option) => option.value)).toEqual(['', ...GROUP_LABELS.slice(1)]);
});

test.each([
  ['Legs', 'Legs', 'Legs'],
  ['', null, 'none'],
] as const)('adds an exercise with the muscle group "%s" and opens its group', async (picked, sent, filter) => {
  history.replaceState(null, '', '/exercises?muscleGroup=Chest');
  fake.respondTo('GET /api/exercises?limit=10&offset=0&muscleGroup=Chest', 200, page([], 3));
  const view = mount('gz-exercise-list');
  await settle();
  fake.respondTo('POST /api/exercises', 201, JSON.stringify(exercise({ id: 5, name: 'Back Squat', muscleGroup: sent })));
  fake.respondTo(`GET /api/exercises/5/position?muscleGroup=${filter}`, 200, JSON.stringify({ index: 12 }));
  addExercise(view, 'Back Squat', picked);
  await settle();
  expect(fake.sent('POST /api/exercises')).toEqual([{ name: 'Back Squat', muscleGroup: sent, notes: '' }]);
  expect(`${location.pathname}${location.search}`).toBe(`/exercises?muscleGroup=${filter}&page=2`);
});

test('collapses "Add an exercise" once there are some, and counts them', async () => {
  fake.respondTo('GET /api/exercises?limit=10&offset=0', 200, page([listed({ id: 1, name: 'Bench Press' }), listed({ id: 2, name: 'Back Squat' })]));
  const view = mount('gz-exercise-list');
  await settle();
  expect(find<HTMLDetailsElement>(shadow(view), testId('add')).open).toBe(false);
  expect(text(view, testId('subtitle'))).toBe('2 exercises');
});

async function mountFiltered(search: string, answer: string): Promise<HTMLElement> {
  history.replaceState(null, '', `/exercises${search}`);
  fake.respondTo(`GET /api/exercises?limit=10&offset=0&${search.slice(1)}`, 200, answer);
  const view = mount('gz-exercise-list');
  await settle();
  return view;
}

const filterSelect = (view: HTMLElement): HTMLSelectElement => find<HTMLSelectElement>(shadow(view), testId('filter'));

// happy-dom misreads `selected` on any option after the second, so this reads the markup a browser honors.
const preselected = (view: HTMLElement): string | undefined => filterSelect(view).querySelector<HTMLOptionElement>('option[selected]')?.value;

test('offers "All", the seven groups and "No muscle group" as the filter, with "All" chosen', async () => {
  const view = await mountAdding();
  const options = Array.from(filterSelect(view).options);
  expect(options.map((option) => option.textContent)).toEqual(['All', ...GROUP_LABELS.slice(1), 'No muscle group']);
  expect(preselected(view)).toBe('');
});

test('lists the group in the URL, counting it against every exercise', async () => {
  const view = await mountFiltered(
    '?muscleGroup=Legs',
    page([listed({ id: 1, name: 'Back Squat' }), listed({ id: 2, name: 'Leg Press' }), listed({ id: 3, name: 'Lunge' })], 12),
  );
  expect(preselected(view)).toBe('Legs');
  expect(text(view, testId('subtitle'))).toBe('3 of 12 exercises');
});

test('keeps "Add an exercise" closed on an empty group while there are other exercises', async () => {
  const view = await mountFiltered('?muscleGroup=Legs', page([], 12));
  expect(find<HTMLDetailsElement>(shadow(view), testId('add')).open).toBe(false);
  expect(text(view, testId('empty'))).toBe('No Legs exercises yet.');
  expect(text(view, testId('subtitle'))).toBe('0 of 12 exercises');
});

test('says so when no exercise lacks a muscle group', async () => {
  const view = await mountFiltered('?muscleGroup=none', page([], 12));
  expect(preselected(view)).toBe('none');
  expect(text(view, testId('empty'))).toBe('No exercises without a muscle group.');
});

test('treats an unknown group in the URL as "All"', async () => {
  history.replaceState(null, '', '/exercises?muscleGroup=Quads');
  fake.respondTo('GET /api/exercises?limit=10&offset=0', 200, page([listed()]));
  const view = mount('gz-exercise-list');
  await settle();
  expect(preselected(view)).toBe('');
  expect(text(view, testId('subtitle'))).toBe('1 exercise');
});

test.each([
  ['Full body', '/exercises?muscleGroup=Full+body'],
  ['none', '/exercises?muscleGroup=none'],
  ['', '/exercises'],
])('choosing the filter "%s" navigates to %s, on page 1', async (value, path) => {
  history.replaceState(null, '', '/exercises?muscleGroup=Legs&page=2');
  fake.respondTo('GET /api/exercises?limit=10&offset=10&muscleGroup=Legs', 200, page([], 12));
  const view = mount('gz-exercise-list');
  await settle();
  expect(preselected(view)).toBe('Legs');
  choose(filterSelect(view), value);
  expect(`${location.pathname}${location.search}`).toBe(path);
});

test('keeps the filter when paging', async () => {
  const view = await mountFiltered('?muscleGroup=Legs', page([listed()], 12));
  find(shadow(view), 'gz-pagination').dispatchEvent(new CustomEvent('page-change', { detail: 2, bubbles: true, composed: true }));
  expect(`${location.pathname}${location.search}`).toBe('/exercises?muscleGroup=Legs&page=2');
});
