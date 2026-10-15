import { describe, expect, test } from 'bun:test';
import type { ErrorDto } from '../../../shared/dto/error.ts';
import type { ExerciseDto, ExerciseLastSessionDto, ExercisePageDto, ExercisePositionDto, ExerciseProgressDto } from '../../../shared/dto/exercise.ts';
import type { LiftSetDto } from '../../../shared/dto/set.ts';
import type { Iso8601Date } from '../../../shared/flavors.ts';
import { at, body, useServer } from '../../testing.ts';
import { createExercise } from './exercises.fixtures.ts';
import { putWeighIn } from '../weight/weight.fixtures.ts';
import { createSet, createWorkout, markDone } from '../workouts/workouts.fixtures.ts';

const { api, post, patch, put } = useServer();

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

  test('creates a weighted exercise unless told its kind', async () => {
    expect((await createExercise(post, 'Back Squat')).kind).toBe('weighted');
    expect((await createExercise(post, 'Dips', { kind: 'bodyweight' })).kind).toBe('bodyweight');
    expect((await createExercise(post, 'Assisted Pull-up', { kind: 'assisted' })).kind).toBe('assisted');
  });

  test.each(['heavy', '', null])('rejects the kind %p', async (kind) => {
    const res = await post('/api/exercises', { name: 'Dips', kind });
    expect(res.status).toBe(400);
    expect((await body<ErrorDto>(res)).error).toBe('"kind" must be one of: weighted, bodyweight, assisted');
    const exercise = await createExercise(post);
    expect((await patch(`/api/exercises/${exercise.id}`, { kind })).status).toBe(400);
  });

  test('changes the kind in every direction whatever its history', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });

    for (const kind of ['bodyweight', 'assisted', 'weighted', 'assisted', 'bodyweight', 'weighted'] as const) {
      const res = await patch(`/api/exercises/${exercise.id}`, { kind });
      expect(res.status).toBe(200);
      expect((await body<ExerciseDto>(res)).kind).toBe(kind);
    }
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

describe('filtering by type', () => {
  // Answers each seeded exercise's id by name.
  async function seed(): Promise<(name: string) => number> {
    const ids = new Map<string, number>();
    for (const [name, muscleGroup, kind] of [
      ['Dips', 'Chest', 'bodyweight'],
      ['Bench Press', 'Chest', 'weighted'],
      ['Pull-up', 'Back', 'bodyweight'],
      ['Barbell Row', 'Back', 'weighted'],
      ['Plank', null, 'bodyweight'],
      ['Assisted Dip', 'Chest', 'assisted'],
    ] as const) {
      ids.set(name, (await createExercise(post, name, { muscleGroup, kind })).id);
    }
    return (name) => ids.get(name) ?? 0;
  }

  const names = async (query: string): Promise<string[]> =>
    (await body<ExercisePageDto>(await api(`/api/exercises?${query}`))).items.map((exercise) => exercise.name);

  test('lists only the exercises of one kind, counting them and every exercise', async () => {
    await seed();
    const page = await body<ExercisePageDto>(await api('/api/exercises?type=bodyweight'));
    expect(page.items.map((exercise) => exercise.name)).toEqual(['Dips', 'Plank', 'Pull-up']);
    expect(page).toMatchObject({ total: 3, all: 6 });
    expect(await names('type=weighted')).toEqual(['Barbell Row', 'Bench Press']);
    expect(await names('type=assisted')).toEqual(['Assisted Dip']);
  });

  test('combines with the muscle group filter', async () => {
    await seed();
    expect(await names('type=bodyweight&muscleGroup=Chest')).toEqual(['Dips']);
    expect(await names('type=assisted&muscleGroup=Chest')).toEqual(['Assisted Dip']);
    expect(await names('type=weighted&muscleGroup=Back')).toEqual(['Barbell Row']);
    expect(await names('type=bodyweight&muscleGroup=none')).toEqual(['Plank']);
    expect(await names('type=weighted&muscleGroup=none')).toEqual([]);
  });

  test('positions an exercise within both filters', async () => {
    const id = await seed();
    const indexOf = async (name: string, query: string): Promise<number> =>
      (await body<ExercisePositionDto>(await api(`/api/exercises/${id(name)}/position?${query}`))).index;

    expect(await indexOf('Pull-up', 'type=bodyweight')).toBe(2);
    expect(await indexOf('Pull-up', 'type=bodyweight&muscleGroup=Back')).toBe(0);
  });

  test.each(['Bodyweight', 'true', 'other'])('rejects the type %s', async (type) => {
    const res = await api(`/api/exercises?type=${type}`);
    expect(res.status).toBe(400);
    expect((await body<ErrorDto>(res)).error).toBe('"type" must be one of: weighted, bodyweight, assisted');
    expect((await api(`/api/exercises/1/position?type=${type}`)).status).toBe(400);
  });
});

