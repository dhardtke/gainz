/**
 * The shapes the gainz REST API returns, written out for the frontend.
 *
 * These are declared here rather than imported from `backend/src/repo/`, even though a
 * type-only import would be erased before the browser ever saw it. The frontend
 * is a client of an HTTP API, so what it should be pinned to is the wire format
 * it expects — not the server's internal row types. Sharing them would quietly
 * absorb a renamed column as a refactor; keeping them apart makes it show up as
 * what it is, a change to the API. `bun run typecheck` will not catch that drift
 * for you.
 *
 * Nothing imports this module at runtime: every consumer uses `import type`,
 * which the transpiler strips, so this file is never fetched by the browser.
 */

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
  /** ISO date, `YYYY-MM-DD`. */
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

/**
 * A workout with its sets. `GET /workouts/:id` and `POST /workouts` return this;
 * `PATCH /workouts/:id` returns the bare `Workout`.
 */
export interface WorkoutWithSets extends Workout {
  sets: LiftSet[];
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

/** One session on an exercise's progress line. */
export interface SessionPoint {
  workout_id: number;
  performed_on: string;
  set_count: number;
  total_reps: number;
  total_volume: number;
  top_weight: number;
  /** Epley estimate from the session's best set. */
  est_one_rep_max: number;
}

export interface Summary {
  workout_count: number;
  set_count: number;
  total_reps: number;
  total_volume: number;
  exercise_count: number;
  last_performed_on: string | null;
  workouts_last_30_days: number;
  volume_last_30_days: number;
}

/** One page of the training log. */
export interface WorkoutPage {
  items: WorkoutWithStats[];
  /** Every workout, not just this page. */
  total: number;
  limit: number;
  offset: number;
}

/** Everything the exercise detail view plots. */
export interface ExerciseProgress {
  exercise: Exercise;
  /** Oldest first. */
  sessions: SessionPoint[];
  best_set: (LiftSet & { performed_on: string }) | null;
}

/**
 * The body of a create request. The optional fields may be left out entirely —
 * the server normalises a missing value, an empty string and null all to null.
 */
export interface ExerciseInput {
  name: string;
  muscle_group?: string | null;
  notes?: string | null;
}

/**
 * The body of `POST /workouts`. Every field is optional: a workout with nothing
 * set is today's empty session.
 */
export interface WorkoutInput {
  /** Defaults to today on the server. */
  performed_on?: string;
  title?: string | null;
  notes?: string | null;
  /** Copies that workout's sets into the new one. */
  copy_from_workout_id?: number;
}

export interface SetInput {
  exercise_id: number;
  reps: number;
  weight: number;
  notes?: string | null;
  /** Appended to the workout when left out. */
  position?: number;
}
