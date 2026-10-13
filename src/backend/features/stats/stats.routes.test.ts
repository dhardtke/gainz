import { describe, expect, test } from 'bun:test';
import type { ErrorDto } from '../../../shared/dto/error.ts';
import type { CalendarMonthDto, CalendarWorkoutDto, RecentExerciseDto, RecentExercisesDto, SummaryDto } from '../../../shared/dto/stats.ts';
import type { ExerciseId, Iso8601Date, WorkoutId } from '../../../shared/flavors.ts';
import { body, useServer } from '../../testing.ts';
import { today } from '../../shared/validate.ts';
import { createExercise } from '../exercises/exercises.fixtures.ts';
import { createSet, createWorkout, markDone } from '../workouts/workouts.fixtures.ts';

const { api, post, patch } = useServer();

// One done set per entry, each `[exerciseId, reps, weight]`.
async function session(date: Iso8601Date, sets: [ExerciseId, number, number][]): Promise<WorkoutId> {
  const workout = await createWorkout(post, date);
  for (const [exerciseId, reps, weight] of sets) {
    await markDone(patch, (await createSet(post, workout.id, { exerciseId, reps, weight })).id);
  }
  return workout.id;
}

describe('stats', () => {
  test('summarizes the whole log', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    await markDone(patch, (await createSet(post, workout.id, { exerciseId: exercise.id, reps: 10, weight: 40 })).id);

    const summary = await body<SummaryDto>(await api('/api/stats/summary'));
    expect(summary).toMatchObject({
      workoutCount: 1,
      setCount: 1,
      totalReps: 10,
      totalVolume: 400,
      exerciseCount: 1,
      lastPerformedOn: '2026-01-05',
    });
  });

  test('leaves sets not done out of the set-based numbers, but counts their workout', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post, today());
    await markDone(patch, (await createSet(post, workout.id, { exerciseId: exercise.id, reps: 10, weight: 40 })).id);
    await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 100 });

    const summary = await body<SummaryDto>(await api('/api/stats/summary'));
    expect(summary).toMatchObject({
      workoutCount: 1,
      setCount: 1,
      totalReps: 10,
      totalVolume: 400,
      workoutsLast30Days: 1,
      volumeLast30Days: 400,
    });
  });
});

