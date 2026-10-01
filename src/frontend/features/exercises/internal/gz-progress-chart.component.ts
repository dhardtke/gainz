import type { RawHtml } from '../../../ui/html.ts';
import { define, GzElement } from '../../../ui/base.ts';
import { html } from '../../../ui/html.ts';
import { formatShortDate, plural, UNIT } from '../../../ui/format.ts';
import type { SessionPointDto } from '../../../../shared/dto/exercise.ts';
import type { GzChartComponent } from './gz-chart.component.ts';
import './gz-chart.component.ts';

/** The `SessionPointDto` fields that can be plotted. */
type MetricKey = 'estOneRepMax' | 'topWeight' | 'totalVolume';

interface Metric {
  key: MetricKey;
  label: string;
  unit: string;
  hint: string;
}

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

/**
 * An exercise's sessions charted one metric at a time, with the switch between them.
 * A switch re-renders only this card and emits `metric-change` carrying the metric's key.
 */
export class GzProgressChartComponent extends GzElement {
  #metric: Metric = METRICS[0];

  #sessions: SessionPointDto[] = [];

  /** The charted metric's key; an unknown one falls back to the first metric. */
  set metric(value: string) {
    this.#metric = METRICS.find((candidate) => candidate.key === value) ?? METRICS[0];
  }

  /** Oldest first, as the API sends them. Set it last: it is the one that re-renders. */
  set sessions(value: SessionPointDto[]) {
    this.#sessions = value;
    if (this.isConnected) {
      this.render();
    }
  }

  override handleAction(action: string, element: HTMLElement): void {
    const chosen = METRICS.find((candidate) => candidate.key === element.dataset.metric);
    if (action !== 'metric' || !chosen) {
      return;
    }
    this.#metric = chosen;
    this.render();
    this.emit('metric-change', chosen.key);
  }

  override afterRender(): void {
    const chart = this.$<GzChartComponent>('gz-chart');
    if (!chart) {
      return;
    }
    const metric = this.#metric;
    chart.unit = metric.unit;
    chart.series = this.#sessions.map((session) => ({
      label: formatShortDate(session.performedOn),
      value: session[metric.key],
      hint: `${plural(session.setCount, 'set')}, ${plural(session.totalReps, 'rep')}`,
    }));
  }

  override template(): RawHtml {
    const current = this.#metric;

    return html`
      <article class="card vstack gap-2">
        <div class="hstack justify-between gap-2">
          <h2>${current.label}</h2>
          <div class="metric-switch">
            ${METRICS.map(
              (candidate) => html`
                <button
                  class="${candidate === current ? '' : 'outline'}"
                  data-action="metric"
                  data-metric="${candidate.key}"
                  aria-pressed="${candidate === current}"
                >
                  ${candidate.label}
                </button>
              `,
            )}
          </div>
        </div>
        <gz-chart></gz-chart>
        <p class="text-light">${current.hint}</p>
      </article>
    `;
  }
}

await define('gz-progress-chart', GzProgressChartComponent, import.meta.url);
