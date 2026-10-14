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
  bestReps: null,
  leastWeight: null,
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
  expect(fake.sent('POST /api/exercises')).toEqual([{ name: 'Back Squat', muscleGroup: sent, notes: '', kind: 'weighted' }]);
  expect(`${location.pathname}${location.search}`).toBe(`/exercises?muscleGroup=${filter}&page=2`);
});

test('adds an exercise of the chosen type', async () => {
  const view = await mountAdding();
  fake.respondTo('POST /api/exercises', 201, JSON.stringify(exercise({ id: 5, name: 'Dips', kind: 'bodyweight' })));
  fake.respondTo('GET /api/exercises/5/position?muscleGroup=none', 200, JSON.stringify({ index: 0 }));
  choose(find<HTMLSelectElement>(shadow(view), testId('kind')), 'bodyweight');
  addExercise(view, 'Dips', '');
  await settle();
  expect(fake.sent('POST /api/exercises')).toEqual([{ name: 'Dips', muscleGroup: null, notes: '', kind: 'bodyweight' }]);
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

test('heads a card with its muscle group icon before the group, then the notes', async () => {
  fake.respondTo(
    'GET /api/exercises?limit=10&offset=0',
    200,
    page([listed({ id: 1, muscleGroup: 'Legs', notes: 'Low bar, belt' }), listed({ id: 2, muscleGroup: null })]),
  );
  const view = mount('gz-exercise-list');
  await settle();
  const [legs, plain] = Array.from(shadow(view).querySelectorAll(testId('card')));
  const subtitle = find(legs ?? shadow(view), testId('card-subtitle'));
  const icon = find(subtitle, 'gz-muscle-group-icon');
  expect(find(shadow(icon), 'svg').getAttribute('data-group')).toBe('Legs');
  expect(find(shadow(icon), 'svg').getAttribute('aria-hidden')).toBe('true');
  expect(subtitle.textContent.replace(/\s+/g, ' ').trim()).toBe('Legs · Low bar, belt');
  expect(plain?.querySelector('gz-muscle-group-icon')).toBeNull();
});

test('labels a bodyweight card between its muscle group and its notes', async () => {
  fake.respondTo(
    'GET /api/exercises?limit=10&offset=0',
    200,
    page([listed({ id: 1, muscleGroup: 'Chest', notes: 'Lean forward', kind: 'bodyweight' }), listed({ id: 2, kind: 'bodyweight' })]),
  );
  const view = mount('gz-exercise-list');
  await settle();
  const subtitles = Array.from(shadow(view).querySelectorAll(testId('card-subtitle'))).map((subtitle) => subtitle.textContent.replace(/\s+/g, ' ').trim());
  expect(subtitles).toEqual(['Chest · Bodyweight · Lean forward', 'Bodyweight']);
});

test('labels an assisted card as assisted', async () => {
  fake.respondTo('GET /api/exercises?limit=10&offset=0', 200, page([listed({ id: 1, muscleGroup: 'Back', notes: 'Knees on the pad', kind: 'assisted' })]));
  const view = mount('gz-exercise-list');
  await settle();
  expect(find(shadow(view), testId('card-subtitle')).textContent.replace(/\s+/g, ' ').trim()).toBe('Back · Assisted · Knees on the pad');
});

test('puts each muscle group icon in its options, and none in the others', async () => {
  const view = await mountAdding();
  for (const select of [filterSelect(view), find<HTMLSelectElement>(shadow(view), testId('muscleGroup'))]) {
    const icons = Array.from(select.options).map((option) => option.querySelector('gz-muscle-group-icon')?.getAttribute('group') ?? null);
    expect(icons.filter((group) => group !== null)).toEqual(GROUP_LABELS.slice(1));
    expect(select.firstElementChild?.localName).toBe('button');
  }
});

test("reads a bodyweight card's best in reps", async () => {
  fake.respondTo('GET /api/exercises?limit=10&offset=0', 200, page([listed({ id: 1, name: 'Dips', kind: 'bodyweight', bestWeight: 0, bestReps: 15 })]));
  const view = mount('gz-exercise-list');
  await settle();
  expect(find(shadow(view), testId('card')).textContent.replace(/\s+/g, ' ')).toContain('15 reps best');
});

test("reads an assisted card's best as its least assistance, or none yet", async () => {
  fake.respondTo(
    'GET /api/exercises?limit=10&offset=0',
    200,
    page([
      listed({ id: 1, name: 'Assisted Pull-up', kind: 'assisted', bestWeight: 30, leastWeight: 17.5 }),
      listed({ id: 2, name: 'Assisted Dip', kind: 'assisted' }),
    ]),
  );
  const view = mount('gz-exercise-list');
  await settle();
  const cards = Array.from(shadow(view).querySelectorAll(testId('card'))).map((card) => card.textContent.replace(/\s+/g, ' '));
  expect(cards[0]).toContain('17.5 kg assist least');
  expect(cards[1]).toContain('no best yet');
});

const typeSelect = (view: HTMLElement): HTMLSelectElement => find<HTMLSelectElement>(shadow(view), testId('type-filter'));

test('offers "All" and the three kinds as the type filter, with "All" chosen', async () => {
  const view = await mountAdding();
  expect(Array.from(typeSelect(view).options).map((option) => [option.value, option.textContent])).toEqual([
    ['', 'All'],
    ['weighted', 'Weighted'],
    ['bodyweight', 'Bodyweight'],
    ['assisted', 'Assisted'],
  ]);
  expect(typeSelect(view).value).toBe('');
});

test('lists the type in the URL, with the muscle group, counting it against every exercise', async () => {
  const view = await mountFiltered('?muscleGroup=Chest&type=bodyweight', page([listed({ id: 1, name: 'Dips', kind: 'bodyweight' })], 12));
  expect(preselected(view)).toBe('Chest');
  expect(typeSelect(view).querySelector<HTMLOptionElement>('option[selected]')?.value).toBe('bodyweight');
  expect(text(view, testId('subtitle'))).toBe('1 of 12 exercises');
});

test.each([
  ['?type=bodyweight', 'No bodyweight exercises yet.'],
  ['?muscleGroup=Legs&type=weighted', 'No weighted Legs exercises yet.'],
  ['?muscleGroup=none&type=bodyweight', 'No bodyweight exercises without a muscle group.'],
])('says so when %s lists nothing', async (search, empty) => {
  const view = await mountFiltered(search, page([], 12));
  expect(text(view, testId('empty'))).toBe(empty);
});

test.each([
  ['bodyweight', '/exercises?muscleGroup=Legs&type=bodyweight'],
  ['', '/exercises?muscleGroup=Legs'],
])('choosing the type "%s" keeps the muscle group and navigates to %s, on page 1', async (value, path) => {
  history.replaceState(null, '', '/exercises?muscleGroup=Legs&type=weighted&page=2');
  fake.respondTo('GET /api/exercises?limit=10&offset=10&muscleGroup=Legs&type=weighted', 200, page([], 12));
  const view = mount('gz-exercise-list');
  await settle();
  choose(typeSelect(view), value);
  expect(`${location.pathname}${location.search}`).toBe(path);
});

test('choosing a muscle group keeps the type', async () => {
  const view = await mountFiltered('?type=bodyweight', page([], 12));
  choose(filterSelect(view), 'Back');
  expect(`${location.pathname}${location.search}`).toBe('/exercises?muscleGroup=Back&type=bodyweight');
});

test('keeps both filters when paging', async () => {
  const view = await mountFiltered('?muscleGroup=Legs&type=weighted', page([listed()], 12));
  find(shadow(view), 'gz-pagination').dispatchEvent(new CustomEvent('page-change', { detail: 2, bubbles: true, composed: true }));
  expect(`${location.pathname}${location.search}`).toBe('/exercises?muscleGroup=Legs&type=weighted&page=2');
});

test.each(['bodyweight', 'weighted', 'assisted'] as const)('adding an exercise while a type is chosen opens its own type too (%p)', async (type) => {
  const view = await mountFiltered('?type=bodyweight', page([], 3));
  fake.respondTo('POST /api/exercises', 201, JSON.stringify(exercise({ id: 5, name: 'Dips', muscleGroup: 'Chest', kind: type })));
  fake.respondTo(`GET /api/exercises/5/position?muscleGroup=Chest&type=${type}`, 200, JSON.stringify({ index: 0 }));
  addExercise(view, 'Dips', 'Chest');
  await settle();
  expect(`${location.pathname}${location.search}`).toBe(`/exercises?muscleGroup=Chest&type=${type}`);
});
