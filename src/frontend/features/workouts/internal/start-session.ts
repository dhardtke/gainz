import type { ExerciseWithStatsDto } from '../../../../shared/dto/exercise.ts';
import type { ExerciseId } from '../../../../shared/flavors.ts';
import { GzStartSessionDialogComponent } from './gz-start-session-dialog.component.ts';

// Resolves the picked ids in tick order, `[]` for Start empty, and `null` for Cancel, Escape and the backdrop.
export function pickExercises(exercises: ExerciseWithStatsDto[]): Promise<ExerciseId[] | null> {
  const dialog = document.createElement('gz-start-session-dialog');
  if (!(dialog instanceof GzStartSessionDialogComponent)) {
    return Promise.reject(new Error('gz-start-session-dialog is not defined'));
  }
  dialog.exercises = exercises;
  return dialog.open();
}
