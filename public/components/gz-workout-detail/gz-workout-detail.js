import { api, ApiError, errorMessage } from "../../js/api.js";
import { define, GzElement, html } from "../../js/base.js";
import { formatDate, formatNumber, formatVolume, plural, relativeDay, UNIT } from "../../js/format.js";
import { navigate } from "../../js/router.js";
import { toast, toastError } from "../gz-toast/gz-toast.js";
import "../gz-set-row/gz-set-row.js";

/** @import { Exercise, LiftSet, WorkoutWithSets } from "../../js/types.js" */
/** @import { GzSetRow } from "../gz-set-row/gz-set-row.js" */

/**
 * @typedef {{ status: "loading" }
 *   | { status: "ready", workout: WorkoutWithSets }
 *   | { status: "error", message: string }} WorkoutDetailState
 */

/** One exercise's totals within the session. */
/**
 * @typedef {object} ExerciseTotals
 * @property {number} id
 * @property {string} name
 * @property {number} sets
 * @property {number} reps
 * @property {number} volume
 * @property {number} top the heaviest weight moved.
 */

const NEW_EXERCISE = "__new__";

/** The logging screen for one session: edit the header, add sets, see totals. */
class GzWorkoutDetail extends GzElement {
  /** @type {string | null} */
  #workoutId = null;

  /** @type {WorkoutDetailState} */
  #state = { status: "loading" };

  /** @type {Exercise[]} */
  #exercises = [];

  #editingHeader = false;

  /**
   * Remembers the last logged set so the next one starts from it.
   *
   * `exercise_id` also holds the "new exercise" sentinel, which is what the
   * select shows on a cold start with no exercises defined yet.
   *
   * @type {{ exercise_id: number | typeof NEW_EXERCISE | null, weight: string, reps: string }}
   */
  #draft = { exercise_id: null, weight: "", reps: "" };
  #focusAfterRender = false;

  static observedAttributes = ["workout-id"];

  /**
   * @param {string} _name
   * @param {string | null} oldValue
   * @param {string | null} value
   */
  attributeChangedCallback(_name, oldValue, value) {
    this.#workoutId = value;
    // The initial attribute arrives before connectedCallback, which loads anyway.
    if (this.isConnected && oldValue !== null && oldValue !== value) this.#load();
  }

