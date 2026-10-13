import type { DB } from '../../../db/db.ts';
import type { ExerciseId, Iso8601Date, Iso8601Month, WorkoutId } from '../../../../shared/flavors.ts';
import type { CalendarDay, CalendarWorkout, RecentExercise, Summary } from '../ports/stats.ts';

interface SummaryTotals {
  workout_count: number;
  set_count: number;
  total_reps: number;
  total_volume: number;
  exercise_count: number;
  last_performed_on: Iso8601Date | null;
}

interface SummaryRecentActivity {
  workouts_since: number;
  volume_since: number;
}

interface ExerciseSession {
  workout_id: WorkoutId;
  performed_on: Iso8601Date;
  title: string | null;
  bodyweight: 0 | 1;
  reps: number;
  volume: number;
  previous_reps: number | null;
  previous_volume: number | null;
}

interface RecentSessionRow {
  exercise_id: ExerciseId;
  name: string;
  bodyweight: 0 | 1;
  workout_id: WorkoutId;
  performed_on: Iso8601Date;
  reps: number;
  volume: number;
  previous_reps: number | null;
  previous_volume: number | null;
}

interface SessionTotals {
  reps: number;
  volume: number;
}

// Each exercise's sessions of done sets, with the session before and the rank from the newest,
// for the exercises with a done set in a workout matching `window` (on `ww`).
function comparedSessionsSql(window: string): string {
  return `
  WITH sessions AS (
    SELECT w.id AS workout_id, w.performed_on, w.title, s.exercise_id, e.name, e.bodyweight,
           SUM(s.reps) AS reps, SUM(s.reps * s.weight) AS volume
      FROM sets s
      JOIN workouts w  ON w.id = s.workout_id
      JOIN exercises e ON e.id = s.exercise_id
     WHERE s.done = 1
       AND s.exercise_id IN (SELECT ws.exercise_id FROM sets ws JOIN workouts ww ON ww.id = ws.workout_id WHERE ws.done = 1 AND ${window})
     GROUP BY w.id, s.exercise_id
  ), compared AS (
    SELECT *, LAG(reps)   OVER history AS previous_reps,
              LAG(volume) OVER history AS previous_volume,
              ROW_NUMBER() OVER (PARTITION BY exercise_id ORDER BY performed_on DESC, workout_id DESC) AS recency
      FROM sessions
    WINDOW history AS (PARTITION BY exercise_id ORDER BY performed_on, workout_id)
  )`;
}

// Bodyweight work compares reps; weighted work compares volume and is not compared beside a session without load.
function sessionChange(bodyweight: 0 | 1, current: SessionTotals, previous: SessionTotals | null): number | null {
  if (previous === null) {
    return null;
  }
  if (bodyweight === 1) {
    return previous.reps > 0 ? current.reps / previous.reps - 1 : null;
  }
  return current.volume > 0 && previous.volume > 0 ? current.volume / previous.volume - 1 : null;
}

