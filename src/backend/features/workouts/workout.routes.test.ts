import { describe, expect, test } from 'bun:test';
import type { LiftSetDto } from '../../../shared/dto/set.ts';
import type { WorkoutDto, WorkoutPageDto, WorkoutWithSetsDto } from '../../../shared/dto/workout.ts';
import { at, body, useServer } from '../../testing.ts';
import { createExercise } from '../exercises/exercises.fixtures.ts';
import { createWorkout } from './workouts.fixtures.ts';

const { api, post } = useServer();

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
    const set = await body<LiftSetDto>(await post(`/api/workouts/${workout.id}/sets`, { exerciseId: exercise.id, reps: 5, weight: 60 }));

    expect((await api(`/api/workouts/${workout.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await api(`/api/sets/${set.id}`)).status).toBe(404);
  });

  test('copies sets from a previous workout', async () => {
    const exercise = await createExercise(post);
    const source = await createWorkout(post, '2026-01-05');
    await post(`/api/workouts/${source.id}/sets`, { exerciseId: exercise.id, reps: 5, weight: 60 });
    await post(`/api/workouts/${source.id}/sets`, { exerciseId: exercise.id, reps: 5, weight: 65 });

    const res = await post('/api/workouts', { performedOn: '2026-01-12', copyFromWorkoutId: source.id });
    expect(res.status).toBe(201);
    const copy = await body<WorkoutWithSetsDto>(res);
    expect(copy.sets).toHaveLength(2);
    expect(copy.sets.map((s) => s.weight)).toEqual([60, 65]);
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
    await post(`/api/workouts/${workout.id}/sets`, { exerciseId: exercise.id, reps: 10, weight: 50 });
    await post(`/api/workouts/${workout.id}/sets`, { exerciseId: exercise.id, reps: 5, weight: 60 });

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

    await post(`/api/workouts/${workout.id}/sets`, {
      exerciseId: exercise.id,
      reps: 8,
      weight: 60,
      notes: 'warm-up',
    });
    await post(`/api/workouts/${workout.id}/sets`, { exerciseId: exercise.id, reps: 6, weight: 70 });

    const detail = await body<WorkoutWithSetsDto>(await api(`/api/workouts/${workout.id}`));
    expect(detail.sets).toHaveLength(2);
    expect(detail.sets[0]).toMatchObject({ reps: 8, weight: 60, notes: 'warm-up', exerciseName: 'Bench Press' });
    expect(at(detail.sets, 1).position).toBeGreaterThan(at(detail.sets, 0).position);
  });

  test('rejects non-positive reps, and an exercise that does not exist, with 400', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);

    expect((await post(`/api/workouts/${workout.id}/sets`, { exerciseId: exercise.id, reps: 0, weight: 60 })).status).toBe(400);
    // The foreign key refuses the insert; the workout id in the path is what earns a 404.
    expect((await post(`/api/workouts/${workout.id}/sets`, { exerciseId: 4242, reps: 5, weight: 60 })).status).toBe(400);
  });
});
