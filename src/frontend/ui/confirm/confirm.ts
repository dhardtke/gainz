import type { ConfirmOptions } from './gz-confirm-dialog.component.ts';
import { CONFIRM_CLOSED_EVENT, GzConfirmDialogComponent } from './gz-confirm-dialog.component.ts';

export type { ConfirmOptions };

// Resolves `true` only for the action button; Cancel, Escape and the backdrop resolve `false`.
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  const dialog = document.createElement('gz-confirm-dialog');
  if (!(dialog instanceof GzConfirmDialogComponent)) {
    return Promise.reject(new Error('gz-confirm-dialog is not defined'));
  }
  dialog.options = options;
  const answer = new Promise<boolean>((resolve) => {
    dialog.addEventListener(
      CONFIRM_CLOSED_EVENT,
      (event) => {
        resolve(event instanceof CustomEvent && event.detail === true);
      },
      { once: true },
    );
  });
  document.body.append(dialog);
  return answer;
}
