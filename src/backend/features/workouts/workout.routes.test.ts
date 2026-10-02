import { describe, expect, test } from 'bun:test';
import type { LiftSetDto } from '../../../shared/dto/set.ts';
import type { WorkoutDto, WorkoutPageDto, WorkoutWithExercisesDto, WorkoutWithStatsDto } from '../../../shared/dto/workout.ts';
import type { WorkoutId } from '../../../shared/flavors.ts';
import { at, body, useServer } from '../../testing.ts';
import { createExercise } from '../exercises/exercises.fixtures.ts';
import { createSet, createWorkout, markDone } from './workouts.fixtures.ts';

const { api, post, patch } = useServer();

/** Every set of the workout, group by group. */
function sets(workout: WorkoutWithExercisesDto): LiftSetDto[] {
  return workout.exercises.flatMap((group) => group.sets);
}

describe('workouts', () => {
  test('defaults the workout date to today', async () => {
    const res = await post('/api/workouts', {});
    expect(res.status).toBe(201);
    expect((await body<WorkoutDto>(res)).performedOn).toBe(new Date().toISOString().slice(0, 10));
  });

  test('rejects an invalid date', async () => {
    const res = await post('/api/workouts', { performedOn: '05.01.2026' });
    expect(res.status).toBe(400);
  });

  test('deleting a workout removes its sets', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const set = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });

    expect((await api(`/api/workouts/${workout.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await api(`/api/sets/${set.id}`)).status).toBe(404);
  });

  test('copies sets from a previous workout', async () => {
    const exercise = await createExercise(post);
    const source = await createWorkout(post, '2026-01-05');
    await createSet(post, source.id, { exerciseId: exercise.id, reps: 5, weight: 60 });
    await createSet(post, source.id, { exerciseId: exercise.id, reps: 5, weight: 65 });

    const res = await post('/api/workouts', { performedOn: '2026-01-12', copyFromWorkoutId: source.id });
    expect(res.status).toBe(201);
    const copy = await body<WorkoutWithExercisesDto>(res);
    expect(sets(copy)).toHaveLength(2);
    expect(sets(copy).map((s) => s.weight)).toEqual([60, 65]);
  });

  test('copies done sets as not done', async () => {
    const exercise = await createExercise(post);
    const source = await createWorkout(post, '2026-01-05');
    const set = await createSet(post, source.id, { exerciseId: exercise.id, reps: 5, weight: 60 });
    await markDone(patch, set.id);

    const copy = await body<WorkoutWithExercisesDto>(await post('/api/workouts', { performedOn: '2026-01-12', copyFromWorkoutId: source.id }));
    expect(sets(copy).map((s) => s.done)).toEqual([false]);
  });

  test('copying from a missing workout creates nothing', async () => {
    await createWorkout(post, '2026-01-05');
    const before = (await body<WorkoutPageDto>(await api('/api/workouts'))).total;

    const res = await post('/api/workouts', { performedOn: '2026-01-12', copyFromWorkoutId: 9999 });

    expect(res.status).toBe(404);
    expect((await body<WorkoutPageDto>(await api('/api/workouts'))).total).toBe(before);
  });

  test('rejects a malformed copyFromWorkoutId before writing anything', async () => {
    const before = (await body<WorkoutPageDto>(await api('/api/workouts'))).total;

    const res = await post('/api/workouts', { performedOn: '2026-01-12', copyFromWorkoutId: 'nope' });

    expect(res.status).toBe(400);
    expect((await body<WorkoutPageDto>(await api('/api/workouts'))).total).toBe(before);
  });

  test('lists workouts with roll-up statistics', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    await createSet(post, workout.id, { exerciseId: exercise.id, reps: 10, weight: 50 });
    await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });

    const page = await body<WorkoutPageDto>(await api('/api/workouts'));
    expect(page).toMatchObject({ total: 1, limit: 50, offset: 0 });
    expect(page.items[0]).toMatchObject({ setCount: 2, exerciseCount: 1, totalReps: 15, totalVolume: 800 });
  });

  test('rejects an out-of-range limit', async () => {
    expect((await api('/api/workouts?limit=9999')).status).toBe(400);
  });
});

describe("a workout's sets", () => {
  test('logs sets and returns them with the workout', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);

    await createSet(post, workout.id, {
      exerciseId: exercise.id,
      reps: 8,
      weight: 60,
      notes: 'warm-up',
    });
    await createSet(post, workout.id, { exerciseId: exercise.id, reps: 6, weight: 70 });

    const detail = await body<WorkoutWithExercisesDto>(await api(`/api/workouts/${workout.id}`));
    expect(sets(detail)).toHaveLength(2);
    expect(sets(detail)[0]).toMatchObject({ reps: 8, weight: 60, notes: 'warm-up', exerciseName: 'Bench Press' });
    expect(at(sets(detail), 1).position).toBeGreaterThan(at(sets(detail), 0).position);
  });

  test('groups interleaved sets by exercise, in the order each exercise was first logged', async () => {
    const bench = await createExercise(post);
    const row = await createExercise(post, 'Barbell Row');
    const workout = await createWorkout(post);
    const first = await createSet(post, workout.id, { exerciseId: bench.id, reps: 5, weight: 80 });
    const rowed = await createSet(post, workout.id, { exerciseId: row.id, reps: 8, weight: 60 });
    const second = await createSet(post, workout.id, { exerciseId: bench.id, reps: 5, weight: 82.5 });

    const detail = await body<WorkoutWithExercisesDto>(await api(`/api/workouts/${workout.id}`));
    expect(detail.exercises.map(({ exerciseId, exerciseName, position }) => ({ exerciseId, exerciseName, position }))).toEqual([
      { exerciseId: bench.id, exerciseName: 'Bench Press', position: 1 },
      { exerciseId: row.id, exerciseName: 'Barbell Row', position: 2 },
    ]);
    expect(detail.exercises.map((group) => group.sets.map((set) => set.id))).toEqual([[first.id, second.id], [rowed.id]]);
  });

  test('"Repeat" copies the order of the exercises', async () => {
    const bench = await createExercise(post);
    const row = await createExercise(post, 'Barbell Row');
    const source = await createWorkout(post, '2026-01-05');
    await createSet(post, source.id, { exerciseId: row.id, reps: 8, weight: 60 });
    await createSet(post, source.id, { exerciseId: bench.id, reps: 5, weight: 80 });

    const copy = await body<WorkoutWithExercisesDto>(await post('/api/workouts', { performedOn: '2026-01-12', copyFromWorkoutId: source.id }));
    expect(copy.exercises.map((group) => [group.exerciseId, group.position])).toEqual([
      [row.id, 1],
      [bench.id, 2],
    ]);
  });

  test('rejects non-positive reps, and an exercise that does not exist, with 400', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);

    expect((await post(`/api/workouts/${workout.id}/sets`, { exerciseId: exercise.id, reps: 0, weight: 60 })).status).toBe(400);
    // The foreign key refuses the insert; the workout id in the path is what earns a 404.
    expect((await post(`/api/workouts/${workout.id}/sets`, { exerciseId: 4242, reps: 5, weight: 60 })).status).toBe(400);
  });
});

describe("a workout's done state", () => {
  async function doneState(id: WorkoutId): Promise<{ detail: boolean; listed: Partial<WorkoutWithStatsDto> | undefined }> {
    const detail = await body<WorkoutWithExercisesDto>(await api(`/api/workouts/${id}`));
    const page = await body<WorkoutPageDto>(await api('/api/workouts'));
    const listed = page.items.find((item) => item.id === id);
    return { detail: detail.done, listed: listed && { done: listed.done, doneSetCount: listed.doneSetCount } };
  }

  test('is not done without sets', async () => {
    const workout = await createWorkout(post);

    expect(await doneState(workout.id)).toEqual({ detail: false, listed: { done: false, doneSetCount: 0 } });
  });

  test('is done once every set is, and not done again when one is unchecked', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const first = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });
    const second = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });

    await markDone(patch, first.id);
    expect(await doneState(workout.id)).toEqual({ detail: false, listed: { done: false, doneSetCount: 1 } });

    await markDone(patch, second.id);
    expect(await doneState(workout.id)).toEqual({ detail: true, listed: { done: true, doneSetCount: 2 } });

    expect((await patch(`/api/sets/${first.id}`, { done: false })).status).toBe(200);
    expect(await doneState(workout.id)).toEqual({ detail: false, listed: { done: false, doneSetCount: 1 } });
  });
});

describe('move exercise', () => {
  async function threeExercises(): Promise<{ workoutId: WorkoutId; ids: number[] }> {
    const workout = await createWorkout(post);
    const ids: number[] = [];
    for (const name of ['Bench Press', 'Barbell Row', 'Back Squat']) {
      const exercise = await createExercise(post, name);
      ids.push(exercise.id);
      await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });
    }
    return { workoutId: workout.id, ids };
  }

  function move(workoutId: WorkoutId, exerciseId: number, direction: unknown): Promise<Response> {
    return post(`/api/workouts/${workoutId}/exercises/${exerciseId}/move`, { direction });
  }

  async function order(res: Response): Promise<number[]> {
    return (await body<WorkoutWithExercisesDto>(res)).exercises.map((group) => group.exerciseId);
  }

  test('moves an exercise up and down, and answers with the workout in its new order', async () => {
    const { workoutId, ids } = await threeExercises();
    const [a, b, c] = [at(ids, 0), at(ids, 1), at(ids, 2)];

    const up = await move(workoutId, c, 'up');
    expect(up.status).toBe(200);
    const afterUp = await body<WorkoutWithExercisesDto>(up);
    expect(afterUp.exercises.map((group) => group.exerciseId)).toEqual([a, c, b]);
    expect(afterUp.exercises.map((group) => group.position)).toEqual([1, 2, 3]);
    expect(afterUp.exercises.every((group) => group.sets.every((set) => set.exerciseId === group.exerciseId))).toBe(true);

    const afterDown = await body<WorkoutWithExercisesDto>(await move(workoutId, a, 'down'));
    expect(afterDown.exercises.map((group) => group.exerciseId)).toEqual([c, a, b]);
    expect(afterDown.exercises.map((group) => group.position)).toEqual([1, 2, 3]);
  });

  test('moving the first exercise up or the last down leaves the order unchanged', async () => {
    const { workoutId, ids } = await threeExercises();

    const first = await move(workoutId, at(ids, 0), 'up');
    expect(first.status).toBe(200);
    expect(await order(first)).toEqual(ids);

    const last = await move(workoutId, at(ids, 2), 'down');
    expect(last.status).toBe(200);
    expect(await order(last)).toEqual(ids);
  });

  test('moves an exercise whose sets are done', async () => {
    const { workoutId, ids } = await threeExercises();
    const detail = await body<WorkoutWithExercisesDto>(await api(`/api/workouts/${workoutId}`));
    for (const set of detail.exercises.flatMap((group) => group.sets)) {
      await markDone(patch, set.id);
    }

    expect(await order(await move(workoutId, at(ids, 0), 'down'))).toEqual([at(ids, 1), at(ids, 0), at(ids, 2)]);
  });

  test('an unknown workout or an exercise not in it is a 404, and a non-numeric id a 400', async () => {
    const { workoutId, ids } = await threeExercises();
    const other = await createExercise(post, 'Deadlift');

    expect((await move(999999, at(ids, 0), 'up')).status).toBe(404);
    expect((await move(workoutId, other.id, 'up')).status).toBe(404);
    expect((await post(`/api/workouts/abc/exercises/${at(ids, 0)}/move`, { direction: 'up' })).status).toBe(400);
    expect((await post(`/api/workouts/${workoutId}/exercises/abc/move`, { direction: 'up' })).status).toBe(400);
  });

  test('a missing or invalid direction is a 400', async () => {
    const { workoutId, ids } = await threeExercises();
    expect((await post(`/api/workouts/${workoutId}/exercises/${at(ids, 1)}/move`, {})).status).toBe(400);
    expect((await move(workoutId, at(ids, 1), 'sideways')).status).toBe(400);
    expect((await move(workoutId, at(ids, 1), 1)).status).toBe(400);
  });

  test('the workout keeps the moved order, also once another set is logged', async () => {
    const { workoutId, ids } = await threeExercises();
    await move(workoutId, at(ids, 2), 'up');
    await createSet(post, workoutId, { exerciseId: at(ids, 1), reps: 5, weight: 60 });

    expect(await order(await api(`/api/workouts/${workoutId}`))).toEqual([at(ids, 0), at(ids, 2), at(ids, 1)]);
  });
});
