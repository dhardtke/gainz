import { describe, expect, test } from 'bun:test';
import type { ExerciseWithStats } from '../../db/repos';
import type { ErrorBody, Progress, WorkoutDetail } from '../../testing.ts';
import { at, body, useServer } from '../../testing.ts';

const { api, post, patch, createExercise, createWorkout } = useServer();

describe('exercises', () => {
  test('creates and lists exercises', async () => {
    const created = await createExercise('Back Squat');
    expect(created).toMatchObject({ name: 'Back Squat' });

    const list = await body<ExerciseWithStats[]>(await api('/api/exercises'));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Back Squat', set_count: 0, workout_count: 0 });
  });

  test('rejects a blank name', async () => {
    const res = await post('/api/exercises', { name: '   ' });
    expect(res.status).toBe(400);
    expect((await body<ErrorBody>(res)).error).toContain('name');
  });

  test('rejects a duplicate name regardless of case', async () => {
    await createExercise('Deadlift');
    const res = await post('/api/exercises', { name: 'deadlift' });
    expect(res.status).toBe(409);
  });

  test('updates only the supplied fields', async () => {
    const exercise = await createExercise();
    const res = await patch(`/api/exercises/${exercise.id}`, { muscle_group: 'Chest' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: 'Bench Press', muscle_group: 'Chest' });
  });

  test('returns 404 for a missing exercise', async () => {
    expect((await api('/api/exercises/9999')).status).toBe(404);
  });

  test('refuses to delete an exercise that has logged sets', async () => {
    const exercise = await createExercise();
    const workout = await createWorkout();
    await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 5, weight: 60 });

    const res = await api(`/api/exercises/${exercise.id}`, { method: 'DELETE' });
    expect(res.status).toBe(409);
  });

  test('deletes an unused exercise', async () => {
    const exercise = await createExercise();
    expect((await api(`/api/exercises/${exercise.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await api(`/api/exercises/${exercise.id}`)).status).toBe(404);
  });
});

describe('progress', () => {
  test('aggregates one line per session and reports the best set', async () => {
    const exercise = await createExercise();

    for (const [date, weight] of [
      ['2026-01-05', 60],
      ['2026-01-12', 65],
    ] as const) {
      const workout = await body<WorkoutDetail>(await post('/api/workouts', { performed_on: date }));
      await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 5, weight });
      await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 5, weight: weight - 5 });
    }

    const progress = await body<Progress>(await api(`/api/exercises/${exercise.id}/progress`));
    expect(progress.exercise).toMatchObject({ name: 'Bench Press' });
    expect(progress.sessions).toHaveLength(2);
    expect(progress.sessions[0]).toMatchObject({ performed_on: '2026-01-05', set_count: 2, top_weight: 60 });
    expect(at(progress.sessions, 1).top_weight).toBe(65);
    // Epley: 65 * (1 + 5/30) ~= 75.83
    expect(progress.best_set?.weight).toBe(65);
    expect(at(progress.sessions, 1).est_one_rep_max).toBeCloseTo(75.83, 1);
  });
});
