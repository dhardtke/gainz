import { api } from "../../js/api.js";
import { define, GzElement, html } from "../../js/base.js";
import { formatNumber, formatVolume, UNIT } from "../../js/format.js";
import { toast, toastError } from "../gz-toast/gz-toast.js";

/** @import { Exercise, LiftSet } from "../../js/types.js" */

/**
 * One logged set. Reads in place, edits in place, and tells its parent to
 * reload with a `sets-changed` event rather than trying to patch the list.
 */
export class GzSetRow extends GzElement {
  #editing = false;

  /** @type {LiftSet | null} */
  #set = null;

  /** @type {Exercise[]} */
  #exercises = [];

  #index = 0;

  /** @param {LiftSet | undefined} value */
  set set(value) {
    this.#set = value ?? null;
    if (this.isConnected) {
      this.render();
    }
  }

  /** @param {Exercise[] | null | undefined} value */
  set exercises(value) {
    this.#exercises = value ?? [];
  }

  /** @param {number} value */
  set index(value) {
    this.#index = Number(value) || 0;
  }

  /** @param {string} action */
  async handleAction(action) {
    if (action === "edit") {
      this.#editing = true;
      this.render();
      /** @type {HTMLInputElement | null} */
      const weight = this.$("[name='weight']");
      weight?.focus();
      return;
    }

    if (action === "cancel") {
      this.#editing = false;
      this.render();
      return;
    }

    const set = this.#set;
    if (!set) {
      return;
    }

    if (action === "duplicate") {
      try {
        await api.workouts.addSet(set.workout_id, {
          exercise_id: set.exercise_id,
          reps: set.reps,
          weight: set.weight,
          notes: set.notes,
        });
        this.emit("sets-changed");
      } catch (error) {
        toastError(error);
      }
      return;
    }

    if (action === "delete") {
      if (!confirm(`Delete this set (${formatNumber(set.weight)} ${UNIT} × ${set.reps})?`)) {
        return;
      }
      try {
        await api.sets.remove(set.id);
        toast("Set deleted", "success");
        this.emit("sets-changed");
      } catch (error) {
        toastError(error);
      }
    }
  }

  /**
   * @param {string} action
   * @param {HTMLFormElement} form
   */
  async handleSubmit(action, form) {
    if (action !== "save" || !this.#set) {
      return;
    }
    const values = /** @type {{ exercise_id: string, reps: string, weight: string, notes: string }} */ (this.formData(form));
    try {
      await api.sets.update(this.#set.id, {
        exercise_id: Number(values.exercise_id),
        reps: Number(values.reps),
        weight: Number(values.weight),
        notes: values.notes || null,
      });
      this.#editing = false;
      this.emit("sets-changed");
    } catch (error) {
      toastError(error);
    }
  }

  /** @param {LiftSet} set */
  #editTemplate(set) {
    return html`
      <form class="edit fields" data-action="save">
        <div class="field field-exercise">
          <label>Exercise</label>
          <select name="exercise_id">
            ${this.#exercises.map(
              (exercise) => html` <option value="${exercise.id}" ${exercise.id === set.exercise_id ? "selected" : ""}>${exercise.name}</option> `,
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
          <input name="notes" type="text" maxlength="2000" value="${set.notes ?? ""}" />
        </div>
        <button type="submit">Save</button>
        <button class="secondary outline" type="button" data-action="cancel">Cancel</button>
      </form>
    `;
  }

  template() {
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
        <a class="exercise" href="#/exercises/${set.exercise_id}">${set.exercise_name}</a>
        <span class="load">${formatNumber(set.weight)} ${UNIT} × ${set.reps}</span>
        <span class="note">${set.notes ?? ""}</span>
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

await define("gz-set-row", GzSetRow);
