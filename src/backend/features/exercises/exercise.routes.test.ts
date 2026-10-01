import { describe, expect, test } from 'bun:test';
import type { ErrorDto } from '../../../shared/dto/error.ts';
import type { ExercisePageDto, ExercisePositionDto, ExerciseProgressDto } from '../../../shared/dto/exercise.ts';
import type { LiftSetDto } from '../../../shared/dto/set.ts';
import { at, body, useServer } from '../../testing.ts';
import { createExercise } from './exercises.fixtures.ts';
import { createSet, createWorkout } from '../workouts/workouts.fixtures.ts';

const { api, post, patch } = useServer();

describe('exercises', () => {
  test('creates and lists exercises', async () => {
    const created = await createExercise(post, 'Back Squat');
    expect(created).toMatchObject({ name: 'Back Squat' });

    const page = await body<ExercisePageDto>(await api('/api/exercises'));
    expect(page).toMatchObject({ total: 1, limit: null, offset: 0 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ name: 'Back Squat', setCount: 0, workoutCount: 0 });
  });

  test('pages by name with limit and offset, counting every exercise', async () => {
    for (const name of ['Deadlift', 'bench Press', 'Arnold Press']) {
      await createExercise(post, name);
    }

    const first = await body<ExercisePageDto>(await api('/api/exercises?limit=2&offset=0'));
    const second = await body<ExercisePageDto>(await api('/api/exercises?limit=2&offset=2'));

    expect(first.items.map((exercise) => exercise.name)).toEqual(['Arnold Press', 'bench Press']);
    expect(first).toMatchObject({ total: 3, limit: 2, offset: 0 });
    expect(second.items.map((exercise) => exercise.name)).toEqual(['Deadlift']);
    expect(second).toMatchObject({ total: 3, limit: 2, offset: 2 });
  });

  test.each(['limit=0', 'limit=201', 'offset=-1'])('rejects %s', async (query) => {
    expect((await api(`/api/exercises?${query}`)).status).toBe(400);
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
    await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });

    const res = await api(`/api/exercises/${exercise.id}`, { method: 'DELETE' });
    expect(res.status).toBe(409);
  });

  test('deletes an unused exercise', async () => {
    const exercise = await createExercise(post);
    expect((await api(`/api/exercises/${exercise.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await api(`/api/exercises/${exercise.id}`)).status).toBe(404);
  });
});

describe('position', () => {
  test('is the 0-based index in the list, ignoring case', async () => {
    const bench = await createExercise(post, 'bench Press');
    const deadlift = await createExercise(post, 'Deadlift');
    const arnold = await createExercise(post, 'Arnold Press');

    const indexOf = async (id: number): Promise<number> => (await body<ExercisePositionDto>(await api(`/api/exercises/${id}/position`))).index;

    expect(await indexOf(bench.id)).toBe(1);
    expect(await indexOf(deadlift.id)).toBe(2);
    expect(await indexOf(arnold.id)).toBe(0);
  });

  test('is 404 for an unknown exercise and 400 for a malformed id', async () => {
    expect((await api('/api/exercises/9999/position')).status).toBe(404);
    expect((await api('/api/exercises/abc/position')).status).toBe(400);
  });
});

describe('progress', () => {
  test('aggregates one line per session and reports the best set', async () => {
    const exercise = await createExercise(post);
    const topSets: LiftSetDto[] = [];

    for (const [date, weight] of [
      ['2026-01-05', 60],
      ['2026-01-12', 65],
    ] as const) {
      const workout = await createWorkout(post, date);
      topSets.push(await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight }));
      await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: weight - 5 });
    }

    const progress = await body<ExerciseProgressDto>(await api(`/api/exercises/${exercise.id}/progress`));
    expect(progress.exercise).toMatchObject({ name: 'Bench Press' });
    expect(progress.sessions).toHaveLength(2);
    expect(progress.sessions[0]).toMatchObject({ performedOn: '2026-01-05', setCount: 2, topWeight: 60 });
    expect(at(progress.sessions, 1).topWeight).toBe(65);
    // Epley: 65 * (1 + 5/30) ~= 75.83
    expect(progress.bestSet).toEqual({
      id: at(topSets, 1).id,
      workoutId: at(topSets, 1).workoutId,
      exerciseId: exercise.id,
      exerciseName: 'Bench Press',
      reps: 5,
      weight: 65,
      notes: null,
      position: 1,
      createdAt: at(topSets, 1).createdAt,
      performedOn: '2026-01-12',
    });
    expect(at(progress.sessions, 1).estOneRepMax).toBeCloseTo(75.83, 1);
  });
});
