import type { RawHtml } from '../../../ui/html.ts';
import { define, GzElement } from '../../../ui/base.ts';
import { html } from '../../../ui/html.ts';
import { UNIT } from '../../../ui/format.ts';
import type { ExerciseDto } from '../../../../shared/dto/exercise.ts';
import type { LiftSetDto } from '../../../../shared/dto/set.ts';
import type { ExerciseId, WorkoutId } from '../../../../shared/flavors.ts';
import { toast, toastError } from '../../../ui/toast.ts';
import { exerciseFacade } from '../../exercises/exercises.facade.ts';
import { setFacade } from '../workouts.facade.ts';

/** The select's value for "create an exercise named in the field beside me". */
const NEW_EXERCISE = '__new__';

/**
 * The "Add a set" form of a workout. It starts from the workout's last set — its exercise,
 * weight and reps — creates a new exercise when asked, logs the set, and tells its parent with
 * a `set-logged` event, which reloads and so hands it the sets again.
 */
export class GzAddSetFormComponent extends GzElement {
  #workoutId: WorkoutId | null = null;

  #exercises: ExerciseDto[] = [];

  #sets: LiftSetDto[] | null = null;

  set workoutId(value: WorkoutId) {
    this.#workoutId = value;
  }

  /** Every exercise, for the select. */
  set exercises(value: ExerciseDto[]) {
    this.#exercises = value;
  }

  /** The workout's sets, oldest first. Set it last: it is the one that re-renders. */
  set sets(value: LiftSetDto[]) {
    this.#sets = value;
    if (this.isConnected) {
      this.render();
    }
  }

  focusWeight(): void {
    this.$<HTMLInputElement>("input[name='weight']")?.focus();
  }

  override async handleSubmit(action: string, form: HTMLFormElement): Promise<void> {
    const workoutId = this.#workoutId;
    if (action !== 'add-set' || workoutId === null) {
      return;
    }
    const values = this.formData(form);
    try {
      let exerciseId: string | number = values.exerciseId ?? '';

      if (exerciseId === NEW_EXERCISE) {
        if (!values.newExercise) {
          toast('Give the new exercise a name', 'error');
          return;
        }
        const created = await exerciseFacade.create({ name: values.newExercise });
        exerciseId = created.id;
      }

      await setFacade.create(workoutId, {
        exerciseId: Number(exerciseId),
        reps: Number(values.reps),
        weight: Number(values.weight),
        notes: values.notes,
      });
      this.emit('set-logged');
    } catch (error) {
      toastError(error);
    }
  }

  override afterRender(): void {
    const select = this.$<HTMLSelectElement>("select[name='exerciseId']");
    select?.addEventListener('change', () => {
      this.$('.field-new-exercise')?.toggleAttribute('hidden', select.value !== NEW_EXERCISE);
      this.#prefillFrom(Number(select.value));
    });
  }

  /** Copies the last set of an exercise into the form. */
  #prefillFrom(exerciseId: ExerciseId): void {
    const previous = this.#sets?.filter((set) => set.exerciseId === exerciseId).at(-1);
    if (!previous) {
      return;
    }
    const weight = this.$<HTMLInputElement>("input[name='weight']");
    const reps = this.$<HTMLInputElement>("input[name='reps']");
    if (weight) {
      weight.value = String(previous.weight);
    }
    if (reps) {
      reps.value = String(previous.reps);
    }
  }

  override template(): RawHtml {
    if (!this.#sets) {
      return html``;
    }
    const last = this.#sets.at(-1);
    // With no exercise defined yet, the inline "new exercise" field covers a cold start.
    const selected = last?.exerciseId ?? this.#exercises[0]?.id ?? NEW_EXERCISE;

    return html`
      <section class="vstack gap-2">
        <h2>Add a set</h2>
        <article class="card add-form">
          <form data-action="add-set">
            <div class="fields">
              <div class="field field-exercise">
                <label for="exerciseId">Exercise</label>
                <select id="exerciseId" name="exerciseId">
                  ${this.#exercises.map(
                    (exercise) => html` <option value="${exercise.id}" ${exercise.id === selected ? 'selected' : ''}>${exercise.name}</option> `,
                  )}
                  <option value="${NEW_EXERCISE}" ${selected === NEW_EXERCISE ? 'selected' : ''}>＋ New exercise…</option>
                </select>
              </div>
              <div class="field field-exercise field-new-exercise" ${selected === NEW_EXERCISE ? '' : 'hidden'}>
                <label for="newExercise">New exercise name</label>
                <input id="newExercise" name="newExercise" type="text" maxlength="120" placeholder="Incline Press" />
              </div>
              <div class="field field-num">
                <label for="weight">Weight (${UNIT})</label>
                <input id="weight" name="weight" type="number" step="any" min="0" value="${last?.weight ?? ''}" required />
              </div>
              <div class="field field-num">
                <label for="reps">Reps</label>
                <input id="reps" name="reps" type="number" step="1" min="1" value="${last?.reps ?? ''}" required />
              </div>
              <div class="field field-notes">
                <label for="set-notes">Notes</label>
                <input id="set-notes" name="notes" type="text" maxlength="2000" placeholder="Paused, felt easy" />
              </div>
              <button type="submit">Log set</button>
            </div>
          </form>
        </article>
      </section>
    `;
  }
}

await define('gz-add-set-form', GzAddSetFormComponent, import.meta.url);
