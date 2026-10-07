import type { DB } from '../../../db/db.ts';
import type { Iso8601Date } from '../../../../shared/flavors.ts';
import type { Summary } from '../ports/stats.ts';

interface SummaryTotals {
  workout_count: number;
  set_count: number;
  total_reps: number;
  total_volume: number;
  exercise_count: number;
  last_performed_on: Iso8601Date | null;
}

interface SummaryRecentActivity {
  workouts_last_30_days: number;
  volume_last_30_days: number;
}

export class StatsRepository {
  readonly #db: DB;

  constructor(db: DB) {
    this.#db = db;
  }

  /** Set numbers count done sets only; workout numbers count every workout. */
  summary(): Summary {
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
      .query<SummaryRecentActivity, []>(
        `SELECT COUNT(DISTINCT w.id)                AS workouts_last_30_days,
                COALESCE(SUM(s.reps * s.weight), 0) AS volume_last_30_days
           FROM workouts w
           LEFT JOIN sets s ON s.workout_id = w.id AND s.done = 1
          WHERE w.performed_on >= date('now', '-30 day')`,
      )
      .get();

    // Aggregates always yield a row; spreading a null would silently answer {}.
    if (totals === null || recent === null) {
      throw new Error('Summary query returned no row');
    }
    return { ...totals, ...recent };
  }
}
