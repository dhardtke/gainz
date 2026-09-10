import type { DB } from "../db";
import { notFound } from "../http";
import { buildUpdate } from "./sql";

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

export interface WorkoutInput {
  performed_on: string;
  title: string | null;
  notes: string | null;
}

const FIELDS = ["performed_on", "title", "notes"] as const;

export class WorkoutRepo {
  constructor(private readonly db: DB) {}

  list(limit: number, offset: number): WorkoutWithStats[] {
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

  count(): number {
    return this.db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM workouts").get()?.n ?? 0;
  }

  get(id: number): Workout | null {
    return this.db.query<Workout, [number]>("SELECT id, performed_on, title, notes, created_at FROM workouts WHERE id = ?").get(id);
  }

  require(id: number): Workout {
    const workout = this.get(id);
    if (!workout) {
      throw notFound("Workout");
    }
    return workout;
  }

  create(input: WorkoutInput): Workout {
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

  update(id: number, patch: Partial<WorkoutInput>): Workout {
    this.require(id);

    const update = buildUpdate("workouts", FIELDS, patch);
    if (update) {
      this.db.query(update.sql).run(...update.values, id);
    }
    return this.require(id);
  }

  delete(id: number): void {
    this.require(id);
    this.db.query("DELETE FROM workouts WHERE id = ?").run(id);
  }
}
