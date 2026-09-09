import type { DB } from "./db";
import { conflict, notFound } from "./http";

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

export interface Workout {
  id: number;
  performed_on: string;
  title: string | null;
  notes: string | null;
  created_at: string;
}

export interface WorkoutWithStats extends Workout {
  set_count: number;
  exercise_count: number;
  total_reps: number;
  total_volume: number;
}

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

export interface WorkoutInput {
  performed_on: string;
  title: string | null;
  notes: string | null;
}

export interface SetInput {
  exercise_id: number;
  reps: number;
  weight: number;
  notes: string | null;
  position?: number;
}

/**
 * Epley formula. A rough but widely used way to put sets of different rep
 * counts on one scale, which is what makes a progress line comparable.
 */
const EST_1RM_SQL = "s.weight * (1 + s.reps / 30.0)";

const EXERCISE_COLUMNS = "e.id, e.name, e.muscle_group, e.notes, e.created_at";
const SET_COLUMNS = "s.id, s.workout_id, s.exercise_id, e.name AS exercise_name, s.reps, s.weight, s.notes, s.position, s.created_at";

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed/i.test(err.message);
}

export class Repo {
  constructor(private readonly db: DB) {}

  // ---------------------------------------------------------------- exercises

  listExercises(): ExerciseWithStats[] {
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

  getExercise(id: number): Exercise | null {
    return this.db.query<Exercise, [number]>(`SELECT ${EXERCISE_COLUMNS} FROM exercises e WHERE e.id = ?`).get(id);
  }

  requireExercise(id: number): Exercise {
    const exercise = this.getExercise(id);
    if (!exercise) {
      throw notFound("Exercise");
    }
    return exercise;
  }

  createExercise(input: ExerciseInput): Exercise {
    try {
      const row = this.db
        .query<Exercise, [string, string | null, string | null]>(
          `INSERT INTO exercises (name, muscle_group, notes) VALUES (?, ?, ?)
           RETURNING id, name, muscle_group, notes, created_at`,
        )
        .get(input.name, input.muscle_group, input.notes);
      if (!row) {
        throw new Error("Insert of exercise returned no row");
      }
      return row;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw conflict(`An exercise named "${input.name}" already exists`);
      }
      throw err;
    }
  }

