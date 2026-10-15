import type { DB } from '../../../db/db.ts';
import { conflict, notFound } from '../../../http/errors.ts';
import { buildUpdate, isUniqueViolation } from '../../../db/sql.ts';
import { bodyWeightOnSql } from '../../weight/ports/sql.ts';
import { EST_1RM_SQL, effectiveVolumeSql, LAST_SESSION_WORKOUT_SQL, SET_COLUMNS } from '../../workouts/ports/sql.ts';
import type { ExerciseKind } from '../../../../shared/exercise-kind.ts';
import type { ExerciseId, Iso8601Date, WorkoutId } from '../../../../shared/flavors.ts';
import type { MuscleGroup } from '../../../../shared/muscle-group.ts';
import type { Exercise, ExerciseFilter, ExerciseWithStats, LastSession, SessionPoint } from '../ports/exercise.ts';
import type { LiftSet } from '../../workouts/ports/set.ts';

export interface CreateExercise {
  name: string;
  muscle_group: MuscleGroup | null;
  notes: string | null;
  kind: ExerciseKind;
}

export type EditExercise = Partial<CreateExercise>;

const EXERCISE_COLUMNS = 'e.id, e.name, e.muscle_group, e.notes, e.kind, e.created_at';
const FIELDS = ['name', 'muscle_group', 'notes', 'kind'] as const;

type FilterParam = MuscleGroup | ExerciseKind | number | null;

// Unqualified columns: neither `sets` nor `workouts` has one of these, so `list()`'s joins leave them unambiguous.
function filterConditions(filter: ExerciseFilter): { conditions: string[]; params: FilterParam[] } {
  const conditions: string[] = [];
  const params: FilterParam[] = [];
  if (filter.muscle_group !== undefined) {
    // `IS` compares NULL as equal.
    conditions.push('muscle_group IS ?');
    params.push(filter.muscle_group);
  }
  if (filter.kind !== undefined) {
    conditions.push('kind = ?');
    params.push(filter.kind);
  }
  return { conditions, params };
}

function where(conditions: string[]): string {
  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}

export class ExerciseRepository {
  readonly #db: DB;

  constructor(db: DB) {
    this.#db = db;
  }

  /** Joins done sets in the `ON` clause, so an exercise without any still lists. */
  list(limit: number | null, offset: number, filter: ExerciseFilter = {}): ExerciseWithStats[] {
    const { conditions, params } = filterConditions(filter);
    return (
      this.#db
        .query<ExerciseWithStats, FilterParam[]>(
          `SELECT ${EXERCISE_COLUMNS},
                COUNT(s.id)                  AS set_count,
                COUNT(DISTINCT s.workout_id) AS workout_count,
                MAX(w.performed_on)          AS last_performed_on,
                MAX(s.weight)                AS best_weight,
                MAX(s.reps)                  AS best_reps,
                MIN(s.weight)                AS least_weight
           FROM exercises e
           LEFT JOIN sets s     ON s.exercise_id = e.id AND s.done = 1
           LEFT JOIN workouts w ON w.id = s.workout_id
          ${where(conditions)}
          GROUP BY e.id
          ORDER BY e.name COLLATE NOCASE ASC
          LIMIT ? OFFSET ?`,
        )
        // A negative LIMIT is SQLite's "no limit".
        .all(...params, limit ?? -1, offset)
    );
  }

  count(filter: ExerciseFilter = {}): number {
    const { conditions, params } = filterConditions(filter);
    return this.#db.query<{ n: number }, FilterParam[]>(`SELECT COUNT(*) AS n FROM exercises ${where(conditions)}`).get(...params)?.n ?? 0;
  }

  /** Names are unique under NOCASE across all exercises, so within a filter too: counting those sorting before it is its exact position. */
  index(id: ExerciseId, filter: ExerciseFilter = {}): number {
    const { name } = this.require(id);
    const { conditions, params } = filterConditions(filter);
    return (
      this.#db
        .query<{ n: number }, [string, ...FilterParam[]]>(`SELECT COUNT(*) AS n FROM exercises ${where(['name < ? COLLATE NOCASE', ...conditions])}`)
        .get(name, ...params)?.n ?? 0
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
        .query<Exercise, [string, MuscleGroup | null, string | null, ExerciseKind]>(
          `INSERT INTO exercises (name, muscle_group, notes, kind) VALUES (?, ?, ?, ?)
           RETURNING id, name, muscle_group, notes, kind, created_at`,
        )
        .get(input.name, input.muscle_group, input.notes, input.kind);
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
        `WITH sessions AS MATERIALIZED (
           SELECT w.id                   AS workout_id,
                  w.performed_on         AS performed_on,
                  COUNT(s.id)            AS set_count,
                  SUM(s.reps)            AS total_reps,
                  SUM(s.reps * s.weight) AS total_volume,
                  MAX(s.weight)          AS top_weight,
                  MAX(s.reps)            AS top_reps,
                  MAX(${EST_1RM_SQL})    AS est_one_rep_max,
                  MIN(s.weight)          AS least_weight,
                  CASE WHEN e.kind = 'assisted' THEN ${bodyWeightOnSql('w.performed_on')} END AS body_weight
             FROM sets s
             JOIN workouts w  ON w.id = s.workout_id
             JOIN exercises e ON e.id = s.exercise_id
            WHERE s.exercise_id = ? AND s.done = 1
            GROUP BY w.id
         )
         SELECT workout_id, performed_on, set_count, total_reps, total_volume, top_weight, top_reps, est_one_rep_max, least_weight,
                ${effectiveVolumeSql('body_weight', 'total_reps', 'total_volume', 'top_weight')} AS effective_volume
           FROM sessions
          ORDER BY performed_on ASC, workout_id ASC`,
      )
      .all(id);
  }

  bestSet(id: ExerciseId, kind: ExerciseKind): (LiftSet & { performed_on: Iso8601Date }) | null {
    // An assisted exercise's best set is its least assisted, ties broken by reps.
    const order = kind === 'assisted' ? 's.weight ASC, s.reps DESC' : `${EST_1RM_SQL} DESC, s.weight DESC, s.reps DESC`;
    return this.#db
      .query<LiftSet & { performed_on: Iso8601Date }, [ExerciseId]>(
        `SELECT ${SET_COLUMNS}, w.performed_on
           FROM sets s
           JOIN exercises e ON e.id = s.exercise_id
           JOIN workouts w  ON w.id = s.workout_id
          WHERE s.exercise_id = ? AND s.done = 1
          ORDER BY ${order}
          LIMIT 1`,
      )
      .get(id);
  }

  lastSession(id: ExerciseId, exceptWorkout: WorkoutId | null): LastSession | null {
    this.require(id);
    const workout = this.#db
      .query<{ id: WorkoutId; performed_on: Iso8601Date }, [ExerciseId, WorkoutId | null]>(LAST_SESSION_WORKOUT_SQL)
      .get(id, exceptWorkout);
    if (!workout) {
      return null;
    }
    const sets = this.#db
      .query<LiftSet, [WorkoutId, ExerciseId]>(
        `SELECT ${SET_COLUMNS}
           FROM sets s
           JOIN exercises e ON e.id = s.exercise_id
          WHERE s.workout_id = ? AND s.exercise_id = ? AND s.done = 1
          ORDER BY s.position, s.id`,
      )
      .all(workout.id, id);
    return { workout_id: workout.id, performed_on: workout.performed_on, sets };
  }
}
