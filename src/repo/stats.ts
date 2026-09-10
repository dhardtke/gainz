import type { DB } from "../db";

/** The whole-log totals half of a summary. */
interface SummaryTotals {
  workout_count: number;
  set_count: number;
  total_reps: number;
  total_volume: number;
  exercise_count: number;
  last_performed_on: string | null;
}

/** The rolling-window half of a summary. */
interface SummaryRecentActivity {
  workouts_last_30_days: number;
  volume_last_30_days: number;
}

export type Summary = SummaryTotals & SummaryRecentActivity;

export class StatsRepo {
  constructor(private readonly db: DB) {}

  summary(): Summary {
    const totals = this.db
      .query<SummaryTotals, []>(
        `SELECT (SELECT COUNT(*) FROM workouts)                    AS workout_count,
                (SELECT COUNT(*) FROM sets)                        AS set_count,
                (SELECT COALESCE(SUM(reps), 0) FROM sets)          AS total_reps,
                (SELECT COALESCE(SUM(reps * weight), 0) FROM sets) AS total_volume,
                (SELECT COUNT(*) FROM exercises)                   AS exercise_count,
                (SELECT MAX(performed_on) FROM workouts)           AS last_performed_on`,
      )
      .get();

    const recent = this.db
      .query<SummaryRecentActivity, []>(
        `SELECT COUNT(DISTINCT w.id)                AS workouts_last_30_days,
                COALESCE(SUM(s.reps * s.weight), 0) AS volume_last_30_days
           FROM workouts w
           LEFT JOIN sets s ON s.workout_id = w.id
          WHERE w.performed_on >= date('now', '-30 day')`,
      )
      .get();

    // Both queries aggregate, so SQLite always answers with a row. Spreading a
    // null would quietly hand the endpoint an empty object, so refuse instead.
    if (totals === null || recent === null) {
      throw new Error("Summary query returned no row");
    }
    return { ...totals, ...recent };
  }
}
