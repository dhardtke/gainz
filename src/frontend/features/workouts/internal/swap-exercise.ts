import type { ExerciseWithStatsDto } from '../../../../shared/dto/exercise.ts';
import type { ExerciseId, WorkoutId } from '../../../../shared/flavors.ts';
import type { WorkoutExerciseDto, WorkoutWithExercisesDto } from '../../../../shared/dto/workout.ts';
import { setFacade } from '../workouts.facade.ts';
import { toastError } from '../../../ui/toast.ts';
import { GzSwapExerciseDialogComponent } from './gz-swap-exercise-dialog.component.ts';

// Offers the exercises not in the workout, the swapped one's muscle group first; `null` when nothing was swapped.
export async function swapExercise(
  workoutId: WorkoutId,
  group: WorkoutExerciseDto,
  inWorkout: ExerciseId[],
  exercises: ExerciseWithStatsDto[],
): Promise<WorkoutWithExercisesDto | null> {
  const dialog = document.createElement('gz-swap-exercise-dialog');
  if (!(dialog instanceof GzSwapExerciseDialogComponent)) {
    throw new Error('gz-swap-exercise-dialog is not defined');
  }
  const sameGroup = (exercise: ExerciseWithStatsDto): number => (group.muscleGroup !== null && exercise.muscleGroup === group.muscleGroup ? 0 : 1);
  dialog.exerciseName = group.exerciseName;
  dialog.exercises = exercises.filter((exercise) => !inWorkout.includes(exercise.id)).toSorted((a, b) => sameGroup(a) - sameGroup(b));
  const picked = await dialog.open();
  if (picked === null) {
    return null;
  }
  try {
    return await setFacade.swapExercise(workoutId, group.exerciseId, picked);
  } catch (error) {
    toastError(error);
    return null;
  }
}
