import { beforeAll, expect, test } from 'bun:test';
import { find, mount, openDialog, settle, shadow, submit, testId, text, type, useDom, useFetch, useToasts } from '../../testing.ts';
import type { ExercisePageDto } from '../../../shared/dto/exercise.ts';
import type { LiftSetDto } from '../../../shared/dto/set.ts';
import type { WorkoutDto, WorkoutWithExercisesDto } from '../../../shared/dto/workout.ts';
import { exercise } from '../exercises/exercises.fixtures.ts';
import { group, set } from './workouts.fixtures.ts';
import { formatDate } from '../../ui/format.ts';
import type { GzView } from '../../ui/view.ts';

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
  all: 2,
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

// What PATCH /api/workouts/:id answers: the workout without its exercises.
function answerUpdate(changes: Partial<WorkoutDto>): void {
  const { exercises: _, ...workout } = WORKOUT;
  fake.respondTo('PATCH /api/workouts/3', 200, JSON.stringify({ ...workout, ...changes }));
}

function withSets(change: (item: LiftSetDto, index: number) => LiftSetDto): WorkoutWithExercisesDto {
  let index = 0;
  return { ...WORKOUT, exercises: WORKOUT.exercises.map((item) => ({ ...item, sets: item.sets.map((each) => change(each, index++)) })) };
}

async function mountView(workout: WorkoutWithExercisesDto = WORKOUT): Promise<GzView<unknown>> {
  fake.respondTo('GET /api/workouts/3', 200, JSON.stringify(workout));
  fake.respondTo('GET /api/exercises', 200, JSON.stringify(EXERCISES));
  const view = mount<GzView<unknown>>('gz-workout-detail', { 'workout-id': '3' });
  await settle();
  return view;
}

function addSetRoot(view: HTMLElement): ShadowRoot {
  return shadow(find(shadow(view), testId('add-set-form')));
}

function addSetForm(view: HTMLElement): HTMLFormElement {
  return find<HTMLFormElement>(addSetRoot(view), testId('form'));
}

function detailsForm(view: HTMLElement): HTMLFormElement {
  return find<HTMLFormElement>(shadow(view), testId('details-form'));
}

function field(form: HTMLFormElement, name: string): HTMLInputElement {
  return find<HTMLInputElement>(form, testId(name));
}

function exerciseSelect(view: HTMLElement): HTMLSelectElement {
  return find<HTMLSelectElement>(addSetForm(view), testId('exercise'));
}

function focused(input: HTMLElement): boolean {
  const rootNode = input.getRootNode();
  return rootNode instanceof ShadowRoot && rootNode.activeElement === input;
}

test('heads the page with the title and the date', async () => {
  const view = await mountView();
  expect(shadow(view).querySelector(testId('heading'))?.textContent).toBe('Push day');
  expect(shadow(view).querySelector(testId('subtitle'))?.textContent).toContain(' · ');
});

test('shows one row per set', async () => {
  const view = await mountView();
  expect(shadow(view).querySelectorAll(testId('set-row'))).toHaveLength(3);
});

test('totals the sets, exercises, reps and volume in one muted line', async () => {
  const view = await mountView();
  expect(text(view, testId('totals'))?.trim()).toStartWith('3 sets · 2 exercises · 15 reps · ');
});

function strip(view: HTMLElement): HTMLElement | null {
  return shadow(view).querySelector<HTMLElement>(testId('progress-strip'));
}

function bar(view: HTMLElement): HTMLProgressElement {
  return find<HTMLProgressElement>(shadow(view), testId('progress-bar'));
}

function stripText(view: HTMLElement): (string | undefined)[] {
  return [text(view, testId('progress-label')), text(view, testId('progress-percent'))];
}

test('shows the sets done so far in the progress strip', async () => {
  const view = await mountView(withSets((item, index) => ({ ...item, done: index === 0 })));
  expect(stripText(view)).toEqual(['1/3 sets', '33%']);
  expect([bar(view).value, bar(view).max, bar(view).getAttribute('aria-label')]).toEqual([1, 3, '1 of 3 sets done']);
  expect(strip(view)?.classList.contains('complete')).toBe(false);
});

