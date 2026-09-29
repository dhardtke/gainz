import { errorMessage } from '../../http/errors.ts';
import type { RawHtml } from '../../ui/html.ts';
import { define, GzElement } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import { formatWeight, plural, relativeDay } from '../../ui/format.ts';
import { navigate } from '../../app/router.ts';
import { isBeyondApi, PAGE_SIZE, pageCount, pageOffset, pagePath, pager, parsePage, pastEnd } from '../../ui/pagination.ts';
import type { ExerciseDto, ExerciseWithStatsDto } from '../../../shared/dto/exercise.ts';
import { toast, toastError } from '../../ui/toast.ts';
import { exerciseFacade } from './exercises.facade.ts';

type ExerciseListState =
  | { status: 'loading' }
  /** `page` is 1-based, from `?page=`; `total` counts every exercise. */
  | { status: 'ready'; items: ExerciseWithStatsDto[]; total: number; page: number }
  | { status: 'error'; message: string };

/** The exercise catalog — the vocabulary the rest of the log is written in — by name, a page at a time. */
export class GzExerciseListComponent extends GzElement {
  #state: ExerciseListState = { status: 'loading' };

  override connectedCallback(): void {
    super.connectedCallback();
    this.ready = this.#load();
  }

  async #load(): Promise<void> {
    const page = parsePage(location.search);
    try {
      const result = await exerciseFacade.list({ limit: PAGE_SIZE, offset: pageOffset(page, PAGE_SIZE) });
      this.#state = { status: 'ready', items: result.items, total: result.total, page };
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

    let exercise: ExerciseDto;
    try {
      exercise = await exerciseFacade.create({
        name,
        muscleGroup: values.muscleGroup,
        notes: values.notes,
      });
    } catch (error) {
      toastError(error);
      return;
    }
    toast(`Added ${name}`, 'success');

    // Show the page the new exercise landed on. The rebuilt view replaces the form, so
    // there is nothing to reset; the current page's URL refreshes the view all the same.
    try {
      const { index } = await exerciseFacade.position(exercise.id);
      navigate(pagePath('/exercises', Math.floor(index / PAGE_SIZE) + 1));
    } catch (error) {
      toastError(error);
      form.reset();
      await this.#load();
    }
  }

  override handleAction(action: string, element: HTMLElement): void {
    if (action === 'page') {
      navigate(pagePath('/exercises', Number(element.dataset.page)));
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

  /** The page's cards and the pager, or the past-the-end state in their place. */
  #page(items: ExerciseWithStatsDto[], total: number, page: number): RawHtml {
    const pages = pageCount(total, PAGE_SIZE);
    if (page > pages || isBeyondApi(page, PAGE_SIZE)) {
      return pastEnd('exercises');
    }
    return html`
      <div class="vstack gap-2">
        ${items.length === 0 ? html`<p class="empty">No exercises yet. Add the lifts you train above.</p>` : items.map((exercise) => this.#card(exercise))}
      </div>
      ${pager(page, pages)}
    `;
  }

  override template(): RawHtml {
    if (this.#state.status === 'loading') {
      return html`<p aria-busy="true">Loading exercises…</p>`;
    }
    if (this.#state.status === 'error') {
      return html`<p class="error-text">${this.#state.message}</p>`;
    }

    const { items, total, page } = this.#state;

    return html`
      <div class="vstack">
        <div class="hstack justify-between gap-2">
          <h1>Exercises</h1>
          <span class="badge outline">${plural(total, 'exercise')}</span>
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

        ${this.#page(items, total, page)}
      </div>
    `;
  }
}

await define('gz-exercise-list', GzExerciseListComponent, import.meta.url);
