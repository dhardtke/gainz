import { describe, expect, test } from 'bun:test';
import type { ErrorDto } from '../../../shared/dto/error.ts';
import type { ExerciseDto, ExercisePageDto, ExercisePositionDto, ExerciseProgressDto } from '../../../shared/dto/exercise.ts';
import type { LiftSetDto } from '../../../shared/dto/set.ts';
import { at, body, useServer } from '../../testing.ts';
import { createExercise } from './exercises.fixtures.ts';
import { createSet, createWorkout, markDone } from '../workouts/workouts.fixtures.ts';

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

  test('takes each of the seven muscle groups', async () => {
    const groups = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Full body'] as const;
    for (const [i, muscleGroup] of groups.entries()) {
      const res = await post('/api/exercises', { name: `Lift ${i}`, muscleGroup });
      expect(res.status).toBe(201);
      expect((await body<ExerciseDto>(res)).muscleGroup).toBe(muscleGroup);
    }
  });

  test.each(['Quads', 'legs'])('rejects the muscle group %s', async (muscleGroup) => {
    const res = await post('/api/exercises', { name: 'Leg Extension', muscleGroup });
    expect(res.status).toBe(400);
    expect((await body<ErrorDto>(res)).error).toBe('"muscleGroup" must be one of: Chest, Back, Shoulders, Arms, Legs, Core, Full body');
  });

  test('changes and clears the muscle group', async () => {
    const exercise = await createExercise(post);
    expect(await body<ExerciseDto>(await patch(`/api/exercises/${exercise.id}`, { muscleGroup: 'Arms' }))).toMatchObject({ muscleGroup: 'Arms' });
    expect(await body<ExerciseDto>(await patch(`/api/exercises/${exercise.id}`, { muscleGroup: null }))).toMatchObject({ muscleGroup: null });
    expect((await patch(`/api/exercises/${exercise.id}`, { muscleGroup: 'Quads' })).status).toBe(400);
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

describe('filtering by muscle group', () => {
  // Answers each seeded exercise's id by name.
  async function seed(): Promise<(name: string) => number> {
    const ids = new Map<string, number>();
    for (const [name, muscleGroup] of [
      ['Leg Press', 'Legs'],
      ['Back Squat', 'Legs'],
      ['Bench Press', 'Chest'],
      ['Burpee', 'Full body'],
      ['Plank', null],
      ['Farmer Walk', null],
    ] as const) {
      const res = await post('/api/exercises', { name, muscleGroup });
      expect(res.status).toBe(201);
      ids.set(name, (await body<ExerciseDto>(res)).id);
    }
    return (name) => ids.get(name) ?? 0;
  }

  const names = (page: ExercisePageDto): string[] => page.items.map((exercise) => exercise.name);

  test('lists only the exercises in the group, counting them and every exercise', async () => {
    await seed();
    const page = await body<ExercisePageDto>(await api('/api/exercises?muscleGroup=Legs'));
    expect(names(page)).toEqual(['Back Squat', 'Leg Press']);
    expect(page).toMatchObject({ total: 2, all: 6 });
  });

  test('lists only the exercises without a group for none', async () => {
    await seed();
    const page = await body<ExercisePageDto>(await api('/api/exercises?muscleGroup=none'));
    expect(names(page)).toEqual(['Farmer Walk', 'Plank']);
    expect(page).toMatchObject({ total: 2, all: 6 });
  });

  test('decodes a group with a space', async () => {
    await seed();
    expect(names(await body<ExercisePageDto>(await api('/api/exercises?muscleGroup=Full+body')))).toEqual(['Burpee']);
  });

  test('pages within the filter', async () => {
    await seed();
    const second = await body<ExercisePageDto>(await api('/api/exercises?muscleGroup=Legs&limit=1&offset=1'));
    expect(names(second)).toEqual(['Leg Press']);
    expect(second).toMatchObject({ total: 2, all: 6, limit: 1, offset: 1 });
  });

  test.each(['', 'muscleGroup='])('counts every exercise in both totals without a filter (%s)', async (query) => {
    await seed();
    const page = await body<ExercisePageDto>(await api(`/api/exercises?${query}`));
    expect(page.items).toHaveLength(6);
    expect(page).toMatchObject({ total: 6, all: 6 });
  });

  test.each(['Quads', 'legs'])('rejects %s', async (muscleGroup) => {
    const res = await api(`/api/exercises?muscleGroup=${muscleGroup}`);
    expect(res.status).toBe(400);
    expect((await body<ErrorDto>(res)).error).toBe('"muscleGroup" must be one of: Chest, Back, Shoulders, Arms, Legs, Core, Full body, none');
  });

  test('positions an exercise among those in its group', async () => {
    const id = await seed();
    const indexOf = async (name: string, query: string): Promise<number> =>
      (await body<ExercisePositionDto>(await api(`/api/exercises/${id(name)}/position${query}`))).index;

    expect(await indexOf('Leg Press', '')).toBe(4);
    expect(await indexOf('Leg Press', '?muscleGroup=Legs')).toBe(1);
    expect(await indexOf('Plank', '?muscleGroup=none')).toBe(1);
    expect(await indexOf('Farmer Walk', '?muscleGroup=none')).toBe(0);
    expect((await api(`/api/exercises/${id('Plank')}/position?muscleGroup=Quads`)).status).toBe(400);
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
      const top = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight });
      const backOff = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: weight - 5 });
      topSets.push(await markDone(patch, top.id));
      await markDone(patch, backOff.id);
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
      done: true,
      createdAt: at(topSets, 1).createdAt,
      performedOn: '2026-01-12',
    });
    expect(at(progress.sessions, 1).estOneRepMax).toBeCloseTo(75.83, 1);
  });
});

describe('sets not done', () => {
  test('are left out of the list, the progress and the best set', async () => {
    const exercise = await createExercise(post);
    const done = await createWorkout(post, '2026-01-05');
    const planned = await createWorkout(post, '2026-01-12');
    await markDone(patch, (await createSet(post, done.id, { exerciseId: exercise.id, reps: 5, weight: 60 })).id);
    await createSet(post, planned.id, { exerciseId: exercise.id, reps: 5, weight: 100 });

    const page = await body<ExercisePageDto>(await api('/api/exercises'));
    expect(page.items.find((item) => item.id === exercise.id)).toMatchObject({
      setCount: 1,
      workoutCount: 1,
      lastPerformedOn: '2026-01-05',
      bestWeight: 60,
    });

    const progress = await body<ExerciseProgressDto>(await api(`/api/exercises/${exercise.id}/progress`));
    expect(progress.sessions.map((point) => point.workoutId)).toEqual([done.id]);
    expect(progress.bestSet).toMatchObject({ weight: 60, done: true });
  });

  test('still list an exercise only they use, which cannot be deleted', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });

    const page = await body<ExercisePageDto>(await api('/api/exercises'));
    expect(page.items.find((item) => item.id === exercise.id)).toMatchObject({
      setCount: 0,
      workoutCount: 0,
      lastPerformedOn: null,
      bestWeight: null,
    });
    expect((await api(`/api/exercises/${exercise.id}`, { method: 'DELETE' })).status).toBe(409);
  });
});
