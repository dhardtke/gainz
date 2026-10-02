import type { RawHtml } from '../../ui/html.ts';
import { define } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import { formatDate, formatVolume, plural, relativeDay } from '../../ui/format.ts';
import { navigate } from '../../app/router.ts';
import type { ExerciseDto } from '../../../shared/dto/exercise.ts';
import type { WorkoutWithSetsDto } from '../../../shared/dto/workout.ts';
import type { GzAddSetFormComponent } from './internal/gz-add-set-form.component.ts';
import type { GzSetRowComponent } from './internal/gz-set-row.component.ts';
import { toast, toastError } from '../../ui/toast.ts';
import { GzView } from '../../ui/view.ts';
import { exerciseFacade } from '../exercises/exercises.facade.ts';
import { workoutFacade } from './workouts.facade.ts';
import './internal/gz-add-set-form.component.ts';
import './internal/gz-set-row.component.ts';

interface WorkoutDetailData {
  workout: WorkoutWithSetsDto;
  /** Every exercise, for the rows' and the add-set form's selects. */
  exercises: ExerciseDto[];
}

/** The logging screen for one session: edit the header, add sets, see totals. */
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

  override connectedCallback(): void {
    super.connectedCallback();
    this.root.addEventListener('sets-changed', () => {
      void this.reload();
    });
    // Only a set logged through the form puts focus back in it, not a row's "+1" or delete.
    this.root.addEventListener('set-logged', () => {
      void this.reload().then(() => this.$<GzAddSetFormComponent>('gz-add-set-form')?.focusReps());
    });
  }

  override async load(): Promise<WorkoutDetailData> {
    const [workout, { items: exercises }] = await Promise.all([workoutFacade.get(this.numericAttribute('workout-id')), exerciseFacade.list()]);
    return { workout, exercises };
  }

  override async handleAction(action: string): Promise<void> {
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

    for (const row of this.$$<GzSetRowComponent>('gz-set-row')) {
      row.exercises = exercises;
      row.index = Number(row.dataset.index);
      row.set = workout.sets.find((candidate) => candidate.id === Number(row.dataset.id));
    }

    const details = this.$<HTMLFormElement>("form[data-action='save-workout']");
    details?.addEventListener('input', () => {
      this.#edits = this.formData(details);
    });

    const addSet = this.$<GzAddSetFormComponent>('gz-add-set-form');
    if (addSet) {
      addSet.workoutId = workout.id;
      addSet.exercises = exercises;
      addSet.sets = workout.sets;
    }
  }

  #headerTemplate(workout: WorkoutWithSetsDto): RawHtml {
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

  override readyTemplate({ workout }: WorkoutDetailData): RawHtml {
    const sets = workout.sets;
    const volume = sets.reduce((total, set) => total + set.reps * set.weight, 0);
    const reps = sets.reduce((total, set) => total + set.reps, 0);
    const exercises = new Set(sets.map((set) => set.exerciseId)).size;
    const doneCount = sets.filter((set) => set.done).length;

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
              : html` <div class="sets">${sets.map((set, index) => html`<gz-set-row data-id="${set.id}" data-index="${index + 1}"></gz-set-row>`)}</div> `
          }
        </section>

        <gz-add-set-form></gz-add-set-form>
      </div>
    `;
  }
}

await define('gz-workout-detail', GzWorkoutDetailComponent, import.meta.url);