// The values the view slides a bar to; rendered values are not among them.
async function slides(during: () => Promise<unknown>): Promise<number[]> {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLProgressElement.prototype, 'value');
  if (!descriptor?.set) {
    throw new Error('no value setter on HTMLProgressElement');
  }
  const written: number[] = [];
  Object.defineProperty(HTMLProgressElement.prototype, 'value', {
    ...descriptor,
    set(this: HTMLProgressElement, value: number) {
      written.push(value);
      descriptor.set?.call(this, value);
    },
  });
  try {
    await during();
  } finally {
    Object.defineProperty(HTMLProgressElement.prototype, 'value', descriptor);
  }
  return written;
}

test('shows the bar at its value on the first render, without a slide from 0', async () => {
  let view: HTMLElement | undefined;
  expect(await slides(async () => (view = await mountView(withSets((item, index) => ({ ...item, done: index === 0 })))))).toEqual([]);
  expect(view && bar(view).value).toBe(1);
});

test('shows no sets done as 0%', async () => {
  const view = await mountView();
  expect(stripText(view)).toEqual(['0/3 sets', '0%']);
});

test('floors the percentage, so it is never 100% early', async () => {
  const view = await mountView(withSets((item, index) => ({ ...item, done: index < 2 })));
  expect(stripText(view)).toEqual(['2/3 sets', '66%']);
});

test('puts the progress strip first, before the heading', async () => {
  const view = await mountView();
  expect(find(shadow(view), '.vstack').firstElementChild).toBe(strip(view));
});

test('keeps the set progress out of the summary', async () => {
  const view = await mountView(withSets((item, index) => ({ ...item, done: index === 0 })));
  expect(find(shadow(view), testId('summary')).querySelector(testId('progress'))).toBeNull();
});

function workoutBadge(view: HTMLElement): HTMLElement | null {
  return find(shadow(view), testId('summary')).querySelector<HTMLElement>(testId('workout-done'));
}

test('shows a done workout as done, beside the progress of its sets', async () => {
  const view = await mountView({ ...withSets((item, index) => ({ ...item, done: index !== 1 })), done: true });
  expect(stripText(view)).toEqual(['2/3 sets', '66%']);
  expect([workoutBadge(view)?.textContent, workoutBadge(view)?.dataset.variant]).toEqual(['✓ Done', 'success']);
});

test('shows a workout whose sets are all done, but which is not, as complete sets but not done', async () => {
  const view = await mountView(withSets((item) => ({ ...item, done: true })));
  expect(stripText(view)).toEqual(['✓ 3/3 sets', '100%']);
  expect(strip(view)?.classList.contains('complete')).toBe(true);
  expect(workoutBadge(view)).toBeNull();
});

