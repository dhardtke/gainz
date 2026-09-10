import { api, errorMessage } from "../../js/api.ts";
import type { RawHtml } from "../../js/base.ts";
import { define, GzElement, html } from "../../js/base.ts";
import { formatDate, formatVolume, plural, relativeDay, todayIso } from "../../js/format.ts";
import { navigate } from "../../js/router.ts";
import type { WorkoutWithStats } from "../../js/types.ts";
import { toast, toastError } from "../gz-toast/gz-toast.ts";

/**
 * The list keeps the pages it has already loaded, so `items` and `total` live
 * on every variant — an error while paging must not blank what is on screen.
 */
interface WorkoutListState {
  status: "loading" | "ready" | "error";
  items: WorkoutWithStats[];
  total: number;
  message?: string;
}

const PAGE_SIZE = 25;

/** The training log: every session, newest first. */
class GzWorkoutList extends GzElement {
  #state: WorkoutListState = { status: "loading", items: [], total: 0 };

  connectedCallback(): void {
    super.connectedCallback();
    void this.#load(0);
  }

  async #load(offset: number): Promise<void> {
    try {
      const page = await api.workouts.list({ limit: PAGE_SIZE, offset });
      const items = offset === 0 ? page.items : [...this.#state.items, ...page.items];
      this.#state = { status: "ready", items, total: page.total };
    } catch (error) {
      this.#state = { ...this.#state, status: "error", message: errorMessage(error) };
      toastError(error);
    }
    this.render();
  }

  async handleSubmit(action: string, form: HTMLFormElement): Promise<void> {
    if (action !== "create") {
      return;
    }
    const values = this.formData(form);
    try {
      const workout = await api.workouts.create({
        // The date field is pre-filled and `required`, so an empty value means it
        // was cleared. The API defaults a missing date but rejects an empty one.
        performed_on: values.performed_on === "" ? todayIso() : values.performed_on,
        title: values.title,
        notes: values.notes,
      });
      navigate(`/workouts/${workout.id}`);
    } catch (error) {
      toastError(error);
    }
  }

  async handleAction(action: string, element: HTMLElement): Promise<void> {
    const id = Number(element.dataset.id);

    if (action === "load-more") {
      await this.#load(this.#state.items.length);
      return;
    }

    if (action === "repeat") {
      try {
        const workout = await api.workouts.create({
          performed_on: todayIso(),
          title: element.dataset.title,
          copy_from_workout_id: id,
        });
        toast(`Copied ${plural(workout.sets.length, "set")} into a new session`, "success");
        navigate(`/workouts/${workout.id}`);
      } catch (error) {
        toastError(error);
      }
      return;
    }

    if (action === "delete") {
      const label = element.dataset.label ?? "this workout";
      if (!confirm(`Delete ${label}? Its sets are deleted too — this cannot be undone.`)) {
        return;
      }
      try {
        await api.workouts.remove(id);
        toast("Workout deleted", "success");
        await this.#load(0);
      } catch (error) {
        toastError(error);
      }
    }
  }

  #newWorkoutForm(): RawHtml {
    return html`
      <article class="stack-sm">
        <h2>New workout</h2>
        <form class="new-form" data-action="create">
          <div class="fields">
            <div class="field">
              <label for="performed_on">Date</label>
              <input id="performed_on" name="performed_on" type="date" value="${todayIso()}" required />
            </div>
            <div class="field">
              <label for="title">Title</label>
              <input id="title" name="title" type="text" placeholder="Push day" maxlength="120" />
            </div>
            <div class="field field-notes">
              <label for="notes">Notes</label>
              <input id="notes" name="notes" type="text" placeholder="Slept badly, kept it light" maxlength="2000" />
            </div>
            <button type="submit">Start session</button>
          </div>
        </form>
      </article>
    `;
  }

  template(): RawHtml {
    if (this.#state.status === "loading") {
      return html`<p aria-busy="true">Loading workouts…</p>`;
    }

    const { items, total } = this.#state;

    return html`
      <div class="stack">
        <div class="row-between">
          <h1>Workouts</h1>
          <span class="badge">${plural(total, "session")}</span>
        </div>

        ${this.#newWorkoutForm()}

        <div class="stack-sm">
          ${
            items.length === 0
              ? html`<p class="empty">No sessions logged yet. Start one above.</p>`
              : items.map(
                  (workout) => html`
                    <div class="workout">
                      <div class="grow">
                        <a href="#/workouts/${workout.id}">${workout.title ?? formatDate(workout.performed_on)}</a>
                        <div class="date">${formatDate(workout.performed_on)} · ${relativeDay(workout.performed_on)}</div>
                      </div>
                      <span class="badge">
                        ${plural(workout.set_count, "set")} · ${plural(workout.exercise_count, "exercise")} · ${formatVolume(workout.total_volume)}
                      </span>
                      <div class="actions">
                        <button
                          class="secondary outline compact"
                          data-action="repeat"
                          data-id="${workout.id}"
                          data-title="${workout.title ?? ""}"
                          title="Copy these sets into a new session dated today"
                        >
                          Repeat
                        </button>
                        <button
                          class="danger compact"
                          data-action="delete"
                          data-id="${workout.id}"
                          data-label="${workout.title ?? formatDate(workout.performed_on)}"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  `,
                )
          }
        </div>

        ${
          items.length < total
            ? html` <button class="secondary outline" data-action="load-more">Load ${Math.min(PAGE_SIZE, total - items.length)} more</button> `
            : ""
        }
      </div>
    `;
  }
}

await define("gz-workout-list", GzWorkoutList);
