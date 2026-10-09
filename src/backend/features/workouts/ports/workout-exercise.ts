import type { ExerciseId, WorkoutId } from '../../../../shared/flavors.ts';
import type { MuscleGroup } from '../../../../shared/muscle-group.ts';

export interface WorkoutExercise {
  workout_id: WorkoutId;
  exercise_id: ExerciseId;
  exercise_name: string;
  muscle_group: MuscleGroup | null;
  position: number;
}
