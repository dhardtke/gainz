import { api, ApiError, errorMessage } from "../../js/api.ts";
import { define, GzElement, html } from "../../js/base.ts";
import { formatDate, formatDelta, formatNumber, formatShortDate, formatVolume, plural, relativeDay, UNIT } from "../../js/format.ts";
import type { ExerciseProgress, SessionPoint } from "../../js/types.ts";
import type { GzChart } from "../gz-chart/gz-chart.ts";
import { toastError } from "../gz-toast/gz-toast.ts";
import "../gz-chart/gz-chart.ts";
import "../gz-stat-tile/gz-stat-tile.ts";

/** The `SessionPoint` fields that can be plotted. */
type MetricKey = "est_one_rep_max" | "top_weight" | "total_volume";

interface Metric {
  key: MetricKey;
  label: string;
  unit: string;
  hint: string;
}

type ReadyState = { status: "ready" } & ExerciseProgress;

type ExerciseDetailState = { status: "loading" } | ReadyState | { status: "error"; message: string };

/**
 * Written as a non-empty tuple so `METRICS[0]` is always a metric — it is the
 * default, and the fallback when an unknown one is asked for.
 */
const METRICS: [Metric, ...Metric[]] = [
  {
    key: "est_one_rep_max",
    label: "Estimated 1RM",
    unit: UNIT,
    hint: "Epley estimate from the best set of each session — comparable across rep ranges.",
  },
  { key: "top_weight", label: "Top set", unit: UNIT, hint: "Heaviest weight moved in each session." },
  { key: "total_volume", label: "Volume", unit: UNIT, hint: "Reps × weight summed over the session." },
];

/** Progress view for a single exercise. */
class GzExerciseDetail extends GzElement {
  #exerciseId: string | null = null;

  #state: ExerciseDetailState = { status: "loading" };

  #metric: MetricKey = METRICS[0].key;

  static observedAttributes = ["exercise-id"];

  attributeChangedCallback(_name: string, oldValue: string | null, value: string | null): void {
    this.#exerciseId = value;
    if (this.isConnected && oldValue !== null && oldValue !== value) {
      void this.#load();
    }
  }

  async connectedCallback(): Promise<void> {
    super.connectedCallback();
    await this.#load();
  }

