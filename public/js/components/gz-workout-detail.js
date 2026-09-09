import { api } from "../api.js";
import { define, GzElement, html } from "../base.js";
import { formatDate, formatNumber, formatVolume, plural, relativeDay, UNIT } from "../format.js";
import { navigate } from "../router.js";
import { toast, toastError } from "./gz-toast.js";
import "./gz-set-row.js";

const NEW_EXERCISE = "__new__";

/** The logging screen for one session: edit the header, add sets, see totals. */
class GzWorkoutDetail extends GzElement {
  static styles = `
    .add-form .fields > .field-exercise { flex: 2 1 200px; }
    .add-form .fields > .field-num { flex: 0 1 120px; }
    .add-form .fields > .field-notes { flex: 3 1 200px; }
    .add-form { border-color: var(--accent); }

    .sets { display: flex; flex-direction: column; gap: 6px; }
    .breakdown td.name { font-weight: 600; }
    .header-notes { white-space: pre-wrap; }
    .totals { display: flex; gap: 8px; flex-wrap: wrap; }
  `;

  #workoutId = null;
  #state = { status: "loading" };
  #exercises = [];
  #editingHeader = false;
  /** Remembers the last logged set so the next one starts from it. */
  #draft = { exercise_id: null, weight: "", reps: "" };
  #focusAfterRender = false;

  static observedAttributes = ["workout-id"];

  attributeChangedCallback(_name, oldValue, value) {
    this.#workoutId = value;
    // The initial attribute arrives before connectedCallback, which loads anyway.
    if (this.isConnected && oldValue !== null && oldValue !== value) this.#load();
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.addEventListener("sets-changed", () => this.#load());
    await this.#load();
  }

  async #load() {
    try {
      const [workout, exercises] = await Promise.all([api.workouts.get(this.#workoutId), api.exercises.list()]);
      this.#exercises = exercises;
      this.#state = { status: "ready", workout };
      if (this.#draft.exercise_id === null) {
        const lastSet = workout.sets.at(-1);
        this.#draft.exercise_id = lastSet?.exercise_id ?? exercises[0]?.id ?? null;
      }
    } catch (error) {
      this.#state = { status: "error", message: error.message };
      if (error.status !== 404) toastError(error);
    }
    this.render();
  }

  // ------------------------------------------------------------------ actions

  async handleAction(action, element) {
    if (action === "toggle-header") {
      this.#editingHeader = !this.#editingHeader;
      this.render();
      return;
    }

    if (action === "delete-workout") {
      if (!confirm("Delete this workout and all of its sets? This cannot be undone.")) return;
      try {
        await api.workouts.remove(this.#workoutId);
        toast("Workout deleted", "success");
        navigate("/workouts");
      } catch (error) {
        toastError(error);
      }
      return;
    }

    if (action === "repeat-exercise") {
      // Re-log the heaviest set of an exercise the user already did today.
      const exerciseId = Number(element.dataset.id);
      const sets = this.#state.workout.sets.filter((set) => set.exercise_id === exerciseId);
      const last = sets.at(-1);
      if (!last) return;
      try {
        await api.workouts.addSet(this.#workoutId, {
          exercise_id: last.exercise_id,
          reps: last.reps,
          weight: last.weight,
          notes: null,
        });
        await this.#load();
      } catch (error) {
        toastError(error);
      }
    }
  }

  async handleSubmit(action, form) {
    const values = this.formData(form);

    if (action === "save-workout") {
      try {
        await api.workouts.update(this.#workoutId, {
          performed_on: values.performed_on,
          title: values.title || null,
          notes: values.notes || null,
        });
        this.#editingHeader = false;
        toast("Workout updated", "success");
        await this.#load();
      } catch (error) {
        toastError(error);
      }
      return;
    }

    if (action === "add-set") {
      try {
        let exerciseId = values.exercise_id;

        if (exerciseId === NEW_EXERCISE) {
          if (!values.new_exercise) {
            toast("Give the new exercise a name", "error");
            return;
          }
          const created = await api.exercises.create({ name: values.new_exercise });
          exerciseId = created.id;
        }

        await api.workouts.addSet(this.#workoutId, {
          exercise_id: Number(exerciseId),
          reps: Number(values.reps),
          weight: Number(values.weight),
          notes: values.notes || null,
        });

        this.#draft = { exercise_id: Number(exerciseId), weight: values.weight, reps: values.reps };
        this.#focusAfterRender = true;
        await this.#load();
      } catch (error) {
        toastError(error);
      }
    }
  }

  // ------------------------------------------------------------------- render

  afterRender() {
    for (const row of this.$$("gz-set-row")) {
      const set = this.#state.workout?.sets.find((candidate) => candidate.id === Number(row.dataset.id));
      row.exercises = this.#exercises;
      row.index = Number(row.dataset.index);
      row.set = set;
    }

    const select = this.$("select[name='exercise_id']");
    if (select) {
      select.addEventListener("change", () => {
        this.$(".field-new-exercise")?.toggleAttribute("hidden", select.value !== NEW_EXERCISE);
        this.#prefillFrom(Number(select.value));
      });
    }

    if (this.#focusAfterRender) {
      this.#focusAfterRender = false;
      this.$(".add-form input[name='weight']")?.focus();
    }
  }

  /** Copies the last set of an exercise into the add-set form. */
  #prefillFrom(exerciseId) {
    const previous = this.#state.workout?.sets.filter((set) => set.exercise_id === exerciseId).at(-1);
    if (!previous) return;
    const weight = this.$(".add-form input[name='weight']");
    const reps = this.$(".add-form input[name='reps']");
    if (weight) weight.value = previous.weight;
    if (reps) reps.value = previous.reps;
  }

