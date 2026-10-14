import type { RawHtml } from '../../ui/html.ts';
import { define } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import { daysBefore, formatVolume, plural, relativeDay, todayIso } from '../../ui/format.ts';
import { navigate } from '../../app/router.ts';
import type { SummaryDto } from '../../../shared/dto/stats.ts';
import type { WorkoutWithStatsDto } from '../../../shared/dto/workout.ts';
import type { WeighInListDto } from '../../../shared/dto/weight.ts';
import type { Iso8601Date } from '../../../shared/flavors.ts';
import { toastError } from '../../ui/toast.ts';
import { GzView } from '../../ui/view.ts';
import { workoutFacade } from '../workouts/workouts.facade.ts';
import type { GzWorkoutCardComponent } from '../workouts/gz-workout-card.component.ts';
import '../workouts/gz-workout-card.component.ts';
import { weighInFacade } from '../weight/weight.facade.ts';
import type { GzWeightTileComponent } from '../weight/gz-weight-tile.component.ts';
import '../weight/gz-weight-tile.component.ts';
import { statsFacade } from './stats.facade.ts';
import { RECENT_DAYS } from './internal/dates.ts';
import '../../ui/tile/gz-tile.component.ts';

interface DashboardData {
  summary: SummaryDto;
  workouts: WorkoutWithStatsDto[];
  // Null when the weigh-ins failed to load; the rest of the dashboard still shows.
  weighIns: WeighInListDto | null;
}

export class GzDashboardComponent extends GzView<DashboardData> {
  override loadingText = 'Loading your log…';

  override async load(): Promise<DashboardData> {
    const today = todayIso();
    const [summary, page, weighIns] = await Promise.all([
      statsFacade.summary(daysBefore(today, RECENT_DAYS)),
      workoutFacade.list({ limit: 5 }),
      this.#loadWeighIns(today),
    ]);
    return { summary, workouts: page.items, weighIns };
  }

  // Both windows of the 30-day change: the 7 days ending today and those ending 30 days ago.
  async #loadWeighIns(today: Iso8601Date): Promise<WeighInListDto | null> {
    try {
      return await weighInFacade.list(daysBefore(today, RECENT_DAYS + 6));
    } catch (error) {
      toastError(error);
      return null;
    }
  }

  override async handleAction(action: string): Promise<void> {
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

  override afterRender(): void {
    const weight = this.$<GzWeightTileComponent>('gz-weight-tile');
    if (weight && this.data) {
      weight.list = this.data.weighIns;
    }
    for (const card of this.$$<GzWorkoutCardComponent>('gz-workout-card')) {
      card.workout = this.data?.workouts.find((workout) => workout.id === Number(card.dataset.id));
    }
  }

  override readyTemplate({ summary, workouts }: DashboardData): RawHtml {
    return html`
      <div class="vstack">
        <div class="hstack justify-between gap-2">
          <hgroup>
            <h1>Dashboard</h1>
            <p class="text-light">
              ${summary.lastPerformedOn ? html`Last session ${relativeDay(summary.lastPerformedOn)}.` : html`Nothing logged yet — time for session one.`}
            </p>
          </hgroup>
          <button data-action="start-workout">Log today's workout</button>
        </div>

        <div class="tiles">
          <gz-tile label="Workouts" value="${summary.workoutCount}" hint="${plural(summary.setCount, 'set')} · ${plural(summary.totalReps, 'rep')}"></gz-tile>
          <gz-tile label="Total volume" value="${formatVolume(summary.totalVolume)}" hint="weighted lifts, all time"></gz-tile>
          <gz-tile label="Last ${RECENT_DAYS} days" value="${summary.workoutsSince}" hint="${formatVolume(summary.volumeSince)} moved"></gz-tile>
          <gz-weight-tile data-testid="weight-tile"></gz-weight-tile>
        </div>

        <section class="vstack gap-2">
          <div class="hstack justify-between gap-2">
            <h2>Recent workouts</h2>
            <a href="/workouts">See all</a>
          </div>
          ${
            workouts.length === 0
              ? html`<p class="empty">No workouts yet. Log one and it will show up here.</p>`
              : workouts.map((workout) => html`<gz-workout-card data-id="${workout.id}"></gz-workout-card>`)
          }
        </section>
      </div>
    `;
  }
}

await define('gz-dashboard', GzDashboardComponent, import.meta.url);
