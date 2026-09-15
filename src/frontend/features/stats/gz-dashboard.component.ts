import { errorMessage } from '../../http/errors.ts';
import type { RawHtml } from '../../ui/html.ts';
import { define, GzElement } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import { formatDate, formatVolume, plural, relativeDay, todayIso } from '../../ui/format.ts';
import { navigate } from '../../app/router.ts';
import type { SummaryDto } from '../../../shared/dto/stats.ts';
import type { WorkoutWithStatsDto } from '../../../shared/dto/workout.ts';
import { toastError } from '../../ui/gz-toast.component.ts';
import { workoutFacade } from '../workouts/workouts.facade.ts';
import { statsFacade } from './stats.facade.ts';
import '../../ui/gz-tile.component.ts';

type DashboardState = { status: 'loading' } | { status: 'ready'; summary: SummaryDto; workouts: WorkoutWithStatsDto[] } | { status: 'error'; message: string };

/** Landing view: the numbers that answer "am I actually progressing?". */
export class GzDashboardComponent extends GzElement {
  #state: DashboardState = { status: 'loading' };

  connectedCallback(): void {
    super.connectedCallback();
    void this.#load();
  }

  async #load(): Promise<void> {
    try {
      const [summary, page] = await Promise.all([statsFacade.summary(), workoutFacade.list({ limit: 5 })]);
      this.#state = { status: 'ready', summary, workouts: page.items };
    } catch (error) {
      this.#state = { status: 'error', message: errorMessage(error) };
      toastError(error);
    }
    this.render();
  }

  async handleAction(action: string): Promise<void> {
    if (action !== 'start-workout') {
      return;
    }
    try {
      const workout = await workoutFacade.create({ performedOn: todayIso() });
      navigate(`/workouts/${workout.id}`);
    } catch (error) {
      toastError(error);
    }
  }

  template(): RawHtml {
    if (this.#state.status === 'loading') {
      return html`<p aria-busy="true">Loading your log…</p>`;
    }
    if (this.#state.status === 'error') {
      return html`<p class="error-text">${this.#state.message}</p>`;
    }

    const { summary, workouts } = this.#state;

    return html`
      <div class="stack">
        <div class="row-between">
          <div>
            <h1>Dashboard</h1>
            <p class="muted">
              ${summary.lastPerformedOn ? html`Last session ${relativeDay(summary.lastPerformedOn)}.` : html`Nothing logged yet — time for session one.`}
            </p>
          </div>
          <button data-action="start-workout">Log today's workout</button>
        </div>

        <div class="tiles">
          <gz-tile label="Workouts" value="${summary.workoutCount}" hint="${plural(summary.setCount, 'set')} total"></gz-tile>
          <gz-tile label="Total volume" value="${formatVolume(summary.totalVolume)}" hint="reps × weight, all time"></gz-tile>
          <gz-tile label="Last 30 days" value="${summary.workoutsLast30Days}" hint="${formatVolume(summary.volumeLast30Days)} moved"></gz-tile>
          <gz-tile label="Exercises" value="${summary.exerciseCount}" hint="${plural(summary.totalReps, 'rep')} lifted"></gz-tile>
        </div>

        <article class="stack-sm">
          <div class="row-between">
            <h2>Recent workouts</h2>
            <a href="/workouts">See all</a>
          </div>
          ${
            workouts.length === 0
              ? html`<p class="empty">No workouts yet. Log one and it will show up here.</p>`
              : workouts.map(
                  (workout) => html`
                    <a class="workout-link" href="/workouts/${workout.id}">
                      <span class="grow">
                        <span class="title">${workout.title ?? formatDate(workout.performedOn)}</span>
                        <span class="muted"> · ${relativeDay(workout.performedOn)}</span>
                      </span>
                      <span class="badge">${plural(workout.setCount, 'set')} · ${formatVolume(workout.totalVolume)}</span>
                    </a>
                  `,
                )
          }
        </article>
      </div>
    `;
  }
}

await define('gz-dashboard', GzDashboardComponent, import.meta.url);
