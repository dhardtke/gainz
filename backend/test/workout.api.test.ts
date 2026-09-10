import { describe, expect, test } from 'bun:test';
import type { LiftSet, Workout } from '../src/repo';
import type { WorkoutDetail, WorkoutPage } from './helpers/server';
import { body, useServer } from './helpers/server';

const { api, post, createExercise, createWorkout } = useServer();

describe('workouts', () => {
  test('defaults the workout date to today', async () => {
    const res = await post('/api/workouts', {});
    expect(res.status).toBe(201);
    expect((await body<Workout>(res)).performed_on).toBe(new Date().toISOString().slice(0, 10));
  });

  test('rejects an invalid date', async () => {
    const res = await post('/api/workouts', { performed_on: '05.01.2026' });
    expect(res.status).toBe(400);
  });

  test('deleting a workout removes its sets', async () => {
    const exercise = await createExercise();
    const workout = await createWorkout();
    const set = await body<LiftSet>(await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 5, weight: 60 }));

    expect((await api(`/api/workouts/${workout.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await api(`/api/sets/${set.id}`)).status).toBe(404);
  });

  test('copies sets from a previous workout', async () => {
    const exercise = await createExercise();
    const source = await createWorkout('2026-01-05');
    await post(`/api/workouts/${source.id}/sets`, { exercise_id: exercise.id, reps: 5, weight: 60 });
    await post(`/api/workouts/${source.id}/sets`, { exercise_id: exercise.id, reps: 5, weight: 65 });

    const res = await post('/api/workouts', { performed_on: '2026-01-12', copy_from_workout_id: source.id });
    expect(res.status).toBe(201);
    const copy = await body<WorkoutDetail>(res);
    expect(copy.sets).toHaveLength(2);
    expect(copy.sets.map((s) => s.weight)).toEqual([60, 65]);
  });

  test('copying from a missing workout creates nothing', async () => {
    await createWorkout('2026-01-05');
    const before = (await body<WorkoutPage>(await api('/api/workouts'))).total;

    const res = await post('/api/workouts', { performed_on: '2026-01-12', copy_from_workout_id: 9999 });

    expect(res.status).toBe(404);
    expect((await body<WorkoutPage>(await api('/api/workouts'))).total).toBe(before);
  });

  test('rejects a malformed copy_from_workout_id before writing anything', async () => {
    const before = (await body<WorkoutPage>(await api('/api/workouts'))).total;

    const res = await post('/api/workouts', { performed_on: '2026-01-12', copy_from_workout_id: 'nope' });

    expect(res.status).toBe(400);
    expect((await body<WorkoutPage>(await api('/api/workouts'))).total).toBe(before);
  });

  test('lists workouts with roll-up statistics', async () => {
    const exercise = await createExercise();
    const workout = await createWorkout();
    await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 10, weight: 50 });
    await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 5, weight: 60 });

    const page = await body<WorkoutPage>(await api('/api/workouts'));
    expect(page).toMatchObject({ total: 1, limit: 50, offset: 0 });
    expect(page.items[0]).toMatchObject({ set_count: 2, exercise_count: 1, total_reps: 15, total_volume: 800 });
  });

  test('rejects an out-of-range limit', async () => {
    expect((await api('/api/workouts?limit=9999')).status).toBe(400);
  });
});
