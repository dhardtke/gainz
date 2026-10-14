// In ports/ because the stats and exercises features read the body weight of a date.

/** The latest weigh-in on or before `dateColumn`, or NULL. */
export function bodyWeightOnSql(dateColumn: string): string {
  return `(SELECT wi.weight FROM weigh_ins wi WHERE wi.measured_on <= ${dateColumn} ORDER BY wi.measured_on DESC LIMIT 1)`;
}
