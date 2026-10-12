import type { RawHtml } from '../../ui/html.ts';
import { define } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import { todayIso } from '../../ui/format.ts';
import { navigate } from '../../app/router.ts';
import type { CalendarMonthDto, RecentExercisesDto } from '../../../shared/dto/stats.ts';
import type { Iso8601Date, Iso8601Month } from '../../../shared/flavors.ts';
import { GzView } from '../../ui/view.ts';
import { statsFacade } from './stats.facade.ts';
import { parseMonth } from './internal/month.ts';
import { daysBefore, RECENT_DAYS } from './internal/dates.ts';
import type { GzCalendarComponent } from './internal/gz-calendar.component.ts';
import type { GzExerciseProgressComponent } from './internal/gz-exercise-progress.component.ts';
import './internal/gz-calendar.component.ts';
import './internal/gz-exercise-progress.component.ts';

interface StatsData {
  month: Iso8601Month;
  today: Iso8601Date;
  calendar: CalendarMonthDto;
  recent: RecentExercisesDto;
}

export class GzStatsComponent extends GzView<StatsData> {
  override loadingText = 'Loading your statistics…';

  override connectedCallback(): void {
    super.connectedCallback();
    this.root.addEventListener('month-change', (event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        navigate(`/stats?month=${event.detail}`);
      }
    });
  }

  override async load(): Promise<StatsData> {
    const today = todayIso();
    const month = parseMonth(location.search, today);
    const [calendar, recent] = await Promise.all([statsFacade.calendar(month), statsFacade.recentExercises(daysBefore(today, RECENT_DAYS))]);
    return { month, today, calendar, recent };
  }

  override afterRender(): void {
    const calendar = this.$<GzCalendarComponent>('gz-calendar');
    if (calendar && this.data) {
      calendar.today = this.data.today;
      calendar.month = this.data.month;
      calendar.days = this.data.calendar.days;
    }
    const progress = this.$<GzExerciseProgressComponent>('gz-exercise-progress');
    if (progress && this.data) {
      progress.exercises = this.data.recent.exercises;
    }
  }

  override readyTemplate(): RawHtml {
    return html`
      <div class="vstack">
        <hgroup>
          <h1>Statistics</h1>
          <p class="text-light">Your training month by month.</p>
        </hgroup>
        <gz-calendar data-testid="calendar"></gz-calendar>
        <gz-exercise-progress data-testid="progress"></gz-exercise-progress>
      </div>
    `;
  }
}

await define('gz-stats', GzStatsComponent, import.meta.url);
