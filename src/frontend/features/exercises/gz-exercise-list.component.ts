import type { RawHtml } from '../../ui/html.ts';
import { define } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import { formatWeight, plural, relativeDay } from '../../ui/format.ts';
import { navigate } from '../../app/router.ts';
import { PAGE_SIZE, pageCount, pageOffset, pagePath, parsePage } from '../../ui/pagination/pagination.ts';
import '../../ui/pagination/gz-pagination.component.ts';
import type { ExerciseDto, ExerciseWithStatsDto } from '../../../shared/dto/exercise.ts';
import { toast, toastError } from '../../ui/toast.ts';
import { GzView } from '../../ui/view.ts';
import { exerciseFacade } from './exercises.facade.ts';

/** One page of the catalog; `total` counts every exercise. */
interface ExerciseListData {
  items: ExerciseWithStatsDto[];
  total: number;
  /** 1-based, from `?page=`. */
  page: number;
}

/** The exercise catalog — the vocabulary the rest of the log is written in — by name, a page at a time. */
export class GzExerciseListComponent extends GzView<ExerciseListData> {
  override loadingText = 'Loading exercises…';

  override connectedCallback(): void {
    super.connectedCallback();
    this.root.addEventListener('page-change', (event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'number') {
        navigate(pagePath('/exercises', event.detail));
      }
    });
  }

  override async load(): Promise<ExerciseListData> {
    const page = parsePage(location.search);
    const { items, total } = await exerciseFacade.list({ limit: PAGE_SIZE, offset: pageOffset(page, PAGE_SIZE) });
    return { items, total, page };
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
      await this.reload();
    }
  }

  #card(exercise: ExerciseWithStatsDto): RawHtml {
    const subtitle = [exercise.muscleGroup, exercise.notes].filter((part) => part !== null).join(' · ');
    return html`
      <article class="card open-card">
        <div class="head">
          <a class="open" href="/exercises/${exercise.id}">${exercise.name}</a>
        </div>
        ${subtitle === '' ? '' : html`<div class="text-light">${subtitle}</div>`}
        <div class="foot">
          <span class="text-light">
            ${plural(exercise.setCount, 'set')} · ${exercise.bestWeight === null ? 'no best yet' : `${formatWeight(exercise.bestWeight)} best`} ·
            ${exercise.lastPerformedOn ? relativeDay(exercise.lastPerformedOn) : 'never done'}
          </span>
        </div>
      </article>
    `;
  }

  /** The page's cards and the pager; past the last page, the pager alone says so. */
  #page(items: ExerciseWithStatsDto[], total: number, page: number): RawHtml {
    const pages = pageCount(total, PAGE_SIZE);
    const pager = html` <gz-pagination page="${page}" pages="${pages}" noun="exercises"></gz-pagination> `;
    if (page > pages) {
      return pager;
    }
    return html`
      <div class="vstack gap-2">
        ${items.length === 0 ? html`<p class="empty">No exercises yet. Add the lifts you train above.</p>` : items.map((exercise) => this.#card(exercise))}
      </div>
      ${pager}
    `;
  }

  override readyTemplate({ items, total, page }: ExerciseListData): RawHtml {
    return html`
      <div class="vstack">
        <hgroup>
          <h1>Exercises</h1>
          <p class="text-light" data-testid="subtitle">${plural(total, 'exercise')}</p>
        </hgroup>

        <details class="add" data-testid="add" ${total === 0 ? 'open' : ''}>
          <summary>Add an exercise</summary>
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
        </details>

        ${this.#page(items, total, page)}
      </div>
    `;
  }
}

await define('gz-exercise-list', GzExerciseListComponent, import.meta.url);
