import { DEFAULT_DB_PATH, openDatabase } from '../backend/db/db.ts';
import { createExerciseFacade } from '../backend/features/exercises/exercises.facade.ts';
import { createStatsFacade } from '../backend/features/stats/stats.facade.ts';
import { createWeighInFacade } from '../backend/features/weight/weight.facade.ts';
import { createWorkoutFacades } from '../backend/features/workouts/workouts.facade.ts';
import type { ExerciseId, Iso8601Date } from '../shared/flavors.ts';
import type { ExerciseKind } from '../shared/exercise-kind.ts';
import type { MuscleGroup } from '../shared/muscle-group.ts';

const EXERCISES = [
  { name: 'Back Squat', muscleGroup: 'Legs', notes: 'Low bar, belt above 100 kg.', kind: 'weighted' },
  { name: 'Bench Press', muscleGroup: 'Chest', notes: null, kind: 'weighted' },
  { name: 'Deadlift', muscleGroup: 'Back', notes: 'Conventional stance.', kind: 'weighted' },
  { name: 'Overhead Press', muscleGroup: 'Shoulders', notes: null, kind: 'weighted' },
  { name: 'Barbell Row', muscleGroup: 'Back', notes: null, kind: 'weighted' },
  { name: 'Pull-up', muscleGroup: 'Back', notes: 'Bodyweight plus belt.', kind: 'weighted' },
  { name: 'Dips', muscleGroup: 'Chest', notes: 'Lean forward.', kind: 'bodyweight' },
  { name: 'Assisted Pull-up', muscleGroup: 'Back', notes: 'Knees on the pad.', kind: 'assisted' },
] satisfies readonly { name: string; muscleGroup: MuscleGroup; notes: string | null; kind: ExerciseKind }[];

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
      // Assisted: the assistance drops, from 30 kg to 17.5 kg over the six weeks.
      { name: 'Assisted Pull-up', start: 30, step: -2.5, reps: [8, 8, 6] },
    ],
  },
  {
    title: 'Leg day',
    lifts: [{ name: 'Back Squat', start: 80, step: 5, reps: [8, 6, 6, 5] }],
  },
];

const SET_NOTES = [null, null, null, 'Felt strong.', 'Last rep grindy.', 'Left shoulder tight.'];

const WEIGH_IN_DAYS = 130;

// Drifts from about 84.5 kg to 82 kg with a wobble of up to ±0.6 kg; no Math.random, so screenshots are stable.
function seededWeight(daysAgo: number): number {
  const progress = (WEIGH_IN_DAYS - 1 - daysAgo) / (WEIGH_IN_DAYS - 1);
  const wobble = 0.4 * Math.sin(daysAgo * 1.7) + 0.2 * Math.sin(daysAgo * 0.45);
  return Math.round((84.5 - 2.5 * progress + wobble) * 10) / 10;
}

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
  const weighIns = createWeighInFacade(db);

  if (workouts.count() > 0) {
    console.log('Database already contains workouts — nothing seeded.');
    db.close();
    return;
  }

  db.transaction(() => {
    const idByName = new Map<string, ExerciseId>();
    const bodyweight = new Set(EXERCISES.filter((exercise) => exercise.kind === 'bodyweight').map((exercise) => exercise.name));
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

    // A few skipped days, as a real log has.
    for (let daysAgo = WEIGH_IN_DAYS - 1; daysAgo >= 0; daysAgo--) {
      if (daysAgo % 13 !== 6) {
        weighIns.put(isoDaysAgo(daysAgo), { weight: seededWeight(daysAgo) });
      }
    }
  })();

  const summary = stats.summary(isoDaysAgo(30));
  console.log(
    `Seeded ${summary.workout_count} workouts, ${summary.set_count} sets across ${summary.exercise_count} exercises, and ${weighIns.list(null).length} weigh-ins.`,
  );
  db.close();
}

main();
