CREATE TABLE exercises_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  muscle_group  TEXT    CHECK (muscle_group IN ('Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Full body')),
  notes         TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Anything that is not one of the groups, ignoring case and surrounding spaces, is dropped.
INSERT INTO exercises_new (id, name, muscle_group, notes, created_at)
SELECT id, name,
       CASE lower(trim(muscle_group))
         WHEN 'chest'     THEN 'Chest'
         WHEN 'back'      THEN 'Back'
         WHEN 'shoulders' THEN 'Shoulders'
         WHEN 'arms'      THEN 'Arms'
         WHEN 'legs'      THEN 'Legs'
         WHEN 'core'      THEN 'Core'
         WHEN 'full body' THEN 'Full body'
       END,
       notes, created_at
  FROM exercises;

-- Keep the sequence, so ids of deleted exercises are not handed out again.
DELETE FROM sqlite_sequence WHERE name = 'exercises_new';
INSERT INTO sqlite_sequence (name, seq) SELECT 'exercises_new', seq FROM sqlite_sequence WHERE name = 'exercises';

DROP TABLE exercises;
ALTER TABLE exercises_new RENAME TO exercises;

CREATE UNIQUE INDEX idx_exercises_name ON exercises (name COLLATE NOCASE);
