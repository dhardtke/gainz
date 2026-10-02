/**
 * The SQL fragments that name columns of the `sets` table. They live in `ports/` rather than in
 * `internal/` because the exercises feature queries the sets table too — `progress()` and
 * `bestSet()` both do — so these two genuinely cross a feature line.
 */

/**
 * Epley formula. A rough but widely used way to put sets of different rep
 * counts on one scale, which is what makes a progress line comparable.
 */
export const EST_1RM_SQL = 's.weight * (1 + s.reps / 30.0)';

export const SET_COLUMNS = 's.id, s.workout_id, s.exercise_id, e.name AS exercise_name, s.reps, s.weight, s.notes, s.position, s.created_at, s.done';
