import { DEFAULT_DB_PATH, openDatabase } from '../backend/db/db.ts';
import { createExerciseFacade } from '../backend/features/exercises/exercises.facade.ts';
import { createStatsFacade } from '../backend/features/stats/stats.facade.ts';
import { createWorkoutFacades } from '../backend/features/workouts/workouts.facade.ts';
import type { ExerciseId, Iso8601Date } from '../shared/flavors.ts';
import type { MuscleGroup } from '../shared/muscle-group.ts';

const EXERCISES = [
  { name: 'Back Squat', muscleGroup: 'Legs', notes: 'Low bar, belt above 100 kg.', bodyweight: false },
  { name: 'Bench Press', muscleGroup: 'Chest', notes: null, bodyweight: false },
  { name: 'Deadlift', muscleGroup: 'Back', notes: 'Conventional stance.', bodyweight: false },
  { name: 'Overhead Press', muscleGroup: 'Shoulders', notes: null, bodyweight: false },
  { name: 'Barbell Row', muscleGroup: 'Back', notes: null, bodyweight: false },
  { name: 'Pull-up', muscleGroup: 'Back', notes: 'Bodyweight plus belt.', bodyweight: false },
  { name: 'Dips', muscleGroup: 'Chest', notes: 'Lean forward.', bodyweight: true },
] satisfies readonly { name: string; muscleGroup: MuscleGroup; notes: string | null; bodyweight: boolean }[];

const TEMPLATES = [
  {
    title: 'Push day',
    lifts: [
      { name: 'Bench Press', start: 60, step: 2.5, reps: [8, 8, 6] },
      { name: 'Overhead Press', start: 35, step: 1.25, reps: [10, 8, 8] },
      // Bodyweight: the reps grow by `repStep` a week instead of the weight.
      { name: 'Dips', start: 0, step: 0, reps: [12, 10, 8], repStep: 1 },
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
  const exercises = createExerciseFacade(db);
  const { workouts, sets } = createWorkoutFacades(db);
  const stats = createStatsFacade(db);

  if (workouts.count() > 0) {
    console.log('Database already contains workouts — nothing seeded.');
    db.close();
    return;
  }

  db.transaction(() => {
    const idByName = new Map<string, ExerciseId>();
    const bodyweight = new Set(EXERCISES.filter((exercise) => exercise.bodyweight).map((exercise) => exercise.name));
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
          const weeksIn = weeks - 1 - week;
          const weight = lift.start + weeksIn * lift.step;

          lift.reps.forEach((reps, setIndex) => {
            const logged = sets.create(workout.id, {
              exerciseId,
              reps: reps + weeksIn * (lift.repStep ?? 0),
              ...(bodyweight.has(lift.name) ? {} : { weight }),
              notes: SET_NOTES[(created + setIndex) % SET_NOTES.length] ?? null,
            });
            if (daysAgo > 0) {
              sets.update(logged.id, { done: true });
            }
          });
        }
        if (daysAgo > 0) {
          workouts.update(workout.id, { done: true });
        }
        created++;
      });
    }
  })();

  const summary = stats.summary(isoDaysAgo(30));
  console.log(`Seeded ${summary.workout_count} workouts, ${summary.set_count} sets across ${summary.exercise_count} exercises.`);
  db.close();
}

main();
