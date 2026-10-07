ALTER TABLE workouts ADD COLUMN done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1));

-- Keeps every workout that showed as done, its sets all checked, done.
UPDATE workouts SET done = 1
 WHERE EXISTS (SELECT 1 FROM sets s WHERE s.workout_id = workouts.id)
   AND NOT EXISTS (SELECT 1 FROM sets s WHERE s.workout_id = workouts.id AND s.done = 0);