  updateExercise(id: number, patch: Partial<ExerciseInput>): Exercise {
    this.requireExercise(id);

    const assignments: string[] = [];
    const values: (string | null)[] = [];
    for (const field of ["name", "muscle_group", "notes"] as const) {
      if (field in patch) {
        assignments.push(`${field} = ?`);
        values.push(patch[field] ?? null);
      }
    }
    if (assignments.length === 0) {
      return this.requireExercise(id);
    }

    try {
      this.db.query(`UPDATE exercises SET ${assignments.join(", ")} WHERE id = ?`).run(...values, id);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw conflict(`An exercise named "${patch.name}" already exists`);
      }
      throw err;
    }
    return this.requireExercise(id);
  }

  deleteExercise(id: number): void {
    this.requireExercise(id);
    const used = this.db.query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM sets WHERE exercise_id = ?").get(id);
    if (used && used.n > 0) {
      throw conflict(`Exercise is used by ${used.n} logged set(s); delete those sets first to keep your history intact`);
    }
    this.db.query("DELETE FROM exercises WHERE id = ?").run(id);
  }

  /** Per-session aggregates for one exercise, oldest first — the progress curve. */
  exerciseProgress(id: number): SessionPoint[] {
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
  exerciseBestSet(id: number): (LiftSet & { performed_on: string }) | null {
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

  // ----------------------------------------------------------------- workouts

  listWorkouts(limit: number, offset: number): WorkoutWithStats[] {
    return this.db
      .query<WorkoutWithStats, [number, number]>(
        `SELECT w.id, w.performed_on, w.title, w.notes, w.created_at,
                COUNT(s.id)                         AS set_count,
                COUNT(DISTINCT s.exercise_id)       AS exercise_count,
                COALESCE(SUM(s.reps), 0)            AS total_reps,
                COALESCE(SUM(s.reps * s.weight), 0) AS total_volume
           FROM workouts w
           LEFT JOIN sets s ON s.workout_id = w.id
          GROUP BY w.id
          ORDER BY w.performed_on DESC, w.id DESC
          LIMIT ? OFFSET ?`,
      )
      .all(limit, offset);
  }

  countWorkouts(): number {
    return this.db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM workouts").get()?.n ?? 0;
  }

  getWorkout(id: number): Workout | null {
    return this.db.query<Workout, [number]>("SELECT id, performed_on, title, notes, created_at FROM workouts WHERE id = ?").get(id);
  }

  requireWorkout(id: number): Workout {
    const workout = this.getWorkout(id);
    if (!workout) {
      throw notFound("Workout");
    }
    return workout;
  }

  createWorkout(input: WorkoutInput): Workout {
    const row = this.db
      .query<Workout, [string, string | null, string | null]>(
        `INSERT INTO workouts (performed_on, title, notes) VALUES (?, ?, ?)
         RETURNING id, performed_on, title, notes, created_at`,
      )
      .get(input.performed_on, input.title, input.notes);
    if (!row) {
      throw new Error("Insert of workout returned no row");
    }
    return row;
  }

  updateWorkout(id: number, patch: Partial<WorkoutInput>): Workout {
    this.requireWorkout(id);

    const assignments: string[] = [];
    const values: (string | null)[] = [];
    for (const field of ["performed_on", "title", "notes"] as const) {
      if (field in patch) {
        assignments.push(`${field} = ?`);
        values.push(patch[field] ?? null);
      }
    }
    if (assignments.length > 0) {
      this.db.query(`UPDATE workouts SET ${assignments.join(", ")} WHERE id = ?`).run(...values, id);
    }
    return this.requireWorkout(id);
  }

  deleteWorkout(id: number): void {
    this.requireWorkout(id);
    this.db.query("DELETE FROM workouts WHERE id = ?").run(id);
  }

  // --------------------------------------------------------------------- sets

  listSets(workoutId: number): LiftSet[] {
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

  getSet(id: number): LiftSet | null {
    return this.db.query<LiftSet, [number]>(`SELECT ${SET_COLUMNS} FROM sets s JOIN exercises e ON e.id = s.exercise_id WHERE s.id = ?`).get(id);
  }

  requireSet(id: number): LiftSet {
    const set = this.getSet(id);
    if (!set) {
      throw notFound("Set");
    }
    return set;
  }

  createSet(workoutId: number, input: SetInput): LiftSet {
    this.requireWorkout(workoutId);
    this.requireExercise(input.exercise_id);

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
    return this.requireSet(inserted.id);
  }

  updateSet(id: number, patch: Partial<SetInput>): LiftSet {
    this.requireSet(id);
    if (patch.exercise_id !== undefined) {
      this.requireExercise(patch.exercise_id);
    }

    const assignments: string[] = [];
    const values: (string | number | null)[] = [];
    for (const field of ["exercise_id", "reps", "weight", "notes", "position"] as const) {
      if (field in patch) {
        assignments.push(`${field} = ?`);
        values.push(patch[field] ?? null);
      }
    }
    if (assignments.length > 0) {
      this.db.query(`UPDATE sets SET ${assignments.join(", ")} WHERE id = ?`).run(...values, id);
    }
    return this.requireSet(id);
  }

  deleteSet(id: number): void {
    this.requireSet(id);
    this.db.query("DELETE FROM sets WHERE id = ?").run(id);
  }

  /** Copies every set of an earlier workout into another one — "repeat this session". */
  copySets(fromWorkoutId: number, toWorkoutId: number): number {
    const result = this.db
      .query(
        `INSERT INTO sets (workout_id, exercise_id, reps, weight, notes, position)
         SELECT ?, exercise_id, reps, weight, notes, position
           FROM sets WHERE workout_id = ?`,
      )
      .run(toWorkoutId, fromWorkoutId);
    return Number(result.changes);
  }

  // -------------------------------------------------------------------- stats

  summary() {
    const totals = this.db
      .query<
        {
          workout_count: number;
          set_count: number;
          total_reps: number;
          total_volume: number;
          exercise_count: number;
          last_performed_on: string | null;
        },
        []
      >(
        `SELECT (SELECT COUNT(*) FROM workouts)                    AS workout_count,
                (SELECT COUNT(*) FROM sets)                        AS set_count,
                (SELECT COALESCE(SUM(reps), 0) FROM sets)          AS total_reps,
                (SELECT COALESCE(SUM(reps * weight), 0) FROM sets) AS total_volume,
                (SELECT COUNT(*) FROM exercises)                   AS exercise_count,
                (SELECT MAX(performed_on) FROM workouts)           AS last_performed_on`,
      )
      .get();

    const recent = this.db
      .query<{ workouts_last_30_days: number; volume_last_30_days: number }, []>(
        `SELECT COUNT(DISTINCT w.id)                AS workouts_last_30_days,
                COALESCE(SUM(s.reps * s.weight), 0) AS volume_last_30_days
           FROM workouts w
           LEFT JOIN sets s ON s.workout_id = w.id
          WHERE w.performed_on >= date('now', '-30 day')`,
      )
      .get();

    return { ...totals, ...recent };
  }
}
