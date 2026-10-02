import { describe, expect, test } from 'bun:test';
import type { LiftSetDto } from '../../../shared/dto/set.ts';
import type { WorkoutWithSetsDto } from '../../../shared/dto/workout.ts';
import { at, body, useServer } from '../../testing.ts';
import { createExercise } from '../exercises/exercises.fixtures.ts';
import { createSet, createWorkout, markDone } from './workouts.fixtures.ts';

const { api, post, patch } = useServer();

describe('sets', () => {
  test('updates and deletes a set', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const set = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });

    const updated = await body<LiftSetDto>(await patch(`/api/sets/${set.id}`, { reps: 6, weight: 62.5 }));
    expect(updated).toMatchObject({ reps: 6, weight: 62.5 });

    expect((await api(`/api/sets/${set.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await api(`/api/workouts/${workout.id}`)).status).toBe(200);
    expect((await body<WorkoutWithSetsDto>(await api(`/api/workouts/${workout.id}`))).sets).toHaveLength(0);
  });

  test('rejects a patch naming an exercise that does not exist', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const set = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });

    expect((await patch(`/api/sets/${set.id}`, { exerciseId: 4242 })).status).toBe(400);
  });

  test('starts a set not done and toggles it both ways', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const set = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });
    expect(set.done).toBe(false);

    expect(await body<LiftSetDto>(await patch(`/api/sets/${set.id}`, { done: true }))).toMatchObject({ done: true });
    expect(await body<LiftSetDto>(await patch(`/api/sets/${set.id}`, { done: false }))).toMatchObject({ done: false });
  });

  test('rejects a done state that is not a boolean', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const set = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });

    expect((await patch(`/api/sets/${set.id}`, { done: 'yes' })).status).toBe(400);
  });

  test('refuses to change a done set, even alongside unchecking it', async () => {
    const exercise = await createExercise(post);
    const other = await createExercise(post, 'Back Squat');
    const workout = await createWorkout(post);
    const set = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60, notes: 'Easy' });
    const done = await markDone(patch, set.id);

    for (const change of [{ reps: 6 }, { weight: 62.5 }, { exerciseId: other.id }, { notes: 'Hard' }, { done: false, reps: 6 }]) {
      expect((await patch(`/api/sets/${set.id}`, change)).status).toBe(409);
    }
    expect((await body<WorkoutWithSetsDto>(await api(`/api/workouts/${workout.id}`))).sets).toEqual([done]);
  });

  test('changes a set again once it is unchecked', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const set = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });
    await markDone(patch, set.id);

    expect((await patch(`/api/sets/${set.id}`, { done: false })).status).toBe(200);
    expect((await patch(`/api/sets/${set.id}`, { reps: 6 })).status).toBe(200);
  });

  test('changes a set not done and marks it done in one patch', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const set = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });

    const res = await patch(`/api/sets/${set.id}`, { done: true, reps: 6 });
    expect(res.status).toBe(200);
    expect(await body<LiftSetDto>(res)).toMatchObject({ done: true, reps: 6 });
  });

  test('refuses to delete a done set but deletes one not done', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const done = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });
    const open = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });
    await markDone(patch, done.id);

    expect((await api(`/api/sets/${done.id}`, { method: 'DELETE' })).status).toBe(409);
    expect((await api(`/api/sets/${open.id}`, { method: 'DELETE' })).status).toBe(204);
  });

  test('deleting a workout still removes its done sets', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const set = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });
    await markDone(patch, set.id);

    expect((await api(`/api/workouts/${workout.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await api(`/api/sets/${set.id}`)).status).toBe(404);
  });

  test('ignores a position in a patch, on a set not done and on a done one', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const open = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });
    const done = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });
    await markDone(patch, done.id);

    for (const set of [open, done]) {
      const res = await patch(`/api/sets/${set.id}`, { position: 9 });
      expect(res.status).toBe(200);
      expect((await body<LiftSetDto>(res)).position).toBe(set.position);
    }
  });

  test('validates the body before looking up the set', async () => {
    expect((await patch('/api/sets/999999', { reps: 0 })).status).toBe(400);
  });
});

describe('move', () => {
  async function threeSets(): Promise<{ workoutId: number; ids: number[] }> {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const ids: number[] = [];
    for (const reps of [5, 6, 7]) {
      ids.push((await createSet(post, workout.id, { exerciseId: exercise.id, reps, weight: 60 })).id);
    }
    return { workoutId: workout.id, ids };
  }

  function move(id: number, direction: unknown): Promise<Response> {
    return post(`/api/sets/${id}/move`, { direction });
  }

  async function order(res: Response): Promise<number[]> {
    return (await body<LiftSetDto[]>(res)).map((set) => set.id);
  }

  test('moves a set up and down, and answers with the new order', async () => {
    const { ids } = await threeSets();
    const [a, b, c] = [at(ids, 0), at(ids, 1), at(ids, 2)];

    const up = await move(c, 'up');
    expect(up.status).toBe(200);
    const afterUp = await body<LiftSetDto[]>(up);
    expect(afterUp.map((set) => set.id)).toEqual([a, c, b]);
    expect(afterUp.map((set) => set.position)).toEqual([1, 2, 3]);

    const afterDown = await body<LiftSetDto[]>(await move(a, 'down'));
    expect(afterDown.map((set) => set.id)).toEqual([c, a, b]);
    expect(afterDown.map((set) => set.position)).toEqual([1, 2, 3]);
  });

  test('moving the first set up or the last set down leaves the order unchanged', async () => {
    const { ids } = await threeSets();

    const first = await move(at(ids, 0), 'up');
    expect(first.status).toBe(200);
    expect(await order(first)).toEqual(ids);

    const last = await move(at(ids, 2), 'down');
    expect(last.status).toBe(200);
    expect(await order(last)).toEqual(ids);
  });

  test('moves a done set, and a set past a done neighbor', async () => {
    const { ids } = await threeSets();
    const [a, b, c] = [at(ids, 0), at(ids, 1), at(ids, 2)];
    await markDone(patch, a);
    await markDone(patch, b);

    expect(await order(await move(a, 'down'))).toEqual([b, a, c]);
    expect(await order(await move(c, 'up'))).toEqual([b, c, a]);
  });

  test('an unknown set is a 404 and a non-numeric id a 400', async () => {
    expect((await move(999999, 'up')).status).toBe(404);
    expect((await post('/api/sets/abc/move', { direction: 'up' })).status).toBe(400);
  });

  test('a missing or invalid direction is a 400', async () => {
    const { ids } = await threeSets();
    expect((await post(`/api/sets/${at(ids, 1)}/move`, {})).status).toBe(400);
    expect((await move(at(ids, 1), 'sideways')).status).toBe(400);
    expect((await move(at(ids, 1), 1)).status).toBe(400);
  });

  test('the workout lists its sets in the moved order afterwards', async () => {
    const { workoutId, ids } = await threeSets();
    await move(at(ids, 2), 'up');

    const detail = await body<WorkoutWithSetsDto>(await api(`/api/workouts/${workoutId}`));
    expect(detail.sets.map((set) => set.id)).toEqual([at(ids, 0), at(ids, 2), at(ids, 1)]);
  });
});
