import type { DB } from '../../../db/db.ts';
import { conflict, notFound } from '../../../http/errors.ts';
import { buildUpdate, isUniqueViolation } from '../../../db/sql.ts';
import { EST_1RM_SQL, SET_COLUMNS } from '../../workouts/ports/sql.ts';
import type { ExerciseId, Iso8601Date } from '../../../../shared/flavors.ts';
import type { MuscleGroup } from '../../../../shared/muscle-group.ts';
import type { Exercise, ExerciseWithStats, SessionPoint } from '../ports/exercise.ts';
import type { LiftSet } from '../../workouts/ports/set.ts';

export interface CreateExercise {
  name: string;
  muscle_group: MuscleGroup | null;
  notes: string | null;
}

export type EditExercise = Partial<CreateExercise>;

const EXERCISE_COLUMNS = 'e.id, e.name, e.muscle_group, e.notes, e.created_at';
const FIELDS = ['name', 'muscle_group', 'notes'] as const;

// `undefined` is every exercise and `null` those without a group; `IS` compares NULL as equal.
function muscleGroupFilter(muscleGroup: MuscleGroup | null | undefined): { sql: string; params: [MuscleGroup | null] } | null {
  return muscleGroup === undefined ? null : { sql: 'muscle_group IS ?', params: [muscleGroup] };
}

export class ExerciseRepository {
  readonly #db: DB;

  constructor(db: DB) {
    this.#db = db;
  }

  /** Joins done sets in the `ON` clause, so an exercise without any still lists. */
  list(limit: number | null, offset: number, muscleGroup?: MuscleGroup | null): ExerciseWithStats[] {
    const filter = muscleGroupFilter(muscleGroup);
    return (
      this.#db
        .query<ExerciseWithStats, (MuscleGroup | null | number)[]>(
          `SELECT ${EXERCISE_COLUMNS},
                COUNT(s.id)                  AS set_count,
                COUNT(DISTINCT s.workout_id) AS workout_count,
                MAX(w.performed_on)          AS last_performed_on,
                MAX(s.weight)                AS best_weight
           FROM exercises e
           LEFT JOIN sets s     ON s.exercise_id = e.id AND s.done = 1
           LEFT JOIN workouts w ON w.id = s.workout_id
          ${filter ? `WHERE e.${filter.sql}` : ''}
          GROUP BY e.id
          ORDER BY e.name COLLATE NOCASE ASC
          LIMIT ? OFFSET ?`,
        )
        // A negative LIMIT is SQLite's "no limit".
        .all(...(filter?.params ?? []), limit ?? -1, offset)
    );
  }

  count(muscleGroup?: MuscleGroup | null): number {
    const filter = muscleGroupFilter(muscleGroup);
    return (
      this.#db
        .query<{ n: number }, (MuscleGroup | null)[]>(`SELECT COUNT(*) AS n FROM exercises ${filter ? `WHERE ${filter.sql}` : ''}`)
        .get(...(filter?.params ?? []))?.n ?? 0
    );
  }

  /** Names are unique under NOCASE across all exercises, so within a group too: counting those sorting before it is its exact position. */
  index(id: ExerciseId, muscleGroup?: MuscleGroup | null): number {
    const { name } = this.require(id);
    const filter = muscleGroupFilter(muscleGroup);
    return (
      this.#db
        .query<{ n: number }, [string, ...(MuscleGroup | null)[]]>(
          `SELECT COUNT(*) AS n FROM exercises WHERE name < ? COLLATE NOCASE ${filter ? `AND ${filter.sql}` : ''}`,
        )
        .get(name, ...(filter?.params ?? []))?.n ?? 0
    );
  }

  get(id: ExerciseId): Exercise | null {
    return this.#db.query<Exercise, [ExerciseId]>(`SELECT ${EXERCISE_COLUMNS} FROM exercises e WHERE e.id = ?`).get(id);
  }

  require(id: ExerciseId): Exercise {
    const exercise = this.get(id);
    if (!exercise) {
      throw notFound('Exercise');
    }
    return exercise;
  }

  create(input: CreateExercise): Exercise {
    try {
      const row = this.#db
        .query<Exercise, [string, MuscleGroup | null, string | null]>(
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

  update(id: ExerciseId, patch: EditExercise): Exercise {
    this.require(id);

    const update = buildUpdate('exercises', FIELDS, patch);
    if (update) {
      try {
        this.#db.query(update.sql).run(...update.values, id);
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw conflict(`An exercise named "${patch.name}" already exists`);
        }
        throw err;
      }
    }
    return this.require(id);
  }

  delete(id: ExerciseId): void {
    this.require(id);
    const used = this.#db.query<{ n: number }, [ExerciseId]>('SELECT COUNT(*) AS n FROM sets WHERE exercise_id = ?').get(id);
    if (used && used.n > 0) {
      throw conflict(`Exercise is used by ${used.n} set(s); delete those sets first to keep your history intact`);
    }
    this.#db.query('DELETE FROM exercises WHERE id = ?').run(id);
  }

  progress(id: ExerciseId): SessionPoint[] {
    return this.#db
      .query<SessionPoint, [ExerciseId]>(
        `SELECT w.id                   AS workout_id,
                w.performed_on         AS performed_on,
                COUNT(s.id)            AS set_count,
                SUM(s.reps)            AS total_reps,
                SUM(s.reps * s.weight) AS total_volume,
                MAX(s.weight)          AS top_weight,
                MAX(${EST_1RM_SQL})    AS est_one_rep_max
           FROM sets s
           JOIN workouts w ON w.id = s.workout_id
          WHERE s.exercise_id = ? AND s.done = 1
          GROUP BY w.id
          ORDER BY w.performed_on ASC, w.id ASC`,
      )
      .all(id);
  }

  bestSet(id: ExerciseId): (LiftSet & { performed_on: Iso8601Date }) | null {
    return this.#db
      .query<LiftSet & { performed_on: Iso8601Date }, [ExerciseId]>(
        `SELECT ${SET_COLUMNS}, w.performed_on
           FROM sets s
           JOIN exercises e ON e.id = s.exercise_id
           JOIN workouts w  ON w.id = s.workout_id
          WHERE s.exercise_id = ? AND s.done = 1
          ORDER BY ${EST_1RM_SQL} DESC, s.weight DESC, s.reps DESC
          LIMIT 1`,
      )
      .get(id);
  }
}