describe('searching by name', () => {
  // Answers each seeded exercise's id by name.
  async function seed(): Promise<(name: string) => number> {
    const ids = new Map<string, number>();
    for (const [name, muscleGroup, kind] of [
      ['Back Squat', 'Legs', 'weighted'],
      ['Front Squat', 'Legs', 'weighted'],
      ['Goblet Squat', 'Legs', 'bodyweight'],
      ['Bench Press', 'Chest', 'weighted'],
      ['100% Effort', null, 'bodyweight'],
      ['Row_Wide', 'Back', 'weighted'],
      ['Push\\Pull', null, 'weighted'],
    ] as const) {
      ids.set(name, (await createExercise(post, name, { muscleGroup, kind })).id);
    }
    return (name) => ids.get(name) ?? 0;
  }

  const names = async (query: string): Promise<string[]> =>
    (await body<ExercisePageDto>(await api(`/api/exercises?${query}`))).items.map((exercise) => exercise.name);

  test('lists the names containing the text in any case, counting them and every exercise', async () => {
    await seed();
    const page = await body<ExercisePageDto>(await api('/api/exercises?search=SQUAT'));
    expect(page.items.map((exercise) => exercise.name)).toEqual(['Back Squat', 'Front Squat', 'Goblet Squat']);
    expect(page).toMatchObject({ total: 3, all: 7 });
  });

  test('combines with the muscle group and type filters', async () => {
    await seed();
    expect(await names('search=squat&muscleGroup=Legs&type=weighted')).toEqual(['Back Squat', 'Front Squat']);
    expect(await names('search=squat&type=bodyweight')).toEqual(['Goblet Squat']);
    expect(await names('search=squat&muscleGroup=Chest')).toEqual([]);
  });

  test('pages within the search', async () => {
    await seed();
    const second = await body<ExercisePageDto>(await api('/api/exercises?search=squat&limit=1&offset=1'));
    expect(second.items.map((exercise) => exercise.name)).toEqual(['Front Squat']);
    expect(second).toMatchObject({ total: 3, all: 7, limit: 1, offset: 1 });
  });

  test.each([
    ['%25', '100% Effort'],
    ['_', 'Row_Wide'],
    ['%5C', 'Push\\Pull'],
  ])('matches %s literally', async (search, name) => {
    await seed();
    expect(await names(`search=${search}`)).toEqual([name]);
  });

  test('trims, and treats an empty or blank search as none', async () => {
    await seed();
    expect(await names('search=%20front%20')).toEqual(['Front Squat']);
    expect(await names('search=')).toHaveLength(7);
    expect(await names('search=%20%20')).toHaveLength(7);
  });

  test('rejects a search over 120 characters', async () => {
    const res = await api(`/api/exercises?search=${'a'.repeat(121)}`);
    expect(res.status).toBe(400);
    expect((await body<ErrorDto>(res)).error).toBe('"search" must be at most 120 characters');
    expect((await api(`/api/exercises/1/position?search=${'a'.repeat(121)}`)).status).toBe(400);
  });

  test('positions an exercise within the search', async () => {
    const id = await seed();
    const indexOf = async (name: string, query: string): Promise<number> =>
      (await body<ExercisePositionDto>(await api(`/api/exercises/${id(name)}/position?${query}`))).index;

    expect(await indexOf('Goblet Squat', '')).toBe(4);
    expect(await indexOf('Goblet Squat', 'search=squat')).toBe(2);
    expect(await indexOf('Goblet Squat', 'search=squat&type=bodyweight')).toBe(0);
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
    await createSet(post, planned.id, { exerciseId: exercise.id, reps: 8, weight: 100 });
    await createSet(post, done.id, { exerciseId: exercise.id, reps: 9, weight: 50 });

    const page = await body<ExercisePageDto>(await api('/api/exercises'));
    expect(page.items.find((item) => item.id === exercise.id)).toMatchObject({
      setCount: 1,
      workoutCount: 1,
      lastPerformedOn: '2026-01-05',
      bestWeight: 60,
      bestReps: 5,
      leastWeight: 60,
    });

    const progress = await body<ExerciseProgressDto>(await api(`/api/exercises/${exercise.id}/progress`));
    expect(progress.sessions.map((point) => point.workoutId)).toEqual([done.id]);
    expect(progress.sessions[0]?.topReps).toBe(5);
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
      bestReps: null,
      leastWeight: null,
    });
    expect((await api(`/api/exercises/${exercise.id}`, { method: 'DELETE' })).status).toBe(409);
  });
});

