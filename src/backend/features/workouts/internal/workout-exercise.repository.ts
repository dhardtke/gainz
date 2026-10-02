import type { DB } from '../../../db/db.ts';
import { notFound } from '../../../http/errors.ts';
import type { ExerciseId, WorkoutId } from '../../../../shared/flavors.ts';
import type { WorkoutExercise } from '../ports/workout-exercise.ts';

/** The repository's own, so it does not import the wire type. */
export type MoveDirection = 'up' | 'down';

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

  /**
   * Swaps the exercise with its neighbor. Every move renumbers the workout's exercises 1..n, so ties
   * and gaps vanish on first touch, and a move at an edge only renumbers. The done lock does not
   * apply: the order a session is listed in is not performed history.
   */
  move(workoutId: WorkoutId, exerciseId: ExerciseId, direction: MoveDirection): void {
    this.#db.transaction(() => {
      const ids = this.#db
        .query<{ exercise_id: ExerciseId }, [WorkoutId]>(
          'SELECT exercise_id FROM workout_exercises WHERE workout_id = ? ORDER BY position ASC, exercise_id ASC',
        )
        .all(workoutId)
        .map((row) => row.exercise_id);
      const from = ids.indexOf(exerciseId);
      if (from === -1) {
        throw notFound('Exercise in this workout');
      }
      const to = direction === 'up' ? from - 1 : from + 1;
      if (to >= 0 && to < ids.length) {
        ids.splice(from, 1);
        ids.splice(to, 0, exerciseId);
      }
      const renumber = this.#db.query<unknown, [number, WorkoutId, ExerciseId]>(
        'UPDATE workout_exercises SET position = ? WHERE workout_id = ? AND exercise_id = ?',
      );
      for (const [index, id] of ids.entries()) {
        renumber.run(index + 1, workoutId, id);
      }
    })();
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
