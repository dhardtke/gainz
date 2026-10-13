import type { RawHtml } from '../../ui/html.ts';
import { define } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import { todayIso } from '../../ui/format.ts';
import { toastError } from '../../ui/toast.ts';
import { errorMessage } from '../../http/errors.ts';
import type { CalendarMonthDto, RecentExerciseDto } from '../../../shared/dto/stats.ts';
import type { Iso8601Date, Iso8601Month } from '../../../shared/flavors.ts';
import { GzView } from '../../ui/view.ts';
import { statsFacade } from './stats.facade.ts';
import { parseMonth } from './internal/month.ts';
import { daysBefore, RECENT_DAYS } from './internal/dates.ts';
import type { GzCalendarComponent } from './internal/gz-calendar.component.ts';
import type { GzExerciseProgressComponent } from './internal/gz-exercise-progress.component.ts';
import './internal/gz-calendar.component.ts';
import './internal/gz-exercise-progress.component.ts';

type RecentResult = { status: 'ready'; exercises: RecentExerciseDto[] } | { status: 'error'; message: string };

interface StatsData {
  month: Iso8601Month;
  today: Iso8601Date;
  calendar: CalendarMonthDto;
  recent: RecentResult;
}

export class GzStatsComponent extends GzView<StatsData> {
  override loadingText = 'Loading your statistics…';

  #monthToken = 0;

  override connectedCallback(): void {
    super.connectedCallback();
    this.root.addEventListener('month-change', (event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        void this.#showMonth(event.detail);
      }
    });
  }

  override async load(): Promise<StatsData> {
    const today = todayIso();
    const month = parseMonth(location.search, today);
    const [calendar, recent] = await Promise.all([statsFacade.calendar(month), this.#loadRecent(today)]);
    return { month, today, calendar, recent };
  }

  async #loadRecent(today: Iso8601Date): Promise<RecentResult> {
    try {
      const { exercises } = await statsFacade.recentExercises(daysBefore(today, RECENT_DAYS));
      return { status: 'ready', exercises };
    } catch (error) {
      toastError(error);
      return { status: 'error', message: errorMessage(error) };
    }
  }

  // In place rather than navigate(), which would remount the page and refetch the month-independent section.
  async #showMonth(month: Iso8601Month): Promise<void> {
    const token = ++this.#monthToken;
    let calendar: CalendarMonthDto;
    try {
      calendar = await statsFacade.calendar(month);
    } catch (error) {
      toastError(error);
      return;
    }
    if (token !== this.#monthToken || !this.data) {
      return;
    }
    history.pushState(null, '', `/stats?month=${month}`);
    this.show({ ...this.data, month, calendar });
  }

  override afterRender(): void {
    const calendar = this.$<GzCalendarComponent>('gz-calendar');
    if (calendar && this.data) {
      calendar.today = this.data.today;
      calendar.month = this.data.month;
      calendar.days = this.data.calendar.days;
    }
    const progress = this.$<GzExerciseProgressComponent>('gz-exercise-progress');
    if (progress && this.data?.recent.status === 'ready') {
      progress.exercises = this.data.recent.exercises;
    }
  }

  override readyTemplate(data: StatsData): RawHtml {
    const progress =
      data.recent.status === 'ready'
        ? html`<gz-exercise-progress data-testid="progress"></gz-exercise-progress>`
        : html`<p class="error-text" data-testid="progress-error">${data.recent.message}</p>`;
    return html`
      <div class="vstack">
        <hgroup>
          <h1>Statistics</h1>
          <p class="text-light">Your training month by month.</p>
        </hgroup>
        <gz-calendar data-testid="calendar"></gz-calendar>
        ${progress}
      </div>
    `;
  }
}

await define('gz-stats', GzStatsComponent, import.meta.url);
