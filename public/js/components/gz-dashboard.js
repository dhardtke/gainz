import { api } from "../api.js";
import { define, GzElement, html } from "../base.js";
import { formatDate, formatVolume, plural, relativeDay, todayIso } from "../format.js";
import { navigate } from "../router.js";
import { toastError } from "./gz-toast.js";
import "./gz-stat-tile.js";

/** Landing view: the numbers that answer "am I actually progressing?". */
class GzDashboard extends GzElement {
  static styles = `
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }
    .workout-link {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--surface);
      color: inherit;
    }
    .workout-link:hover { border-color: var(--accent); text-decoration: none; }
    .title { font-weight: 600; }
  `;

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
      this.#state = { status: "error", message: error.message };
      toastError(error);
    }
    this.render();
  }

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
    if (this.#state.status === "loading") return html`<p class="muted">Loading your log…</p>`;
    if (this.#state.status === "error") return html`<p class="error-text">${this.#state.message}</p>`;

    const { summary, workouts } = this.#state;

    return html`
      <div class="stack">
        <div class="row-between">
          <div>
            <h1>Dashboard</h1>
            <p class="muted">
              ${summary.last_performed_on
                ? html`Last session ${relativeDay(summary.last_performed_on)}.`
                : html`Nothing logged yet — time for session one.`}
            </p>
          </div>
          <button class="primary" data-action="start-workout">Log today's workout</button>
        </div>

        <div class="tiles">
          <gz-stat-tile label="Workouts" value="${summary.workout_count}" hint="${plural(summary.set_count, "set")} total"></gz-stat-tile>
          <gz-stat-tile label="Total volume" value="${formatVolume(summary.total_volume)}" hint="reps × weight, all time"></gz-stat-tile>
          <gz-stat-tile label="Last 30 days" value="${summary.workouts_last_30_days}" hint="${formatVolume(summary.volume_last_30_days)} moved"></gz-stat-tile>
          <gz-stat-tile label="Exercises" value="${summary.exercise_count}" hint="${plural(summary.total_reps, "rep")} lifted"></gz-stat-tile>
        </div>

        <section class="card stack-sm">
          <div class="row-between">
            <h2>Recent workouts</h2>
            <a href="#/workouts">See all</a>
          </div>
          ${workouts.length === 0
            ? html`<p class="empty">No workouts yet. Log one and it will show up here.</p>`
            : workouts.map(
                (workout) => html`
                  <a class="workout-link" href="#/workouts/${workout.id}">
                    <span class="grow">
                      <span class="title">${workout.title ?? formatDate(workout.performed_on)}</span>
                      <span class="muted small"> · ${relativeDay(workout.performed_on)}</span>
                    </span>
                    <span class="badge">${plural(workout.set_count, "set")} · ${formatVolume(workout.total_volume)}</span>
                  </a>
                `,
              )}
        </section>
      </div>
    `;
  }
}

define("gz-dashboard", GzDashboard);
