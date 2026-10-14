import type { RawHtml } from '../../../ui/html.ts';
import { define, GzElement } from '../../../ui/base.ts';
import { html } from '../../../ui/html.ts';
import { formatPercent, formatShortDate, formatVolume, plural } from '../../../ui/format.ts';
import type { RecentExerciseDto, RecentSessionDto } from '../../../../shared/dto/stats.ts';
import { progressionLevel } from './progression.ts';
import { RECENT_DAYS } from './dates.ts';
import './gz-progress-marker.component.ts';

function change(progression: number | null, context: string): RawHtml {
  const label = progression === null ? 'nothing to compare' : `${formatPercent(progression)} ${context}`;
  return html`
    <span class="change" role="img" title="${label}" aria-label="${label}" data-testid="change">
      <gz-progress-marker level="${progressionLevel(progression)}"></gz-progress-marker>
      <span class="percent">${progression === null ? '' : formatPercent(progression)}</span>
    </span>
  `;
}

export class GzExerciseProgressComponent extends GzElement {
  #exercises: RecentExerciseDto[] = [];

  set exercises(value: RecentExerciseDto[]) {
    this.#exercises = value;
    if (this.isConnected) {
      this.render();
    }
  }

  #value({ kind }: RecentExerciseDto, session: RecentSessionDto): string {
    if (kind === 'bodyweight') {
      return plural(session.reps, 'rep');
    }
    if (kind === 'assisted') {
      return session.effectiveVolume === null ? '–' : formatVolume(session.effectiveVolume);
    }
    return formatVolume(session.volume);
  }

  #session(exercise: RecentExerciseDto, session: RecentSessionDto): RawHtml {
    const value = this.#value(exercise, session);
    return html`
      <li data-testid="session">
        <a class="date" href="/workouts/${session.workoutId}">${formatShortDate(session.performedOn)}</a>
        <span class="value">${value}</span>
        ${change(session.progression, 'against the session before')}
      </li>
    `;
  }

  #card(exercise: RecentExerciseDto): RawHtml {
    const since = exercise.progressionSince === null ? '' : `since ${formatShortDate(exercise.progressionSince)}`;
    return html`
      <article class="card vstack gap-2" data-testid="exercise" data-id="${exercise.id}">
        <header class="hstack justify-between gap-2">
          <a href="/exercises/${exercise.id}" data-testid="name">${exercise.name}</a>
          ${change(exercise.progression, since)}
        </header>
        <ol class="sessions unstyled">
          ${exercise.sessions.map((session) => this.#session(exercise, session))}
        </ol>
      </article>
    `;
  }

  override template(): RawHtml {
    const body =
      this.#exercises.length === 0
        ? html`<p class="empty" data-testid="empty">No exercises in the last ${RECENT_DAYS} days.</p>`
        : html`<div class="cards">${this.#exercises.map((exercise) => this.#card(exercise))}</div>`;
    return html`
      <section class="vstack gap-2">
        <h2>Progress · last ${RECENT_DAYS} days</h2>
        ${body}
      </section>
    `;
  }
}

await define('gz-exercise-progress', GzExerciseProgressComponent, import.meta.url);
