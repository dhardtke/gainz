import { beforeAll, expect, test } from 'bun:test';
import { find, mount, settle, shadow, submit, text, type, useDom, useFetch, useToasts } from '../../testing.ts';
import type { ExercisePageDto } from '../../../shared/dto/exercise.ts';
import type { LiftSetDto } from '../../../shared/dto/set.ts';
import type { WorkoutWithExercisesDto } from '../../../shared/dto/workout.ts';
import { exercise } from '../exercises/exercises.fixtures.ts';
import { group, set } from './workouts.fixtures.ts';

useDom();
const fake = useFetch();
const toasts = useToasts();

beforeAll(async () => {
  await import('./gz-workout-detail.component.ts');
});

const EXERCISES: ExercisePageDto = {
  items: [exercise({ id: 1, name: 'Bench Press' }), exercise({ id: 2, name: 'Back Squat' })].map((item) => ({
    ...item,
    setCount: 0,
    workoutCount: 0,
    lastPerformedOn: null,
    bestWeight: null,
  })),
  total: 2,
  limit: null,
  offset: 0,
};

const BENCH = group({
  exerciseId: 1,
  exerciseName: 'Bench Press',
  position: 1,
  sets: [set({ id: 11, exerciseId: 1, exerciseName: 'Bench Press', weight: 80 }), set({ id: 12, exerciseId: 1, exerciseName: 'Bench Press', weight: 82.5 })],
});

const SQUAT = group({
  exerciseId: 2,
  exerciseName: 'Back Squat',
  position: 2,
  sets: [set({ id: 13, exerciseId: 2, exerciseName: 'Back Squat', weight: 100 })],
});

const WORKOUT: WorkoutWithExercisesDto = {
  id: 3,
  performedOn: '2026-09-20',
  title: 'Push day',
  notes: null,
  createdAt: '2026-09-20T10:00:00Z',
  done: false,
  exercises: [BENCH, SQUAT],
};

/** WORKOUT with every set passed through `change`, which gets the set's place in the workout. */
function withSets(change: (item: LiftSetDto, index: number) => LiftSetDto): WorkoutWithExercisesDto {
  let index = 0;
  return { ...WORKOUT, exercises: WORKOUT.exercises.map((item) => ({ ...item, sets: item.sets.map((each) => change(each, index++)) })) };
}

async function mountView(workout: WorkoutWithExercisesDto = WORKOUT): Promise<HTMLElement> {
  fake.respondTo('GET /api/workouts/3', 200, JSON.stringify(workout));
  fake.respondTo('GET /api/exercises', 200, JSON.stringify(EXERCISES));
  const view = mount('gz-workout-detail', { 'workout-id': '3' });
  await settle();
  return view;
}

/** Where the "Add a set" form renders. */
function addSetRoot(view: HTMLElement): ShadowRoot {
  return shadow(find(shadow(view), 'gz-add-set-form'));
}

function addSetForm(view: HTMLElement): HTMLFormElement {
  return find<HTMLFormElement>(addSetRoot(view), "form[data-action='add-set']");
}

function detailsForm(view: HTMLElement): HTMLFormElement {
  return find<HTMLFormElement>(shadow(view), 'form.details');
}

function field(form: HTMLFormElement, name: string): HTMLInputElement {
  return find<HTMLInputElement>(form, `[name='${name}']`);
}

function exerciseSelect(view: HTMLElement): HTMLSelectElement {
  return find<HTMLSelectElement>(addSetForm(view), 'select');
}

/** Asked of the input's own root, so it holds wherever the form's shadow root is. */
function focused(input: HTMLElement): boolean {
  const rootNode = input.getRootNode();
  return rootNode instanceof ShadowRoot && rootNode.activeElement === input;
}

test('heads the page with the title and the date', async () => {
  const view = await mountView();
  expect(shadow(view).querySelector('h1')?.textContent).toBe('Push day');
  expect(shadow(view).querySelector('hgroup p')?.textContent).toContain(' · ');
});

test('shows one row per set', async () => {
  const view = await mountView();
  expect(shadow(view).querySelectorAll('gz-set-row')).toHaveLength(3);
});

test('totals the sets, exercises, reps and volume', async () => {
  const view = await mountView();
  const badges = Array.from(shadow(view).querySelectorAll('.totals .badge')).map((badge) => badge.textContent);
  expect(badges.slice(0, 3)).toEqual(['3 sets', '2 exercises', '15 reps']);
  expect(badges[3]).toEndWith('total volume');
});

