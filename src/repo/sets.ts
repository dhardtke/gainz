import type { DB } from "../db";
import { notFound } from "../http";
import type { ExerciseRepo } from "./exercises";
import { buildUpdate, SET_COLUMNS } from "./sql";
import type { WorkoutRepo } from "./workouts";

export interface LiftSet {
  id: number;
  workout_id: number;
  exercise_id: number;
  exercise_name: string;
  reps: number;
  weight: number;
  notes: string | null;
  position: number;
  created_at: string;
}

export interface SetInput {
  exercise_id: number;
  reps: number;
  weight: number;
  notes: string | null;
  position?: number;
}

const FIELDS = ["exercise_id", "reps", "weight", "notes", "position"] as const;

export class SetRepo {
  /**
   * The sibling repositories are injected rather than imported as values: `exercises.ts` already
   * needs the `LiftSet` type from here, so a value import in either direction would close a cycle.
   */
  constructor(
    private readonly db: DB,
    private readonly workouts: WorkoutRepo,
    private readonly exercises: ExerciseRepo,
  ) {}

  list(workoutId: number): LiftSet[] {
    return this.db
      .query<LiftSet, [number]>(
        `SELECT ${SET_COLUMNS}
           FROM sets s
           JOIN exercises e ON e.id = s.exercise_id
          WHERE s.workout_id = ?
          ORDER BY s.position ASC, s.id ASC`,
      )
      .all(workoutId);
  }

  get(id: number): LiftSet | null {
    return this.db.query<LiftSet, [number]>(`SELECT ${SET_COLUMNS} FROM sets s JOIN exercises e ON e.id = s.exercise_id WHERE s.id = ?`).get(id);
  }

  require(id: number): LiftSet {
    const set = this.get(id);
    if (!set) {
      throw notFound("Set");
    }
    return set;
  }

  create(workoutId: number, input: SetInput): LiftSet {
    this.workouts.require(workoutId);
    this.exercises.require(input.exercise_id);

    const position =
      input.position ??
      this.db.query<{ next: number }, [number]>("SELECT COALESCE(MAX(position), 0) + 1 AS next FROM sets WHERE workout_id = ?").get(workoutId)?.next ??
      1;

    const inserted = this.db
      .query<{ id: number }, [number, number, number, number, string | null, number]>(
        `INSERT INTO sets (workout_id, exercise_id, reps, weight, notes, position)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING id`,
      )
      .get(workoutId, input.exercise_id, input.reps, input.weight, input.notes, position);
    if (!inserted) {
      throw new Error("Insert of set returned no row");
    }
    return this.require(inserted.id);
  }

  update(id: number, patch: Partial<SetInput>): LiftSet {
    this.require(id);
    // Checked here rather than left to ON DELETE RESTRICT, so an unknown exercise is a 404 and not
    // a raw SQLite error surfacing as a 500.
    if (patch.exercise_id !== undefined) {
      this.exercises.require(patch.exercise_id);
    }

    const update = buildUpdate("sets", FIELDS, patch);
    if (update) {
      this.db.query(update.sql).run(...update.values, id);
    }
    return this.require(id);
  }

  delete(id: number): void {
    this.require(id);
    this.db.query("DELETE FROM sets WHERE id = ?").run(id);
  }

  /** Copies every set of an earlier workout into another one — "repeat this session". */
  copyInto(fromWorkoutId: number, toWorkoutId: number): number {
    const result = this.db
      .query(
        `INSERT INTO sets (workout_id, exercise_id, reps, weight, notes, position)
         SELECT ?, exercise_id, reps, weight, notes, position
           FROM sets WHERE workout_id = ?`,
      )
      .run(toWorkoutId, fromWorkoutId);
    return Number(result.changes);
  }
}
