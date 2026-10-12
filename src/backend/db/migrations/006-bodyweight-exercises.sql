ALTER TABLE exercises ADD COLUMN bodyweight INTEGER NOT NULL DEFAULT 0 CHECK (bodyweight IN (0, 1));

-- Exercises that were only ever logged without weight.
UPDATE exercises SET bodyweight = 1
 WHERE EXISTS (SELECT 1 FROM sets WHERE sets.exercise_id = exercises.id)
   AND NOT EXISTS (SELECT 1 FROM sets WHERE sets.exercise_id = exercises.id AND sets.weight <> 0);
