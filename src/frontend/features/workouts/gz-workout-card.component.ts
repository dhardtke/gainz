import type { RawHtml } from '../../ui/html.ts';
import { define, GzElement } from '../../ui/base.ts';
import { html, raw } from '../../ui/html.ts';
import { formatDate, formatVolume, plural, relativeDay, todayIso } from '../../ui/format.ts';
import { navigate } from '../../app/router.ts';
import type { WorkoutWithStatsDto } from '../../../shared/dto/workout.ts';
import { toast, toastError } from '../../ui/toast.ts';
import { workoutFacade } from './workouts.facade.ts';

/**
 * One workout in a list: a card that opens the session, its totals, and Repeat, which copies its
 * sets into a new session dated today. A done workout's card is green and carries "✓ Done".
 */
export class GzWorkoutCardComponent extends GzElement {
  #workout: WorkoutWithStatsDto | null = null;

  set workout(value: WorkoutWithStatsDto | undefined) {
    this.#workout = value ?? null;
    if (this.isConnected) {
      this.render();
    }
  }

  override async handleAction(action: string): Promise<void> {
    const workout = this.#workout;
    if (action !== 'repeat' || !workout) {
      return;
    }
    try {
      const copy = await workoutFacade.create({ performedOn: todayIso(), title: workout.title, copyFromWorkoutId: workout.id });
      toast(`Copied ${plural(copy.exercises.flatMap((group) => group.sets).length, 'set')} into a new session`, 'success');
      navigate(`/workouts/${copy.id}`);
    } catch (error) {
      toastError(error);
    }
  }

  override template(): RawHtml {
    const workout = this.#workout;
    if (!workout) {
      return raw('');
    }
    return html`
      <article class="card open-card${workout.done ? ' done' : ''}" data-testid="card">
        <div class="head">
          <a class="open" href="/workouts/${workout.id}" data-testid="open">${workout.title ?? formatDate(workout.performedOn)}</a>
          ${workout.done ? html`<span class="badge" data-variant="success" data-testid="done-badge">✓ Done</span>` : ''}
        </div>
        <div class="text-light">${formatDate(workout.performedOn)} · ${relativeDay(workout.performedOn)}</div>
        <div class="foot">
          <span class="text-light" data-testid="totals">
            ${plural(workout.setCount, 'set')} · ${plural(workout.exerciseCount, 'exercise')} · ${formatVolume(workout.totalVolume)}
          </span>
          <div class="actions">
            <button class="outline" data-action="repeat" data-testid="repeat" title="Copy these sets into a new session dated today">Repeat</button>
          </div>
        </div>
      </article>
    `;
  }
}

await define('gz-workout-card', GzWorkoutCardComponent, import.meta.url);
