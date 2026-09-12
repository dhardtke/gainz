import { describe, expect, test } from 'bun:test';
import type { ErrorDto, ExerciseProgressDto, ExerciseWithStatsDto, WorkoutWithSetsDto } from '../../../shared/dto';
import { at, body, useServer } from '../../testing.ts';
import { createExercise } from './exercises.fixtures.ts';
import { createWorkout } from '../workouts/workouts.fixtures.ts';

const { api, post, patch } = useServer();

describe('exercises', () => {
  test('creates and lists exercises', async () => {
    const created = await createExercise(post, 'Back Squat');
    expect(created).toMatchObject({ name: 'Back Squat' });

    const list = await body<ExerciseWithStatsDto[]>(await api('/api/exercises'));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Back Squat', setCount: 0, workoutCount: 0 });
  });

  test('rejects a blank name', async () => {
    const res = await post('/api/exercises', { name: '   ' });
    expect(res.status).toBe(400);
    expect((await body<ErrorDto>(res)).error).toContain('name');
  });

  test('rejects a duplicate name regardless of case', async () => {
    await createExercise(post, 'Deadlift');
    const res = await post('/api/exercises', { name: 'deadlift' });
    expect(res.status).toBe(409);
  });

  test('updates only the supplied fields', async () => {
    const exercise = await createExercise(post);
    const res = await patch(`/api/exercises/${exercise.id}`, { muscleGroup: 'Chest' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: 'Bench Press', muscleGroup: 'Chest' });
  });

  test('returns 404 for a missing exercise', async () => {
    expect((await api('/api/exercises/9999')).status).toBe(404);
  });

  test('refuses to delete an exercise that has logged sets', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    await post(`/api/workouts/${workout.id}/sets`, { exerciseId: exercise.id, reps: 5, weight: 60 });

    const res = await api(`/api/exercises/${exercise.id}`, { method: 'DELETE' });
    expect(res.status).toBe(409);
  });

  test('deletes an unused exercise', async () => {
    const exercise = await createExercise(post);
    expect((await api(`/api/exercises/${exercise.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await api(`/api/exercises/${exercise.id}`)).status).toBe(404);
  });
});

describe('progress', () => {
  test('aggregates one line per session and reports the best set', async () => {
    const exercise = await createExercise(post);

    for (const [date, weight] of [
      ['2026-01-05', 60],
      ['2026-01-12', 65],
    ] as const) {
      const workout = await body<WorkoutWithSetsDto>(await post('/api/workouts', { performedOn: date }));
      await post(`/api/workouts/${workout.id}/sets`, { exerciseId: exercise.id, reps: 5, weight });
      await post(`/api/workouts/${workout.id}/sets`, { exerciseId: exercise.id, reps: 5, weight: weight - 5 });
    }

    const progress = await body<ExerciseProgressDto>(await api(`/api/exercises/${exercise.id}/progress`));
    expect(progress.exercise).toMatchObject({ name: 'Bench Press' });
    expect(progress.sessions).toHaveLength(2);
    expect(progress.sessions[0]).toMatchObject({ performedOn: '2026-01-05', setCount: 2, topWeight: 60 });
    expect(at(progress.sessions, 1).topWeight).toBe(65);
    // Epley: 65 * (1 + 5/30) ~= 75.83
    expect(progress.bestSet?.weight).toBe(65);
    expect(at(progress.sessions, 1).estOneRepMax).toBeCloseTo(75.83, 1);
  });
});
