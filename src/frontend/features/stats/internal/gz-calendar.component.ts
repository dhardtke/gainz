import type { RawHtml } from '../../../ui/html.ts';
import { define, GzElement } from '../../../ui/base.ts';
import { html, raw } from '../../../ui/html.ts';
import { formatPercent, formatShortDate, plural } from '../../../ui/format.ts';
import type { CalendarDayDto, CalendarWorkoutDto } from '../../../../shared/dto/stats.ts';
import type { Iso8601Date, Iso8601Month } from '../../../../shared/flavors.ts';
import { formatMonth, monthGrid, shiftMonth } from './month.ts';
import { LEVELS, PROGRESSION_LEVELS, progressionLevel } from './progression.ts';
import type { ProgressionLevel } from './progression.ts';
import './gz-progress-marker.component.ts';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function marker(level: ProgressionLevel): RawHtml {
  return html`<gz-progress-marker level="${level}"></gz-progress-marker>`;
}

function dayLabel(day: CalendarDayDto): string {
  const value = day.progression === null ? 'nothing to compare' : `${formatPercent(day.progression)} across ${plural(day.comparedExerciseCount, 'exercise')}`;
  const workouts = day.workouts.length > 1 ? `, ${plural(day.workouts.length, 'workout')}` : '';
  return `${formatShortDate(day.date)}: ${value}${workouts}`;
}

// Emits `month-change` rather than navigating: internal/ components leave routing to their page.
export class GzCalendarComponent extends GzElement {
  #month: Iso8601Month = '';
  #days: CalendarDayDto[] = [];
  #today: Iso8601Date = '';

  set month(value: Iso8601Month) {
    this.#month = value;
    this.#rerender();
  }

  get month(): Iso8601Month {
    return this.#month;
  }

  set days(value: CalendarDayDto[]) {
    this.#days = value;
    this.#rerender();
  }

  set today(value: Iso8601Date) {
    this.#today = value;
    this.#rerender();
  }

  #rerender(): void {
    if (this.isConnected) {
      this.render();
    }
  }

  override handleAction(action: string, element: HTMLElement): void {
    if (action === 'month' && element.dataset.month) {
      this.emit('month-change', element.dataset.month);
    }
  }

  #workoutItem(workout: CalendarWorkoutDto): RawHtml {
    return html`
      <a role="menuitem" href="/workouts/${workout.id}" data-testid="day-workout">
        ${marker(progressionLevel(workout.progression))}
        <span class="grow">${workout.title ?? 'Workout'}</span>
        <span class="percent">${workout.progression === null ? '' : formatPercent(workout.progression)}</span>
      </a>
    `;
  }

  #tile(date: Iso8601Date): RawHtml {
    const day = this.#days.find((candidate) => candidate.date === date);
    const number = html`<span class="number">${Number(date.slice(8))}</span>`;
    const current = raw(date === this.#today ? 'aria-current="date"' : '');
    if (!day) {
      return html`<span class="day" ${current} data-date="${date}">${number}</span>`;
    }
    const level = progressionLevel(day.progression);
    const label = dayLabel(day);
    const [only] = day.workouts;
    if (day.workouts.length === 1 && only) {
      return html`
        <a class="day worked" href="/workouts/${only.id}" title="${label}" aria-label="${label}" ${current} data-date="${date}" data-level="${level}">
          ${number}${marker(level)}
        </a>
      `;
    }
    return html`
      <ot-dropdown class="day-menu">
        <button
          type="button"
          class="ghost day worked"
          popovertarget="day-${date}"
          title="${label}"
          aria-label="${label}"
          ${current}
          data-date="${date}"
          data-level="${level}"
        >
          ${number}<span class="marker-count">${marker(level)}<sup data-testid="count">${day.workouts.length}</sup></span>
        </button>
        <menu popover id="day-${date}">${day.workouts.map((workout) => this.#workoutItem(workout))}</menu>
      </ot-dropdown>
    `;
  }

  override template(): RawHtml {
    if (this.#month === '') {
      return html``;
    }
    const isLatest = this.#month >= this.#today.slice(0, 7);
    return html`
      <div class="card vstack gap-2">
        <div class="hstack justify-between gap-2">
          <button
            type="button"
            class="outline icon"
            data-action="month"
            data-month="${shiftMonth(this.#month, -1)}"
            aria-label="Previous month"
            data-testid="previous"
          >
            ‹
          </button>
          <h2 data-testid="label">${formatMonth(this.#month)}</h2>
          <button
            type="button"
            class="outline icon"
            data-action="month"
            data-month="${shiftMonth(this.#month, 1)}"
            aria-label="Next month"
            data-testid="next"
            ${isLatest ? 'disabled' : ''}
          >
            ›
          </button>
        </div>
        <div class="grid" data-testid="grid">
          ${WEEKDAYS.map((weekday) => html`<span class="weekday">${weekday}</span>`)}
          ${monthGrid(this.#month).map((date) => (date === null ? html`<span class="blank"></span>` : this.#tile(date)))}
        </div>
        <ul class="legend unstyled" data-testid="legend">
          ${PROGRESSION_LEVELS.map((level) => html`<li>${marker(level)}${LEVELS[level].label}</li>`)}
        </ul>
      </div>
    `;
  }
}

await define('gz-calendar', GzCalendarComponent, import.meta.url);
