import type { DB } from '../../../db/db.ts';
import { badRequest, conflict, notFound } from '../../../http/errors.ts';
import { buildUpdate, isForeignKeyViolation } from '../../../db/sql.ts';
import type { WorkoutRepository } from './workout.repository.ts';
import type { WorkoutExerciseRepository } from './workout-exercise.repository.ts';
import type { ExerciseId, LiftSetId, WorkoutId } from '../../../../shared/flavors.ts';
import type { LiftSet } from '../ports/set.ts';
import { SET_COLUMNS } from '../ports/sql.ts';

export interface CreateSet {
  exercise_id: ExerciseId;
  reps: number;
  weight: number;
  notes: string | null;
}

/** No `exercise_id`: a set's exercise is fixed once it is saved. */
export interface EditSet {
  reps?: number;
  weight?: number;
  notes?: string | null;
  done?: 0 | 1;
}

const FIELDS = ['reps', 'weight', 'notes', 'done'] as const;

export class SetRepository {
  readonly #db: DB;

  readonly #workouts: WorkoutRepository;

  readonly #workoutExercises: WorkoutExerciseRepository;

  constructor(db: DB, workouts: WorkoutRepository, workoutExercises: WorkoutExerciseRepository) {
    this.#db = db;
    this.#workouts = workouts;
    this.#workoutExercises = workoutExercises;
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

  /** An unknown exercise trips the foreign key, hence a 400 rather than a 404. */
  create(workoutId: WorkoutId, input: CreateSet): LiftSet {
    return this.#db.transaction(() => {
      this.#requireOpen(workoutId);

      const position =
        this.#db.query<{ next: number }, [WorkoutId]>('SELECT COALESCE(MAX(position), 0) + 1 AS next FROM sets WHERE workout_id = ?').get(workoutId)?.next ?? 1;

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
        // After the insert, so an unknown exercise is still the set's foreign key failing.
        this.#workoutExercises.append(workoutId, input.exercise_id);
        return this.require(inserted.id);
      } catch (err) {
        if (isForeignKeyViolation(err)) {
          throw badRequest('"exerciseId" must name an existing exercise');
        }
        throw err;
      }
    })();
  }

  /** A done set only takes `done`; the stored state decides, so a stale tab cannot bypass it. */
  update(id: LiftSetId, patch: EditSet): LiftSet {
    return this.#db.transaction(() => {
      const current = this.require(id);
      this.#requireOpen(current.workout_id);
      if (current.done === 1 && Object.keys(patch).some((field) => field !== 'done')) {
        throw conflict('Set is done; mark it as not done before changing it');
      }

      const update = buildUpdate('sets', FIELDS, patch);
      if (update) {
        this.#db.query(update.sql).run(...update.values, id);
      }
      return this.require(id);
    })();
  }

  delete(id: LiftSetId): void {
    this.#db.transaction(() => {
      const set = this.require(id);
      this.#requireOpen(set.workout_id);
      if (set.done === 1) {
        throw conflict('Set is done; mark it as not done before deleting it');
      }
      this.#db.query('DELETE FROM sets WHERE id = ?').run(id);
      this.#workoutExercises.removeIfUnused(set.workout_id, set.exercise_id);
    })();
  }

  #requireOpen(workoutId: WorkoutId): void {
    if (this.#workouts.require(workoutId).done === 1) {
      throw conflict('Workout is done; reopen it before changing its sets');
    }
  }
}