  async #load(): Promise<void> {
    try {
      // gz-app sets the attribute before the element is connected, so
      // attributeChangedCallback has already run by the time this does.
      const id = this.#exerciseId as string;
      this.#state = { status: "ready", ...(await api.exercises.progress(id)) };
    } catch (error) {
      this.#state = { status: "error", message: errorMessage(error) };
      if (!(error instanceof ApiError) || error.status !== 404) {
        toastError(error);
      }
    }
    this.render();
  }

  handleAction(action: string, element: HTMLElement): void {
    if (action === "metric") {
      const chosen = METRICS.find((candidate) => candidate.key === element.dataset.metric);
      if (!chosen) {
        return;
      }
      this.#metric = chosen.key;
      this.render();
    }
  }

  afterRender(): void {
    const chart = this.$<GzChart>("gz-chart");
    if (!chart || this.#state.status !== "ready") {
      return;
    }

    const metric = METRICS.find((candidate) => candidate.key === this.#metric) ?? METRICS[0];
    chart.unit = metric.unit;
    chart.series = this.#state.sessions.map((session) => ({
      label: formatShortDate(session.performed_on),
      value: session[metric.key],
      hint: `${plural(session.set_count, "set")}, ${plural(session.total_reps, "rep")}`,
    }));
  }

  #summaryTiles(state: ReadyState) {
    const { sessions, best_set: bestSet } = state;
    const latest = sessions.at(-1);
    const previous = sessions.at(-2);

    const totalVolume = sessions.reduce((sum, session) => sum + session.total_volume, 0);
    const delta = latest && previous ? formatDelta(latest.est_one_rep_max, previous.est_one_rep_max) : "";

    return html`
      <div class="tiles">
        <gz-stat-tile
          label="Sessions"
          value="${sessions.length}"
          hint="${latest ? `last ${relativeDay(latest.performed_on)}` : "not trained yet"}"
        ></gz-stat-tile>
        <gz-stat-tile
          label="Best set"
          value="${bestSet ? `${formatNumber(bestSet.weight)} ${UNIT} × ${bestSet.reps}` : "–"}"
          hint="${bestSet ? formatDate(bestSet.performed_on) : "no sets logged"}"
        ></gz-stat-tile>
        <gz-stat-tile
          label="Estimated 1RM"
          value="${latest ? `${formatNumber(latest.est_one_rep_max, 1)} ${UNIT}` : "–"}"
          hint="${delta ? `${delta} ${UNIT} vs. previous session` : "needs two sessions"}"
        ></gz-stat-tile>
        <gz-stat-tile label="Total volume" value="${formatVolume(totalVolume)}" hint="across all sessions"></gz-stat-tile>
      </div>
    `;
  }

  #sessionsTable(sessions: SessionPoint[]) {
    return html`
      <article class="stack-sm">
        <h2>Session history</h2>
        <div class="overflow-auto">
          <table>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col" class="num">Sets</th>
                <th scope="col" class="num">Reps</th>
                <th scope="col" class="num">Top set</th>
                <th scope="col" class="num">Est. 1RM</th>
                <th scope="col" class="num">Volume</th>
              </tr>
            </thead>
            <tbody>
              ${[...sessions].reverse().map((session, index, reversed) => {
                const earlier = reversed[index + 1];
                const change = earlier ? formatDelta(session.est_one_rep_max, earlier.est_one_rep_max) : "";
                const direction = change.startsWith("+") ? "up" : change.startsWith("−") ? "down" : "";
                return html`
                  <tr>
                    <td class="name nowrap">
                      <a href="#/workouts/${session.workout_id}">${formatDate(session.performed_on)}</a>
                    </td>
                    <td class="num">${session.set_count}</td>
                    <td class="num">${session.total_reps}</td>
                    <td class="num">${formatNumber(session.top_weight)} ${UNIT}</td>
                    <td class="num">${formatNumber(session.est_one_rep_max, 1)} ${change ? html`<span class="${direction}"> ${change}</span>` : ""}</td>
                    <td class="num">${formatVolume(session.total_volume)}</td>
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </div>
      </article>
    `;
  }

  template() {
    if (this.#state.status === "loading") {
      return html`<p aria-busy="true">Loading progress…</p>`;
    }
    if (this.#state.status === "error") {
      return html`
        <div class="stack">
          <p class="error-text">${this.#state.message}</p>
          <p><a href="#/exercises">Back to all exercises</a></p>
        </div>
      `;
    }

    const state = this.#state;
    const { exercise, sessions } = state;
    const metric = METRICS.find((candidate) => candidate.key === this.#metric) ?? METRICS[0];

    return html`
      <div class="stack">
        <div>
          <p><a href="#/exercises">← Exercises</a></p>
          <hgroup>
            <h1>${exercise.name}</h1>
            <p>${exercise.muscle_group ?? "No muscle group set"}${exercise.notes ? html` · ${exercise.notes}` : ""}</p>
          </hgroup>
        </div>

        ${this.#summaryTiles(state)}

        <article class="stack-sm">
          <div class="row-between">
            <h2>${metric.label}</h2>
            <div class="metric-switch">
              ${METRICS.map(
                (candidate) => html`
                  <button
                    class="secondary outline compact"
                    data-action="metric"
                    data-metric="${candidate.key}"
                    aria-pressed="${candidate.key === this.#metric}"
                  >
                    ${candidate.label}
                  </button>
                `,
              )}
            </div>
          </div>
          <gz-chart></gz-chart>
          <p class="muted">${metric.hint}</p>
        </article>

        ${sessions.length === 0 ? html`<p class="empty">No sets logged for this exercise yet.</p>` : this.#sessionsTable(sessions)}
      </div>
    `;
  }
}

await define("gz-exercise-detail", GzExerciseDetail);
