import { api, errorMessage } from "../../js/api.js";
import { define, GzElement, html } from "../../js/base.js";
import { formatDate, formatVolume, plural, relativeDay, todayIso } from "../../js/format.js";
import { navigate } from "../../js/router.js";
import { toastError } from "../gz-toast/gz-toast.js";
import "../gz-stat-tile/gz-stat-tile.js";

/** @import { Summary, WorkoutWithStats } from "../../js/types.js" */

/**
 * @typedef {{ status: "loading" }
 *   | { status: "ready", summary: Summary, workouts: WorkoutWithStats[] }
 *   | { status: "error", message: string }} DashboardState
 */

/** Landing view: the numbers that answer "am I actually progressing?". */
class GzDashboard extends GzElement {
  /** @type {DashboardState} */
  #state = { status: "loading" };

  async connectedCallback() {
    super.connectedCallback();
    await this.#load();
  }

  async #load() {
    try {
      const [summary, page] = await Promise.all([api.summary(), api.workouts.list({ limit: 5 })]);
      this.#state = { status: "ready", summary, workouts: page.items };
    } catch (error) {
      this.#state = { status: "error", message: errorMessage(error) };
      toastError(error);
    }
    this.render();
  }

  /** @param {string} action */
  async handleAction(action) {
    if (action !== "start-workout") return;
    try {
      const workout = await api.workouts.create({ performed_on: todayIso() });
      navigate(`/workouts/${workout.id}`);
    } catch (error) {
      toastError(error);
    }
  }

  template() {
    if (this.#state.status === "loading") return html`<p aria-busy="true">Loading your log…</p>`;
    if (this.#state.status === "error") return html`<p class="error-text">${this.#state.message}</p>`;

    const { summary, workouts } = this.#state;

    return html`
      <div class="stack">
        <div class="row-between">
          <div>
            <h1>Dashboard</h1>
            <p class="muted">
              ${summary.last_performed_on ? html`Last session ${relativeDay(summary.last_performed_on)}.` : html`Nothing logged yet — time for session one.`}
            </p>
          </div>
          <button data-action="start-workout">Log today's workout</button>
        </div>

        <div class="tiles">
          <gz-stat-tile label="Workouts" value="${summary.workout_count}" hint="${plural(summary.set_count, "set")} total"></gz-stat-tile>
          <gz-stat-tile label="Total volume" value="${formatVolume(summary.total_volume)}" hint="reps × weight, all time"></gz-stat-tile>
          <gz-stat-tile label="Last 30 days" value="${summary.workouts_last_30_days}" hint="${formatVolume(summary.volume_last_30_days)} moved"></gz-stat-tile>
          <gz-stat-tile label="Exercises" value="${summary.exercise_count}" hint="${plural(summary.total_reps, "rep")} lifted"></gz-stat-tile>
        </div>

        <article class="stack-sm">
          <div class="row-between">
            <h2>Recent workouts</h2>
            <a href="#/workouts">See all</a>
          </div>
          ${
            workouts.length === 0
              ? html`<p class="empty">No workouts yet. Log one and it will show up here.</p>`
              : workouts.map(
                  (workout) => html`
                    <a class="workout-link" href="#/workouts/${workout.id}">
                      <span class="grow">
                        <span class="title">${workout.title ?? formatDate(workout.performed_on)}</span>
                        <span class="muted"> · ${relativeDay(workout.performed_on)}</span>
                      </span>
                      <span class="badge">${plural(workout.set_count, "set")} · ${formatVolume(workout.total_volume)}</span>
                    </a>
                  `,
                )
          }
        </article>
      </div>
    `;
  }
}

await define("gz-dashboard", GzDashboard);
