import type { ExerciseWithStatsDto } from '../../../../shared/dto/exercise.ts';
import type { ExerciseId } from '../../../../shared/flavors.ts';
import { GzStartSessionDialogComponent, START_SESSION_CLOSED_EVENT } from './gz-start-session-dialog.component.ts';

function isIds(detail: unknown): detail is ExerciseId[] {
  return Array.isArray(detail) && detail.every((id) => typeof id === 'number');
}

// Resolves the picked ids in tick order, `[]` for Start empty, and `null` for Cancel, Escape and the backdrop.
export function pickExercises(exercises: ExerciseWithStatsDto[]): Promise<ExerciseId[] | null> {
  const dialog = document.createElement('gz-start-session-dialog');
  if (!(dialog instanceof GzStartSessionDialogComponent)) {
    return Promise.reject(new Error('gz-start-session-dialog is not defined'));
  }
  dialog.exercises = exercises;
  const answer = new Promise<ExerciseId[] | null>((resolve) => {
    dialog.addEventListener(
      START_SESSION_CLOSED_EVENT,
      (event) => {
        resolve(event instanceof CustomEvent && isIds(event.detail) ? event.detail : null);
      },
      { once: true },
    );
  });
  document.body.append(dialog);
  return answer;
}
