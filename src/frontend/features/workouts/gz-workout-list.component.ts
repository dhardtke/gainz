import { errorMessage } from '../../http/errors.ts';
import type { RawHtml } from '../../ui/html.ts';
import { define, GzElement } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import { formatDate, formatVolume, plural, relativeDay, todayIso } from '../../ui/format.ts';
import { navigate } from '../../app/router.ts';
import type { WorkoutWithStatsDto } from '../../../shared/dto/workout.ts';
import { toast, toastError } from '../../ui/toast.ts';
import { workoutFacade } from './workouts.facade.ts';

/**
 * The list keeps the pages it has already loaded, so `items` and `total` live
 * on every variant — an error while paging must not blank what is on screen.
 */
interface WorkoutListState {
  status: 'loading' | 'ready' | 'error';
  items: WorkoutWithStatsDto[];
  total: number;
  message?: string;
}

const PAGE_SIZE = 25;

/** The training log: every session, newest first. */
export class GzWorkoutListComponent extends GzElement {
  #state: WorkoutListState = { status: 'loading', items: [], total: 0 };

  override connectedCallback(): void {
    super.connectedCallback();
    void this.#load(0);
  }

  async #load(offset: number): Promise<void> {
    try {
      const page = await workoutFacade.list({ limit: PAGE_SIZE, offset });
      const items = offset === 0 ? page.items : [...this.#state.items, ...page.items];
      this.#state = { status: 'ready', items, total: page.total };
    } catch (error) {
      this.#state = { ...this.#state, status: 'error', message: errorMessage(error) };
      toastError(error);
    }
    this.render();
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

  override async handleAction(action: string, element: HTMLElement): Promise<void> {
    const id = Number(element.dataset.id);

    if (action === 'load-more') {
      await this.#load(this.#state.items.length);
      return;
    }

    if (action === 'repeat') {
      try {
        const workout = await workoutFacade.create({
          performedOn: todayIso(),
          title: element.dataset.title,
          copyFromWorkoutId: id,
        });
        toast(`Copied ${plural(workout.sets.length, 'set')} into a new session`, 'success');
        navigate(`/workouts/${workout.id}`);
      } catch (error) {
        toastError(error);
      }
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

  override template(): RawHtml {
    if (this.#state.status === 'loading') {
      return html`<p aria-busy="true">Loading workouts…</p>`;
    }

    const { items, total } = this.#state;

    return html`
      <div class="vstack">
        <div class="hstack justify-between gap-2">
          <h1>Workouts</h1>
          <span class="badge outline">${plural(total, 'session')}</span>
        </div>

        ${this.#newWorkoutForm()}

        <div class="vstack gap-2">
          ${
            items.length === 0
              ? html`<p class="empty">No sessions logged yet. Start one above.</p>`
              : items.map(
                  (workout) => html`
                    <article class="card open-card">
                      <div class="grow">
                        <a class="open" href="/workouts/${workout.id}">${workout.title ?? formatDate(workout.performedOn)}</a>
                        <div class="text-light">${formatDate(workout.performedOn)} · ${relativeDay(workout.performedOn)}</div>
                      </div>
                      <span class="badge outline">
                        ${plural(workout.setCount, 'set')} · ${plural(workout.exerciseCount, 'exercise')} · ${formatVolume(workout.totalVolume)}
                      </span>
                      <div class="actions">
                        <button
                          class="outline"
                          data-action="repeat"
                          data-id="${workout.id}"
                          data-title="${workout.title ?? ''}"
                          title="Copy these sets into a new session dated today"
                        >
                          Repeat
                        </button>
                      </div>
                    </article>
                  `,
                )
          }
        </div>

        ${items.length < total ? html` <button class="outline" data-action="load-more">Load ${Math.min(PAGE_SIZE, total - items.length)} more</button> ` : ''}
      </div>
    `;
  }
}

await define('gz-workout-list', GzWorkoutListComponent, import.meta.url);
