import { api } from "../api.js";
import { define, GzElement, html } from "../base.js";
import { formatNumber, formatVolume, UNIT } from "../format.js";
import { toast, toastError } from "./gz-toast.js";

/**
 * One logged set. Reads in place, edits in place, and tells its parent to
 * reload with a `sets-changed` event rather than trying to patch the list.
 */
class GzSetRow extends GzElement {
  static styles = `
    :host { display: block; }
    .row-view {
      display: grid;
      grid-template-columns: 2.2rem minmax(7rem, 1.4fr) auto minmax(0, 1.6fr) auto;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--surface);
    }
    :host(:hover) .row-view { border-color: var(--border-strong); }
    .index { color: var(--text-muted); font-size: 0.85rem; font-variant-numeric: tabular-nums; }
    .exercise { font-weight: 600; color: inherit; }
    .load { font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 600; }
    .volume { color: var(--text-muted); font-size: 0.8rem; }
    .note { color: var(--text-muted); font-size: 0.85rem; overflow-wrap: anywhere; }
    .actions { display: flex; gap: 2px; justify-content: flex-end; }

    form.edit { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; padding: 10px; border: 1px solid var(--accent); border-radius: var(--radius-sm); background: var(--surface); }
    form.edit .field-exercise { flex: 2 1 180px; }
    form.edit .field-num { flex: 0 1 110px; }
    form.edit .field-notes { flex: 3 1 200px; }

    @media (max-width: 720px) {
      .row-view { grid-template-columns: 2rem 1fr auto; grid-template-areas: "i e l" ". n n" ". a a"; }
      .index { grid-area: i; }
      .exercise { grid-area: e; }
      .load { grid-area: l; }
      .volume { display: none; }
      .note { grid-area: n; }
      .actions { grid-area: a; justify-content: flex-start; }
    }
  `;

  #editing = false;
  #set = null;
  #exercises = [];
  #index = 0;

  set set(value) {
    this.#set = value;
    if (this.isConnected) this.render();
  }

  set exercises(value) {
    this.#exercises = value ?? [];
  }

  set index(value) {
    this.#index = Number(value) || 0;
  }

  async handleAction(action) {
    if (action === "edit") {
      this.#editing = true;
      this.render();
      this.$("[name='weight']")?.focus();
      return;
    }

    if (action === "cancel") {
      this.#editing = false;
      this.render();
      return;
    }

    if (action === "duplicate") {
      try {
        await api.workouts.addSet(this.#set.workout_id, {
          exercise_id: this.#set.exercise_id,
          reps: this.#set.reps,
          weight: this.#set.weight,
          notes: this.#set.notes,
        });
        this.emit("sets-changed");
      } catch (error) {
        toastError(error);
      }
      return;
    }

    if (action === "delete") {
      if (!confirm(`Delete this set (${formatNumber(this.#set.weight)} ${UNIT} × ${this.#set.reps})?`)) return;
      try {
        await api.sets.remove(this.#set.id);
        toast("Set deleted", "success");
        this.emit("sets-changed");
      } catch (error) {
        toastError(error);
      }
    }
  }

  async handleSubmit(action, form) {
    if (action !== "save") return;
    const values = this.formData(form);
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

  #editTemplate() {
    const set = this.#set;
    return html`
      <form class="edit" data-action="save">
        <div class="field field-exercise">
          <label>Exercise</label>
          <select name="exercise_id">
            ${this.#exercises.map(
              (exercise) => html`
                <option value="${exercise.id}" ${exercise.id === set.exercise_id ? "selected" : ""}>
                  ${exercise.name}
                </option>
              `,
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
        <button class="primary" type="submit">Save</button>
        <button class="ghost" type="button" data-action="cancel">Cancel</button>
      </form>
    `;
  }

  template() {
    if (!this.#set) return html``;
    if (this.#editing) return this.#editTemplate();

    const set = this.#set;
    return html`
      <div class="row-view">
        <span class="index">${this.#index}</span>
        <a class="exercise" href="#/exercises/${set.exercise_id}">${set.exercise_name}</a>
        <span class="load">${formatNumber(set.weight)} ${UNIT} × ${set.reps}</span>
        <span class="note">${set.notes ?? ""}</span>
        <span class="actions">
          <span class="volume mono">${formatVolume(set.weight * set.reps)}</span>
          <button class="ghost small" data-action="edit">Edit</button>
          <button class="ghost small" data-action="duplicate" title="Log another set just like this one">+1</button>
          <button class="danger small" data-action="delete" aria-label="Delete set">×</button>
        </span>
      </div>
    `;
  }
}

define("gz-set-row", GzSetRow);
