import { ApiError, errorMessage } from '../../http/errors.ts';
import type { RawHtml } from '../../ui/html.ts';
import { define, GzElement } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import { formatDate, formatDelta, formatNumber, formatShortDate, formatVolume, plural, relativeDay, UNIT } from '../../ui/format.ts';
import { navigate } from '../../app/router.ts';
import type { ExerciseDto, ExerciseProgressDto, SessionPointDto } from '../../../shared/dto/exercise.ts';
import type { ExerciseId } from '../../../shared/flavors.ts';
import { exerciseFacade } from './exercises.facade.ts';
import type { GzChartComponent } from './internal/gz-chart.component.ts';
import { toast, toastError } from '../../ui/gz-toast.component.ts';
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

  /**
   * What has been typed into the details form but not saved.
   *
   * The form is always on screen and switching the charted metric re-renders
   * the view, so the template — not the DOM — has to own these values. `null`
   * means "show what the server returned", which is also what a successful
   * save restores.
   */
  #edits: Record<string, string> | null = null;

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

  override connectedCallback(): void {
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

  override handleAction(action: string, element: HTMLElement): void | Promise<void> {
    if (action === 'metric') {
      const chosen = METRICS.find((candidate) => candidate.key === element.dataset.metric);
      if (!chosen) {
        return;
      }
      this.#metric = chosen.key;
      this.render();
      return;
    }

    if (action === 'delete-exercise') {
      return this.#deleteExercise();
    }
  }

  async #deleteExercise(): Promise<void> {
    if (this.#state.status !== 'ready' || !confirm(`Delete "${this.#state.exercise.name}"? Only possible while no set uses it.`)) {
      return;
    }
    try {
      await exerciseFacade.delete(this.#id);
      toast('Exercise deleted', 'success');
      navigate('/exercises');
    } catch (error) {
      // A set still referencing the exercise comes back as a 409 naming the
      // obstacle, so the useful outcome is to stay here and show it.
      toastError(error);
    }
  }

  override async handleSubmit(action: string, form: HTMLFormElement): Promise<void> {
    if (action !== 'save-exercise') {
      return;
    }
    const values = this.formData(form);
    try {
      await exerciseFacade.update(this.#id, {
        // `name` is `required`, so an empty one only arrives if the browser's
        // validation was bypassed; the API rejects it either way.
        name: values.name ?? '',
        muscleGroup: values.muscleGroup,
        notes: values.notes,
      });
      this.#edits = null;
      toast('Exercise updated', 'success');
      await this.#load();
    } catch (error) {
      toastError(error);
    }
  }

  override afterRender(): void {
    const details = this.$<HTMLFormElement>("form[data-action='save-exercise']");
    details?.addEventListener('input', () => {
      this.#edits = this.formData(details);
    });

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

  #headerTemplate(exercise: ExerciseDto): RawHtml {
    const edits = this.#edits ?? {
      name: exercise.name,
      muscleGroup: exercise.muscleGroup ?? '',
      notes: exercise.notes ?? '',
    };

    return html`
      <div>
        <p><a href="/exercises">← Exercises</a></p>
        <div class="row-between">
          <hgroup>
            <h1>${exercise.name}</h1>
            <p>${exercise.muscleGroup ?? 'No muscle group set'}</p>
          </hgroup>
          <button class="danger" data-action="delete-exercise">Delete</button>
        </div>
      </div>
      <article>
        <form class="stack-sm" data-action="save-exercise">
          <div class="fields">
            <div class="field grow">
              <label for="name">Name</label>
              <input id="name" name="name" type="text" maxlength="120" value="${edits.name}" required />
            </div>
            <div class="field">
              <label for="muscleGroup">Muscle group</label>
              <input id="muscleGroup" name="muscleGroup" type="text" maxlength="60" value="${edits.muscleGroup}" />
            </div>
          </div>
          <div class="field">
            <label for="notes">Notes</label>
            <textarea id="notes" name="notes" maxlength="2000" placeholder="Low bar, belt over 100 kg">${edits.notes}</textarea>
          </div>
          <div class="row">
            <button type="submit">Save</button>
          </div>
        </form>
      </article>
    `;
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
                      <a href="/workouts/${session.workoutId}">${formatDate(session.performedOn)}</a>
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

  override template(): RawHtml {
    if (this.#state.status === 'loading') {
      return html`<p aria-busy="true">Loading progress…</p>`;
    }
    if (this.#state.status === 'error') {
      return html`
        <div class="stack">
          <p class="error-text">${this.#state.message}</p>
          <p><a href="/exercises">Back to all exercises</a></p>
        </div>
      `;
    }

    const state = this.#state;
    const { exercise, sessions } = state;
    const metric = METRICS.find((candidate) => candidate.key === this.#metric) ?? METRICS[0];

    return html`
      <div class="stack">
        ${this.#headerTemplate(exercise)} ${this.#summaryTiles(state)}

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
