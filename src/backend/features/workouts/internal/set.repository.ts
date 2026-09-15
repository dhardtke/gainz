import type { DB } from '../../../db/db.ts';
import { badRequest, notFound } from '../../../http/errors.ts';
import { buildUpdate, isForeignKeyViolation } from '../../../db/sql.ts';
import type { WorkoutRepository } from './workout.repository.ts';
import type { ExerciseId, LiftSetId, WorkoutId } from '../../../../shared/flavors.ts';
import type { LiftSet } from '../ports/set.ts';
import { SET_COLUMNS } from '../ports/sql.ts';

export interface CreateSet {
  exercise_id: ExerciseId;
  reps: number;
  weight: number;
  notes: string | null;
  position?: number;
}

export type EditSet = Partial<CreateSet>;

const FIELDS = ['exercise_id', 'reps', 'weight', 'notes', 'position'] as const;

export class SetRepository {
  readonly #db: DB;

  readonly #workouts: WorkoutRepository;

  /**
   * `workouts` is injected rather than imported as a value because both repositories live in this
   * feature and either import would be as good as the other; taking it as an argument keeps
   * `createWorkoutFacades` the one place that decides which workout repository a set repository
   * reads.
   */
  constructor(db: DB, workouts: WorkoutRepository) {
    this.#db = db;
    this.#workouts = workouts;
  }

  list(workoutId: WorkoutId): LiftSet[] {
    return this.#db
      .query<LiftSet, [WorkoutId]>(
        `SELECT ${SET_COLUMNS}
           FROM sets s
           JOIN exercises e ON e.id = s.exercise_id
          WHERE s.workout_id = ?
          ORDER BY s.position ASC, s.id ASC`,
      )
      .all(workoutId);
  }

  get(id: LiftSetId): LiftSet | null {
    return this.#db.query<LiftSet, [LiftSetId]>(`SELECT ${SET_COLUMNS} FROM sets s JOIN exercises e ON e.id = s.exercise_id WHERE s.id = ?`).get(id);
  }

  require(id: LiftSetId): LiftSet {
    const set = this.get(id);
    if (!set) {
      throw notFound('Set');
    }
    return set;
  }

  /**
   * The workout id comes from the path, so an unknown one is a 404. The exercise id comes from the
   * body, and the foreign key is left to catch an unknown one — hence the 400 rather than a 404.
   */
  create(workoutId: WorkoutId, input: CreateSet): LiftSet {
    this.#workouts.require(workoutId);

    const position =
      input.position ??
      this.#db.query<{ next: number }, [WorkoutId]>('SELECT COALESCE(MAX(position), 0) + 1 AS next FROM sets WHERE workout_id = ?').get(workoutId)?.next ??
      1;

    try {
      const inserted = this.#db
        .query<{ id: LiftSetId }, [WorkoutId, ExerciseId, number, number, string | null, number]>(
          `INSERT INTO sets (workout_id, exercise_id, reps, weight, notes, position)
           VALUES (?, ?, ?, ?, ?, ?)
           RETURNING id`,
        )
        .get(workoutId, input.exercise_id, input.reps, input.weight, input.notes, position);
      if (!inserted) {
        throw new Error('Insert of set returned no row');
      }
      return this.require(inserted.id);
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw badRequest('"exerciseId" must name an existing exercise');
      }
      throw err;
    }
  }

  update(id: LiftSetId, patch: EditSet): LiftSet {
    this.require(id);

    const update = buildUpdate('sets', FIELDS, patch);
    if (update) {
      try {
        this.#db.query(update.sql).run(...update.values, id);
      } catch (err) {
        if (isForeignKeyViolation(err)) {
          throw badRequest('"exerciseId" must name an existing exercise');
        }
        throw err;
      }
    }
    return this.require(id);
  }

  delete(id: LiftSetId): void {
    this.require(id);
    this.#db.query('DELETE FROM sets WHERE id = ?').run(id);
  }
}
