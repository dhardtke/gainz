import type { DB } from "../db";

export class StatsRepo {
  constructor(private readonly db: DB) {}

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
