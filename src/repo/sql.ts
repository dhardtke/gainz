/**
 * SQL fragments and helpers shared by the entity repositories. Nothing here executes a statement.
 */

/**
 * Epley formula. A rough but widely used way to put sets of different rep
 * counts on one scale, which is what makes a progress line comparable.
 */
export const EST_1RM_SQL = "s.weight * (1 + s.reps / 30.0)";

export const EXERCISE_COLUMNS = "e.id, e.name, e.muscle_group, e.notes, e.created_at";
export const SET_COLUMNS = "s.id, s.workout_id, s.exercise_id, e.name AS exercise_name, s.reps, s.weight, s.notes, s.position, s.created_at";

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed/i.test(err.message);
}

export interface UpdateStatement {
  sql: string;
  values: (string | number | null)[];
}

/**
 * Builds `UPDATE <table> SET a = ?, b = ? WHERE id = ?` from whichever of `fields` the patch
 * actually carries, or null when it carries none.
 *
 * Column names come only from `fields` — a hard-coded tuple at each call site — and never from the
 * patch's own keys, so a request body cannot smuggle SQL into the statement. Membership is tested
 * with `in` rather than `!== undefined`, so an explicitly-null field still clears the column.
 */
export function buildUpdate<T extends object, F extends Extract<keyof T, string>>(
  table: string,
  fields: readonly F[],
  patch: Partial<T>,
): UpdateStatement | null {
  const assignments: string[] = [];
  const values: (string | number | null)[] = [];

  for (const field of fields) {
    if (field in patch) {
      assignments.push(`${field} = ?`);
      values.push((patch[field] ?? null) as string | number | null);
    }
  }

  if (assignments.length === 0) {
    return null;
  }
  return { sql: `UPDATE ${table} SET ${assignments.join(", ")} WHERE id = ?`, values };
}
