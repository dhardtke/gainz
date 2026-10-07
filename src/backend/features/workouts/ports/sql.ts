// In ports/ because the exercises feature queries the sets table too.

/** Epley formula. */
export const EST_1RM_SQL = 's.weight * (1 + s.reps / 30.0)';

export const SET_COLUMNS = 's.id, s.workout_id, s.exercise_id, e.name AS exercise_name, s.reps, s.weight, s.notes, s.position, s.created_at, s.done';
