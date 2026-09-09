import { api } from "../api.js";
import { define, GzElement, html } from "../base.js";
import { formatWeight, plural, relativeDay } from "../format.js";
import { toast, toastError } from "./gz-toast.js";

/** The exercise catalogue — the vocabulary the rest of the log is written in. */
class GzExerciseList extends GzElement {
  #state = { status: "loading", items: [] };
  #editingId = null;

  async connectedCallback() {
    super.connectedCallback();
    await this.#load();
  }

  async #load() {
    try {
      this.#state = { status: "ready", items: await api.exercises.list() };
    } catch (error) {
      this.#state = { status: "error", message: error.message };
      toastError(error);
    }
    this.render();
  }

  async handleSubmit(action, form) {
    const values = this.formData(form);

    if (action === "create") {
      try {
        await api.exercises.create({
          name: values.name,
          muscle_group: values.muscle_group || null,
          notes: values.notes || null,
        });
        toast(`Added ${values.name}`, "success");
        form.reset();
        await this.#load();
      } catch (error) {
        toastError(error);
      }
      return;
    }

    if (action === "save") {
      try {
        await api.exercises.update(Number(form.dataset.id), {
          name: values.name,
          muscle_group: values.muscle_group || null,
          notes: values.notes || null,
        });
        this.#editingId = null;
        await this.#load();
      } catch (error) {
        toastError(error);
      }
    }
  }

  async handleAction(action, element) {
    if (action === "edit") {
      this.#editingId = Number(element.dataset.id);
      this.render();
      this.$(".edit-row input")?.focus();
      return;
    }

    if (action === "cancel") {
      this.#editingId = null;
      this.render();
      return;
    }

    if (action === "delete") {
      const name = element.dataset.name;
      if (!confirm(`Delete "${name}"? Only possible while no set uses it.`)) return;
      try {
        await api.exercises.remove(Number(element.dataset.id));
        toast(`Deleted ${name}`, "success");
        await this.#load();
      } catch (error) {
        toastError(error);
      }
    }
  }

  #editRow(exercise) {
    return html`
      <tr class="edit-row">
        <td colspan="6">
          <form class="edit-fields fields" data-action="save" data-id="${exercise.id}">
            <div class="field">
              <label>Name</label>
              <input name="name" type="text" maxlength="120" value="${exercise.name}" required />
            </div>
            <div class="field">
              <label>Muscle group</label>
              <input name="muscle_group" type="text" maxlength="60" value="${exercise.muscle_group ?? ""}" />
            </div>
            <div class="field">
              <label>Notes</label>
              <input name="notes" type="text" maxlength="2000" value="${exercise.notes ?? ""}" />
            </div>
            <button type="submit">Save</button>
            <button class="secondary outline" type="button" data-action="cancel">Cancel</button>
          </form>
        </td>
      </tr>
    `;
  }

  #row(exercise) {
    return html`
      <tr>
        <td class="name">
          <a href="#/exercises/${exercise.id}">${exercise.name}</a>
          ${exercise.notes ? html`<div class="muted small">${exercise.notes}</div>` : ""}
        </td>
        <td>${exercise.muscle_group ?? html`<span class="muted">–</span>`}</td>
        <td class="num">${exercise.set_count}</td>
        <td class="num">${exercise.best_weight === null ? "–" : formatWeight(exercise.best_weight)}</td>
        <td class="nowrap">
          ${exercise.last_performed_on
            ? relativeDay(exercise.last_performed_on)
            : html`<span class="muted">never</span>`}
        </td>
        <td class="actions">
          <button class="secondary outline compact" data-action="edit" data-id="${exercise.id}">Edit</button>
          <button class="danger compact" data-action="delete" data-id="${exercise.id}" data-name="${exercise.name}">
            Delete
          </button>
        </td>
      </tr>
    `;
  }

  template() {
    if (this.#state.status === "loading") return html`<p aria-busy="true">Loading exercises…</p>`;
    if (this.#state.status === "error") return html`<p class="error-text">${this.#state.message}</p>`;

    const { items } = this.#state;

    return html`
      <div class="stack">
        <div class="row-between">
          <h1>Exercises</h1>
          <span class="badge">${plural(items.length, "exercise")}</span>
        </div>

        <article class="stack-sm">
          <h2>Add an exercise</h2>
          <form class="new-form" data-action="create">
            <div class="fields">
              <div class="field">
                <label for="name">Name</label>
                <input id="name" name="name" type="text" placeholder="Back Squat" maxlength="120" required />
              </div>
              <div class="field">
                <label for="muscle_group">Muscle group</label>
                <input id="muscle_group" name="muscle_group" type="text" placeholder="Legs" maxlength="60" />
              </div>
              <div class="field field-notes">
                <label for="notes">Notes</label>
                <input id="notes" name="notes" type="text" placeholder="Low bar, belt over 100 kg" maxlength="2000" />
              </div>
              <button type="submit">Add</button>
            </div>
          </form>
        </article>

        ${items.length === 0
          ? html`<p class="empty">No exercises yet. Add the lifts you train above.</p>`
          : html`
              <article>
                <div class="overflow-auto">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Exercise</th>
                        <th scope="col">Muscle group</th>
                        <th scope="col" class="num">Sets</th>
                        <th scope="col" class="num">Best</th>
                        <th scope="col">Last done</th>
                        <th scope="col"></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${items.map((exercise) =>
                        this.#editingId === exercise.id ? this.#editRow(exercise) : this.#row(exercise),
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            `}
      </div>
    `;
  }
}

define("gz-exercise-list", GzExerciseList);