describe('stats calendar', () => {
  async function calendar(month: string): Promise<CalendarMonthDto> {
    const res = await api(`/api/stats/calendar?month=${month}`);
    expect(res.status).toBe(200);
    return body<CalendarMonthDto>(res);
  }

  function workoutIn(month: CalendarMonthDto, id: WorkoutId): CalendarWorkoutDto | undefined {
    return month.days.flatMap((day) => day.workouts).find((workout) => workout.id === id);
  }

  test("lists the month's workout days oldest first, their workouts by date and id", async () => {
    const exercise = await createExercise(post);
    const last = await session('2026-10-31', [[exercise.id, 5, 60]]);
    const first = await session('2026-10-01', [[exercise.id, 5, 60]]);
    const sameDayA = await session('2026-10-09', [[exercise.id, 5, 60]]);
    const sameDayB = await session('2026-10-09', [[exercise.id, 5, 60]]);

    const month = await calendar('2026-10');
    expect(month.month).toBe('2026-10');
    expect(month.days.map((day) => [day.date, day.workouts.map((workout) => workout.id)])).toEqual([
      ['2026-10-01', [first]],
      ['2026-10-09', [sameDayA, sameDayB]],
      ['2026-10-31', [last]],
    ]);
    expect(month.days[0]?.workouts[0]?.title).toBe('Push day');
  });

  test('leaves out workouts without done sets and those of the months around it', async () => {
    const exercise = await createExercise(post);
    await session('2026-09-30', [[exercise.id, 5, 60]]);
    await session('2026-11-01', [[exercise.id, 5, 60]]);
    const undone = await createWorkout(post, '2026-10-15');
    await createSet(post, undone.id, { exerciseId: exercise.id, reps: 5, weight: 60 });
    await createWorkout(post, '2026-10-16');

    expect((await calendar('2026-10')).days).toEqual([]);
  });

  test.each(['', '?month=', '?month=2026-13', '?month=2026-1', '?month=abc'])('answers %p with 400', async (query) => {
    const res = await api(`/api/stats/calendar${query}`);
    expect(res.status).toBe(400);
    expect((await body<ErrorDto>(res)).error).toBe('"month" must be a month as YYYY-MM');
  });

  test("compares an exercise's volume with its previous session", async () => {
    const exercise = await createExercise(post);
    await session('2026-10-01', [[exercise.id, 10, 100]]);
    const id = await session('2026-10-05', [[exercise.id, 10, 110]]);

    const month = await calendar('2026-10');
    expect(month.days[0]).toMatchObject({ progression: null, comparedExerciseCount: 0 });
    expect(workoutIn(month, id)?.progression).toBeCloseTo(0.1);
    expect(month.days[1]?.progression).toBeCloseTo(0.1);
    expect(month.days[1]?.comparedExerciseCount).toBe(1);
  });

  test("averages the exercises' changes", async () => {
    const bench = await createExercise(post, 'Bench Press');
    const squat = await createExercise(post, 'Back Squat');
    await session('2026-10-01', [
      [bench.id, 10, 100],
      [squat.id, 5, 100],
    ]);
    const id = await session('2026-10-05', [
      [bench.id, 10, 110],
      [squat.id, 5, 100],
    ]);

    const workout = workoutIn(await calendar('2026-10'), id);
    expect(workout?.progression).toBeCloseTo(0.05);
    expect(workout?.comparedExerciseCount).toBe(2);
  });

  test('finds the previous session in an earlier month', async () => {
    const exercise = await createExercise(post);
    await session('2026-08-20', [[exercise.id, 10, 100]]);
    const id = await session('2026-10-05', [[exercise.id, 10, 90]]);

    expect(workoutIn(await calendar('2026-10'), id)?.progression).toBeCloseTo(-0.1);
  });

  test('counts skipped sets in neither session', async () => {
    const exercise = await createExercise(post);
    const before = await session('2026-10-01', [[exercise.id, 10, 100]]);
    await createSet(post, before, { exerciseId: exercise.id, reps: 10, weight: 500 });
    const id = await session('2026-10-05', [[exercise.id, 10, 110]]);
    await createSet(post, id, { exerciseId: exercise.id, reps: 10, weight: 500 });

    expect(workoutIn(await calendar('2026-10'), id)?.progression).toBeCloseTo(0.1);
  });

  test('compares reps for a bodyweight exercise', async () => {
    const pullUp = await createExercise(post, 'Pull-up', { bodyweight: true });
    await session('2026-10-01', [[pullUp.id, 30, 0]]);
    const id = await session('2026-10-05', [[pullUp.id, 36, 0]]);

    const workout = workoutIn(await calendar('2026-10'), id);
    expect(workout?.comparedExerciseCount).toBe(1);
    expect(workout?.progression).toBeCloseTo(0.2);
  });

  test.each([
    [0, 60],
    [60, 0],
  ])('does not compare a weighted exercise at %p kg then %p kg', async (before, after) => {
    const dip = await createExercise(post, 'Dip');
    await session('2026-10-01', [[dip.id, 10, before]]);
    const id = await session('2026-10-05', [[dip.id, 10, after]]);

    expect(workoutIn(await calendar('2026-10'), id)).toMatchObject({ progression: null, comparedExerciseCount: 0 });
  });

  test('does not compare an exercise turned weighted on its first loaded session', async () => {
    const dip = await createExercise(post, 'Dip', { bodyweight: true });
    await session('2026-10-01', [[dip.id, 10, 0]]);
    expect((await patch(`/api/exercises/${dip.id}`, { bodyweight: false })).status).toBe(200);
    const loaded = await session('2026-10-05', [[dip.id, 10, 10]]);
    const next = await session('2026-10-09', [[dip.id, 10, 11]]);

    const month = await calendar('2026-10');
    expect(workoutIn(month, loaded)).toMatchObject({ progression: null, comparedExerciseCount: 0 });
    expect(workoutIn(month, next)?.progression).toBeCloseTo(0.1);
  });

  test('gives each workout of a day its own value and the day the mean over all their exercises', async () => {
    const bench = await createExercise(post, 'Bench Press');
    const squat = await createExercise(post, 'Back Squat');
    const curl = await createExercise(post, 'Curl');
    await session('2026-10-01', [
      [bench.id, 10, 100],
      [squat.id, 10, 100],
      [curl.id, 10, 10],
    ]);
    const push = await session('2026-10-05', [
      [bench.id, 10, 130],
      [squat.id, 10, 130],
    ]);
    const arms = await session('2026-10-05', [[curl.id, 10, 10]]);

    const month = await calendar('2026-10');
    expect(workoutIn(month, push)?.progression).toBeCloseTo(0.3);
    expect(workoutIn(month, arms)?.progression).toBeCloseTo(0);
    expect(month.days[1]?.progression).toBeCloseTo(0.2);
    expect(month.days[1]?.comparedExerciseCount).toBe(3);
  });

  test('orders two sessions on the same date by id', async () => {
    const exercise = await createExercise(post);
    const earlier = await session('2026-10-05', [[exercise.id, 10, 100]]);
    const later = await session('2026-10-05', [[exercise.id, 10, 120]]);

    const month = await calendar('2026-10');
    expect(workoutIn(month, earlier)?.progression).toBeNull();
    expect(workoutIn(month, later)?.progression).toBeCloseTo(0.2);
  });
});

