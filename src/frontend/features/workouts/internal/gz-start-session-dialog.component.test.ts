import { beforeAll, expect, test } from 'bun:test';
import { find, shadow, testId, useDom } from '../../../testing.ts';
import type { ExerciseWithStatsDto } from '../../../../shared/dto/exercise.ts';
import type { ExerciseId } from '../../../../shared/flavors.ts';
import { listedExercise } from '../../exercises/exercises.fixtures.ts';
import { formatShortDate } from '../../../ui/format.ts';

useDom();

let pickExercises: (exercises: ExerciseWithStatsDto[]) => Promise<ExerciseId[] | null>;

beforeAll(async () => {
  ({ pickExercises } = await import('./start-session.ts'));
});

const EXERCISES = [
  listedExercise({ id: 1, name: 'Back Squat', muscleGroup: 'Legs', lastPerformedOn: '2026-10-05' }),
  listedExercise({ id: 2, name: 'Bench Press', muscleGroup: 'Chest', lastPerformedOn: '2026-10-05' }),
  listedExercise({ id: 3, name: 'Barbell Row', lastPerformedOn: '2026-10-03' }),
];

// happy-dom opens a dialog synchronously, so call this right after pickExercises().
function openPicker(): ShadowRoot {
  const root = shadow(find(document.body, 'gz-start-session-dialog'));
  if (!find<HTMLDialogElement>(root, 'dialog').open) {
    throw new Error('the start-session dialog is not open');
  }
  return root;
}

function tick(root: ShadowRoot, id: number, checked = true): void {
  const box = find<HTMLInputElement>(root, `input[value='${id}']`);
  box.checked = checked;
  box.dispatchEvent(new Event('change', { bubbles: true }));
}

function start(root: ShadowRoot): HTMLButtonElement {
  return find<HTMLButtonElement>(root, testId('start-picked'));
}

test('lists the given exercises with their last date', () => {
  void pickExercises(EXERCISES);
  const root = openPicker();
  expect(Array.from(root.querySelectorAll(testId('pick-name'))).map((name) => name.textContent)).toEqual(['Back Squat', 'Bench Press', 'Barbell Row']);
  expect(find(root, '.last').textContent).toBe(`last ${formatShortDate('2026-10-05')}`);
  expect(root.querySelectorAll('gz-muscle-group-icon')).toHaveLength(3);
});

test('counts the ticks on Start, disabled at none', () => {
  void pickExercises(EXERCISES);
  const root = openPicker();
  expect(start(root).disabled).toBe(true);
  expect(start(root).textContent).toBe('Start with 0');
  tick(root, 2);
  tick(root, 3);
  expect(start(root).disabled).toBe(false);
  expect(start(root).textContent).toBe('Start with 2');
  tick(root, 2, false);
  tick(root, 3, false);
  expect(start(root).disabled).toBe(true);
});

test('resolves the ids in tick order and removes itself', async () => {
  const answer = pickExercises(EXERCISES);
  const root = openPicker();
  tick(root, 3);
  tick(root, 1);
  tick(root, 2);
  tick(root, 1, false);
  start(root).click();
  expect(await answer).toEqual([3, 2]);
  expect(document.body.querySelector('gz-start-session-dialog')).toBeNull();
});

test('resolves [] on Start empty', async () => {
  const answer = pickExercises(EXERCISES);
  const root = openPicker();
  tick(root, 1);
  find<HTMLButtonElement>(root, testId('start-empty')).click();
  expect(await answer).toEqual([]);
});

test('resolves null on Cancel', async () => {
  const answer = pickExercises(EXERCISES);
  const root = openPicker();
  tick(root, 1);
  find<HTMLButtonElement>(root, testId('cancel')).click();
  expect(await answer).toBeNull();
  expect(document.body.querySelector('gz-start-session-dialog')).toBeNull();
});

test('resolves null when closed without a choice, as Escape does', async () => {
  const answer = pickExercises(EXERCISES);
  find<HTMLDialogElement>(openPicker(), 'dialog').close();
  expect(await answer).toBeNull();
});

test('resolves null on a click on the backdrop', async () => {
  const answer = pickExercises(EXERCISES);
  find<HTMLElement>(openPicker(), 'dialog').click();
  expect(await answer).toBeNull();
});