  #headerTemplate(workout) {
    if (!this.#editingHeader) {
      return html`
        <div class="row-between">
          <div>
            <h1>${workout.title ?? formatDate(workout.performed_on)}</h1>
            <p class="muted">${formatDate(workout.performed_on)} · ${relativeDay(workout.performed_on)}</p>
            ${workout.notes ? html`<p class="header-notes muted small">${workout.notes}</p>` : ""}
          </div>
          <div class="row">
            <button data-action="toggle-header">Edit</button>
            <button class="danger" data-action="delete-workout">Delete</button>
          </div>
        </div>
      `;
    }

    return html`
      <form class="card stack-sm" data-action="save-workout">
        <div class="fields">
          <div class="field">
            <label for="performed_on">Date</label>
            <input id="performed_on" name="performed_on" type="date" value="${workout.performed_on}" required />
          </div>
          <div class="field grow">
            <label for="title">Title</label>
            <input id="title" name="title" type="text" maxlength="120" value="${workout.title ?? ""}" />
          </div>
        </div>
        <div class="field">
          <label for="notes">Session notes</label>
          <textarea id="notes" name="notes" maxlength="2000" placeholder="How did it feel?">${workout.notes ?? ""}</textarea>
        </div>
        <div class="row">
          <button class="primary" type="submit">Save</button>
          <button class="ghost" type="button" data-action="toggle-header">Cancel</button>
        </div>
      </form>
    `;
  }

  #addSetTemplate() {
    if (this.#exercises.length === 0 && this.#draft.exercise_id === null) {
      // Still offer the form: the inline "new exercise" field covers a cold start.
      this.#draft.exercise_id = NEW_EXERCISE;
    }
    const selected = this.#draft.exercise_id;

    return html`
      <form class="card add-form stack-sm" data-action="add-set">
        <h2>Add a set</h2>
        <div class="fields">
          <div class="field field-exercise">
            <label for="exercise_id">Exercise</label>
            <select id="exercise_id" name="exercise_id">
              ${this.#exercises.map(
                (exercise) => html`
                  <option value="${exercise.id}" ${exercise.id === selected ? "selected" : ""}>${exercise.name}</option>
                `,
              )}
              <option value="${NEW_EXERCISE}" ${selected === NEW_EXERCISE ? "selected" : ""}>＋ New exercise…</option>
            </select>
          </div>
          <div class="field field-exercise field-new-exercise" ${selected === NEW_EXERCISE ? "" : "hidden"}>
            <label for="new_exercise">New exercise name</label>
            <input id="new_exercise" name="new_exercise" type="text" maxlength="120" placeholder="Incline Dumbbell Press" />
          </div>
          <div class="field field-num">
            <label for="weight">Weight (${UNIT})</label>
            <input id="weight" name="weight" type="number" step="0.25" min="0" value="${this.#draft.weight}" required />
          </div>
          <div class="field field-num">
            <label for="reps">Reps</label>
            <input id="reps" name="reps" type="number" step="1" min="1" value="${this.#draft.reps}" required />
          </div>
          <div class="field field-notes">
            <label for="set-notes">Notes</label>
            <input id="set-notes" name="notes" type="text" maxlength="2000" placeholder="Paused, felt easy" />
          </div>
          <button class="primary" type="submit">Log set</button>
        </div>
      </form>
    `;
  }

  /** Per-exercise totals for the session. */
  #breakdown(sets) {
    const byExercise = new Map();
    for (const set of sets) {
      const entry = byExercise.get(set.exercise_id) ?? {
        id: set.exercise_id,
        name: set.exercise_name,
        sets: 0,
        reps: 0,
        volume: 0,
        top: 0,
      };
      entry.sets += 1;
      entry.reps += set.reps;
      entry.volume += set.reps * set.weight;
      entry.top = Math.max(entry.top, set.weight);
      byExercise.set(set.exercise_id, entry);
    }
    return [...byExercise.values()];
  }

  template() {
    if (this.#state.status === "loading") return html`<p class="muted">Loading workout…</p>`;
    if (this.#state.status === "error") {
      return html`
        <div class="stack">
          <p class="error-text">${this.#state.message}</p>
          <p><a href="#/workouts">Back to all workouts</a></p>
        </div>
      `;
    }

    const { workout } = this.#state;
    const sets = workout.sets;
    const volume = sets.reduce((total, set) => total + set.reps * set.weight, 0);
    const reps = sets.reduce((total, set) => total + set.reps, 0);
    const breakdown = this.#breakdown(sets);

    return html`
      <div class="stack">
        ${this.#headerTemplate(workout)}

        <div class="totals">
          <span class="badge">${plural(sets.length, "set")}</span>
          <span class="badge">${plural(breakdown.length, "exercise")}</span>
          <span class="badge">${plural(reps, "rep")}</span>
          <span class="badge">${formatVolume(volume)} total volume</span>
        </div>

        ${this.#addSetTemplate()}

        <section class="stack-sm">
          <h2>Sets</h2>
          ${sets.length === 0
            ? html`<p class="empty">No sets logged for this session yet.</p>`
            : html`
                <div class="sets">
                  ${sets.map(
                    (set, index) => html`<gz-set-row data-id="${set.id}" data-index="${index + 1}"></gz-set-row>`,
                  )}
                </div>
              `}
        </section>

        ${breakdown.length === 0
          ? ""
          : html`
              <section class="card">
                <h2>By exercise</h2>
                <div class="scroll-x">
                  <table class="breakdown">
                    <thead>
                      <tr>
                        <th>Exercise</th>
                        <th class="num">Sets</th>
                        <th class="num">Reps</th>
                        <th class="num">Top set</th>
                        <th class="num">Volume</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${breakdown.map(
                        (entry) => html`
                          <tr>
                            <td class="name"><a href="#/exercises/${entry.id}">${entry.name}</a></td>
                            <td class="num">${entry.sets}</td>
                            <td class="num">${entry.reps}</td>
                            <td class="num">${formatNumber(entry.top)} ${UNIT}</td>
                            <td class="num">${formatVolume(entry.volume)}</td>
                            <td class="num">
                              <button class="ghost small" data-action="repeat-exercise" data-id="${entry.id}">
                                Another set
                              </button>
                            </td>
                          </tr>
                        `,
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            `}
      </div>
    `;
  }
}

define("gz-workout-detail", GzWorkoutDetail);
