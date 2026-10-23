import type { RawHtml } from '../../../ui/html.ts';
import { define } from '../../../ui/base.ts';
import { html } from '../../../ui/html.ts';
import { GzModal } from '../../../ui/modal.ts';
import { formatShortDate } from '../../../ui/format.ts';
import type { ExerciseWithStatsDto } from '../../../../shared/dto/exercise.ts';
import type { ExerciseId } from '../../../../shared/flavors.ts';
import '../../exercises/gz-muscle-group-icon.component.ts';

export class GzSwapExerciseDialogComponent extends GzModal<ExerciseId | null> {
  exerciseName = '';

  exercises: ExerciseWithStatsDto[] = [];

  #picked: ExerciseId | null = null;

  // `null` until Swap, so Cancel, Escape and the backdrop leave it.
  #result: ExerciseId | null = null;

  override handleAction(action: string): void {
    const dialog = this.$<HTMLDialogElement>('dialog');
    if (action === 'swap' && this.#picked !== null) {
      this.#result = this.#picked;
      dialog?.close();
    } else if (action === 'cancel') {
      dialog?.close();
    }
  }

  override answer(): ExerciseId | null {
    return this.#result;
  }

  override afterRender(): void {
    this.$('dialog')?.addEventListener('change', (event) => {
      if (event.target instanceof HTMLInputElement) {
        this.#picked = Number(event.target.value);
        this.$<HTMLButtonElement>("[data-action='swap']")?.toggleAttribute('disabled', false);
      }
    });
    super.afterRender();
  }

  override template(): RawHtml {
    return html`
      <dialog aria-labelledby="title" aria-describedby="message" data-testid="dialog">
        <header>
          <h2 id="title">Swap ${this.exerciseName}</h2>
          <p id="message">Its sets not yet done become the pick's last session, or keep their reps if it has none. Done sets stay.</p>
        </header>
        <div>
          <ul class="picks" data-testid="exercises">
            ${this.exercises.map(
              (exercise) => html`
                <li>
                  <label>
                    <input type="radio" name="exercise" value="${exercise.id}" data-testid="pick" />
                    <gz-muscle-group-icon group="${exercise.muscleGroup ?? ''}" label="${exercise.muscleGroup ?? ''}"></gz-muscle-group-icon>
                    <span class="name" data-testid="pick-name">${exercise.name}</span>
                    ${exercise.lastPerformedOn ? html`<span class="last text-light">last ${formatShortDate(exercise.lastPerformedOn)}</span>` : ''}
                  </label>
                </li>
              `,
            )}
          </ul>
        </div>
        <footer>
          <button class="outline" data-action="cancel" data-testid="cancel">Cancel</button>
          <button data-action="swap" data-testid="swap" disabled>Swap</button>
        </footer>
      </dialog>
    `;
  }
}

await define('gz-swap-exercise-dialog', GzSwapExerciseDialogComponent, import.meta.url);
