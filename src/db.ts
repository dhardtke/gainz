import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SCHEMA = `
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
`;

export type DB = Database;

/**
 * Opens (and if needed creates) the SQLite database and applies the schema.
 * `:memory:` is supported and used by the test suite.
 */
export function openDatabase(path: string): DB {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  return db;
}

export const DEFAULT_DB_PATH = process.env.GAINZ_DB ?? "data/gainz.sqlite";
