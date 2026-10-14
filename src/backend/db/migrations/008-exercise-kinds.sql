CREATE TABLE exercises_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  muscle_group  TEXT    CHECK (muscle_group IN ('Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Full body')),
  notes         TEXT,
  kind          TEXT    NOT NULL DEFAULT 'weighted' CHECK (kind IN ('weighted', 'bodyweight', 'assisted')),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT INTO exercises_new (id, name, muscle_group, notes, kind, created_at)
SELECT id, name, muscle_group, notes,
       CASE bodyweight WHEN 1 THEN 'bodyweight' ELSE 'weighted' END,
       created_at
  FROM exercises;

-- Keep the sequence, so ids of deleted exercises are not handed out again.
DELETE FROM sqlite_sequence WHERE name = 'exercises_new';
INSERT INTO sqlite_sequence (name, seq) SELECT 'exercises_new', seq FROM sqlite_sequence WHERE name = 'exercises';

DROP TABLE exercises;
ALTER TABLE exercises_new RENAME TO exercises;

CREATE UNIQUE INDEX idx_exercises_name ON exercises (name COLLATE NOCASE);
