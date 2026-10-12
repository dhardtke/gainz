// In ports/ because the exercises feature queries the sets table too.

/** Epley formula. */
export const EST_1RM_SQL = 's.weight * (1 + s.reps / 30.0)';

export const SET_COLUMNS = 's.id, s.workout_id, s.exercise_id, e.name AS exercise_name, s.reps, s.weight, s.notes, s.position, s.created_at, s.done';

/** Binds the exercise id, then a workout id to skip (or null). */
export const LAST_SESSION_WORKOUT_SQL = `SELECT w.id, w.performed_on FROM workouts w JOIN sets s ON s.workout_id = w.id
   WHERE s.exercise_id = ? AND s.done = 1 AND w.id IS NOT ?
   ORDER BY w.performed_on DESC, w.id DESC LIMIT 1`;
