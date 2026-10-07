import type { RawHtml } from '../../../ui/html.ts';
import { define, GzElement } from '../../../ui/base.ts';
import { html } from '../../../ui/html.ts';
import { formatShortDate, plural, UNIT } from '../../../ui/format.ts';
import type { SessionPointDto } from '../../../../shared/dto/exercise.ts';
import type { GzChartComponent } from './gz-chart.component.ts';
import './gz-chart.component.ts';

type MetricKey = 'estOneRepMax' | 'topWeight' | 'totalVolume';

interface Metric {
  key: MetricKey;
  label: string;
  unit: string;
  hint: string;
}

// A non-empty tuple, so `METRICS[0]` is always defined.
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

export class GzProgressChartComponent extends GzElement {
  #metric: Metric = METRICS[0];

  #sessions: SessionPointDto[] = [];

  set metric(value: string) {
    this.#metric = METRICS.find((candidate) => candidate.key === value) ?? METRICS[0];
  }

  // Set it last: assigning it re-renders.
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
          <h2 data-testid="heading">${current.label}</h2>
          <div class="metric-switch">
            ${METRICS.map(
              (candidate) => html`
                <button
                  class="${candidate === current ? '' : 'outline'}"
                  data-action="metric"
                  data-metric="${candidate.key}"
                  data-testid="metric-${candidate.key}"
                  aria-pressed="${candidate === current}"
                >
                  ${candidate.label}
                </button>
              `,
            )}
          </div>
        </div>
        <gz-chart data-testid="chart"></gz-chart>
        <p class="text-light" data-testid="hint">${current.hint}</p>
      </article>
    `;
  }
}

await define('gz-progress-chart', GzProgressChartComponent, import.meta.url);
