import type { RawHtml } from '../../../ui/html.ts';
import { define, GzElement } from '../../../ui/base.ts';
import { html } from '../../../ui/html.ts';
import { UNIT } from '../../../ui/format.ts';
import type { ExerciseDto } from '../../../../shared/dto/exercise.ts';
import type { LiftSetDto } from '../../../../shared/dto/set.ts';
import type { ExerciseId, WorkoutId } from '../../../../shared/flavors.ts';
import { toastError } from '../../../ui/toast.ts';
import { setFacade } from '../workouts.facade.ts';

export class GzAddSetFormComponent extends GzElement {
  #workoutId: WorkoutId | null = null;

  #exercises: ExerciseDto[] = [];

  #sets: LiftSetDto[] | null = null;

  set workoutId(value: WorkoutId) {
    this.#workoutId = value;
  }

  set exercises(value: ExerciseDto[]) {
    this.#exercises = value;
  }

  // Set it last: assigning it re-renders.
  set sets(value: LiftSetDto[]) {
    this.#sets = value;
    if (this.isConnected) {
      this.render();
    }
  }

  focusReps(): void {
    this.$<HTMLInputElement>("input[name='reps']")?.focus();
  }

  override async handleSubmit(action: string, form: HTMLFormElement): Promise<void> {
    const workoutId = this.#workoutId;
    if (action !== 'add-set' || workoutId === null) {
      return;
    }
    const values = this.formData(form);
    try {
      const exerciseId = Number(values.exerciseId);
      await setFacade.create(workoutId, {
        exerciseId,
        reps: Number(values.reps),
        weight: Number(values.weight),
        notes: values.notes,
      });
      this.emit('set-logged', { exerciseId });
    } catch (error) {
      toastError(error);
    }
  }

  override afterRender(): void {
    const select = this.$<HTMLSelectElement>("select[name='exerciseId']");
    select?.addEventListener('change', () => {
      this.#prefillFrom(Number(select.value));
    });
  }

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
    if (this.#exercises.length === 0) {
      return html`
        <section class="vstack gap-2">
          <h2>Add a set</h2>
          <p class="empty">No exercises yet. <a href="/exercises" data-testid="exercises-link">Add the lifts you train</a> to log sets against them.</p>
        </section>
      `;
    }
    const last = this.#sets.at(-1);
    const selected = last?.exerciseId ?? this.#exercises[0]?.id;

    return html`
      <section class="vstack gap-2">
        <h2>Add a set</h2>
        <article class="card add-form">
          <form data-action="add-set" data-testid="form">
            <div class="fields">
              <div class="field field-exercise">
                <label for="exerciseId">Exercise</label>
                <select id="exerciseId" name="exerciseId" data-testid="exercise">
                  ${this.#exercises.map(
                    (exercise) => html` <option value="${exercise.id}" ${exercise.id === selected ? 'selected' : ''}>${exercise.name}</option> `,
                  )}
                </select>
              </div>
              <div class="field field-num">
                <label for="reps">Reps</label>
                <input id="reps" name="reps" type="number" step="1" min="1" value="${last?.reps ?? ''}" required data-testid="reps" />
              </div>
              <div class="field field-num">
                <label for="weight">Weight (${UNIT})</label>
                <input id="weight" name="weight" type="number" step="any" min="0" value="${last?.weight ?? ''}" required data-testid="weight" />
              </div>
              <div class="field field-notes">
                <label for="set-notes">Notes</label>
                <input id="set-notes" name="notes" type="text" maxlength="2000" placeholder="Paused, felt easy" data-testid="notes" />
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
