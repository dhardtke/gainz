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

interface WorkoutListData {
  items: WorkoutWithStatsDto[];
  total: number;
  page: number;
}

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

  override async handleAction(action: string): Promise<void> {
    if (action !== 'start-session') {
      return;
    }
    try {
      const workout = await workoutFacade.create({ performedOn: todayIso() });
      navigate(`/workouts/${workout.id}`);
    } catch (error) {
      toastError(error);
    }
  }

  #page(items: WorkoutWithStatsDto[], total: number, page: number): RawHtml {
    const pages = pageCount(total, PAGE_SIZE);
    const pager = html` <gz-pagination page="${page}" pages="${pages}" noun="workouts"></gz-pagination> `;
    if (page > pages) {
      return pager;
    }
    return html`
      <div class="vstack gap-2">
        ${items.length === 0 ? html`<p class="empty">No sessions logged yet. Start one with Start session.</p>` : items.map((workout) => html`<gz-workout-card data-id="${workout.id}" data-testid="workout-card"></gz-workout-card>`)}
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
          <hgroup>
            <h1>Workouts</h1>
            <p class="text-light" data-testid="subtitle">${plural(total, 'session')}</p>
          </hgroup>
          <button data-action="start-session" data-testid="start-session">Start session</button>
        </div>

        ${this.#page(items, total, page)}
      </div>
    `;
  }
}

await define('gz-workout-list', GzWorkoutListComponent, import.meta.url);
