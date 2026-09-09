/**
 * Fills the database with a few weeks of plausible training history so the
 * progress views have something to draw. Safe to run repeatedly: it does
 * nothing if the database already holds workouts.
 */
import { DEFAULT_DB_PATH, openDatabase } from "./db";
import { Repo } from "./repo";

const EXERCISES = [
  { name: "Back Squat", muscle_group: "Legs", notes: "Low bar, belt above 100 kg." },
  { name: "Bench Press", muscle_group: "Chest", notes: null },
  { name: "Deadlift", muscle_group: "Back", notes: "Conventional stance." },
  { name: "Overhead Press", muscle_group: "Shoulders", notes: null },
  { name: "Barbell Row", muscle_group: "Back", notes: null },
  { name: "Pull-up", muscle_group: "Back", notes: "Bodyweight plus belt." },
];

/** Day templates: exercise name, starting weight, weekly increment, reps. */
const TEMPLATES = [
  {
    title: "Push day",
    lifts: [
      { name: "Bench Press", start: 60, step: 2.5, reps: [8, 8, 6] },
      { name: "Overhead Press", start: 35, step: 1.25, reps: [10, 8, 8] },
    ],
  },
  {
    title: "Pull day",
    lifts: [
      { name: "Deadlift", start: 100, step: 5, reps: [5, 5, 5] },
      { name: "Barbell Row", start: 50, step: 2.5, reps: [10, 10, 8] },
      { name: "Pull-up", start: 0, step: 2.5, reps: [8, 6, 5] },
    ],
  },
  {
    title: "Leg day",
    lifts: [{ name: "Back Squat", start: 80, step: 5, reps: [8, 6, 6, 5] }],
  },
];

const SET_NOTES = [null, null, null, "Felt strong.", "Last rep grindy.", "Left shoulder tight."];

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function main() {
  const db = openDatabase(DEFAULT_DB_PATH);
  const repo = new Repo(db);

  if (repo.countWorkouts() > 0) {
    console.log("Database already contains workouts — nothing seeded.");
    db.close();
    return;
  }

  const idByName = new Map<string, number>();
  for (const exercise of EXERCISES) {
    idByName.set(exercise.name, repo.createExercise(exercise).id);
  }

  const weeks = 6;
  let created = 0;

  for (let week = weeks - 1; week >= 0; week--) {
    TEMPLATES.forEach((template, dayIndex) => {
      const daysAgo = week * 7 - dayIndex * 2;
      if (daysAgo < 0) return;

      const workout = repo.createWorkout({
        performed_on: isoDaysAgo(daysAgo),
        title: template.title,
        notes: week === weeks - 1 ? "First session of the block." : null,
      });

      for (const lift of template.lifts) {
        const exerciseId = idByName.get(lift.name);
        if (exerciseId === undefined) continue;
        const weight = lift.start + (weeks - 1 - week) * lift.step;

        lift.reps.forEach((reps, setIndex) => {
          repo.createSet(workout.id, {
            exercise_id: exerciseId,
            reps,
            weight,
            notes: SET_NOTES[(created + setIndex) % SET_NOTES.length] ?? null,
          });
        });
      }
      created++;
    });
  }

  const summary = repo.summary();
  console.log(
    `Seeded ${summary.workout_count} workouts, ${summary.set_count} sets across ${summary.exercise_count} exercises.`,
  );
  db.close();
}

main();