describe('last session', () => {
  const lastSession = async (exerciseId: number, query = ''): Promise<ExerciseLastSessionDto> =>
    body<ExerciseLastSessionDto>(await api(`/api/exercises/${exerciseId}/last-session${query}`));

  async function logDone(workoutId: number, exerciseId: number, reps: number, weight: number, notes: string | null = null): Promise<LiftSetDto> {
    return markDone(patch, (await createSet(post, workoutId, { exerciseId, reps, weight, notes })).id);
  }

  test("answers the latest session's done sets in logged order, ignoring skipped ones", async () => {
    const exercise = await createExercise(post);
    const older = await createWorkout(post, '2026-01-05');
    await logDone(older.id, exercise.id, 8, 50);
    const latest = await createWorkout(post, '2026-01-12');
    await logDone(latest.id, exercise.id, 5, 100, 'easy');
    await createSet(post, latest.id, { exerciseId: exercise.id, reps: 5, weight: 102.5 });
    await logDone(latest.id, exercise.id, 3, 105);

    const { session } = await lastSession(exercise.id);
    expect(session).toMatchObject({ workoutId: latest.id, performedOn: '2026-01-12' });
    expect(session?.sets.map(({ reps, weight, notes, done }) => ({ reps, weight, notes, done }))).toEqual([
      { reps: 5, weight: 100, notes: 'easy', done: true },
      { reps: 3, weight: 105, notes: null, done: true },
    ]);
  });

  test('picks the higher id between two sessions on the same date', async () => {
    const exercise = await createExercise(post);
    const first = await createWorkout(post, '2026-01-05');
    await logDone(first.id, exercise.id, 5, 60);
    const second = await createWorkout(post, '2026-01-05');
    await logDone(second.id, exercise.id, 5, 70);

    expect((await lastSession(exercise.id)).session?.workoutId).toBe(second.id);
  });

  test('skips the excepted workout and falls back to the one before', async () => {
    const exercise = await createExercise(post);
    const older = await createWorkout(post, '2026-01-05');
    await logDone(older.id, exercise.id, 5, 60);
    const current = await createWorkout(post, '2026-01-12');
    await logDone(current.id, exercise.id, 5, 70);

    expect((await lastSession(exercise.id, `?exceptWorkout=${current.id}`)).session?.workoutId).toBe(older.id);
    expect((await lastSession(exercise.id, `?exceptWorkout=${older.id}`)).session?.workoutId).toBe(current.id);
  });

  test('accepts an excepted workout id above 1000', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    await logDone(workout.id, exercise.id, 5, 60);

    const res = await api(`/api/exercises/${exercise.id}/last-session?exceptWorkout=123456`);
    expect(res.status).toBe(200);
    expect((await body<ExerciseLastSessionDto>(res)).session?.workoutId).toBe(workout.id);
  });

  test('is null without done sets', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });

    expect(await lastSession(exercise.id)).toEqual({ session: null });
  });

  test('is 404 for an unknown exercise and 400 for a malformed excepted workout', async () => {
    const exercise = await createExercise(post);
    expect((await api('/api/exercises/9999/last-session')).status).toBe(404);
    expect((await api(`/api/exercises/${exercise.id}/last-session?exceptWorkout=abc`)).status).toBe(400);
  });
});

describe('progress of an assisted exercise', () => {
  async function logDone(date: Iso8601Date, exerciseId: number, sets: [number, number][]): Promise<void> {
    const workout = await createWorkout(post, date);
    for (const [reps, weight] of sets) {
      await markDone(patch, (await createSet(post, workout.id, { exerciseId, reps, weight })).id);
    }
  }

  test("reads each session's least assistance and effective volume from the weigh-in on or before it", async () => {
    const pullUp = await createExercise(post, 'Assisted Pull-up', { kind: 'assisted' });
    await logDone('2026-10-01', pullUp.id, [
      [8, 30],
      [6, 25],
    ]);
    await putWeighIn(put, '2026-10-02', 80);
    await putWeighIn(put, '2026-10-20', 90);
    await logDone('2026-10-05', pullUp.id, [
      [8, 25],
      [8, 22.5],
    ]);
    const open = await createWorkout(post, '2026-10-05');
    await createSet(post, open.id, { exerciseId: pullUp.id, reps: 8, weight: 5 });

    const progress = await body<ExerciseProgressDto>(await api(`/api/exercises/${pullUp.id}/progress`));
    expect(progress.sessions.map(({ leastWeight, effectiveVolume }) => ({ leastWeight, effectiveVolume }))).toEqual([
      { leastWeight: 25, effectiveVolume: null },
      { leastWeight: 22.5, effectiveVolume: 16 * 80 - (8 * 25 + 8 * 22.5) },
    ]);
  });

  test('has no effective volume for a session with assistance at or above the body weight', async () => {
    const pullUp = await createExercise(post, 'Assisted Pull-up', { kind: 'assisted' });
    await putWeighIn(put, '2026-09-30', 60);
    await logDone('2026-10-01', pullUp.id, [
      [8, 30],
      [5, 60],
    ]);

    const progress = await body<ExerciseProgressDto>(await api(`/api/exercises/${pullUp.id}/progress`));
    expect(progress.sessions[0]?.effectiveVolume).toBeNull();
  });

  test('takes the least assisted set as the best, ties broken by reps', async () => {
    const pullUp = await createExercise(post, 'Assisted Pull-up', { kind: 'assisted' });
    await logDone('2026-10-01', pullUp.id, [
      [10, 30],
      [6, 17.5],
    ]);
    await logDone('2026-10-05', pullUp.id, [
      [8, 17.5],
      [12, 20],
    ]);

    const progress = await body<ExerciseProgressDto>(await api(`/api/exercises/${pullUp.id}/progress`));
    expect(progress.bestSet).toMatchObject({ weight: 17.5, reps: 8, performedOn: '2026-10-05' });
  });
});