  async connectedCallback() {
    super.connectedCallback();
    this.root.addEventListener("sets-changed", () => this.#load());
    await this.#load();
  }

  async #load() {
    try {
      // gz-app sets the attribute before the element is connected, so
      // attributeChangedCallback has already run by the time this does.
      const id = /** @type {string} */ (this.#workoutId);
      const [workout, exercises] = await Promise.all([api.workouts.get(id), api.exercises.list()]);
      this.#exercises = exercises;
      this.#state = { status: "ready", workout };
      if (this.#draft.exercise_id === null) {
        const lastSet = workout.sets.at(-1);
        this.#draft.exercise_id = lastSet?.exercise_id ?? exercises[0]?.id ?? null;
      }
    } catch (error) {
      this.#state = { status: "error", message: errorMessage(error) };
      if (!(error instanceof ApiError) || error.status !== 404) toastError(error);
    }
    this.render();
  }

  // ------------------------------------------------------------------ actions

  /**
   * @param {string} action
   * @param {HTMLElement} element
   */
  async handleAction(action, element) {
    if (action === "toggle-header") {
      this.#editingHeader = !this.#editingHeader;
      this.render();
      return;
    }

    if (action === "delete-workout") {
      if (!confirm("Delete this workout and all of its sets? This cannot be undone.")) return;
      try {
        await api.workouts.remove(/** @type {string} */ (this.#workoutId));
        toast("Workout deleted", "success");
        navigate("/workouts");
      } catch (error) {
        toastError(error);
      }
      return;
    }

    if (action === "repeat-exercise") {
      // Re-log the last set of an exercise the user already did in this session.
      const exerciseId = Number(element.dataset.id);
      if (this.#state.status !== "ready") return;
      const last = this.#state.workout.sets.filter((set) => set.exercise_id === exerciseId).at(-1);
      if (!last) return;
      try {
        await api.workouts.addSet(/** @type {string} */ (this.#workoutId), {
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

  /**
   * @param {string} action
   * @param {HTMLFormElement} form
   */
  async handleSubmit(action, form) {
    const values = /** @type {Record<"performed_on" | "title" | "notes" | "exercise_id" | "new_exercise" | "reps" | "weight", string>} */ (this.formData(form));

    if (action === "save-workout") {
      try {
        await api.workouts.update(/** @type {string} */ (this.#workoutId), {
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
        /** @type {string | number} */
        let exerciseId = values.exercise_id;

        if (exerciseId === NEW_EXERCISE) {
          if (!values.new_exercise) {
            toast("Give the new exercise a name", "error");
            return;
          }
          const created = await api.exercises.create({ name: values.new_exercise });
          exerciseId = created.id;
        }

        await api.workouts.addSet(/** @type {string} */ (this.#workoutId), {
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
    if (this.#state.status !== "ready") return;
    const workout = this.#state.workout;

    /** @type {GzSetRow[]} */
    const rows = this.$$("gz-set-row");
    for (const row of rows) {
      const set = workout.sets.find((candidate) => candidate.id === Number(row.dataset.id));
      row.exercises = this.#exercises;
      row.index = Number(row.dataset.index);
      row.set = set;
    }

    /** @type {HTMLSelectElement | null} */
    const select = this.$("select[name='exercise_id']");
    if (select) {
      select.addEventListener("change", () => {
        this.$(".field-new-exercise")?.toggleAttribute("hidden", select.value !== NEW_EXERCISE);
        this.#prefillFrom(Number(select.value));
      });
    }

    if (this.#focusAfterRender) {
      this.#focusAfterRender = false;
      /** @type {HTMLInputElement | null} */
      const field = this.$(".add-form input[name='weight']");
      field?.focus();
    }
  }

  /**
   * Copies the last set of an exercise into the add-set form.
   *
   * @param {number} exerciseId
   */
  #prefillFrom(exerciseId) {
    if (this.#state.status !== "ready") return;
    const previous = this.#state.workout.sets.filter((set) => set.exercise_id === exerciseId).at(-1);
    if (!previous) return;

    /** @type {HTMLInputElement | null} */
    const weight = this.$(".add-form input[name='weight']");
    /** @type {HTMLInputElement | null} */
    const reps = this.$(".add-form input[name='reps']");
    if (weight) weight.value = String(previous.weight);
    if (reps) reps.value = String(previous.reps);
  }

  /** @param {WorkoutWithSets} workout */
  #headerTemplate(workout) {
    if (!this.#editingHeader) {
      return html`
        <div class="row-between">
          <hgroup>
            <h1>${workout.title ?? formatDate(workout.performed_on)}</h1>
            <p>${formatDate(workout.performed_on)} · ${relativeDay(workout.performed_on)}</p>
          </hgroup>
          <div class="row">
            <button class="secondary outline" data-action="toggle-header">Edit</button>
            <button class="danger" data-action="delete-workout">Delete</button>
          </div>
        </div>
        ${workout.notes ? html`<p class="header-notes muted">${workout.notes}</p>` : ""}
      `;
    }

    return html`
      <article>
        <form class="stack-sm" data-action="save-workout">
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
            <button type="submit">Save</button>
            <button class="secondary outline" type="button" data-action="toggle-header">Cancel</button>
          </div>
        </form>
      </article>
    `;
  }

  #addSetTemplate() {
    if (this.#exercises.length === 0 && this.#draft.exercise_id === null) {
      // Still offer the form: the inline "new exercise" field covers a cold start.
      this.#draft.exercise_id = NEW_EXERCISE;
    }
    const selected = this.#draft.exercise_id;

    return html`
      <article class="add-form stack-sm">
        <h2>Add a set</h2>
        <form data-action="add-set">
          <div class="fields">
            <div class="field field-exercise">
              <label for="exercise_id">Exercise</label>
              <select id="exercise_id" name="exercise_id">
                ${this.#exercises.map(
                  (exercise) => html` <option value="${exercise.id}" ${exercise.id === selected ? "selected" : ""}>${exercise.name}</option> `,
                )}
                <option value="${NEW_EXERCISE}" ${selected === NEW_EXERCISE ? "selected" : ""}>＋ New exercise…</option>
              </select>
            </div>
            <div class="field field-exercise field-new-exercise" ${selected === NEW_EXERCISE ? "" : "hidden"}>
              <label for="new_exercise">New exercise name</label>
              <input id="new_exercise" name="new_exercise" type="text" maxlength="120" placeholder="Incline Press" />
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
            <button type="submit">Log set</button>
          </div>
        </form>
      </article>
    `;
  }

  /**
   * Per-exercise totals for the session.
   *
   * @param {LiftSet[]} sets
   * @returns {ExerciseTotals[]}
   */
  #breakdown(sets) {
    /** @type {Map<number, ExerciseTotals>} */
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
    if (this.#state.status === "loading") return html`<p aria-busy="true">Loading workout…</p>`;
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
          ${
            sets.length === 0
              ? html`<p class="empty">No sets logged for this session yet.</p>`
              : html` <div class="sets">${sets.map((set, index) => html`<gz-set-row data-id="${set.id}" data-index="${index + 1}"></gz-set-row>`)}</div> `
          }
        </section>

        ${
          breakdown.length === 0
            ? ""
            : html`
                <article class="stack-sm">
                  <h2>By exercise</h2>
                  <div class="overflow-auto">
                    <table class="breakdown">
                      <thead>
                        <tr>
                          <th scope="col">Exercise</th>
                          <th scope="col" class="num">Sets</th>
                          <th scope="col" class="num">Reps</th>
                          <th scope="col" class="num">Top set</th>
                          <th scope="col" class="num">Volume</th>
                          <th scope="col"></th>
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
                                <button class="secondary outline compact" data-action="repeat-exercise" data-id="${entry.id}">Another set</button>
                              </td>
                            </tr>
                          `,
                        )}
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

await define("gz-workout-detail", GzWorkoutDetail);
