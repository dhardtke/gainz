// In ports/ because the exercises feature queries the sets table too.

/** Epley formula. */
export const EST_1RM_SQL = 's.weight * (1 + s.reps / 30.0)';

/** A set's volume, on `s` and its exercise `e`: only a weighted exercise's weight is load. */
export const VOLUME_SQL = "CASE WHEN e.kind = 'weighted' THEN s.reps * s.weight ELSE 0 END";

/** A copied set's weight, on `s` and `e`: an exercise turned bodyweight may still hold loaded sets, and a new bodyweight set stores 0. */
export const COPIED_WEIGHT_SQL = "CASE WHEN e.kind = 'bodyweight' THEN 0 ELSE s.weight END";

/** Σ reps × (body weight − weight), from a session's totals; NULL without a body weight or with a set at or above it. */
export function effectiveVolumeSql(bodyWeight: string, reps: string, volume: string, topWeight: string): string {
  return `CASE WHEN ${bodyWeight} > ${topWeight} THEN ${reps} * ${bodyWeight} - ${volume} END`;
}

export const SET_COLUMNS = 's.id, s.workout_id, s.exercise_id, e.name AS exercise_name, s.reps, s.weight, s.notes, s.position, s.created_at, s.done';

/** Binds the exercise id, then a workout id to skip (or null). */
export const LAST_SESSION_WORKOUT_SQL = `SELECT w.id, w.performed_on FROM workouts w JOIN sets s ON s.workout_id = w.id
   WHERE s.exercise_id = ? AND s.done = 1 AND w.id IS NOT ?
   ORDER BY w.performed_on DESC, w.id DESC LIMIT 1`;