describe('stats recent exercises', () => {
  async function recent(since: string): Promise<RecentExercisesDto> {
    const res = await api(`/api/stats/exercises?since=${since}`);
    expect(res.status).toBe(200);
    return body<RecentExercisesDto>(res);
  }

  async function only(since: string): Promise<RecentExerciseDto> {
    const { exercises } = await recent(since);
    const [exercise] = exercises;
    if (exercises.length !== 1 || !exercise) {
      throw new Error(`expected one exercise, got ${exercises.length}`);
    }
    return exercise;
  }

  test('lists an exercise with a session on since and leaves out one whose last session is the day before', async () => {
    const bench = await createExercise(post, 'Bench Press');
    const squat = await createExercise(post, 'Back Squat');
    await session('2026-10-01', [[bench.id, 10, 100]]);
    await session('2026-09-30', [[squat.id, 10, 100]]);

    const answer = await recent('2026-10-01');
    expect(answer.since).toBe('2026-10-01');
    expect(answer.exercises.map((exercise) => exercise.id)).toEqual([bench.id]);
  });

  test('shows the three newest sessions oldest first, even when two of them lie before since', async () => {
    const exercise = await createExercise(post);
    await session('2026-08-01', [[exercise.id, 10, 100]]);
    await session('2026-08-10', [[exercise.id, 10, 100]]);
    const third = await session('2026-08-20', [[exercise.id, 10, 100]]);
    const fourth = await session('2026-09-01', [[exercise.id, 10, 100]]);
    const fifth = await session('2026-10-05', [[exercise.id, 10, 100]]);

    expect((await only('2026-10-01')).sessions.map((entry) => [entry.workoutId, entry.performedOn])).toEqual([
      [third, '2026-08-20'],
      [fourth, '2026-09-01'],
      [fifth, '2026-10-05'],
    ]);
  });

  test('compares each session with the one before it, the oldest shown with an unshown one', async () => {
    const exercise = await createExercise(post);
    await session('2026-09-01', [[exercise.id, 10, 100]]);
    await session('2026-09-08', [[exercise.id, 10, 110]]);
    await session('2026-09-15', [[exercise.id, 10, 99]]);
    await session('2026-10-05', [[exercise.id, 10, 99]]);

    const [oldest, middle, newest] = (await only('2026-10-01')).sessions;
    expect(oldest?.progression).toBeCloseTo(0.1);
    expect(middle?.progression).toBeCloseTo(-0.1);
    expect(newest?.progression).toBeCloseTo(0);
  });

  test('gives the very first session nothing to compare', async () => {
    const exercise = await createExercise(post);
    await session('2026-10-01', [[exercise.id, 10, 100]]);
    await session('2026-10-05', [[exercise.id, 10, 100]]);

    expect((await only('2026-10-01')).sessions[0]?.progression).toBeNull();
  });

  test('gives the exercise its newest shown session against the oldest', async () => {
    const exercise = await createExercise(post);
    await session('2026-09-22', [[exercise.id, 10, 240]]);
    await session('2026-09-29', [[exercise.id, 10, 245]]);
    await session('2026-10-06', [[exercise.id, 12, 216]]);

    const answer = await only('2026-10-01');
    expect(answer.sessions.map((entry) => entry.volume)).toEqual([2400, 2450, 2592]);
    expect(answer.progression).toBeCloseTo(0.08);
    expect(answer.progressionSince).toBe('2026-09-22');
  });

  test('gives an exercise with one session no overall value', async () => {
    const exercise = await createExercise(post);
    await session('2026-10-05', [[exercise.id, 10, 100]]);

    const answer = await only('2026-10-01');
    expect(answer.sessions).toHaveLength(1);
    expect(answer.progression).toBeNull();
  });

  test('compares reps for a bodyweight exercise', async () => {
    const pullUp = await createExercise(post, 'Pull-up', { bodyweight: true });
    await session('2026-10-01', [[pullUp.id, 30, 0]]);
    await session('2026-10-05', [[pullUp.id, 36, 0]]);

    const answer = await only('2026-10-01');
    expect(answer.bodyweight).toBe(true);
    expect(answer.sessions[1]?.reps).toBe(36);
    expect(answer.sessions[1]?.progression).toBeCloseTo(0.2);
    expect(answer.progression).toBeCloseTo(0.2);
  });

  test('does not compare a weighted exercise beside a session without load', async () => {
    const dip = await createExercise(post, 'Dip');
    await session('2026-10-01', [[dip.id, 10, 0]]);
    await session('2026-10-05', [[dip.id, 10, 20]]);

    const answer = await only('2026-10-01');
    expect(answer.bodyweight).toBe(false);
    expect(answer.sessions[1]?.progression).toBeNull();
    expect(answer.progression).toBeNull();
    expect(answer.progressionSince).toBeNull();
  });

  test('gives the exercise its newest session against the oldest shown one with load', async () => {
    const dip = await createExercise(post, 'Dip');
    await session('2026-10-01', [[dip.id, 10, 0]]);
    await session('2026-10-05', [[dip.id, 10, 20]]);
    await session('2026-10-09', [[dip.id, 10, 25]]);

    const answer = await only('2026-10-01');
    expect(answer.progression).toBeCloseTo(0.25);
    expect(answer.progressionSince).toBe('2026-10-05');
  });

  test('counts sets not done in no session', async () => {
    const exercise = await createExercise(post);
    const skipped = await createWorkout(post, '2026-10-03');
    await createSet(post, skipped.id, { exerciseId: exercise.id, reps: 10, weight: 500 });
    const before = await session('2026-10-01', [[exercise.id, 10, 100]]);
    await createSet(post, before, { exerciseId: exercise.id, reps: 10, weight: 500 });
    await session('2026-10-05', [[exercise.id, 10, 110]]);

    const answer = await only('2026-10-01');
    expect(answer.sessions.map((entry) => entry.volume)).toEqual([1000, 1100]);
    expect(answer.progression).toBeCloseTo(0.1);
  });

  test('orders the biggest regression first, no value last, equal values by name ignoring case', async () => {
    const plans: [string, number[]][] = [
      ['Rising', [100, 120]],
      ['falling', [100, 80]],
      ['Steady b', [100, 100]],
      ['steady A', [100, 100]],
      ['Single', [100]],
    ];
    for (const [name, weights] of plans) {
      const exercise = await createExercise(post, name);
      for (const [index, weight] of weights.entries()) {
        await session(`2026-10-0${index + 1}`, [[exercise.id, 10, weight]]);
      }
    }

    expect((await recent('2026-10-01')).exercises.map((exercise) => exercise.name)).toEqual(['falling', 'steady A', 'Steady b', 'Rising', 'Single']);
  });

  test.each(['', '?since=', '?since=2026-1-05', '?since=2026-13-01', '?since=abc'])('answers %p with 400', async (query) => {
    const res = await api(`/api/stats/exercises${query}`);
    expect(res.status).toBe(400);
    expect((await body<ErrorDto>(res)).error).toBe('"since" must be a date in YYYY-MM-DD format');
  });
});