function totals(view: HTMLElement): (string | null)[] {
  return Array.from(shadow(view).querySelectorAll('.totals .badge')).map((badge) => badge.textContent);
}

test('counts the sets done so far', async () => {
  const view = await mountView(withSets((item, index) => ({ ...item, done: index === 0 })));
  expect(totals(view)).toContain('1/3 done');
  expect(shadow(view).querySelector(".totals .badge[data-variant='success']")).toBeNull();
});

test('shows a done workout as done', async () => {
  const view = await mountView({ ...withSets((item) => ({ ...item, done: true })), done: true });
  expect(text(view, ".totals .badge[data-variant='success']")).toBe('✓ Done');
  expect(totals(view)).not.toContain('3/3 done');
});

test('shows no done badge for a workout without sets', async () => {
  const view = await mountView({ ...WORKOUT, exercises: [] });
  // Sets, exercises, reps and volume: nothing after them.
  expect(totals(view)).toHaveLength(4);
});

test('preselects the exercise of the last set', async () => {
  const view = await mountView();
  expect(exerciseSelect(view).value).toBe('2');
});

test('logs a set, reloads and puts focus back in the reps field', async () => {
  const view = await mountView();
  const loads = fake.requests.length;
  field(addSetForm(view), 'reps').value = '3';
  field(addSetForm(view), 'weight').value = '102.5';
  submit(addSetForm(view));
  await settle();
  expect(fake.sent('POST /api/workouts/3/sets')).toEqual([{ exerciseId: 2, weight: 102.5, reps: 3, notes: '' }]);
  expect(fake.requests.slice(loads).filter((request) => request.method === 'GET' && request.url === '/api/workouts/3')).toHaveLength(1);
  const reps = field(addSetForm(view), 'reps');
  expect(focused(reps)).toBe(true);
});

test('keeps unsaved text in the details form across logging a set', async () => {
  const view = await mountView();
  type(field(detailsForm(view), 'title'), 'Heavy push day');
  field(addSetForm(view), 'weight').value = '100';
  field(addSetForm(view), 'reps').value = '5';
  submit(addSetForm(view));
  await settle();
  expect(fake.sent('POST /api/workouts/3/sets')).toHaveLength(1);
  expect(field(detailsForm(view), 'title').value).toBe('Heavy push day');
});

