import { ApiError, errorMessage } from '../../http/errors.ts';
import type { RawHtml } from '../../ui/base.ts';
import { define, GzElement, html } from '../../ui/base.ts';
import { formatDate, formatDelta, formatNumber, formatShortDate, formatVolume, plural, relativeDay, UNIT } from '../../ui/format.ts';
import type { ExerciseProgressDto, SessionPointDto } from '../../../shared/dto/exercise.ts';
import type { ExerciseId } from '../../../shared/flavors.ts';
import { exerciseFacade } from './exercises.facade.ts';
import type { GzChartComponent } from './internal/gz-chart.component.ts';
import { toastError } from '../../ui/gz-toast.component.ts';
import './internal/gz-chart.component.ts';
import '../../ui/gz-tile.component.ts';

/** The `SessionPointDto` fields that can be plotted. */
type MetricKey = 'estOneRepMax' | 'topWeight' | 'totalVolume';

interface Metric {
  key: MetricKey;
  label: string;
  unit: string;
  hint: string;
}

type ReadyState = { status: 'ready' } & ExerciseProgressDto;

type ExerciseDetailState = { status: 'loading' } | ReadyState | { status: 'error'; message: string };

/**
 * Written as a non-empty tuple so `METRICS[0]` is always a metric — it is the
 * default, and the fallback when an unknown one is asked for.
 */
const METRICS: [Metric, ...Metric[]] = [
  {
    key: 'estOneRepMax',
    label: 'Estimated 1RM',
    unit: UNIT,
    hint: 'Epley estimate from the best set of each session — comparable across rep ranges.',
  },
  { key: 'topWeight', label: 'Top set', unit: UNIT, hint: 'Heaviest weight moved in each session.' },
  { key: 'totalVolume', label: 'Volume', unit: UNIT, hint: 'Reps × weight summed over the session.' },
];

/** Progress view for a single exercise. */
export class GzExerciseDetailComponent extends GzElement {
  #exerciseId: string | null = null;

  #state: ExerciseDetailState = { status: 'loading' };

  #metric: MetricKey = METRICS[0].key;

  static observedAttributes = ['exercise-id'];

  attributeChangedCallback(_name: string, oldValue: string | null, value: string | null): void {
    this.#exerciseId = value;
    if (this.isConnected && oldValue !== null && oldValue !== value) {
      void this.#load();
    }
  }

  /**
   * The id this view is showing.
   *
   * its route sets the attribute before the element is connected, so
   * attributeChangedCallback has always run by the time anything asks for it.
   * Reading it through here states that invariant once, in the one place that
   * would notice it being broken, instead of at every call site.
   *
   * The attribute mirrors a route parameter `exercises.routes.ts` matches as `(\d+)`, so it is always
   * digits and the conversion cannot produce a NaN.
   */
  get #id(): ExerciseId {
    const id = this.#exerciseId;
    if (id === null) {
      throw new Error('gz-exercise-detail needs an exercise-id attribute');
    }
    return Number(id);
  }

  connectedCallback(): void {
    super.connectedCallback();
    void this.#load();
  }

  async #load(): Promise<void> {
    try {
      this.#state = { status: 'ready', ...(await exerciseFacade.progress(this.#id)) };
    } catch (error) {
      this.#state = { status: 'error', message: errorMessage(error) };
      if (!(error instanceof ApiError) || error.status !== 404) {
        toastError(error);
      }
    }
    this.render();
  }

  handleAction(action: string, element: HTMLElement): void {
    if (action === 'metric') {
      const chosen = METRICS.find((candidate) => candidate.key === element.dataset.metric);
      if (!chosen) {
        return;
      }
      this.#metric = chosen.key;
      this.render();
    }
  }

  afterRender(): void {
    const chart = this.$<GzChartComponent>('gz-chart');
    if (!chart || this.#state.status !== 'ready') {
      return;
    }

    const metric = METRICS.find((candidate) => candidate.key === this.#metric) ?? METRICS[0];
    chart.unit = metric.unit;
    chart.series = this.#state.sessions.map((session) => ({
      label: formatShortDate(session.performedOn),
      value: session[metric.key],
      hint: `${plural(session.setCount, 'set')}, ${plural(session.totalReps, 'rep')}`,
    }));
  }

  #summaryTiles(state: ReadyState): RawHtml {
    const { sessions, bestSet } = state;
    const latest = sessions.at(-1);
    const previous = sessions.at(-2);

    const totalVolume = sessions.reduce((sum, session) => sum + session.totalVolume, 0);
    const delta = latest && previous ? formatDelta(latest.estOneRepMax, previous.estOneRepMax) : '';

    return html`
      <div class="tiles">
        <gz-tile label="Sessions" value="${sessions.length}" hint="${latest ? `last ${relativeDay(latest.performedOn)}` : 'not trained yet'}"></gz-tile>
        <gz-tile
          label="Best set"
          value="${bestSet ? `${formatNumber(bestSet.weight)} ${UNIT} × ${bestSet.reps}` : '–'}"
          hint="${bestSet ? formatDate(bestSet.performedOn) : 'no sets logged'}"
        ></gz-tile>
        <gz-tile
          label="Estimated 1RM"
          value="${latest ? `${formatNumber(latest.estOneRepMax, 1)} ${UNIT}` : '–'}"
          hint="${delta ? `${delta} ${UNIT} vs. previous session` : 'needs two sessions'}"
        ></gz-tile>
        <gz-tile label="Total volume" value="${formatVolume(totalVolume)}" hint="across all sessions"></gz-tile>
      </div>
    `;
  }

  #sessionsTable(sessions: SessionPointDto[]): RawHtml {
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
                const change = earlier ? formatDelta(session.estOneRepMax, earlier.estOneRepMax) : '';
                const direction = change.startsWith('+') ? 'up' : change.startsWith('−') ? 'down' : '';
                return html`
                  <tr>
                    <td class="name nowrap">
                      <a href="#/workouts/${session.workoutId}">${formatDate(session.performedOn)}</a>
                    </td>
                    <td class="num">${session.setCount}</td>
                    <td class="num">${session.totalReps}</td>
                    <td class="num">${formatNumber(session.topWeight)} ${UNIT}</td>
                    <td class="num">${formatNumber(session.estOneRepMax, 1)} ${change ? html`<span class="${direction}"> ${change}</span>` : ''}</td>
                    <td class="num">${formatVolume(session.totalVolume)}</td>
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </div>
      </article>
    `;
  }

  template(): RawHtml {
    if (this.#state.status === 'loading') {
      return html`<p aria-busy="true">Loading progress…</p>`;
    }
    if (this.#state.status === 'error') {
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
            <p>${exercise.muscleGroup ?? 'No muscle group set'}${exercise.notes ? html` · ${exercise.notes}` : ''}</p>
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

await define('gz-exercise-detail', GzExerciseDetailComponent, import.meta.url);
