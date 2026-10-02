CREATE TABLE workout_exercises (
  workout_id   INTEGER NOT NULL REFERENCES workouts (id)  ON DELETE CASCADE,
  exercise_id  INTEGER NOT NULL REFERENCES exercises (id) ON DELETE RESTRICT,
  position     INTEGER NOT NULL,
  PRIMARY KEY (workout_id, exercise_id)
);

-- Each workout's exercises, in the order their first set appears.
INSERT INTO workout_exercises (workout_id, exercise_id, position)
SELECT workout_id, exercise_id,
       ROW_NUMBER() OVER (PARTITION BY workout_id ORDER BY MIN(position), MIN(id))
  FROM sets
 GROUP BY workout_id, exercise_id;
