import { errorMessage } from '../../http/errors.ts';
import type { RawHtml } from '../../ui/html.ts';
import { define, GzElement } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import { formatWeight, plural, relativeDay } from '../../ui/format.ts';
import type { ExerciseWithStatsDto } from '../../../shared/dto/exercise.ts';
import { toast, toastError } from '../../ui/toast.ts';
import { exerciseFacade } from './exercises.facade.ts';

type ExerciseListState = { status: 'loading' } | { status: 'ready'; items: ExerciseWithStatsDto[] } | { status: 'error'; message: string };

/** The exercise catalogue — the vocabulary the rest of the log is written in. */
export class GzExerciseListComponent extends GzElement {
  #state: ExerciseListState = { status: 'loading' };

  override connectedCallback(): void {
    super.connectedCallback();
    this.ready = this.#load();
  }

  async #load(): Promise<void> {
    try {
      this.#state = { status: 'ready', items: await exerciseFacade.list() };
    } catch (error) {
      this.#state = { status: 'error', message: errorMessage(error) };
      toastError(error);
    }
    this.render();
  }

  override async handleSubmit(action: string, form: HTMLFormElement): Promise<void> {
    if (action !== 'create') {
      return;
    }
    const values = this.formData(form);
    // The name input is `required`, so an empty one only reaches here if the
    // browser's own validation was bypassed; the API rejects it either way.
    const name = values.name ?? '';

    try {
      await exerciseFacade.create({
        name,
        muscleGroup: values.muscleGroup,
        notes: values.notes,
      });
      toast(`Added ${name}`, 'success');
      form.reset();
      await this.#load();
    } catch (error) {
      toastError(error);
    }
  }

  #card(exercise: ExerciseWithStatsDto): RawHtml {
    const subtitle = [exercise.muscleGroup, exercise.notes].filter((part) => part !== null).join(' · ');
    return html`
      <article class="card open-card">
        <div class="grow">
          <a class="open" href="/exercises/${exercise.id}">${exercise.name}</a>
          ${subtitle === '' ? '' : html`<div class="text-light">${subtitle}</div>`}
        </div>
        <span class="badge outline">
          ${plural(exercise.setCount, 'set')} · ${exercise.bestWeight === null ? 'no best yet' : `${formatWeight(exercise.bestWeight)} best`} ·
          ${exercise.lastPerformedOn ? relativeDay(exercise.lastPerformedOn) : 'never done'}
        </span>
      </article>
    `;
  }

  override template(): RawHtml {
    if (this.#state.status === 'loading') {
      return html`<p aria-busy="true">Loading exercises…</p>`;
    }
    if (this.#state.status === 'error') {
      return html`<p class="error-text">${this.#state.message}</p>`;
    }

    const { items } = this.#state;

    return html`
      <div class="vstack">
        <div class="hstack justify-between gap-2">
          <h1>Exercises</h1>
          <span class="badge outline">${plural(items.length, 'exercise')}</span>
        </div>

        <article class="card vstack gap-2">
          <h2>Add an exercise</h2>
          <form class="new-form" data-action="create">
            <div class="fields">
              <div class="field">
                <label for="name">Name</label>
                <input id="name" name="name" type="text" placeholder="Back Squat" maxlength="120" required />
              </div>
              <div class="field">
                <label for="muscleGroup">Muscle group</label>
                <input id="muscleGroup" name="muscleGroup" type="text" placeholder="Legs" maxlength="60" />
              </div>
              <div class="field field-notes">
                <label for="notes">Notes</label>
                <input id="notes" name="notes" type="text" placeholder="Low bar, belt over 100 kg" maxlength="2000" />
              </div>
              <button type="submit">Add</button>
            </div>
          </form>
        </article>

        <div class="vstack gap-2">
          ${items.length === 0 ? html`<p class="empty">No exercises yet. Add the lifts you train above.</p>` : items.map((exercise) => this.#card(exercise))}
        </div>
      </div>
    `;
  }
}

await define('gz-exercise-list', GzExerciseListComponent, import.meta.url);
