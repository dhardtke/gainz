import type { RawHtml } from '../../ui/html.ts';
import { define } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import { formatAssistance, formatWeight, plural, relativeDay } from '../../ui/format.ts';
import { navigate } from '../../app/router.ts';
import { PAGE_SIZE, pageCount, pageOffset, parsePage } from '../../ui/pagination/pagination.ts';
import '../../ui/pagination/gz-pagination.component.ts';
import './gz-muscle-group-icon.component.ts';
import type { ExerciseDto, ExerciseFilterDto, ExerciseWithStatsDto } from '../../../shared/dto/exercise.ts';
import { toast, toastError } from '../../ui/toast.ts';
import { GzView } from '../../ui/view.ts';
import { exerciseFacade } from './exercises.facade.ts';
import { muscleGroupFilterOptions, muscleGroupOptions, parseMuscleGroup } from './internal/muscle-groups.ts';
import { exercisesPath, isFiltered, KIND_LABELS, kindOptions, parseExerciseFilter, parseExerciseKind, typeFilterOptions } from './internal/exercise-filter.ts';

interface ExerciseListData {
  items: ExerciseWithStatsDto[];
  total: number;
  all: number;
  page: number;
  filter: ExerciseFilterDto;
}

// Applying a search renders a fresh view, which takes the focus back for the next one.
let refocusSearch = false;

export class GzExerciseListComponent extends GzView<ExerciseListData> {
  override loadingText = 'Loading exercises…';

