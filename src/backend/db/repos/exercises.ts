import type { DB } from '../db.ts';
import { conflict, notFound } from '../../http/http.ts';
import type { LiftSet } from './sets.ts';
import { buildUpdate, EST_1RM_SQL, EXERCISE_COLUMNS, isUniqueViolation, SET_COLUMNS } from './sql.ts';

export interface Exercise {
  id: number;
  name: string;
  muscle_group: string | null;
  notes: string | null;
  created_at: string;
}

export interface ExerciseWithStats extends Exercise {
  set_count: number;
  workout_count: number;
  last_performed_on: string | null;
  best_weight: number | null;
}

export interface SessionPoint {
  workout_id: number;
  performed_on: string;
  set_count: number;
  total_reps: number;
  total_volume: number;
  top_weight: number;
  est_one_rep_max: number;
}

export interface ExerciseInput {
  name: string;
  muscle_group: string | null;
  notes: string | null;
}

const FIELDS = ['name', 'muscle_group', 'notes'] as const;

export class ExerciseRepo {
  constructor(private readonly db: DB) {}

  list(): ExerciseWithStats[] {
    return this.db
      .query<ExerciseWithStats, []>(
        `SELECT ${EXERCISE_COLUMNS},
                COUNT(s.id)                  AS set_count,
                COUNT(DISTINCT s.workout_id) AS workout_count,
                MAX(w.performed_on)          AS last_performed_on,
                MAX(s.weight)                AS best_weight
           FROM exercises e
           LEFT JOIN sets s     ON s.exercise_id = e.id
           LEFT JOIN workouts w ON w.id = s.workout_id
          GROUP BY e.id
          ORDER BY e.name COLLATE NOCASE ASC`,
      )
      .all();
  }

  get(id: number): Exercise | null {
    return this.db.query<Exercise, [number]>(`SELECT ${EXERCISE_COLUMNS} FROM exercises e WHERE e.id = ?`).get(id);
  }

  require(id: number): Exercise {
    const exercise = this.get(id);
    if (!exercise) {
      throw notFound('Exercise');
    }
    return exercise;
  }

  create(input: ExerciseInput): Exercise {
    try {
      const row = this.db
        .query<Exercise, [string, string | null, string | null]>(
          `INSERT INTO exercises (name, muscle_group, notes) VALUES (?, ?, ?)
           RETURNING id, name, muscle_group, notes, created_at`,
        )
        .get(input.name, input.muscle_group, input.notes);
      if (!row) {
        throw new Error('Insert of exercise returned no row');
      }
      return row;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw conflict(`An exercise named "${input.name}" already exists`);
      }
      throw err;
    }
  }

  update(id: number, patch: Partial<ExerciseInput>): Exercise {
    this.require(id);

    const update = buildUpdate('exercises', FIELDS, patch);
    if (update) {
      try {
        this.db.query(update.sql).run(...update.values, id);
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw conflict(`An exercise named "${patch.name}" already exists`);
        }
        throw err;
      }
    }
    return this.require(id);
  }

  delete(id: number): void {
    this.require(id);
    const used = this.db.query<{ n: number }, [number]>('SELECT COUNT(*) AS n FROM sets WHERE exercise_id = ?').get(id);
    if (used && used.n > 0) {
      throw conflict(`Exercise is used by ${used.n} logged set(s); delete those sets first to keep your history intact`);
    }
    this.db.query('DELETE FROM exercises WHERE id = ?').run(id);
  }

  /** Per-session aggregates for one exercise, oldest first — the progress curve. */
  progress(id: number): SessionPoint[] {
    return this.db
      .query<SessionPoint, [number]>(
        `SELECT w.id                   AS workout_id,
                w.performed_on         AS performed_on,
                COUNT(s.id)            AS set_count,
                SUM(s.reps)            AS total_reps,
                SUM(s.reps * s.weight) AS total_volume,
                MAX(s.weight)          AS top_weight,
                MAX(${EST_1RM_SQL})    AS est_one_rep_max
           FROM sets s
           JOIN workouts w ON w.id = s.workout_id
          WHERE s.exercise_id = ?
          GROUP BY w.id
          ORDER BY w.performed_on ASC, w.id ASC`,
      )
      .all(id);
  }

  /** The single best set ever recorded for an exercise, by estimated 1RM. */
  bestSet(id: number): (LiftSet & { performed_on: string }) | null {
    return this.db
      .query<LiftSet & { performed_on: string }, [number]>(
        `SELECT ${SET_COLUMNS}, w.performed_on
           FROM sets s
           JOIN exercises e ON e.id = s.exercise_id
           JOIN workouts w  ON w.id = s.workout_id
          WHERE s.exercise_id = ?
          ORDER BY ${EST_1RM_SQL} DESC, s.weight DESC, s.reps DESC
          LIMIT 1`,
      )
      .get(id);
  }
}
