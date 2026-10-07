import type { DB } from '../../../db/db.ts';
import { notFound } from '../../../http/errors.ts';
import { buildUpdate } from '../../../db/sql.ts';
import type { Iso8601Date, WorkoutId } from '../../../../shared/flavors.ts';
import type { Workout, WorkoutWithStats } from '../ports/workout.ts';

export interface CreateWorkout {
  performed_on: Iso8601Date;
  title: string | null;
  notes: string | null;
}

export type EditWorkout = Partial<CreateWorkout>;

const FIELDS = ['performed_on', 'title', 'notes'] as const;

export class WorkoutRepository {
  readonly #db: DB;

  constructor(db: DB) {
    this.#db = db;
  }

  list(limit: number, offset: number): WorkoutWithStats[] {
    return this.#db
      .query<WorkoutWithStats, [number, number]>(
        `SELECT w.id, w.performed_on, w.title, w.notes, w.created_at,
                COUNT(s.id)                         AS set_count,
                COUNT(DISTINCT s.exercise_id)       AS exercise_count,
                COALESCE(SUM(s.reps), 0)            AS total_reps,
                COALESCE(SUM(s.reps * s.weight), 0) AS total_volume,
                COALESCE(SUM(s.done), 0)            AS done_set_count
           FROM workouts w
           LEFT JOIN sets s ON s.workout_id = w.id
          GROUP BY w.id
          ORDER BY w.performed_on DESC, w.id DESC
          LIMIT ? OFFSET ?`,
      )
      .all(limit, offset);
  }

  count(): number {
    return this.#db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM workouts').get()?.n ?? 0;
  }

  get(id: WorkoutId): Workout | null {
    return this.#db.query<Workout, [WorkoutId]>('SELECT id, performed_on, title, notes, created_at FROM workouts WHERE id = ?').get(id);
  }

  require(id: WorkoutId): Workout {
    const workout = this.get(id);
    if (!workout) {
      throw notFound('Workout');
    }
    return workout;
  }

  /** Insert and copy share a transaction, so a bad `copyFrom` leaves no empty workout. */
  create(input: CreateWorkout, options: { copyFrom?: WorkoutId } = {}): Workout {
    return this.#db.transaction(() => {
      const { copyFrom } = options;
      if (copyFrom !== undefined) {
        this.require(copyFrom);
      }

      const row = this.#db
        .query<Workout, [Iso8601Date, string | null, string | null]>(
          `INSERT INTO workouts (performed_on, title, notes) VALUES (?, ?, ?)
           RETURNING id, performed_on, title, notes, created_at`,
        )
        .get(input.performed_on, input.title, input.notes);
      if (!row) {
        throw new Error('Insert of workout returned no row');
      }

      if (copyFrom !== undefined) {
        this.#db
          .query<unknown, [WorkoutId, WorkoutId]>(
            `INSERT INTO sets (workout_id, exercise_id, reps, weight, notes, position)
             SELECT ?, exercise_id, reps, weight, notes, position
               FROM sets WHERE workout_id = ?`,
          )
          .run(row.id, copyFrom);
        this.#db
          .query<unknown, [WorkoutId, WorkoutId]>(
            `INSERT INTO workout_exercises (workout_id, exercise_id, position)
             SELECT ?, exercise_id, position
               FROM workout_exercises WHERE workout_id = ?`,
          )
          .run(row.id, copyFrom);
      }

      return row;
    })();
  }

  update(id: WorkoutId, patch: EditWorkout): Workout {
    this.require(id);

    const update = buildUpdate('workouts', FIELDS, patch);
    if (update) {
      this.#db.query(update.sql).run(...update.values, id);
    }
    return this.require(id);
  }

  delete(id: WorkoutId): void {
    this.require(id);
    this.#db.query('DELETE FROM workouts WHERE id = ?').run(id);
  }
}