/** Types into a details field and commits it, as leaving the field does. */
function commit(input: HTMLInputElement, value: string): void {
  type(input, value);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

test('has no save button for the details', async () => {
  const view = await mountView();
  expect(detailsForm(view).querySelector('button')).toBeNull();
});

test('saves a committed detail, sending only what differs, without a toast', async () => {
  const view = await mountView();
  commit(field(detailsForm(view), 'title'), ' Heavy push day ');
  await settle();
  expect(fake.sent('PATCH /api/workouts/3')).toEqual([{ title: 'Heavy push day' }]);
  expect(toasts).toEqual([]);
});

test('saves the details on Enter, once, even when the change is committed too', async () => {
  const view = await mountView();
  // The reload after the save then reads back what it sent, as the server would answer.
  fake.respondTo('GET /api/workouts/3', 200, JSON.stringify({ ...WORKOUT, title: 'Heavy push day' }));
  const title = field(detailsForm(view), 'title');
  type(title, 'Heavy push day');
  title.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  title.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  expect(fake.sent('PATCH /api/workouts/3')).toEqual([{ title: 'Heavy push day' }]);
});

test('saves no details when nothing differs', async () => {
  const view = await mountView();
  commit(field(detailsForm(view), 'title'), 'Push day ');
  await settle();
  expect(fake.sent('PATCH /api/workouts/3')).toEqual([]);
});

test('saves no details while the date is missing', async () => {
  const view = await mountView();
  commit(field(detailsForm(view), 'performedOn'), '');
  await settle();
  expect(fake.sent('PATCH /api/workouts/3')).toEqual([]);
});

test('keeps focus, and what was typed, in the details field the save moved it to', async () => {
  const view = await mountView();
  const notes = (): HTMLInputElement => field(detailsForm(view), 'notes');
  commit(field(detailsForm(view), 'title'), 'Heavy push day');
  notes().focus();
  type(notes(), 'Felt strong');
  await settle();
  expect(fake.sent('PATCH /api/workouts/3')).toHaveLength(1);
  expect(focused(notes())).toBe(true);
  expect(notes().value).toBe('Felt strong');
});

test('shows a missing workout with a way back, without a toast', async () => {
  fake.respondTo('GET /api/workouts/3', 404, JSON.stringify({ error: 'Workout not found' }));
  fake.respondTo('GET /api/exercises', 200, JSON.stringify(EXERCISES));
  const view = mount('gz-workout-detail', { 'workout-id': '3' });
  await settle();
  expect(shadow(view).querySelector('.error-text')?.textContent).toBe('Workout not found');
  expect(shadow(view).querySelector("a[href='/workouts']")?.textContent).toBe('Back to all workouts');
  expect(toasts).toEqual([]);
});

function groups(view: HTMLElement): HTMLDetailsElement[] {
  return Array.from(shadow(view).querySelectorAll<HTMLDetailsElement>("details[name='exercises']"));
}

function groupOf(view: HTMLElement, exerciseId: number): HTMLDetailsElement {
  return find<HTMLDetailsElement>(shadow(view), `details[data-exercise-id='${exerciseId}']`);
}

/** The exercise ids of the open groups. */
function openGroups(view: HTMLElement): (string | undefined)[] {
  return groups(view)
    .filter((item) => item.open)
    .map((item) => item.dataset.exerciseId);
}

/** Opens or closes a group the way a click on its header does. */
function setOpen(item: HTMLDetailsElement, open: boolean): void {
  item.open = open;
  item.dispatchEvent(new Event('toggle'));
}

async function changeSets(view: HTMLElement, workout: WorkoutWithExercisesDto = WORKOUT): Promise<void> {
  fake.respondTo('GET /api/workouts/3', 200, JSON.stringify(workout));
  find(shadow(view), 'gz-set-row').dispatchEvent(new CustomEvent('sets-changed', { bubbles: true, composed: true }));
  await settle();
}

test('groups the sets by exercise, in order, numbering the rows within each', async () => {
  const view = await mountView();
  expect(groups(view).map((item) => item.dataset.exerciseId)).toEqual(['1', '2']);
  expect(groups(view).map((item) => find(item, '.exercise-name').textContent)).toEqual(['Bench Press', 'Back Squat']);
  const rowsOf = (item: HTMLElement): (string | undefined)[][] =>
    Array.from(item.querySelectorAll<HTMLElement>('gz-set-row')).map((row) => [row.dataset.id, row.dataset.index]);
  expect(groups(view).map(rowsOf)).toEqual([
    [
      ['11', '1'],
      ['12', '2'],
    ],
    [['13', '1']],
  ]);
});

test("sums up each group in its header's badge", async () => {
  const view = await mountView(withSets((item) => ({ ...item, done: item.exerciseId === 2 })));
  expect(find(groupOf(view, 1), 'summary .badge').textContent).toStartWith('2 sets · 0/2 done · ');
  expect(find(groupOf(view, 2), 'summary .badge').textContent).toStartWith('1 set · ✓ Done · ');
});

test("links each group's header to the exercise", async () => {
  const view = await mountView();
  expect(find<HTMLAnchorElement>(groupOf(view, 1), 'summary a.button').getAttribute('href')).toBe('/exercises/1');
});

test('first opens the exercise of the first set not done', async () => {
  const view = await mountView(withSets((item, index) => ({ ...item, done: index < 2 })));
  expect(openGroups(view)).toEqual(['2']);
});

test('first opens the last exercise once every set is done', async () => {
  const view = await mountView({ ...withSets((item) => ({ ...item, done: true })), done: true });
  expect(openGroups(view)).toEqual(['2']);
});

test('shows no groups for a workout without sets', async () => {
  const view = await mountView({ ...WORKOUT, exercises: [] });
  expect(groups(view)).toEqual([]);
  expect(text(view, '.empty')).toBe('No sets logged for this session yet.');
});

test('keeps the group the user opened open across a change to a set', async () => {
  const view = await mountView();
  expect(openGroups(view)).toEqual(['1']);
  setOpen(groupOf(view, 2), true);
  await changeSets(view);
  expect(openGroups(view)).toEqual(['2']);
});

test('opens the exercise a set was just logged against', async () => {
  const view = await mountView();
  expect(openGroups(view)).toEqual(['1']);
  field(addSetForm(view), 'reps').value = '5';
  field(addSetForm(view), 'weight').value = '100';
  submit(addSetForm(view));
  await settle();
  expect(fake.sent('POST /api/workouts/3/sets')).toMatchObject([{ exerciseId: 2 }]);
  expect(openGroups(view)).toEqual(['2']);
});

test('keeps every group collapsed once the user collapses the open one', async () => {
  const view = await mountView();
  setOpen(groupOf(view, 1), false);
  await changeSets(view);
  expect(openGroups(view)).toEqual([]);
});

test('collapses every group once the open one has lost its last set', async () => {
  const view = await mountView();
  await changeSets(view, { ...WORKOUT, exercises: [SQUAT] });
  expect(openGroups(view)).toEqual([]);
});

/** Whether a cancelable click on `target` came out default-prevented; no click is let through. */
function clickPrevented(target: Element): boolean {
  let prevented = false;
  document.addEventListener(
    'click',
    (event) => {
      prevented = event.defaultPrevented;
      event.preventDefault();
    },
    { once: true },
  );
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
  return prevented;
}

test("keeps a click among the header's actions from toggling the group, but lets the link through", async () => {
  const view = await mountView();
  expect(clickPrevented(find(groupOf(view, 1), 'summary .actions'))).toBe(true);
  expect(clickPrevented(find(groupOf(view, 1), 'summary a.button'))).toBe(false);
});

function arrow(view: HTMLElement, exerciseId: number, direction: 'up' | 'down'): HTMLButtonElement {
  return find<HTMLButtonElement>(groupOf(view, exerciseId), `[data-action='move-exercise-${direction}']`);
}

function workoutLoads(): number {
  return fake.requests.filter((request) => request.method === 'GET' && request.url === '/api/workouts/3').length;
}

test('disables ▲ on the first exercise and ▼ on the last', async () => {
  const view = await mountView();
  expect([1, 2].map((id) => [arrow(view, id, 'up').disabled, arrow(view, id, 'down').disabled])).toEqual([
    [true, false],
    [false, true],
  ]);
});

test('moves an exercise up, reloads in the new order, keeps the open one open and focus on the moved arrow', async () => {
  const view = await mountView();
  const loads = workoutLoads();
  fake.respondTo(
    'GET /api/workouts/3',
    200,
    JSON.stringify({
      ...WORKOUT,
      exercises: [
        { ...SQUAT, position: 1 },
        { ...BENCH, position: 2 },
      ],
    }),
  );
  arrow(view, 2, 'up').click();
  await settle();
  expect(fake.sent('POST /api/workouts/3/exercises/2/move')).toEqual([{ direction: 'up' }]);
  expect(workoutLoads()).toBe(loads + 1);
  expect(groups(view).map((item) => item.dataset.exerciseId)).toEqual(['2', '1']);
  expect(openGroups(view)).toEqual(['1']);
  // Now first, so ▲ is disabled and focus lands on ▼.
  expect(arrow(view, 2, 'up').disabled).toBe(true);
  expect(shadow(view).activeElement).toBe(arrow(view, 2, 'down'));
});

test('keeps a click on an arrow from toggling its group', async () => {
  const view = await mountView();
  expect(clickPrevented(arrow(view, 2, 'up'))).toBe(true);
  await settle();
  expect(groupOf(view, 2).open).toBe(false);
});

test('toasts a failed move and does not reload', async () => {
  const view = await mountView();
  const loads = workoutLoads();
  fake.respondTo('POST /api/workouts/3/exercises/2/move', 404, JSON.stringify({ error: 'Exercise in this workout not found' }));
  arrow(view, 2, 'up').click();
  await settle();
  expect(toasts).toEqual(['Exercise in this workout not found']);
  expect(workoutLoads()).toBe(loads);
});

test("hands focus, and what was typed, back to a set's field after a reload", async () => {
  const view = await mountView();
  const weight = (): HTMLInputElement => find<HTMLInputElement>(shadow(find(shadow(view), "gz-set-row[data-id='12']")), "[name='weight']");
  weight().focus();
  weight().value = '85';
  await changeSets(view);
  expect(shadow(find(shadow(view), "gz-set-row[data-id='12']")).activeElement).toBe(weight());
  expect(weight().value).toBe('85');
});
