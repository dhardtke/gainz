import { api } from '../../api.ts';
import type { RawHtml } from '../../base.ts';
import { define, GzElement, html } from '../../base.ts';
import { formatNumber, formatVolume, UNIT } from '../../format.ts';
import type { ExerciseDto, LiftSetDto } from '../../../shared/dto/index.ts';
import { toast, toastError } from '../gz-toast/gz-toast.ts';

/**
 * One logged set. Reads in place, edits in place, and tells its parent to
 * reload with a `sets-changed` event rather than trying to patch the list.
 */
export class GzSetRow extends GzElement {
  #editing = false;

  #set: LiftSetDto | null = null;

  #exercises: ExerciseDto[] = [];

  #index = 0;

  set set(value: LiftSetDto | undefined) {
    this.#set = value ?? null;
    if (this.isConnected) {
      this.render();
    }
  }

  set exercises(value: ExerciseDto[] | null | undefined) {
    this.#exercises = value ?? [];
  }

  set index(value: number) {
    // The parent reads this off a data attribute, so a NaN is a real possibility.
    this.#index = Number.isFinite(value) ? value : 0;
  }

  async handleAction(action: string): Promise<void> {
    if (action === 'edit') {
      this.#editing = true;
      this.render();
      const weight = this.$<HTMLInputElement>("[name='weight']");
      weight?.focus();
      return;
    }

    if (action === 'cancel') {
      this.#editing = false;
      this.render();
      return;
    }

    const set = this.#set;
    if (!set) {
      return;
    }

    if (action === 'duplicate') {
      try {
        await api.workouts.addSet(set.workoutId, {
          exerciseId: set.exerciseId,
          reps: set.reps,
          weight: set.weight,
          notes: set.notes,
        });
        this.emit('sets-changed');
      } catch (error) {
        toastError(error);
      }
      return;
    }

    if (action === 'delete') {
      if (!confirm(`Delete this set (${formatNumber(set.weight)} ${UNIT} × ${set.reps})?`)) {
        return;
      }
      try {
        await api.sets.remove(set.id);
        toast('Set deleted', 'success');
        this.emit('sets-changed');
      } catch (error) {
        toastError(error);
      }
    }
  }

  async handleSubmit(action: string, form: HTMLFormElement): Promise<void> {
    if (action !== 'save' || !this.#set) {
      return;
    }
    const values = this.formData(form);
    try {
      await api.sets.update(this.#set.id, {
        exerciseId: Number(values.exerciseId),
        reps: Number(values.reps),
        weight: Number(values.weight),
        notes: values.notes,
      });
      this.#editing = false;
      this.emit('sets-changed');
    } catch (error) {
      toastError(error);
    }
  }

  #editTemplate(set: LiftSetDto): RawHtml {
    return html`
      <form class="edit fields" data-action="save">
        <div class="field field-exercise">
          <label>Exercise</label>
          <select name="exerciseId">
            ${this.#exercises.map(
              (exercise) => html` <option value="${exercise.id}" ${exercise.id === set.exerciseId ? 'selected' : ''}>${exercise.name}</option> `,
            )}
          </select>
        </div>
        <div class="field field-num">
          <label>Weight (${UNIT})</label>
          <input name="weight" type="number" step="0.25" min="0" value="${set.weight}" required />
        </div>
        <div class="field field-num">
          <label>Reps</label>
          <input name="reps" type="number" step="1" min="1" value="${set.reps}" required />
        </div>
        <div class="field field-notes">
          <label>Notes</label>
          <input name="notes" type="text" maxlength="2000" value="${set.notes ?? ''}" />
        </div>
        <button type="submit">Save</button>
        <button class="secondary outline" type="button" data-action="cancel">Cancel</button>
      </form>
    `;
  }

  template(): RawHtml {
    const set = this.#set;
    if (!set) {
      return html``;
    }
    if (this.#editing) {
      return this.#editTemplate(set);
    }

    return html`
      <div class="row-view">
        <span class="index">${this.#index}</span>
        <a class="exercise" href="#/exercises/${set.exerciseId}">${set.exerciseName}</a>
        <span class="load">${formatNumber(set.weight)} ${UNIT} × ${set.reps}</span>
        <span class="note">${set.notes ?? ''}</span>
        <span class="actions">
          <span class="volume mono">${formatVolume(set.weight * set.reps)}</span>
          <button class="secondary outline compact" data-action="edit">Edit</button>
          <button class="secondary outline compact" data-action="duplicate" title="Log another set just like this one">+1</button>
          <button class="danger compact" data-action="delete" aria-label="Delete set">×</button>
        </span>
      </div>
    `;
  }
}

await define('gz-set-row', GzSetRow);