function previousOf(row: { previous_reps: number | null; previous_volume: number | null }): SessionTotals | null {
  return row.previous_reps === null || row.previous_volume === null ? null : { reps: row.previous_reps, volume: row.previous_volume };
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export class StatsRepository {
  readonly #db: DB;

  constructor(db: DB) {
    this.#db = db;
  }

  /** Set numbers count done sets only; workout numbers count every workout; `*_since` only those on or after `since`. */
  summary(since: Iso8601Date): Summary {
    const totals = this.#db
      .query<SummaryTotals, []>(
        `SELECT (SELECT COUNT(*) FROM workouts)                                   AS workout_count,
                (SELECT COUNT(*) FROM sets WHERE done = 1)                        AS set_count,
                (SELECT COALESCE(SUM(reps), 0) FROM sets WHERE done = 1)          AS total_reps,
                (SELECT COALESCE(SUM(reps * weight), 0) FROM sets WHERE done = 1) AS total_volume,
                (SELECT COUNT(*) FROM exercises)                                  AS exercise_count,
                (SELECT MAX(performed_on) FROM workouts)                          AS last_performed_on`,
      )
      .get();

    const recent = this.#db
      .query<SummaryRecentActivity, [string]>(
        `SELECT COUNT(DISTINCT w.id)                AS workouts_since,
                COALESCE(SUM(s.reps * s.weight), 0) AS volume_since
           FROM workouts w
           LEFT JOIN sets s ON s.workout_id = w.id AND s.done = 1
          WHERE w.performed_on >= ?1`,
      )
      .get(since);

    // Aggregates always yield a row; spreading a null would silently answer {}.
    if (totals === null || recent === null) {
      throw new Error('Summary query returned no row');
    }
    return { ...totals, ...recent };
  }

  /** Workout days of the month, each exercise compared with its previous session over all history; done sets only. */
  calendar(month: Iso8601Month): CalendarDay[] {
    const rows = this.#db
      .query<ExerciseSession, [string]>(
        `${comparedSessionsSql(`ww.performed_on >= ?1 AND ww.performed_on < date(?1, '+1 month')`)}
         SELECT workout_id, performed_on, title, bodyweight, reps, volume, previous_reps, previous_volume
           FROM compared
          WHERE performed_on >= ?1 AND performed_on < date(?1, '+1 month')
          ORDER BY performed_on, workout_id`,
      )
      .all(`${month}-01`);

    const workouts = new Map<WorkoutId, { workout: CalendarWorkout; ratios: number[] }>();
    for (const row of rows) {
      let entry = workouts.get(row.workout_id);
      if (!entry) {
        entry = {
          workout: { id: row.workout_id, performed_on: row.performed_on, title: row.title, progression: null, compared_exercise_count: 0 },
          ratios: [],
        };
        workouts.set(row.workout_id, entry);
      }
      const ratio = sessionChange(row.bodyweight, row, previousOf(row));
      if (ratio !== null) {
        entry.ratios.push(ratio);
      }
    }

    const days = new Map<Iso8601Date, { day: CalendarDay; ratios: number[] }>();
    for (const { workout, ratios } of workouts.values()) {
      workout.progression = mean(ratios);
      workout.compared_exercise_count = ratios.length;
      let entry = days.get(workout.performed_on);
      if (!entry) {
        entry = { day: { date: workout.performed_on, progression: null, compared_exercise_count: 0, workouts: [] }, ratios: [] };
        days.set(workout.performed_on, entry);
      }
      entry.day.workouts.push(workout);
      entry.ratios.push(...ratios);
    }

    return Array.from(days.values(), ({ day, ratios }) => ({ ...day, progression: mean(ratios), compared_exercise_count: ratios.length }));
  }

  /** Exercises with a session on or after `since`, each with its three newest sessions over all history; done sets only. */
  recentExercises(since: Iso8601Date): RecentExercise[] {
    const rows = this.#db
      .query<RecentSessionRow, [string]>(
        `${comparedSessionsSql('ww.performed_on >= ?1')}
         SELECT exercise_id, name, bodyweight, workout_id, performed_on, reps, volume, previous_reps, previous_volume
           FROM compared
          WHERE recency <= 3
          ORDER BY name COLLATE NOCASE, exercise_id, performed_on, workout_id`,
      )
      .all(since);

    const exercises = new Map<ExerciseId, RecentExercise>();
    for (const row of rows) {
      let exercise = exercises.get(row.exercise_id);
      if (!exercise) {
        exercise = { id: row.exercise_id, name: row.name, bodyweight: row.bodyweight, progression: null, progression_since: null, sessions: [] };
        exercises.set(row.exercise_id, exercise);
      }
      exercise.sessions.push({
        workout_id: row.workout_id,
        performed_on: row.performed_on,
        reps: row.reps,
        volume: row.volume,
        progression: sessionChange(row.bodyweight, row, previousOf(row)),
      });
    }

    // Against the oldest shown session the rule compares, so a 0 kg first session does not hide the trend after it.
    for (const exercise of exercises.values()) {
      const newest = exercise.sessions.at(-1);
      for (const earlier of exercise.sessions.slice(0, -1)) {
        const change = newest ? sessionChange(exercise.bodyweight, newest, earlier) : null;
        if (change !== null) {
          exercise.progression = change;
          exercise.progression_since = earlier.performed_on;
          break;
        }
      }
    }

    // A stable sort, so ties keep the query's name order.
    return [...exercises.values()].toSorted((a, b) => (a.progression ?? Infinity) - (b.progression ?? Infinity));
  }
}