test('shows no progress strip, done badge or finish button for a workout without sets', async () => {
  const view = await mountView({ ...WORKOUT, exercises: [] });
  expect(strip(view)).toBeNull();
  for (const id of ['workout-done', 'finish-workout', 'reopen-workout']) {
    expect(shadow(view).querySelector(testId(id))).toBeNull();
  }
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

function commit(input: HTMLInputElement, value: string): void {
  type(input, value);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function detailsSection(view: HTMLElement): HTMLDetailsElement {
  return find<HTMLDetailsElement>(shadow(view), testId('details-section'));
}

test('collapses "Details & notes", with "Delete workout" inside, below the add-set form', async () => {
  const view = await mountView();
  const section = detailsSection(view);
  expect(section.open).toBe(false);
  expect(section.hasAttribute('name')).toBe(false);
  expect(find(section, testId('details-summary')).textContent).toBe('Details & notes');
  expect(find(section, testId('delete-workout')).textContent).toBe('Delete workout');
  expect(section.contains(detailsForm(view))).toBe(true);
  expect(find(shadow(view), testId('add-set-form')).compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('keeps "Details & notes" open across a reload once opened', async () => {
  const view = await mountView();
  setOpen(detailsSection(view), true);
  await changeSets(view);
  expect(detailsSection(view).open).toBe(true);
  setOpen(detailsSection(view), false);
  await changeSets(view);
  expect(detailsSection(view).open).toBe(false);
});

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
  answerUpdate({ title: 'Heavy push day' });
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

test('shows a missing workout without a toast, and names nothing', async () => {
  fake.respondTo('GET /api/workouts/3', 404, JSON.stringify({ error: 'Workout not found' }));
  fake.respondTo('GET /api/exercises', 200, JSON.stringify(EXERCISES));
  const view = mount<GzView<unknown>>('gz-workout-detail', { 'workout-id': '3' });
  await settle();
  expect(shadow(view).querySelector(testId('error'))?.textContent).toBe('Workout not found');
  expect(toasts).toEqual([]);
  expect(view.pageTitle).toBeNull();
});

test('names the workout by its title for the breadcrumb and the tab', async () => {
  const view = await mountView();
  expect(view.pageTitle).toBe('Push day');
});

test('names an untitled workout by its date, as its heading does', async () => {
  const view = await mountView({ ...WORKOUT, title: null });
  expect(view.pageTitle).toBe(formatDate(WORKOUT.performedOn));
  expect(text(view, testId('heading'))).toBe(formatDate(WORKOUT.performedOn));
});

function groups(view: HTMLElement): HTMLDetailsElement[] {
  return Array.from(shadow(view).querySelectorAll<HTMLDetailsElement>(testId('exercise-group')));
}

function groupOf(view: HTMLElement, exerciseId: number): HTMLDetailsElement {
  const found = groups(view).find((item) => item.dataset.exerciseId === String(exerciseId));
  if (!found) {
    throw new Error(`no group for exercise ${exerciseId}`);
  }
  return found;
}

function setRow(view: HTMLElement, setId: number): HTMLElement {
  const found = Array.from(shadow(view).querySelectorAll<HTMLElement>(testId('set-row'))).find((row) => row.dataset.id === String(setId));
  if (!found) {
    throw new Error(`no row for set ${setId}`);
  }
  return found;
}

function openGroups(view: HTMLElement): (string | undefined)[] {
  return groups(view)
    .filter((item) => item.open)
    .map((item) => item.dataset.exerciseId);
}

function setOpen(item: HTMLDetailsElement, open: boolean): void {
  item.open = open;
  item.dispatchEvent(new Event('toggle'));
}

async function changeSets(view: HTMLElement, workout: WorkoutWithExercisesDto = WORKOUT): Promise<void> {
  fake.respondTo('GET /api/workouts/3', 200, JSON.stringify(workout));
  find(shadow(view), testId('set-row')).dispatchEvent(new CustomEvent('sets-changed', { bubbles: true, composed: true }));
  await settle();
}

test('groups the sets by exercise, in order, numbering the rows within each', async () => {
  const view = await mountView();
  expect(groups(view).map((item) => item.dataset.exerciseId)).toEqual(['1', '2']);
  expect(groups(view).map((item) => find(item, testId('exercise-name')).textContent)).toEqual(['Bench Press', 'Back Squat']);
  const rowsOf = (item: HTMLElement): (string | undefined)[][] =>
    Array.from(item.querySelectorAll<HTMLElement>(testId('set-row'))).map((row) => [row.dataset.id, row.dataset.index]);
  expect(groups(view).map(rowsOf)).toEqual([
    [
      ['11', '1'],
      ['12', '2'],
    ],
    [['13', '1']],
  ]);
});

function headerBadges(view: HTMLElement, exerciseId: number): (string | null)[] {
  return Array.from(groupOf(view, exerciseId).querySelectorAll(testId('progress'))).map((badge) => badge.textContent);
}

test("sums up each group in its header's muted stats and its progress in a badge", async () => {
  const view = await mountView(withSets((item) => ({ ...item, done: item.exerciseId === 2 })));
  const benchStats = find(groupOf(view, 1), testId('group-stats')).textContent;
  expect(benchStats).toStartWith('2 sets · ');
  expect(benchStats).not.toContain('done');
  expect(headerBadges(view, 1)).toEqual(['0/2 done']);
  expect(find<HTMLElement>(groupOf(view, 1), testId('progress')).dataset.variant).toBeUndefined();
  expect(find(groupOf(view, 2), testId('group-stats')).textContent).toStartWith('1 set · ');
  expect(headerBadges(view, 2)).toEqual(['✓ Done']);
  expect(find<HTMLElement>(groupOf(view, 2), testId('progress')).dataset.variant).toBe('success');
});

test('keeps buttons and links out of the group headers', async () => {
  const view = await mountView();
  expect(shadow(view).querySelectorAll('summary :is(button, a)')).toHaveLength(0);
});

test("links each group's footer to the exercise's history", async () => {
  const view = await mountView();
  const link = find<HTMLAnchorElement>(groupOf(view, 1), testId('history-link'));
  expect(link.getAttribute('href')).toBe('/exercises/1');
  expect(link.textContent).toBe('Exercise history →');
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
  expect(text(view, testId('empty'))).toBe('No sets logged for this session yet.');
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

function arrow(view: HTMLElement, exerciseId: number, direction: 'up' | 'down'): HTMLButtonElement {
  return find<HTMLButtonElement>(groupOf(view, exerciseId), testId(`move-${direction}`));
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

test('moves an exercise up, shows the order it answers without a reload, keeps the open one open and focus on the moved arrow', async () => {
  const view = await mountView();
  setOpen(groupOf(view, 2), true);
  const loads = workoutLoads();
  fake.respondTo(
    'POST /api/workouts/3/exercises/2/move',
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
  expect(workoutLoads()).toBe(loads);
  expect(groups(view).map((item) => item.dataset.exerciseId)).toEqual(['2', '1']);
  expect(openGroups(view)).toEqual(['2']);
  expect(arrow(view, 2, 'up').disabled).toBe(true);
  expect(shadow(view).activeElement).toBe(arrow(view, 2, 'down'));
});

test('toasts a failed move and does not reload', async () => {
  const view = await mountView();
  setOpen(groupOf(view, 2), true);
  const loads = workoutLoads();
  fake.respondTo('POST /api/workouts/3/exercises/2/move', 404, JSON.stringify({ error: 'Exercise in this workout not found' }));
  arrow(view, 2, 'up').click();
  await settle();
  expect(toasts).toEqual(['Exercise in this workout not found']);
  expect(workoutLoads()).toBe(loads);
});

test('applies an updated set without a reload', async () => {
  const view = await mountView();
  const loads = workoutLoads();
  const updated = set({ id: 11, exerciseId: 1, exerciseName: 'Bench Press', weight: 80, done: true });
  const slid = await slides(async () => {
    setRow(view, 11).dispatchEvent(new CustomEvent('set-updated', { detail: updated, bubbles: true, composed: true }));
    await settle();
  });
  expect(workoutLoads()).toBe(loads);
  expect(headerBadges(view, 1)).toEqual(['1/2 done']);
  expect(find(shadow(setRow(view, 11)), testId('row')).classList.contains('done')).toBe(true);
  expect(text(view, testId('progress-label'))).toBe('1/3 sets');
  expect(slid).toEqual([1]);
  expect(bar(view).value).toBe(1);
});

test('loads the exercises once, not on every reload', async () => {
  const view = await mountView();
  await changeSets(view);
  expect(fake.requests.filter((request) => request.method === 'GET' && request.url.startsWith('/api/exercises'))).toHaveLength(1);
});

test("hands focus, and what was typed, back to a set's field after a reload", async () => {
  const view = await mountView();
  const weight = (): HTMLInputElement => find<HTMLInputElement>(shadow(setRow(view, 12)), testId('weight'));
  weight().focus();
  weight().value = '85';
  await changeSets(view);
  expect(shadow(setRow(view, 12)).activeElement).toBe(weight());
  expect(weight().value).toBe('85');
});

function button(view: HTMLElement, id: string): HTMLButtonElement {
  return find<HTMLButtonElement>(shadow(view), testId(id));
}

function asked(): HTMLElement | null {
  return document.body.querySelector('gz-confirm-dialog');
}

function answer(dialog: ShadowRoot, id: 'confirm' | 'cancel'): void {
  find<HTMLButtonElement>(dialog, testId(id)).click();
}

function listed(dialog: ShadowRoot): (string | null)[] {
  return Array.from(find(dialog, testId('items')).querySelectorAll('li')).map((item) => item.textContent);
}

test('puts "Mark workout done" after the add-set form and before "Details & notes"', async () => {
  const view = await mountView();
  const finish = button(view, 'finish-workout');
  expect(finish.textContent).toBe('Mark workout done');
  expect(find(shadow(view), testId('add-set-form')).compareDocumentPosition(finish) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(finish.compareDocumentPosition(detailsSection(view)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('marks a workout whose sets are all done done without asking, toasts and shows it done without a reload', async () => {
  const view = await mountView(withSets((item) => ({ ...item, done: true })));
  const loads = workoutLoads();
  answerUpdate({ done: true });
  button(view, 'finish-workout').click();
  expect(asked()).toBeNull();
  await settle();
  expect(fake.sent('PATCH /api/workouts/3')).toEqual([{ done: true }]);
  expect(toasts).toEqual(['Workout done']);
  expect(workoutLoads()).toBe(loads);
  expect(text(view, testId('workout-done'))).toBe('✓ Done');
  expect(button(view, 'reopen-workout').textContent).toBe('Reopen workout');
});

test('asks before marking a workout with incomplete exercises done, listing them', async () => {
  const view = await mountView();
  answerUpdate({ done: true });
  button(view, 'finish-workout').click();
  const dialog = openDialog();
  expect(find(dialog, testId('title')).textContent).toBe('Finish with 2 exercises incomplete?');
  expect(listed(dialog)).toEqual(['Bench Press — 0/2 sets', 'Back Squat — 0/1 sets']);
  expect(find<HTMLButtonElement>(dialog, testId('confirm')).dataset.variant).toBeUndefined();
  expect(find(dialog, testId('confirm')).textContent).toBe('Mark workout done');
  answer(dialog, 'confirm');
  await settle();
  expect(fake.sent('PATCH /api/workouts/3')).toEqual([{ done: true }]);
});

test('sends nothing when the confirmation is cancelled', async () => {
  const view = await mountView();
  const loads = workoutLoads();
  button(view, 'finish-workout').click();
  answer(openDialog(), 'cancel');
  await settle();
  expect(fake.sent('PATCH /api/workouts/3')).toEqual([]);
  expect(workoutLoads()).toBe(loads);
});

test('lists only the incomplete exercises, and one in the singular', async () => {
  const view = await mountView(withSets((item, index) => ({ ...item, done: index !== 1 })));
  button(view, 'finish-workout').click();
  const dialog = openDialog();
  expect(find(dialog, testId('title')).textContent).toBe('Finish with 1 exercise incomplete?');
  expect(listed(dialog)).toEqual(['Bench Press — 1/2 sets']);
});

function rowControls(view: HTMLElement, setId: number): HTMLButtonElement[] {
  const root = shadow(setRow(view, setId));
  return ['toggle-done', 'weight', 'reps', 'notes', 'duplicate', 'delete'].map((id) => find<HTMLButtonElement>(root, testId(id)));
}

test('locks a done workout: no add-set form, every row disabled, and "Reopen workout"', async () => {
  const view = await mountView({ ...withSets((item, index) => ({ ...item, done: index === 0 })), done: true });
  expect(shadow(view).querySelector(testId('add-set-form'))).toBeNull();
  expect(shadow(view).querySelector(testId('finish-workout'))).toBeNull();
  expect(button(view, 'reopen-workout').textContent).toBe('Reopen workout');
  for (const id of [11, 12, 13]) {
    expect(rowControls(view, id).map((control) => control.disabled)).toEqual([true, true, true, true, true, true]);
  }
});

test('reopens a done workout without asking or a reload', async () => {
  const view = await mountView({ ...WORKOUT, done: true });
  const loads = workoutLoads();
  answerUpdate({ done: false });
  button(view, 'reopen-workout').click();
  expect(asked()).toBeNull();
  await settle();
  expect(fake.sent('PATCH /api/workouts/3')).toEqual([{ done: false }]);
  expect(workoutLoads()).toBe(loads);
  expect(button(view, 'finish-workout').textContent).toBe('Mark workout done');
});

test('toasts a failed finish, once confirmed, and does not reload', async () => {
  const view = await mountView();
  const loads = workoutLoads();
  fake.respondTo('PATCH /api/workouts/3', 409, JSON.stringify({ error: 'Workout has no sets; log one before marking it done' }));
  button(view, 'finish-workout').click();
  answer(openDialog(), 'confirm');
  await settle();
  expect(toasts).toEqual(['Workout has no sets; log one before marking it done']);
  expect(workoutLoads()).toBe(loads);
});

test('asks in a danger dialog before deleting the workout, and sends nothing on Cancel', async () => {
  const view = await mountView();
  button(view, 'delete-workout').click();
  const dialog = openDialog();
  expect(find(dialog, testId('title')).textContent).toBe('Delete workout?');
  expect(find(dialog, testId('message')).textContent).toBe('All of its sets are deleted too. This cannot be undone.');
  expect(find<HTMLButtonElement>(dialog, testId('confirm')).dataset.variant).toBe('danger');
  answer(dialog, 'cancel');
  await settle();
  expect(fake.sent('DELETE /api/workouts/3')).toEqual([]);
  expect(toasts).toEqual([]);
});

test('deletes the workout once confirmed, toasts and returns to the workouts', async () => {
  const view = await mountView();
  fake.respondTo('DELETE /api/workouts/3', 204);
  button(view, 'delete-workout').click();
  answer(openDialog(), 'confirm');
  await settle();
  expect(fake.sent('DELETE /api/workouts/3')).toEqual([undefined]);
  expect(toasts).toEqual(['Workout deleted']);
  expect(location.pathname).toBe('/workouts');
});
