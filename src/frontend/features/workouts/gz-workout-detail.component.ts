import type { RawHtml } from '../../ui/html.ts';
import { define } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import { formatDate, formatVolume, plural, relativeDay } from '../../ui/format.ts';
import { navigate } from '../../app/router.ts';
import type { ExerciseDto } from '../../../shared/dto/exercise.ts';
import type { MoveDirection, WorkoutExerciseDto, WorkoutWithExercisesDto } from '../../../shared/dto/workout.ts';
import type { ExerciseId } from '../../../shared/flavors.ts';
import type { GzAddSetFormComponent } from './internal/gz-add-set-form.component.ts';
import type { GzSetRowComponent } from './internal/gz-set-row.component.ts';
import { toast, toastError } from '../../ui/toast.ts';
import { GzView } from '../../ui/view.ts';
import { exerciseFacade } from '../exercises/exercises.facade.ts';
import { workoutFacade } from './workouts.facade.ts';
import './internal/gz-add-set-form.component.ts';
import './internal/gz-set-row.component.ts';

/** `CustomEvent.detail` is `any`, so the `set-logged` detail the form emits is checked rather than trusted. */
function isSetLogged(detail: unknown): detail is { exerciseId: number } {
  return typeof detail === 'object' && detail !== null && 'exerciseId' in detail && typeof detail.exerciseId === 'number';
}

interface WorkoutDetailData {
  workout: WorkoutWithExercisesDto;
  /** Every exercise, for the add-set form's select. */
  exercises: ExerciseDto[];
}

/**
 * The logging screen for one session: edit the header, add sets, see totals. The sets are grouped
 * by exercise in Oat's accordion, one exercise open at a time.
 */
export class GzWorkoutDetailComponent extends GzView<WorkoutDetailData> {
  override loadingText = 'Loading workout…';

  override backLink = { href: '/workouts', label: 'Back to all workouts' };

  /**
   * What has been typed into the details form but not saved.
   *
   * The form is always on screen and every logged set re-renders the view, so
   * the template — not the DOM — has to own these values. `null` means "show
   * what the server returned", which is also what a successful save restores.
   */
  #edits: Record<string, string> | null = null;

  /**
   * The exercise whose group is open, `null` for all collapsed, and `undefined` until the first
   * load has decided. Every reload re-renders the accordion, so, like `#edits`, the view rather than
   * the DOM has to remember it.
   */
  #openExerciseId: ExerciseId | null | undefined = undefined;

  override connectedCallback(): void {
    super.connectedCallback();
    this.root.addEventListener('sets-changed', () => {
      void this.reload();
    });
    // Only a set logged through the form puts focus back in it, not a row's "+1" or delete.
    this.root.addEventListener('set-logged', (event) => {
      if (event instanceof CustomEvent && isSetLogged(event.detail)) {
        this.#openExerciseId = event.detail.exerciseId;
      }
      void this.reload().then(() => this.$<GzAddSetFormComponent>('gz-add-set-form')?.focusReps());
    });
  }

  override async load(): Promise<WorkoutDetailData> {
    const [workout, { items: exercises }] = await Promise.all([workoutFacade.get(this.numericAttribute('workout-id')), exerciseFacade.list()]);
    return { workout, exercises };
  }

  override async handleAction(action: string, element: HTMLElement): Promise<void> {
    if (action === 'move-exercise-up' || action === 'move-exercise-down') {
      const exerciseId = Number(element.dataset.exerciseId);
      const direction = action === 'move-exercise-up' ? 'up' : 'down';
      try {
        await workoutFacade.moveExercise(this.numericAttribute('workout-id'), exerciseId, direction);
      } catch (error) {
        toastError(error);
        return;
      }
      await this.reload();
      this.#focusMove(exerciseId, direction);
      return;
    }

    if (action !== 'delete-workout' || !confirm('Delete this workout and all of its sets? This cannot be undone.')) {
      return;
    }
    try {
      await workoutFacade.delete(this.numericAttribute('workout-id'));
      toast('Workout deleted', 'success');
      navigate('/workouts');
    } catch (error) {
      toastError(error);
    }
  }

