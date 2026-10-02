import type { RawHtml } from '../../ui/html.ts';
import { define } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import { plural, todayIso } from '../../ui/format.ts';
import { navigate } from '../../app/router.ts';
import { PAGE_SIZE, pageCount, pageOffset, pagePath, parsePage } from '../../ui/pagination/pagination.ts';
import '../../ui/pagination/gz-pagination.component.ts';
import type { WorkoutWithStatsDto } from '../../../shared/dto/workout.ts';
import { toastError } from '../../ui/toast.ts';
import { GzView } from '../../ui/view.ts';
import { workoutFacade } from './workouts.facade.ts';
import type { GzWorkoutCardComponent } from './gz-workout-card.component.ts';
import './gz-workout-card.component.ts';

/** One page of the log; `total` counts every workout. */
interface WorkoutListData {
  items: WorkoutWithStatsDto[];
  total: number;
  /** 1-based, from `?page=`. */
  page: number;
}

/** The training log: every session, newest first, a page at a time. */
export class GzWorkoutListComponent extends GzView<WorkoutListData> {
  override loadingText = 'Loading workouts…';

  override connectedCallback(): void {
    super.connectedCallback();
    this.root.addEventListener('page-change', (event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'number') {
        navigate(pagePath('/workouts', event.detail));
      }
    });
  }

  override async load(): Promise<WorkoutListData> {
    const page = parsePage(location.search);
    const { items, total } = await workoutFacade.list({ limit: PAGE_SIZE, offset: pageOffset(page, PAGE_SIZE) });
    return { items, total, page };
  }

  override async handleSubmit(action: string, form: HTMLFormElement): Promise<void> {
    if (action !== 'create') {
      return;
    }
    const values = this.formData(form);
    try {
      const workout = await workoutFacade.create({
        // The date field is pre-filled and `required`, so an empty value means it
        // was cleared. The API defaults a missing date but rejects an empty one.
        performedOn: values.performedOn === '' ? todayIso() : values.performedOn,
        title: values.title,
        notes: values.notes,
      });
      navigate(`/workouts/${workout.id}`);
    } catch (error) {
      toastError(error);
    }
  }

  #newWorkoutForm(): RawHtml {
    return html`
      <article class="card vstack gap-2">
        <h2>New workout</h2>
        <form class="new-form" data-action="create">
          <div class="fields">
            <div class="field">
              <label for="performedOn">Date</label>
              <input id="performedOn" name="performedOn" type="date" value="${todayIso()}" required />
            </div>
            <div class="field">
              <label for="title">Title</label>
              <input id="title" name="title" type="text" placeholder="Push day" maxlength="120" />
            </div>
            <div class="field field-notes">
              <label for="notes">Notes</label>
              <input id="notes" name="notes" type="text" placeholder="Slept badly, kept it light" maxlength="2000" />
            </div>
            <button type="submit">Start session</button>
          </div>
        </form>
      </article>
    `;
  }

  /** The page's cards and the pager; past the last page, the pager alone says so. */
  #page(items: WorkoutWithStatsDto[], total: number, page: number): RawHtml {
    const pages = pageCount(total, PAGE_SIZE);
    const pager = html` <gz-pagination page="${page}" pages="${pages}" noun="workouts"></gz-pagination> `;
    if (page > pages) {
      return pager;
    }
    return html`
      <div class="vstack gap-2">
        ${items.length === 0 ? html`<p class="empty">No sessions logged yet. Start one above.</p>` : items.map((workout) => html`<gz-workout-card data-id="${workout.id}"></gz-workout-card>`)}
      </div>
      ${pager}
    `;
  }

  override afterRender(): void {
    for (const card of this.$$<GzWorkoutCardComponent>('gz-workout-card')) {
      card.workout = this.data?.items.find((workout) => workout.id === Number(card.dataset.id));
    }
  }

  override readyTemplate({ items, total, page }: WorkoutListData): RawHtml {
    return html`
      <div class="vstack">
        <div class="hstack justify-between gap-2">
          <h1>Workouts</h1>
          <span class="badge outline">${plural(total, 'session')}</span>
        </div>

        ${this.#newWorkoutForm()} ${this.#page(items, total, page)}
      </div>
    `;
  }
}

await define('gz-workout-list', GzWorkoutListComponent, import.meta.url);
