import type { RawHtml } from '../../ui/html.ts';
import { define } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import { formatWeight, plural, relativeDay } from '../../ui/format.ts';
import { navigate } from '../../app/router.ts';
import { PAGE_SIZE, pageCount, pageOffset, parsePage } from '../../ui/pagination/pagination.ts';
import '../../ui/pagination/gz-pagination.component.ts';
import type { ExerciseDto, ExerciseWithStatsDto } from '../../../shared/dto/exercise.ts';
import { toast, toastError } from '../../ui/toast.ts';
import { GzView } from '../../ui/view.ts';
import { exerciseFacade } from './exercises.facade.ts';
import { exercisesPath, muscleGroupFilterOptions, muscleGroupOptions, parseMuscleGroup, parseMuscleGroupFilter } from './internal/muscle-groups.ts';
import type { MuscleGroupFilter } from '../../../shared/muscle-group.ts';

interface ExerciseListData {
  items: ExerciseWithStatsDto[];
  total: number;
  all: number;
  page: number;
  filter: MuscleGroupFilter | null;
}

export class GzExerciseListComponent extends GzView<ExerciseListData> {
  override loadingText = 'Loading exercises…';

  override connectedCallback(): void {
    super.connectedCallback();
    this.root.addEventListener('page-change', (event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'number') {
        navigate(exercisesPath(this.data?.filter ?? null, event.detail));
      }
    });
    this.root.addEventListener('change', (event) => {
      if (event.target instanceof HTMLSelectElement && event.target.id === 'filter') {
        const { value } = event.target;
        navigate(exercisesPath(value === 'none' ? 'none' : parseMuscleGroup(value), 1));
      }
    });
  }

  override async load(): Promise<ExerciseListData> {
    const page = parsePage(location.search);
    const filter = parseMuscleGroupFilter(location.search);
    const { items, total, all } = await exerciseFacade.list({ limit: PAGE_SIZE, offset: pageOffset(page, PAGE_SIZE), muscleGroup: filter ?? undefined });
    return { items, total, all, page, filter };
  }

  override async handleSubmit(action: string, form: HTMLFormElement): Promise<void> {
    if (action !== 'create') {
      return;
    }
    const values = this.formData(form);
    const name = values.name ?? '';

    let exercise: ExerciseDto;
    try {
      exercise = await exerciseFacade.create({
        name,
        muscleGroup: parseMuscleGroup(values.muscleGroup),
        notes: values.notes,
      });
    } catch (error) {
      toastError(error);
      return;
    }
    toast(`Added ${name}`, 'success');

    try {
      const filter = exercise.muscleGroup ?? 'none';
      const { index } = await exerciseFacade.position(exercise.id, filter);
      navigate(exercisesPath(filter, Math.floor(index / PAGE_SIZE) + 1));
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

  #emptyText(all: number, filter: MuscleGroupFilter | null): string {
    if (all === 0 || filter === null) {
      return 'No exercises yet. Add the lifts you train above.';
    }
    return filter === 'none' ? 'No exercises without a muscle group.' : `No ${filter} exercises yet.`;
  }

  #page({ items, total, all, page, filter }: ExerciseListData): RawHtml {
    const pages = pageCount(total, PAGE_SIZE);
    const pager = html` <gz-pagination page="${page}" pages="${pages}" noun="exercises"></gz-pagination> `;
    if (page > pages) {
      return pager;
    }
    return html`
      <div class="vstack gap-2">
        ${items.length === 0 ? html`<p class="empty" data-testid="empty">${this.#emptyText(all, filter)}</p>` : items.map((exercise) => this.#card(exercise))}
      </div>
      ${pager}
    `;
  }

  override readyTemplate(data: ExerciseListData): RawHtml {
    const { total, all, filter } = data;
    return html`
      <div class="vstack">
        <div class="hstack justify-between gap-2">
          <hgroup>
            <h1>Exercises</h1>
            <p class="text-light" data-testid="subtitle">${filter === null ? plural(all, 'exercise') : `${total} of ${plural(all, 'exercise')}`}</p>
          </hgroup>
          <div class="field">
            <label for="filter">Muscle group</label>
            <select id="filter" data-testid="filter">
              ${muscleGroupFilterOptions(filter)}
            </select>
          </div>
        </div>

        <details class="add" data-testid="add" ${all === 0 ? 'open' : ''}>
          <summary>Add an exercise</summary>
          <form class="new-form" data-action="create">
            <div class="fields">
              <div class="field">
                <label for="name">Name</label>
                <input id="name" name="name" type="text" placeholder="Back Squat" maxlength="120" required />
              </div>
              <div class="field">
                <label for="muscleGroup">Muscle group</label>
                <select id="muscleGroup" name="muscleGroup" data-testid="muscleGroup">
                  ${muscleGroupOptions(null)}
                </select>
              </div>
              <div class="field field-notes">
                <label for="notes">Notes</label>
                <input id="notes" name="notes" type="text" placeholder="Low bar, belt over 100 kg" maxlength="2000" />
              </div>
              <button type="submit">Add</button>
            </div>
          </form>
        </details>

        ${this.#page(data)}
      </div>
    `;
  }
}

await define('gz-exercise-list', GzExerciseListComponent, import.meta.url);
