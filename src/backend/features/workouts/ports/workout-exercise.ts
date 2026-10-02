import type { ExerciseId, WorkoutId } from '../../../../shared/flavors.ts';

export interface WorkoutExercise {
  workout_id: WorkoutId;
  exercise_id: ExerciseId;
  exercise_name: string;
  position: number;
}
