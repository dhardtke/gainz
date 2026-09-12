/**
 * Statement helpers and constraint predicates that belong to no one feature: every repository
 * builds an UPDATE the same way, and SQLite reports a broken constraint the same way whichever
 * table it happened on. Nothing here executes a statement, and no column name is named — those
 * live with the feature that owns the table.
 */

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed/i.test(err.message);
}

/** A row pointing at something that is not there — as opposed to a duplicate. */
export function isForeignKeyViolation(err: unknown): boolean {
  return err instanceof Error && 'code' in err && err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY';
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
export function buildUpdate<T extends object>(table: string, fields: readonly Extract<keyof T, string>[], patch: Partial<T>): UpdateStatement | null {
  const assignments: string[] = [];
  const values: (string | number | null)[] = [];

  for (const field of fields) {
    if (field in patch) {
      // SQLite binds text, numbers and null. Anything else is a bug in the caller's
      // input type rather than something a request could cause, so say so loudly.
      const value = patch[field] ?? null;
      if (value !== null && typeof value !== 'string' && typeof value !== 'number') {
        throw new TypeError(`Cannot bind ${table}.${field}: expected a string, a number or null`);
      }
      assignments.push(`${field} = ?`);
      values.push(value);
    }
  }

  if (assignments.length === 0) {
    return null;
  }
  return { sql: `UPDATE ${table} SET ${assignments.join(', ')} WHERE id = ?`, values };
}
