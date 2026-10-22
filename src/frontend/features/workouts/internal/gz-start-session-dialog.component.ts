import type { RawHtml } from '../../../ui/html.ts';
import { define } from '../../../ui/base.ts';
import { html } from '../../../ui/html.ts';
import { GzModal } from '../../../ui/modal.ts';
import { formatShortDate } from '../../../ui/format.ts';
import type { ExerciseWithStatsDto } from '../../../../shared/dto/exercise.ts';
import type { ExerciseId } from '../../../../shared/flavors.ts';
import '../../exercises/gz-muscle-group-icon.component.ts';

export class GzStartSessionDialogComponent extends GzModal<ExerciseId[] | null> {
  exercises: ExerciseWithStatsDto[] = [];

  // In tick order, which is the order they are copied in.
  #picked: ExerciseId[] = [];

  // `null` until Start empty or Start with N, so Cancel, Escape and the backdrop leave it.
  #result: ExerciseId[] | null = null;

  override handleAction(action: string): void {
    const dialog = this.$<HTMLDialogElement>('dialog');
    if (action === 'start-picked' && this.#picked.length > 0) {
      this.#result = [...this.#picked];
      dialog?.close();
    } else if (action === 'start-empty') {
      this.#result = [];
      dialog?.close();
    } else if (action === 'cancel') {
      dialog?.close();
    }
  }

  override answer(): ExerciseId[] | null {
    return this.#result;
  }

  override afterRender(): void {
    this.$('dialog')?.addEventListener('change', (event) => {
      if (event.target instanceof HTMLInputElement) {
        const id = Number(event.target.value);
        this.#picked = event.target.checked ? [...this.#picked, id] : this.#picked.filter((picked) => picked !== id);
        this.#updateStart();
      }
    });
    super.afterRender();
  }

  // In place: a re-render would close the dialog.
  #updateStart(): void {
    const start = this.$<HTMLButtonElement>("[data-action='start-picked']");
    if (start) {
      start.textContent = `Start with ${this.#picked.length}`;
      start.disabled = this.#picked.length === 0;
    }
  }

  override template(): RawHtml {
    return html`
      <dialog aria-labelledby="title" aria-describedby="message" data-testid="dialog">
        <header>
          <h2 id="title">Start session</h2>
          <p id="message">Pick exercises to copy from their last session.</p>
        </header>
        <div>
          <ul class="picks" data-testid="exercises">
            ${this.exercises.map(
              (exercise) => html`
                <li>
                  <label>
                    <input type="checkbox" value="${exercise.id}" data-testid="pick" />
                    <gz-muscle-group-icon group="${exercise.muscleGroup ?? ''}" label="${exercise.muscleGroup ?? ''}"></gz-muscle-group-icon>
                    <span class="name" data-testid="pick-name">${exercise.name}</span>
                    <span class="last text-light">last ${formatShortDate(exercise.lastPerformedOn)}</span>
                  </label>
                </li>
              `,
            )}
          </ul>
        </div>
        <footer>
          <button class="outline cancel" data-action="cancel" data-testid="cancel">Cancel</button>
          <button class="outline" data-action="start-empty" data-testid="start-empty">Start empty</button>
          <button data-action="start-picked" data-testid="start-picked" disabled>Start with 0</button>
        </footer>
      </dialog>
    `;
  }
}

await define('gz-start-session-dialog', GzStartSessionDialogComponent, import.meta.url);