  /**
   * A move re-renders every group, so focus goes back to the moved exercise's arrow for the next
   * press, or to the other one once the exercise has reached that edge.
   */
  #focusMove(exerciseId: ExerciseId, direction: MoveDirection): void {
    const arrow = (to: MoveDirection): HTMLButtonElement | null =>
      this.$<HTMLButtonElement>(`[data-action='move-exercise-${to}'][data-exercise-id='${exerciseId}']`);
    const moved = arrow(direction);
    (moved?.disabled === false ? moved : arrow(direction === 'up' ? 'down' : 'up'))?.focus();
  }

  override async handleSubmit(action: string, form: HTMLFormElement): Promise<void> {
    if (action !== 'save-workout') {
      return;
    }
    const { performedOn, title, notes } = this.formData(form);
    try {
      await workoutFacade.update(this.numericAttribute('workout-id'), { performedOn, title, notes });
      this.#edits = null;
      toast('Workout updated', 'success');
      await this.reload();
    } catch (error) {
      toastError(error);
    }
  }

  override afterRender(): void {
    if (!this.data) {
      return;
    }
    const { workout, exercises } = this.data;
    const sets = workout.exercises.flatMap((group) => group.sets);

    for (const row of this.$$<GzSetRowComponent>('gz-set-row')) {
      row.index = Number(row.dataset.index);
      row.set = sets.find((candidate) => candidate.id === Number(row.dataset.id));
    }

    for (const group of this.$$<HTMLDetailsElement>("details[name='exercises']")) {
      const id = Number(group.dataset.exerciseId);
      // `toggle` does not bubble, so each group gets its own listener. Opening one closes the
      // other, whose toggle comes second and so does not clear the id just recorded.
      group.addEventListener('toggle', () => {
        if (group.open) {
          this.#openExerciseId = id;
        } else if (this.#openExerciseId === id) {
          this.#openExerciseId = null;
        }
      });
    }

    // A click between or on a disabled header button would toggle the group; a link is spared,
    // because gz-app skips a default-prevented click and would no longer route it.
    for (const actions of this.$$('summary .actions')) {
      actions.addEventListener('click', (event) => {
        if (!event.composedPath().some((target) => target instanceof HTMLAnchorElement)) {
          event.preventDefault();
        }
      });
    }

    const details = this.$<HTMLFormElement>("form[data-action='save-workout']");
    details?.addEventListener('input', () => {
      this.#edits = this.formData(details);
    });

    const addSet = this.$<GzAddSetFormComponent>('gz-add-set-form');
    if (addSet) {
      addSet.workoutId = workout.id;
      addSet.exercises = exercises;
      // Back in logged order: the form starts from the last set it is given, which in group order
      // would be the last exercise's rather than the last one logged.
      addSet.sets = sets.toSorted((a, b) => a.position - b.position || a.id - b.id);
    }
  }

  /**
   * Which group to open. The first load opens the exercise of the first set not done, otherwise
   * the last exercise; after that the remembered one stays open, unless it has lost its last set.
   */
  #openFor(exercises: WorkoutExerciseDto[]): ExerciseId | null {
    if (this.#openExerciseId === undefined) {
      const next = exercises.find((group) => group.sets.some((set) => !set.done)) ?? exercises.at(-1);
      this.#openExerciseId = next?.exerciseId ?? null;
    } else if (this.#openExerciseId !== null && !exercises.some((group) => group.exerciseId === this.#openExerciseId)) {
      this.#openExerciseId = null;
    }
    return this.#openExerciseId;
  }

  #headerTemplate(workout: WorkoutWithExercisesDto): RawHtml {
    const edits = this.#edits ?? {
      performedOn: workout.performedOn,
      title: workout.title ?? '',
      notes: workout.notes ?? '',
    };

    return html`
      <div class="hstack justify-between gap-2">
        <hgroup>
          <h1>${workout.title ?? formatDate(workout.performedOn)}</h1>
          <p class="text-light">${formatDate(workout.performedOn)} · ${relativeDay(workout.performedOn)}</p>
        </hgroup>
        <button data-variant="danger" data-action="delete-workout">Delete</button>
      </div>
      <article class="card">
        <form class="vstack gap-2" data-action="save-workout">
          <div class="fields">
            <div class="field">
              <label for="performedOn">Date</label>
              <input id="performedOn" name="performedOn" type="date" value="${edits.performedOn}" required />
            </div>
            <div class="field grow">
              <label for="title">Title</label>
              <input id="title" name="title" type="text" maxlength="120" value="${edits.title}" />
            </div>
          </div>
          <div class="field">
            <label for="notes">Session notes</label>
            <textarea id="notes" name="notes" maxlength="2000" placeholder="How did it feel?">${edits.notes}</textarea>
          </div>
          <div class="hstack gap-2">
            <button type="submit">Save</button>
          </div>
        </form>
      </article>
    `;
  }

  /** Progress through the session's sets, or nothing for a session without any. */
  #doneBadge(done: boolean, doneCount: number, setCount: number): RawHtml {
    if (setCount === 0) {
      return html``;
    }
    if (done) {
      return html`<span class="badge" data-variant="success">✓ Done</span>`;
    }
    return html`<span class="badge outline">${doneCount}/${setCount} done</span>`;
  }

  /** "3 sets · 2/3 done · 1,200 kg", or "✓ Done" in the middle once every set of the group is. */
  #groupSummary(group: WorkoutExerciseDto): string {
    const count = group.sets.length;
    const doneCount = group.sets.filter((set) => set.done).length;
    const volume = group.sets.reduce((total, set) => total + set.reps * set.weight, 0);
    const progress = doneCount === count ? '✓ Done' : `${doneCount}/${count} done`;
    return `${plural(count, 'set')} · ${progress} · ${formatVolume(volume)}`;
  }

  #groupTemplate(group: WorkoutExerciseDto, open: ExerciseId | null, first: boolean, last: boolean): RawHtml {
    const { exerciseId: id, exerciseName: name } = group;
    return html`
      <details name="exercises" data-exercise-id="${id}" ${id === open ? 'open' : ''}>
        <summary>
          <span class="exercise-name">${name}</span>
          <span class="badge outline">${this.#groupSummary(group)}</span>
          <span class="actions">
            <fieldset class="group move">
              <button class="outline" data-action="move-exercise-up" data-exercise-id="${id}" aria-label="Move ${name} up" ${first ? 'disabled' : ''}>▲</button>
              <button class="outline" data-action="move-exercise-down" data-exercise-id="${id}" aria-label="Move ${name} down" ${last ? 'disabled' : ''}>
                ▼
              </button>
            </fieldset>
            <a class="button outline" href="/exercises/${id}">Exercise</a>
          </span>
        </summary>
        <div class="sets">${group.sets.map((set, index) => html`<gz-set-row data-id="${set.id}" data-index="${index + 1}"></gz-set-row>`)}</div>
      </details>
    `;
  }

  override readyTemplate({ workout }: WorkoutDetailData): RawHtml {
    const sets = workout.exercises.flatMap((group) => group.sets);
    const volume = sets.reduce((total, set) => total + set.reps * set.weight, 0);
    const reps = sets.reduce((total, set) => total + set.reps, 0);
    const exercises = new Set(sets.map((set) => set.exerciseId)).size;
    const doneCount = sets.filter((set) => set.done).length;
    const open = this.#openFor(workout.exercises);

    return html`
      <div class="vstack">
        ${this.#headerTemplate(workout)}

        <div class="totals">
          <span class="badge outline">${plural(sets.length, 'set')}</span>
          <span class="badge outline">${plural(exercises, 'exercise')}</span>
          <span class="badge outline">${plural(reps, 'rep')}</span>
          <span class="badge outline">${formatVolume(volume)} total volume</span>
          ${this.#doneBadge(workout.done, doneCount, sets.length)}
        </div>

        <section class="vstack gap-2">
          <h2>Sets</h2>
          ${
            sets.length === 0
              ? html`<p class="empty">No sets logged for this session yet.</p>`
              : html`<div class="exercises">
                  ${workout.exercises.map((group, index, all) => this.#groupTemplate(group, open, index === 0, index === all.length - 1))}
                </div>`
          }
        </section>

        <gz-add-set-form></gz-add-set-form>
      </div>
    `;
  }
}

await define('gz-workout-detail', GzWorkoutDetailComponent, import.meta.url);
