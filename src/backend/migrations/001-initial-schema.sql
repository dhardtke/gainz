-- The schema as it stood before this project had a migration system.
--
-- The IF NOT EXISTS guards are deliberate and specific to this first migration: databases created
-- by earlier versions of gainz already hold these tables, and applying 001 to one of them must be a
-- no-op that only writes the schema_migrations row. Later migrations start from a known version, so
-- they need no such guard and should not use one.

CREATE TABLE IF NOT EXISTS exercises (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  muscle_group  TEXT,
  notes         TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_name ON exercises (name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS workouts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  performed_on  TEXT    NOT NULL,
  title         TEXT,
  notes         TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_workouts_performed_on ON workouts (performed_on DESC);

CREATE TABLE IF NOT EXISTS sets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_id    INTEGER NOT NULL REFERENCES workouts (id)  ON DELETE CASCADE,
  exercise_id   INTEGER NOT NULL REFERENCES exercises (id) ON DELETE RESTRICT,
  reps          INTEGER NOT NULL,
  weight        REAL    NOT NULL,
  notes         TEXT,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_sets_workout   ON sets (workout_id, position, id);
CREATE INDEX IF NOT EXISTS idx_sets_exercise  ON sets (exercise_id);
