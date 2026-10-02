import type { DB } from '../../../db/db.ts';
import type { ExerciseId, WorkoutId } from '../../../../shared/flavors.ts';
import type { WorkoutExercise } from '../ports/workout-exercise.ts';

/**
 * The order of a workout's exercises. A row exists exactly while the workout has a set of that
 * exercise: `append` and `removeIfUnused` keep it so, and both are called inside `SetRepository`'s
 * transactions, beside the set write they follow.
 */
export class WorkoutExerciseRepository {
  readonly #db: DB;

  constructor(db: DB) {
    this.#db = db;
  }

  list(workoutId: WorkoutId): WorkoutExercise[] {
    return this.#db
      .query<WorkoutExercise, [WorkoutId]>(
        `SELECT we.workout_id, we.exercise_id, e.name AS exercise_name, we.position
           FROM workout_exercises we
           JOIN exercises e ON e.id = we.exercise_id
          WHERE we.workout_id = ?
          ORDER BY we.position ASC, we.exercise_id ASC`,
      )
      .all(workoutId);
  }

  /**
   * Puts the exercise last, unless the workout has it already. The `WHERE` is required: without
   * it, SQLite cannot parse `ON CONFLICT` after `INSERT … SELECT … FROM`.
   */
  append(workoutId: WorkoutId, exerciseId: ExerciseId): void {
    this.#db
      .query<unknown, [WorkoutId, ExerciseId]>(
        `INSERT INTO workout_exercises (workout_id, exercise_id, position)
         SELECT ?1, ?2, COALESCE(MAX(position), 0) + 1 FROM workout_exercises WHERE workout_id = ?1
         ON CONFLICT (workout_id, exercise_id) DO NOTHING`,
      )
      .run(workoutId, exerciseId);
  }

  /** Drops the exercise from the workout once the workout has no set of it left. */
  removeIfUnused(workoutId: WorkoutId, exerciseId: ExerciseId): void {
    this.#db
      .query<unknown, [WorkoutId, ExerciseId]>(
        `DELETE FROM workout_exercises
          WHERE workout_id = ?1 AND exercise_id = ?2
            AND NOT EXISTS (SELECT 1 FROM sets WHERE workout_id = ?1 AND exercise_id = ?2)`,
      )
      .run(workoutId, exerciseId);
  }
}