  override connectedCallback(): void {
    super.connectedCallback();
    this.root.addEventListener('page-change', (event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'number') {
        navigate(exercisesPath(this.data?.filter ?? {}, event.detail));
      }
    });
    this.root.addEventListener('change', (event) => {
      const { target } = event;
      if (!(target instanceof HTMLSelectElement || target instanceof HTMLInputElement)) {
        return;
      }
      const { id, value } = target;
      const { muscleGroup, type, search } = this.data?.filter ?? {};
      const kept = search === undefined ? {} : { search };
      if (id === 'filter') {
        const group = value === 'none' ? 'none' : parseMuscleGroup(value);
        navigate(exercisesPath({ ...(group === null ? {} : { muscleGroup: group }), ...(type === undefined ? {} : { type }), ...kept }, 1));
      } else if (id === 'type-filter') {
        const chosen = parseExerciseKind(value);
        navigate(exercisesPath({ ...(muscleGroup === undefined ? {} : { muscleGroup }), ...(chosen === null ? {} : { type: chosen }), ...kept }, 1));
      } else if (id === 'search' && target instanceof HTMLInputElement) {
        this.#applySearch(target);
      }
    });
    // Chrome and Safari fire only `search`, not `change`, when the ✕ clears the field.
    this.root.addEventListener('search', (event) => {
      if (event.target instanceof HTMLInputElement && event.target.id === 'search') {
        this.#applySearch(event.target);
      }
    });
  }

  // Compared with the URL, not `this.data`, which is stale while the next view loads.
  #applySearch(field: HTMLInputElement): void {
    const value = field.value.trim();
    const { muscleGroup, type, search } = parseExerciseFilter(location.search);
    if (value === (search ?? '')) {
      return;
    }
    // Enter or the ✕ leaves the field focused; leaving it does not.
    refocusSearch = this.root.activeElement === field;
    navigate(
      exercisesPath(
        { ...(muscleGroup === undefined ? {} : { muscleGroup }), ...(type === undefined ? {} : { type }), ...(value === '' ? {} : { search: value }) },
        1,
      ),
    );
  }

  override afterRender(): void {
    if (!refocusSearch || this.$('[data-testid="loading"]') !== null) {
      return;
    }
    refocusSearch = false;
    const field = this.$<HTMLInputElement>('#search');
    // gz-app reveals the view only after it rendered, and a hidden field takes no focus.
    setTimeout(() => {
      field?.focus();
      field?.setSelectionRange(field.value.length, field.value.length);
    });
  }

  override async load(): Promise<ExerciseListData> {
    const page = parsePage(location.search);
    const filter = parseExerciseFilter(location.search);
    const { items, total, all } = await exerciseFacade.list({ limit: PAGE_SIZE, offset: pageOffset(page, PAGE_SIZE), ...filter });
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
        kind: parseExerciseKind(values.kind) ?? 'weighted',
      });
    } catch (error) {
      toastError(error);
      return;
    }
    toast(`Added ${name}`, 'success');

    try {
      // Its own group, its own type while a type is chosen, and no search, so the new card is in view.
      const filter: ExerciseFilterDto = {
        muscleGroup: exercise.muscleGroup ?? 'none',
        ...(this.data?.filter.type === undefined ? {} : { type: exercise.kind }),
      };
      const { index } = await exerciseFacade.position(exercise.id, filter);
      navigate(exercisesPath(filter, Math.floor(index / PAGE_SIZE) + 1));
    } catch (error) {
      toastError(error);
      form.reset();
      await this.reload();
    }
  }

  #card(exercise: ExerciseWithStatsDto): RawHtml {
    const { muscleGroup, notes } = exercise;
    const parts = [muscleGroup, exercise.kind === 'weighted' ? null : KIND_LABELS[exercise.kind], notes].filter((part) => part !== null);
    return html`
      <article class="card open-card" data-testid="card">
        <span class="icon-slot" data-testid="card-icon-slot">
          ${muscleGroup ? html`<gz-muscle-group-icon group="${muscleGroup}" data-testid="card-icon"></gz-muscle-group-icon>` : ''}
        </span>
        <div class="content">
          <div class="head">
            <a class="open" href="/exercises/${exercise.id}">${exercise.name}</a>
          </div>
          ${parts.length > 0 ? html`<div class="text-light" data-testid="card-subtitle">${parts.join(' · ')}</div>` : ''}
          <div class="foot">
            <span class="text-light">
              ${plural(exercise.setCount, 'set')} · ${this.#best(exercise)} · ${exercise.lastPerformedOn ? relativeDay(exercise.lastPerformedOn) : 'never done'}
            </span>
          </div>
        </div>
      </article>
    `;
  }

  #best({ kind, bestWeight, bestReps, leastWeight }: ExerciseWithStatsDto): string {
    if (kind === 'assisted') {
      return leastWeight === null ? 'no best yet' : `${formatAssistance(leastWeight)} least`;
    }
    const bodyweight = kind === 'bodyweight';
    const best = bodyweight ? bestReps : bestWeight;
    if (best === null) {
      return 'no best yet';
    }
    return `${bodyweight ? plural(best, 'rep') : formatWeight(best)} best`;
  }

  #emptyText(all: number, filter: ExerciseFilterDto): string {
    if (all === 0 || !isFiltered(filter)) {
      return 'No exercises yet. Add the lifts you train above.';
    }
    const { muscleGroup, type, search } = filter;
    const kind = type === undefined ? '' : `${type} `;
    const phrase = muscleGroup === 'none' ? `${kind}exercises without a muscle group` : `${kind}${muscleGroup === undefined ? '' : `${muscleGroup} `}exercises`;
    if (search !== undefined) {
      return `No ${phrase} match "${search}".`;
    }
    return muscleGroup === 'none' ? `No ${phrase}.` : `No ${phrase} yet.`;
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
            <p class="text-light" data-testid="subtitle">${isFiltered(filter) ? `${total} of ${plural(all, 'exercise')}` : plural(all, 'exercise')}</p>
          </hgroup>
          <div class="filters hstack gap-2">
            <div class="field search">
              <label for="search">Search</label>
              <input id="search" type="search" placeholder="Exercise name" value="${filter.search ?? ''}" maxlength="120" data-testid="search" />
            </div>
            <div class="field">
              <label for="filter">Muscle group</label>
              <select id="filter" class="rich" data-testid="filter">
                ${muscleGroupFilterOptions(filter.muscleGroup ?? null)}
              </select>
            </div>
            <div class="field">
              <label for="type-filter">Type</label>
              <select id="type-filter" data-testid="type-filter">
                ${typeFilterOptions(filter.type)}
              </select>
            </div>
          </div>
        </div>

        <details class="add" data-testid="add" ${all === 0 ? 'open' : ''}>
          <summary>Add an exercise</summary>
          <form class="new-form vstack gap-2" data-action="create">
            <div class="fields">
              <div class="field">
                <label for="name">Name</label>
                <input id="name" name="name" type="text" placeholder="Back Squat" maxlength="120" required />
              </div>
              <div class="field">
                <label for="muscleGroup">Muscle group</label>
                <select id="muscleGroup" name="muscleGroup" class="rich" data-testid="muscleGroup">
                  ${muscleGroupOptions(null)}
                </select>
              </div>
              <div class="field field-notes">
                <label for="notes">Notes</label>
                <input id="notes" name="notes" type="text" placeholder="Low bar, belt over 100 kg" maxlength="2000" />
              </div>
            </div>
            <div class="hstack justify-between gap-2 submit-row">
              <div class="field">
                <label for="kind">Type</label>
                <select id="kind" name="kind" data-testid="kind">
                  ${kindOptions('weighted')}
                </select>
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
