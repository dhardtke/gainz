import { api, errorMessage } from '../../api.ts';
import type { RawHtml } from '../../base.ts';
import { define, GzElement, html } from '../../base.ts';
import { formatWeight, plural, relativeDay } from '../../format.ts';
import type { ExerciseWithStatsDto } from '../../../shared/dto/index.ts';
import { toast, toastError } from '../gz-toast/gz-toast.ts';

type ExerciseListState = { status: 'loading' } | { status: 'ready'; items: ExerciseWithStatsDto[] } | { status: 'error'; message: string };

/** The exercise catalogue — the vocabulary the rest of the log is written in. */
class GzExerciseList extends GzElement {
  #state: ExerciseListState = { status: 'loading' };

  #editingId: number | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    void this.#load();
  }

  async #load(): Promise<void> {
    try {
      this.#state = { status: 'ready', items: await api.exercises.list() };
    } catch (error) {
      this.#state = { status: 'error', message: errorMessage(error) };
      toastError(error);
    }
    this.render();
  }

  async handleSubmit(action: string, form: HTMLFormElement): Promise<void> {
    const values = this.formData(form);
    // The name input is `required`, so an empty one only reaches here if the
    // browser's own validation was bypassed; the API rejects it either way.
    const name = values.name ?? '';

    if (action === 'create') {
      try {
        await api.exercises.create({
          name,
          muscleGroup: values.muscleGroup,
          notes: values.notes,
        });
        toast(`Added ${name}`, 'success');
        form.reset();
        await this.#load();
      } catch (error) {
        toastError(error);
      }
      return;
    }

    if (action === 'save') {
      try {
        await api.exercises.update(Number(form.dataset.id), {
          name,
          muscleGroup: values.muscleGroup,
          notes: values.notes,
        });
        this.#editingId = null;
        await this.#load();
      } catch (error) {
        toastError(error);
      }
    }
  }

  async handleAction(action: string, element: HTMLElement): Promise<void> {
    if (action === 'edit') {
      this.#editingId = Number(element.dataset.id);
      this.render();
      const field = this.$<HTMLInputElement>('.edit-row input');
      field?.focus();
      return;
    }

    if (action === 'cancel') {
      this.#editingId = null;
      this.render();
      return;
    }

    if (action === 'delete') {
      const name = element.dataset.name;
      if (!confirm(`Delete "${name}"? Only possible while no set uses it.`)) {
        return;
      }
      try {
        await api.exercises.remove(Number(element.dataset.id));
        toast(`Deleted ${name}`, 'success');
        await this.#load();
      } catch (error) {
        toastError(error);
      }
    }
  }

  #editRow(exercise: ExerciseWithStatsDto): RawHtml {
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
              <input name="muscleGroup" type="text" maxlength="60" value="${exercise.muscleGroup ?? ''}" />
            </div>
            <div class="field">
              <label>Notes</label>
              <input name="notes" type="text" maxlength="2000" value="${exercise.notes ?? ''}" />
            </div>
            <button type="submit">Save</button>
            <button class="secondary outline" type="button" data-action="cancel">Cancel</button>
          </form>
        </td>
      </tr>
    `;
  }

  #row(exercise: ExerciseWithStatsDto): RawHtml {
    return html`
      <tr>
        <td class="name">
          <a href="#/exercises/${exercise.id}">${exercise.name}</a>
          ${exercise.notes ? html`<div class="muted">${exercise.notes}</div>` : ''}
        </td>
        <td>${exercise.muscleGroup ?? html`<span class="muted">–</span>`}</td>
        <td class="num">${exercise.setCount}</td>
        <td class="num">${exercise.bestWeight === null ? '–' : formatWeight(exercise.bestWeight)}</td>
        <td class="nowrap">${exercise.lastPerformedOn ? relativeDay(exercise.lastPerformedOn) : html`<span class="muted">never</span>`}</td>
        <td class="actions">
          <button class="secondary outline compact" data-action="edit" data-id="${exercise.id}">Edit</button>
          <button class="danger compact" data-action="delete" data-id="${exercise.id}" data-name="${exercise.name}">Delete</button>
        </td>
      </tr>
    `;
  }

  template(): RawHtml {
    if (this.#state.status === 'loading') {
      return html`<p aria-busy="true">Loading exercises…</p>`;
    }
    if (this.#state.status === 'error') {
      return html`<p class="error-text">${this.#state.message}</p>`;
    }

    const { items } = this.#state;

    return html`
      <div class="stack">
        <div class="row-between">
          <h1>Exercises</h1>
          <span class="badge">${plural(items.length, 'exercise')}</span>
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
                <label for="muscleGroup">Muscle group</label>
                <input id="muscleGroup" name="muscleGroup" type="text" placeholder="Legs" maxlength="60" />
              </div>
              <div class="field field-notes">
                <label for="notes">Notes</label>
                <input id="notes" name="notes" type="text" placeholder="Low bar, belt over 100 kg" maxlength="2000" />
              </div>
              <button type="submit">Add</button>
            </div>
          </form>
        </article>

        ${
          items.length === 0
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
                        ${items.map((exercise) => (this.#editingId === exercise.id ? this.#editRow(exercise) : this.#row(exercise)))}
                      </tbody>
                    </table>
                  </div>
                </article>
              `
        }
      </div>
    `;
  }
}

await define('gz-exercise-list', GzExerciseList);
