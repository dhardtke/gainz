/**
 * Fills the database with a few weeks of plausible training history so the
 * progress views have something to draw. Safe to run repeatedly: it does
 * nothing if the database already holds workouts.
 */
import { DEFAULT_DB_PATH, openDatabase } from '../backend/db/db.ts';
import { createFacades } from '../backend/features/facades.ts';
import type { ExerciseId, Iso8601Date } from '../shared/flavors.ts';

const EXERCISES = [
  { name: 'Back Squat', muscleGroup: 'Legs', notes: 'Low bar, belt above 100 kg.' },
  { name: 'Bench Press', muscleGroup: 'Chest', notes: null },
  { name: 'Deadlift', muscleGroup: 'Back', notes: 'Conventional stance.' },
  { name: 'Overhead Press', muscleGroup: 'Shoulders', notes: null },
  { name: 'Barbell Row', muscleGroup: 'Back', notes: null },
  { name: 'Pull-up', muscleGroup: 'Back', notes: 'Bodyweight plus belt.' },
];

/** Day templates: exercise name, starting weight, weekly increment, reps. */
const TEMPLATES = [
  {
    title: 'Push day',
    lifts: [
      { name: 'Bench Press', start: 60, step: 2.5, reps: [8, 8, 6] },
      { name: 'Overhead Press', start: 35, step: 1.25, reps: [10, 8, 8] },
    ],
  },
  {
    title: 'Pull day',
    lifts: [
      { name: 'Deadlift', start: 100, step: 5, reps: [5, 5, 5] },
      { name: 'Barbell Row', start: 50, step: 2.5, reps: [10, 10, 8] },
      { name: 'Pull-up', start: 0, step: 2.5, reps: [8, 6, 5] },
    ],
  },
  {
    title: 'Leg day',
    lifts: [{ name: 'Back Squat', start: 80, step: 5, reps: [8, 6, 6, 5] }],
  },
];

const SET_NOTES = [null, null, null, 'Felt strong.', 'Last rep grindy.', 'Left shoulder tight.'];

function isoDaysAgo(days: number): Iso8601Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function main(): void {
  const db = openDatabase(DEFAULT_DB_PATH);
  const { exercises, workouts, sets, stats } = createFacades(db);

  if (workouts.count() > 0) {
    console.log('Database already contains workouts — nothing seeded.');
    db.close();
    return;
  }

  // One transaction for the whole run: a seeder that fails half way should leave nothing behind,
  // not a partial block of training history. `workouts.create()` opens a transaction of its own, which
  // nests as a savepoint.
  db.transaction(() => {
    const idByName = new Map<string, ExerciseId>();
    for (const exercise of EXERCISES) {
      idByName.set(exercise.name, exercises.create(exercise).id);
    }

    const weeks = 6;
    let created = 0;

    for (let week = weeks - 1; week >= 0; week--) {
      TEMPLATES.forEach((template, dayIndex) => {
        const daysAgo = week * 7 - dayIndex * 2;
        if (daysAgo < 0) {
          return;
        }

        const workout = workouts.create({
          performedOn: isoDaysAgo(daysAgo),
          title: template.title,
          notes: week === weeks - 1 ? 'First session of the block.' : null,
        });

        for (const lift of template.lifts) {
          const exerciseId = idByName.get(lift.name);
          if (exerciseId === undefined) {
            continue;
          }
          const weight = lift.start + (weeks - 1 - week) * lift.step;

          lift.reps.forEach((reps, setIndex) => {
            sets.create(workout.id, {
              exerciseId,
              reps,
              weight,
              notes: SET_NOTES[(created + setIndex) % SET_NOTES.length] ?? null,
            });
          });
        }
        created++;
      });
    }
  })();

  const summary = stats.summary();
  console.log(`Seeded ${summary.workout_count} workouts, ${summary.set_count} sets across ${summary.exercise_count} exercises.`);
  db.close();
}

main();
